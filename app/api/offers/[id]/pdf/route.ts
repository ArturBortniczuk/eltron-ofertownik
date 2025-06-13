import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

// Style dla PDF
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 20,
    fontFamily: 'Helvetica'
  },
  header: {
    backgroundColor: '#3B4A5C',
    color: 'white',
    padding: 15,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  headerLeft: {
    flexDirection: 'column'
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end'
  },
  companyName: {
    fontSize: 24,
    fontWeight: 'bold'
  },
  companyDetails: {
    fontSize: 10,
    marginTop: 5
  },
  offerTitle: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  offerDetails: {
    fontSize: 10,
    marginTop: 5
  },
  clientBox: {
    backgroundColor: '#F8F9FA',
    border: '1px solid #CCCCCC',
    padding: 15,
    marginBottom: 20,
    borderRadius: 5
  },
  clientLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#3B4A5C',
    marginBottom: 5
  },
  clientName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5
  },
  clientDetails: {
    fontSize: 10,
    marginBottom: 2
  },
  greeting: {
    fontSize: 11,
    marginBottom: 20,
    lineHeight: 1.5
  },
  table: {
    display: 'table',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    marginBottom: 20
  },
  tableRow: {
    margin: 'auto',
    flexDirection: 'row'
  },
  tableHeader: {
    backgroundColor: '#3B4A5C',
    color: 'white'
  },
  tableCell: {
    margin: 'auto',
    padding: 8,
    fontSize: 9,
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#CCCCCC'
  },
  tableCellHeader: {
    margin: 'auto',
    padding: 8,
    fontSize: 10,
    fontWeight: 'bold',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#CCCCCC'
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20
  },
  conditionsBox: {
    backgroundColor: '#F8F9FA',
    border: '1px solid #CCCCCC',
    padding: 15,
    width: '48%',
    borderRadius: 5
  },
  summaryBox: {
    backgroundColor: '#F8F9FA',
    border: '1px solid #CCCCCC',
    padding: 15,
    width: '48%',
    borderRadius: 5
  },
  conditionsTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#3B4A5C',
    marginBottom: 10
  },
  conditionItem: {
    fontSize: 10,
    marginBottom: 5
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5
  },
  summaryLabel: {
    fontSize: 11
  },
  summaryValue: {
    fontSize: 11,
    fontWeight: 'bold'
  },
  summaryTotal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#3B4A5C'
  },
  footer: {
    marginTop: 40,
    paddingTop: 20,
    borderTop: '1px solid #CCCCCC',
    fontSize: 10,
    color: '#666666'
  },
  footerBold: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#3B4A5C'
  }
});

