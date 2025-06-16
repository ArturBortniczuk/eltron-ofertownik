// app/components/PDFButtonWrapper.tsx
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const PDFDownloadButton = dynamic(
  () => import('./PDFDocument').then(mod => mod.PDFDownloadButton),
  { 
    ssr: false,
    loading: () => <span className="text-blue-600 text-sm font-medium">⏳ PDF</span>
  }
);

interface PDFButtonWrapperProps {
  offerId: number;
  className?: string;
}

export function PDFButtonWrapper({ offerId, className = "text-blue-600 hover:text-blue-800 text-sm font-medium" }: PDFButtonWrapperProps) {
  const [offerData, setOfferData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchOfferData = async () => {
    if (loading || offerData) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/offers/${offerId}`);
      if (response.ok) {
        const data = await response.json();
        setOfferData(data);
      }
    } catch (error) {
      console.error('Error fetching offer data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!offerData) {
    return (
      <button
        onClick={fetchOfferData}
        className={className}
        disabled={loading}
      >
        {loading ? '⏳ PDF' : 'PDF'}
      </button>
    );
  }

  return (
    <PDFDownloadButton 
      offer={offerData.offer} 
      items={offerData.items} 
    />
  );
}
