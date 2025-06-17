// app/api/dashboard/stats/route.ts - ROZSZERZONA WERSJA Z MARŻAMI
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

    const userId = parseInt(session.user.id);
    const userRole = (session.user as any)?.role;
    
    // Sprawdź czy użytkownik może widzieć wszystkie dane
    const canViewAll = ['zarząd', 'centrum elektryczne'].includes(userRole);

    const queries = await Promise.all([
      // Łączna liczba ofert
      db.query(
        canViewAll 
          ? 'SELECT COUNT(*) as count FROM offers'
          : 'SELECT COUNT(*) as count FROM offers WHERE user_id = $1',
        canViewAll ? [] : [userId]
      ),
      
      // Liczba ofert według statusu
      db.query(
        canViewAll
          ? 'SELECT status, COUNT(*) as count FROM offers GROUP BY status'
          : 'SELECT status, COUNT(*) as count FROM offers WHERE user_id = $1 GROUP BY status',
        canViewAll ? [] : [userId]
      ),
      
      // Suma wartości ofert z tego miesiąca
      db.query(
        canViewAll ? `
          SELECT COALESCE(SUM(total_gross), 0) as total 
          FROM offers 
          WHERE created_at >= date_trunc('month', CURRENT_DATE)
          AND status != 'draft'
        ` : `
          SELECT COALESCE(SUM(total_gross), 0) as total 
          FROM offers 
          WHERE user_id = $1 
          AND created_at >= date_trunc('month', CURRENT_DATE)
          AND status != 'draft'
        `,
        canViewAll ? [] : [userId]
      ),
      
      // Ostatnie oferty z danymi marży
      db.query(
        canViewAll ? `
          SELECT 
            o.id, o.client_name, o.total_gross, o.status, o.created_at,
            u.name as salesperson_name,
            om.total_margin, om.margin_percent
          FROM offers o
          LEFT JOIN users u ON o.user_id = u.id
          LEFT JOIN offer_margin_summary om ON o.id = om.offer_id
          ORDER BY o.created_at DESC 
          LIMIT 5
        ` : `
          SELECT 
            o.id, o.client_name, o.total_gross, o.status, o.created_at
          FROM offers o
          WHERE o.user_id = $1 
          ORDER BY o.created_at DESC 
          LIMIT 5
        `,
        canViewAll ? [] : [userId]
      )
    ]);

    const [totalOffersResult, statusCountsResult, monthlyTotalResult, recentOffersResult] = queries;

    const totalOffers = parseInt(totalOffersResult.rows[0]?.count || '0');
    
    // Przetwórz statusy
    const statusCounts = statusCountsResult.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

    const monthlyTotal = parseFloat(monthlyTotalResult.rows[0]?.total || '0');
    const recentOffers = recentOffersResult.rows;

    let marginStats = {};

    // Dodatkowe statystyki marż dla uprawnionych ról
    if (canViewAll) {
      const marginQueries = await Promise.all([
        // Średnia marża z tego miesiąca
        db.query(`
          SELECT 
            COALESCE(AVG(om.margin_percent), 0) as avg_margin,
            COALESCE(SUM(om.total_margin), 0) as total_profit,
            COUNT(CASE WHEN om.margin_percent < 10 THEN 1 END) as low_margin_offers
          FROM offer_margin_summary om
          WHERE om.created_at >= date_trunc('month', CURRENT_DATE)
          AND om.status != 'draft'
        `),
        
        // Top produkty z najwyższą marżą z tego miesiąca
        db.query(`
          SELECT 
            oi.product_name,
            AVG(oi.margin_percent) as avg_margin,
            SUM(oi.quantity * oi.cost_price) as total_cost,
            SUM(oi.net_amount) as total_revenue,
            SUM((oi.unit_price - oi.cost_price) * oi.quantity) as total_profit
          FROM offer_items oi
          JOIN offers o ON oi.offer_id = o.id
          WHERE o.created_at >= date_trunc('month', CURRENT_DATE)
          AND o.status != 'draft'
          AND oi.cost_price > 0
          GROUP BY oi.product_name
          HAVING SUM(oi.net_amount) > 100
          ORDER BY avg_margin DESC
          LIMIT 5
        `),

        // Handlowcy z najwyższymi marżami
        db.query(`
          SELECT 
            u.name as salesperson_name,
            u.market_region,
            AVG(om.margin_percent) as avg_margin,
            SUM(om.total_margin) as total_profit,
            COUNT(o.id) as offers_count
          FROM offers o
          JOIN users u ON o.user_id = u.id
          LEFT JOIN offer_margin_summary om ON o.id = om.offer_id
          WHERE o.created_at >= date_trunc('month', CURRENT_DATE)
          AND o.status != 'draft'
          GROUP BY u.id, u.name, u.market_region
          HAVING COUNT(o.id) >= 3
          ORDER BY avg_margin DESC
          LIMIT 5
        `)
      ]);

      const [marginStatsResult, topProductsResult, topSalespeopleResult] = marginQueries;
      
      marginStats = {
        avgMargin: parseFloat(marginStatsResult.rows[0]?.avg_margin || '0'),
        totalProfit: parseFloat(marginStatsResult.rows[0]?.total_profit || '0'),
        lowMarginOffers: parseInt(marginStatsResult.rows[0]?.low_margin_offers || '0'),
        topProducts: topProductsResult.rows.map(row => ({
          name: row.product_name,
          avg_margin: parseFloat(row.avg_margin),
          total_cost: parseFloat(row.total_cost),
          total_revenue: parseFloat(row.total_revenue),
          total_profit: parseFloat(row.total_profit)
        })),
        topSalespeople: topSalespeopleResult.rows.map(row => ({
          name: row.salesperson_name,
          market_region: row.market_region,
          avg_margin: parseFloat(row.avg_margin),
          total_profit: parseFloat(row.total_profit),
          offers_count: parseInt(row.offers_count)
        }))
      };
    }

    return NextResponse.json({
      totalOffers,
      draftOffers: statusCounts.draft || 0,
      sentOffers: statusCounts.sent || 0,
      acceptedOffers: statusCounts.accepted || 0,
      rejectedOffers: statusCounts.rejected || 0,
      monthlyTotal,
      recentOffers,
      ...marginStats
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Błąd pobierania statystyk' },
      { status: 500 }
    );
  }
}
