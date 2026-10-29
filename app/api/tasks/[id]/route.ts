import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, forbidden, notFound, badRequest, serverError } from '../../../../lib/api-auth';

export const dynamic = 'force-dynamic';

async function ownTask(id: number, userId: number, isManagement: boolean) {
  const r = await db.query('SELECT user_id FROM tasks WHERE id = $1', [id]);
  if (!r.rows[0]) return 'missing' as const;
  return r.rows[0].user_id === userId || isManagement ? ('ok' as const) : ('denied' as const);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const id = parseInt(params.id, 10);
    if (!Number.isInteger(id)) return badRequest('Nieprawidłowy ID zadania');

    const access = await ownTask(id, user.id, user.isManagement);
    if (access === 'missing') return notFound('Nie znaleziono zadania');
    if (access === 'denied') return forbidden();

    const data = await request.json();
    await db.query(
      `UPDATE tasks SET done = COALESCE($1, done), due_date = COALESCE($2, due_date), title = COALESCE($3, title) WHERE id = $4`,
      [typeof data.done === 'boolean' ? data.done : null, data.due_date || null, data.title ? String(data.title).slice(0, 500) : null, id]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError('Update task error:', error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const id = parseInt(params.id, 10);
    if (!Number.isInteger(id)) return badRequest('Nieprawidłowy ID zadania');

    const access = await ownTask(id, user.id, user.isManagement);
    if (access === 'missing') return notFound('Nie znaleziono zadania');
    if (access === 'denied') return forbidden();

    await db.query('DELETE FROM tasks WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError('Delete task error:', error);
  }
}
