// app/api/clients/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { db } from '../../../lib/db';

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
        id, name, email, phone, address, nip, contact_person, notes,
        created_at, last_used
      FROM clients 
      WHERE created_by = $1
    `;
    const params: any[] = [userId];

    if (search && search.length >= 2) {
      query += ` AND (name ILIKE $2 OR email ILIKE $2 OR contact_person ILIKE $2)`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY last_used DESC, name ASC`;

    const result = await db.query(query, params);

    return NextResponse.json(result.rows);

  } catch (error) {
    console.error('Get clients error:', error);
    return NextResponse.json(
      { error: 'Błąd pobierania klientów' },
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

    // Walidacja
    if (!data.name?.trim()) {
      return NextResponse.json(
        { error: 'Nazwa klienta jest wymagana' },
        { status: 400 }
      );
    }

    const result = await db.query(`
      INSERT INTO clients (
        name, email, phone, address, nip, contact_person, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      data.name.trim(),
      data.email?.trim() || null,
      data.phone?.trim() || null,
      data.address?.trim() || null,
      data.nip?.trim() || null,
      data.contact_person?.trim() || null,
      data.notes?.trim() || null,
      userId
    ]);

    return NextResponse.json({
      success: true,
      client: result.rows[0],
      message: 'Klient został dodany pomyślnie'
    });

  } catch (error) {
    console.error('Create client error:', error);
    return NextResponse.json(
      { error: 'Błąd podczas dodawania klienta' },
      { status: 500 }
    );
  }
}
