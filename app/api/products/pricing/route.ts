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
    const productId = searchParams.get('product_id');
    const clientId = searchParams.get('client_id');

    if (!productId) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    const userId = parseInt(session.user.id);

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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = parseInt(session.user.id);
    const data = await request.json();
    const { product_id, cost_price, margin_percent, sale_price } = data;

    if (!product_id || (!cost_price && !sale_price)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let finalCostPrice = parseFloat(cost_price) || 0;
    let finalSalePrice = parseFloat(sale_price) || 0;
    let finalMargin = parseFloat(margin_percent) || 0;

    if (finalCostPrice && finalMargin && !finalSalePrice) {
      finalSalePrice = finalCostPrice * (1 + finalMargin / 100);
    } else if (finalCostPrice && finalSalePrice && !finalMargin) {
      finalMargin = ((finalSalePrice - finalCostPrice) / finalCostPrice) * 100;
    } else if (finalSalePrice && finalMargin && !finalCostPrice) {
      finalCostPrice = finalSalePrice / (1 + finalMargin / 100);
    }

    await db.query(`
      INSERT INTO product_prices (product_id, price, price_type, cost_price, sale_price, margin_percent, used_by)
      VALUES ($1, $2, 'cost', $3, $4, $5, $6)
    `, [product_id, finalCostPrice, finalCostPrice, finalSalePrice, finalMargin, userId]);

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
