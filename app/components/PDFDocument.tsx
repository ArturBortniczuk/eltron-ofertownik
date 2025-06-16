// app/components/PDFDocument.tsx - NAPRAWIONA WERSJA z polskimi znakami
'use client';

import React from 'react';
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Font } from '@react-pdf/renderer';

// Rejestruj czcionkę wspierającą polskie znaki - NOTO SANS zamiast Roboto
Font.register({
  family: 'NotoSans',
  fonts: [
    {
      src: 'https://fonts.gstatic.com/s/notosans/v36/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A.woff2',
      fontWeight: 400,
    },
    {
      src: 'https://fonts.gstatic.com/s/notosans/v36/o-0NIpQlx3QUlC5A4PNjXhFVaNyB2dapMyXRklL7Sg.woff2', 
      fontWeight: 700,
    },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'NotoSans',
    fontSize: 10,
  },
  header: {
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  companyInfo: {
    flex: 1,
  },
  companyName: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 5,
    color: '#1f2937',
  },
  companyDetails: {
    fontSize: 9,
    color: '#6b7280',
    lineHeight: 1.4,
  },
  offerInfo: {
    textAlign: 'right',
    fontSize: 9,
    color: '#6b7280',
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 20,
    marginTop: 10,
    textAlign: 'center',
    color: '#1f2937',
    borderBottom: '2 solid #1f2937',
    paddingBottom: 8,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8,
    color: '#374151',
  },
  clientInfo: {
    backgroundColor: '#f9fafb',
    padding: 10,
    borderRadius: 4,
    marginBottom: 15,
  },
  clientName: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 3,
    color: '#1f2937',
  },
  clientDetails: {
    fontSize: 9,
    color: '#6b7280',
    lineHeight: 1.4,
  },
  conditionsList: {
    marginLeft: 10,
  },
  conditionItem: {
    fontSize: 9,
    marginBottom: 2,
    color: '#374151',
  },
  table: {
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderBottom: '1 solid #d1d5db',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.5 solid #e5e7eb',
    paddingVertical: 4,
    paddingHorizontal: 4,
    minHeight: 20,
  },
  tableColHeader: {
    fontSize: 8,
    fontWeight: 700,
    color: '#374151',
    textAlign: 'center',
  },
  tableCol: {
    fontSize: 8,
    color: '#1f2937',
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  tableColLeft: {
    textAlign: 'left',
  },
  tableColRight: {
    textAlign: 'right',
  },
  // Szerokości kolumn
  col1: { width: '6%' },   // Lp
  col2: { width: '35%' },  // Nazwa
  col3: { width: '12%' },  // Ilość
  col4: { width: '15%' },  // Cena
  col5: { width: '8%' },   // VAT
  col6: { width: '12%' },  // Netto
  col7: { width: '12%' },  // Brutto
  
  summary: {
    marginTop: 20,
    alignItems: 'flex-end',
  },
  summaryTable: {
    width: 200,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    borderBottom: '0.5 solid #e5e7eb',
  },
  summaryTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTop: '2 solid #1f2937',
    marginTop: 4,
  },
  summaryLabel: {
    fontSize: 9,
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 9,
    fontWeight: 700,
    color: '#1f2937',
  },
  summaryTotalLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#1f2937',
  },
  summaryTotalValue: {
    fontSize: 12,
    fontWeight: 700,
    color: '#1f2937',
  },
  notes: {
    marginTop: 20,
    backgroundColor: '#fef3c7',
    padding: 10,
    borderRadius: 4,
    border: '1 solid #f59e0b',
  },
  notesTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 5,
    color: '#92400e',
  },
  notesText: {
    fontSize: 9,
    color: '#92400e',
    lineHeight: 1.4,
  },
  footer: {
    marginTop: 30,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
  },
});

interface OfferPDFProps {
  offer: {
    id: number;
    client_name: string;
    client_email?: string;
    client_phone?: string;
    client_address?: string;
    client_nip?: string;
    delivery_days: number;
    valid_days: number;
    total_net: number;
    total_vat: number;
    total_gross: number;
    additional_costs: number;
    additional_costs_description?: string;
    notes?: string;
    created_at: string;
  };
  items: Array<{
    product_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    vat_rate: number;
    net_amount: number;
    gross_amount: number;
  }>;
}

