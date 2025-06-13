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

    // Pobierz statystyki
    const [totalOffersResult, statusCountsResult, monthlyTotalResult, recentOffersResult] = await Promise.all([
      // Łączna liczba ofert
      db.query('SELECT COUNT(*) as count FROM offers WHERE user_id = $1', [userId]),
      
      // Liczba ofert według statusu
      db.query(
        'SELECT status, COUNT(*) as count FROM offers WHERE user_id = $1 GROUP BY status',
        [userId]
      ),
      
      // Suma wartości ofert z tego miesiąca
      db.query(
        `SELECT COALESCE(SUM(total_gross), 0) as total 
         FROM offers 
         WHERE user_id = $1 
         AND created_at >= date_trunc('month', CURRENT_DATE)
         AND status != 'draft'`,
        [userId]
      ),
      
      // Ostatnie 5 ofert
      db.query(
        `SELECT id, client_name, total_gross, status, created_at 
         FROM offers 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 5`,
        [userId]
      )
    ]);

    const totalOffers = parseInt(totalOffersResult.rows[0]?.count || '0');
    
    // Przetwórz statusy
    const statusCounts = statusCountsResult.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

    const monthlyTotal = parseFloat(monthlyTotalResult.rows[0]?.total || '0');
    const recentOffers = recentOffersResult.rows;

    return NextResponse.json({
      totalOffers,
      draftOffers: statusCounts.draft || 0,
      sentOffers: statusCounts.sent || 0,
      acceptedOffers: statusCounts.accepted || 0,
      rejectedOffers: statusCounts.rejected || 0,
      monthlyTotal,
      recentOffers
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Błąd pobierania statystyk' },
      { status: 500 }
    );
  }
}
