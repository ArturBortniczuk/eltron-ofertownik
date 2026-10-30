// lib/offers-db.ts - wspólne operacje bazodanowe dla ofert
import crypto from 'crypto';
import { db } from './db';
import type { ApiUser } from './auth';
import { CalcItem } from './offer-calc';
import { OVERDUE_GRACE_DAYS } from './offer-rules';

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
        'INSERT INTO products (name, unit, created_by, in_ekonom, manufacturer) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [item.product_name, item.unit, user.id, item.in_ekonom, item.manufacturer || null]
      );
      productId = created.rows[0].id;
      if (item.in_ekonom) {
        await q.query(`UPDATE products SET ekonom_code = 'EK-' || lpad(id::text, 5, '0') WHERE id = $1`, [productId]);
      }
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
         margin_percent, discount_percent, original_price,
         availability, availability_note, item_note, min_price, in_ekonom, manufacturer
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        offerId, productId, item.product_name, item.quantity, item.unit, item.unit_price, item.vat_rate,
        item.net_amount, item.vat_amount, item.gross_amount, i + 1, item.cost_price,
        item.margin_percent, item.discount_percent, item.original_price,
        item.availability, item.availability_note || null, item.item_note || null, item.min_price || null,
        item.in_ekonom, item.manufacturer || null,
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

// Kolejny unikalny numer oferty w roku: OF/2026/0001 (kolejne warianty negocjacyjne mają ten sam numer + .1, .2)
export async function nextOfferNumber(q: Q): Promise<string> {
  const year = new Date().getFullYear();
  await q.query('SELECT pg_advisory_xact_lock(7001)');
  const r = await q.query(
    `SELECT COALESCE(MAX(split_part(offer_number, '/', 3)::int), 0) AS n
     FROM offers WHERE offer_number LIKE $1 AND split_part(offer_number, '/', 3) ~ '^[0-9]+$'`,
    [`OF/${year}/%`]
  );
  return `OF/${year}/${String((r.rows[0].n || 0) + 1).padStart(4, '0')}`;
}

// Oferty wysłane, które „wiszą”: termin ważności minął (z tolerancją), a wynik nie został oznaczony
export async function overdueOffers(q: Q, userId: number) {
  const r = await q.query(
    `SELECT id, offer_number, revision, client_name, project_name, total_gross,
            (COALESCE(sent_at, created_at) + (valid_days + $2) * INTERVAL '1 day')::date AS overdue_since
     FROM offers
     WHERE user_id = $1 AND status = 'sent' AND is_current IS NOT FALSE
       AND COALESCE(sent_at, created_at) + (valid_days + $2) * INTERVAL '1 day' < NOW()
     ORDER BY overdue_since`,
    [userId, OVERDUE_GRACE_DAYS]
  );
  return r.rows;
}

export function cleanRemarks(raw: any): Array<{ target: string; text: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({ target: String(r?.target || 'Klient').trim().slice(0, 40), text: String(r?.text || '').trim().slice(0, 1000) }))
    .filter((r) => r.text)
    .slice(0, 12);
}
