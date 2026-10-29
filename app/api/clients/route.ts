// app/api/clients/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { getApiUser, unauthorized, badRequest, serverError } from '../../../lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    // Handlowiec widzi swoich klientów, zarząd i centrum elektryczne - wszystkich
    const params: any[] = [];
    const where: string[] = [];
    if (!user.canViewAll) {
      params.push(user.id);
      where.push(`c.created_by = $${params.length}`);
    }
    if (search && search.length >= 2) {
      params.push(`%${search}%`);
      where.push(`(c.name ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.contact_person ILIKE $${params.length} OR c.nip ILIKE $${params.length})`);
    }

    const result = await db.query(
      `SELECT c.id, c.name, c.email, c.phone, c.address, c.nip, c.contact_person, c.notes,
              c.created_at, c.last_used, c.created_by, u.name AS owner_name,
              COALESCE(s.offers_count, 0) AS offers_count,
              COALESCE(s.won_value, 0) AS won_value,
              COALESCE(s.open_value, 0) AS open_value,
              s.last_offer_at
       FROM clients c
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN (
         SELECT client_id,
                COUNT(*) AS offers_count,
                SUM(CASE WHEN status = 'accepted' THEN total_gross ELSE 0 END) AS won_value,
                SUM(CASE WHEN status = 'sent' THEN total_gross ELSE 0 END) AS open_value,
                MAX(created_at) AS last_offer_at
         FROM offers GROUP BY client_id
       ) s ON s.client_id = c.id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY c.last_used DESC, c.name ASC`,
      params
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    return serverError('Get clients error:', error, 'Błąd pobierania klientów');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const data = await request.json();
    if (!data.name?.trim()) return badRequest('Nazwa klienta jest wymagana');

    const result = await db.query(
      `INSERT INTO clients (name, email, phone, address, nip, contact_person, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        data.name.trim(),
        data.email?.trim() || null,
        data.phone?.trim() || null,
        data.address?.trim() || null,
        data.nip?.trim() || null,
        data.contact_person?.trim() || null,
        data.notes?.trim() || null,
        user.id,
      ]
    );

    return NextResponse.json({ success: true, client: result.rows[0], message: 'Klient został dodany pomyślnie' });
  } catch (error) {
    return serverError('Create client error:', error, 'Błąd podczas dodawania klienta');
  }
}
