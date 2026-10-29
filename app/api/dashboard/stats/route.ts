// Statystyki pulpitu (zakres zależy od roli)
import { NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, serverError } from '../../../../lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const canViewAll = user.canViewAll;
    const w = canViewAll ? '' : 'AND o.user_id = $1';
    const p: any[] = canViewAll ? [] : [user.id];

    const [counts, monthly, recent, extra, targetRow, tasksRow] = await Promise.all([
      db.query(`SELECT o.status, COUNT(*) AS count FROM offers o WHERE 1=1 ${w} GROUP BY o.status`, p),
      db.query(
        `SELECT COALESCE(SUM(o.total_gross), 0) AS total FROM offers o
         WHERE o.created_at >= date_trunc('month', CURRENT_DATE) AND o.status != 'draft' ${w}`, p),
      db.query(
        canViewAll
          ? `SELECT o.id, o.client_name, o.total_gross, o.status, o.created_at, o.approval_status,
                    u.name AS salesperson_name, om.total_margin, om.margin_percent
             FROM offers o LEFT JOIN users u ON o.user_id = u.id LEFT JOIN offer_margin_summary om ON o.id = om.offer_id
             ORDER BY o.created_at DESC LIMIT 6`
          : `SELECT o.id, o.client_name, o.total_gross, o.status, o.created_at, o.approval_status
             FROM offers o WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT 6`,
        p),
      db.query(
        `SELECT COALESCE(SUM(o.total_gross) FILTER (WHERE o.status = 'sent'), 0) AS pipeline,
                COUNT(*) FILTER (WHERE o.approval_status = 'pending') AS pending_approvals,
                COUNT(*) FILTER (WHERE o.status = 'sent' AND o.follow_up_date <= CURRENT_DATE) AS follow_ups,
                COUNT(*) FILTER (WHERE o.status = 'accepted') AS won,
                COUNT(*) FILTER (WHERE o.status = 'rejected') AS lost,
                COALESCE(SUM(o.total_net) FILTER (WHERE o.accepted_at >= date_trunc('month', NOW())), 0) AS won_this_month
         FROM offers o WHERE 1=1 ${w}`, p),
      canViewAll
        ? db.query(`SELECT COALESCE(SUM(monthly_target), 0) AS target FROM users WHERE is_active IS NOT FALSE`)
        : db.query('SELECT COALESCE(monthly_target, 0) AS target FROM users WHERE id = $1', [user.id]),
      db.query(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = $1 AND done = false AND due_date <= CURRENT_DATE`, [user.id]),
    ]);

    const statusCounts: Record<string, number> = {};
    counts.rows.forEach((r: any) => { statusCounts[r.status] = r.count; });
    const totalOffers = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const e = extra.rows[0];
    const closed = e.won + e.lost;

    let marginStats = {};
    if (canViewAll) {
      const [marginQ, productsQ, peopleQ] = await Promise.all([
        db.query(
          `SELECT COALESCE(AVG(om.margin_percent), 0) AS avg_margin,
                  COALESCE(SUM(om.total_margin), 0) AS total_profit,
                  COUNT(CASE WHEN om.margin_percent < 10 THEN 1 END) AS low_margin_offers
           FROM offer_margin_summary om
           WHERE om.created_at >= date_trunc('month', CURRENT_DATE) AND om.status != 'draft'`),
        db.query(
          `SELECT oi.product_name, AVG(oi.margin_percent) AS avg_margin,
                  SUM(oi.quantity * oi.cost_price) AS total_cost, SUM(oi.net_amount) AS total_revenue,
                  SUM((oi.unit_price - oi.cost_price) * oi.quantity) AS total_profit
           FROM offer_items oi JOIN offers o ON oi.offer_id = o.id
           WHERE o.created_at >= date_trunc('month', CURRENT_DATE) AND o.status != 'draft' AND oi.cost_price > 0
           GROUP BY oi.product_name HAVING SUM(oi.net_amount) > 100 ORDER BY total_profit DESC LIMIT 5`),
        db.query(
          `SELECT u.name AS salesperson_name, u.market_region, AVG(om.margin_percent) AS avg_margin,
                  SUM(om.total_margin) AS total_profit, COUNT(o.id) AS offers_count
           FROM offers o JOIN users u ON o.user_id = u.id LEFT JOIN offer_margin_summary om ON o.id = om.offer_id
           WHERE o.created_at >= date_trunc('month', CURRENT_DATE) AND o.status != 'draft'
           GROUP BY u.id, u.name, u.market_region ORDER BY total_profit DESC NULLS LAST LIMIT 5`),
      ]);
      const m = marginQ.rows[0];
      marginStats = {
        avgMargin: m.avg_margin,
        totalProfit: m.total_profit,
        lowMarginOffers: m.low_margin_offers,
        topProducts: productsQ.rows.map((r: any) => ({
          name: r.product_name, avg_margin: r.avg_margin, total_cost: r.total_cost,
          total_revenue: r.total_revenue, total_profit: r.total_profit,
        })),
        topSalespeople: peopleQ.rows.map((r: any) => ({
          name: r.salesperson_name, market_region: r.market_region, avg_margin: r.avg_margin || 0,
          total_profit: r.total_profit || 0, offers_count: r.offers_count,
        })),
      };
    }

    return NextResponse.json({
      totalOffers,
      draftOffers: statusCounts.draft || 0,
      sentOffers: statusCounts.sent || 0,
      acceptedOffers: statusCounts.accepted || 0,
      rejectedOffers: statusCounts.rejected || 0,
      monthlyTotal: monthly.rows[0].total,
      recentOffers: recent.rows,
      pipelineValue: e.pipeline,
      pendingApprovals: e.pending_approvals,
      followUps: e.follow_ups,
      tasksDue: tasksRow.rows[0].n,
      conversionRate: closed > 0 ? Math.round((e.won / closed) * 1000) / 10 : 0,
      target: { monthly_target: targetRow.rows[0].target, achieved: e.won_this_month },
      ...marginStats,
    });
  } catch (error) {
    return serverError('Dashboard stats error:', error, 'Błąd pobierania statystyk');
  }
}