const OfferDocument: React.FC<OfferPDFProps> = ({ offer, items }) => {
  const formatCurrency = (amount: number) => {
    return `${amount.toFixed(2).replace('.', ',')} zł`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL');
  };

  const validUntil = new Date(
    new Date(offer.created_at).getTime() + offer.valid_days * 24 * 60 * 60 * 1000
  ).toLocaleDateString('pl-PL');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>GRUPA ELTRON</Text>
            <Text style={styles.companyDetails}>
              ul. Przykładowa 123, 00-000 Warszawa{'\n'}
              Tel: +48 123 456 789 | Email: kontakt@eltron.pl{'\n'}
              NIP: 123-456-78-90
            </Text>
          </View>
          <View style={styles.offerInfo}>
            <Text>Data: {formatDate(offer.created_at)}</Text>
            <Text>Oferta nr: {offer.id}</Text>
            <Text>Ważna do: {validUntil}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>OFERTA HANDLOWA</Text>

        {/* Client info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ODBIORCA:</Text>
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{offer.client_name}</Text>
            <Text style={styles.clientDetails}>
              {offer.client_address && `${offer.client_address}\n`}
              {offer.client_nip && `NIP: ${offer.client_nip}\n`}
              {offer.client_email && `Email: ${offer.client_email}\n`}
              {offer.client_phone && `Telefon: ${offer.client_phone}`}
            </Text>
          </View>
        </View>

        {/* Conditions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WARUNKI OFERTY:</Text>
          <View style={styles.conditionsList}>
            <Text style={styles.conditionItem}>• Termin dostawy: {offer.delivery_days} dni roboczych</Text>
            <Text style={styles.conditionItem}>• Termin płatności: 30 dni od daty wystawienia faktury</Text>
            <Text style={styles.conditionItem}>• Ceny zawierają VAT</Text>
          </View>
        </View>

        {/* Items table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>POZYCJE OFERTY:</Text>
          <View style={styles.table}>
            {/* Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableColHeader, styles.col1]}>Lp.</Text>
              <Text style={[styles.tableColHeader, styles.col2, styles.tableColLeft]}>Opis towaru/usługi</Text>
              <Text style={[styles.tableColHeader, styles.col3]}>Ilość</Text>
              <Text style={[styles.tableColHeader, styles.col4]}>Cena netto</Text>
              <Text style={[styles.tableColHeader, styles.col5]}>VAT</Text>
              <Text style={[styles.tableColHeader, styles.col6]}>Wartość netto</Text>
              <Text style={[styles.tableColHeader, styles.col7]}>Wartość brutto</Text>
            </View>
            
            {/* Items */}
            {items.map((item, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.tableCol, styles.col1]}>{index + 1}</Text>
                <Text style={[styles.tableCol, styles.col2, styles.tableColLeft]}>{item.product_name}</Text>
                <Text style={[styles.tableCol, styles.col3]}>{item.quantity} {item.unit}</Text>
                <Text style={[styles.tableCol, styles.col4, styles.tableColRight]}>{formatCurrency(item.unit_price)}</Text>
                <Text style={[styles.tableCol, styles.col5]}>{item.vat_rate}%</Text>
                <Text style={[styles.tableCol, styles.col6, styles.tableColRight]}>{formatCurrency(item.net_amount)}</Text>
                <Text style={[styles.tableCol, styles.col7, styles.tableColRight]}>{formatCurrency(item.gross_amount)}</Text>
              </View>
            ))}
            
            {/* Additional costs */}
            {offer.additional_costs > 0 && (
              <View style={styles.tableRow}>
                <Text style={[styles.tableCol, styles.col1]}>{items.length + 1}</Text>
                <Text style={[styles.tableCol, styles.col2, styles.tableColLeft]}>
                  {offer.additional_costs_description || 'Dodatkowe koszty'}
                </Text>
                <Text style={[styles.tableCol, styles.col3]}>1 usł</Text>
                <Text style={[styles.tableCol, styles.col4, styles.tableColRight]}>{formatCurrency(offer.additional_costs)}</Text>
                <Text style={[styles.tableCol, styles.col5]}>23%</Text>
                <Text style={[styles.tableCol, styles.col6, styles.tableColRight]}>{formatCurrency(offer.additional_costs)}</Text>
                <Text style={[styles.tableCol, styles.col7, styles.tableColRight]}>{formatCurrency(offer.additional_costs * 1.23)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryTable}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Wartość netto:</Text>
              <Text style={styles.summaryValue}>{formatCurrency(offer.total_net)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>VAT 23%:</Text>
              <Text style={styles.summaryValue}>{formatCurrency(offer.total_vat)}</Text>
            </View>
            <View style={styles.summaryTotal}>
              <Text style={styles.summaryTotalLabel}>RAZEM BRUTTO:</Text>
              <Text style={styles.summaryTotalValue}>{formatCurrency(offer.total_gross)}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {offer.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>UWAGI:</Text>
            <Text style={styles.notesText}>{offer.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Dziękujemy za zainteresowanie naszą ofertą!</Text>
          <Text>W przypadku pytań prosimy o kontakt telefoniczny lub mailowy.</Text>
        </View>
      </Page>
    </Document>
  );
};

// Komponent do pobierania PDF - wersja dla listy ofert
interface PDFDownloadButtonProps {
  offer: OfferPDFProps['offer'];
  items: OfferPDFProps['items'];
}

export const PDFDownloadButton: React.FC<PDFDownloadButtonProps> = ({ offer, items }) => {
  const fileName = `Oferta_${offer.id}_${offer.client_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

  return (
    <PDFDownloadLink
      document={<OfferDocument offer={offer} items={items} />}
      fileName={fileName}
    >
      {({ loading, error }: { loading: boolean; error: Error | null }) => {
        if (loading) {
          return <span className="text-blue-600 text-sm font-medium cursor-pointer">⏳ PDF...</span>;
        }
        if (error) {
          return <span className="text-red-600 text-sm font-medium cursor-pointer">❌ Błąd</span>;
        }
        return <span className="text-blue-600 hover:text-blue-800 text-sm font-medium cursor-pointer">📄 PDF</span>;
      }}
    </PDFDownloadLink>
  );
};

// Komponent do pobierania PDF - wersja dla strony szczegółów (jako przycisk)
export const PDFDownloadButtonPrimary: React.FC<PDFDownloadButtonProps> = ({ offer, items }) => {
  const fileName = `Oferta_${offer.id}_${offer.client_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

  return (
    <PDFDownloadLink
      document={<OfferDocument offer={offer} items={items} />}
      fileName={fileName}
    >
      {({ loading, error }: { loading: boolean; error: Error | null }) => (
        <button className="btn-primary" disabled={loading || !!error}>
          {loading ? '⏳ Generowanie PDF...' : error ? '❌ Błąd PDF' : '📄 Pobierz PDF'}
        </button>
      )}
    </PDFDownloadLink>
  );
};
