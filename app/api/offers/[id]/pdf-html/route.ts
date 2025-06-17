import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const offerId = parseInt(params.id);

    if (isNaN(offerId)) {
      return NextResponse.json({ error: 'Nieprawidłowy ID oferty' }, { status: 400 });
    }

    console.log('Fetching offer:', offerId);

    // Pobierz dane oferty z pełnymi informacjami
    const offerResult = await db.query(`
      SELECT 
        o.*,
        c.nip as client_nip,
        c.address as client_address,
        u.name as created_by_name
      FROM offers o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = $1
    `, [offerId]);

    console.log('Offer result:', offerResult.rows.length);

    if (offerResult.rows.length === 0) {
      return NextResponse.json({ error: 'Oferta nie została znaleziona' }, { status: 404 });
    }

    const offer = offerResult.rows[0];
    
    // Pobierz pozycje z pełnymi danymi liczbowymi
    const itemsResult = await db.query(`
      SELECT 
        product_name,
        quantity::numeric as quantity,
        unit,
        unit_price::numeric as unit_price,
        vat_rate::numeric as vat_rate,
        net_amount::numeric as net_amount,
        vat_amount::numeric as vat_amount,
        gross_amount::numeric as gross_amount,
        position_order
      FROM offer_items
      WHERE offer_id = $1
      ORDER BY position_order
    `, [offerId]);

    console.log('Items result:', itemsResult.rows.length);
    console.log('Sample item:', itemsResult.rows[0]);
    
    const items = itemsResult.rows;

    // Generuj HTML
    const html = generateProfessionalOfferHTML(offer, items);

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });

  } catch (error) {
    console.error('PDF HTML generation error:', error);
    
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({
        error: 'Błąd generowania PDF',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, { status: 500 });
    }
    
    return NextResponse.json(
      { error: 'Błąd generowania PDF' },
      { status: 500 }
    );
  }
}

