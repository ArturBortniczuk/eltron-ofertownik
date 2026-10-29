// Publiczny widok oferty dla klienta - dostęp wyłącznie po losowym tokenie z linku
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

const TOKEN_RE = /^[a-f0-9]{16,64}$/;

async function loadByToken(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const r = await db.query(
    `SELECT o.id, o.user_id, o.client_name, o.delivery_days, o.valid_days, o.additional_costs, o.additional_costs_description,
            o.notes, o.total_net, o.total_vat, o.total_gross, o.status, o.created_at, o.sent_at,
            u.name AS salesperson_name, u.email AS salesperson_email
     FROM offers o LEFT JOIN users u ON u.id = o.user_id
     WHERE o.public_token = $1`,
    [token]
  );
  return r.rows[0] || null;
}

export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const offer = await loadByToken(params.token);
    if (!offer || offer.status === 'draft') {
      return NextResponse.json({ error: 'Oferta jest niedostępna' }, { status: 404 });
    }

    const items = await db.query(
      `SELECT product_name, quantity, unit, unit_price, vat_rate, net_amount, gross_amount
       FROM offer_items WHERE offer_id = $1 ORDER BY position_order`,
      [offer.id]
    );

    // Odnotuj wyświetlenie przez klienta
    await db.query(
      `UPDATE offers SET view_count = COALESCE(view_count, 0) + 1, viewed_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [offer.id]
    );
    await db.query(
      `INSERT INTO offer_activity (offer_id, user_id, actor_name, type, message) VALUES ($1, NULL, 'Klient', 'viewed', 'Klient otworzył ofertę')`,
      [offer.id]
    );

    const { user_id: _omit, ...publicOffer } = offer;
    return NextResponse.json({ offer: publicOffer, items: items.rows });
  } catch (error) {
    console.error('Public offer error:', error);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}

// Klient akceptuje lub odrzuca ofertę
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const offer = await loadByToken(params.token);
    if (!offer || offer.status === 'draft') {
      return NextResponse.json({ error: 'Oferta jest niedostępna' }, { status: 404 });
    }
    if (offer.status !== 'sent') {
      return NextResponse.json({ error: 'Na tę ofertę klient już odpowiedział' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const decision = body.decision;
    if (decision !== 'accept' && decision !== 'reject') {
      return NextResponse.json({ error: 'Nieprawidłowa decyzja' }, { status: 400 });
    }
    const who = String(body.name || '').trim().slice(0, 120);
    const reason = String(body.reason || '').trim().slice(0, 500);

    if (decision === 'accept') {
      await db.query(
        `UPDATE offers SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP, follow_up_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [offer.id]
      );
    } else {
      await db.query(
        `UPDATE offers SET status = 'rejected', lost_reason = $2, follow_up_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [offer.id, reason || 'Odrzucona przez klienta online']
      );
    }
    await db.query(`UPDATE tasks SET done = true WHERE offer_id = $1 AND done = false AND title LIKE 'Zadzwonić%'`, [offer.id]);
    await db.query(
      `INSERT INTO offer_activity (offer_id, user_id, actor_name, type, message) VALUES ($1, NULL, 'Klient', 'client_response', $2)`,
      [
        offer.id,
        decision === 'accept'
          ? `Klient zaakceptował ofertę online${who ? ` (${who})` : ''}`
          : `Klient odrzucił ofertę online${who ? ` (${who})` : ''}${reason ? `: ${reason}` : ''}`,
      ]
    );

    return NextResponse.json({ success: true, status: decision === 'accept' ? 'accepted' : 'rejected' });
  } catch (error) {
    console.error('Public offer response error:', error);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
}
