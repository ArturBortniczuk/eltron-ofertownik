// Panel zarządczy: wszystkie zapytania/oferty z filtrami (temat, segment, producent, towar, handlowiec, rynek, klient),
// ceny po bonusie dostawców, wszystkie koszty oraz analiza sprzedaży utraconej. Dostęp: zarząd i Centrum Elektryczne.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, forbidden, serverError } from '../../../../lib/api-auth';
import { toCsv } from '../../../../lib/csv';
import { offerLabel, OFFER_TYPES, OUTCOMES } from '../../../../lib/offer-rules';
import { STATUS_META } from '../../../../lib/format';

export const dynamic = 'force-dynamic';

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    if (!user.canViewAll) return forbidden('Panel zarządczy jest dostępny tylko dla zarządu i Centrum Elektrycznego');

    const sp = new URL(request.url).searchParams;
    const params: any[] = [];
    const where: string[] = [];
    const add = (sql: string, value: any) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };

    if (sp.get('versions') !== 'all') where.push('o.is_current IS NOT FALSE');
    const topic = (sp.get('q') || '').trim();
    if (topic) add('(o.project_name ILIKE ? OR o.offer_number ILIKE ?)', `%${topic}%`);
    if (sp.get('segment')) add('o.segment = ?', sp.get('segment'));
    if (sp.get('type')) add('o.offer_type = ?', sp.get('type'));
    if (sp.get('user_id')) add('o.user_id = ?', parseInt(sp.get('user_id')!, 10) || 0);
    if (sp.get('market')) add('u.market_region = ?', sp.get('market'));
    if (sp.get('client')) add('o.client_name ILIKE ?', `%${sp.get('client')}%`);
    if (sp.get('status')) add('o.status = ?', sp.get('status'));
    if (sp.get('outcome')) add('o.outcome = ?', sp.get('outcome'));
    if (sp.get('from')) add('o.created_at >= ?', sp.get('from'));
    if (sp.get('to')) add(`o.created_at < (?::date + 1)`, sp.get('to'));
    if (sp.get('product')) add('EXISTS (SELECT 1 FROM offer_items x WHERE x.offer_id = o.id AND x.product_name ILIKE ?)', `%${sp.get('product')}%`);
    if (sp.get('manufacturer')) add('EXISTS (SELECT 1 FROM offer_items x WHERE x.offer_id = o.id AND x.manufacturer = ?)', sp.get('manufacturer'));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rowsQ = await db.query(
      `SELECT o.id, o.offer_number, o.revision, o.project_name, o.segment, o.offer_type, o.status, o.outcome, o.won_amount,
              o.lost_reason, o.competitor, o.client_name, o.created_at, o.closed_at, o.additional_costs, o.total_net,
              o.ekonom_order_no, o.approval_status, u.name AS salesperson, u.market_region AS market,
              COUNT(oi.id)::int AS items_count,
              COALESCE(SUM(oi.cost_price * oi.quantity), 0) AS items_cost,
              COALESCE(SUM(oi.cost_price * oi.quantity * (1 - COALESCE(p.supplier_bonus_percent, 0) / 100.0)), 0) AS items_cost_after_bonus,
              COUNT(*) FILTER (WHERE oi.min_price > 0 AND oi.unit_price < oi.min_price)::int AS below_min
       FROM offers o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN offer_items oi ON oi.offer_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       ${whereSql}
       GROUP BY o.id, u.name, u.market_region
       ORDER BY o.created_at DESC
       LIMIT 1000`,
      params
    );

    const rows = rowsQ.rows.map((o: any) => {
      const extraCost = Number(o.additional_costs) * 0.8; // koszt własny usług dodatkowych (transport, montaż)
      const cost = Number(o.items_cost) + extraCost;
      const costAfterBonus = Number(o.items_cost_after_bonus) + extraCost;
      const net = Number(o.total_net);
      return {
        id: o.id, number: offerLabel(o), project_name: o.project_name, segment: o.segment, offer_type: o.offer_type,
        status: o.status, outcome: o.outcome, won_amount: o.won_amount !== null ? Number(o.won_amount) : null,
        lost_reason: o.lost_reason, competitor: o.competitor, client_name: o.client_name, salesperson: o.salesperson,
        market: o.market, created_at: o.created_at, closed_at: o.closed_at, ekonom_order_no: o.ekonom_order_no,
        total_net: net, additional_costs: Number(o.additional_costs), cost: r2(cost), cost_after_bonus: r2(costAfterBonus),
        margin: r2(net - cost), margin_after_bonus: r2(net - costAfterBonus),
        margin_percent_after_bonus: costAfterBonus > 0 ? r2(((net - costAfterBonus) / costAfterBonus) * 100) : 0,
        items_count: o.items_count, below_min: o.below_min,
      };
    });

    // ---- podsumowanie ----
    const closed = rows.filter((r) => r.outcome);
    const won = rows.filter((r) => r.outcome === 'won' || r.outcome === 'partial');
    const lost = rows.filter((r) => r.outcome === 'lost');
    const wonValue = won.reduce((s, r) => s + (r.won_amount ?? r.total_net), 0);
    const sum = (arr: any[], k: string) => arr.reduce((s, r) => s + Number(r[k] || 0), 0);
    const lostValue = lost.reduce((s, r) => s + r.total_net, 0) + rows.filter((r) => r.outcome === 'partial').reduce((s, r) => s + (r.total_net - (r.won_amount ?? 0)), 0);
    const summary = {
      count: rows.length,
      totalValue: r2(sum(rows, 'total_net')),
      openCount: rows.filter((r) => !r.outcome && r.status !== 'draft').length,
      wonCount: won.length,
      wonValue: r2(wonValue),
      lostCount: lost.length,
      lostValue: r2(lostValue),
      winRate: closed.length ? r2((won.length / closed.length) * 100) : 0,
      cost: r2(sum(rows, 'cost')),
      costAfterBonus: r2(sum(rows, 'cost_after_bonus')),
      bonusEffect: r2(sum(rows, 'cost') - sum(rows, 'cost_after_bonus')),
      marginAfterBonus: r2(sum(rows, 'margin_after_bonus')),
      belowMin: rows.reduce((s, r) => s + (r.below_min > 0 ? 1 : 0), 0),
      tenders: rows.filter((r) => r.offer_type === 'przetarg').length,
    };

    // ---- analiza sprzedaży utraconej ----
    const group = (arr: any[], key: (r: any) => string, value: (r: any) => number) => {
      const m = new Map<string, { label: string; value: number; count: number }>();
      arr.forEach((r) => {
        const k = key(r) || 'brak danych';
        const e = m.get(k) || { label: k, value: 0, count: 0 };
        e.value += value(r); e.count += 1; m.set(k, e);
      });
      return Array.from(m.values()).map((e) => ({ ...e, value: r2(e.value) })).sort((a, b) => b.value - a.value).slice(0, 8);
    };
    const lostRows = rows.filter((r) => r.outcome === 'lost' || r.outcome === 'partial');
    const lostValueOf = (r: any) => (r.outcome === 'partial' ? r.total_net - (r.won_amount ?? 0) : r.total_net);
    const lostByManufacturer = await db.query(
      `SELECT COALESCE(oi.manufacturer, 'brak danych') AS label, SUM(oi.net_amount)::float AS value, COUNT(DISTINCT o.id)::int AS count
       FROM offers o LEFT JOIN users u ON u.id = o.user_id JOIN offer_items oi ON oi.offer_id = o.id
       ${whereSql ? whereSql + ' AND' : 'WHERE'} o.outcome = 'lost'
       GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      params
    );
    const lostAnalysis = {
      byReason: group(lostRows, (r) => r.lost_reason, lostValueOf),
      bySegment: group(lostRows, (r) => r.segment, lostValueOf),
      bySalesperson: group(lostRows, (r) => r.salesperson, lostValueOf),
      byCompetitor: group(lostRows.filter((r) => r.competitor), (r) => r.competitor, lostValueOf),
      byManufacturer: lostByManufacturer.rows.map((r: any) => ({ label: r.label, value: r2(Number(r.value)), count: r.count })),
    };

    // ---- opcje filtrów ----
    const [segments, markets, salespeople, manufacturers] = await Promise.all([
      db.query(`SELECT DISTINCT segment AS v FROM offers WHERE segment IS NOT NULL ORDER BY 1`),
      db.query(`SELECT DISTINCT market_region AS v FROM users WHERE market_region IS NOT NULL ORDER BY 1`),
      db.query(`SELECT id, name FROM users WHERE role IN ('handlowiec', 'budowy', 'centrum elektryczne') ORDER BY name`),
      db.query(`SELECT DISTINCT manufacturer AS v FROM offer_items WHERE manufacturer IS NOT NULL ORDER BY 1`),
    ]);

    // ---- eksport (CSV do Excela lub JSON dla Process App) ----
    const format = sp.get('format');
    if (format === 'csv' || format === 'json') {
      const header = ['Nr oferty', 'Temat / inwestycja', 'Segment', 'Rodzaj', 'Klient', 'Handlowiec', 'Rynek', 'Data', 'Status', 'Wynik',
        'Netto', 'Wygrana kwota', 'Koszt', 'Koszt po bonusie', 'Marża po bonusie', 'Marża po bonusie %', 'Powód utraty', 'Konkurencja', 'Zamówienie Ekonom'];
      const body = rows.map((r) => [r.number, r.project_name, r.segment, OFFER_TYPES[r.offer_type]?.label || r.offer_type, r.client_name, r.salesperson,
        r.market, r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '', STATUS_META[r.status]?.label || r.status,
        r.outcome ? OUTCOMES[r.outcome].label : '', r.total_net, r.won_amount ?? '', r.cost, r.cost_after_bonus, r.margin_after_bonus,
        r.margin_percent_after_bonus, r.lost_reason, r.competitor, r.ekonom_order_no]);
      if (format === 'csv') {
        return new NextResponse(toCsv(header, body), {
          headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="panel-zarzadczy.csv"' },
        });
      }
      return new NextResponse(JSON.stringify({ generated_at: new Date().toISOString(), source: 'ofertownik-eltron', summary, records: rows }, null, 2), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="process-app-export.json"' },
      });
    }

    return NextResponse.json({
      rows, summary, lostAnalysis,
      filters: {
        segments: segments.rows.map((r: any) => r.v),
        markets: markets.rows.map((r: any) => r.v),
        salespeople: salespeople.rows,
        manufacturers: manufacturers.rows.map((r: any) => r.v),
      },
    });
  } catch (error) {
    return serverError('Management panel error:', error, 'Błąd panelu zarządczego');
  }
}
