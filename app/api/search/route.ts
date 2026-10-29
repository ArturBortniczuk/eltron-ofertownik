import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getApiUser, unauthorized, serverError } from '../../../lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const q = (new URL(request.url).searchParams.get('q') || '').trim();
    if (q.length < 2) return NextResponse.json({ offers: [], clients: [], products: [] });

    const like = `%${q}%`;
    const asId = /^#?\d+$/.test(q) ? parseInt(q.replace('#', ''), 10) : -1;

    const [offers, clients, products] = await Promise.all([
      db.query(
        `SELECT id, client_name, status, total_gross FROM offers
         WHERE (client_name ILIKE $1 OR id = $2 OR notes ILIKE $1)
           ${user.canViewAll ? '' : 'AND user_id = $3'}
         ORDER BY created_at DESC LIMIT 6`,
        user.canViewAll ? [like, asId] : [like, asId, user.id]
      ),
      db.query(
        `SELECT id, name, contact_person, email FROM clients
         WHERE (name ILIKE $1 OR email ILIKE $1 OR contact_person ILIKE $1 OR nip ILIKE $1)
           ${user.canViewAll ? '' : 'AND created_by = $2'}
         ORDER BY last_used DESC LIMIT 6`,
        user.canViewAll ? [like] : [like, user.id]
      ),
      db.query(
        `SELECT id, name, unit, sku, category FROM products
         WHERE name ILIKE $1 OR sku ILIKE $1 ORDER BY last_used DESC LIMIT 6`,
        [like]
      ),
    ]);

    return NextResponse.json({ offers: offers.rows, clients: clients.rows, products: products.rows });
  } catch (error) {
    return serverError('Search error:', error, 'Błąd wyszukiwania');
  }
}
