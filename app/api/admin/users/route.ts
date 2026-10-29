// Zespół: lista użytkowników z wynikami, edycja celów i ról (tylko zarząd)
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, forbidden, badRequest, serverError } from '../../../../lib/api-auth';

export const dynamic = 'force-dynamic';

const ROLES = ['handlowiec', 'zarząd', 'centrum elektryczne', 'budowy', 'inne'];

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    if (!user.isManagement) return forbidden('Ta sekcja jest dostępna tylko dla zarządu');

    const r = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.market_region, u.is_active, u.last_login,
              COALESCE(u.monthly_target, 0) AS monthly_target,
              COUNT(o.id) AS offers,
              COALESCE(SUM(o.total_net) FILTER (WHERE o.accepted_at >= date_trunc('month', NOW())), 0) AS month_value,
              COALESCE(SUM(o.total_net) FILTER (WHERE o.status = 'sent'), 0) AS pipeline
       FROM users u LEFT JOIN offers o ON o.user_id = u.id
       GROUP BY u.id ORDER BY u.id`
    );
    return NextResponse.json(r.rows);
  } catch (error) {
    return serverError('Admin users error:', error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    if (!user.isManagement) return forbidden('Ta sekcja jest dostępna tylko dla zarządu');

    const data = await request.json();
    const id = parseInt(data.id, 10);
    if (!Number.isInteger(id)) return badRequest('Nieprawidłowy ID użytkownika');
    if (data.role !== undefined && !ROLES.includes(data.role)) return badRequest('Nieprawidłowa rola');
    if (id === user.id && (data.role !== undefined && data.role !== user.role || data.is_active === false)) {
      return badRequest('Nie możesz odebrać sobie roli ani dezaktywować własnego konta');
    }
    const target = data.monthly_target === undefined ? null : parseFloat(data.monthly_target);
    if (target !== null && (!Number.isFinite(target) || target < 0)) return badRequest('Nieprawidłowy cel');

    await db.query(
      `UPDATE users SET
         role = COALESCE($1, role),
         market_region = CASE WHEN $2::boolean THEN $3 ELSE market_region END,
         monthly_target = COALESCE($4, monthly_target),
         is_active = COALESCE($5, is_active)
       WHERE id = $6`,
      [
        data.role ?? null,
        data.market_region !== undefined,
        data.market_region || null,
        target,
        typeof data.is_active === 'boolean' ? data.is_active : null,
        id,
      ]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError('Admin update user error:', error);
  }
}
