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

    // HTML template z polskimi znakami
    const html = `
    <!DOCTYPE html>
    <html lang="pl">
    <head>
        <meta charset="UTF-8">
        <style>
            body {
                font-family: 'Arial', sans-serif;
                font-size: 12px;
                line-height: 1.4;
                color: #000;
                margin: 0;
                padding: 20px;
            }
            .header {
                background: #3B4A5C;
                color: white;
                padding: 15px;
                margin-bottom: 20px;
                display: flex;
                justify-content: space-between;
            }
            .header h1 { font-size: 24px; margin: 0 0 8px 0; }
            .header p { font-size: 10px; margin: 2px 0; }
            .header-right { text-align: right; }
            .header-right h2 { font-size: 18px; margin: 0 0 8px 0; }
            .client-box {
                background: #F8F9FA;
                border: 2px solid #CCCCCC;
                padding: 15px;
                margin-bottom: 20px;
            }
            .client-label { font-weight: bold; color: #3B4A5C; margin-bottom: 8px; }
            .client-name { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
            .client-details { font-size: 10px; margin-bottom: 3px; }
            .greeting { margin-bottom: 20px; line-height: 1.6; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background: #3B4A5C; color: white; padding: 10px 5px; text-align: center; font-size: 10px; border: 1px solid #CCC; }
            td { padding: 8px 5px; border: 1px solid #CCC; text-align: center; font-size: 9px; }
            tr:nth-child(even) { background: #F8F9FA; }
            .text-left { text-align: left; }
            .text-right { text-align: right; }
            .summary-section { display: flex; justify-content: space-between; margin-top: 30px; gap: 20px; }
            .box { background: #F8F9FA; border: 2px solid #CCC; padding: 15px; width: 48%; }
            .box-title { font-weight: bold; color: #3B4A5C; margin-bottom: 10px; }
            .condition-item { font-size: 10px; margin-bottom: 5px; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .summary-total { display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 2px solid #3B4A5C; font-weight: bold; color: #3B4A5C; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #CCC; font-size: 10px; color: #666; }
            .footer-signature { font-weight: bold; color: #3B4A5C; }
        </style>
    </head>
    <body>
        <div class="header">
            <div>
                <h1>GRUPA ELTRON</h1>
                <p>ul. Przykładowa 123, 00-000 Warszawa</p>
                <p>Tel: +48 123 456 789 | Email: kontakt@eltron.pl</p>
            </div>
            <div class="header-right">
                <h2>OFERTA Nr ${offer.id}/${new Date().getFullYear()}</h2>
                <p>Data: ${offerDate}</p>
                <p>Ważna do: ${validUntil}</p>
            </div>
        </div>

        <div class="client-box">
            <div class="client-label">DLA:</div>
            <div class="client-name">${offer.client_name || ''}</div>
            ${offer.client_email ? `<div class="client-details">Email: ${offer.client_email}</div>` : ''}
            ${offer.client_phone ? `<div class="client-details">Tel: ${offer.client_phone}</div>` : ''}
            ${offer.client_nip ? `<div class="client-details">NIP: ${offer.client_nip}</div>` : ''}
        </div>

        <div class="greeting">
            <p>Dzień dobry,</p>
            <p>Przesyłam ofertę na zamówione towary zgodnie z Państwa zapytaniem.</p>
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
                <tr style="border-top: 2px solid #3B4A5C;">
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
                <div class="box-title">WARUNKI OFERTY:</div>
                <div class="condition-item">• Czas dostawy: ${deliveryDays} dni roboczych</div>
                <div class="condition-item">• Ważność: ${validDays} dni</div>
                <div class="condition-item">• Płatność: przelew 14 dni</div>
                <div class="condition-item">• Ceny zawierają VAT</div>
            </div>

            <div class="box">
                <div class="summary-row">
                    <span>Wartość netto:</span>
                    <span>${totalNet.toFixed(2)} zł</span>
                </div>
                <div class="summary-row">
                    <span>VAT:</span>
                    <span>${totalVat.toFixed(2)} zł</span>
                </div>
                <div class="summary-total">
                    <span>RAZEM DO ZAPŁATY:</span>
                    <span>${totalGross.toFixed(2)} zł</span>
                </div>
            </div>
        </div>

        ${offer.notes ? `
        <div style="margin-top: 30px;">
            <div class="box-title">UWAGI:</div>
            <div style="font-size: 10px; margin-top: 5px;">${offer.notes}</div>
        </div>
        ` : ''}

        <div class="footer">
            <div>
                <p>W celu realizacji zamówienia proszę o kontakt:</p>
                <p>Email: ${offer.created_by_email || ''} | Tel: +48 123 456 789</p>
            </div>
            <div style="margin-top: 15px;">
                <p>Dziękujemy za zainteresowanie naszą ofertą.</p>
                <p>Pozdrawiamy,</p>
                <p class="footer-signature">${offer.created_by_name || ''} | GRUPA ELTRON</p>
            </div>
        </div>
    </body>
    </html>
    `;

    // Uruchom Playwright i wygeneruj PDF
    const browser = await chromium.launch({
      headless: true
    });
    
    const page = await browser.newPage();
    await page.setContent(html);
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });
    
    await browser.close();

    // Zwróć PDF z polskimi znakami
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Oferta_${offer.id}_${String(offer.client_name || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`
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
