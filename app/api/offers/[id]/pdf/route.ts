import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = parseInt(session.user.id);
    const offerId = parseInt(params.id);

    const offerResult = await db.query(`
      SELECT 
        o.*, u.name as created_by_name, u.email as created_by_email,
        c.nip as client_nip, c.address as client_address
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

    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Regular.ttf');
    const fontBoldPath = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Bold.ttf');

    // Debug font existence
    console.log('Roboto-Regular.ttf exists:', fs.existsSync(fontPath));
    console.log('Roboto-Bold.ttf exists:', fs.existsSync(fontBoldPath));

    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
      info: {
        Title: `Oferta ${offerId} - ${offer.client_name}`,
        Author: 'Grupa Eltron',
        Subject: 'Oferta handlowa',
        Creator: 'Ofertownik Eltron'
      }
    });

    // Rejestruj i ustaw font od razu
    doc.registerFont('Roboto', fontPath);
    doc.registerFont('RobotoBold', fontBoldPath);
    doc.font('Roboto');

    // Przykładowa zawartość
    doc.fontSize(20).font('RobotoBold').text(`Oferta #${offerId}`, 50, 50);
    doc.fontSize(12).font('Roboto').text(`Dla: ${offer.client_name || 'Nieznany klient'}`, 50, 90);

    // Prosty test polskich znaków
    doc.text('Zażółć gęślą jaźń. Łódź, Śląsk, Białystok.');

    // Tabela z pozycjami (bardzo uproszczona)
    let y = 150;
    items.forEach((item: any, index: number) => {
      doc.text(`${index + 1}. ${item.product_name} - ${item.quantity} x ${item.unit_price} zł`, 50, y);
      y += 20;
    });

    // Bufor PDF
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', (err) => { throw err; });
    doc.end();

    await new Promise<void>((resolve) => doc.on('end', resolve));

    const pdfBuffer = Buffer.concat(chunks);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Oferta_${offerId}.pdf"`,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('PDF generation error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: `Błąd generowania PDF: ${error instanceof Error ? error.message : 'Nieznany błąd'}` },
      { status: 500 }
    );
  }
}
