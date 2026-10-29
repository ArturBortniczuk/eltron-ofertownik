// Feed aktywności: kto i co zrobił na ofertach (zarząd i Centrum widzą całość, handlowiec - swoje oferty)
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getApiUser, unauthorized, serverError, intParam } from '../../../lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const limit = intParam(searchParams.get('limit'), 50, 1, 200);
    const type = searchParams.get('type');
    const actor = parseInt(searchParams.get('user_id') || '', 10);

    const params: any[] = [];
    const where: string[] = [];
    if (!user.canViewAll) { params.push(user.id); where.push(`o.user_id = $${params.length}`); }
    if (type) { params.push(type); where.push(`a.type = $${params.length}`); }
    if (user.canViewAll && Number.isInteger(actor)) { params.push(actor); where.push(`a.user_id = $${params.length}`); }
    params.push(limit);

    const r = await db.query(
      `SELECT a.id, a.type, a.message, a.actor_name, a.user_id, a.created_at,
              o.id AS offer_id, o.client_name, o.total_gross, o.status
       FROM offer_activity a JOIN offers o ON o.id = a.offer_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY a.created_at DESC, a.id DESC LIMIT $${params.length}`,
      params
    );
    return NextResponse.json(r.rows);
  } catch (error) {
    return serverError('Activity error:', error, 'Błąd pobierania aktywności');
  }
}