function generateProfessionalOfferHTML(offer: any, items: any[]): string {
  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (typeof numAmount !== 'number' || isNaN(numAmount)) {
      return '0,00 zł';
    }
    return `${numAmount.toFixed(2).replace('.', ',')} zł`;
  };

  const formatNumber = (value: number | string) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (typeof numValue !== 'number' || isNaN(numValue)) {
      return '0';
    }
    return numValue.toString().replace('.', ',');
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('pl-PL');
    } catch {
      return 'Błędna data';
    }
  };

  const safeString = (value: any) => {
    return value ? String(value) : '';
  };

  const validUntil = (() => {
    try {
      const created = new Date(offer.created_at);
      const validUntilDate = new Date(created.getTime() + (offer.valid_days || 30) * 24 * 60 * 60 * 1000);
      return validUntilDate.toLocaleDateString('pl-PL');
    } catch {
      return 'Błędna data';
    }
  })();

  // Podział pozycji na strony - pierwsza strona: 8 pozycji, kolejne: 14 pozycji
  const ITEMS_FIRST_PAGE = 8;
  const ITEMS_OTHER_PAGES = 14;
  const pages = [];
  
  let currentIndex = 0;
  
  // Pierwsza strona - maksymalnie 8 pozycji (mniej miejsca przez header)
  if (items.length > 0) {
    const firstPageItems = items.slice(0, ITEMS_FIRST_PAGE);
    pages.push(firstPageItems);
    currentIndex = ITEMS_FIRST_PAGE;
  }
  
  // Kolejne strony - maksymalnie 14 pozycji każda
  while (currentIndex < items.length) {
    const pageItems = items.slice(currentIndex, currentIndex + ITEMS_OTHER_PAGES);
    pages.push(pageItems);
    currentIndex += ITEMS_OTHER_PAGES;
  }

  const generateItemsHTML = (pageItems: any[], startIndex: number) => {
    return pageItems.map((item, index) => `
      <tr>
        <td class="center-align">${startIndex + index + 1}</td>
        <td class="product-name">${safeString(item.product_name)}</td>
        <td class="center-align">${formatNumber(item.quantity)}</td>
        <td class="center-align">${safeString(item.unit)}</td>
        <td class="right-align">${formatCurrency(item.unit_price)}</td>
        <td class="center-align">${formatNumber(item.vat_rate)}%</td>
        <td class="right-align">${formatCurrency(item.net_amount)}</td>
        <td class="right-align bold">${formatCurrency(item.gross_amount)}</td>
      </tr>
    `).join('');
  };

  const additionalCosts = parseFloat(offer.additional_costs) || 0;
  const additionalCostHTML = additionalCosts > 0 ? `
    <tr class="additional-row">
      <td class="center-align">${items.length + 1}</td>
      <td class="product-name">${safeString(offer.additional_costs_description) || 'Dodatkowe koszty'}</td>
      <td class="center-align">1</td>
      <td class="center-align">usł</td>
      <td class="right-align">${formatCurrency(additionalCosts)}</td>
      <td class="center-align">23%</td>
      <td class="right-align">${formatCurrency(additionalCosts)}</td>
      <td class="right-align bold">${formatCurrency(additionalCosts * 1.23)}</td>
    </tr>
  ` : '';

  // Generuj strony z poprawnym liczeniem pozycji
  const pagesHTML = pages.map((pageItems, pageIndex) => {
    const isLastPage = pageIndex === pages.length - 1;
    
    // Oblicz startowy indeks dla tej strony
    let startIndex = 0;
    if (pageIndex === 0) {
      startIndex = 0;
    } else {
      startIndex = ITEMS_FIRST_PAGE + (pageIndex - 1) * ITEMS_OTHER_PAGES;
    }
    
    return `
      <div class="page ${pageIndex > 0 ? 'page-break' : ''}">
        ${pageIndex === 0 ? `
          <!-- Header tylko na pierwszej stronie -->
          <div class="header">
            <div class="company-info">
              <div class="company-logo">GRUPA ELTRON</div>
              <div class="company-details">
                <strong>ul. Przykładowa 123, 00-000 Warszawa</strong><br>
                📞 Tel: +48 123 456 789 | 📧 Email: kontakt@eltron.pl<br>
                🏢 NIP: 123-456-78-90 | 🌐 www.grupaeltron.pl
              </div>
            </div>
            
            <div class="offer-info">
              <div class="offer-number">OFERTA NR ${offer.id}</div>
              <strong>Data:</strong> ${formatDate(offer.created_at)}<br>
              <strong>Ważna do:</strong> ${validUntil}<br>
              <strong>Termin dostawy:</strong> ${offer.delivery_days || 14} dni
            </div>
          </div>

          <h1>Oferta Handlowa</h1>

          <div class="client-conditions-container">
            <div class="client-info">
              <h2>📋 Odbiorca:</h2>
              <div class="client-name">${safeString(offer.client_name)}</div>
              <div class="client-details">
                ${offer.client_address ? offer.client_address.replace(/\n/g, '<br>') + '<br>' : ''}
                ${offer.client_nip ? `🏢 NIP: ${offer.client_nip}<br>` : ''}
                ${offer.client_email ? `📧 Email: ${offer.client_email}<br>` : ''}
                ${offer.client_phone ? `📞 Telefon: ${offer.client_phone}` : ''}
              </div>
            </div>

            <div class="conditions">
              <h2>📋 Warunki oferty:</h2>
              <ul>
                <li><strong>Dostawa:</strong> ${offer.delivery_days || 14} dni rob.</li>
                <li><strong>Płatność:</strong> 30 dni</li>
                <li><strong>Ważność:</strong> ${offer.valid_days || 30} dni</li>
                <li><strong>Ceny:</strong> z VAT</li>
                <li><strong>Waluta:</strong> PLN</li>
              </ul>
            </div>
          </div>
        ` : ''}

        ${pageIndex === 0 ? '<h2>📦 Pozycje oferty:</h2>' : `<h2>📦 Pozycje oferty (cd. ${pageIndex + 1}):</h2>`}
        
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th class="col-lp">Lp.</th>
                <th class="col-product">Opis towaru/usługi</th>
                <th class="col-qty">Ilość</th>
                <th class="col-unit">J.m.</th>
                <th class="col-price">Cena netto</th>
                <th class="col-vat">VAT</th>
                <th class="col-net">Wartość netto</th>
                <th class="col-gross">Wartość brutto</th>
              </tr>
            </thead>
            <tbody>
              ${generateItemsHTML(pageItems, startIndex)}
              ${isLastPage ? additionalCostHTML : ''}
            </tbody>
          </table>
        </div>

        ${isLastPage ? `
          <div class="summary">
            <div class="summary-table">
              <table>
                <tr>
                  <td>Wartość netto:</td>
                  <td>${formatCurrency(offer.total_net)}</td>
                </tr>
                <tr>
                  <td>Podatek VAT 23%:</td>
                  <td>${formatCurrency(offer.total_vat)}</td>
                </tr>
                <tr class="summary-total">
                  <td><strong>RAZEM DO ZAPŁATY:</strong></td>
                  <td><strong>${formatCurrency(offer.total_gross)}</strong></td>
                </tr>
              </table>
            </div>
          </div>

          ${offer.notes ? `
          <div class="notes">
            <h3>💬 Uwagi dodatkowe:</h3>
            <div class="notes-content">${safeString(offer.notes).replace(/\n/g, '<br>')}</div>
          </div>
          ` : ''}
        ` : ''}
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Oferta ${offer.id} - ${safeString(offer.client_name)}</title>
    <style>
        @page {
            size: A4;
            margin: 15mm 10mm 20mm 10mm;
        }
        
        * {
            box-sizing: border-box;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        body {
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
            font-size: 11px;
            line-height: 1.4;
            color: #333;
            margin: 0;
            padding: 0;
            background: white;
        }
        
        .container {
            max-width: 100%;
            margin: 0 auto;
            padding: 10px;
        }
        
        /* Podział na strony - różne wysokości */
        .page {
            position: relative;
            padding-bottom: 30mm; /* Miejsce na stopkę */
        }
        
        .page:first-child {
            min-height: 250mm; /* Pierwsza strona - mniej miejsca przez header */
        }
        
        .page:not(:first-child) {
            min-height: 280mm; /* Kolejne strony - więcej miejsca */
        }
        
        .page-break {
            page-break-before: always;
        }
        
        /* Header */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 25px;
            padding-bottom: 15px;
            border-bottom: 3px solid #3B4A5C;
        }
        
        .company-info {
            flex: 1;
            max-width: 60%;
        }
        
        .company-logo {
            background: linear-gradient(135deg, #3B4A5C 0%, #4A5D72 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            display: inline-block;
            margin-bottom: 10px;
            font-weight: bold;
            font-size: 18px;
            letter-spacing: 1px;
            box-shadow: 0 2px 8px rgba(59, 74, 92, 0.2);
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        .company-details {
            font-size: 10px;
            color: #666;
            line-height: 1.5;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        .offer-info {
            text-align: right;
            font-size: 10px;
            color: #666;
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #3B4A5C;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        .offer-number {
            font-size: 16px;
            font-weight: bold;
            color: #3B4A5C;
            margin-bottom: 5px;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        /* Titles */
        h1 {
            font-size: 24px;
            margin: 25px 0 20px 0;
            text-align: center;
            color: #3B4A5C;
            font-weight: 300;
            letter-spacing: 2px;
            text-transform: uppercase;
            border-bottom: 2px solid #3B4A5C;
            padding-bottom: 10px;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        h2 {
            font-size: 14px;
            margin: 20px 0 8px 0;
            color: #3B4A5C;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        h3 {
            font-size: 13px;
            margin: 0 0 10px 0;
            color: #856404;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        /* Client and conditions layout */
        .client-conditions-container {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .client-info {
            flex: 1;
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            padding: 20px;
            border-radius: 8px;
            border-left: 5px solid #3B4A5C;
        }
        
        .client-name {
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 8px;
            color: #3B4A5C;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        .client-details {
            font-size: 11px;
            line-height: 1.5;
            color: #666;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        .conditions {
            flex: 1;
            background: #fff9f0;
            border: 1px solid #ffd700;
            border-radius: 8px;
            padding: 20px;
        }
        
        .conditions ul {
            margin: 0;
            padding-left: 20px;
            list-style: none;
        }
        
        .conditions li {
            margin: 5px 0;
            position: relative;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        .conditions li:before {
            content: "✓";
            color: #28a745;
            font-weight: bold;
            position: absolute;
            left: -15px;
        }
        
        /* Table */
        .table-container {
            overflow-x: auto;
            margin: 20px 0;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            font-size: 10px;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        th {
            background: linear-gradient(135deg, #3B4A5C 0%, #4A5D72 100%);
            color: white;
            padding: 12px 6px;
            text-align: center;
            font-weight: 600;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border: 1px solid #2a3441;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        td {
            padding: 10px 6px;
            border: 1px solid #e0e0e0;
            vertical-align: middle;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        .center-align {
            text-align: center;
        }
        
        .right-align {
            text-align: right;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, monospace !important;
        }
        
        .product-name {
            text-align: left;
            font-weight: 500;
            max-width: 200px;
            word-wrap: break-word;
            hyphens: auto;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        .bold {
            font-weight: bold;
        }
        
        /* Alternating row colors */
        tbody tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        
        tbody tr:hover {
            background-color: #e8f4f8;
        }
        
        .additional-row {
            background-color: #fff3cd !important;
            border-top: 2px solid #ffc107;
        }
        
        /* Summary */
        .summary {
            margin-top: 30px;
            display: flex;
            justify-content: flex-end;
        }
        
        .summary-table {
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            overflow: hidden;
            min-width: 300px;
        }
        
        .summary-table td {
            border: none;
            padding: 12px 20px;
            border-bottom: 1px solid #e9ecef;
            font-size: 12px;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        .summary-table td:first-child {
            background: #f8f9fa;
            font-weight: 500;
            color: #495057;
        }
        
        .summary-table td:last-child {
            text-align: right;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, monospace !important;
            font-weight: 600;
        }
        
        .summary-total {
            background: linear-gradient(135deg, #3B4A5C 0%, #4A5D72 100%) !important;
            color: white !important;
            font-weight: bold !important;
            font-size: 14px !important;
        }
        
        .summary-total td {
            border-bottom: none !important;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        /* Notes */
        .notes {
            margin-top: 30px;
            padding: 20px;
            background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
            border: 1px solid #ffc107;
            border-radius: 8px;
            border-left: 5px solid #ff9500;
        }
        
        .notes-content {
            color: #856404;
            line-height: 1.6;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        /* Footer */
        .footer {
            position: fixed;
            bottom: 10mm;
            left: 10mm;
            right: 10mm;
            text-align: center;
            font-size: 10px;
            color: #6c757d;
            border-top: 2px solid #e9ecef;
            padding-top: 10px;
            background: white;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        .footer-highlight {
            background: linear-gradient(135deg, #3B4A5C 0%, #4A5D72 100%);
            color: white;
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 8px;
            font-weight: 600;
            font-size: 11px;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        /* Print button */
        .print-button {
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
            transition: all 0.3s ease;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
        }
        
        .print-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(40, 167, 69, 0.4);
        }
        
        /* Column widths for better layout */
        .col-lp { width: 6%; }
        .col-product { width: 32%; }
        .col-qty { width: 8%; }
        .col-unit { width: 8%; }
        .col-price { width: 11%; }
        .col-vat { width: 7%; }
        .col-net { width: 14%; }
        .col-gross { width: 14%; }
        
        /* Print styles */
        @media print {
            body {
                padding: 0;
                background: white !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
                font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
            }
            
            .print-button {
                display: none !important;
            }
            
            .container {
                padding: 0;
            }
            
            .page {
                min-height: auto;
                padding-bottom: 20mm;
            }
            
            .header {
                display: flex;
                page-break-inside: avoid;
            }
            
            .client-conditions-container {
                page-break-inside: avoid;
            }
            
            .table-container {
                page-break-inside: avoid;
            }
            
            tbody tr {
                page-break-inside: avoid;
            }
            
            .summary, .notes {
                page-break-inside: avoid;
            }
            
            .footer {
                position: fixed;
                bottom: 0;
                background: white !important;
            }
            
            /* Ensure gradients and colors print */
            .company-logo,
            th,
            .summary-total {
                background: #3B4A5C !important;
                color: white !important;
            }
            
            .footer-highlight {
                background: #3B4A5C !important;
                color: white !important;
            }
            
            /* Force consistent fonts in print */
            * {
                font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif !important;
            }
        }
        
        /* Responsive design */
        @media screen and (max-width: 768px) {
            .header {
                flex-direction: column;
                gap: 15px;
            }
            
            .company-info {
                max-width: 100%;
            }
            
            .offer-info {
                text-align: left;
            }
            
            .client-conditions-container {
                flex-direction: column;
                gap: 15px;
            }
            
            .summary {
                justify-content: center;
            }
            
            .summary-table {
                min-width: auto;
                width: 100%;
            }
            
            table {
                font-size: 9px;
            }
            
            th, td {
                padding: 8px 4px;
            }
            
            .product-name {
                max-width: 150px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <button class="print-button" onclick="window.print()">🖨️ Drukuj / Zapisz PDF</button>
        
        ${pagesHTML}

        <div class="footer">
            <div class="footer-highlight">
                🙏 Dziękujemy za zainteresowanie naszą ofertą!
            </div>
            <p>W przypadku pytań prosimy o kontakt: +48 123 456 789 | kontakt@eltron.pl</p>
            <p><strong>Grupa Eltron</strong> - Twój partner w branży elektrycznej</p>
        </div>
    </div>

    <script>
        // Auto-adjust font size for long product names
        document.addEventListener('DOMContentLoaded', function() {
            const productCells = document.querySelectorAll('.product-name');
            productCells.forEach(cell => {
                if (cell.textContent.length > 50) {
                    cell.style.fontSize = '9px';
                }
                if (cell.textContent.length > 80) {
                    cell.style.fontSize = '8px';
                }
            });
            
            // Debug: pokaż informacje o cenach w konsoli
            console.log('Offer data:', {
                total_net: '${offer.total_net}',
                total_vat: '${offer.total_vat}',
                total_gross: '${offer.total_gross}',
                items_count: ${items.length}
            });
            
            ${items.length > 0 ? `
            console.log('Sample item:', {
                product_name: '${safeString(items[0]?.product_name)}',
                unit_price: '${items[0]?.unit_price}',
                quantity: '${items[0]?.quantity}',
                net_amount: '${items[0]?.net_amount}',
                gross_amount: '${items[0]?.gross_amount}'
            });
            ` : ''}
        });
    </script>
</body>
</html>`;
}
