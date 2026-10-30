// Podpowiedzi ceny dla produktu: ostatnia cena tego klienta, cena kolegi, inny rynek, średnia wygranych, cena minimalna.
// Pokazujemy wyłącznie ceny sprzedaży - bez kosztów i marż cudzych ofert.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, serverError } from '../../../../lib/api-auth';
import { offerLabel } from '../../../../lib/offer-rules';

export const dynamic = 'force-dynamic';

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { searchParams } = new URL(request.url);
    const name = (searchParams.get('name') || '').trim();
    const clientId = parseInt(searchParams.get('client_id') || '', 10) || null;
    if (name.length < 2) return NextResponse.json({ product: null, hints: [] });

    const pr = await db.query(
      `SELECT p.id, p.name, p.unit, p.category, p.manufacturer, p.min_price, p.stock_qty, p.production_note, p.in_ekonom, p.ekonom_code,
              pm.cost_price AS my_cost, pm.margin_percent AS my_margin
       FROM products p LEFT JOIN product_margins pm ON pm.product_id = p.id AND pm.user_id = $2
       WHERE LOWER(p.name) = LOWER($1) LIMIT 1`,
      [name, user.id]
    );
    const product = pr.rows[0] || null;
    if (!product) return NextResponse.json({ product: null, hints: [] });

    const hist = await db.query(
      `SELECT oi.unit_price, o.id, o.offer_number, o.revision, o.status, o.outcome, o.client_id, o.client_name, o.created_at,
              o.user_id, u.name AS salesperson, u.market_region AS market
       FROM offer_items oi
       JOIN offers o ON o.id = oi.offer_id
       LEFT JOIN users u ON u.id = o.user_id
       WHERE oi.product_id = $1 AND o.status <> 'draft'
       ORDER BY o.created_at DESC LIMIT 400`,
      [product.id]
    );
    const rows = hist.rows as any[];
    const hints: any[] = [];
    const add = (h: any) => hints.push({ ...h, price: r2(h.price) });

    // 1) ostatnia cena dla tego klienta (najsilniejsza podpowiedź)
    if (clientId) {
      const last = rows.find((x) => x.client_id === clientId);
      if (last) {
        add({
          kind: 'client_last', label: 'Ostatnia cena dla tego klienta', price: last.unit_price, date: last.created_at,
          detail: `${offerLabel(last)} · ${last.outcome === 'lost' ? 'przegrana' : last.outcome === 'won' || last.outcome === 'partial' ? 'wygrana' : 'w toku'} · ${last.salesperson || ''}`,
        });
      }
    }
    // 2) co oferował kolega (ostatnia cena innego handlowca)
    const colleague = rows.find((x) => x.user_id !== user.id);
    if (colleague) {
      add({
        kind: 'colleague', label: `Kolega: ${colleague.salesperson}`, price: colleague.unit_price, date: colleague.created_at,
        detail: `${colleague.market || 'rynek ogólny'} · ${offerLabel(colleague)}`,
      });
    }
    // 3) inne rynki (regiony) - średnie
    const byMarket = new Map<string, number[]>();
    rows.forEach((x) => { if (x.market) byMarket.set(x.market, [...(byMarket.get(x.market) || []), Number(x.unit_price)]); });
    const myMarket = user.region;
    Array.from(byMarket.entries())
      .filter(([m, v]) => m !== myMarket && v.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 2)
      .forEach(([m, v]) => add({ kind: 'market', label: `Rynek ${m}: średnio`, price: v.reduce((s, x) => s + x, 0) / v.length, detail: `${v.length} ofert` }));
    // 4) średnia cena wygranych ofert
    const won = rows.filter((x) => x.outcome === 'won' || x.outcome === 'partial');
    if (won.length >= 2) {
      add({ kind: 'won_avg', label: 'Średnia cena wygranych ofert', price: won.reduce((s, x) => s + Number(x.unit_price), 0) / won.length, detail: `${won.length} wygranych` });
    }
    // 5) najniższa cena z przegranych: pokazuje, gdzie „kończy się rynek”
    const lost = rows.filter((x) => x.outcome === 'lost');
    if (lost.length >= 2) {
      add({ kind: 'lost_avg', label: 'Średnia cena przegranych ofert', price: lost.reduce((s, x) => s + Number(x.unit_price), 0) / lost.length, detail: `${lost.length} przegranych – tu ceny były za wysokie` });
    }
    // 6) cena z kartoteki (koszt + moja marża)
    if (Number(product.my_cost) > 0 && product.my_margin !== null) {
      add({ kind: 'catalog', label: 'Cena katalogowa (moja marża)', price: Number(product.my_cost) * (1 + Number(product.my_margin) / 100), detail: 'koszt + domyślna marża' });
    }

    return NextResponse.json({
      product: {
        id: product.id, name: product.name, unit: product.unit, category: product.category, manufacturer: product.manufacturer,
        min_price: product.min_price !== null ? Number(product.min_price) : null,
        stock_qty: product.stock_qty !== null ? Number(product.stock_qty) : null,
        production_note: product.production_note, in_ekonom: product.in_ekonom !== false, ekonom_code: product.ekonom_code,
      },
      hints,
    });
  } catch (error) {
    return serverError('Pricing hints error:', error, 'Błąd podpowiedzi cen');
  }
}
