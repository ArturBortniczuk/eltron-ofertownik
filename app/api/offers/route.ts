// app/api/offers/route.ts - ROZSZERZONA WERSJA Z MARŻAMI
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { db } from '../../../lib/db';

export const dynamic = 'force-dynamic';

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
          user_id, client_id, client_name, client_email, client_phone,
          delivery_days, valid_days, additional_costs, additional_costs_description,
          notes, total_net, total_vat, total_gross, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `, [
        userId,
        data.client_id || null,
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

      // Aktualizuj last_used klienta jeśli jest przypisany
      if (data.client_id) {
        await client.query(
          'UPDATE clients SET last_used = CURRENT_TIMESTAMP WHERE id = $1 AND created_by = $2',
          [data.client_id, userId]
        );
      }

      // Dodaj pozycje oferty z danymi marży
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

        // Dodaj cenę do historii (teraz z informacjami o marży)
        await client.query(`
          INSERT INTO product_prices (
            product_id, price, cost_price, sale_price, margin_percent, used_by
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          productId, 
          item.unit_price,
          item.cost_price || 0,
          item.unit_price,
          item.margin_percent || 0,
          userId
        ]);

        // Zaktualizuj marże produktu jeśli mamy dane kosztowe
        if (item.cost_price > 0 && item.margin_percent > 0) {
          await client.query(`
            INSERT INTO product_margins (
              product_id, user_id, cost_price, margin_percent, 
              min_margin_percent, max_discount_percent
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (product_id, user_id) 
            DO UPDATE SET 
              cost_price = $3,
              margin_percent = $4,
              updated_at = CURRENT_TIMESTAMP
          `, [
            productId,
            userId,
            item.cost_price,
            item.margin_percent,
            10, // domyślna minimalna marża
            15  // domyślny maksymalny rabat
          ]);
        }

        // Dodaj pozycję oferty z rozszerzonymi danymi
        await client.query(`
          INSERT INTO offer_items (
            offer_id, product_id, product_name, quantity, unit,
            unit_price, vat_rate, net_amount, vat_amount, gross_amount, 
            position_order, cost_price, margin_percent, discount_percent, original_price
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
          i + 1,
          item.cost_price || 0,
          item.margin_percent || 0,
          item.discount_percent || 0,
          item.original_price || item.unit_price
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
    const userRole = (session.user as any)?.role;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');
    const clientId = searchParams.get('client_id');
    const offset = (page - 1) * limit;

    // Sprawdź czy użytkownik może widzieć wszystkie oferty
    const canViewAll = ['zarząd', 'centrum elektryczne'].includes(userRole);

    let whereClause = canViewAll ? 'WHERE 1=1' : 'WHERE o.user_id = $1';
    const params: any[] = canViewAll ? [] : [userId];

    if (status) {
      whereClause += ` AND o.status = $${params.length + 1}`;
      params.push(status);
    }

    if (clientId) {
      whereClause += ` AND o.client_id = $${params.length + 1}`;
      params.push(parseInt(clientId));
    }

    // Pobierz oferty z paginacją (z dodatkowymi danymi marży dla zarządu)
    const offerQuery = canViewAll ? `
      SELECT 
        o.id, o.client_name, o.client_email, o.client_phone,
        o.delivery_days, o.valid_days, o.total_gross, o.status, o.created_at,
        c.name as client_name_from_table,
        u.name as salesperson_name,
        COALESCE(om.total_cost, 0) as total_cost,
        COALESCE(om.total_margin, 0) as total_margin,
        COALESCE(om.margin_percent, 0) as margin_percent
      FROM offers o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN offer_margin_summary om ON o.id = om.offer_id
    ` : `
      SELECT 
        o.id, o.client_name, o.client_email, o.client_phone,
        o.delivery_days, o.valid_days, o.total_gross, o.status, o.created_at,
        c.name as client_name_from_table
      FROM offers o
      LEFT JOIN clients c ON o.client_id = c.id
    `;

    const result = await db.query(`
      ${offerQuery}
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    // Pobierz łączną liczbę ofert
    const countResult = await db.query(`
      SELECT COUNT(*) as count 
      FROM offers o
      LEFT JOIN clients c ON o.client_id = c.id
      ${whereClause}
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
