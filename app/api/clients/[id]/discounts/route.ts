import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

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