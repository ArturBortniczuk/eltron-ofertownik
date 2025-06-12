import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { db } from '../../../lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = parseInt(session.user.id);
    const data = await request.json();

    // Rozpocznij transakcję
    const client = await db.connect();
    
    try {
      await client.query('BEGIN');

      // Utwórz ofertę
      const offerResult = await client.query(`
        INSERT INTO offers (
          user_id, client_name, client_email, client_phone,
          delivery_days, valid_days, additional_costs, additional_costs_description,
          notes, total_net, total_vat, total_gross, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `, [
        userId,
        data.client_name,
        data.client_email || null,
        data.client_phone || null,
        data.delivery_days,
        data.valid_days,
        data.additional_costs,
        data.additional_costs_description || null,
        data.notes || null,
        data.total_net,
        data.total_vat,
        data.total_gross,
        data.status
      ]);

      const offerId = offerResult.rows[0].id;

      // Dodaj pozycje oferty
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        
        // Sprawdź czy produkt już istnieje w bazie
        let productId = null;
        const existingProduct = await client.query(
          'SELECT id FROM products WHERE name = $1 AND unit = $2',
          [item.product_name, item.unit]
        );

        if (existingProduct.rows.length > 0) {
          productId = existingProduct.rows[0].id;
          
          // Zaktualizuj last_used
          await client.query(
            'UPDATE products SET last_used = CURRENT_TIMESTAMP WHERE id = $1',
            [productId]
          );
        } else {
          // Utwórz nowy produkt
          const newProduct = await client.query(
            'INSERT INTO products (name, unit, created_by) VALUES ($1, $2, $3) RETURNING id',
            [item.product_name, item.unit, userId]
          );
          productId = newProduct.rows[0].id;
        }

        // Dodaj cenę do historii
        await client.query(
          'INSERT INTO product_prices (product_id, price, used_by) VALUES ($1, $2, $3)',
          [productId, item.unit_price, userId]
        );

        // Dodaj pozycję oferty
        await client.query(`
          INSERT INTO offer_items (
            offer_id, product_id, product_name, quantity, unit,
            unit_price, vat_rate, net_amount, vat_amount, gross_amount, position_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          offerId,
          productId,
          item.product_name,
          item.quantity,
          item.unit,
          item.unit_price,
          item.vat_rate,
          item.net_amount,
          item.vat_amount,
          item.gross_amount,
          i + 1
        ]);
      }

      await client.query('COMMIT');

      return NextResponse.json({ 
        success: true, 
        offerId,
        message: 'Oferta została zapisana pomyślnie' 
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Create offer error:', error);
    return NextResponse.json(
      { error: 'Błąd podczas tworzenia oferty' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = parseInt(session.user.id);
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = $1';
    const params: any[] = [userId];


    if (status) {
      whereClause += ' AND status = $2';
      params.push(status);
    }

    // Pobierz oferty z paginacją
    const result = await db.query(`
      SELECT 
        id, client_name, client_email, client_phone,
        delivery_days, valid_days, total_gross, status, created_at
      FROM offers
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    // Pobierz łączną liczbę ofert
    const countResult = await db.query(`
      SELECT COUNT(*) as count FROM offers ${whereClause}
    `, params);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      offers: result.rows,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get offers error:', error);
    return NextResponse.json(
      { error: 'Błąd pobierania ofert' },
      { status: 500 }
    );
  }
}
