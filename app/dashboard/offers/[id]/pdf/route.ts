import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Rozszerzenie interfejsu jsPDF o autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => void;
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

    // Generuj PDF
    const doc = new jsPDF();
    
    // Ustaw polską czcionkę (podstawową)
    doc.setFont('helvetica');
    
    // Header firmy
    doc.setFontSize(20);
    doc.setTextColor(59, 74, 92); // Kolor eltron-primary
    doc.text('GRUPA ELTRON', 20, 25);
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('ul. Przykładowa 123', 20, 35);
    doc.text('00-000 Warszawa', 20, 42);
    doc.text('Tel: +48 123 456 789', 20, 49);
    doc.text('Email: kontakt@eltron.pl', 20, 56);

    // Tytuł oferty
    doc.setFontSize(16);
    doc.setTextColor(59, 74, 92);
    doc.text(`OFERTA Nr ${offer.id}/${new Date().getFullYear()}`, 120, 25);

    // Dane klienta
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Dla:', 120, 40);
    doc.setFont('helvetica', 'bold');
    doc.text(offer.client_name, 120, 47);
    doc.setFont('helvetica', 'normal');
    
    if (offer.client_email) {
      doc.text(offer.client_email, 120, 54);
    }
    if (offer.client_phone) {
      doc.text(offer.client_phone, 120, 61);
    }

    // Data oferty
    const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
    const validUntil = new Date(Date.now() + offer.valid_days * 24 * 60 * 60 * 1000).toLocaleDateString('pl-PL');
    
    doc.text(`Data oferty: ${offerDate}`, 120, 75);
    doc.text(`Ważna do: ${validUntil}`, 120, 82);

    // Powitanie
    let yPosition = 100;
    doc.text('Dzień dobry,', 20, yPosition);
    yPosition += 10;
    doc.text('Przesyłam ofertę na zamówione towary zgodnie z Państwa zapytaniem.', 20, yPosition);
    yPosition += 15;

    // Tabela z pozycjami
    const tableData = items.map((item, index) => [
      (index + 1).toString(),
      item.product_name,
      `${item.quantity} ${item.unit}`,
      `${item.unit_price.toFixed(2)} zł`,
      `${item.vat_rate}%`,
      `${item.gross_amount.toFixed(2)} zł`
    ]);

    // Dodaj dodatkowe koszty jeśli istnieją
    if (offer.additional_costs > 0) {
      const additionalGross = offer.additional_costs * 1.23; // VAT 23%
      tableData.push([
        '',
        offer.additional_costs_description || 'Dodatkowe koszty',
        '1 usł',
        `${offer.additional_costs.toFixed(2)} zł`,
        '23%',
        `${additionalGross.toFixed(2)} zł`
      ]);
    }

    doc.autoTable({
      startY: yPosition,
      head: [['Lp.', 'Nazwa towaru/usługi', 'Ilość', 'Cena netto', 'VAT', 'Wartość brutto']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [59, 74, 92],
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 9
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { cellWidth: 80 },
        2: { halign: 'center', cellWidth: 25 },
        3: { halign: 'right', cellWidth: 30 },
        4: { halign: 'center', cellWidth: 20 },
        5: { halign: 'right', cellWidth: 30 }
      }
    });

    // Pozycja po tabeli
    yPosition = (doc as any).lastAutoTable.finalY + 15;

    // Podsumowanie
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PODSUMOWANIE:', 20, yPosition);
    yPosition += 10;

    doc.setFont('helvetica', 'normal');
    doc.text(`Wartość netto: ${offer.total_net.toFixed(2)} zł`, 20, yPosition);
    yPosition += 7;
    doc.text(`VAT: ${offer.total_vat.toFixed(2)} zł`, 20, yPosition);
    yPosition += 7;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`RAZEM DO ZAPŁATY: ${offer.total_gross.toFixed(2)} zł`, 20, yPosition);
    yPosition += 15;

    // Warunki
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Przewidywany czas dostawy: ${offer.delivery_days} dni roboczych`, 20, yPosition);
    yPosition += 7;
    doc.text(`Oferta ważna przez: ${offer.valid_days} dni`, 20, yPosition);
    yPosition += 7;

    // Dodatkowe uwagi jeśli istnieją
    if (offer.notes) {
      yPosition += 5;
      doc.text('Uwagi:', 20, yPosition);
      yPosition += 7;
      const noteLines = doc.splitTextToSize(offer.notes, 170);
      doc.text(noteLines, 20, yPosition);
      yPosition += noteLines.length * 5;
    }

    // Stopka
    yPosition += 15;
    doc.text('W celu realizacji zamówienia proszę o kontakt:', 20, yPosition);
    yPosition += 7;
    doc.text(`Email: ${offer.created_by_email}`, 20, yPosition);
    yPosition += 7;
    doc.text('Tel: +48 123 456 789', 20, yPosition);
    yPosition += 10;
    doc.text('Dziękujemy za zainteresowanie naszą ofertą.', 20, yPosition);
    yPosition += 7;
    doc.text('Pozdrawiamy,', 20, yPosition);
    yPosition += 7;
    doc.setFont('helvetica', 'bold');
    doc.text(offer.created_by_name, 20, yPosition);
    yPosition += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('GRUPA ELTRON', 20, yPosition);

    // Generuj PDF jako buffer
    const pdfBuffer = doc.output('arraybuffer');

    // Zwróć PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Oferta_${offer.id}_${offer.client_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`
      }
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Błąd generowania PDF' },
      { status: 500 }
    );
  }
}