// app/components/PDFDocument.tsx - ZASTĘPCZY KOMPONENT BEZ @react-pdf/renderer
'use client';

import React from 'react';

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

// Komponent do pobierania PDF - wersja dla listy ofert
interface PDFDownloadButtonProps {
  offer: OfferPDFProps['offer'];
  items: OfferPDFProps['items'];
}

export const PDFDownloadButton: React.FC<PDFDownloadButtonProps> = ({ offer, items }) => {
  const handleDownloadHTML = () => {
    // Otwórz HTML w nowym oknie dla wydruku
    window.open(`/api/offers/${offer.id}/pdf-html`, '_blank');
  };

  return (
    <button
      onClick={handleDownloadHTML}
      className="text-blue-600 hover:text-blue-800 text-sm font-medium cursor-pointer"
    >
      📄 HTML
    </button>
  );
};

// Komponent do pobierania PDF - wersja dla strony szczegółów (jako przycisk)
export const PDFDownloadButtonPrimary: React.FC<PDFDownloadButtonProps> = ({ offer, items }) => {
  const handleDownloadHTML = () => {
    // Otwórz HTML w nowym oknie dla wydruku
    window.open(`/api/offers/${offer.id}/pdf-html`, '_blank');
  };

  return (
    <button onClick={handleDownloadHTML} className="btn-primary">
      📄 Otwórz do wydruku (HTML)
    </button>
  );
};
