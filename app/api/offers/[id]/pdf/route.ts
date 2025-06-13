import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

// Dynamiczny import jsPDF żeby działał po stronie serwera
async function generatePDF(offer: any, items: any[]) {
  const { default: jsPDF } = await import('jspdf');
  
  // Dynamiczny import autoTable
  const autoTable = (await import('jspdf-autotable')).default;
  
  const doc = new jsPDF();
  
  // Dodaj autoTable do jsPDF
  (doc as any).autoTable = autoTable;
  
  // Ustaw polską czcionkę
  doc.setFont('helvetica');
  
  // Header firmy
  doc.setFontSize(20);
  doc.setTextColor(59, 74, 92);
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
  doc.text(offer.client_name || '', 120, 47);
  doc.setFont('helvetica', 'normal');
  
  if (offer.client_email) {
    doc.text(offer.client_email, 120, 54);
  }
  if (offer.client_phone) {
    doc.text(offer.client_phone, 120, 61);
  }

  // Data oferty
  const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
  const validUntil = new Date(Date.now() + (offer.valid_days * 24 * 60 * 60 * 1000)).toLocaleDateString('pl-PL');
  
  doc.text(`Data oferty: ${offerDate}`, 120, 75);
  doc.text(`Wazna do: ${validUntil}`, 120, 82);

  // Powitanie
  let yPosition = 100;
  doc.text('Dzien dobry,', 20, yPosition);
  yPosition += 10;
  doc.text('Przesylam oferte na zamowione towary zgodnie z Panstwa zapytaniem.', 20, yPosition);
  yPosition += 15;

  // Przygotuj dane do tabeli - KONWERTUJ WSZYSTKO NA STRINGI
  const tableData = items.map((item, index) => [
    (index + 1).toString(),
    item.product_name?.toString() || '',
    `${parseFloat(item.quantity) || 0} ${item.unit || ''}`,
    `${parseFloat(item.unit_price || 0).toFixed(2)} zl`,
    `${parseFloat(item.vat_rate || 0)}%`,
    `${parseFloat(item.gross_amount || 0).toFixed(2)} zl`
  ]);

  // Dodaj dodatkowe koszty jeśli istnieją
  if (parseFloat(offer.additional_costs || 0) > 0) {
    const additionalGross = parseFloat(offer.additional_costs || 0) * 1.23;
    tableData.push([
      '',
      offer.additional_costs_description?.toString() || 'Dodatkowe koszty',
      '1 usl',
      `${parseFloat(offer.additional_costs || 0).toFixed(2)} zl`,
      '23%',
      `${additionalGross.toFixed(2)} zl`
    ]);
  }

  // Tabela z pozycjami
  (doc as any).autoTable({
    startY: yPosition,
    head: [['Lp.', 'Nazwa towaru/uslugi', 'Ilosc', 'Cena netto', 'VAT', 'Wartosc brutto']],
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

  // Podsumowanie - KONWERTUJ NA LICZBY
  const totalNet = parseFloat(offer.total_net || 0);
  const totalVat = parseFloat(offer.total_vat || 0);
  const totalGross = parseFloat(offer.total_gross || 0);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('PODSUMOWANIE:', 20, yPosition);
  yPosition += 10;

  doc.setFont('helvetica', 'normal');
  doc.text(`Wartosc netto: ${totalNet.toFixed(2)} zl`, 20, yPosition);
  yPosition += 7;
  doc.text(`VAT: ${totalVat.toFixed(2)} zl`, 20, yPosition);
  yPosition += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`RAZEM DO ZAPLATY: ${totalGross.toFixed(2)} zl`, 20, yPosition);
  yPosition += 15;

  // Warunki
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Przewidywany czas dostawy: ${offer.delivery_days || 0} dni roboczych`, 20, yPosition);
  yPosition += 7;
  doc.text(`Oferta wazna przez: ${offer.valid_days || 0} dni`, 20, yPosition);
  yPosition += 7;

  // Dodatkowe uwagi jeśli istnieją
  if (offer.notes) {
    yPosition += 5;
    doc.text('Uwagi:', 20, yPosition);
    yPosition += 7;
    const noteLines = doc.splitTextToSize(offer.notes.toString(), 170);
    doc.text(noteLines, 20, yPosition);
    yPosition += noteLines.length * 5;
  }

  // Stopka
  yPosition += 15;
  doc.text('W celu realizacji zamowienia prosze o kontakt:', 20, yPosition);
  yPosition += 7;
  doc.text(`Email: ${offer.created_by_email || ''}`, 20, yPosition);
  yPosition += 7;
  doc.text('Tel: +48 123 456 789', 20, yPosition);
  yPosition += 10;
  doc.text('Dziekujemy za zainteresowanie nasza oferta.', 20, yPosition);
  yPosition += 7;
  doc.text('Pozdrawiamy,', 20, yPosition);
  yPosition += 7;
  doc.setFont('helvetica', 'bold');
  doc.text(offer.created_by_name?.toString() || '', 20, yPosition);
  yPosition += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('GRUPA ELTRON', 20, yPosition);

  return doc.output('arraybuffer');
}

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

    console.log('👤 User ID:', userId, 'Offer ID:', offerId);

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
      console.log('❌ Offer not found');
      return NextResponse.json({ error: 'Oferta nie została znaleziona' }, { status: 404 });
    }

    const offer = offerResult.rows[0];
    console.log('📋 Offer data:', {
      id: offer.id,
      client_name: offer.client_name,
      total_gross: offer.total_gross,
      type: typeof offer.total_gross
    });

    const itemsResult = await db.query(`
      SELECT * FROM offer_items
      WHERE offer_id = $1
      ORDER BY position_order
    `, [offerId]);

    const items = itemsResult.rows;
    console.log('📦 Items count:', items.length);
    
    if (items.length > 0) {
      console.log('📦 First item:', {
        name: items[0].product_name,
        unit_price: items[0].unit_price,
        type: typeof items[0].unit_price
      });
    }

    console.log('🔄 Generating PDF...');
    
    // Generuj PDF
    const pdfBuffer = await generatePDF(offer, items);
    
    console.log('✅ PDF generated successfully, size:', pdfBuffer.byteLength);

    // Zwróć PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Oferta_${offer.id}_${(offer.client_name || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`
      }
    });

  } catch (error) {
    console.error('💥 PDF generation error:', error);
    console.error('Stack trace:', error.stack);
    return NextResponse.json(
      { error: 'Błąd generowania PDF: ' + error.message },
      { status: 500 }
    );
  }
}
