// app/components/PDFDocument.tsx
'use client';

import React from 'react';
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Font } from '@react-pdf/renderer';

// Rejestruj czcionkę wspierającą polskie znaki
Font.register({
  family: 'Roboto',
  fonts: [
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf',
      fontWeight: 700,
    },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'Roboto',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 10,
    marginBottom: 2,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  label: {
    width: 100,
    fontSize: 10,
  },
  value: {
    fontSize: 10,
    flex: 1,
  },
  table: {
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 5,
    marginBottom: 5,
  },
  tableRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  tableCol: {
    fontSize: 9,
    flex: 1,
  },
  tableColHeader: {
    fontSize: 10,
    fontWeight: 700,
    flex: 1,
  },
  total: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#000',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 5,
  },
  totalLabel: {
    fontSize: 10,
    marginRight: 20,
  },
  totalValue: {
    fontSize: 10,
    fontWeight: 700,
    width: 100,
    textAlign: 'right',
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
    net_amount: number;
  }>;
}

const OfferDocument: React.FC<OfferPDFProps> = ({ offer, items }) => {
  const formatCurrency = (amount: number) => {
    return `${amount.toFixed(2)} zł`;
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
          <Text style={styles.title}>GRUPA ELTRON</Text>
          <Text style={styles.subtitle}>ul. Przykładowa 123, 00-000 Warszawa</Text>
          <Text style={styles.subtitle}>Tel: +48 123 456 789 | Email: kontakt@eltron.pl</Text>
          <Text style={styles.subtitle}>NIP: 123-456-78-90</Text>
        </View>

        {/* Offer details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OFERTA HANDLOWA</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Data:</Text>
            <Text style={styles.value}>{formatDate(offer.created_at)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Oferta nr:</Text>
            <Text style={styles.value}>{offer.id}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Ważna do:</Text>
            <Text style={styles.value}>{validUntil}</Text>
          </View>
        </View>

        {/* Client data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ODBIORCA:</Text>
          <Text style={styles.value}>{offer.client_name}</Text>
          {offer.client_address && (
            <Text style={styles.value}>{offer.client_address}</Text>
          )}
          {offer.client_nip && (
            <View style={styles.row}>
              <Text style={styles.label}>NIP:</Text>
              <Text style={styles.value}>{offer.client_nip}</Text>
            </View>
          )}
          {offer.client_email && (
            <View style={styles.row}>
              <Text style={styles.label}>Email:</Text>
              <Text style={styles.value}>{offer.client_email}</Text>
            </View>
          )}
          {offer.client_phone && (
            <View style={styles.row}>
              <Text style={styles.label}>Telefon:</Text>
              <Text style={styles.value}>{offer.client_phone}</Text>
            </View>
          )}
        </View>

        {/* Conditions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WARUNKI OFERTY:</Text>
          <Text style={styles.value}>• Termin dostawy: {offer.delivery_days} dni roboczych</Text>
          <Text style={styles.value}>• Termin płatności: 30 dni od daty wystawienia faktury</Text>
          <Text style={styles.value}>• Ceny zawierają VAT</Text>
        </View>

        {/* Items table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>POZYCJE OFERTY:</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableColHeader, { flex: 0.5 }]}>Lp.</Text>
              <Text style={[styles.tableColHeader, { flex: 3 }]}>Opis towaru/usługi</Text>
              <Text style={styles.tableColHeader}>Ilość</Text>
              <Text style={styles.tableColHeader}>j.m.</Text>
              <Text style={styles.tableColHeader}>Cena netto</Text>
              <Text style={styles.tableColHeader}>Wartość netto</Text>
            </View>
            
            {items.map((item, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.tableCol, { flex: 0.5 }]}>{index + 1}</Text>
                <Text style={[styles.tableCol, { flex: 3 }]}>{item.product_name}</Text>
                <Text style={styles.tableCol}>{item.quantity}</Text>
                <Text style={styles.tableCol}>{item.unit}</Text>
                <Text style={styles.tableCol}>{formatCurrency(item.unit_price)}</Text>
                <Text style={styles.tableCol}>{formatCurrency(item.net_amount)}</Text>
              </View>
            ))}
            
            {offer.additional_costs > 0 && (
              <View style={styles.tableRow}>
                <Text style={[styles.tableCol, { flex: 0.5 }]}>{items.length + 1}</Text>
                <Text style={[styles.tableCol, { flex: 3 }]}>
                  {offer.additional_costs_description || 'Dodatkowe koszty'}
                </Text>
                <Text style={styles.tableCol}>1</Text>
                <Text style={styles.tableCol}>usł</Text>
                <Text style={styles.tableCol}>{formatCurrency(offer.additional_costs)}</Text>
                <Text style={styles.tableCol}>{formatCurrency(offer.additional_costs)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Summary */}
        <View style={styles.total}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Wartość netto:</Text>
            <Text style={styles.totalValue}>{formatCurrency(offer.total_net)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>VAT 23%:</Text>
            <Text style={styles.totalValue}>{formatCurrency(offer.total_vat)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { fontWeight: 700 }]}>RAZEM BRUTTO:</Text>
            <Text style={[styles.totalValue, { fontSize: 12 }]}>{formatCurrency(offer.total_gross)}</Text>
          </View>
        </View>

        {/* Notes */}
        {offer.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>UWAGI:</Text>
            <Text style={styles.value}>{offer.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={{ marginTop: 'auto', paddingTop: 20 }}>
          <Text style={styles.subtitle}>Dziękujemy za zainteresowanie naszą ofertą!</Text>
          <Text style={styles.subtitle}>W przypadku pytań prosimy o kontakt telefoniczny lub mailowy.</Text>
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
      {({ loading, error }): React.ReactNode => {
        if (loading) {
          return (
            <span className="text-blue-600 text-sm font-medium cursor-pointer">
              ⏳ Generowanie...
            </span>
          );
        }
    
        if (error) {
          return (
            <span className="text-red-600 text-sm font-medium cursor-pointer">
              ❌ Błąd
            </span>
          );
        }
    
        return (
          <span className="text-blue-600 hover:text-blue-800 text-sm font-medium cursor-pointer">
            📄 PDF
          </span>
        );
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
      {({ blob, url, loading, error }: any) => (
        <button className="btn-primary" disabled={loading || error}>
          {loading ? '⏳ Generowanie PDF...' : error ? '❌ Błąd PDF' : '📄 Pobierz PDF'}
        </button>
      )}
    </PDFDownloadLink>
  );
};
