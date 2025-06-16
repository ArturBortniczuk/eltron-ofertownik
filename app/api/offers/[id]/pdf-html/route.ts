// app/api/offers/[id]/pdf-html/route.ts
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

    // Opcja 1: Użyj zewnętrznego API (np. Documint, PDFShift, api2pdf)
    // const pdfBuffer = await generatePDFViaAPI(html);

    // Opcja 2: Zwróć HTML i wygeneruj PDF po stronie klienta
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
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
      <td>${index + 1}</td>
      <td>${item.product_name}</td>
      <td>${item.quantity} ${item.unit}</td>
      <td>${formatCurrency(item.unit_price)}</td>
      <td>${item.vat_rate}%</td>
      <td>${formatCurrency(item.net_amount)}</td>
      <td>${formatCurrency(item.gross_amount)}</td>
    </tr>
  `).join('');

  const additionalCostHTML = offer.additional_costs > 0 ? `
    <tr>
      <td>${items.length + 1}</td>
      <td>${offer.additional_costs_description || 'Dodatkowe koszty'}</td>
      <td>1 usł</td>
      <td>${formatCurrency(offer.additional_costs)}</td>
      <td>23%</td>
      <td>${formatCurrency(offer.additional_costs)}</td>
      <td>${formatCurrency(offer.additional_costs * 1.23)}</td>
    </tr>
  ` : '';

  return `<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Oferta ${offer.id}</title>
    <style>
        @page {
            size: A4;
            margin: 20mm;
        }
        
        body {
            font-family: Arial, sans-serif;
            font-size: 12px;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
        }
        
        .header {
            margin-bottom: 30px;
        }
        
        .company-name {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        
        .company-info {
            font-size: 11px;
            color: #666;
        }
        
        .offer-info {
            position: absolute;
            top: 0;
            right: 0;
            text-align: right;
            font-size: 11px;
        }
        
        h1 {
            font-size: 20px;
            margin: 30px 0 20px 0;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
        }
        
        h2 {
            font-size: 16px;
            margin: 20px 0 10px 0;
            color: #444;
        }
        
        .client-info {
            margin-bottom: 20px;
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
        }
        
        .summary {
            margin-top: 30px;
            text-align: right;
        }
        
        .summary-row {
            margin: 5px 0;
        }
        
        .summary-label {
            display: inline-block;
            width: 150px;
        }
        
        .summary-total {
            font-size: 16px;
            font-weight: bold;
            margin-top: 10px;
            padding-top: 10px;
            border-top: 2px solid #333;
        }
        
        .notes {
            margin-top: 30px;
            padding: 15px;
            background-color: #f9f9f9;
            border: 1px solid #ddd;
        }
        
        .footer {
            margin-top: 50px;
            text-align: center;
            font-size: 11px;
            color: #666;
        }
        
        @media print {
            body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="company-name">GRUPA ELTRON</div>
        <div class="company-info">
            ul. Przykładowa 123, 00-000 Warszawa<br>
            Tel: +48 123 456 789 | Email: kontakt@eltron.pl<br>
            NIP: 123-456-78-90
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
        <strong>${offer.client_name}</strong><br>
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
        <div class="summary-row">
            <span class="summary-label">Wartość netto:</span>
            <strong>${formatCurrency(offer.total_net)}</strong>
        </div>
        <div class="summary-row">
            <span class="summary-label">VAT 23%:</span>
            <strong>${formatCurrency(offer.total_vat)}</strong>
        </div>
        <div class="summary-row summary-total">
            <span class="summary-label">RAZEM BRUTTO:</span>
            <strong>${formatCurrency(offer.total_gross)}</strong>
        </div>
    </div>

    ${offer.notes ? `
    <div class="notes">
        <h2>UWAGI:</h2>
        <p>${offer.notes.replace(/\n/g, '<br>')}</p>
    </div>
    ` : ''}

    <div class="footer">
        <p>Dziękujemy za zainteresowanie naszą ofertą!</p>
        <p>W przypadku pytań prosimy o kontakt telefoniczny lub mailowy.</p>
    </div>
</body>
</html>`;
}

// Przykład funkcji do użycia zewnętrznego API
async function generatePDFViaAPI(html: string): Promise<Buffer> {
  // Przykład z api2pdf.com
  const response = await fetch('https://v2.api2pdf.com/chrome/pdf/html', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.API2PDF_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      html: html,
      options: {
        paperFormat: 'A4',
        printBackground: true,
        marginTop: '20mm',
        marginBottom: '20mm',
        marginLeft: '20mm',
        marginRight: '20mm',
      }
    })
  });

  if (!response.ok) {
    throw new Error('PDF generation failed');
  }

  const result = await response.json();
  const pdfResponse = await fetch(result.pdf);
  const pdfBuffer = await pdfResponse.arrayBuffer();
  
  return Buffer.from(pdfBuffer);
}
