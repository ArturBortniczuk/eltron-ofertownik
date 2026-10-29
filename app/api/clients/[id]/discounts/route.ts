import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';
import { getApiUser, unauthorized, forbidden, notFound, badRequest, serverError } from '../../../../../lib/api-auth';

export const dynamic = 'force-dynamic';

async function clientAccess(clientId: number, user: { id: number; canViewAll: boolean }) {
  const r = await db.query('SELECT created_by FROM clients WHERE id = $1', [clientId]);
  if (!r.rows[0]) return 'missing' as const;
  return user.canViewAll || r.rows[0].created_by === user.id ? ('ok' as const) : ('denied' as const);
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const clientId = parseInt(params.id, 10);
    if (!Number.isInteger(clientId)) return badRequest('Nieprawidłowy ID klienta');

    const access = await clientAccess(clientId, user);
    if (access === 'missing') return notFound('Klient nie został znaleziony');
    if (access === 'denied') return forbidden();

    const discounts = await db.query(
      `SELECT cd.*, p.name AS product_name, p.unit
       FROM client_discounts cd JOIN products p ON cd.product_id = p.id
       WHERE cd.client_id = $1 ORDER BY cd.created_at DESC`,
      [clientId]
    );
    return NextResponse.json(discounts.rows);
  } catch (error) {
    return serverError('Get client discounts error:', error);
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const clientId = parseInt(params.id, 10);
    if (!Number.isInteger(clientId)) return badRequest('Nieprawidłowy ID klienta');

    const access = await clientAccess(clientId, user);
    if (access === 'missing') return notFound('Klient nie został znaleziony');
    if (access === 'denied') return forbidden();

    const { product_id, discount_percent, valid_until, notes } = await request.json();
    const discount = parseFloat(discount_percent);
    if (!product_id || !Number.isFinite(discount) || discount < 0 || discount > 100) {
      return badRequest('Podaj produkt i rabat w zakresie 0-100%');
    }

    const maxRow = await db.query(
      'SELECT max_discount_percent FROM product_margins WHERE product_id = $1 AND user_id = $2',
      [product_id, user.id]
    );
    const maxDiscount = maxRow.rows[0]?.max_discount_percent ?? 15;
    if (discount > maxDiscount && !user.isManagement) {
      return badRequest(`Maksymalny rabat dla tego produktu wynosi ${maxDiscount}% (więcej może ustawić zarząd)`);
    }

    await db.query(
      `INSERT INTO client_discounts (client_id, product_id, discount_percent, valid_until, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (client_id, product_id) DO UPDATE SET
         discount_percent = $3, valid_until = $4, notes = $5, created_at = CURRENT_TIMESTAMP`,
      [clientId, product_id, discount, valid_until || null, notes || null, user.id]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError('Set client discount error:', error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const clientId = parseInt(params.id, 10);
    const productId = parseInt(new URL(request.url).searchParams.get('product_id') || '', 10);
    if (!Number.isInteger(clientId) || !Number.isInteger(productId)) return badRequest('Nieprawidłowe parametry');

    const access = await clientAccess(clientId, user);
    if (access === 'missing') return notFound('Klient nie został znaleziony');
    if (access === 'denied') return forbidden();

    await db.query('DELETE FROM client_discounts WHERE client_id = $1 AND product_id = $2', [clientId, productId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError('Delete client discount error:', error);
  }
}
