// app/api/offers/[id]/pdf-html/route.ts - NAPRAWIONA WERSJA
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';

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

    // Pobierz dane oferty
    const offerResult = await db.query(`
      SELECT 
        o.*,
        c.nip as client_nip,
        c.address as client_address
      FROM offers o
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

    // Generuj HTML
    const html = generateOfferHTML(offer, items);

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });

  } catch (error) {
    console.error('PDF HTML generation error:', error);
    return NextResponse.json(
      { error: 'Błąd generowania PDF' },
      { status: 500 }
    );
  }
}

function generateOfferHTML(offer: any, items: any[]): string {
  const formatCurrency = (amount: number) => {
    return `${amount.toFixed(2)} zł`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL');
  };

  const validUntil = new Date(
    new Date(offer.created_at).getTime() + offer.valid_days * 24 * 60 * 60 * 1000
  ).toLocaleDateString('pl-PL');

  const itemsHTML = items.map((item, index) => `
    <tr>
      <td style="text-align: center;">${index + 1}</td>
      <td>${item.product_name}</td>
      <td style="text-align: center;">${item.quantity} ${item.unit}</td>
      <td style="text-align: right;">${formatCurrency(item.unit_price)}</td>
      <td style="text-align: center;">${item.vat_rate}%</td>
      <td style="text-align: right;">${formatCurrency(item.net_amount)}</td>
      <td style="text-align: right;">${formatCurrency(item.gross_amount)}</td>
    </tr>
  `).join('');

  const additionalCostHTML = offer.additional_costs > 0 ? `
    <tr>
      <td style="text-align: center;">${items.length + 1}</td>
      <td>${offer.additional_costs_description || 'Dodatkowe koszty'}</td>
      <td style="text-align: center;">1 usł</td>
      <td style="text-align: right;">${formatCurrency(offer.additional_costs)}</td>
      <td style="text-align: center;">23%</td>
      <td style="text-align: right;">${formatCurrency(offer.additional_costs)}</td>
      <td style="text-align: right;">${formatCurrency(offer.additional_costs * 1.23)}</td>
    </tr>
  ` : '';

  return `<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Oferta ${offer.id} - ${offer.client_name}</title>
    <style>
        @page {
            size: A4;
            margin: 20mm;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 12px;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 20px;
            background: white;
        }
        
        .header {
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }
        
        .company-info {
            flex: 1;
        }
        
        .company-name {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
            color: #1f2937;
        }
        
        .company-details {
            font-size: 11px;
            color: #666;
            line-height: 1.4;
        }
        
        .offer-info {
            text-align: right;
            font-size: 11px;
            color: #666;
        }
        
        h1 {
            font-size: 20px;
            margin: 30px 0 20px 0;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
            text-align: center;
        }
        
        h2 {
            font-size: 16px;
            margin: 20px 0 10px 0;
            color: #444;
        }
        
        .client-info {
            margin-bottom: 20px;
            background-color: #f9fafb;
            padding: 15px;
            border-radius: 4px;
        }
        
        .client-name {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        
        th {
            background-color: #f5f5f5;
            font-weight: bold;
            font-size: 11px;
        }
        
        td {
            font-size: 11px;
        }
        
        .summary {
            margin-top: 30px;
            text-align: right;
        }
        
        .summary-table {
            display: inline-block;
            border: 1px solid #ddd;
        }
        
        .summary-table td {
            border: none;
            padding: 5px 15px;
            border-bottom: 1px solid #eee;
        }
        
        .summary-total {
            font-weight: bold;
            font-size: 14px;
            background-color: #f5f5f5;
        }
        
        .notes {
            margin-top: 30px;
            padding: 15px;
            background-color: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 4px;
        }
        
        .notes h3 {
            margin: 0 0 10px 0;
            color: #92400e;
        }
        
        .footer {
            margin-top: 50px;
            text-align: center;
            font-size: 11px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        
        .print-button {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #3B4A5C;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            z-index: 1000;
        }
        
        .print-button:hover {
            background: #2a3441;
        }
        
        @media print {
            body {
                padding: 0;
            }
            
            .print-button {
                display: none;
            }
            
            .header {
                display: flex;
            }
        }
        
        @media screen and (max-width: 768px) {
            .header {
                flex-direction: column;
            }
            
            .offer-info {
                text-align: left;
                margin-top: 15px;
            }
        }
    </style>
</head>
<body>
    <button class="print-button" onclick="window.print()">🖨️ Drukuj PDF</button>
    
    <div class="header">
        <div class="company-info">
            <div class="company-name">GRUPA ELTRON</div>
            <div class="company-details">
                ul. Przykładowa 123, 00-000 Warszawa<br>
                Tel: +48 123 456 789 | Email: kontakt@eltron.pl<br>
                NIP: 123-456-78-90
            </div>
        </div>
        
        <div class="offer-info">
            Data: ${formatDate(offer.created_at)}<br>
            Oferta nr: ${offer.id}<br>
            Ważna do: ${validUntil}
        </div>
    </div>

    <h1>OFERTA HANDLOWA</h1>

    <div class="client-info">
        <h2>ODBIORCA:</h2>
        <div class="client-name">${offer.client_name}</div>
        ${offer.client_address ? offer.client_address.replace(/\n/g, '<br>') + '<br>' : ''}
        ${offer.client_nip ? `NIP: ${offer.client_nip}<br>` : ''}
        ${offer.client_email ? `Email: ${offer.client_email}<br>` : ''}
        ${offer.client_phone ? `Telefon: ${offer.client_phone}<br>` : ''}
    </div>

    <h2>WARUNKI OFERTY:</h2>
    <ul>
        <li>Termin dostawy: ${offer.delivery_days} dni roboczych</li>
        <li>Termin płatności: 30 dni od daty wystawienia faktury</li>
        <li>Ceny zawierają VAT</li>
    </ul>

    <h2>POZYCJE OFERTY:</h2>
    <table>
        <thead>
            <tr>
                <th style="width: 5%">Lp.</th>
                <th style="width: 35%">Opis towaru/usługi</th>
                <th style="width: 10%">Ilość</th>
                <th style="width: 12.5%">Cena netto</th>
                <th style="width: 7.5%">VAT</th>
                <th style="width: 15%">Wartość netto</th>
                <th style="width: 15%">Wartość brutto</th>
            </tr>
        </thead>
        <tbody>
            ${itemsHTML}
            ${additionalCostHTML}
        </tbody>
    </table>

    <div class="summary">
        <table class="summary-table">
            <tr>
                <td>Wartość netto:</td>
                <td style="text-align: right;"><strong>${formatCurrency(offer.total_net)}</strong></td>
            </tr>
            <tr>
                <td>VAT 23%:</td>
                <td style="text-align: right;"><strong>${formatCurrency(offer.total_vat)}</strong></td>
            </tr>
            <tr class="summary-total">
                <td>RAZEM BRUTTO:</td>
                <td style="text-align: right;"><strong>${formatCurrency(offer.total_gross)}</strong></td>
            </tr>
        </table>
    </div>

    ${offer.notes ? `
    <div class="notes">
        <h3>UWAGI:</h3>
        <p>${offer.notes.replace(/\n/g, '<br>')}</p>
    </div>
    ` : ''}

    <div class="footer">
        <p><strong>Dziękujemy za zainteresowanie naszą ofertą!</strong></p>
        <p>W przypadku pytań prosimy o kontakt telefoniczny lub mailowy.</p>
    </div>
</body>
</html>`;
}
