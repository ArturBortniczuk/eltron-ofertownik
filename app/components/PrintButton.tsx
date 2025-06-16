// app/components/PrintButton.tsx
'use client';

import { useEffect } from 'react';

interface PrintButtonProps {
  offerId: number;
}

export function PrintButton({ offerId }: PrintButtonProps) {
  const handlePrint = () => {
    // Otwórz nowe okno z HTML oferty
    const printWindow = window.open(`/api/offers/${offerId}/pdf-html`, '_blank');
    
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        // Poczekaj aż strona się załaduje i wywołaj print
        setTimeout(() => {
          printWindow.print();
        }, 500);
      });
    }
  };

  return (
    <button
      onClick={handlePrint}
      className="btn-primary"
      title="Otwórz okno drukowania - możesz zapisać jako PDF"
    >
      🖨️ Drukuj / Zapisz PDF
    </button>
  );
}

// Alternatywnie - komponent do renderowania w tym samym oknie
interface PrintableOfferProps {
  offer: any;
  items: any[];
}

export function PrintableOffer({ offer, items }: PrintableOfferProps) {
  useEffect(() => {
    //
