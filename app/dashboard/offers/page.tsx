'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePDFDownload } from '../../components/PDFGenerator';

interface Offer {
  id: number;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  delivery_days: number;
  valid_days: number;
  total_gross: number;
  status: string;
  created_at: string;
}

interface OffersResponse {
  offers: Offer[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export default function OffersListPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasNext: false,
    hasPrev: false
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Hook do generowania PDF po stronie klienta
  const { downloadPDF } = usePDFDownload();

  useEffect(() => {
    fetchOffers();
  }, [currentPage, statusFilter]);

  const fetchOffers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10'
      });
      
      if (statusFilter) {
        params.append('status', statusFilter);
      }

      const response = await fetch(`/api/offers?${params}`);
      if (response.ok) {
        const data: OffersResponse = await response.json();
        setOffers(data.offers);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching offers:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      draft: { label: 'Szkic', class: 'bg-gray-100 text-gray-800' },
      sent: { label: 'Wysłana', class: 'bg-blue-100 text-blue-800' },
      accepted: { label: 'Zaakceptowana', class: 'bg-green-100 text-green-800' },
      rejected: { label: 'Odrzucona', class: 'bg-red-100 text-red-800' }
    };
    
    const statusInfo = statusMap[status as keyof typeof statusMap] || statusMap.draft;
    
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusInfo.class}`}>
        {statusInfo.label}
      </span>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL');
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  // Funkcja do pobierania PDF
  const handleDownloadPDF = (offerId: number) => {
    downloadPDF(offerId);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Moje oferty</h1>
          <p className="text-gray-600 mt-2">
            Zarządzaj swoimi ofertami ({pagination.totalCount} łącznie)
          </p>
        </div>
        <Link href="/dashboard/offers/new" className="btn-primary">
          ➕ Nowa oferta
        </Link>
      </div>

      {/* Filtry */}
      <div className="card">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleStatusFilter('')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === '' 
                ? 'bg-eltron-primary text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Wszystkie ({pagination.totalCount})
          </button>
          <button
            onClick={() => handleStatusFilter('draft')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'draft' 
                ? 'bg-eltron-primary text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Szkice
          </button>
          <button
            onClick={() => handleStatusFilter('sent')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'sent' 
                ? 'bg-eltron-primary text-white' 
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            Wysłane
          </button>
          <button
            onClick={() => handleStatusFilter('accepted')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'accepted' 
                ? 'bg-eltron-primary text-white' 
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            Zaakceptowane
          </button>
          <button
            onClick={() => handleStatusFilter('rejected')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'rejected' 
                ? 'bg-eltron-primary text-white' 
                : 'bg-red-100 text-red-700 hover:bg-red-200'
            }`}
          >
            Odrzucone
          </button>
        </div>
      </div>

      {/* Lista ofert */}
      {loading ? (
        <div className="card">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      ) : offers.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-4">📋</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {statusFilter ? 'Brak ofert w tej kategorii' : 'Nie masz jeszcze żadnych ofert'}
          </h3>
          <p className="text-gray-600 mb-6">
            {statusFilter 
              ? 'Spróbuj wybrać inny filtr lub utwórz nową ofertę.'
              : 'Utwórz swoją pierwszą ofertę, aby zacząć.'}
          </p>
          <Link href="/dashboard/offers/new" className="btn-primary">
            Utwórz ofertę
          </Link>
        </div>
      ) : (
        <div className="card">
          {/* Tabela desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Nr oferty</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Klient</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Wartość</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Data</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((offer) => (
                  <tr key={offer.id} className="table-row">
                    <td className="py-3 px-4">
                      <div className="font-medium text-eltron-primary">#{offer.id}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{offer.client_name}</div>
                      {offer.client_email && (
                        <div className="text-sm text-gray-600">{offer.client_email}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium">{formatCurrency(offer.total_gross)}</div>
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(offer.status)}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {formatDate(offer.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex space-x-2">
                        <Link 
                          href={`/dashboard/offers/${offer.id}`}
                          className="text-eltron-primary hover:text-eltron-primary/80 text-sm font-medium"
                        >
                          Podgląd
                        </Link>
                        <button 
                          onClick={() => handleDownloadPDF(offer.id)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Karty mobile */}
          <div className="md:hidden space-y-4">
            {offers.map((offer) => (
              <div key={offer.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-medium text-eltron-primary">Oferta #{offer.id}</div>
                    <div className="font-medium text-gray-900">{offer.client_name}</div>
                  </div>
                  {getStatusBadge(offer.status)}
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Wartość:</span>
                    <span className="font-medium">{formatCurrency(offer.total_gross)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Data:</span>
                    <span>{formatDate(offer.created_at)}</span>
                  </div>
                </div>

                <div className="flex space-x-3 mt-4 pt-3 border-t border-gray-200">
                  <Link 
                    href={`/dashboard/offers/${offer.id}`}
                    className="text-eltron-primary hover:text-eltron-primary/80 text-sm font-medium"
                  >
                    Podgląd
                  </Link>
                  <button 
                    onClick={() => handleDownloadPDF(offer.id)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    Pobierz PDF
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Paginacja */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-between items-center mt-6 pt-6 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Strona {pagination.currentPage} z {pagination.totalPages}
                ({pagination.totalCount} ofert)
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => handlePageChange(pagination.currentPage - 1)}
                  disabled={!pagination.hasPrev}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  ← Poprzednia
                </button>
                
                {/* Numery stron */}
                <div className="flex space-x-1">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (pagination.currentPage >= pagination.totalPages - 2) {
                      pageNum = pagination.totalPages - 4 + i;
                    } else {
                      pageNum = pagination.currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-3 py-1 border rounded text-sm ${
                          pageNum === pagination.currentPage
                            ? 'bg-eltron-primary text-white border-eltron-primary'
                            : 'border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => handlePageChange(pagination.currentPage + 1)}
                  disabled={!pagination.hasNext}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Następna →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
