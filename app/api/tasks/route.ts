import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getApiUser, unauthorized, badRequest, serverError } from '../../../lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const all = new URL(request.url).searchParams.get('all') === '1' && user.canViewAll;

    const tasks = await db.query(
      `SELECT t.id, t.title, t.due_date, t.done, t.offer_id, t.client_id, t.user_id,
              c.name AS client_name, o.client_name AS offer_client, u.name AS user_name
       FROM tasks t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN offers o ON o.id = t.offer_id
       LEFT JOIN users u ON u.id = t.user_id
       ${all ? '' : 'WHERE t.user_id = $1'}
       ORDER BY t.done, t.due_date NULLS LAST, t.id DESC LIMIT 300`,
      all ? [] : [user.id]
    );

    // Podpowiedzi: wysłane oferty bez odpowiedzi od ponad 5 dni, które nie mają otwartego zadania
    const suggestions = await db.query(
      `SELECT o.id, o.client_name, o.total_gross, o.sent_at, o.view_count
       FROM offers o
       WHERE o.user_id = $1 AND o.status = 'sent' AND COALESCE(o.sent_at, o.created_at) < NOW() - INTERVAL '5 days'
         AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.offer_id = o.id AND t.done = false)
       ORDER BY o.sent_at LIMIT 8`,
      [user.id]
    );

    return NextResponse.json({ tasks: tasks.rows, suggestions: suggestions.rows });
  } catch (error) {
    return serverError('Get tasks error:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const { title, due_date, offer_id, client_id } = await request.json();
    const text = String(title || '').trim();
    if (!text) return badRequest('Tytuł zadania jest wymagany');

    const r = await db.query(
      `INSERT INTO tasks (user_id, offer_id, client_id, title, due_date) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [user.id, offer_id || null, client_id || null, text.slice(0, 500), due_date ? String(due_date).slice(0, 10) : null]
    );
    return NextResponse.json({ success: true, id: r.rows[0].id });
  } catch (error) {
    return serverError('Create task error:', error);
  }
}
