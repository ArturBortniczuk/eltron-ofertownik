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

    // Stwórz nowy dokument PDF z UTF-8
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const pageWidth = doc.internal.pageSize.width;
    
    // KRYTYCZNE: Ustaw kodowanie UTF-8
    (doc as any).setCharSpace = function(space: number) {
      this.internal.write('BT');
      this.internal.write(space + ' Tc');
      this.internal.write('ET');
    };

    // Funkcja do bezpiecznego dodawania tekstu z polskimi znakami
    function addText(text: string, x: number, y: number, options: any = {}) {
      if (!text) text = '';
      
      try {
        // Konwertuj do UTF-8 przez encoder
        const utf8Text = decodeURIComponent(encodeURIComponent(String(text)));
        doc.text(utf8Text, x, y, options);
      } catch (error) {
        // Fallback - użyj podstawowej konwersji
        const simpleConversion = String(text)
          .replace(/ą/g, 'a').replace(/Ą/g, 'A')
          .replace(/ć/g, 'c').replace(/Ć/g, 'C')
          .replace(/ę/g, 'e').replace(/Ę/g, 'E')
          .replace(/ł/g, 'l').replace(/Ł/g, 'L')
          .replace(/ń/g, 'n').replace(/Ń/g, 'N')
          .replace(/ó/g, 'o').replace(/Ó/g, 'O')
          .replace(/ś/g, 's').replace(/Ś/g, 'S')
          .replace(/ź/g, 'z').replace(/Ź/g, 'Z')
          .replace(/ż/g, 'z').replace(/Ż/g, 'Z');
        
        doc.text(simpleConversion, x, y, options);
      }
    }

    // Funkcja do konwersji tekstu dla tabel
    function convertText(text: string): string {
      if (!text) return '';
      
      try {
        // Spróbuj zachować UTF-8
        return decodeURIComponent(encodeURIComponent(String(text)));
      } catch (error) {
        // Fallback
        return String(text)
          .replace(/ą/g, 'a').replace(/Ą/g, 'A')
          .replace(/ć/g, 'c').replace(/Ć/g, 'C')
          .replace(/ę/g, 'e').replace(/Ę/g, 'E')
          .replace(/ł/g, 'l').replace(/Ł/g, 'L')
          .replace(/ń/g, 'n').replace(/Ń/g, 'N')
          .replace(/ó/g, 'o').replace(/Ó/g, 'O')
          .replace(/ś/g, 's').replace(/Ś/g, 'S')
          .replace(/ź/g, 'z').replace(/Ź/g, 'Z')
          .replace(/ż/g, 'z').replace(/Ż/g, 'Z');
      }
    }
    
    // Dodaj metadane PDF z UTF-8
    doc.setProperties({
      title: `Oferta ${offer.id}`,
      creator: 'Grupa Eltron',
      subject: 'Oferta handlowa'
    });
    
    // === HEADER Z LOGO I ADRESEM ===
    doc.setFillColor(59, 74, 92);
    doc.rect(0, 0, pageWidth, 45, 'F');
    
    // Logo/Nazwa firmy
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    addText('GRUPA ELTRON', 15, 20);
    
    // Adres firmy
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    addText('ul. Przykladowa 123, 00-000 Warszawa', 15, 30);
    addText('Tel: +48 123 456 789 | Email: kontakt@eltron.pl', 15, 37);

    // === TYTUŁ OFERTY ===
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    const offerTitle = `OFERTA Nr ${offer.id}/${new Date().getFullYear()}`;
    const titleWidth = doc.getTextWidth(offerTitle);
    addText(offerTitle, pageWidth - titleWidth - 15, 20);
    
    // Data oferty
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
    const validDays = parseInt(offer.valid_days) || 30;
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toLocaleDateString('pl-PL');
    
    const dateText = `Data: ${offerDate}`;
    const validText = `Wazna do: ${validUntil}`;
    addText(dateText, pageWidth - doc.getTextWidth(dateText) - 15, 30);
    addText(validText, pageWidth - doc.getTextWidth(validText) - 15, 37);

    // === DANE KLIENTA ===
    let yPos = 55;
    
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(15, yPos, pageWidth - 30, 40, 2, 2, 'FD');
    
    doc.setTextColor(59, 74, 92);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    addText('DLA:', 20, yPos + 10);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    addText(String(offer.client_name || ''), 20, yPos + 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    let clientYPos = yPos + 28;
    
    if (offer.client_email) {
      addText(`Email: ${offer.client_email}`, 20, clientYPos);
    }
    if (offer.client_nip) {
      addText(`NIP: ${offer.client_nip}`, 120, clientYPos);
    }
    
    if (offer.client_phone) {
      clientYPos += 7;
      addText(`Tel: ${offer.client_phone}`, 20, clientYPos);
    }

    // === POWITANIE ===
    yPos = 110;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    addText('Dzien dobry,', 15, yPos);
    addText('Przesylam oferte na zamowione towary zgodnie z Panstwa zapytaniem.', 15, yPos + 8);

    // === TABELA Z POZYCJAMI ===
    yPos = 130;
    
    // Przygotuj dane do tabeli
    const tableData = items.map((item, index) => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const vatRate = parseFloat(item.vat_rate) || 0;
      const grossAmount = parseFloat(item.gross_amount) || 0;
      
      return [
        String(index + 1),
        convertText(String(item.product_name || '')),
        `${quantity} ${item.unit || ''}`,
        `${unitPrice.toFixed(2)} zl`,
        `${vatRate}%`,
        `${grossAmount.toFixed(2)} zl`
      ];
    });

    // Dodaj dodatkowe koszty
    const additionalCosts = parseFloat(offer.additional_costs) || 0;
    if (additionalCosts > 0) {
      const additionalGross = additionalCosts * 1.23;
      tableData.push([
        '',
        convertText(String(offer.additional_costs_description || 'Dodatkowe koszty')),
        '1 usl',
        `${additionalCosts.toFixed(2)} zl`,
        '23%',
        `${additionalGross.toFixed(2)} zl`
      ]);
    }

    // Stwórz tabelę z lepszym obsługiwaniem UTF-8
    autoTable(doc, {
      startY: yPos,
      head: [[
        'Lp.', 
        convertText('Nazwa towaru/uslugi'), 
        convertText('Ilosc'), 
        'Cena netto', 
        'VAT', 
        convertText('Wartosc brutto')
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
      margin: { left: 15, right: 15 },
      // Dodaj obsługę UTF-8 dla autoTable
      didParseCell: function(data) {
        if (data.cell.text && Array.isArray(data.cell.text)) {
          data.cell.text = data.cell.text.map(text => convertText(text));
        }
      }
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
    addText('WARUNKI OFERTY:', leftBoxX + 5, yPos + 10);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    const deliveryDays = parseInt(offer.delivery_days) || 0;
    
    const conditions = [
      `• Czas dostawy: ${deliveryDays} dni roboczych`,
      `• Waznosc: ${validDays} dni`,
      `• Platnosc: przelew 14 dni`,
      `• Ceny zawieraja VAT`
    ];
    
    conditions.forEach((condition, index) => {
      addText(condition, leftBoxX + 5, yPos + 18 + (index * 7));
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
    
    addText('Wartosc netto:', rightBoxX + 5, yPos + 10);
    addText(`${totalNet.toFixed(2)} zl`, rightBoxX + rightBoxWidth - 5, yPos + 10, { align: 'right' });
    
    addText('VAT:', rightBoxX + 5, yPos + 18);
    addText(`${totalVat.toFixed(2)} zl`, rightBoxX + rightBoxWidth - 5, yPos + 18, { align: 'right' });
    
    doc.setDrawColor(59, 74, 92);
    doc.setLineWidth(0.5);
    doc.line(rightBoxX + 5, yPos + 22, rightBoxX + rightBoxWidth - 5, yPos + 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(59, 74, 92);
    addText('RAZEM DO ZAPLATY:', rightBoxX + 5, yPos + 30);
    addText(`${totalGross.toFixed(2)} zl`, rightBoxX + rightBoxWidth - 5, yPos + 30, { align: 'right' });

    // === UWAGI ===
    if (offer.notes) {
      yPos += 60;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      addText('UWAGI:', 15, yPos);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const convertedNotes = convertText(String(offer.notes));
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
    
    addText('W celu realizacji zamowienia prosze o kontakt:', 15, yPos);
    addText(`Email: ${offer.created_by_email || ''} | Tel: +48 123 456 789`, 15, yPos + 6);
    
    yPos += 15;
    addText('Dziekujemy za zainteresowanie nasza oferta.', 15, yPos);
    addText('Pozdrawiamy,', 15, yPos + 6);
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 74, 92);
    addText(`${offer.created_by_name || ''} | GRUPA ELTRON`, 15, yPos + 12);

    // Generuj PDF z właściwym kodowaniem
    const pdfBuffer = doc.output('arraybuffer');

    // Zwróć PDF z UTF-8 header
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf; charset=utf-8',
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
