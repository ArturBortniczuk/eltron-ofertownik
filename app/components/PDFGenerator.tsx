// app/components/PDFGenerator.tsx - GENEROWANIE PDF PO STRONIE KLIENTA
'use client';

import { jsPDF } from 'jspdf';

interface OfferData {
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

// Funkcja do konwersji polskich znaków na Unicode
function convertPolishText(text: string): string {
  if (!text) return '';
  
  const polishCharsMap: Record<string, string> = {
    'ą': '\u0105', 'ć': '\u0107', 'ę': '\u0119', 'ł': '\u0142', 'ń': '\u0144',
    'ó': '\u00F3', 'ś': '\u015B', 'ź': '\u017A', 'ż': '\u017C',
    'Ą': '\u0104', 'Ć': '\u0106', 'Ę': '\u0118', 'Ł': '\u0141', 'Ń': '\u0143',
    'Ó': '\u00D3', 'Ś': '\u015A', 'Ź': '\u0179', 'Ż': '\u017B'
  };
  
  let convertedText = text;
  Object.entries(polishCharsMap).forEach(([polish, unicode]) => {
    convertedText = convertedText.replace(new RegExp(polish, 'g'), unicode);
  });
  
  return convertedText;
}

// Bezpieczna funkcja do dodawania tekstu z polskimi znakami
function addText(doc: jsPDF, text: string, x: number, y: number) {
  if (!text) return;
  const convertedText = convertPolishText(text);
  doc.text(convertedText, x, y);
}

export function generateOfferPDF(data: OfferData): void {
  const { offer, items } = data;
  
  // Utwórz nowy dokument PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Ustaw domyślną czcionkę
  doc.setFont('helvetica', 'normal');

  // Header z logo firmy
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  addText(doc, 'GRUPA ELTRON', 20, 20);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  addText(doc, 'ul. Przykładowa 123, 00-000 Warszawa', 20, 30);
  addText(doc, 'Tel: +48 123 456 789 | Email: kontakt@eltron.pl', 20, 35);
  addText(doc, 'NIP: 123-456-78-90', 20, 40);

  // Data i nr oferty
  const offerDate = new Date(offer.created_at).toLocaleDateString('pl-PL');
  const validUntil = new Date(
    new Date(offer.created_at).getTime() + (offer.valid_days * 24 * 60 * 60 * 1000)
  ).toLocaleDateString('pl-PL');

  doc.setFontSize(10);
  addText(doc, `Data: ${offerDate}`, 140, 20);
  addText(doc, `Oferta nr: ${offer.id}`, 140, 25);
  addText(doc, `Ważna do: ${validUntil}`, 140, 30);

  // Linia oddzielająca
  doc.line(20, 45, 190, 45);

  // Tytuł oferty
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  addText(doc, 'OFERTA HANDLOWA', 20, 55);

  // Dane klienta
  let yPos = 70;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  addText(doc, 'ODBIORCA:', 20, yPos);

  yPos += 8;
  doc.setFont('helvetica', 'normal');
  addText(doc, offer.client_name, 20, yPos);

  if (offer.client_address) {
    yPos += 6;
    const addressLines = offer.client_address.split('\n');
    addressLines.forEach((line: string) => {
      addText(doc, line.trim(), 20, yPos);
      yPos += 5;
    });
  }

  if (offer.client_nip) {
    yPos += 2;
    addText(doc, `NIP: ${offer.client_nip}`, 20, yPos);
    yPos += 6;
  }

  if (offer.client_email) {
    addText(doc, `Email: ${offer.client_email}`, 20, yPos);
    yPos += 6;
  }

  if (offer.client_phone) {
    addText(doc, `Telefon: ${offer.client_phone}`, 20, yPos);
    yPos += 6;
  }

  // Warunki oferty
  yPos += 10;
  doc.setFont('helvetica', 'bold');
  addText(doc, 'WARUNKI OFERTY:', 20, yPos);

  yPos += 8;
  doc.setFont('helvetica', 'normal');
  addText(doc, `• Termin dostawy: ${offer.delivery_days} dni roboczych`, 20, yPos);
  addText(doc, `• Termin płatności: 30 dni od daty wystawienia faktury`, 20, yPos + 6);
  addText(doc, `• Ceny zawierają VAT`, 20, yPos + 12);

  // Tabela z pozycjami
  yPos += 25;
  
  // Nagłówki tabeli
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  
  const tableTop = yPos;
  addText(doc, 'Lp.', 20, tableTop);
  addText(doc, 'Opis towaru/usługi', 35, tableTop);
  addText(doc, 'Ilość', 120, tableTop);
  addText(doc, 'j.m.', 135, tableTop);
  addText(doc, 'Cena netto', 145, tableTop);
  addText(doc, 'Wartość netto', 170, tableTop);

  // Linia pod nagłówkami
  doc.line(20, tableTop + 3, 190, tableTop + 3);

  // Pozycje
  let currentY = tableTop + 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  items.forEach((item, index) => {
    // Sprawdź czy trzeba przenieść na nową stronę
    if (currentY > 250) {
      doc.addPage();
      currentY = 20;
    }

    const itemNumber = (index + 1).toString();
    const quantity = parseFloat(item.quantity.toString()).toString();
    const unitPrice = parseFloat(item.unit_price.toString()).toFixed(2);
    const netAmount = parseFloat(item.net_amount.toString()).toFixed(2);

    addText(doc, itemNumber, 20, currentY);
    
    // Długie nazwy produktów - prostsze podejście
    const maxLength = 50;
    let productName = item.product_name;
    if (productName.length > maxLength) {
      productName = productName.substring(0, maxLength) + '...';
    }
    addText(doc, productName, 35, currentY);
    
    addText(doc, quantity, 120, currentY);
    addText(doc, item.unit, 135, currentY);
    addText(doc, `${unitPrice} zł`, 145, currentY);
    addText(doc, `${netAmount} zł`, 170, currentY);

    currentY += 8;
  });

  // Dodatkowe koszty
  if (offer.additional_costs > 0) {
    const additionalCosts = parseFloat(offer.additional_costs.toString());
    const description = offer.additional_costs_description || 'Dodatkowe koszty';
    
    addText(doc, (items.length + 1).toString(), 20, currentY);
    addText(doc, description, 35, currentY);
    addText(doc, '1', 120, currentY);
    addText(doc, 'usł', 135, currentY);
    addText(doc, `${additionalCosts.toFixed(2)} zł`, 145, currentY);
    addText(doc, `${additionalCosts.toFixed(2)} zł`, 170, currentY);

    currentY += 8;
  }

  // Linia przed podsumowaniem
  currentY += 5;
  doc.line(120, currentY, 190, currentY);

  // Podsumowanie
  currentY += 8;
  const totalNet = parseFloat(offer.total_net.toString());
  const totalVat = parseFloat(offer.total_vat.toString());
  const totalGross = parseFloat(offer.total_gross.toString());

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  addText(doc, 'Wartość netto:', 120, currentY);
  addText(doc, `${totalNet.toFixed(2)} zł`, 170, currentY);

  currentY += 6;
  addText(doc, 'VAT 23%:', 120, currentY);
  addText(doc, `${totalVat.toFixed(2)} zł`, 170, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  addText(doc, 'RAZEM BRUTTO:', 120, currentY);
  addText(doc, `${totalGross.toFixed(2)} zł`, 170, currentY);

  // Uwagi
  if (offer.notes) {
    currentY += 15;
    
    // Sprawdź czy trzeba przenieść na nową stronę
    if (currentY > 220) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    addText(doc, 'UWAGI:', 20, currentY);

    currentY += 8;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    // Proste podejście do uwag - bez splitTextToSize
    const maxNoteLength = 100;
    const notes = offer.notes.length > maxNoteLength ? 
      offer.notes.substring(0, maxNoteLength) + '...' : offer.notes;
    addText(doc, notes, 20, currentY);
  }

  // Stopka
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  addText(doc, 'Dziękujemy za zainteresowanie naszą ofertą!', 20, 280);
  addText(doc, 'W przypadku pytań prosimy o kontakt telefoniczny lub mailowy.', 20, 285);

  // Pobierz PDF
  const fileName = `Oferta_${offer.id}_${offer.client_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  doc.save(fileName);
}

// Hook do pobierania danych oferty i generowania PDF
export function usePDFDownload() {
  const downloadPDF = async (offerId: number) => {
    try {
      // Pobierz dane oferty
      const response = await fetch(`/api/offers/${offerId}`);
      if (!response.ok) throw new Error('Nie można pobrać danych oferty');
      
      const data = await response.json();
      
      // Wygeneruj PDF
      generateOfferPDF(data);
      
    } catch (error) {
      console.error('Błąd podczas generowania PDF:', error);
      alert('Błąd podczas generowania PDF. Spróbuj ponownie.');
    }
  };

  return { downloadPDF };
}
