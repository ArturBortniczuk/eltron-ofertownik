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
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
      return NextResponse.json([]);
    }

    // Wyszukaj produkty z historii ofert wszystkich użytkowników
    const result = await db.query(`
      SELECT DISTINCT 
        oi.product_name as name,
        oi.unit,
        oi.unit_price as last_price,
        o.created_at as last_used_at,
        u.name as last_used_by,
        COUNT(*) OVER (PARTITION BY oi.product_name, oi.unit) as usage_count,
        AVG(oi.unit_price) OVER (PARTITION BY oi.product_name, oi.unit) as avg_price,
        MIN(oi.unit_price) OVER (PARTITION BY oi.product_name, oi.unit) as min_price,
        MAX(oi.unit_price) OVER (PARTITION BY oi.product_name, oi.unit) as max_price
      FROM offer_items oi
      JOIN offers o ON oi.offer_id = o.id
      JOIN users u ON o.user_id = u.id
      WHERE oi.product_name ILIKE $1
      ORDER BY 
        CASE 
          WHEN oi.product_name ILIKE $2 THEN 1
          WHEN oi.product_name ILIKE $1 THEN 2
          ELSE 3
        END,
        usage_count DESC,
        o.created_at DESC,
        oi.product_name
      LIMIT 15
    `, [`%${query}%`, `${query}%`]);

    // Formatuj wyniki dla lepszego UX
    const formattedResults = result.rows.map(row => ({
      name: row.name,
      unit: row.unit,
      last_price: parseFloat(row.last_price),
      last_used_at: row.last_used_at,
      last_used_by: row.last_used_by,
      usage_count: parseInt(row.usage_count),
      avg_price: parseFloat(row.avg_price),
      min_price: parseFloat(row.min_price),
      max_price: parseFloat(row.max_price)
    }));

    return NextResponse.json(formattedResults);

  } catch (error) {
    console.error('Product search error:', error);
    return NextResponse.json(
      { error: 'Błąd wyszukiwania produktów' },
      { status: 500 }
    );
  }
}
