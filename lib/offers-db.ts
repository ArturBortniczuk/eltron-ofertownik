// lib/offers-db.ts - wspólne operacje bazodanowe dla ofert
import crypto from 'crypto';
import { db } from './db';
import type { ApiUser } from './auth';
import { CalcItem } from './offer-calc';

type Q = { query: (text: string, params?: any[]) => Promise<any> };

export const newToken = () => crypto.randomBytes(12).toString('hex');

export async function logActivity(
  q: Q,
  offerId: number,
  actor: { id: number | null; name: string },
  type: string,
  message: string
) {
  await q.query(
    `INSERT INTO offer_activity (offer_id, user_id, actor_name, type, message) VALUES ($1, $2, $3, $4, $5)`,
    [offerId, actor.id, actor.name, type, message]
  );
}

// Zapisuje pozycje oferty; tworzy brakujące produkty i uzupełnia historię cen
export async function insertOfferItems(q: Q, offerId: number, items: CalcItem[], user: ApiUser) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    let productId: number;
    const existing = await q.query('SELECT id FROM products WHERE name = $1 AND unit = $2 LIMIT 1', [item.product_name, item.unit]);
    if (existing.rows.length > 0) {
      productId = existing.rows[0].id;
      await q.query('UPDATE products SET last_used = CURRENT_TIMESTAMP WHERE id = $1', [productId]);
    } else {
      const created = await q.query(
        'INSERT INTO products (name, unit, created_by) VALUES ($1, $2, $3) RETURNING id',
        [item.product_name, item.unit, user.id]
      );
      productId = created.rows[0].id;
    }

    await q.query(
      `INSERT INTO product_prices (product_id, price, cost_price, sale_price, margin_percent, used_by, price_type)
       VALUES ($1, $2, $3, $4, $5, $6, 'sale')`,
      [productId, item.unit_price, item.cost_price, item.unit_price, item.margin_percent, user.id]
    );

    // Pierwsza oferta z kosztem zakłada domyślną marżę produktu (nie nadpisujemy istniejących ustawień)
    if (item.cost_price > 0) {
      const baseMargin =
        item.original_price > 0 ? ((item.original_price - item.cost_price) / item.cost_price) * 100 : item.margin_percent;
      await q.query(
        `INSERT INTO product_margins (product_id, user_id, cost_price, margin_percent, min_margin_percent, max_discount_percent)
         VALUES ($1, $2, $3, $4, 10, 15) ON CONFLICT (product_id, user_id) DO NOTHING`,
        [productId, user.id, item.cost_price, Math.round(Math.max(0, baseMargin) * 100) / 100]
      );
    }

    await q.query(
      `INSERT INTO offer_items (
         offer_id, product_id, product_name, quantity, unit, unit_price, vat_rate,
         net_amount, vat_amount, gross_amount, position_order, cost_price,
         margin_percent, discount_percent, original_price
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        offerId, productId, item.product_name, item.quantity, item.unit, item.unit_price, item.vat_rate,
        item.net_amount, item.vat_amount, item.gross_amount, i + 1, item.cost_price,
        item.margin_percent, item.discount_percent, item.original_price,
      ]
    );
  }
}

// Oferta widoczna dla właściciela lub osób z dostępem do wszystkich danych
export async function loadAccessibleOffer(offerId: number, user: ApiUser) {
  const result = await db.query('SELECT * FROM offers WHERE id = $1', [offerId]);
  const offer = result.rows[0];
  if (!offer) return { offer: null, canAccess: false };
  return { offer, canAccess: user.canViewAll || offer.user_id === user.id };
}

export const canEditOffer = (offer: any, user: ApiUser) => offer.user_id === user.id || user.isManagement;
