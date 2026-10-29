// Podpowiedzi produktów do wyceny: katalog + historia cen sprzedaży
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, serverError } from '../../../../lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const query = (new URL(request.url).searchParams.get('q') || '').trim();
    if (query.length < 2) return NextResponse.json([]);

    const result = await db.query(
      `SELECT p.id, p.name, p.unit, p.sku, p.category,
              COALESCE(lp.price, CASE WHEN pm.cost_price > 0 THEN pm.cost_price * (1 + pm.margin_percent / 100) END, 0) AS last_price,
              lp.used_at AS last_used_at, lu.name AS last_used_by,
              COALESCE(st.cnt, 0) AS usage_count, COALESCE(st.avg_price, 0) AS avg_price,
              COALESCE(st.min_price, 0) AS min_price, COALESCE(st.max_price, 0) AS max_price
       FROM products p
       LEFT JOIN LATERAL (
         SELECT price, used_at, used_by FROM product_prices
         WHERE product_id = p.id AND COALESCE(price_type, 'sale') = 'sale' ORDER BY used_at DESC LIMIT 1
       ) lp ON true
       LEFT JOIN users lu ON lu.id = lp.used_by
       LEFT JOIN (
         SELECT product_id, COUNT(*) AS cnt, AVG(price) AS avg_price, MIN(price) AS min_price, MAX(price) AS max_price
         FROM product_prices WHERE COALESCE(price_type, 'sale') = 'sale' GROUP BY product_id
       ) st ON st.product_id = p.id
       LEFT JOIN product_margins pm ON pm.product_id = p.id AND pm.user_id = $3
       WHERE p.name ILIKE $1 OR p.sku ILIKE $1
       ORDER BY (p.name ILIKE $2) DESC, st.cnt DESC NULLS LAST, p.name
       LIMIT 10`,
      [`%${query}%`, `${query}%`, user.id]
    );

    return NextResponse.json(
      result.rows.map((row: any) => ({
        ...row,
        last_price: Math.round((row.last_price || 0) * 100) / 100,
        last_used_at: row.last_used_at || new Date().toISOString(),
        last_used_by: row.last_used_by || 'Katalog',
      }))
    );
  } catch (error) {
    return serverError('Search error:', error, 'Błąd wyszukiwania produktów');
  }
}
