// app/api/products/pricing/list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = parseInt(session.user.id);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    let query = `
      SELECT 
        p.id,
        p.name,
        p.unit,
        COALESCE(pm.cost_price, 0) as cost_price,
        COALESCE(pm.margin_percent, 25) as margin_percent,
        COALESCE(pm.min_margin_percent, 10) as min_margin,
        COALESCE(pm.max_discount_percent, 15) as max_discount,
        CASE 
          WHEN pm.cost_price > 0 AND pm.margin_percent > 0 
          THEN pm.cost_price * (1 + pm.margin_percent / 100)
          ELSE 0
        END as base_price,
        p.last_used,
        pm.updated_at as pricing_updated
      FROM products p
      LEFT JOIN product_margins pm ON p.id = pm.product_id AND pm.user_id = $1
    `;
    
    const params: any[] = [userId];

    if (search && search.length >= 2) {
      query += ` WHERE p.name ILIKE $2`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY p.last_used DESC, p.name ASC LIMIT 100`;

    const result = await db.query(query, params);

    const products = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      unit: row.unit,
      cost_price: parseFloat(row.cost_price) || 0,
      margin_percent: parseFloat(row.margin_percent) || 25,
      min_margin: parseFloat(row.min_margin) || 10,
      max_discount: parseFloat(row.max_discount) || 15,
      base_price: parseFloat(row.base_price) || 0,
      last_used: row.last_used,
      pricing_updated: row.pricing_updated
    }));

    return NextResponse.json(products);

  } catch (error) {
    console.error('Get product pricing list error:', error);
    return NextResponse.json(
      { error: 'Błąd pobierania listy cen produktów' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = parseInt(session.user.id);
    const data = await request.json();
    const { 
      product_id, 
      cost_price, 
      margin_percent, 
      min_margin_percent, 
      max_discount_percent 
    } = data;

    if (!product_id || cost_price === undefined || margin_percent === undefined) {
      return NextResponse.json(
        { error: 'Brak wymaganych pól' },
        { status: 400 }
      );
    }

    // Sprawdź czy produkt istnieje
    const productCheck = await db.query(
      'SELECT id FROM products WHERE id = $1',
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Produkt nie istnieje' },
        { status: 404 }
      );
    }

    // Zaktualizuj lub wstaw marże produktu
    await db.query(`
      INSERT INTO product_margins (
        product_id, user_id, cost_price, margin_percent, 
        min_margin_percent, max_discount_percent, updated_at
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (product_id, user_id) 
      DO UPDATE SET 
        cost_price = $3,
        margin_percent = $4,
        min_margin_percent = $5,
        max_discount_percent = $6,
        updated_at = CURRENT_TIMESTAMP
    `, [
      product_id, 
      userId, 
      cost_price, 
      margin_percent,
      min_margin_percent || 10,
      max_discount_percent || 15
    ]);

    // Dodaj do historii cen
    await db.query(`
      INSERT INTO product_prices (product_id, price, used_by)
      VALUES ($1, $2, $3)
    `, [product_id, cost_price, userId]);

    const basePrice = cost_price * (1 + margin_percent / 100);

    return NextResponse.json({
      success: true,
      message: 'Ceny zostały zaktualizowane',
      pricing: {
        cost_price: parseFloat(cost_price),
        margin_percent: parseFloat(margin_percent),
        base_price: Math.round(basePrice * 100) / 100
      }
    });

  } catch (error) {
    console.error('Update product pricing error:', error);
    return NextResponse.json(
      { error: 'Błąd podczas aktualizacji cen' },
      { status: 500 }
    );
  }
}