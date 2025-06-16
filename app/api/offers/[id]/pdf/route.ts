// app/api/offers/[id]/pdf/route.ts - NOWA WERSJA Z PDFKIT
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import PDFDocument from 'pdfkit';
import path from 'path';

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
        c.nip as client_nip,
        c.address as client_address
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

    // Utwórz PDF
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

    // Załaduj font z polskimi znakami
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Regular.ttf');
    const fontBoldPath = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Bold.ttf');
    
    try {
      doc.registerFont('Roboto', fontPath);
      doc.registerFont('RobotoBold', fontBoldPath);
      doc.font('Roboto');
    } catch (fontError) {
      console.warn('Nie można załadować fontu Roboto, używam domyślnego:', fontError);
      // Fallback do domyślnego fontu
    }

    // Header z logo firmy
    doc.fontSize(20)
       .font('RobotoBold')
       .text('GRUPA ELTRON', 50, 50)
       .fontSize(10)
       .font('Roboto')
       .text('ul. Przykładowa 123, 00-000 Warszawa', 50, 75)
       .text('Tel: +48 123 456 789 | Email: kontakt@eltron.pl', 50, 90)
       .text('NIP: 123-456-78-90', 50, 105);

    // Data i nr oferty
    const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
    const validUntil = new Date(
      new Date(offer.created_at).getTime() + (offer.valid_days * 24 * 60 * 60 * 1000)
    ).toLocaleDateString('pl-PL');

    doc.fontSize(12)
       .text(`Data: ${offerDate}`, 400, 50)
       .text(`Oferta nr: ${offerId}`, 400, 65)
       .text(`Ważna do: ${validUntil}`, 400, 80);

    // Linia oddzielająca
    doc.moveTo(50, 130)
       .lineTo(545, 130)
       .stroke();

    // Tytuł oferty
    doc.fontSize(16)
       .font('RobotoBold')
       .text(`OFERTA HANDLOWA`, 50, 150);

    // Dane klienta
    let yPos = 180;
    doc.fontSize(12)
       .font('RobotoBold')
       .text('ODBIORCA:', 50, yPos);

    yPos += 20;
    doc.font('Roboto')
       .text(offer.client_name, 50, yPos);

    if (offer.client_address) {
      yPos += 15;
      doc.text(offer.client_address, 50, yPos);
    }

    if (offer.client_nip) {
      yPos += 15;
      doc.text(`NIP: ${offer.client_nip}`, 50, yPos);
    }

    if (offer.client_email) {
      yPos += 15;
      doc.text(`Email: ${offer.client_email}`, 50, yPos);
    }

    if (offer.client_phone) {
      yPos += 15;
      doc.text(`Telefon: ${offer.client_phone}`, 50, yPos);
    }

    // Warunki oferty
    yPos += 40;
    doc.font('RobotoBold')
       .text('WARUNKI OFERTY:', 50, yPos);

    yPos += 20;
    doc.font('Roboto')
       .text(`• Termin dostawy: ${offer.delivery_days} dni roboczych`, 50, yPos)
       .text(`• Termin płatności: 30 dni od daty wystawienia faktury`, 50, yPos + 15)
       .text(`• Ceny zawierają VAT`, 50, yPos + 30);

    // Tabela z pozycjami
    yPos += 70;
    
    // Nagłówki tabeli
    doc.fontSize(10)
       .font('RobotoBold');
    
    const tableTop = yPos;
    const itemCodeX = 50;
    const descriptionX = 120;
    const quantityX = 350;
    const unitX = 400;
    const priceX = 440;
    const totalX = 500;

    doc.text('Lp.', itemCodeX, tableTop)
       .text('Opis towaru/usługi', descriptionX, tableTop)
       .text('Ilość', quantityX, tableTop)
       .text('j.m.', unitX, tableTop)
       .text('Cena netto', priceX, tableTop)
       .text('Wartość', totalX, tableTop);

    // Linia pod nagłówkami
    doc.moveTo(50, tableTop + 15)
       .lineTo(545, tableTop + 15)
       .stroke();

    // Pozycje
    let currentY = tableTop + 25;
    doc.font('Roboto').fontSize(9);

    items.forEach((item, index) => {
      // Sprawdź czy trzeba przenieść na nową stronę
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }

      const itemNumber = (index + 1).toString();
      const quantity = parseFloat(item.quantity).toString();
      const unitPrice = parseFloat(item.unit_price).toFixed(2);
      const netAmount = parseFloat(item.net_amount).toFixed(2);

      doc.text(itemNumber, itemCodeX, currentY)
         .text(item.product_name, descriptionX, currentY, { width: 220 })
         .text(quantity, quantityX, currentY)
         .text(item.unit, unitX, currentY)
         .text(`${unitPrice} zł`, priceX, currentY)
         .text(`${netAmount} zł`, totalX, currentY);

      currentY += 20;
    });

    // Dodatkowe koszty
    if (offer.additional_costs > 0) {
      const additionalCosts = parseFloat(offer.additional_costs);
      const description = offer.additional_costs_description || 'Dodatkowe koszty';
      
      doc.text((items.length + 1).toString(), itemCodeX, currentY)
         .text(description, descriptionX, currentY)
         .text('1', quantityX, currentY)
         .text('usł', unitX, currentY)
         .text(`${additionalCosts.toFixed(2)} zł`, priceX, currentY)
         .text(`${additionalCosts.toFixed(2)} zł`, totalX, currentY);

      currentY += 20;
    }

    // Linia przed podsumowaniem
    currentY += 10;
    doc.moveTo(350, currentY)
       .lineTo(545, currentY)
       .stroke();

    // Podsumowanie
    currentY += 20;
    const totalNet = parseFloat(offer.total_net);
    const totalVat = parseFloat(offer.total_vat);
    const totalGross = parseFloat(offer.total_gross);

    doc.fontSize(10)
       .font('Roboto')
       .text('Wartość netto:', 400, currentY)
       .text(`${totalNet.toFixed(2)} zł`, 500, currentY);

    currentY += 15;
    doc.text('VAT 23%:', 400, currentY)
       .text(`${totalVat.toFixed(2)} zł`, 500, currentY);

    currentY += 15;
    doc.font('RobotoBold')
       .text('RAZEM BRUTTO:', 400, currentY)
       .text(`${totalGross.toFixed(2)} zł`, 500, currentY);

    // Uwagi
    if (offer.notes) {
      currentY += 40;
      
      // Sprawdź czy trzeba przenieść na nową stronę
      if (currentY > 650) {
        doc.addPage();
        currentY = 50;
      }

      doc.fontSize(12)
         .font('RobotoBold')
         .text('UWAGI:', 50, currentY);

      currentY += 20;
      doc.fontSize(10)
         .font('Roboto')
         .text(offer.notes, 50, currentY, { width: 495 });
    }

    // Stopka
    doc.fontSize(8)
       .font('Roboto')
       .text('Dziękujemy za zainteresowanie naszą ofertą!', 50, 750)
       .text('W przypadku pytań prosimy o kontakt telefoniczny lub mailowy.', 50, 765);

    // Zwróć PDF jako response
    const chunks: Buffer[] = [];
    
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.end();
    
    await new Promise<void>((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
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
        
        resolve(response);
      });
      doc.on('error', reject);
      
      // Finalizuj dokument
      doc.end();
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Błąd generowania PDF' },
      { status: 500 }
    );
  }
}
