import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import { chromium } from 'playwright-core';

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

    // Przygotuj dane
    const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
    const validDays = parseInt(offer.valid_days) || 30;
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toLocaleDateString('pl-PL');
    const deliveryDays = parseInt(offer.delivery_days) || 0;
    const totalNet = parseFloat(offer.total_net) || 0;
    const totalVat = parseFloat(offer.total_vat) || 0;
    const totalGross = parseFloat(offer.total_gross) || 0;
    const additionalCosts = parseFloat(offer.additional_costs) || 0;

    // HTML template z Google Fonts i obsługą polskich znaków
    const html = `
    <!DOCTYPE html>
    <html lang="pl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        
        <!-- Google Fonts z obsługą polskich znaków -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&subset=latin,latin-ext&display=swap" rel="stylesheet">
        
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                font-size: 12px;
                line-height: 1.5;
                color: #000000;
                background: #ffffff;
                padding: 20px;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            
            .header {
                background: #3B4A5C;
                color: white;
                padding: 20px;
                margin-bottom: 25px;
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                border-radius: 8px;
            }
            
            .header-left h1 {
                font-size: 28px;
                font-weight: 700;
                margin-bottom: 8px;
                letter-spacing: 0.5px;
            }
            
            .header-left p {
                font-size: 11px;
                margin: 2px 0;
                opacity: 0.9;
            }
            
            .header-right {
                text-align: right;
            }
            
            .header-right h2 {
                font-size: 20px;
                font-weight: 600;
                margin-bottom: 8px;
            }
            
            .header-right p {
                font-size: 11px;
                margin: 2px 0;
                opacity: 0.9;
            }
            
            .client-box {
                background: #F8F9FA;
                border: 2px solid #E9ECEF;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 25px;
            }
            
            .client-label {
                font-weight: 600;
                color: #3B4A5C;
                margin-bottom: 10px;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .client-name {
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 10px;
                color: #212529;
            }
            
            .client-details {
                font-size: 11px;
                margin-bottom: 4px;
                color: #495057;
            }
            
            .greeting {
                margin-bottom: 25px;
                line-height: 1.6;
                font-size: 12px;
                color: #495057;
            }
            
            .greeting p {
                margin-bottom: 8px;
            }
            
            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 25px;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            th {
                background: #3B4A5C;
                color: white;
                padding: 12px 8px;
                text-align: center;
                font-size: 11px;
                font-weight: 600;
                border: none;
                text-transform: uppercase;
                letter-spacing: 0.3px;
            }
            
            td {
                padding: 10px 8px;
                border: 1px solid #DEE2E6;
                text-align: center;
                font-size: 10px;
                background: white;
            }
            
            tr:nth-child(even) td {
                background: #F8F9FA;
            }
            
            tr:hover td {
                background: #E9ECEF;
            }
            
            .text-left {
                text-align: left !important;
            }
            
            .text-right {
                text-align: right !important;
            }
            
            .summary-section {
                display: flex;
                justify-content: space-between;
                margin-top: 30px;
                gap: 25px;
            }
            
            .box {
                background: #F8F9FA;
                border: 2px solid #E9ECEF;
                border-radius: 8px;
                padding: 20px;
                width: 48%;
            }
            
            .box-title {
                font-weight: 600;
                color: #3B4A5C;
                margin-bottom: 15px;
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .condition-item {
                font-size: 11px;
                margin-bottom: 8px;
                color: #495057;
                padding-left: 5px;
            }
            
            .summary-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 10px;
                font-size: 12px;
                color: #495057;
            }
            
            .summary-total {
                display: flex;
                justify-content: space-between;
                margin-top: 15px;
                padding-top: 15px;
                border-top: 2px solid #3B4A5C;
                font-weight: 700;
                color: #3B4A5C;
                font-size: 14px;
            }
            
            .notes-section {
                margin-top: 30px;
                background: #F8F9FA;
                border-radius: 8px;
                padding: 20px;
                border: 2px solid #E9ECEF;
            }
            
            .notes-title {
                font-weight: 600;
                color: #3B4A5C;
                margin-bottom: 10px;
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .notes-content {
                font-size: 11px;
                line-height: 1.6;
                color: #495057;
                white-space: pre-line;
            }
            
            .footer {
                margin-top: 40px;
                padding-top: 25px;
                border-top: 2px solid #E9ECEF;
                font-size: 11px;
                color: #6C757D;
                line-height: 1.6;
            }
            
            .footer p {
                margin-bottom: 5px;
            }
            
            .footer-signature {
                font-weight: 600;
                color: #3B4A5C;
                margin-top: 10px;
            }
            
            .additional-costs-row {
                border-top: 3px solid #3B4A5C !important;
                background: #E3F2FD !important;
            }
            
            .additional-costs-row td {
                background: #E3F2FD !important;
                font-weight: 600;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="header-left">
                <h1>GRUPA ELTRON</h1>
                <p>ul. Przykładowa 123, 00-000 Warszawa</p>
                <p>Tel: +48 123 456 789 | Email: kontakt@eltron.pl</p>
                <p>NIP: 123-456-78-90 | REGON: 123456789</p>
            </div>
            <div class="header-right">
                <h2>OFERTA Nr ${offer.id}/${new Date().getFullYear()}</h2>
                <p>Data: ${offerDate}</p>
                <p>Ważna do: ${validUntil}</p>
            </div>
        </div>

        <div class="client-box">
            <div class="client-label">Oferta dla:</div>
            <div class="client-name">${offer.client_name || ''}</div>
            ${offer.client_email ? `<div class="client-details">📧 Email: ${offer.client_email}</div>` : ''}
            ${offer.client_phone ? `<div class="client-details">📞 Telefon: ${offer.client_phone}</div>` : ''}
            ${offer.client_nip ? `<div class="client-details">🏢 NIP: ${offer.client_nip}</div>` : ''}
        </div>

        <div class="greeting">
            <p>Szanowni Państwo,</p>
            <p>W odpowiedzi na Państwa zapytanie przesyłamy ofertę na zamówione towary. Mamy nadzieję, że przedstawione warunki spotkają się z Państwa akceptacją.</p>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width: 8%">Lp.</th>
                    <th style="width: 40%">Nazwa towaru/usługi</th>
                    <th style="width: 12%">Ilość</th>
                    <th style="width: 15%">Cena netto</th>
                    <th style="width: 10%">VAT</th>
                    <th style="width: 15%">Wartość brutto</th>
                </tr>
            </thead>
            <tbody>
                ${items.map((item, index) => {
                    const quantity = parseFloat(item.quantity) || 0;
                    const unitPrice = parseFloat(item.unit_price) || 0;
                    const vatRate = parseFloat(item.vat_rate) || 0;
                    const grossAmount = parseFloat(item.gross_amount) || 0;
                    
                    return `
                    <tr>
                        <td>${index + 1}</td>
                        <td class="text-left">${item.product_name || ''}</td>
                        <td>${quantity} ${item.unit || ''}</td>
                        <td class="text-right">${unitPrice.toFixed(2)} zł</td>
                        <td>${vatRate}%</td>
                        <td class="text-right">${grossAmount.toFixed(2)} zł</td>
                    </tr>
                    `;
                }).join('')}
                
                ${additionalCosts > 0 ? `
                <tr class="additional-costs-row">
                    <td></td>
                    <td class="text-left">${offer.additional_costs_description || 'Dodatkowe koszty'}</td>
                    <td>1 usł</td>
                    <td class="text-right">${additionalCosts.toFixed(2)} zł</td>
                    <td>23%</td>
                    <td class="text-right">${(additionalCosts * 1.23).toFixed(2)} zł</td>
                </tr>
                ` : ''}
            </tbody>
        </table>

        <div class="summary-section">
            <div class="box">
                <div class="box-title">Warunki oferty:</div>
                <div class="condition-item">• Czas dostawy: ${deliveryDays} dni roboczych</div>
                <div class="condition-item">• Ważność oferty: ${validDays} dni od daty wystawienia</div>
                <div class="condition-item">• Forma płatności: przelew bankowy</div>
                <div class="condition-item">• Termin płatności: 14 dni od daty faktury</div>
                <div class="condition-item">• Ceny zawierają podatek VAT</div>
                <div class="condition-item">• Dostawa na adres klienta</div>
            </div>

            <div class="box">
                <div class="box-title">Podsumowanie finansowe:</div>
                <div class="summary-row">
                    <span>Wartość netto:</span>
                    <span>${totalNet.toFixed(2)} zł</span>
                </div>
                <div class="summary-row">
                    <span>Podatek VAT:</span>
                    <span>${totalVat.toFixed(2)} zł</span>
                </div>
                <div class="summary-total">
                    <span>RAZEM DO ZAPŁATY:</span>
                    <span>${totalGross.toFixed(2)} zł</span>
                </div>
            </div>
        </div>

        ${offer.notes ? `
        <div class="notes-section">
            <div class="notes-title">Dodatkowe uwagi:</div>
            <div class="notes-content">${offer.notes}</div>
        </div>
        ` : ''}

        <div class="footer">
            <p><strong>Kontakt w sprawie realizacji zamówienia:</strong></p>
            <p>📧 Email: ${offer.created_by_email || 'kontakt@eltron.pl'}</p>
            <p>📞 Telefon: +48 123 456 789</p>
            <p>🌐 www.eltron.pl</p>
            
            <div style="margin-top: 20px;">
                <p>Dziękujemy za zainteresowanie naszą ofertą i liczymy na owocną współpracę.</p>
                <p>W przypadku pytań jesteśmy do Państwa dyspozycji.</p>
            </div>
            
            <div class="footer-signature">
                <p>Z poważaniem,</p>
                <p>${offer.created_by_name || 'Zespół GRUPA ELTRON'}</p>
                <p>GRUPA ELTRON Sp. z o.o.</p>
            </div>
        </div>
    </body>
    </html>
    `;

    // Uruchom Playwright z dodatkowymi opcjami dla fontów
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // Ustaw dodatkowe opcje dla lepszego renderowania fontów
    await page.setViewportSize({ width: 1200, height: 1600 });
    await page.setContent(html, { waitUntil: 'networkidle' });
    
    // Poczekaj na załadowanie fontów
    await page.waitForTimeout(1000);
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { 
        top: '15mm', 
        right: '15mm', 
        bottom: '15mm', 
        left: '15mm' 
      },
      preferCSSPageSize: true
    });
    
    await browser.close();

    // Zwróć PDF z prawidłową nazwą pliku
    const clientName = String(offer.client_name || 'Klient').replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s]/g, '').replace(/\s+/g, '_');
    const fileName = `Oferta_${offer.id}_${clientName}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`
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
