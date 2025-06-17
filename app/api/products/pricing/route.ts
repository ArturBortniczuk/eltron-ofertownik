// app/api/products/pricing/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { db } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

// GET - Pobierz dane cenowe produktu
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');
    const clientId = searchParams.get('client_id');

    if (!productId) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    const userId = parseInt(session.user.id);

    // Pobierz dane cenowe produktu
    const pricingData = await db.query(`
      SELECT 
        p.id,
        p.name,
        p.unit,
        pp.cost_price,
        pp.sale_price,
        pm.margin_percent,
        pm.min_margin_percent,
        pm.max_discount_percent,
        COALESCE(cd.discount_percent, 0) as client_discount
      FROM products p
      LEFT JOIN product_prices pp ON p.id = pp.product_id AND pp.price_type = 'cost'
      LEFT JOIN product_margins pm ON p.id = pm.product_id AND pm.user_id = $2
      LEFT JOIN client_discounts cd ON p.id = cd.product_id AND cd.client_id = $3
        AND cd.valid_from <= CURRENT_DATE 
        AND (cd.valid_until IS NULL OR cd.valid_until >= CURRENT_DATE)
      WHERE p.id = $1
      ORDER BY pp.used_at DESC
      LIMIT 1
    `, [productId, userId, clientId || null]);

    if (pricingData.rows.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const product = pricingData.rows[0];
    
    // Oblicz ceny finalne
    const costPrice = parseFloat(product.cost_price) || 0;
    const marginPercent = parseFloat(product.margin_percent) || 25;
    const clientDiscount = parseFloat(product.client_discount) || 0;
    
    const basePrice = costPrice * (1 + marginPercent / 100);
    const finalPrice = basePrice * (1 - clientDiscount / 100);
    const finalMargin = ((finalPrice - costPrice) / costPrice) * 100;

    return NextResponse.json({
      product: {
        ...product,
        cost_price: costPrice,
        base_price: Math.round(basePrice * 100) / 100,
        final_price: Math.round(finalPrice * 100) / 100,
        client_discount: clientDiscount,
        final_margin: Math.round(finalMargin * 100) / 100,
        min_margin: parseFloat(product.min_margin_percent) || 10,
        max_discount: parseFloat(product.max_discount_percent) || 15
      }
    });

  } catch (error) {
    console.error('Pricing API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Zapisz nową cenę z marżą
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = parseInt(session.user.id);
    const data = await request.json();
    const { product_id, cost_price, margin_percent, sale_price } = data;

    // Walidacja
    if (!product_id || (!cost_price && !sale_price)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let finalCostPrice = parseFloat(cost_price) || 0;
    let finalSalePrice = parseFloat(sale_price) || 0;
    let finalMargin = parseFloat(margin_percent) || 0;

    // Oblicz brakujące wartości
    if (finalCostPrice && finalMargin && !finalSalePrice) {
      finalSalePrice = finalCostPrice * (1 + finalMargin / 100);
    } else if (finalCostPrice && finalSalePrice && !finalMargin) {
      finalMargin = ((finalSalePrice - finalCostPrice) / finalCostPrice) * 100;
    } else if (finalSalePrice && finalMargin && !finalCostPrice) {
      finalCostPrice = finalSalePrice / (1 + finalMargin / 100);
    }

    // Zapisz cenę kosztową
    await db.query(`
      INSERT INTO product_prices (product_id, price, price_type, cost_price, sale_price, margin_percent, used_by)
      VALUES ($1, $2, 'cost', $3, $4, $5, $6)
    `, [product_id, finalCostPrice, finalCostPrice, finalSalePrice, finalMargin, userId]);

    // Zapisz/aktualizuj marżę
    await db.query(`
      INSERT INTO product_margins (product_id, user_id, margin_percent)
      VALUES ($1, $2, $3)
      ON CONFLICT (product_id, user_id) 
      DO UPDATE SET 
        margin_percent = $3,
        updated_at = CURRENT_TIMESTAMP
    `, [product_id, userId, finalMargin]);

    return NextResponse.json({ 
      success: true,
      pricing: {
        cost_price: finalCostPrice,
        sale_price: finalSalePrice,
        margin_percent: finalMargin
      }
    });

  } catch (error) {
    console.error('Save pricing error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// app/api/clients/[id]/discounts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

// GET - Pobierz rabaty klienta
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = parseInt(params.id);
    const userId = parseInt(session.user.id);

    const discounts = await db.query(`
      SELECT 
        cd.*,
        p.name as product_name,
        p.unit
      FROM client_discounts cd
      JOIN products p ON cd.product_id = p.id
      WHERE cd.client_id = $1 AND cd.created_by = $2
      ORDER BY cd.created_at DESC
    `, [clientId, userId]);

    return NextResponse.json(discounts.rows);

  } catch (error) {
    console.error('Get client discounts error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Ustaw rabat dla klienta
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = parseInt(params.id);
    const userId = parseInt(session.user.id);
    const data = await request.json();

    const { product_id, discount_percent, valid_until, notes } = data;

    if (!product_id || discount_percent === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Sprawdź maksymalny dozwolony rabat
    const maxDiscount = await db.query(`
      SELECT max_discount_percent 
      FROM product_margins 
      WHERE product_id = $1 AND user_id = $2
    `, [product_id, userId]);

    const maxDiscountPercent = maxDiscount.rows[0]?.max_discount_percent || 15;

    if (parseFloat(discount_percent) > maxDiscountPercent) {
      return NextResponse.json({ 
        error: `Maksymalny rabat wynosi ${maxDiscountPercent}%` 
      }, { status: 400 });
    }

    // Upsert rabatu
    await db.query(`
      INSERT INTO client_discounts (client_id, product_id, discount_percent, valid_until, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (client_id, product_id) 
      DO UPDATE SET 
        discount_percent = $3,
        valid_until = $4,
        notes = $5,
        created_at = CURRENT_TIMESTAMP
    `, [clientId, product_id, discount_percent, valid_until || null, notes || null, userId]);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Set client discount error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// app/api/reports/margins/route.ts
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
    const period = searchParams.get('period') || '30'; // dni
    const userId = parseInt(session.user.id);
    const canViewAll = canAccessAllData(session);

    // Raport marż i rabatów
    const marginReport = await db.query(`
      SELECT 
        DATE_TRUNC('month', o.created_at) as month,
        COUNT(o.id) as offers_count,
        SUM(oi.quantity * oi.cost_price) as total_cost,
        SUM(oi.quantity * oi.unit_price) as total_sale,
        SUM(oi.quantity * (oi.unit_price - oi.cost_price)) as total_margin,
        AVG(oi.margin_percent) as avg_margin_percent,
        SUM(oi.quantity * oi.original_price * oi.discount_percent / 100) as total_discount,
        AVG(oi.discount_percent) as avg_discount_percent
      FROM offers o
      JOIN offer_items oi ON o.id = oi.offer_id
      WHERE o.created_at >= CURRENT_DATE - INTERVAL '${period} days'
        ${canViewAll ? '' : 'AND o.user_id = $1'}
        AND o.status != 'draft'
      GROUP BY DATE_TRUNC('month', o.created_at)
      ORDER BY month DESC
    `, canViewAll ? [] : [userId]);

    // Top produkty z najwyższą marżą
    const topMarginProducts = await db.query(`
      SELECT 
        p.name,
        AVG(oi.margin_percent) as avg_margin,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.gross_amount) as total_value
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