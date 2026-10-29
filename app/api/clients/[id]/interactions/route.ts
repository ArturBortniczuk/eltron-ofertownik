import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';
import { getApiUser, unauthorized, forbidden, notFound, badRequest, serverError } from '../../../../../lib/api-auth';

export const dynamic = 'force-dynamic';

const TYPES = ['call', 'meeting', 'email', 'note'];

async function clientAccess(clientId: number, user: { id: number; canViewAll: boolean }) {
  const r = await db.query('SELECT created_by FROM clients WHERE id = $1', [clientId]);
  if (!r.rows[0]) return 'missing' as const;
  return user.canViewAll || r.rows[0].created_by === user.id ? ('ok' as const) : ('denied' as const);
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const clientId = parseInt(params.id, 10);
    if (!Number.isInteger(clientId)) return badRequest('Nieprawidłowy ID klienta');

    const access = await clientAccess(clientId, user);
    if (access === 'missing') return notFound('Klient nie został znaleziony');
    if (access === 'denied') return forbidden();

    const r = await db.query(
      `SELECT i.id, i.type, i.content, i.created_at, u.name AS user_name
       FROM client_interactions i LEFT JOIN users u ON u.id = i.user_id
       WHERE i.client_id = $1 ORDER BY i.created_at DESC, i.id DESC LIMIT 100`,
      [clientId]
    );
    return NextResponse.json(r.rows);
  } catch (error) {
    return serverError('Get interactions error:', error);
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const clientId = parseInt(params.id, 10);
    if (!Number.isInteger(clientId)) return badRequest('Nieprawidłowy ID klienta');

    const access = await clientAccess(clientId, user);
    if (access === 'missing') return notFound('Klient nie został znaleziony');
    if (access === 'denied') return forbidden();

    const { type, content, follow_up_date } = await request.json();
    if (!TYPES.includes(type)) return badRequest('Nieprawidłowy typ kontaktu');
    const text = String(content || '').trim();
    if (!text) return badRequest('Opis kontaktu nie może być pusty');

    await db.query('INSERT INTO client_interactions (client_id, user_id, type, content) VALUES ($1, $2, $3, $4)', [
      clientId, user.id, type, text.slice(0, 2000),
    ]);
    await db.query('UPDATE clients SET last_used = CURRENT_TIMESTAMP WHERE id = $1', [clientId]);

    if (follow_up_date) {
      await db.query(
        'INSERT INTO tasks (user_id, client_id, title, due_date) VALUES ($1, $2, $3, $4)',
        [user.id, clientId, `Kontakt z klientem: ${text.slice(0, 80)}`, String(follow_up_date).slice(0, 10)]
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError('Create interaction error:', error);
  }
}
