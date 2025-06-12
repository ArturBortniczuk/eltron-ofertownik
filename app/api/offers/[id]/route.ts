import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { db } from '../../../../lib/db';

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
    const offerId = parseInt(params.id);

    // Pobierz ofertę
    const offerResult = await db.query(`
      SELECT 
        o.*,
        u.name as created_by_name,
        u.email as created_by_email
      FROM offers o
      JOIN users u ON o.user_id = u.id
      WHERE o.id = $1 AND o.user_id = $2
    `, [offerId, userId]);

    if (offerResult.rows.length === 0) {
      return NextResponse.json({ error: 'Oferta nie została znaleziona' }, { status: 404 });
    }

    const offer = offerResult.rows[0];

    // Pobierz pozycje oferty
    const itemsResult = await db.query(`
      SELECT * FROM offer_items
      WHERE offer_id = $1
      ORDER BY position_order
    `, [offerId]);

    return NextResponse.json({
      offer,
      items: itemsResult.rows
    });

  } catch (error) {
    console.error('Get offer error:', error);
    return NextResponse.json(
      { error: 'Błąd pobierania oferty' },
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
    const offerId = parseInt(params.id);
    const data = await request.json();

    // Sprawdź czy oferta należy do użytkownika
    const offerCheck = await db.query(
      'SELECT id FROM offers WHERE id = $1 AND user_id = $2',
      [offerId, userId]
    );

    if (offerCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
    }

    // Zaktualizuj status oferty
    await db.query(
      'UPDATE offers SET status = $1 WHERE id = $2',
      [data.status, offerId]
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Update offer error:', error);
    return NextResponse.json(
      { error: 'Błąd aktualizacji oferty' },
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
    const offerId = parseInt(params.id);

    // Sprawdź czy oferta należy do użytkownika
    const offerCheck = await db.query(
      'SELECT id FROM offers WHERE id = $1 AND user_id = $2',
      [offerId, userId]
    );

    if (offerCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 });
    }

    // Usuń ofertę (pozycje usuną się automatycznie przez CASCADE)
    await db.query('DELETE FROM offers WHERE id = $1', [offerId]);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Delete offer error:', error);
    return NextResponse.json(
      { error: 'Błąd usuwania oferty' },
      { status: 500 }
    );
  }
}