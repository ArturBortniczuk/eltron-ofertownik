import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import PDFDocument from 'pdfkit';

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

    // Stwórz nowy dokument PDF z PDFKit
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Oferta ${offer.id}`,
        Author: 'Grupa Eltron',
        Subject: 'Oferta handlowa'
      }
    });

    // Przygotuj buffer do zbierania danych PDF
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    
    let pdfBuffer: Buffer;
    const pdfPromise = new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });
    });

    // === HEADER Z LOGO I ADRESEM ===
    doc.rect(0, 0, doc.page.width, 120)
       .fill('#3B4A5C');

    // Logo/Nazwa firmy (biały tekst) - używamy domyślnego fontu
    doc.fill('#FFFFFF')
       .fontSize(24)
       .text('GRUPA ELTRON', 40, 40);

    // Adres firmy
    doc.fontSize(10)
       .text('ul. Przykładowa 123, 00-000 Warszawa', 40, 70)
       .text('Tel: +48 123 456 789 | Email: kontakt@eltron.pl', 40, 85);

    // Tytuł oferty (po prawej)
    const offerTitle = `OFERTA Nr ${offer.id}/${new Date().getFullYear()}`;
    doc.fontSize(18)
       .text(offerTitle, doc.page.width - 200, 40, { align: 'right', width: 160 });

    // Data oferty
    const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
    const validDays = parseInt(offer.valid_days) || 30;
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toLocaleDateString('pl-PL');
    
    doc.fontSize(10)
       .text(`Data: ${offerDate}`, doc.page.width - 200, 70, { align: 'right', width: 160 })
       .text(`Ważna do: ${validUntil}`, doc.page.width - 200, 85, { align: 'right', width: 160 });

    // === DANE KLIENTA W RAMCE ===
    let yPos = 140;
    
    // Ramka dla klienta
    doc.rect(40, yPos, doc.page.width - 80, 80)
       .stroke('#CCCCCC')
       .fill('#F8F9FA');

    // Nagłówek "DLA:"
    doc.fill('#3B4A5C')
       .fontSize(12)
       .text('DLA:', 50, yPos + 15);

    // Dane klienta
    doc.fill('#000000')
       .fontSize(14)
       .text(offer.client_name || '', 50, yPos + 35);

    doc.fontSize(10);
    
    let clientYPos = yPos + 50;
    
    // Email i NIP w pierwszym wierszu
    if (offer.client_email) {
      doc.text(`Email: ${offer.client_email}`, 50, clientYPos);
    }
    if (offer.client_nip) {
      doc.text(`NIP: ${offer.client_nip}`, 300, clientYPos);
    }
    
    // Telefon w drugim wierszu
    if (offer.client_phone) {
      clientYPos += 15;
      doc.text(`Tel: ${offer.client_phone}`, 50, clientYPos);
    }

    // === POWITANIE ===
    yPos = 240;
    doc.fill('#000000')
       .fontSize(11)
       .text('Dzień dobry,', 40, yPos)
       .text('Przesyłam ofertę na zamówione towary zgodnie z Państwa zapytaniem.', 40, yPos + 20);

    // === TABELA Z POZYCJAMI ===
    yPos = 290;
    
    // Nagłówki tabeli
    const tableTop = yPos;
    const tableLeft = 40;
    const colWidths = [30, 200, 60, 80, 40, 80]; // szerokości kolumn
    let xPos = tableLeft;

    // Tło nagłówka
    doc.rect(tableLeft, tableTop, colWidths.reduce((a, b) => a + b, 0), 25)
       .fill('#3B4A5C');

    // Tekst nagłówka
    doc.fill('#FFFFFF')
       .fontSize(10);

    const headers = ['Lp.', 'Nazwa towaru/usługi', 'Ilość', 'Cena netto', 'VAT', 'Wartość brutto'];
    
    xPos = tableLeft;
    headers.forEach((header, i) => {
      doc.text(header, xPos + 5, tableTop + 8, { width: colWidths[i] - 10, align: 'center' });
      xPos += colWidths[i];
    });

    // Pozycje tabeli
    yPos = tableTop + 25;
    doc.fill('#000000')
       .fontSize(9);

    items.forEach((item, index) => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const vatRate = parseFloat(item.vat_rate) || 0;
      const grossAmount = parseFloat(item.gross_amount) || 0;

      // Tło wiersza (co drugi szary)
      if (index % 2 === 1) {
        doc.rect(tableLeft, yPos, colWidths.reduce((a, b) => a + b, 0), 20)
           .fill('#F8F9FA');
      }

      doc.fill('#000000');

      const rowData = [
        String(index + 1),
        item.product_name || '',
        `${quantity} ${item.unit || ''}`,
        `${unitPrice.toFixed(2)} zł`,
        `${vatRate}%`,
        `${grossAmount.toFixed(2)} zł`
      ];

      xPos = tableLeft;
      rowData.forEach((data, i) => {
        const align = i === 0 || i === 4 ? 'center' : (i >= 3 ? 'right' : 'left');
        doc.text(data, xPos + 5, yPos + 6, { 
          width: colWidths[i] - 10, 
          align: align as any
        });
        xPos += colWidths[i];
      });

      yPos += 20;
    });

    // Dodatkowe koszty jeśli istnieją
    const additionalCosts = parseFloat(offer.additional_costs) || 0;
    if (additionalCosts > 0) {
      const additionalGross = additionalCosts * 1.23;
      
      // Linia separująca
      doc.rect(tableLeft, yPos, colWidths.reduce((a, b) => a + b, 0), 1)
         .fill('#CCCCCC');
      yPos += 5;

      doc.fill('#000000');
      const additionalData = [
        '',
        offer.additional_costs_description || 'Dodatkowe koszty',
        '1 usł',
        `${additionalCosts.toFixed(2)} zł`,
        '23%',
        `${additionalGross.toFixed(2)} zł`
      ];

      xPos = tableLeft;
      additionalData.forEach((data, i) => {
        const align = i === 0 || i === 4 ? 'center' : (i >= 3 ? 'right' : 'left');
        doc.text(data, xPos + 5, yPos + 6, { 
          width: colWidths[i] - 10, 
          align: align as any
        });
        xPos += colWidths[i];
      });

      yPos += 20;
    }

    // === PODSUMOWANIE I WARUNKI ===
    yPos += 30;
    
    const totalNet = parseFloat(offer.total_net) || 0;
    const totalVat = parseFloat(offer.total_vat) || 0;
    const totalGross = parseFloat(offer.total_gross) || 0;

    // WARUNKI OFERTY (lewa strona)
    doc.rect(40, yPos, 250, 120)
       .stroke('#CCCCCC')
       .fill('#F8F9FA');

    doc.fill('#3B4A5C')
       .fontSize(12)
       .text('WARUNKI OFERTY:', 50, yPos + 15);

    doc.fill('#000000')
       .fontSize(10);

    const deliveryDays = parseInt(offer.delivery_days) || 0;
    const conditions = [
      `• Czas dostawy: ${deliveryDays} dni roboczych`,
      `• Ważność: ${validDays} dni`,
      `• Płatność: przelew 14 dni`,
      `• Ceny zawierają VAT`
    ];

    conditions.forEach((condition, index) => {
      doc.text(condition, 50, yPos + 35 + (index * 15));
    });

    // PODSUMOWANIE (prawa strona)
    doc.rect(320, yPos, 230, 90)
       .stroke('#CCCCCC')
       .fill('#F8F9FA');

    doc.fill('#000000')
       .fontSize(11);

    doc.text('Wartość netto:', 330, yPos + 20)
       .text(`${totalNet.toFixed(2)} zł`, 480, yPos + 20, { align: 'right', width: 60 });

    doc.text('VAT:', 330, yPos + 40)
       .text(`${totalVat.toFixed(2)} zł`, 480, yPos + 40, { align: 'right', width: 60 });

    // Linia separująca
    doc.moveTo(330, yPos + 55)
       .lineTo(540, yPos + 55)
       .stroke('#3B4A5C');

    // RAZEM
    doc.fill('#3B4A5C')
       .fontSize(12)
       .text('RAZEM DO ZAPŁATY:', 330, yPos + 65)
       .text(`${totalGross.toFixed(2)} zł`, 480, yPos + 65, { align: 'right', width: 60 });

    // === UWAGI ===
    if (offer.notes) {
      yPos += 140;
      doc.fill('#000000')
         .fontSize(12)
         .text('UWAGI:', 40, yPos);

      doc.fontSize(10)
         .text(offer.notes, 40, yPos + 20, { width: doc.page.width - 80 });
      
      yPos += 60;
    }

    // === STOPKA ===
    yPos = Math.max(yPos + 140, doc.page.height - 120);

    // Linia separująca
    doc.moveTo(40, yPos)
       .lineTo(doc.page.width - 40, yPos)
       .stroke('#CCCCCC');

    yPos += 15;
    doc.fill('#666666')
       .fontSize(10)
       .text('W celu realizacji zamówienia proszę o kontakt:', 40, yPos)
       .text(`Email: ${offer.created_by_email || ''} | Tel: +48 123 456 789`, 40, yPos + 15);

    yPos += 40;
    doc.text('Dziękujemy za zainteresowanie naszą ofertą.', 40, yPos)
       .text('Pozdrawiamy,', 40, yPos + 15);

    doc.fill('#3B4A5C')
       .text(`${offer.created_by_name || ''} | GRUPA ELTRON`, 40, yPos + 30);

    // Zakończ dokument
    doc.end();

    // Poczekaj na wygenerowanie PDF
    const finalPdfBuffer = await pdfPromise;

    // Zwróć PDF z polskimi znakami
    return new NextResponse(finalPdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Oferta_${offer.id}_${String(offer.client_name || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`,
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Błąd generowania PDF: ' + (error instanceof Error ? error.message : 'Nieznany błąd') },
      { status: 500 }
    );
  }
}
