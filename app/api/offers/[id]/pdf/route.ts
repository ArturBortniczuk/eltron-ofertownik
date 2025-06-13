// app/api/offers/[id]/pdf/route.ts - NAPRAWIONA WERSJA
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

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

    // Generuj HTML do PDF
    const html = generateOfferHTML(offer, items);

    // Zwróć HTML jako fallback jeśli jsPDF nie działa
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="Oferta_${offer.id}_${offer.client_name.replace(/[^a-zA-Z0-9]/g, '_')}.html"`
      }
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Błąd generowania PDF: ' + error.message },
      { status: 500 }
    );
  }
}

function generateOfferHTML(offer: any, items: any[]) {
  const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
  const validUntil = new Date(Date.now() + offer.valid_days * 24 * 60 * 60 * 1000).toLocaleDateString('pl-PL');

  const itemsHTML = items.map((item, index) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${index + 1}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.product_name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity} ${item.unit}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${item.unit_price.toFixed(2)} zł</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.vat_rate}%</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${item.gross_amount.toFixed(2)} zł</td>
    </tr>
  `).join('');

  const additionalCostsHTML = offer.additional_costs > 0 ? `
    <tr style="border-top: 2px solid #333;">
      <td style="padding: 8px; border-bottom: 1px solid #ddd;"></td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${offer.additional_costs_description || 'Dodatkowe koszty'}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">1 usł</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${offer.additional_costs.toFixed(2)} zł</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">23%</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${(offer.additional_costs * 1.23).toFixed(2)} zł</td>
    </tr>
  ` : '';

  return `
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Oferta Nr ${offer.id}/${new Date().getFullYear()}</title>
    <style>
        @media print {
            body { margin: 0; }
            .no-print { display: none; }
            @page { margin: 2cm; }
        }
        
        body {
            font-family: Arial, sans-serif;
            line-height: 1.4;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
            border-bottom: 2px solid #3B4A5C;
            padding-bottom: 20px;
        }
        
        .company-info {
            flex: 1;
        }
        
        .company-name {
            font-size: 24px;
            font-weight: bold;
            color: #3B4A5C;
            margin-bottom: 10px;
        }
        
        .offer-info {
            flex: 1;
            text-align: right;
        }
        
        .offer-title {
            font-size: 20px;
            font-weight: bold;
            color: #3B4A5C;
            margin-bottom: 10px;
        }
        
        .client-section {
            margin: 30px 0;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
        }
        
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 30px 0;
        }
        
        .items-table th {
            background: #3B4A5C;
            color: white;
            padding: 12px 8px;
            text-align: left;
            font-weight: bold;
        }
        
        .items-table th:first-child,
        .items-table th:nth-child(3),
        .items-table th:nth-child(5) {
            text-align: center;
        }
        
        .items-table th:nth-child(4),
        .items-table th:last-child {
            text-align: right;
        }
        
        .summary {
            margin-top: 30px;
            text-align: right;
        }
        
        .summary-table {
            margin-left: auto;
            border-collapse: collapse;
        }
        
        .summary-table td {
            padding: 8px 16px;
            border-bottom: 1px solid #ddd;
        }
        
        .summary-table .total-row {
            font-weight: bold;
            font-size: 18px;
            border-top: 2px solid #333;
            background: #f8f9fa;
        }
        
        .terms {
            margin: 40px 0;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
        }
        
        .footer {
            margin-top: 40px;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        
        .print-button {
            background: #3B4A5C;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            margin-bottom: 20px;
        }
        
        .print-button:hover {
            background: #2a3441;
        }
    </style>
</head>
<body>
    <div class="no-print">
        <button class="print-button" onclick="window.print()">🖨️ Drukuj / Zapisz jako PDF</button>
    </div>

    <div class="header">
        <div class="company-info">
            <div class="company-name">GRUPA ELTRON</div>
            <div>ul. Przykładowa 123</div>
            <div>00-000 Warszawa</div>
            <div>Tel: +48 123 456 789</div>
            <div>Email: kontakt@eltron.pl</div>
        </div>
        
        <div class="offer-info">
            <div class="offer-title">OFERTA Nr ${offer.id}/${new Date().getFullYear()}</div>
            <div>Data oferty: ${offerDate}</div>
            <div>Ważna do: ${validUntil}</div>
        </div>
    </div>

    <div class="client-section">
        <h3>Dla:</h3>
        <div style="font-weight: bold; font-size: 18px; margin-bottom: 8px;">${offer.client_name}</div>
        ${offer.client_email ? `<div>Email: ${offer.client_email}</div>` : ''}
        ${offer.client_phone ? `<div>Telefon: ${offer.client_phone}</div>` : ''}
    </div>

    <div>
        <p>Dzień dobry,</p>
        <p>Przesyłam ofertę na zamówione towary zgodnie z Państwa zapytaniem.</p>
    </div>

    <table class="items-table">
        <thead>
            <tr>
                <th>Lp.</th>
                <th>Nazwa towaru/usługi</th>
                <th>Ilość</th>
                <th>Cena netto</th>
                <th>VAT</th>
                <th>Wartość brutto</th>
            </tr>
        </thead>
        <tbody>
            ${itemsHTML}
            ${additionalCostsHTML}
        </tbody>
    </table>

    <div class="summary">
        <table class="summary-table">
            <tr>
                <td>Wartość netto:</td>
                <td style="text-align: right;">${offer.total_net.toFixed(2)} zł</td>
            </tr>
            <tr>
                <td>VAT:</td>
                <td style="text-align: right;">${offer.total_vat.toFixed(2)} zł</td>
            </tr>
            <tr class="total-row">
                <td>RAZEM DO ZAPŁATY:</td>
                <td style="text-align: right;">${offer.total_gross.toFixed(2)} zł</td>
            </tr>
        </table>
    </div>

    <div class="terms">
        <h3>Warunki:</h3>
        <ul>
            <li>Przewidywany czas dostawy: ${offer.delivery_days} dni roboczych</li>
            <li>Oferta ważna przez: ${offer.valid_days} dni</li>
            <li>Płatność: przelew 14 dni</li>
            <li>Ceny zawierają VAT</li>
        </ul>
        
        ${offer.notes ? `
        <h4>Uwagi:</h4>
        <p style="white-space: pre-wrap;">${offer.notes}</p>
        ` : ''}
    </div>

    <div class="footer">
        <p>W celu realizacji zamówienia proszę o kontakt:</p>
        <p><strong>Email:</strong> ${offer.created_by_email}</p>
        <p><strong>Tel:</strong> +48 123 456 789</p>
        <br>
        <p>Dziękujemy za zainteresowanie naszą ofertą.</p>
        <p>Pozdrawiamy,<br>
        <strong>${offer.created_by_name}</strong><br>
        GRUPA ELTRON</p>
    </div>

    <script>
        // Automatyczne otworzenie okna drukowania dla prawdziwego PDF
        // window.onload = function() {
        //     setTimeout(function() {
        //         window.print();
        //     }, 1000);
        // }
    </script>
</body>
</html>`;
}
