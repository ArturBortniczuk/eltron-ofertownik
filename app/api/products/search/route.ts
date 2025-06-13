// app/api/products/search/route.ts - MINIMALNA WERSJA
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

    console.log('🔍 Searching for:', query);

    // NAJPROSTSZE MOŻLIWE ZAPYTANIE
    const result = await db.query(`
      SELECT 
        product_name as name,
        unit,
        unit_price as last_price
      FROM offer_items
      WHERE product_name ILIKE $1
      LIMIT 10
    `, [`%${query}%`]);

    console.log('📋 Found rows:', result.rows.length);

    // Proste formatowanie
    const formattedResults = result.rows.map(row => ({
      name: row.name,
      unit: row.unit,
      last_price: parseFloat(row.last_price),
      last_used_at: new Date().toISOString(),
      last_used_by: 'Administrator',
      usage_count: 1,
      avg_price: parseFloat(row.last_price),
      min_price: parseFloat(row.last_price),
      max_price: parseFloat(row.last_price)
    }));

    console.log('✅ Returning results:', formattedResults);
    return NextResponse.json(formattedResults);

  } catch (error) {
    console.error('❌ Search error:', error);
    return NextResponse.json(
      { error: `Search failed: ${error.message}` },
      { status: 500 }
    );
  }
}
