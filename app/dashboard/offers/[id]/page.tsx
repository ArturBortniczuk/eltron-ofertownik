'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePDFDownload } from '../../../components/PDFGenerator';

interface OfferDetails {
  offer: {
    id: number;
    client_name: string;
    client_email?: string;
    client_phone?: string;
    delivery_days: number;
    valid_days: number;
    additional_costs: number;
    additional_costs_description?: string;
    notes?: string;
    total_net: number;
    total_vat: number;
    total_gross: number;
    status: string;
    created_at: string;
    created_by_name: string;
    created_by_email: string;
  };
  items: Array<{
    id: number;
    product_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    vat_rate: number;
    net_amount: number;
    vat_amount: number;
    gross_amount: number;
  }>;
}

export default function OfferDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [offer, setOffer] = useState<OfferDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  
  // Hook do generowania PDF po stronie klienta
  const { downloadPDF } = usePDFDownload();

  const offerId = params.id as string;

  useEffect(() => {
    fetchOffer();
  }, [offerId]);

  const fetchOffer = async () => {
    try {
      const response = await fetch(`/api/offers/${offerId}`);
      if (response.ok) {
        const data = await response.json();
        setOffer(data);
      } else {
        setError('Nie znaleziono oferty');
      }
    } catch (err) {
      setError('Błąd ładowania oferty');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    setUpdating(true);
    try {
      const response = await fetch(`/api/offers/${offerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        setOffer(prev => prev ? {
          ...prev,
          offer: { ...prev.offer, status: newStatus }
        } : null);
      } else {
        setError('Błąd aktualizacji statusu');
      }
    } catch (err) {
      setError('Błąd aktualizacji statusu');
    } finally {
      setUpdating(false);
    }
  };

  const deleteOffer = async () => {
    if (!confirm('Czy na pewno chcesz usunąć tę ofertę?')) return;

    try {
      const response = await fetch(`/api/offers/${offerId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        router.push('/dashboard/offers');
      } else {
        setError('Błąd usuwania oferty');
      }
    } catch (err) {
      setError('Błąd usuwania oferty');
    }
  };

  // Nowa funkcja do pobierania PDF po stronie klienta
  const handleDownloadPDF = () => {
    if (offer) {
      downloadPDF(offer.offer.id);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Ładowanie oferty...</div>
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="card text-center">
        <div className="text-red-600 text-lg mb-4">{error || 'Nie znaleziono oferty'}</div>
        <Link href="/dashboard/offers" className="btn-primary">
          Powrót do listy ofert
        </Link>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const statusMap = {
      draft: { label: 'Szkic', class: 'bg-gray-100 text-gray-800' },
      sent: { label: 'Wysłana', class: 'bg-blue-100 text-blue-800' },
      accepted: { label: 'Zaakceptowana', class: 'bg-green-100 text-green-800' },
      rejected: { label: 'Odrzucona', class: 'bg-red-100 text-red-800' }
    };
    
    const statusInfo = statusMap[status as keyof typeof statusMap] || statusMap.draft;
    
    return (
      <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusInfo.class}`}>
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

  const getValidUntil = () => {
    const created = new Date(offer.offer.created_at);
    const validUntil = new Date(created.getTime() + offer.offer.valid_days * 24 * 60 * 60 * 1000);
    return validUntil.toLocaleDateString('pl-PL');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold text-gray-900">
              Oferta #{offer.offer.id}
            </h1>
            {getStatusBadge(offer.offer.status)}
          </div>
          <p className="text-gray-600">
            Utworzona {formatDate(offer.offer.created_at)} przez {offer.offer.created_by_name}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleDownloadPDF}
            className="btn-primary"
          >
            📄 Pobierz PDF
          </button>
          
          {offer.offer.status === 'draft' && (
            <button
              onClick={() => updateStatus('sent')}
              disabled={updating}
              className="btn-secondary disabled:opacity-50"
            >
              {updating ? 'Aktualizuję...' : '📤 Oznacz jako wysłaną'}
            </button>
          )}
          
          {offer.offer.status === 'sent' && (
            <div className="flex gap-2">
              <button
                onClick={() => updateStatus('accepted')}
                disabled={updating}
                className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50"
              >
                ✅ Zaakceptowana
              </button>
              <button
                onClick={() => updateStatus('rejected')}
                disabled={updating}
                className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50"
              >
                ❌ Odrzucona
              </button>
            </div>
          )}
          
          <button
            onClick={deleteOffer}
            className="btn-danger"
          >
            🗑️ Usuń
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="error-text">{error}</div>
        </div>
      )}

      {/* Dane klienta */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Dane klienta</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <div className="text-sm text-gray-600 mb-1">Nazwa klienta</div>
            <div className="font-medium">{offer.offer.client_name}</div>
          </div>
          {offer.offer.client_email && (
            <div>
              <div className="text-sm text-gray-600 mb-1">Email</div>
              <div className="font-medium">
                <a href={`mailto:${offer.offer.client_email}`} className="text-eltron-primary hover:underline">
                  {offer.offer.client_email}
                </a>
              </div>
            </div>
          )}
          {offer.offer.client_phone && (
            <div>
              <div className="text-sm text-gray-600 mb-1">Telefon</div>
              <div className="font-medium">
                <a href={`tel:${offer.offer.client_phone}`} className="text-eltron-primary hover:underline">
                  {offer.offer.client_phone}
                </a>
              </div>
            </div>
          )}
          <div>
            <div className="text-sm text-gray-600 mb-1">Czas dostawy</div>
            <div className="font-medium">{offer.offer.delivery_days} dni</div>
          </div>
        </div>
      </div>

      {/* Szczegóły oferty */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Szczegóły oferty</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-sm text-gray-600 mb-1">Data utworzenia</div>
            <div className="font-medium">{formatDate(offer.offer.created_at)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">Ważna do</div>
            <div className="font-medium">{getValidUntil()}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">Łączna wartość</div>
            <div className="font-bold text-lg text-eltron-primary">
              {formatCurrency(offer.offer.total_gross)}
            </div>
          </div>
        </div>
      </div>

      {/* Pozycje oferty */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Pozycje oferty</h2>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-2 font-medium text-gray-700">Lp.</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">Nazwa produktu</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">Ilość</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">Cena netto</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">VAT</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">Wartość netto</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">Wartość brutto</th>
              </tr>
            </thead>
            <tbody>
              {offer.items.map((item, index) => (
                <tr key={item.id} className="table-row">
                  <td className="py-3 px-2 text-gray-600">{index + 1}</td>
                  <td className="py-3 px-2">
                    <div className="font-medium text-gray-900">{item.product_name}</div>
                  </td>
                  <td className="py-3 px-2">{item.quantity} {item.unit}</td>
                  <td className="py-3 px-2">{formatCurrency(item.unit_price)}</td>
                  <td className="py-3 px-2">{item.vat_rate}%</td>
                  <td className="py-3 px-2 font-medium">{formatCurrency(item.net_amount)}</td>
                  <td className="py-3 px-2 font-medium">{formatCurrency(item.gross_amount)}</td>
                </tr>
              ))}
              
              {/* Dodatkowe koszty */}
              {offer.offer.additional_costs > 0 && (
                <tr className="table-row border-t border-gray-300">
                  <td className="py-3 px-2"></td>
                  <td className="py-3 px-2">
                    <div className="font-medium text-gray-900">
                      {offer.offer.additional_costs_description || 'Dodatkowe koszty'}
                    </div>
                  </td>
                  <td className="py-3 px-2">1 usł</td>
                  <td className="py-3 px-2">{formatCurrency(offer.offer.additional_costs)}</td>
                  <td className="py-3 px-2">23%</td>
                  <td className="py-3 px-2 font-medium">{formatCurrency(offer.offer.additional_costs)}</td>
                  <td className="py-3 px-2 font-medium">{formatCurrency(offer.offer.additional_costs * 1.23)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Podsumowanie */}
        <div className="mt-6 border-t border-gray-200 pt-6">
          <div className="flex justify-end">
            <div className="w-80 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Wartość netto:</span>
                <span className="font-medium">{formatCurrency(offer.offer.total_net)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">VAT:</span>
                <span className="font-medium">{formatCurrency(offer.offer.total_vat)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2">
                <span className="text-lg font-semibold">RAZEM:</span>
                <span className="text-lg font-bold text-eltron-primary">
                  {formatCurrency(offer.offer.total_gross)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Uwagi */}
      {offer.offer.notes && (
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Uwagi</h2>
          <div className="text-gray-700 whitespace-pre-wrap">{offer.offer.notes}</div>
        </div>
      )}

      {/* Nawigacja */}
      <div className="flex justify-between">
        <Link href="/dashboard/offers" className="btn-secondary">
          ← Powrót do listy ofert
        </Link>
        
        {offer.offer.status === 'draft' && (
          <Link 
            href={`/dashboard/offers/${offerId}/edit`} 
            className="btn-primary"
          >
            ✏️ Edytuj ofertę
          </Link>
        )}
      </div>
    </div>
  );
}
