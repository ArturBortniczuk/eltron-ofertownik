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
        u.email as created_by_email
      FROM offers o
      JOIN users u ON o.user_id = u.id
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
    
    // === HEADER Z LOGO I ADRESEM ===
    // Tło header
    doc.setFillColor(59, 74, 92);
    doc.rect(0, 0, pageWidth, 45, 'F');
    
    // Logo/Nazwa firmy
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('GRUPA ELTRON', 15, 20);
    
    // Adres firmy (biały tekst)
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('ul. Przykladowa 123, 00-000 Warszawa', 15, 30);
    doc.text('Tel: +48 123 456 789 | Email: kontakt@eltron.pl', 15, 37);

    // === TYTUŁ OFERTY (po prawej w header) ===
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
    const validText = `Wazna do: ${validUntil}`;
    doc.text(dateText, pageWidth - doc.getTextWidth(dateText) - 15, 30);
    doc.text(validText, pageWidth - doc.getTextWidth(validText) - 15, 37);

    // === DANE KLIENTA W RAMCE ===
    let yPos = 55;
    
    // Ramka dla klienta
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(15, yPos, pageWidth - 30, 35, 2, 2, 'FD');
    
    // Nagłówek "Dla:"
    doc.setTextColor(59, 74, 92);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DLA:', 20, yPos + 10);
    
    // Dane klienta
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(String(offer.client_name || ''), 20, yPos + 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    let clientYPos = yPos + 28;
    if (offer.client_email) {
      doc.text(`Email: ${offer.client_email}`, 20, clientYPos);
    }
    if (offer.client_phone && offer.client_email) {
      doc.text(`Tel: ${offer.client_phone}`, 120, clientYPos);
    } else if (offer.client_phone) {
      doc.text(`Tel: ${offer.client_phone}`, 20, clientYPos);
    }

    // === POWITANIE ===
    yPos = 105;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Dzien dobry,', 15, yPos);
    doc.text('Przesylam oferte na zamowione towary zgodnie z Panstwa zapytaniem.', 15, yPos + 8);

    // === TABELA Z POZYCJAMI ===
    yPos = 125;
    
    // Przygotuj dane do tabeli
    const tableData = items.map((item, index) => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const vatRate = parseFloat(item.vat_rate) || 0;
      const grossAmount = parseFloat(item.gross_amount) || 0;
      
      return [
        String(index + 1),
        String(item.product_name || ''),
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
        String(offer.additional_costs_description || 'Dodatkowe koszty'),
        '1 usl',
        `${additionalCosts.toFixed(2)} zl`,
        '23%',
        `${additionalGross.toFixed(2)} zl`
      ]);
    }

    // Stwórz tabelę - POPRAWIONE SZEROKOŚCI
    autoTable(doc, {
      startY: yPos,
      head: [['Lp.', 'Nazwa towaru/uslugi', 'Ilosc', 'Cena netto', 'VAT', 'Wartosc brutto']],
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
        0: { halign: 'center', cellWidth: 12 },      // Lp.
        1: { cellWidth: 95, halign: 'left' },        // Nazwa - szersze
        2: { halign: 'center', cellWidth: 20 },      // Ilość 
        3: { halign: 'right', cellWidth: 25 },       // Cena netto
        4: { halign: 'center', cellWidth: 15 },      // VAT
        5: { halign: 'right', cellWidth: 25 }        // Wartość brutto
      },
      alternateRowStyles: {
        fillColor: [248, 249, 250]
      },
      styles: {
        lineColor: [200, 200, 200],
        lineWidth: 0.3,
        fontSize: 9
      },
      tableWidth: 'wrap',
      margin: { left: 15, right: 15 }
    });

    // === PODSUMOWANIE W RAMCE ===
    yPos = (doc as any).lastAutoTable.finalY + 15;
    
    const totalNet = parseFloat(offer.total_net) || 0;
    const totalVat = parseFloat(offer.total_vat) || 0;
    const totalGross = parseFloat(offer.total_gross) || 0;

    // Ramka podsumowania
    const summaryWidth = 70;
    const summaryX = pageWidth - summaryWidth - 15;
    doc.setFillColor(248, 249, 250);
    doc.setDrawColor(200, 200, 200);
    doc.roundedRect(summaryX, yPos, summaryWidth, 30, 2, 2, 'FD');

    // Podsumowanie
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    doc.text('Wartosc netto:', summaryX + 5, yPos + 8);
    doc.text(`${totalNet.toFixed(2)} zl`, summaryX + summaryWidth - 5, yPos + 8, { align: 'right' });
    
    doc.text('VAT:', summaryX + 5, yPos + 15);
    doc.text(`${totalVat.toFixed(2)} zl`, summaryX + summaryWidth - 5, yPos + 15, { align: 'right' });
    
    // Linia separująca
    doc.setDrawColor(59, 74, 92);
    doc.setLineWidth(0.5);
    doc.line(summaryX + 5, yPos + 18, summaryX + summaryWidth - 5, yPos + 18);

    // RAZEM - większa czcionka
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(59, 74, 92);
    doc.text('RAZEM DO ZAPLATY:', summaryX + 5, yPos + 25);
    doc.text(`${totalGross.toFixed(2)} zl`, summaryX + summaryWidth - 5, yPos + 25, { align: 'right' });

    // === WARUNKI ===
    yPos += 45;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('WARUNKI OFERTY:', 15, yPos);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const deliveryDays = parseInt(offer.delivery_days) || 0;
    
    const conditions = [
      `- Przewidywany czas dostawy: ${deliveryDays} dni roboczych`,
      `- Oferta wazna przez: ${validDays} dni`,
      `- Platnosc: przelew 14 dni`,
      `- Ceny zawieraja VAT`
    ];
    
    conditions.forEach((condition, index) => {
      doc.text(condition, 15, yPos + 10 + (index * 6));
    });

    // === UWAGI (jeśli istnieją) ===
    if (offer.notes) {
      yPos += 40;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('UWAGI:', 15, yPos);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const noteLines = doc.splitTextToSize(String(offer.notes), pageWidth - 30);
      doc.text(noteLines, 15, yPos + 8);
      yPos += noteLines.length * 5 + 8;
    }

    // === STOPKA ===
    yPos = Math.max(yPos + 15, 240);
    
    // Linia separująca
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(15, yPos, pageWidth - 15, yPos);
    
    yPos += 8;
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    doc.text('W celu realizacji zamowienia prosze o kontakt:', 15, yPos);
    doc.text(`Email: ${offer.created_by_email || ''} | Tel: +48 123 456 789`, 15, yPos + 6);
    
    yPos += 15;
    doc.text('Dziekujemy za zainteresowanie nasza oferta.', 15, yPos);
    doc.text('Pozdrawiamy,', 15, yPos + 6);
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 74, 92);
    doc.text(`${offer.created_by_name || ''} | GRUPA ELTRON`, 15, yPos + 12);

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
