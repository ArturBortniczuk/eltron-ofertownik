import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getApiUser, unauthorized, forbidden, badRequest, serverError } from '../../../lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const r = await db.query(
      `SELECT t.id, t.name, t.description, t.payload, t.created_at, u.name AS author
       FROM offer_templates t LEFT JOIN users u ON u.id = t.created_by ORDER BY t.name`
    );
    return NextResponse.json(r.rows);
  } catch (error) {
    return serverError('Get templates error:', error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const id = parseInt(new URL(request.url).searchParams.get('id') || '', 10);
    if (!Number.isInteger(id)) return badRequest('Nieprawidłowy ID szablonu');

    const owner = await db.query('SELECT created_by FROM offer_templates WHERE id = $1', [id]);
    if (owner.rows[0] && owner.rows[0].created_by !== user.id && !user.isManagement) return forbidden();

    await db.query('DELETE FROM offer_templates WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError('Delete template error:', error);
  }
}
