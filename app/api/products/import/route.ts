// Import produktów i cen z CSV (dane już sparsowane po stronie przeglądarki)
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, forbidden, badRequest, serverError } from '../../../../lib/api-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    if (!user.canViewAll) return forbidden('Cennik importuje zarząd lub Centrum Elektryczne');

    const { rows } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) return badRequest('Brak wierszy do importu');
    if (rows.length > 2000) return badRequest('Maksymalnie 2000 wierszy w jednym imporcie');

    const client = await db.connect();
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    try {
      await client.query('BEGIN');
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = String(row.name || '').trim();
        if (!name) { errors.push(`Wiersz ${i + 2}: brak nazwy`); continue; }
        const unit = String(row.unit || 'szt').trim() || 'szt';
        const sku = row.sku ? String(row.sku).trim() : null;
        const category = row.category ? String(row.category).trim() : null;
        const cost = Number(row.cost_price);
        const margin = Number(row.margin_percent);

        let productId: number | null = null;
        if (sku) {
          const bySku = await client.query('SELECT id FROM products WHERE sku = $1 LIMIT 1', [sku]);
          if (bySku.rows[0]) productId = bySku.rows[0].id;
        }
        if (!productId) {
          const byName = await client.query('SELECT id FROM products WHERE name = $1 AND unit = $2 LIMIT 1', [name, unit]);
          if (byName.rows[0]) productId = byName.rows[0].id;
        }

        if (productId) {
          await client.query(
            'UPDATE products SET name = $2, unit = $3, sku = COALESCE($4, sku), category = COALESCE($5, category) WHERE id = $1',
            [productId, name, unit, sku, category]
          );
          updated++;
        } else {
          const ins = await client.query(
            'INSERT INTO products (name, unit, sku, category, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, unit, sku, category, user.id]
          );
          productId = ins.rows[0].id as number;
          created++;
        }

        if (Number.isFinite(cost) && cost > 0) {
          await client.query(
            `INSERT INTO product_margins (product_id, user_id, cost_price, margin_percent)
             SELECT $1, u.id, $2, $3 FROM users u WHERE u.is_active IS NOT FALSE
             ON CONFLICT (product_id, user_id) DO UPDATE SET
               cost_price = EXCLUDED.cost_price,
               margin_percent = CASE WHEN $4 THEN EXCLUDED.margin_percent ELSE product_margins.margin_percent END,
               updated_at = CURRENT_TIMESTAMP`,
            [productId, cost, Number.isFinite(margin) ? margin : 25, Number.isFinite(margin)]
          );
          await client.query(
            `INSERT INTO product_prices (product_id, price, cost_price, price_type, used_by) VALUES ($1, $2, $2, 'cost', $3)`,
            [productId, cost, user.id]
          );
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true, created, updated, errors: errors.slice(0, 20) });
  } catch (error) {
    return serverError('Import products error:', error, 'Błąd importu produktów');
  }
}
