// app/api/products/search/route.ts - WERSJA DEBUG
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

    console.log('🔍 Search query:', query);

    // NAJPIERW SPRAWDŹ CZY SĄ JAKIEKOLWIEK DANE W offer_items
    const allItemsResult = await db.query(`
      SELECT COUNT(*) as total FROM offer_items
    `);
    console.log('📊 Total offer_items in database:', allItemsResult.rows[0]?.total);

    // SPRAWDŹ KONKRETNIE produkty z "Rura" w nazwie - prostsze zapytanie
    const directTestResult = await db.query(`
      SELECT 
        oi.product_name,
        oi.unit,
        oi.unit_price
      FROM offer_items oi
      WHERE oi.product_name ILIKE '%Rura%'
      LIMIT 5
    `);
    console.log('🧪 Direct test for "Rura":', directTestResult.rows);

    // UPROSZCZONE ZAPYTANIE bez problematycznych JOIN-ów
    const result = await db.query(`
      SELECT DISTINCT 
        oi.product_name as name,
        oi.unit,
        oi.unit_price as last_price,
        COUNT(*) OVER (PARTITION BY oi.product_name, oi.unit) as usage_count,
        AVG(oi.unit_price) OVER (PARTITION BY oi.product_name, oi.unit) as avg_price,
        MIN(oi.unit_price) OVER (PARTITION BY oi.product_name, oi.unit) as min_price,
        MAX(oi.unit_price) OVER (PARTITION BY oi.product_name, oi.unit) as max_price
      FROM offer_items oi
      WHERE oi.product_name ILIKE $1
      ORDER BY 
        CASE 
          WHEN oi.product_name ILIKE $2 THEN 1
          WHEN oi.product_name ILIKE $1 THEN 2
          ELSE 3
        END,
        usage_count DESC,
        oi.product_name
      LIMIT 15
    `, [`%${query}%`, `${query}%`]);

    console.log('📋 Query result rows:', result.rows.length);
    console.log('📋 First few results:', result.rows.slice(0, 3));

    // Formatuj wyniki dla lepszego UX
    const formattedResults = result.rows.map(row => ({
      name: row.name,
      unit: row.unit,
      last_price: parseFloat(row.last_price),
      last_used_at: new Date().toISOString(), // Tymczasowe
      last_used_by: 'Administrator', // Tymczasowe
      usage_count: parseInt(row.usage_count),
      avg_price: parseFloat(row.avg_price),
      min_price: parseFloat(row.min_price),
      max_price: parseFloat(row.max_price)
    }));

    console.log('✅ Returning formatted results:', formattedResults.length);
    return NextResponse.json(formattedResults);

  } catch (error) {
    console.error('❌ Product search error:', error);
    return NextResponse.json(
      { error: 'Błąd wyszukiwania produktów' },
      { status: 500 }
    );
  }
}
