// app/api/products/search/route.ts - NAJPROSTSZA MOŻLIWA WERSJA
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

    console.log('🔍 Search query:', query);

    if (!query || query.length < 2) {
      console.log('❌ Query too short or empty');
      return NextResponse.json([]);
    }

    // NAJPROSTSZE MOŻLIWE ZAPYTANIE - bez JOINów
    const result = await db.query(`
      SELECT DISTINCT
        product_name as name,
        unit,
        unit_price as last_price
      FROM offer_items
      WHERE LOWER(product_name) LIKE LOWER($1)
      ORDER BY product_name
      LIMIT 10
    `, [`%${query}%`]);

    console.log('📋 Found rows:', result.rows.length);

    // Bardzo proste formatowanie wyników
    const suggestions = result.rows.map(row => ({
      name: row.name,
      unit: row.unit,
      last_price: parseFloat(row.last_price) || 0,
      last_used_at: new Date().toISOString(),
      last_used_by: 'System',
      usage_count: 1,
      avg_price: parseFloat(row.last_price) || 0,
      min_price: parseFloat(row.last_price) || 0,
      max_price: parseFloat(row.last_price) || 0
    }));

    console.log('✅ Returning suggestions:', suggestions.length);
    return NextResponse.json(suggestions);

  } catch (error) {
    console.error('❌ Search error:', error);
    return NextResponse.json(
      { error: 'Błąd wyszukiwania produktów' },
      { status: 500 }
    );
  }
}
