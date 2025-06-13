import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf, Font } from '@react-pdf/renderer';

// Zarejestruj fonty z obsługą polskich znaków
Font.register({
  family: 'Roboto',
  fonts: [
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-light-webfont.ttf',
      fontWeight: 300,
    },
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-medium-webfont.ttf',
      fontWeight: 500,
    },
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf',
      fontWeight: 600,
    },
  ]
});

// Style
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Roboto',
    fontSize: 10,
    paddingTop: 20,
    paddingLeft: 20,
    paddingRight: 20,
    paddingBottom: 20,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    backgroundColor: '#3B4A5C',
    padding: 15,
    color: 'white',
  },
  headerLeft: {
    flex: 2,
  },
  headerRight: {
    flex: 1,
    textAlign: 'right',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 8,
    marginBottom: 2,
  },
  clientBox: {
    backgroundColor: '#F8F9FA',
    border: '2pt solid #E9ECEF',
    padding: 15,
    marginBottom: 20,
  },
  clientLabel: {
    fontSize: 9,
    fontWeight: 600,
    color: '#3B4A5C',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  clientName: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 8,
    color: '#212529',
  },
  clientDetails: {
    fontSize: 9,
    marginBottom: 3,
    color: '#495057',
  },
  greeting: {
    marginBottom: 20,
    lineHeight: 1.5,
  },
  greetingText: {
    fontSize: 10,
    marginBottom: 5,
    color: '#495057',
  },
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#3B4A5C',
    color: 'white',
    padding: 8,
    fontSize: 9,
    fontWeight: 600,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#DEE2E6',
    padding: 8,
    fontSize: 9,
  },
  tableRowEven: {
    backgroundColor: '#F8F9FA',
  },
  col1: { width: '8%', textAlign: 'center' },
  col2: { width: '40%', textAlign: 'left' },
  col3: { width: '12%', textAlign: 'center' },
  col4: { width: '15%', textAlign: 'right' },
  col5: { width: '10%', textAlign: 'center' },
  col6: { width: '15%', textAlign: 'right' },
  summarySection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 20,
  },
  summaryBox: {
    backgroundColor: '#F8F9FA',
    border: '2pt solid #E9ECEF',
    padding: 15,
    width: '48%',
  },
  boxTitle: {
    fontWeight: 600,
    color: '#3B4A5C',
    marginBottom: 10,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  conditionItem: {
    fontSize: 9,
    marginBottom: 5,
    color: '#495057',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    fontSize: 10,
  },
  summaryTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 2,
    borderTopColor: '#3B4A5C',
    fontWeight: 600,
    color: '#3B4A5C',
    fontSize: 12,
  },
  notesSection: {
    marginTop: 20,
    backgroundColor: '#F8F9FA',
    padding: 15,
    border: '2pt solid #E9ECEF',
  },
  notesTitle: {
    fontWeight: 600,
    color: '#3B4A5C',
    marginBottom: 8,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  notesContent: {
    fontSize: 9,
    lineHeight: 1.5,
    color: '#495057',
  },
  footer: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 2,
    borderTopColor: '#E9ECEF',
    fontSize: 9,
    color: '#6C757D',
  },
  footerText: {
    marginBottom: 3,
  },
  footerSignature: {
    fontWeight: 600,
    color: '#3B4A5C',
    marginTop: 10,
  },
});

