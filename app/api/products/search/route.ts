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

    // Wyszukaj produkty podobne do zapytania
    const result = await db.query(`
      SELECT DISTINCT 
        p.id,
        p.name,
        p.unit,
        p.created_at,
        pp.price as last_price,
        pp.used_at as last_used_at,
        u.name as last_used_by
      FROM products p
      LEFT JOIN LATERAL (
        SELECT price, used_at, used_by 
        FROM product_prices 
        WHERE product_id = p.id 
        ORDER BY used_at DESC 
        LIMIT 1
      ) pp ON true
      LEFT JOIN users u ON pp.used_by = u.id
      WHERE p.name ILIKE $1
      ORDER BY 
        CASE 
          WHEN p.name ILIKE $2 THEN 1
          WHEN p.name ILIKE $1 THEN 2
          ELSE 3
        END,
        p.last_used DESC,
        p.name
      LIMIT 10
    `, [`%${query}%`, `${query}%`]);

    return NextResponse.json(result.rows);

  } catch (error) {
    console.error('Product search error:', error);
    return NextResponse.json(
      { error: 'Błąd wyszukiwania produktów' },
      { status: 500 }
    );
  }
}
