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
    console.log('🔥 Starting PDF generation for offer:', params.id);
    
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
    const pageHeight = doc.internal.pageSize.height;
    
    // === HEADER Z LOGO I ADRESEM ===
    // Tło header
    doc.setFillColor(59, 74, 92); // eltron-primary
    doc.rect(0, 0, pageWidth, 50, 'F');
    
    // Logo/Nazwa firmy
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('GRUPA ELTRON', 15, 25);
    
    // Adres firmy (biały tekst)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('ul. Przykładowa 123, 00-000 Warszawa', 15, 35);
    doc.text('Tel: +48 123 456 789 | Email: kontakt@eltron.pl', 15, 42);

    // === TYTUŁ OFERTY (po prawej w header) ===
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    const offerTitle = `OFERTA Nr ${offer.id}/${new Date().getFullYear()}`;
    const titleWidth = doc.getTextWidth(offerTitle);
    doc.text(offerTitle, pageWidth - titleWidth - 15, 25);
    
    // Data oferty
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
    const validDays = parseInt(offer.valid_days) || 30;
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toLocaleDateString('pl-PL');
    
    const dateText = `Data: ${offerDate}`;
    const validText = `Ważna do: ${validUntil}`;
    doc.text(dateText, pageWidth - doc.getTextWidth(dateText) - 15, 35);
    doc.text(validText, pageWidth - doc.getTextWidth(validText) - 15, 42);

    // === DANE KLIENTA W RAMCE ===
    let yPos = 65;
    
    // Ramka dla klienta
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(15, yPos, pageWidth - 30, 40, 3, 3, 'FD');
    
    // Nagłówek "Dla:"
    doc.setTextColor(59, 74, 92);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DLA:', 20, yPos + 12);
    
    // Dane klienta
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(String(offer.client_name || ''), 20, yPos + 22);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    let clientYPos = yPos + 32;
    if (offer.client_email) {
      doc.text(`📧 ${offer.client_email}`, 20, clientYPos);
      clientYPos += 7;
    }
    if (offer.client_phone) {
      doc.text(`📞 ${offer.client_phone}`, 20, clientYPos);
    }

    // === POWITANIE ===
    yPos = 120;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Dzień dobry,', 15, yPos);
    doc.text('Przesyłam ofertę na zamówione towary zgodnie z Państwa zapytaniem.', 15, yPos + 10);

    // === TABELA Z POZYCJAMI ===
    yPos = 145;
    
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
        `${unitPrice.toFixed(2)} zł`,
        `${vatRate}%`,
        `${grossAmount.toFixed(2)} zł`
      ];
    });

    // Dodaj dodatkowe koszty jeśli istnieją
    const additionalCosts = parseFloat(offer.additional_costs) || 0;
    if (additionalCosts > 0) {
      const additionalGross = additionalCosts * 1.23;
      tableData.push([
        '',
        String(offer.additional_costs_description || 'Dodatkowe koszty'),
        '1 usł',
        `${additionalCosts.toFixed(2)} zł`,
        '23%',
        `${additionalGross.toFixed(2)} zł`
      ]);
    }

    // Stwórz tabelę z lepszym stylingiem
    autoTable(doc, {
      startY: yPos,
      head: [['Lp.', 'Nazwa towaru/usługi', 'Ilość', 'Cena netto', 'VAT', 'Wartość brutto']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [59, 74, 92],
        textColor: [255, 255, 255],
        fontSize: 11,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 10,
        cellPadding: 5
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { cellWidth: 85, halign: 'left' },
        2: { halign: 'center', cellWidth: 25 },
        3: { halign: 'right', cellWidth: 30 },
        4: { halign: 'center', cellWidth: 20 },
        5: { halign: 'right', cellWidth: 35 }
      },
      alternateRowStyles: {
        fillColor: [248, 249, 250]
      },
      styles: {
        lineColor: [200, 200, 200],
        lineWidth: 0.5
      }
    });

    // === PODSUMOWANIE W RAMCE ===
    yPos = (doc as any).lastAutoTable.finalY + 20;
    
    const totalNet = parseFloat(offer.total_net) || 0;
    const totalVat = parseFloat(offer.total_vat) || 0;
    const totalGross = parseFloat(offer.total_gross) || 0;

    // Ramka podsumowania
    const summaryWidth = 80;
    const summaryX = pageWidth - summaryWidth - 15;
    doc.setFillColor(248, 249, 250);
    doc.setDrawColor(200, 200, 200);
    doc.roundedRect(summaryX, yPos, summaryWidth, 35, 3, 3, 'FD');

    // Podsumowanie
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    doc.text('Wartość netto:', summaryX + 5, yPos + 10);
    doc.text(`${totalNet.toFixed(2)} zł`, summaryX + summaryWidth - 5, yPos + 10, { align: 'right' });
    
    doc.text('VAT:', summaryX + 5, yPos + 18);
    doc.text(`${totalVat.toFixed(2)} zł`, summaryX + summaryWidth - 5, yPos + 18, { align: 'right' });
    
    // Linia separująca
    doc.setDrawColor(59, 74, 92);
    doc.setLineWidth(1);
    doc.line(summaryX + 5, yPos + 22, summaryX + summaryWidth - 5, yPos + 22);

    // RAZEM - większa czcionka
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(59, 74, 92);
    doc.text('RAZEM DO ZAPŁATY:', summaryX + 5, yPos + 30);
    doc.text(`${totalGross.toFixed(2)} zł`, summaryX + summaryWidth - 5, yPos + 30, { align: 'right' });

    // === WARUNKI ===
    yPos += 50;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('WARUNKI OFERTY:', 15, yPos);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const deliveryDays = parseInt(offer.delivery_days) || 0;
    
    const conditions = [
      `• Przewidywany czas dostawy: ${deliveryDays} dni roboczych`,
      `• Oferta ważna przez: ${validDays} dni`,
      `• Płatność: przelew 14 dni`,
      `• Ceny zawierają VAT`
    ];
    
    conditions.forEach((condition, index) => {
      doc.text(condition, 15, yPos + 12 + (index * 7));
    });

    // === UWAGI (jeśli istnieją) ===
    if (offer.notes) {
      yPos += 50;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('UWAGI:', 15, yPos);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const noteLines = doc.splitTextToSize(String(offer.notes), pageWidth - 30);
      doc.text(noteLines, 15, yPos + 10);
      yPos += noteLines.length * 5 + 10;
    }

    // === STOPKA ===
    yPos = Math.max(yPos + 20, pageHeight - 60);
    
    // Linia separująca
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(15, yPos, pageWidth - 15, yPos);
    
    yPos += 10;
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    doc.text('W celu realizacji zamówienia proszę o kontakt:', 15, yPos);
    doc.text(`📧 ${offer.created_by_email || ''} | 📞 +48 123 456 789`, 15, yPos + 8);
    
    yPos += 20;
    doc.text('Dziękujemy za zainteresowanie naszą ofertą.', 15, yPos);
    doc.text('Pozdrawiamy,', 15, yPos + 8);
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 74, 92);
    doc.text(`${offer.created_by_name || ''} | GRUPA ELTRON`, 15, yPos + 16);

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
