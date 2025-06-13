// app/api/clients/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { db } from '../../../../lib/db';

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

    const userId = parseInt(session.user.id);
    const clientId = parseInt(params.id);

    const result = await db.query(`
      SELECT * FROM clients 
      WHERE id = $1 AND created_by = $2
    `, [clientId, userId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Klient nie został znaleziony' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);

  } catch (error) {
    console.error('Get client error:', error);
    return NextResponse.json(
      { error: 'Błąd pobierania klienta' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = parseInt(session.user.id);
    const clientId = parseInt(params.id);
    const data = await request.json();

    // Sprawdź czy klient należy do użytkownika
    const clientCheck = await db.query(
      'SELECT id FROM clients WHERE id = $1 AND created_by = $2',
      [clientId, userId]
    );

    if (clientCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
    }

    // Zaktualizuj klienta
    const result = await db.query(`
      UPDATE clients SET 
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        address = COALESCE($4, address),
        nip = COALESCE($5, nip),
        contact_person = COALESCE($6, contact_person),
        notes = COALESCE($7, notes),
        last_used = COALESCE($8, last_used)
      WHERE id = $9 AND created_by = $10
      RETURNING *
    `, [
      data.name || null,
      data.email || null,
      data.phone || null,
      data.address || null,
      data.nip || null,
      data.contact_person || null,
      data.notes || null,
      data.last_used || null,
      clientId,
      userId
    ]);

    return NextResponse.json({
      success: true,
      client: result.rows[0],
      message: 'Klient został zaktualizowany'
    });

  } catch (error) {
    console.error('Update client error:', error);
    return NextResponse.json(
      { error: 'Błąd podczas aktualizacji klienta' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = parseInt(session.user.id);
    const clientId = parseInt(params.id);

    // Sprawdź czy klient należy do użytkownika
    const clientCheck = await db.query(
      'SELECT id FROM clients WHERE id = $1 AND created_by = $2',
      [clientId, userId]
    );

    if (clientCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
    }

    // Usuń klienta
    await db.query('DELETE FROM clients WHERE id = $1', [clientId]);

    return NextResponse.json({
      success: true,
      message: 'Klient został usunięty'
    });

  } catch (error) {
    console.error('Delete client error:', error);
    return NextResponse.json(
      { error: 'Błąd podczas usuwania klienta' },
      { status: 500 }
    );
  }
}