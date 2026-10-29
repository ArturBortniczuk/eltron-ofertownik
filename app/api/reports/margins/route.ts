// Raport marż - liczony z rzeczywistych pozycji ofert (koszt, cena sprzedaży, rabaty)
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, forbidden, serverError, intParam } from '../../../../lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    if (!user.canViewAll) return forbidden('Raport marż jest dostępny tylko dla zarządu i Centrum Elektrycznego');

    const period = intParam(new URL(request.url).searchParams.get('period'), 30, 1, 730);

    const monthlyReport = await db.query(
      `SELECT date_trunc('month', o.created_at) AS month,
              COUNT(DISTINCT o.id) AS offers_count,
              COALESCE(SUM(oi.cost_price * oi.quantity), 0) AS total_cost,
              COALESCE(SUM(oi.net_amount), 0) AS total_sale,
              COALESCE(SUM(oi.net_amount - oi.cost_price * oi.quantity), 0) AS total_margin,
              CASE WHEN SUM(oi.cost_price * oi.quantity) > 0
                   THEN (SUM(oi.net_amount - oi.cost_price * oi.quantity) / SUM(oi.cost_price * oi.quantity)) * 100 ELSE 0 END AS avg_margin_percent,
              COALESCE(SUM(COALESCE(oi.original_price, oi.unit_price) * oi.quantity - oi.net_amount), 0) AS total_discount,
              CASE WHEN SUM(COALESCE(oi.original_price, oi.unit_price) * oi.quantity) > 0
                   THEN (1 - SUM(oi.net_amount) / SUM(COALESCE(oi.original_price, oi.unit_price) * oi.quantity)) * 100 ELSE 0 END AS avg_discount_percent
       FROM offers o JOIN offer_items oi ON oi.offer_id = o.id
       WHERE o.created_at >= CURRENT_DATE - ($1::int * INTERVAL '1 day') AND o.status != 'draft'
       GROUP BY 1 ORDER BY 1 DESC`,
      [period]
    );

    const topMarginProducts = await db.query(
      `SELECT oi.product_name AS name,
              COALESCE(AVG(oi.margin_percent) FILTER (WHERE oi.cost_price > 0), 0) AS avg_margin,
              COALESCE(SUM(oi.quantity), 0) AS total_quantity,
              COALESCE(SUM(oi.gross_amount), 0) AS total_value
       FROM offer_items oi JOIN offers o ON oi.offer_id = o.id
       WHERE o.created_at >= CURRENT_DATE - ($1::int * INTERVAL '1 day') AND o.status != 'draft'
       GROUP BY oi.product_name
       ORDER BY SUM(oi.net_amount - oi.cost_price * oi.quantity) DESC LIMIT 10`,
      [period]
    );

    return NextResponse.json({ monthlyReport: monthlyReport.rows, topMarginProducts: topMarginProducts.rows, period: String(period) });
  } catch (error) {
    return serverError('Margin report error:', error);
  }
}