// Komponent PDF
const OfferPDF = ({ offer, items }: any) => {
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
            <Text style={styles.headerTitle}>GRUPA ELTRON</Text>
            <Text style={styles.headerSubtitle}>ul. Przykładowa 123, 00-000 Warszawa</Text>
            <Text style={styles.headerSubtitle}>Tel: +48 123 456 789 | Email: kontakt@eltron.pl</Text>
            <Text style={styles.headerSubtitle}>NIP: 123-456-78-90 | REGON: 123456789</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={[styles.headerTitle, { fontSize: 16 }]}>
              OFERTA Nr {offer.id}/{new Date().getFullYear()}
            </Text>
            <Text style={styles.headerSubtitle}>Data: {offerDate}</Text>
            <Text style={styles.headerSubtitle}>Ważna do: {validUntil}</Text>
          </View>
        </View>

        {/* Client Box */}
        <View style={styles.clientBox}>
          <Text style={styles.clientLabel}>Oferta dla:</Text>
          <Text style={styles.clientName}>{offer.client_name || ''}</Text>
          {offer.client_email && (
            <Text style={styles.clientDetails}>📧 Email: {offer.client_email}</Text>
          )}
          {offer.client_phone && (
            <Text style={styles.clientDetails}>📞 Telefon: {offer.client_phone}</Text>
          )}
          {offer.client_nip && (
            <Text style={styles.clientDetails}>🏢 NIP: {offer.client_nip}</Text>
          )}
        </View>

        {/* Greeting */}
        <View style={styles.greeting}>
          <Text style={styles.greetingText}>Szanowni Państwo,</Text>
          <Text style={styles.greetingText}>
            W odpowiedzi na Państwa zapytanie przesyłamy ofertę na zamówione towary. 
            Mamy nadzieję, że przedstawione warunki spotkają się z Państwa akceptacją.
          </Text>
        </View>

        {/* Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={styles.col1}>Lp.</Text>
            <Text style={styles.col2}>Nazwa towaru/usługi</Text>
            <Text style={styles.col3}>Ilość</Text>
            <Text style={styles.col4}>Cena netto</Text>
            <Text style={styles.col5}>VAT</Text>
            <Text style={styles.col6}>Wartość brutto</Text>
          </View>

          {/* Table Rows */}
          {items.map((item: any, index: number) => {
            const quantity = parseFloat(item.quantity) || 0;
            const unitPrice = parseFloat(item.unit_price) || 0;
            const vatRate = parseFloat(item.vat_rate) || 0;
            const grossAmount = parseFloat(item.gross_amount) || 0;

            return (
              <View 
                key={index} 
                style={[styles.tableRow, index % 2 === 1 && styles.tableRowEven]}
              >
                <Text style={styles.col1}>{index + 1}</Text>
                <Text style={styles.col2}>{item.product_name || ''}</Text>
                <Text style={styles.col3}>{quantity} {item.unit || ''}</Text>
                <Text style={styles.col4}>{unitPrice.toFixed(2)} zł</Text>
                <Text style={styles.col5}>{vatRate}%</Text>
                <Text style={styles.col6}>{grossAmount.toFixed(2)} zł</Text>
              </View>
            );
          })}

          {/* Additional Costs Row */}
          {additionalCosts > 0 && (
            <View style={[styles.tableRow, { backgroundColor: '#E3F2FD', borderTopWidth: 2, borderTopColor: '#3B4A5C' }]}>
              <Text style={styles.col1}></Text>
              <Text style={styles.col2}>{offer.additional_costs_description || 'Dodatkowe koszty'}</Text>
              <Text style={styles.col3}>1 usł</Text>
              <Text style={styles.col4}>{additionalCosts.toFixed(2)} zł</Text>
              <Text style={styles.col5}>23%</Text>
              <Text style={styles.col6}>{(additionalCosts * 1.23).toFixed(2)} zł</Text>
            </View>
          )}
        </View>

        {/* Summary Section */}
        <View style={styles.summarySection}>
          <View style={styles.summaryBox}>
            <Text style={styles.boxTitle}>Warunki oferty:</Text>
            <Text style={styles.conditionItem}>• Czas dostawy: {deliveryDays} dni roboczych</Text>
            <Text style={styles.conditionItem}>• Ważność oferty: {validDays} dni od daty wystawienia</Text>
            <Text style={styles.conditionItem}>• Forma płatności: przelew bankowy</Text>
            <Text style={styles.conditionItem}>• Termin płatności: 14 dni od daty faktury</Text>
            <Text style={styles.conditionItem}>• Ceny zawierają podatek VAT</Text>
            <Text style={styles.conditionItem}>• Dostawa na adres klienta</Text>
          </View>

          <View style={styles.summaryBox}>
            <Text style={styles.boxTitle}>Podsumowanie finansowe:</Text>
            <View style={styles.summaryRow}>
              <Text>Wartość netto:</Text>
              <Text>{totalNet.toFixed(2)} zł</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text>Podatek VAT:</Text>
              <Text>{totalVat.toFixed(2)} zł</Text>
            </View>
            <View style={styles.summaryTotal}>
              <Text>RAZEM DO ZAPŁATY:</Text>
              <Text>{totalGross.toFixed(2)} zł</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {offer.notes && (
          <View style={styles.notesSection}>
            <Text style={styles.notesTitle}>Dodatkowe uwagi:</Text>
            <Text style={styles.notesContent}>{offer.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Kontakt w sprawie realizacji zamówienia:</Text>
          <Text style={styles.footerText}>📧 Email: {offer.created_by_email || 'kontakt@eltron.pl'}</Text>
          <Text style={styles.footerText}>📞 Telefon: +48 123 456 789</Text>
          <Text style={styles.footerText}>🌐 www.eltron.pl</Text>
          
          <Text style={[styles.footerText, { marginTop: 15 }]}>
            Dziękujemy za zainteresowanie naszą ofertą i liczymy na owocną współpracę.
          </Text>
          <Text style={styles.footerText}>W przypadku pytań jesteśmy do Państwa dyspozycji.</Text>
          
          <View style={{ marginTop: 10 }}>
            <Text style={styles.footerSignature}>Z poważaniem,</Text>
            <Text style={styles.footerSignature}>{offer.created_by_name || 'Zespół GRUPA ELTRON'}</Text>
            <Text style={styles.footerSignature}>GRUPA ELTRON Sp. z o.o.</Text>
          </View>
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

    // Generuj PDF z React PDF
    const pdfDoc = <OfferPDF offer={offer} items={items} />;
    const pdfBuffer = await pdf(pdfDoc).toBuffer();

    // Zwróć PDF z prawidłową nazwą pliku
    const clientName = String(offer.client_name || 'Klient')
      .replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s]/g, '')
      .replace(/\s+/g, '_');
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
