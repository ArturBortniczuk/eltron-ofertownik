import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import PDFDocument from 'pdfkit';
import path from 'path';

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

    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Regular.ttf');
    const fontBoldPath = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Bold.ttf');

    try {
      doc.registerFont('Roboto', fontPath);
      doc.registerFont('RobotoBold', fontBoldPath);
      doc.font('Roboto');
    } catch (fontError) {
      console.warn('Nie można załadować fontów, używam domyślnego:', fontError);
    }

    // --- Tu zaczyna się skład PDF-a (header, dane, tabela, itd.) ---
    doc.fontSize(20).font('RobotoBold').text('GRUPA ELTRON', 50, 50);
    doc.fontSize(10).font('Roboto').text('ul. Przykładowa 123, 00-000 Warszawa', 50, 75);
    doc.text('Tel: +48 123 456 789 | Email: kontakt@eltron.pl', 50, 90);
    doc.text('NIP: 123-456-78-90', 50, 105);

    const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
    const validUntil = new Date(
      new Date(offer.created_at).getTime() + (offer.valid_days * 86400000)
    ).toLocaleDateString('pl-PL');

    doc.fontSize(12)
      .text(`Data: ${offerDate}`, 400, 50)
      .text(`Oferta nr: ${offerId}`, 400, 65)
      .text(`Ważna do: ${validUntil}`, 400, 80);

    doc.moveTo(50, 130).lineTo(545, 130).stroke();

    doc.fontSize(16).font('RobotoBold').text(`OFERTA HANDLOWA`, 50, 150);

    // Dane klienta
    let yPos = 180;
    doc.fontSize(12).font('RobotoBold').text('ODBIORCA:', 50, yPos);
    yPos += 20;
    doc.font('Roboto').text(offer.client_name, 50, yPos);
    if (offer.client_address) yPos += 15, doc.text(offer.client_address, 50, yPos);
    if (offer.client_nip) yPos += 15, doc.text(`NIP: ${offer.client_nip}`, 50, yPos);
    if (offer.client_email) yPos += 15, doc.text(`Email: ${offer.client_email}`, 50, yPos);
    if (offer.client_phone) yPos += 15, doc.text(`Telefon: ${offer.client_phone}`, 50, yPos);

    yPos += 40;
    doc.font('RobotoBold').text('WARUNKI OFERTY:', 50, yPos);
    yPos += 20;
    doc.font('Roboto')
      .text(`• Termin dostawy: ${offer.delivery_days} dni roboczych`, 50, yPos)
      .text(`• Termin płatności: 30 dni od daty wystawienia faktury`, 50, yPos + 15)
      .text(`• Ceny zawierają VAT`, 50, yPos + 30);

    // Tabela
    yPos += 70;
    const tableTop = yPos;
    const itemCodeX = 50, descriptionX = 120, quantityX = 350, unitX = 400, priceX = 440, totalX = 500;

    doc.fontSize(10).font('RobotoBold');
    doc.text('Lp.', itemCodeX, tableTop)
      .text('Opis towaru/usługi', descriptionX, tableTop)
      .text('Ilość', quantityX, tableTop)
      .text('j.m.', unitX, tableTop)
      .text('Cena netto', priceX, tableTop)
      .text('Wartość', totalX, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

    let currentY = tableTop + 25;
    doc.font('Roboto').fontSize(9);

    items.forEach((item, index) => {
      if (currentY > 700) doc.addPage(), currentY = 50;
      doc.text((index + 1).toString(), itemCodeX, currentY)
        .text(item.product_name, descriptionX, currentY, { width: 220 })
        .text(parseFloat(item.quantity).toString(), quantityX, currentY)
        .text(item.unit, unitX, currentY)
        .text(`${parseFloat(item.unit_price).toFixed(2)} zł`, priceX, currentY)
        .text(`${parseFloat(item.net_amount).toFixed(2)} zł`, totalX, currentY);
      currentY += 20;
    });

    if (offer.additional_costs > 0) {
      const val = parseFloat(offer.additional_costs).toFixed(2);
      doc.text((items.length + 1).toString(), itemCodeX, currentY)
        .text(offer.additional_costs_description || 'Dodatkowe koszty', descriptionX, currentY)
        .text('1', quantityX, currentY)
        .text('usł', unitX, currentY)
        .text(`${val} zł`, priceX, currentY)
        .text(`${val} zł`, totalX, currentY);
      currentY += 20;
    }

    currentY += 10;
    doc.moveTo(350, currentY).lineTo(545, currentY).stroke();
    currentY += 20;

    doc.fontSize(10).font('Roboto')
      .text('Wartość netto:', 400, currentY)
      .text(`${parseFloat(offer.total_net).toFixed(2)} zł`, 500, currentY);
    currentY += 15;
    doc.text('VAT 23%:', 400, currentY)
      .text(`${parseFloat(offer.total_vat).toFixed(2)} zł`, 500, currentY);
    currentY += 15;
    doc.font('RobotoBold')
      .text('RAZEM BRUTTO:', 400, currentY)
      .text(`${parseFloat(offer.total_gross).toFixed(2)} zł`, 500, currentY);

    if (offer.notes) {
      currentY += 40;
      if (currentY > 650) doc.addPage(), currentY = 50;
      doc.fontSize(12).font('RobotoBold').text('UWAGI:', 50, currentY);
      currentY += 20;
      doc.fontSize(10).font('Roboto').text(offer.notes, 50, currentY, { width: 495 });
    }

    doc.fontSize(8).font('Roboto')
      .text('Dziękujemy za zainteresowanie naszą ofertą!', 50, 750)
      .text('W przypadku pytań prosimy o kontakt telefoniczny lub mailowy.', 50, 765);

    // Output PDF
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', (err) => { throw err; });
    doc.end();

    await new Promise<void>((resolve) => {
      doc.on('end', resolve);
    });

    const pdfBuffer = Buffer.concat(chunks);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Oferta_${offerId}_${offer.client_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Błąd generowania PDF' },
      { status: 500 }
    );
  }
}
