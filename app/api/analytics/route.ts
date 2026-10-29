// Analityka sprzedaży: trendy, lejek, zespół, regiony, klienci, produkty, przyczyny przegranych
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getApiUser, unauthorized, serverError, intParam } from '../../../lib/api-auth';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const months = intParam(searchParams.get('months'), 12, 3, 24);
    const requested = parseInt(searchParams.get('user_id') || '', 10);
    // Handlowiec widzi tylko siebie; zarząd i centrum - całość lub wybranego handlowca
    const scoped: number | null = user.canViewAll ? (Number.isInteger(requested) ? requested : null) : user.id;
    const w = scoped ? 'AND o.user_id = $1' : '';
    const p: any[] = scoped ? [scoped] : [];
    const since = `date_trunc('month', NOW()) - INTERVAL '${months - 1} months'`;

    const [monthlyQ, statusQ, cycleQ, clientsQ, productsQ, reasonsQ, targetQ] = await Promise.all([
      db.query(
        `SELECT to_char(date_trunc('month', o.created_at), 'YYYY-MM') AS month,
                COUNT(*) AS offers,
                COUNT(*) FILTER (WHERE o.status = 'accepted') AS won,
                COUNT(*) FILTER (WHERE o.status = 'rejected') AS lost,
                COALESCE(SUM(o.total_net), 0) AS value,
                COALESCE(SUM(o.total_net) FILTER (WHERE o.status = 'accepted'), 0) AS won_value
         FROM offers o WHERE o.created_at >= ${since} ${w} GROUP BY 1 ORDER BY 1`, p),
      db.query(
        `SELECT o.status, COUNT(*) AS n, COALESCE(SUM(o.total_net), 0) AS value
         FROM offers o WHERE o.created_at >= ${since} ${w} GROUP BY o.status`, p),
      db.query(
        `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (o.accepted_at - COALESCE(o.sent_at, o.created_at))) / 86400), 0) AS days
         FROM offers o WHERE o.status = 'accepted' AND o.accepted_at IS NOT NULL ${w}`, p),
      db.query(
        `SELECT c.id, c.name, COUNT(o.id) AS offers,
                COUNT(*) FILTER (WHERE o.status = 'accepted') AS won,
                COALESCE(SUM(o.total_net) FILTER (WHERE o.status = 'accepted'), 0) AS won_value
         FROM offers o JOIN clients c ON c.id = o.client_id
         WHERE o.created_at >= ${since} ${w} GROUP BY c.id, c.name
         ORDER BY won_value DESC, offers DESC LIMIT 8`, p),
      db.query(
        `SELECT oi.product_name AS name, SUM(oi.quantity) AS quantity, SUM(oi.net_amount) AS revenue,
                COUNT(DISTINCT o.id) AS offers
         FROM offer_items oi JOIN offers o ON o.id = oi.offer_id
         WHERE o.created_at >= ${since} AND o.status IN ('sent','accepted') ${w}
         GROUP BY oi.product_name ORDER BY revenue DESC LIMIT 8`, p),
      db.query(
        `SELECT COALESCE(NULLIF(o.lost_reason, ''), 'Nie podano') AS reason, COUNT(*) AS n
         FROM offers o WHERE o.status = 'rejected' AND o.created_at >= ${since} ${w}
         GROUP BY 1 ORDER BY n DESC LIMIT 6`, p),
      db.query(
        `SELECT COALESCE(SUM(o.total_net) FILTER (WHERE o.accepted_at >= date_trunc('month', NOW())), 0) AS achieved,
                COALESCE(SUM(o.total_net) FILTER (WHERE o.status = 'sent'), 0) AS pipeline,
                COUNT(*) FILTER (WHERE o.status = 'sent') AS open_offers
         FROM offers o WHERE o.status IN ('sent','accepted') ${w}`, p),
    ]);

    // Uzupełnij brakujące miesiące zerami
    const byMonth = new Map<string, any>(monthlyQ.rows.map((r: any) => [r.month, r]));
    const now = new Date();
    const monthly = Array.from({ length: months }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const r = byMonth.get(key);
      return {
        month: key,
        label: MONTH_NAMES[d.getMonth()],
        offers: r?.offers || 0, won: r?.won || 0, lost: r?.lost || 0,
        value: r?.value || 0, won_value: r?.won_value || 0,
      };
    });

    const statuses: Record<string, { n: number; value: number }> = {};
    statusQ.rows.forEach((r: any) => { statuses[r.status] = { n: r.n, value: r.value }; });
    const won = statuses.accepted?.n || 0;
    const lost = statuses.rejected?.n || 0;
    const conversion = won + lost > 0 ? (won / (won + lost)) * 100 : 0;
    const t = targetQ.rows[0];

    // Cel miesięczny
    const targetRow = scoped
      ? await db.query('SELECT COALESCE(monthly_target, 0) AS target FROM users WHERE id = $1', [scoped])
      : await db.query(`SELECT COALESCE(SUM(monthly_target), 0) AS target FROM users WHERE is_active IS NOT FALSE`);

    // Prognoza: otwarte oferty ważone skutecznością, rozłożone na miesiące wg spodziewanej daty decyzji
    const openQ = await db.query(
      `SELECT o.total_net, COALESCE(o.sent_at, o.created_at) AS sent_at FROM offers o WHERE o.status = 'sent' ${w}`, p);
    const cycleDays = Math.max(3, Math.round(cycleQ.rows[0].days) || 14);
    const winRate = won + lost > 0 ? won / (won + lost) : 0.5;
    const forecastMonths = [0, 1, 2].map((offset) => {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: MONTH_NAMES[d.getMonth()],
        achieved: offset === 0 ? t.achieved : 0,
        weighted: 0,
        open: 0,
      };
    });
    let beyond = 0;
    openQ.rows.forEach((o: any) => {
      let expected = new Date(new Date(o.sent_at).getTime() + cycleDays * 86400000);
      if (expected < now) expected = now; // przeterminowane liczymy jako "do rozstrzygnięcia teraz"
      const key = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}`;
      const slot = forecastMonths.find((m) => m.key === key);
      if (slot) { slot.weighted += o.total_net * winRate; slot.open += o.total_net; } else beyond += o.total_net;
    });
    const lastFull = monthly.slice(-4, -1);
    const baseline = lastFull.length ? lastFull.reduce((s, m) => s + m.won_value, 0) / lastFull.length : 0;
    const forecast = {
      winRate: Math.round(winRate * 1000) / 10,
      cycleDays,
      baseline: Math.round(baseline),
      beyond: Math.round(beyond),
      months: forecastMonths.map((m) => ({ ...m, weighted: Math.round(m.weighted), open: Math.round(m.open) })),
    };

    const result: any = {
      forecast,
      scope: scoped ? 'user' : 'company',
      months,
      monthly,
      statuses,
      conversion: Math.round(conversion * 10) / 10,
      avgCycleDays: Math.round(cycleQ.rows[0].days * 10) / 10,
      topClients: clientsQ.rows,
      topProducts: productsQ.rows,
      lostReasons: reasonsQ.rows,
      target: { monthly_target: targetRow.rows[0].target, achieved: t.achieved },
      pipeline: {
        value: t.pipeline,
        openOffers: t.open_offers,
        weighted: Math.round(t.pipeline * (conversion / 100)),
      },
    };

    if (user.canViewAll) {
      const [teamQ, regionQ, marginQ] = await Promise.all([
        db.query(
          `SELECT u.id, u.name, u.market_region AS region, u.role, COALESCE(u.monthly_target, 0) AS target,
                  COUNT(o.id) AS offers,
                  COUNT(o.id) FILTER (WHERE o.status = 'accepted') AS won,
                  COUNT(o.id) FILTER (WHERE o.status = 'rejected') AS lost,
                  COALESCE(SUM(o.total_net) FILTER (WHERE o.status = 'accepted'), 0) AS won_value,
                  COALESCE(SUM(o.total_net) FILTER (WHERE o.status = 'sent'), 0) AS pipeline,
                  COALESCE(SUM(o.total_net) FILTER (WHERE o.accepted_at >= date_trunc('month', NOW())), 0) AS month_value,
                  COALESCE(AVG(om.margin_percent) FILTER (WHERE o.status <> 'draft'), 0) AS avg_margin
           FROM users u
           LEFT JOIN offers o ON o.user_id = u.id AND o.created_at >= ${since}
           LEFT JOIN offer_margin_summary om ON om.offer_id = o.id
           WHERE u.is_active IS NOT FALSE
           GROUP BY u.id, u.name, u.market_region, u.role, u.monthly_target
           HAVING COUNT(o.id) > 0
           ORDER BY won_value DESC`),
        db.query(
          `SELECT COALESCE(u.market_region, 'Brak regionu') AS region, COUNT(o.id) AS offers,
                  COUNT(o.id) FILTER (WHERE o.status = 'accepted') AS won,
                  COALESCE(SUM(o.total_net) FILTER (WHERE o.status = 'accepted'), 0) AS won_value
           FROM offers o JOIN users u ON u.id = o.user_id
           WHERE o.created_at >= ${since} GROUP BY 1 ORDER BY won_value DESC`),
        db.query(
          `SELECT to_char(date_trunc('month', om.created_at), 'YYYY-MM') AS month,
                  COALESCE(AVG(om.margin_percent), 0) AS avg_margin
           FROM offer_margin_summary om
           WHERE om.created_at >= ${since} AND om.status <> 'draft' ${scoped ? 'AND om.user_id = $1' : ''}
           GROUP BY 1 ORDER BY 1`, p),
      ]);
      result.team = teamQ.rows;
      result.regions = regionQ.rows;
      const mm = new Map<string, number>(marginQ.rows.map((r: any) => [r.month, r.avg_margin]));
      result.monthly = monthly.map((m) => ({ ...m, avg_margin: mm.get(m.month) ?? null }));
    }

    return NextResponse.json(result);
  } catch (error) {
    return serverError('Analytics error:', error, 'Błąd pobierania analityki');
  }
}
