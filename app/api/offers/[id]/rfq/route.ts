// Zapytania ofertowe do producentów: zestawienie pozycji z oferty -> prośba o wycenę -> (symulowana) odpowiedź -> koszty w ofercie
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';
import { getApiUser, unauthorized, forbidden, notFound, badRequest, serverError } from '../../../../../lib/api-auth';
import { loadAccessibleOffer, canEditOffer, logActivity } from '../../../../../lib/offers-db';
import { offerLabel } from '../../../../../lib/offer-rules';
import { round2 } from '../../../../../lib/offer-calc';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const offerId = parseInt(params.id, 10);
    if (!Number.isInteger(offerId)) return badRequest('Nieprawidłowy ID oferty');
    const { offer } = await loadAccessibleOffer(offerId, user);
    if (!offer) return notFound();
    if (!canEditOffer(offer, user)) return forbidden('Zapytanie do producenta może wysłać autor oferty lub zarząd');
    const body = await request.json().catch(() => ({}));

    // --- nowe zapytanie ---
    if (body.action === 'create') {
      const manufacturer = String(body.manufacturer || '').trim();
      if (!manufacturer) return badRequest('Wybierz producenta');
      const items = await db.query(
        `SELECT id, product_name, quantity, unit, item_note FROM offer_items
         WHERE offer_id = $1 AND COALESCE(manufacturer, 'Bez producenta') = $2 ORDER BY position_order`,
        [offerId, manufacturer]
      );
      if (items.rows.length === 0) return badRequest('Brak pozycji tego producenta w ofercie');

      const remarks: Array<{ target: string; text: string }> = Array.isArray(offer.remarks) ? offer.remarks : [];
      const forSupplier = remarks.filter((r) => r.target === 'Producent').map((r) => `• ${r.text}`);
      const message =
        String(body.message || '').trim() ||
        `Dzień dobry,\n\nprosimy o wycenę poniższych pozycji do tematu „${offer.project_name || offer.client_name}” (oferta ${offerLabel(offer)}). ` +
        `Termin dostawy oczekiwany: ${offer.delivery_days} dni.` +
        (forSupplier.length ? `\n\nUwagi:\n${forSupplier.join('\n')}` : '');

      const created = await db.query(
        `INSERT INTO supplier_requests (offer_id, manufacturer, message, items, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [offerId, manufacturer, message, JSON.stringify(items.rows), user.id]
      );
      await logActivity(db, offerId, user, 'rfq', `Wysłano zapytanie o wycenę do producenta ${manufacturer} (${items.rows.length} poz.) – symulacja`);
      return NextResponse.json({ success: true, rfqId: created.rows[0].id });
    }

    const rfqId = parseInt(body.rfq_id, 10);
    const rfq = (await db.query('SELECT * FROM supplier_requests WHERE id = $1 AND offer_id = $2', [rfqId, offerId])).rows[0];
    if (!rfq) return notFound('Nie znaleziono zapytania');

    // --- symulacja odpowiedzi producenta (w produkcji: odpowiedź mailowa / portal dostawcy) ---
    if (body.action === 'simulate_response') {
      if (rfq.status !== 'sent') return badRequest('Producent już odpowiedział');
      const lines = await db.query(
        `SELECT oi.id, oi.product_name, oi.quantity, oi.unit, oi.cost_price FROM offer_items oi
         WHERE oi.id = ANY($1::int[])`,
        [rfq.items.map((i: any) => i.id)]
      );
      const response = lines.rows.map((l: any) => {
        // deterministyczna „wycena producenta”: -6% .. +3% względem dotychczasowego kosztu
        const factor = 0.94 + ((l.id * 37) % 10) / 100;
        const base = Number(l.cost_price) || 0;
        return {
          item_id: l.id,
          product_name: l.product_name,
          quantity: Number(l.quantity),
          unit: l.unit,
          old_cost: base,
          quoted_cost: base > 0 ? round2(base * factor) : null,
          lead_days: [3, 7, 10, 14, 21][l.id % 5],
        };
      });
      await db.query(`UPDATE supplier_requests SET status = 'answered', response = $2, responded_at = CURRENT_TIMESTAMP WHERE id = $1`, [rfqId, JSON.stringify(response)]);
      await logActivity(db, offerId, { id: null, name: rfq.manufacturer }, 'rfq', `Producent ${rfq.manufacturer} odesłał wycenę (symulacja)`);
      return NextResponse.json({ success: true });
    }

    // --- zastosuj ceny zakupu od producenta w ofercie (zmienia koszt i marżę pozycji, nie cenę sprzedaży) ---
    if (body.action === 'apply') {
      if (rfq.status !== 'answered' || !Array.isArray(rfq.response)) return badRequest('Brak odpowiedzi producenta do zastosowania');
      for (const l of rfq.response) {
        if (!l.quoted_cost) continue;
        await db.query(
          `UPDATE offer_items SET cost_price = $2::numeric,
             margin_percent = CASE WHEN $2::numeric > 0 THEN ROUND(((unit_price - $2::numeric) / $2::numeric * 100)::numeric, 2) ELSE 0 END
           WHERE id = $1 AND offer_id = $3`,
          [l.item_id, l.quoted_cost, offerId]
        );
      }
      await db.query(`UPDATE supplier_requests SET status = 'applied', applied_at = CURRENT_TIMESTAMP WHERE id = $1`, [rfqId]);
      await logActivity(db, offerId, user, 'rfq', `Zastosowano ceny zakupu od producenta ${rfq.manufacturer} – przeliczono marże pozycji`);
      return NextResponse.json({ success: true });
    }

    return badRequest('Nieznana akcja');
  } catch (error) {
    return serverError('RFQ error:', error, 'Błąd zapytania do producenta');
  }
}
