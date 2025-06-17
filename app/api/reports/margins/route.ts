import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
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
    
    // Sprawdź uprawnienia na serwerze
    const userRole = (session.user as any)?.role;
    const canViewAll = ['zarząd', 'centrum elektryczne'].includes(userRole);

    // Symulowane dane - zastąp prawdziwymi zapytaniami do bazy
    const marginReport = await db.query(`
      SELECT 
        DATE_TRUNC('month', o.created_at) as month,
        COUNT(o.id) as offers_count,
        COALESCE(SUM(o.total_net * 0.8), 0) as total_cost,
        COALESCE(SUM(o.total_net), 0) as total_sale,
        COALESCE(SUM(o.total_net * 0.2), 0) as total_margin,
        COALESCE(20.0, 0) as avg_margin_percent,
        COALESCE(SUM(o.total_net * 0.05), 0) as total_discount,
        COALESCE(5.0, 0) as avg_discount_percent
      FROM offers o
      WHERE o.created_at >= CURRENT_DATE - INTERVAL '${parseInt(period)} days'
        ${canViewAll ? '' : 'AND o.user_id = $1'}
        AND o.status != 'draft'
      GROUP BY DATE_TRUNC('month', o.created_at)
      ORDER BY month DESC
    `, canViewAll ? [] : [userId]);

    const topMarginProducts = await db.query(`
      SELECT 
        oi.product_name as name,
        COALESCE(25.0, 0) as avg_margin,
        COALESCE(SUM(oi.quantity), 0) as total_quantity,
        COALESCE(SUM(oi.gross_amount), 0) as total_value
      FROM offer_items oi
      JOIN offers o ON oi.offer_id = o.id
      WHERE o.created_at >= CURRENT_DATE - INTERVAL '${parseInt(period)} days'
        ${canViewAll ? '' : 'AND o.user_id = $1'}
        AND o.status != 'draft'
      GROUP BY oi.product_name
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
