// app/api/offers/[id]/pdf/route.ts - ZMIEŃ NA ZWYKŁE API
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

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

    // Pobierz ofertę z pozycjami
    const offerResult = await db.query(`
      SELECT 
        o.*,
        u.name as created_by_name,
        u.email as created_by_email,
        c.nip as client_nip
      FROM offers o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.id = $1 AND o.user_id = $2
    `, [offerId, userId]);

    if (offerResult.rows.length === 0) {
      return NextResponse.json({ error: 'Oferta nie została znaleziona' }, { status: 404 });
    }

    const offer = offerResult.rows[0];
    const itemsResult = await db.query(`
      SELECT * FROM offer_items
      WHERE offer_id = $1
      ORDER BY position_order
    `, [offerId]);
    const items = itemsResult.rows;

    // Zwróć dane JSON zamiast PDF - frontend wygeneruje PDF
    return NextResponse.json({
      offer,
      items,
      meta: {
        offerDate: new Date(offer.created_at).toLocaleDateString('pl-PL'),
        validUntil: new Date(Date.now() + (offer.valid_days * 24 * 60 * 60 * 1000)).toLocaleDateString('pl-PL'),
        deliveryDays: parseInt(offer.delivery_days) || 0,
        totalNet: parseFloat(offer.total_net) || 0,
        totalVat: parseFloat(offer.total_vat) || 0,
        totalGross: parseFloat(offer.total_gross) || 0,
        additionalCosts: parseFloat(offer.additional_costs) || 0
      }
    });

  } catch (error) {
    console.error('PDF data error:', error);
    return NextResponse.json(
      { error: 'Błąd pobierania danych PDF' },
      { status: 500 }
    );
  }
}
