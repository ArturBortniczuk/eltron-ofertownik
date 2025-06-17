import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, canAccessAllData } from '../../../../lib/auth';
import { db } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30';
    const userId = parseInt(session.user.id);
    const canViewAll = canAccessAllData(session);

    const marginReport = await db.query(`
      SELECT 
        DATE_TRUNC('month', o.created_at) as month,
        COUNT(o.id) as offers_count,
        COALESCE(SUM(oi.quantity * oi.cost_price), 0) as total_cost,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total_sale,
        COALESCE(SUM(oi.quantity * (oi.unit_price - COALESCE(oi.cost_price, 0))), 0) as total_margin,
        COALESCE(AVG(oi.margin_percent), 0) as avg_margin_percent,
        COALESCE(SUM(oi.quantity * COALESCE(oi.original_price, oi.unit_price) * COALESCE(oi.discount_percent, 0) / 100), 0) as total_discount,
        COALESCE(AVG(oi.discount_percent), 0) as avg_discount_percent
      FROM offers o
      JOIN offer_items oi ON o.id = oi.offer_id
      WHERE o.created_at >= CURRENT_DATE - INTERVAL '${period} days'
        ${canViewAll ? '' : 'AND o.user_id = $1'}
        AND o.status != 'draft'
      GROUP BY DATE_TRUNC('month', o.created_at)
      ORDER BY month DESC
    `, canViewAll ? [] : [userId]);

    const topMarginProducts = await db.query(`
      SELECT 
        p.name,
        COALESCE(AVG(oi.margin_percent), 0) as avg_margin,
        COALESCE(SUM(oi.quantity), 0) as total_quantity,
        COALESCE(SUM(oi.gross_amount), 0) as total_value
      FROM offer_items oi
      JOIN offers o ON oi.offer_id = o.id
      JOIN products p ON oi.product_id = p.id
      WHERE o.created_at >= CURRENT_DATE - INTERVAL '${period} days'
        ${canViewAll ? '' : 'AND o.user_id = $1'}
        AND o.status != 'draft'
      GROUP BY p.id, p.name
      ORDER BY avg_margin DESC
      LIMIT 10
    `, canViewAll ? [] : [userId]);

    return NextResponse.json({
      monthlyReport: marginReport.rows,
      topMarginProducts: topMarginProducts.rows,
      period: period
    });

  } catch (error) {
    console.error('Margin report error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}