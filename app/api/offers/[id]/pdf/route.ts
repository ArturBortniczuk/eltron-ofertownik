import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

// Importuj jsPDF i autoTable
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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

    // Funkcja do właściwej konwersji polskich znaków dla jsPDF
    const fixPolishChars = (text: string): string => {
      if (!text) return '';
      
      return String(text)
        // Używamy jednostek Unicode które jsPDF rozumie
        .replace(/ą/g, '\u0105') // ą
        .replace(/Ą/g, '\u0104') // Ą
        .replace(/ć/g, '\u0107') // ć
        .replace(/Ć/g, '\u0106') // Ć
        .replace(/ę/g, '\u0119') // ę
        .replace(/Ę/g, '\u0118') // Ę
        .replace(/ł/g, '\u0142') // ł
        .replace(/Ł/g, '\u0141') // Ł
        .replace(/ń/g, '\u0144') // ń
        .replace(/Ń/g, '\u0143') // Ń
        .replace(/ó/g, '\u00F3') // ó
        .replace(/Ó/g, '\u00D3') // Ó
        .replace(/ś/g, '\u015B') // ś
        .replace(/Ś/g, '\u015A') // Ś
        .replace(/ź/g, '\u017A') // ź
        .replace(/Ź/g, '\u0179') // Ź
        .replace(/ż/g, '\u017C') // ż
        .replace(/Ż/g, '\u017B'); // Ż
    };

    // Stwórz nowy dokument PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    // === DODAJ OBSŁUGĘ UNICODE ===
    // Ustaw encoding na UTF-8
    (doc.internal as any).write = function(string: string) {
      // Konwertuj string do UTF-8 bytes
      const utf8String = unescape(encodeURIComponent(string));
      return this.originalWrite ? this.originalWrite(utf8String) : string;
    };
    
    // Dodaj metadane PDF
    doc.setProperties({
      title: fixPolishChars(`Oferta ${offer.id}`),
      creator: 'Grupa Eltron'
    });
    
    // === HEADER Z LOGO I ADRESEM ===
    doc.setFillColor(59, 74, 92);
    doc.rect(0, 0, pageWidth, 45, 'F');
    
    // Logo/Nazwa firmy
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('GRUPA ELTRON', 15, 20);
    
    // Adres firmy
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(fixPolishChars('ul. Przykładowa 123, 00-000 Warszawa'), 15, 30);
    doc.text('Tel: +48 123 456 789 | Email: kontakt@eltron.pl', 15, 37);

    // === TYTUŁ OFERTY ===
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    const offerTitle = `OFERTA Nr ${offer.id}/${new Date().getFullYear()}`;
    const titleWidth = doc.getTextWidth(offerTitle);
    doc.text(offerTitle, pageWidth - titleWidth - 15, 20);
    
    // Data oferty
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
    const validDays = parseInt(offer.valid_days) || 30;
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toLocaleDateString('pl-PL');
    
    const dateText = `Data: ${offerDate}`;
    const validText = fixPolishChars(`Ważna do: ${validUntil}`);
    doc.text(dateText, pageWidth - doc.getTextWidth(dateText) - 15, 30);
    doc.text(validText, pageWidth - doc.getTextWidth(validText) - 15, 37);

    // === DANE KLIENTA ===
    let yPos = 55;
    
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(15, yPos, pageWidth - 30, 40, 2, 2, 'FD');
    
    doc.setTextColor(59, 74, 92);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DLA:', 20, yPos + 10);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(fixPolishChars(String(offer.client_name || '')), 20, yPos + 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    let clientYPos = yPos + 28;
    
    if (offer.client_email) {
      doc.text(`Email: ${offer.client_email}`, 20, clientYPos);
    }
    if (offer.client_nip) {
      doc.text(`NIP: ${offer.client_nip}`, 120, clientYPos);
    }
    
    if (offer.client_phone) {
      clientYPos += 7;
      doc.text(`Tel: ${offer.client_phone}`, 20, clientYPos);
    }

    // === POWITANIE ===
    yPos = 110;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(fixPolishChars('Dzień dobry,'), 15, yPos);
    doc.text(fixPolishChars('Przesyłam ofertę na zamówione towary zgodnie z Państwa zapytaniem.'), 15, yPos + 8);

    // === TABELA Z POZYCJAMI ===
    yPos = 130;
    
    // Przygotuj dane do tabeli z polskimi znakami
    const tableData = items.map((item, index) => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const vatRate = parseFloat(item.vat_rate) || 0;
      const grossAmount = parseFloat(item.gross_amount) || 0;
      
      return [
        String(index + 1),
        fixPolishChars(String(item.product_name || '')),
        fixPolishChars(`${quantity} ${item.unit || ''}`),
        `${unitPrice.toFixed(2)} zł`,
        `${vatRate}%`,
        fixPolishChars(`${grossAmount.toFixed(2)} zł`)
      ];
    });

    // Dodaj dodatkowe koszty
    const additionalCosts = parseFloat(offer.additional_costs) || 0;
    if (additionalCosts > 0) {
      const additionalGross = additionalCosts * 1.23;
      tableData.push([
        '',
        fixPolishChars(String(offer.additional_costs_description || 'Dodatkowe koszty')),
        fixPolishChars('1 usł'),
        `${additionalCosts.toFixed(2)} zł`,
        '23%',
        fixPolishChars(`${additionalGross.toFixed(2)} zł`)
      ]);
    }

    // Stwórz tabelę z polskimi znakami
    autoTable(doc, {
      startY: yPos,
      head: [[
        'Lp.', 
        fixPolishChars('Nazwa towaru/usługi'), 
        fixPolishChars('Ilość'), 
        'Cena netto', 
        'VAT', 
        fixPolishChars('Wartość brutto')
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

    // === PODSUMOWANIE I WARUNKI ===
    yPos = (doc as any).lastAutoTable.finalY + 15;
    
    const totalNet = parseFloat(offer.total_net) || 0;
    const totalVat = parseFloat(offer.total_vat) || 0;
    const totalGross = parseFloat(offer.total_gross) || 0;

    // WARUNKI OFERTY
    const leftBoxWidth = 90;
    const leftBoxX = 15;
    
    doc.setFillColor(248, 249, 250);
    doc.setDrawColor(200, 200, 200);
    doc.roundedRect(leftBoxX, yPos, leftBoxWidth, 50, 2, 2, 'FD');
    
    doc.setTextColor(59, 74, 92);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('WARUNKI OFERTY:', leftBoxX + 5, yPos + 10);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    const deliveryDays = parseInt(offer.delivery_days) || 0;
    
    const conditions = [
      fixPolishChars(`• Czas dostawy: ${deliveryDays} dni roboczych`),
      fixPolishChars(`• Ważność: ${validDays} dni`),
      fixPolishChars(`• Płatność: przelew 14 dni`),
      fixPolishChars(`• Ceny zawierają VAT`)
    ];
    
    conditions.forEach((condition, index) => {
      doc.text(condition, leftBoxX + 5, yPos + 18 + (index * 7));
    });

    // PODSUMOWANIE
    const rightBoxWidth = 80;
    const rightBoxX = pageWidth - rightBoxWidth - 15;
    
    doc.setFillColor(248, 249, 250);
    doc.setDrawColor(200, 200, 200);
    doc.roundedRect(rightBoxX, yPos, rightBoxWidth, 35, 2, 2, 'FD');

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    doc.text(fixPolishChars('Wartość netto:'), rightBoxX + 5, yPos + 10);
    doc.text(`${totalNet.toFixed(2)} zł`, rightBoxX + rightBoxWidth - 5, yPos + 10, { align: 'right' });
    
    doc.text('VAT:', rightBoxX + 5, yPos + 18);
    doc.text(`${totalVat.toFixed(2)} zł`, rightBoxX + rightBoxWidth - 5, yPos + 18, { align: 'right' });
    
    doc.setDrawColor(59, 74, 92);
    doc.setLineWidth(0.5);
    doc.line(rightBoxX + 5, yPos + 22, rightBoxX + rightBoxWidth - 5, yPos + 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(59, 74, 92);
    doc.text(fixPolishChars('RAZEM DO ZAPŁATY:'), rightBoxX + 5, yPos + 30);
    doc.text(`${totalGross.toFixed(2)} zł`, rightBoxX + rightBoxWidth - 5, yPos + 30, { align: 'right' });

    // === UWAGI ===
    if (offer.notes) {
      yPos += 60;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('UWAGI:', 15, yPos);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const convertedNotes = fixPolishChars(String(offer.notes));
      const noteLines = doc.splitTextToSize(convertedNotes, pageWidth - 30);
      doc.text(noteLines, 15, yPos + 8);
      yPos += noteLines.length * 5 + 8;
    }

    // === STOPKA ===
    yPos = Math.max(yPos + 60, 260);
    
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(15, yPos, pageWidth - 15, yPos);
    
    yPos += 8;
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    doc.text(fixPolishChars('W celu realizacji zamówienia proszę o kontakt:'), 15, yPos);
    doc.text(`Email: ${offer.created_by_email || ''} | Tel: +48 123 456 789`, 15, yPos + 6);
    
    yPos += 15;
    doc.text(fixPolishChars('Dziękujemy za zainteresowanie naszą ofertą.'), 15, yPos);
    doc.text('Pozdrawiamy,', 15, yPos + 6);
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 74, 92);
    doc.text(fixPolishChars(`${offer.created_by_name || ''} | GRUPA ELTRON`), 15, yPos + 12);

    // Generuj PDF
    const pdfBuffer = doc.output('arraybuffer');

    // Zwróć PDF z polskimi znakami
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Oferta_${offer.id}_${String(offer.client_name || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`
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
