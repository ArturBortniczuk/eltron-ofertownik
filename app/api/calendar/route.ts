// Kalendarz: zadania, terminy kontaktu z klientem i wygasanie ofert w wybranym miesiącu
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getApiUser, unauthorized, serverError } from '../../../lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const m = /^(\d{4})-(\d{2})$/.exec(searchParams.get('month') || '');
    const year = m ? parseInt(m[1], 10) : now.getFullYear();
    const month = m ? parseInt(m[2], 10) : now.getMonth() + 1;
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const all = searchParams.get('all') === '1' && user.canViewAll;

    const scope = all ? '' : 'AND user_id = $2';
    const oScope = all ? '' : 'AND o.user_id = $2';
    const params: any[] = all ? [start] : [start, user.id];
    const range = `>= $1::date AND {col} < ($1::date + INTERVAL '1 month')`;

    const [tasks, followUps, expiring] = await Promise.all([
      db.query(
        `SELECT id, title, due_date::text AS date, done, offer_id, client_id FROM tasks
         WHERE due_date ${range.replace('{col}', 'due_date')} ${scope} ORDER BY due_date`, params),
      db.query(
        `SELECT o.id, o.client_name, o.follow_up_date::text AS date, o.total_gross FROM offers o
         WHERE o.status = 'sent' AND o.follow_up_date ${range.replace('{col}', 'o.follow_up_date')} ${oScope}`, params),
      db.query(
        `SELECT o.id, o.client_name, o.total_gross,
                (o.created_at + (o.valid_days || ' days')::interval)::date::text AS date
         FROM offers o
         WHERE o.status = 'sent'
           AND (o.created_at + (o.valid_days || ' days')::interval)::date ${range.replace('{col}', "(o.created_at + (o.valid_days || ' days')::interval)::date")} ${oScope}`, params),
    ]);

    const events = [
      ...tasks.rows.map((t: any) => ({
        type: 'task', id: `t${t.id}`, taskId: t.id, title: t.title, date: t.date, done: t.done,
        href: t.offer_id ? `/dashboard/offers/${t.offer_id}` : t.client_id ? `/dashboard/clients/${t.client_id}` : '/dashboard/tasks',
      })),
      ...followUps.rows.map((o: any) => ({
        type: 'followup', id: `f${o.id}`, title: `Kontakt: ${o.client_name}`, date: o.date, value: o.total_gross, href: `/dashboard/offers/${o.id}`,
      })),
      ...expiring.rows.map((o: any) => ({
        type: 'expiry', id: `e${o.id}`, title: `Wygasa oferta #${o.id}: ${o.client_name}`, date: o.date, value: o.total_gross, href: `/dashboard/offers/${o.id}`,
      })),
    ];

    return NextResponse.json({ year, month, events });
  } catch (error) {
    return serverError('Calendar error:', error, 'Błąd pobierania kalendarza');
  }
}
