import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

// Importuj jsPDF i autoTable
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Funkcja pomocnicza do konwersji polskich znaków
function convertPolishChars(text: string): string {
  if (!text) return '';
  
  const polishChars: Record<string, string> = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 
    'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 
    'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
  };
  
  return text.split('').map(char => polishChars[char] || char).join('');
}

// Funkcja do bezpiecznego dodawania tekstu z polskimi znakami
function addPolishText(
  doc: jsPDF, 
  text: string, 
  x: number, 
  y: number, 
  options: any = {}
): void {
  try {
    if (!text) text = '';
    
    // Konwertuj polskie znaki
    const convertedText = convertPolishChars(String(text));
    
    // Usuń charSpace - może powoduje problemy
    doc.text(convertedText, x, y, options);
  } catch (error) {
    console.error('Error adding Polish text:', text, error);
    // Fallback - dodaj tekst bez konwersji
    doc.text(String(text || ''), x, y, options);
  }
}

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

    // Stwórz nowy dokument PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    // Dodaj metadane PDF
    doc.setProperties({
      title: `Oferta ${offer.id}`,
      creator: 'Grupa Eltron'
    });
    
    // === HEADER Z LOGO I ADRESEM ===
    // Tło header
    doc.setFillColor(59, 74, 92);
    doc.rect(0, 0, pageWidth, 45, 'F');
    
    // Logo/Nazwa firmy
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    addPolishText(doc, 'GRUPA ELTRON', 15, 20);
    
    // Adres firmy (biały tekst)
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    addPolishText(doc, 'ul. Przykladowa 123, 00-000 Warszawa', 15, 30);
    addPolishText(doc, 'Tel: +48 123 456 789 | Email: kontakt@eltron.pl', 15, 37);

    // === TYTUŁ OFERTY (po prawej w header) ===
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    const offerTitle = `OFERTA Nr ${offer.id}/${new Date().getFullYear()}`;
    const titleWidth = doc.getTextWidth(convertPolishChars(offerTitle));
    addPolishText(doc, offerTitle, pageWidth - titleWidth - 15, 20);
    
    // Data oferty
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
    const validDays = parseInt(offer.valid_days) || 30;
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toLocaleDateString('pl-PL');
    
    const dateText = `Data: ${offerDate}`;
    const validText = `Wazna do: ${validUntil}`;
    addPolishText(doc, dateText, pageWidth - doc.getTextWidth(convertPolishChars(dateText)) - 15, 30);
    addPolishText(doc, validText, pageWidth - doc.getTextWidth(convertPolishChars(validText)) - 15, 37);

    // === DANE KLIENTA W RAMCE ===
    let yPos = 55;
    
    // Ramka dla klienta
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(15, yPos, pageWidth - 30, 40, 2, 2, 'FD');
    
    // Nagłówek "Dla:"
    doc.setTextColor(59, 74, 92);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    addPolishText(doc, 'DLA:', 20, yPos + 10);
    
    // Dane klienta
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    addPolishText(doc, String(offer.client_name || ''), 20, yPos + 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    let clientYPos = yPos + 28;
    
    // Email i NIP w pierwszym wierszu
    if (offer.client_email) {
      addPolishText(doc, `Email: ${offer.client_email}`, 20, clientYPos);
    }
    if (offer.client_nip) {
      addPolishText(doc, `NIP: ${offer.client_nip}`, 120, clientYPos);
    }
    
    // Telefon w drugim wierszu
    if (offer.client_phone) {
      clientYPos += 7;
      addPolishText(doc, `Tel: ${offer.client_phone}`, 20, clientYPos);
    }

    // === POWITANIE ===
    yPos = 110;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    addPolishText(doc, 'Dzien dobry,', 15, yPos);
    addPolishText(doc, 'Przesylam oferte na zamowione towary zgodnie z Panstwa zapytaniem.', 15, yPos + 8);

    // === TABELA Z POZYCJAMI ===
    yPos = 130;
    
    // Przygotuj dane do tabeli z konwersją polskich znaków
    const tableData = items.map((item, index) => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const vatRate = parseFloat(item.vat_rate) || 0;
      const grossAmount = parseFloat(item.gross_amount) || 0;
      
      return [
        String(index + 1),
        convertPolishChars(String(item.product_name || '')),
        `${quantity} ${item.unit || ''}`,
        `${unitPrice.toFixed(2)} zl`,
        `${vatRate}%`,
        `${grossAmount.toFixed(2)} zl`
      ];
    });

    // Dodaj dodatkowe koszty jeśli istnieją
    const additionalCosts = parseFloat(offer.additional_costs) || 0;
    if (additionalCosts > 0) {
      const additionalGross = additionalCosts * 1.23;
      tableData.push([
        '',
        convertPolishChars(String(offer.additional_costs_description || 'Dodatkowe koszty')),
        '1 usl',
        `${additionalCosts.toFixed(2)} zl`,
        '23%',
        `${additionalGross.toFixed(2)} zl`
      ]);
    }

    // Stwórz tabelę - ZMNIEJSZONA SZEROKOŚĆ, wyrównana do marginesów
    autoTable(doc, {
      startY: yPos,
      head: [[
        'Lp.', 
        convertPolishChars('Nazwa towaru/uslugi'), 
        convertPolishChars('Ilosc'), 
        'Cena netto', 
        'VAT', 
        convertPolishChars('Wartosc brutto')
      ]],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [59, 74, 92],
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: 3
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 85, halign: 'left' },
        2: { halign: 'center', cellWidth: 18 },
        3: { halign: 'right', cellWidth: 24 },
        4: { halign: 'center', cellWidth: 12 },
        5: { halign: 'right', cellWidth: 26 }
      },
      alternateRowStyles: {
        fillColor: [248, 249, 250]
      },
      styles: {
        lineColor: [200, 200, 200],
        lineWidth: 0.3,
        fontSize: 9
      },
      tableWidth: 175,
      margin: { left: 15, right: 15 }
    });

    // === PODSUMOWANIE I WARUNKI OBOK SIEBIE ===
    yPos = (doc as any).lastAutoTable.finalY + 15;
    
    const totalNet = parseFloat(offer.total_net) || 0;
    const totalVat = parseFloat(offer.total_vat) || 0;
    const totalGross = parseFloat(offer.total_gross) || 0;

    // LEWA STRONA - WARUNKI OFERTY
    const leftBoxWidth = 90;
    const leftBoxX = 15;
    
    doc.setFillColor(248, 249, 250);
    doc.setDrawColor(200, 200, 200);
    doc.roundedRect(leftBoxX, yPos, leftBoxWidth, 50, 2, 2, 'FD');
    
    doc.setTextColor(59, 74, 92);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    addPolishText(doc, 'WARUNKI OFERTY:', leftBoxX + 5, yPos + 10);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    const deliveryDays = parseInt(offer.delivery_days) || 0;
    const validDays = parseInt(offer.valid_days) || 30;
    
    const conditions = [
      `• Czas dostawy: ${deliveryDays} dni roboczych`,
      `• Waznosc: ${validDays} dni`,
      `• Platnosc: przelew 14 dni`,
      `• Ceny zawieraja VAT`
    ];
    
    conditions.forEach((condition, index) => {
      addPolishText(doc, condition, leftBoxX + 5, yPos + 18 + (index * 7));
    });

    // PRAWA STRONA - PODSUMOWANIE
    const rightBoxWidth = 80;
    const rightBoxX = pageWidth - rightBoxWidth - 15;
    
    doc.setFillColor(248, 249, 250);
    doc.setDrawColor(200, 200, 200);
    doc.roundedRect(rightBoxX, yPos, rightBoxWidth, 35, 2, 2, 'FD');

    // Podsumowanie
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    addPolishText(doc, 'Wartosc netto:', rightBoxX + 5, yPos + 10);
    addPolishText(doc, `${totalNet.toFixed(2)} zl`, rightBoxX + rightBoxWidth - 5, yPos + 10, { align: 'right' });
    
    addPolishText(doc, 'VAT:', rightBoxX + 5, yPos + 18);
    addPolishText(doc, `${totalVat.toFixed(2)} zl`, rightBoxX + rightBoxWidth - 5, yPos + 18, { align: 'right' });
    
    // Linia separująca
    doc.setDrawColor(59, 74, 92);
    doc.setLineWidth(0.5);
    doc.line(rightBoxX + 5, yPos + 22, rightBoxX + rightBoxWidth - 5, yPos + 22);

    // RAZEM - większa czcionka
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(59, 74, 92);
    addPolishText(doc, 'RAZEM DO ZAPLATY:', rightBoxX + 5, yPos + 30);
    addPolishText(doc, `${totalGross.toFixed(2)} zl`, rightBoxX + rightBoxWidth - 5, yPos + 30, { align: 'right' });

    // === UWAGI (jeśli istnieją) ===
    if (offer.notes) {
      yPos += 60; // Zwiększony odstęp bo teraz mamy dwie ramki
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      addPolishText(doc, 'UWAGI:', 15, yPos);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const convertedNotes = convertPolishChars(String(offer.notes));
      const noteLines = doc.splitTextToSize(convertedNotes, pageWidth - 30);
      doc.text(noteLines, 15, yPos + 8);
      yPos += noteLines.length * 5 + 8;
    }

    // === STOPKA ===
    yPos = Math.max(yPos + 60, 260); // Zwiększony odstęp
    
    // Linia separująca
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(15, yPos, pageWidth - 15, yPos);
    
    yPos += 8;
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    addPolishText(doc, 'W celu realizacji zamowienia prosze o kontakt:', 15, yPos);
    addPolishText(doc, `Email: ${offer.created_by_email || ''} | Tel: +48 123 456 789`, 15, yPos + 6);
    
    yPos += 15;
    addPolishText(doc, 'Dziekujemy za zainteresowanie nasza oferta.', 15, yPos);
    addPolishText(doc, 'Pozdrawiamy,', 15, yPos + 6);
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 74, 92);
    addPolishText(doc, `${offer.created_by_name || ''} | GRUPA ELTRON`, 15, yPos + 12);

    // Generuj PDF jako buffer
    const pdfBuffer = doc.output('arraybuffer');

    // Zwróć PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Oferta_${offer.id}_${String(offer.client_name || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`
      }
    });

  } catch (error) {
    console.error('💥 PDF generation error:', error);
    console.error('💥 Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Błąd generowania PDF: ' + (error instanceof Error ? error.message : 'Nieznany błąd') },
      { status: 500 }
    );
  }
}
