// Przekazanie wygranej oferty do Ekonoma jako zamówienia (w wersji demo – symulacja integracji).
// POST tworzy numer zamówienia i zapisuje fakt przekazania, GET zwraca plik XML, który normalnie trafiłby do Ekonoma.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';
import { getApiUser, unauthorized, forbidden, notFound, badRequest, serverError } from '../../../../../lib/api-auth';
import { loadAccessibleOffer, canEditOffer, logActivity } from '../../../../../lib/offers-db';
import { offerLabel } from '../../../../../lib/offer-rules';

export const dynamic = 'force-dynamic';

const esc = (v: any) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function loadItems(offerId: number) {
  const r = await db.query(
    `SELECT oi.*, p.ekonom_code FROM offer_items oi LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.offer_id = $1 ORDER BY oi.position_order`,
    [offerId]
  );
  return r.rows;
}

function buildXml(offer: any, items: any[]): string {
  // Przy wygranej częściowo zamówienie obejmuje tylko część wartości - pozycje skalujemy proporcjonalnie
  const ratio = offer.outcome === 'partial' && Number(offer.total_net) > 0 ? Number(offer.won_amount) / Number(offer.total_net) : 1;
  const lines = items
    .map((i, idx) => {
      const qty = Math.round(Number(i.quantity) * ratio * 1000) / 1000;
      const net = Math.round(qty * Number(i.unit_price) * 100) / 100;
      return `    <Pozycja lp="${idx + 1}" typ="${i.in_ekonom === false ? 'nieskatalogowa' : 'towar'}">
      <KodEkonom>${i.in_ekonom === false ? '' : esc(i.ekonom_code)}</KodEkonom>
      <Nazwa>${esc(i.product_name)}</Nazwa>
      <Ilosc jm="${esc(i.unit)}">${qty}</Ilosc>
      <CenaNetto>${Number(i.unit_price).toFixed(2)}</CenaNetto>
      <StawkaVAT>${Number(i.vat_rate)}</StawkaVAT>
      <WartoscNetto>${net.toFixed(2)}</WartoscNetto>
      <Uwagi>${esc([i.item_note, i.availability_note].filter(Boolean).join(' | '))}</Uwagi>
    </Pozycja>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Plik demonstracyjny: tak wyglądałoby zamówienie przekazane do Ekonoma -->
<ZamowienieOdbiorcy numer="${esc(offer.ekonom_order_no)}">
  <Naglowek>
    <NumerOferty>${esc(offerLabel(offer))}</NumerOferty>
    <Temat>${esc(offer.project_name)}</Temat>
    <Kontrahent nip="${esc(offer.client_nip)}">${esc(offer.client_name)}</Kontrahent>
    <OsobaKontaktowa>${esc(offer.contact_person)}</OsobaKontaktowa>
    <Handlowiec>${esc(offer.salesperson)}</Handlowiec>
    <TerminDostawyDni>${Number(offer.delivery_days)}</TerminDostawyDni>
    <Zakres>${offer.outcome === 'partial' ? 'czesciowe' : 'calosc'}</Zakres>
  </Naglowek>
  <Pozycje>
${lines}
  </Pozycje>
</ZamowienieOdbiorcy>
`;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const offerId = parseInt(params.id, 10);
    if (!Number.isInteger(offerId)) return badRequest('Nieprawidłowy ID oferty');
    const { offer, canAccess } = await loadAccessibleOffer(offerId, user);
    if (!offer) return notFound();
    if (!canAccess) return forbidden();
    if (!offer.ekonom_order_no) return badRequest('Oferta nie została jeszcze przekazana do Ekonoma');

    const extra = await db.query(
      `SELECT (SELECT nip FROM clients WHERE id = $1) AS client_nip, (SELECT name FROM users WHERE id = $2) AS salesperson`,
      [offer.client_id, offer.user_id]
    );
    const xml = buildXml({ ...offer, ...extra.rows[0] }, await loadItems(offerId));
    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${offer.ekonom_order_no.replace(/\//g, '-')}.xml"`,
      },
    });
  } catch (error) {
    return serverError('Ekonom export error:', error);
  }
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const offerId = parseInt(params.id, 10);
    if (!Number.isInteger(offerId)) return badRequest('Nieprawidłowy ID oferty');
    const { offer } = await loadAccessibleOffer(offerId, user);
    if (!offer) return notFound();
    if (!canEditOffer(offer, user)) return forbidden('Zamówienie w Ekonomie utworzy autor oferty lub zarząd');
    if (offer.status !== 'accepted') return badRequest('Do Ekonoma można przekazać tylko wygraną ofertę');
    if (offer.ekonom_order_no) return NextResponse.json({ success: true, orderNo: offer.ekonom_order_no, already: true });

    const year = new Date().getFullYear();
    const n = await db.query(
      `SELECT COUNT(*)::int + 1 AS n FROM offers WHERE ekonom_order_no LIKE $1`, [`ZO/${year}/%`]
    );
    const orderNo = `ZO/${year}/${String(n.rows[0].n).padStart(4, '0')}`;
    await db.query(
      `UPDATE offers SET ekonom_order_no = $2, ekonom_exported_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [offerId, orderNo]
    );
    const items = await loadItems(offerId);
    const off = items.filter((i) => i.in_ekonom === false).length;
    await logActivity(db, offerId, user, 'ekonom',
      `Przekazano do Ekonoma jako zamówienie ${orderNo} (${items.length} poz.${off ? `, w tym ${off} spoza kartoteki – utworzone jako nieskatalogowe` : ''}) – symulacja`);
    return NextResponse.json({ success: true, orderNo });
  } catch (error) {
    return serverError('Ekonom order error:', error, 'Nie udało się utworzyć zamówienia w Ekonomie');
  }
}
