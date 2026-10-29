import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { getApiUser, unauthorized, badRequest, notFound, serverError } from '../../../../lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const productId = parseInt(searchParams.get('product_id') || '', 10);
    const clientIdRaw = parseInt(searchParams.get('client_id') || '', 10);
    const clientId = Number.isInteger(clientIdRaw) ? clientIdRaw : null;

    if (!Number.isInteger(productId)) return badRequest('Product ID required');

    const pricingData = await db.query(
      `SELECT p.id, p.name, p.unit,
              COALESCE(pm.cost_price, cp.cost_price, 0) AS cost_price,
              pm.margin_percent, pm.min_margin_percent, pm.max_discount_percent,
              COALESCE(cd.discount_percent, 0) AS client_discount
       FROM products p
       LEFT JOIN product_margins pm ON pm.product_id = p.id AND pm.user_id = $2
       LEFT JOIN LATERAL (
         SELECT cost_price FROM product_prices
         WHERE product_id = p.id AND price_type = 'cost' AND cost_price > 0 ORDER BY used_at DESC LIMIT 1
       ) cp ON true
       LEFT JOIN client_discounts cd ON cd.product_id = p.id AND cd.client_id = $3
         AND (cd.valid_from IS NULL OR cd.valid_from <= CURRENT_DATE)
         AND (cd.valid_until IS NULL OR cd.valid_until >= CURRENT_DATE)
       WHERE p.id = $1`,
      [productId, user.id, clientId]
    );

    if (pricingData.rows.length === 0) return notFound('Product not found');

    const product = pricingData.rows[0];
    const costPrice = Number(product.cost_price) || 0;
    const marginPercent = Number(product.margin_percent) || 25;
    const clientDiscount = Number(product.client_discount) || 0;

    const basePrice = costPrice * (1 + marginPercent / 100);
    const finalPrice = basePrice * (1 - clientDiscount / 100);
    const finalMargin = costPrice > 0 ? ((finalPrice - costPrice) / costPrice) * 100 : 0;

    return NextResponse.json({
      product: {
        ...product,
        cost_price: costPrice,
        base_price: Math.round(basePrice * 100) / 100,
        final_price: Math.round(finalPrice * 100) / 100,
        client_discount: clientDiscount,
        final_margin: Math.round(finalMargin * 100) / 100,
        min_margin: Number(product.min_margin_percent) || 10,
        max_discount: Number(product.max_discount_percent) || 15,
      },
    });
  } catch (error) {
    return serverError('Pricing API error:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const { product_id, cost_price, margin_percent, sale_price } = await request.json();

    if (!product_id || (!cost_price && !sale_price)) return badRequest('Missing required fields');

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

    await db.query(
      `INSERT INTO product_prices (product_id, price, price_type, cost_price, sale_price, margin_percent, used_by)
       VALUES ($1, $2, 'cost', $3, $4, $5, $6)`,
      [product_id, finalCostPrice, finalCostPrice, finalSalePrice, finalMargin, user.id]
    );

    await db.query(
      `INSERT INTO product_margins (product_id, user_id, cost_price, margin_percent)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id, user_id) DO UPDATE SET
         cost_price = $3, margin_percent = $4, updated_at = CURRENT_TIMESTAMP`,
      [product_id, user.id, finalCostPrice, finalMargin]
    );

    return NextResponse.json({
      success: true,
      pricing: { cost_price: finalCostPrice, sale_price: finalSalePrice, margin_percent: finalMargin },
    });
  } catch (error) {
    return serverError('Save pricing error:', error);
  }
}
