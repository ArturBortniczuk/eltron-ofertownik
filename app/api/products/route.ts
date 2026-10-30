// Katalog produktów
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getApiUser, unauthorized, badRequest, serverError, intParam } from '../../../lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const category = searchParams.get('category');
    const page = intParam(searchParams.get('page'), 1, 1, 10000);
    const limit = intParam(searchParams.get('limit'), 30, 1, 200);

    const params: any[] = [user.id];
    const where: string[] = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      where.push(`p.category = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [list, count, categories] = await Promise.all([
      db.query(
        `SELECT p.id, p.name, p.unit, p.sku, p.category, p.last_used,
                p.manufacturer, p.ekonom_code, p.in_ekonom, p.min_price, p.stock_qty, p.supplier_bonus_percent,
                pm.cost_price, pm.margin_percent, pm.min_margin_percent, pm.max_discount_percent,
                CASE WHEN pm.cost_price > 0 THEN ROUND(pm.cost_price * (1 + pm.margin_percent / 100), 2) END AS base_price,
                COALESCE(st.cnt, 0) AS usage_count, st.last_sale
         FROM products p
         LEFT JOIN product_margins pm ON pm.product_id = p.id AND pm.user_id = $1
         LEFT JOIN (
           SELECT product_id, COUNT(*) AS cnt,
                  (ARRAY_AGG(price ORDER BY used_at DESC))[1] AS last_sale
           FROM product_prices WHERE COALESCE(price_type, 'sale') = 'sale' GROUP BY product_id
         ) st ON st.product_id = p.id
         ${whereSql}
         ORDER BY p.category NULLS LAST, p.name
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, (page - 1) * limit]
      ),
      // Zapytanie liczące nie ma parametru $1 (user.id), więc przesuwamy numerację placeholderów
      db.query(
        `SELECT COUNT(*) AS n FROM products p ${whereSql.replace(/\$(\d+)/g, (_m, n) => '$' + (parseInt(n, 10) - 1))}`,
        params.slice(1)
      ),
      db.query(`SELECT category, COUNT(*) AS n FROM products WHERE category IS NOT NULL GROUP BY category ORDER BY category`),
    ]);

    // Koszty i marże widzą tylko osoby z dostępem do całości; handlowiec widzi cenę katalogową
    const products = list.rows.map((row: any) =>
      user.canViewAll
        ? row
        : {
            id: row.id, name: row.name, unit: row.unit, sku: row.sku, category: row.category, last_used: row.last_used,
            manufacturer: row.manufacturer, ekonom_code: row.ekonom_code, in_ekonom: row.in_ekonom, stock_qty: row.stock_qty, min_price: row.min_price,
            base_price: row.base_price, usage_count: row.usage_count, last_sale: row.last_sale,
          }
    );

    return NextResponse.json({
      products,
      categories: categories.rows,
      total: count.rows[0].n,
      page,
      totalPages: Math.ceil(count.rows[0].n / limit),
      canSeeCosts: user.canViewAll,
    });
  } catch (error) {
    return serverError('Get products error:', error, 'Błąd pobierania produktów');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const data = await request.json();
    const name = String(data.name || '').trim();
    if (!name) return badRequest('Nazwa produktu jest wymagana');
    const unit = String(data.unit || 'szt').trim() || 'szt';

    const exists = await db.query('SELECT id FROM products WHERE name = $1 AND unit = $2', [name, unit]);
    if (exists.rows.length > 0) return badRequest('Produkt o takiej nazwie i jednostce już istnieje');

    const created = await db.query(
      'INSERT INTO products (name, unit, sku, category, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, unit, data.sku ? String(data.sku).trim() : null, data.category ? String(data.category).trim() : null, user.id]
    );
    const productId = created.rows[0].id;

    const cost = parseFloat(data.cost_price);
    const margin = parseFloat(data.margin_percent);
    if (user.canViewAll && cost > 0) {
      await db.query(
        `INSERT INTO product_margins (product_id, user_id, cost_price, margin_percent)
         SELECT $1, u.id, $2, $3 FROM users u WHERE u.is_active IS NOT FALSE
         ON CONFLICT (product_id, user_id) DO UPDATE SET cost_price = EXCLUDED.cost_price, margin_percent = EXCLUDED.margin_percent`,
        [productId, cost, Number.isFinite(margin) ? margin : 25]
      );
    }

    return NextResponse.json({ success: true, id: productId });
  } catch (error) {
    return serverError('Create product error:', error, 'Błąd dodawania produktu');
  }
}
