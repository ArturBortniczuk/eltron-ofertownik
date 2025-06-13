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

    // Przygotuj dane
    const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
    const validDays = parseInt(offer.valid_days) || 30;
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toLocaleDateString('pl-PL');
    const deliveryDays = parseInt(offer.delivery_days) || 0;
    const totalNet = parseFloat(offer.total_net) || 0;
    const totalVat = parseFloat(offer.total_vat) || 0;
    const totalGross = parseFloat(offer.total_gross) || 0;
    const additionalCosts = parseFloat(offer.additional_costs) || 0;

    // Stwórz PDF
    const doc = new PDFDocument({ 
      size: 'A4', 
      margin: 50,
      info: {
        Title: `Oferta ${offer.id}/${new Date().getFullYear()}`,
        Author: 'GRUPA ELTRON',
        Subject: `Oferta dla ${offer.client_name}`,
        Keywords: 'oferta, elektro, eltron'
      }
    });

    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));
    
    const pdfPromise = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    // Funkcja do konwersji polskich znaków (fallback)
    const convertPolish = (text: string): string => {
      if (!text) return '';
      const polishMap: Record<string, string> = {
        'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 
        'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
        'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 
        'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
      };
      return text.split('').map(char => polishMap[char] || char).join('');
    };

    const safeText = (text: string): string => convertPolish(String(text || ''));

    // HEADER - tło niebieskie
    doc.rect(50, 50, 495, 80).fill('#3B4A5C');
    
    // Logo i nazwa firmy
    doc.fillColor('white')
       .fontSize(24)
       .font('Helvetica-Bold')
       .text('GRUPA ELTRON', 70, 75);
    
    doc.fontSize(9)
       .font('Helvetica')
       .text('ul. Przykladowa 123, 00-000 Warszawa', 70, 105)
       .text('Tel: +48 123 456 789 | Email: kontakt@eltron.pl', 70, 118);

    // Numer oferty po prawej
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text(`OFERTA Nr ${offer.id}/${new Date().getFullYear()}`, 350, 75, { align: 'right', width: 180 });
    
    doc.fontSize(9)
       .font('Helvetica')
       .text(`Data: ${offerDate}`, 350, 105, { align: 'right', width: 180 })
       .text(`Wazna do: ${validUntil}`, 350, 118, { align: 'right', width: 180 });

    // CLIENT BOX
    let yPos = 160;
    doc.rect(50, yPos, 495, 70).fill('#F8F9FA').stroke('#E9ECEF');
    
    doc.fillColor('#3B4A5C')
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('OFERTA DLA:', 70, yPos + 15);
    
    doc.fillColor('black')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(safeText(offer.client_name), 70, yPos + 30);

    yPos += 50;
    if (offer.client_email) {
      doc.fontSize(9).font('Helvetica').text(`Email: ${safeText(offer.client_email)}`, 70, yPos);
      yPos += 12;
    }
    if (offer.client_phone) {
      doc.fontSize(9).text(`Tel: ${safeText(offer.client_phone)}`, 70, yPos);
      yPos += 12;
    }
    if (offer.client_nip) {
      doc.fontSize(9).text(`NIP: ${safeText(offer.client_nip)}`, 70, yPos);
    }

    // GREETING
    yPos = 260;
    doc.fontSize(10)
       .fillColor('black')
       .text('Szanowni Panstwo,', 50, yPos)
       .text('W odpowiedzi na Panstwa zapytanie przesylamy oferte na zamowione towary.', 50, yPos + 15)
       .text('Mamy nadzieje, ze przedstawione warunki spotka sie z Panstwa akceptacja.', 50, yPos + 30);

    // TABLE
    yPos = 320;
    const tableTop = yPos;
    const itemHeight = 20;
    
    // Table header
    doc.rect(50, yPos, 495, 25).fill('#3B4A5C');
    doc.fillColor('white')
       .fontSize(9)
       .font('Helvetica-Bold')
       .text('Lp.', 60, yPos + 8, { width: 30, align: 'center' })
       .text('Nazwa towaru/uslugi', 95, yPos + 8, { width: 200 })
       .text('Ilosc', 300, yPos + 8, { width: 60, align: 'center' })
       .text('Cena netto', 365, yPos + 8, { width: 60, align: 'right' })
       .text('VAT', 430, yPos + 8, { width: 40, align: 'center' })
       .text('Wartosc brutto', 475, yPos + 8, { width: 70, align: 'right' });

    yPos += 25;

    // Table rows
    items.forEach((item: any, index: number) => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const vatRate = parseFloat(item.vat_rate) || 0;
      const grossAmount = parseFloat(item.gross_amount) || 0;

      // Alternating row colors
      if (index % 2 === 1) {
        doc.rect(50, yPos, 495, itemHeight).fill('#F8F9FA');
      }

      doc.fillColor('black')
         .fontSize(8)
         .font('Helvetica')
         .text((index + 1).toString(), 60, yPos + 6, { width: 30, align: 'center' })
         .text(safeText(item.product_name).substring(0, 40), 95, yPos + 6, { width: 200 })
         .text(`${quantity} ${safeText(item.unit)}`, 300, yPos + 6, { width: 60, align: 'center' })
         .text(`${unitPrice.toFixed(2)} zl`, 365, yPos + 6, { width: 60, align: 'right' })
         .text(`${vatRate}%`, 430, yPos + 6, { width: 40, align: 'center' })
         .text(`${grossAmount.toFixed(2)} zl`, 475, yPos + 6, { width: 70, align: 'right' });

      yPos += itemHeight;
    });

    // Additional costs
    if (additionalCosts > 0) {
      doc.rect(50, yPos, 495, itemHeight).fill('#E3F2FD').stroke('#3B4A5C');
      doc.fillColor('black')
         .fontSize(8)
         .font('Helvetica-Bold')
         .text('', 60, yPos + 6, { width: 30, align: 'center' })
         .text(safeText(offer.additional_costs_description || 'Dodatkowe koszty'), 95, yPos + 6, { width: 200 })
         .text('1 usl', 300, yPos + 6, { width: 60, align: 'center' })
         .text(`${additionalCosts.toFixed(2)} zl`, 365, yPos + 6, { width: 60, align: 'right' })
         .text('23%', 430, yPos + 6, { width: 40, align: 'center' })
         .text(`${(additionalCosts * 1.23).toFixed(2)} zl`, 475, yPos + 6, { width: 70, align: 'right' });
      yPos += itemHeight;
    }

    // SUMMARY BOXES
    yPos += 30;
    
    // Left box - Conditions
    doc.rect(50, yPos, 240, 100).fill('#F8F9FA').stroke('#E9ECEF');
    doc.fillColor('#3B4A5C')
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('WARUNKI OFERTY:', 65, yPos + 15);
    
    doc.fillColor('black')
       .fontSize(9)
       .font('Helvetica')
       .text(`• Czas dostawy: ${deliveryDays} dni roboczych`, 65, yPos + 35)
       .text(`• Waznosc oferty: ${validDays} dni`, 65, yPos + 50)
       .text('• Forma platnosci: przelew bankowy', 65, yPos + 65)
       .text('• Termin platnosci: 14 dni od faktury', 65, yPos + 80);

    // Right box - Financial summary
    doc.rect(305, yPos, 240, 100).fill('#F8F9FA').stroke('#E9ECEF');
    doc.fillColor('#3B4A5C')
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('PODSUMOWANIE FINANSOWE:', 320, yPos + 15);
    
    doc.fillColor('black')
       .fontSize(9)
       .font('Helvetica')
       .text('Wartosc netto:', 320, yPos + 40)
       .text(`${totalNet.toFixed(2)} zl`, 480, yPos + 40, { align: 'right' })
       .text('Podatek VAT:', 320, yPos + 55)
       .text(`${totalVat.toFixed(2)} zl`, 480, yPos + 55, { align: 'right' });

    // Total line
    doc.strokeColor('#3B4A5C').lineWidth(2);
    doc.moveTo(320, yPos + 70).lineTo(530, yPos + 70).stroke();
    
    doc.fillColor('#3B4A5C')
       .fontSize(11)
       .font('Helvetica-Bold')
       .text('RAZEM DO ZAPLATY:', 320, yPos + 80)
       .text(`${totalGross.toFixed(2)} zl`, 480, yPos + 80, { align: 'right' });

    // NOTES
    if (offer.notes) {
      yPos += 130;
      doc.rect(50, yPos, 495, 60).fill('#F8F9FA').stroke('#E9ECEF');
      doc.fillColor('#3B4A5C')
         .fontSize(10)
         .font('Helvetica-Bold')
         .text('DODATKOWE UWAGI:', 65, yPos + 15);
      
      doc.fillColor('black')
         .fontSize(9)
         .font('Helvetica')
         .text(safeText(offer.notes).substring(0, 200), 65, yPos + 35, { width: 465 });
    }

    // FOOTER
    yPos = 700;
    doc.strokeColor('#E9ECEF').lineWidth(1);
    doc.moveTo(50, yPos).lineTo(545, yPos).stroke();
    
    doc.fillColor('black')
       .fontSize(9)
       .font('Helvetica')
       .text('Kontakt w sprawie realizacji zamowienia:', 50, yPos + 15)
       .text(`Email: ${safeText(offer.created_by_email || 'kontakt@eltron.pl')}`, 50, yPos + 30)
       .text('Telefon: +48 123 456 789', 50, yPos + 45)
       .text('Dziekujemy za zainteresowanie nasza oferta i liczymy na owocna wspolprace.', 50, yPos + 65);

    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#3B4A5C')
       .text('Z powazaniem,', 50, yPos + 85)
       .text(safeText(offer.created_by_name || 'Zespol GRUPA ELTRON'), 50, yPos + 100)
       .text('GRUPA ELTRON Sp. z o.o.', 50, yPos + 115);

    // Zakończ dokument
    doc.end();

    // Czekaj na wygenerowanie PDF
    const pdfBuffer = await pdfPromise;

    // Zwróć PDF
    const clientName = safeText(offer.client_name || 'Klient').replace(/\s+/g, '_');
    const fileName = `Oferta_${offer.id}_${clientName}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`
      }
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Blad generowania PDF: ' + (error instanceof Error ? error.message : 'Nieznany blad') },
      { status: 500 }
    );
  }
}
