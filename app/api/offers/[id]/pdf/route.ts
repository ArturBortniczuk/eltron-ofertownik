// app/api/offers/[id]/pdf/route.ts - WERSJA Z jsPDF I UNICODE
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import { jsPDF } from 'jspdf';

// Dodaj podstawowe polskie znaki jako unicode
function addPolishText(doc: jsPDF, text: string, x: number, y: number, options: Record<string, any> = {}) {
  if (!text) return;
  
  // Konwersja polskich znaków na unicode escape sequences dla jsPDF
  const polishCharsMap: Record<string, string> = {
    'ą': '\u0105', 'ć': '\u0107', 'ę': '\u0119', 'ł': '\u0142', 'ń': '\u0144',
    'ó': '\u00F3', 'ś': '\u015B', 'ź': '\u017A', 'ż': '\u017C',
    'Ą': '\u0104', 'Ć': '\u0106', 'Ę': '\u0118', 'Ł': '\u0141', 'Ń': '\u0143',
    'Ó': '\u00D3', 'Ś': '\u015A', 'Ź': '\u0179', 'Ż': '\u017B'
  };
  
  let convertedText = text;
  Object.entries(polishCharsMap).forEach(([polish, unicode]) => {
    convertedText = convertedText.replace(new RegExp(polish, 'g'), unicode);
  });
  
  doc.text(convertedText, x, y, options);
}

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
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Ustaw domyślną czcionkę
    doc.setFont('helvetica', 'normal');

    // Header z logo firmy
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    addPolishText(doc, 'GRUPA ELTRON', 20, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    addPolishText(doc, 'ul. Przykładowa 123, 00-000 Warszawa', 20, 30);
    addPolishText(doc, 'Tel: +48 123 456 789 | Email: kontakt@eltron.pl', 20, 35);
    addPolishText(doc, 'NIP: 123-456-78-90', 20, 40);

    // Data i nr oferty
    const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
    const validUntil = new Date(
      new Date(offer.created_at).getTime() + (offer.valid_days * 24 * 60 * 60 * 1000)
    ).toLocaleDateString('pl-PL');

    doc.setFontSize(10);
    addPolishText(doc, `Data: ${offerDate}`, 140, 20);
    addPolishText(doc, `Oferta nr: ${offerId}`, 140, 25);
    addPolishText(doc, `Ważna do: ${validUntil}`, 140, 30);

    // Linia oddzielająca
    doc.line(20, 45, 190, 45);

    // Tytuł oferty
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    addPolishText(doc, 'OFERTA HANDLOWA', 20, 55);

    // Dane klienta
    let yPos = 70;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    addPolishText(doc, 'ODBIORCA:', 20, yPos);

    yPos += 8;
    doc.setFont('helvetica', 'normal');
    addPolishText(doc, offer.client_name, 20, yPos);

    if (offer.client_address) {
      yPos += 6;
      // Obsłuż wieloliniowe adresy
      const addressLines = offer.client_address.split('\n');
      addressLines.forEach((line: string) => {
        addPolishText(doc, line.trim(), 20, yPos);
        yPos += 5;
      });
    }

    if (offer.client_nip) {
      yPos += 2;
      addPolishText(doc, `NIP: ${offer.client_nip}`, 20, yPos);
      yPos += 6;
    }

    if (offer.client_email) {
      addPolishText(doc, `Email: ${offer.client_email}`, 20, yPos);
      yPos += 6;
    }

    if (offer.client_phone) {
      addPolishText(doc, `Telefon: ${offer.client_phone}`, 20, yPos);
      yPos += 6;
    }

    // Warunki oferty
    yPos += 10;
    doc.setFont('helvetica', 'bold');
    addPolishText(doc, 'WARUNKI OFERTY:', 20, yPos);

    yPos += 8;
    doc.setFont('helvetica', 'normal');
    addPolishText(doc, `• Termin dostawy: ${offer.delivery_days} dni roboczych`, 20, yPos);
    addPolishText(doc, `• Termin płatności: 30 dni od daty wystawienia faktury`, 20, yPos + 6);
    addPolishText(doc, `• Ceny zawierają VAT`, 20, yPos + 12);

    // Tabela z pozycjami
    yPos += 25;
    
    // Nagłówki tabeli
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    
    const tableTop = yPos;
    addPolishText(doc, 'Lp.', 20, tableTop);
    addPolishText(doc, 'Opis towaru/usługi', 35, tableTop);
    addPolishText(doc, 'Ilość', 120, tableTop);
    addPolishText(doc, 'j.m.', 135, tableTop);
    addPolishText(doc, 'Cena netto', 145, tableTop);
    addPolishText(doc, 'Wartość netto', 170, tableTop);

    // Linia pod nagłówkami
    doc.line(20, tableTop + 3, 190, tableTop + 3);

    // Pozycje
    let currentY = tableTop + 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    items.forEach((item, index) => {
      // Sprawdź czy trzeba przenieść na nową stronę
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      const itemNumber = (index + 1).toString();
      const quantity = parseFloat(item.quantity).toString();
      const unitPrice = parseFloat(item.unit_price).toFixed(2);
      const netAmount = parseFloat(item.net_amount).toFixed(2);

      addPolishText(doc, itemNumber, 20, currentY);
      
      // Długie nazwy produktów - podziel na linie
      const maxWidth = 80;
      const productLines = doc.splitTextToSize(item.product_name, maxWidth) as string[];
      let lineY = currentY;
      productLines.forEach((line: string) => {
        addPolishText(doc, line, 35, lineY);
        lineY += 4;
      });
      
      addPolishText(doc, quantity, 120, currentY);
      addPolishText(doc, item.unit, 135, currentY);
      addPolishText(doc, `${unitPrice} zł`, 145, currentY);
      addPolishText(doc, `${netAmount} zł`, 170, currentY);

      currentY = Math.max(currentY + 8, lineY + 4);
    });

    // Dodatkowe koszty
    if (offer.additional_costs > 0) {
      const additionalCosts = parseFloat(offer.additional_costs);
      const description = offer.additional_costs_description || 'Dodatkowe koszty';
      
      addPolishText(doc, (items.length + 1).toString(), 20, currentY);
      addPolishText(doc, description, 35, currentY);
      addPolishText(doc, '1', 120, currentY);
      addPolishText(doc, 'usł', 135, currentY);
      addPolishText(doc, `${additionalCosts.toFixed(2)} zł`, 145, currentY);
      addPolishText(doc, `${additionalCosts.toFixed(2)} zł`, 170, currentY);

      currentY += 8;
    }

    // Linia przed podsumowaniem
    currentY += 5;
    doc.line(120, currentY, 190, currentY);

    // Podsumowanie
    currentY += 8;
    const totalNet = parseFloat(offer.total_net);
    const totalVat = parseFloat(offer.total_vat);
    const totalGross = parseFloat(offer.total_gross);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    addPolishText(doc, 'Wartość netto:', 120, currentY);
    addPolishText(doc, `${totalNet.toFixed(2)} zł`, 170, currentY);

    currentY += 6;
    addPolishText(doc, 'VAT 23%:', 120, currentY);
    addPolishText(doc, `${totalVat.toFixed(2)} zł`, 170, currentY);

    currentY += 6;
    doc.setFont('helvetica', 'bold');
    addPolishText(doc, 'RAZEM BRUTTO:', 120, currentY);
    addPolishText(doc, `${totalGross.toFixed(2)} zł`, 170, currentY);

    // Uwagi
    if (offer.notes) {
      currentY += 15;
      
      // Sprawdź czy trzeba przenieść na nową stronę
      if (currentY > 220) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      addPolishText(doc, 'UWAGI:', 20, currentY);

      currentY += 8;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      
      // Podziel długie uwagi na linie
      const notesLines = doc.splitTextToSize(offer.notes, 170) as string[];
      notesLines.forEach((line: string) => {
        addPolishText(doc, line, 20, currentY);
        currentY += 5;
      });
    }

    // Stopka
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    addPolishText(doc, 'Dziękujemy za zainteresowanie naszą ofertą!', 20, 280);
    addPolishText(doc, 'W przypadku pytań prosimy o kontakt telefoniczny lub mailowy.', 20, 285);

    // Generuj PDF jako buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    
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