// Komponent PDF
const OfferPDF = ({ offer, items }: { offer: any, items: any[] }) => {
  const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
  const validDays = parseInt(offer.valid_days) || 30;
  const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toLocaleDateString('pl-PL');
  const deliveryDays = parseInt(offer.delivery_days) || 0;
  const totalNet = parseFloat(offer.total_net) || 0;
  const totalVat = parseFloat(offer.total_vat) || 0;
  const totalGross = parseFloat(offer.total_gross) || 0;
  const additionalCosts = parseFloat(offer.additional_costs) || 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.companyName}>GRUPA ELTRON</Text>
            <Text style={styles.companyDetails}>ul. Przykładowa 123, 00-000 Warszawa</Text>
            <Text style={styles.companyDetails}>Tel: +48 123 456 789 | Email: kontakt@eltron.pl</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.offerTitle}>OFERTA Nr {offer.id}/{new Date().getFullYear()}</Text>
            <Text style={styles.offerDetails}>Data: {offerDate}</Text>
            <Text style={styles.offerDetails}>Ważna do: {validUntil}</Text>
          </View>
        </View>

        {/* Dane klienta */}
        <View style={styles.clientBox}>
          <Text style={styles.clientLabel}>DLA:</Text>
          <Text style={styles.clientName}>{offer.client_name || ''}</Text>
          {offer.client_email && <Text style={styles.clientDetails}>Email: {offer.client_email}</Text>}
          {offer.client_phone && <Text style={styles.clientDetails}>Tel: {offer.client_phone}</Text>}
          {offer.client_nip && <Text style={styles.clientDetails}>NIP: {offer.client_nip}</Text>}
        </View>

        {/* Powitanie */}
        <View style={styles.greeting}>
          <Text>Dzień dobry,</Text>
          <Text>Przesyłam ofertę na zamówione towary zgodnie z Państwa zapytaniem.</Text>
        </View>

        {/* Tabela */}
        <View style={styles.table}>
          {/* Nagłówek tabeli */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCellHeader, { width: '8%' }]}>Lp.</Text>
            <Text style={[styles.tableCellHeader, { width: '40%' }]}>Nazwa towaru/usługi</Text>
            <Text style={[styles.tableCellHeader, { width: '12%' }]}>Ilość</Text>
            <Text style={[styles.tableCellHeader, { width: '15%' }]}>Cena netto</Text>
            <Text style={[styles.tableCellHeader, { width: '10%' }]}>VAT</Text>
            <Text style={[styles.tableCellHeader, { width: '15%' }]}>Wartość brutto</Text>
          </View>

          {/* Pozycje */}
          {items.map((item, index) => {
            const quantity = parseFloat(item.quantity) || 0;
            const unitPrice = parseFloat(item.unit_price) || 0;
            const vatRate = parseFloat(item.vat_rate) || 0;
            const grossAmount = parseFloat(item.gross_amount) || 0;

            return (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: '8%' }]}>{index + 1}</Text>
                <Text style={[styles.tableCell, { width: '40%' }]}>{item.product_name || ''}</Text>
                <Text style={[styles.tableCell, { width: '12%' }]}>{quantity} {item.unit || ''}</Text>
                <Text style={[styles.tableCell, { width: '15%' }]}>{unitPrice.toFixed(2)} zł</Text>
                <Text style={[styles.tableCell, { width: '10%' }]}>{vatRate}%</Text>
                <Text style={[styles.tableCell, { width: '15%' }]}>{grossAmount.toFixed(2)} zł</Text>
              </View>
            );
          })}

          {/* Dodatkowe koszty */}
          {additionalCosts > 0 && (
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '8%' }]}></Text>
              <Text style={[styles.tableCell, { width: '40%' }]}>
                {offer.additional_costs_description || 'Dodatkowe koszty'}
              </Text>
              <Text style={[styles.tableCell, { width: '12%' }]}>1 usł</Text>
              <Text style={[styles.tableCell, { width: '15%' }]}>{additionalCosts.toFixed(2)} zł</Text>
              <Text style={[styles.tableCell, { width: '10%' }]}>23%</Text>
              <Text style={[styles.tableCell, { width: '15%' }]}>{(additionalCosts * 1.23).toFixed(2)} zł</Text>
            </View>
          )}
        </View>

        {/* Podsumowanie i warunki */}
        <View style={styles.summaryContainer}>
          {/* Warunki */}
          <View style={styles.conditionsBox}>
            <Text style={styles.conditionsTitle}>WARUNKI OFERTY:</Text>
            <Text style={styles.conditionItem}>• Czas dostawy: {deliveryDays} dni roboczych</Text>
            <Text style={styles.conditionItem}>• Ważność: {validDays} dni</Text>
            <Text style={styles.conditionItem}>• Płatność: przelew 14 dni</Text>
            <Text style={styles.conditionItem}>• Ceny zawierają VAT</Text>
          </View>

          {/* Podsumowanie */}
          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Wartość netto:</Text>
              <Text style={styles.summaryValue}>{totalNet.toFixed(2)} zł</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>VAT:</Text>
              <Text style={styles.summaryValue}>{totalVat.toFixed(2)} zł</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryTotal}>RAZEM DO ZAPŁATY:</Text>
              <Text style={styles.summaryTotal}>{totalGross.toFixed(2)} zł</Text>
            </View>
          </View>
        </View>

        {/* Uwagi */}
        {offer.notes && (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.conditionsTitle}>UWAGI:</Text>
            <Text style={{ fontSize: 10, marginTop: 5 }}>{offer.notes}</Text>
          </View>
        )}

        {/* Stopka */}
        <View style={styles.footer}>
          <Text>W celu realizacji zamówienia proszę o kontakt:</Text>
          <Text>Email: {offer.created_by_email || ''} | Tel: +48 123 456 789</Text>
          <Text style={{ marginTop: 15 }}>Dziękujemy za zainteresowanie naszą ofertą.</Text>
          <Text>Pozdrawiamy,</Text>
          <Text style={styles.footerBold}>{offer.created_by_name || ''} | GRUPA ELTRON</Text>
        </View>
      </Page>
    </Document>
  );
};

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

    // Generuj PDF używając React-PDF
    const pdfBuffer = await pdf(<OfferPDF offer={offer} items={items} />).toBuffer();

    // Zwróć PDF z polskimi znakami (React-PDF obsługuje UTF-8 natywnie)
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
