// Akcje zbiorcze na ofertach: zmiana statusu, przedłużenie ważności, usunięcie
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, badRequest, serverError, OFFER_STATUSES } from '../../../../lib/api-auth';
import { logActivity } from '../../../../lib/offers-db';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = { draft: 'Szkic', sent: 'Wysłana', accepted: 'Wygrana', rejected: 'Przegrana' };

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const body = await request.json();
    const ids: number[] = Array.isArray(body.ids) ? body.ids.map((x: any) => parseInt(x, 10)).filter(Number.isInteger) : [];
    if (ids.length === 0) return badRequest('Zaznacz co najmniej jedną ofertę');
    if (ids.length > 200) return badRequest('Maksymalnie 200 ofert naraz');

    const action: string = body.action;
    if (!['status', 'extend', 'delete'].includes(action)) return badRequest('Nieznana akcja');
    if (action === 'status' && !(OFFER_STATUSES as readonly string[]).includes(body.status)) return badRequest('Nieprawidłowy status');
    const days = Math.min(365, Math.max(1, parseInt(body.days, 10) || 14));

    const found = await db.query('SELECT id, user_id, status, approval_status FROM offers WHERE id = ANY($1::int[])', [ids]);
    let updated = 0;
    const skipped: Array<{ id: number; reason: string }> = [];

    for (const offer of found.rows) {
      if (offer.user_id !== user.id && !user.isManagement) {
        skipped.push({ id: offer.id, reason: 'cudza oferta' });
        continue;
      }

      if (action === 'delete') {
        await db.query('DELETE FROM offers WHERE id = $1', [offer.id]);
        updated++;
      } else if (action === 'extend') {
        await db.query('UPDATE offers SET valid_days = valid_days + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [days, offer.id]);
        await logActivity(db, offer.id, user, 'edited', `Przedłużono ważność oferty o ${days} dni`);
        updated++;
      } else {
        const next: string = body.status;
        if (next === offer.status) { skipped.push({ id: offer.id, reason: 'już ma ten status' }); continue; }
        if (next === 'sent' && ['pending', 'rejected'].includes(offer.approval_status)) {
          skipped.push({ id: offer.id, reason: 'czeka na akceptację marży' });
          continue;
        }
        if ((next === 'accepted' || next === 'rejected') && offer.status === 'draft') {
          skipped.push({ id: offer.id, reason: 'szkic nie był wysłany' });
          continue;
        }
        await db.query(
          `UPDATE offers SET status = $1::text, updated_at = CURRENT_TIMESTAMP,
             sent_at = CASE WHEN $1::text IN ('sent','accepted','rejected') AND sent_at IS NULL THEN CURRENT_TIMESTAMP ELSE sent_at END,
             accepted_at = CASE WHEN $1::text = 'accepted' THEN CURRENT_TIMESTAMP ELSE NULL END,
             outcome = CASE WHEN $1::text = 'accepted' THEN 'won' WHEN $1::text = 'rejected' THEN 'lost' ELSE NULL END,
             won_amount = CASE WHEN $1::text = 'accepted' THEN total_net ELSE NULL END,
             closed_at = CASE WHEN $1::text IN ('accepted','rejected') THEN CURRENT_TIMESTAMP ELSE NULL END,
             follow_up_date = CASE WHEN $1::text = 'sent' AND follow_up_date IS NULL THEN CURRENT_DATE + 5
                                   WHEN $1::text IN ('accepted','rejected','draft') THEN NULL ELSE follow_up_date END
           WHERE id = $2`,
          [next, offer.id]
        );
        await logActivity(db, offer.id, user, 'status', `Status zmieniony na: ${STATUS_LABELS[next]} (akcja zbiorcza)`);
        updated++;
      }
    }

    const missing = ids.filter((id) => !found.rows.some((r: any) => r.id === id));
    missing.forEach((id) => skipped.push({ id, reason: 'nie istnieje' }));

    return NextResponse.json({ success: true, updated, skipped });
  } catch (error) {
    return serverError('Bulk offers error:', error, 'Błąd akcji zbiorczej');
  }
}
