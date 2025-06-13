// app/dashboard/clients/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Client {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  nip?: string;
  contact_person?: string;
  notes?: string;
  created_at: string;
  last_used: string;
}

interface ClientOffer {
  id: number;
  total_gross: number;
  status: string;
  created_at: string;
}

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params.id as string;
  
  const [client, setClient] = useState<Client | null>(null);
  const [offers, setOffers] = useState<ClientOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchClientDetails();
  }, [clientId]);

  const fetchClientDetails = async () => {
    try {
      const [clientResponse, offersResponse] = await Promise.all([
        fetch(`/api/clients/${clientId}`),
        fetch(`/api/offers?client_id=${clientId}`)
      ]);

      if (clientResponse.ok) {
        const clientData = await clientResponse.json();
        setClient(clientData);
      } else {
        setError('Nie znaleziono klienta');
      }

      if (offersResponse.ok) {
        const offersData = await offersResponse.json();
        setOffers(offersData.offers || []);
      }
    } catch (error) {
      setError('Błąd ładowania danych');
    } finally {
      setLoading(false);
    }
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

  const totalValue = offers
    .filter(offer => offer.status !== 'draft')
    .reduce((sum, offer) => sum + offer.total_gross, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-64 bg-gray-200 rounded-lg"></div>
              <div className="h-48 bg-gray-200 rounded-lg"></div>
            </div>
            <div className="h-48 bg-gray-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="card text-center">
        <div className="text-red-600 text-lg mb-4">{error || 'Nie znaleziono klienta'}</div>
        <Link href="/dashboard/clients" className="btn-primary">
          Powrót do listy klientów
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div className="flex items-center space-x-4">
          <Link 
            href="/dashboard/clients" 
            className="text-gray-600 hover:text-gray-800"
          >
            ← Powrót
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{client.name}</h1>
            <p className="text-gray-600 mt-2">Szczegóły klienta</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/dashboard/offers/new?client=${client.id}`}
            className="btn-primary"
          >
            📋 Nowa oferta
          </Link>
          <Link
            href={`/dashboard/clients/${client.id}/edit`}
            className="btn-secondary"
          >
            ✏️ Edytuj klienta
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Główne informacje */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dane kontaktowe */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Dane kontaktowe</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {client.contact_person && (
                <div>
                  <div className="text-sm text-gray-600 mb-1">Osoba kontaktowa</div>
                  <div className="font-medium">{client.contact_person}</div>
                </div>
              )}
              
              {client.email && (
                <div>
                  <div className="text-sm text-gray-600 mb-1">Email</div>
                  <div className="font-medium">
                    <a href={`mailto:${client.email}`} className="text-eltron-primary hover:underline">
                      {client.email}
                    </a>
                  </div>
                </div>
              )}
              
              {client.phone && (
                <div>
                  <div className="text-sm text-gray-600 mb-1">Telefon</div>
                  <div className="font-medium">
                    <a href={`tel:${client.phone}`} className="text-eltron-primary hover:underline">
                      {client.phone}
                    </a>
                  </div>
                </div>
              )}
              
              {client.nip && (
                <div>
                  <div className="text-sm text-gray-600 mb-1">NIP</div>
                  <div className="font-medium">{client.nip}</div>
                </div>
              )}
              
              {client.address && (
                <div className="md:col-span-2">
                  <div className="text-sm text-gray-600 mb-1">Adres</div>
                  <div className="font-medium whitespace-pre-line">{client.address}</div>
                </div>
              )}
            </div>
          </div>

          {/* Uwagi */}
          {client.notes && (
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Uwagi</h2>
              <div className="text-gray-700 whitespace-pre-line">{client.notes}</div>
            </div>
          )}

          {/* Historia ofert */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Historia ofert</h2>
            
            {offers.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">📋</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Brak ofert dla tego klienta
                </h3>
                <p className="text-gray-600 mb-4">
                  Utwórz pierwszą ofertę dla tego klienta.
                </p>
                <Link
                  href={`/dashboard/offers/new?client=${client.id}`}
                  className="btn-primary"
                >
                  Utwórz ofertę
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 font-medium text-gray-700">Nr oferty</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-700">Wartość</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-700">Status</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-700">Data</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-700">Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offers.map((offer) => (
                      <tr key={offer.id} className="table-row">
                        <td className="py-3 px-2">
                          <div className="font-medium text-eltron-primary">#{offer.id}</div>
                        </td>
                        <td className="py-3 px-2">
                          <div className="font-medium">{formatCurrency(offer.total_gross)}</div>
                        </td>
                        <td className="py-3 px-2">
                          {getStatusBadge(offer.status)}
                        </td>
                        <td className="py-3 px-2 text-gray-600">
                          {formatDate(offer.created_at)}
                        </td>
                        <td className="py-3 px-2">
                          <Link 
                            href={`/dashboard/offers/${offer.id}`}
                            className="text-eltron-primary hover:text-eltron-primary/80 text-sm font-medium"
                          >
                            Podgląd
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar ze statystykami */}
        <div className="space-y-6">
          {/* Statystyki */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Statystyki</h2>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Liczba ofert:</span>
                <span className="font-medium">{offers.length}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Łączna wartość:</span>
                <span className="font-medium text-eltron-primary">
                  {formatCurrency(totalValue)}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Dodano:</span>
                <span className="font-medium">{formatDate(client.created_at)}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Ostatnia aktywność:</span>
                <span className="font-medium">{formatDate(client.last_used)}</span>
              </div>
            </div>
          </div>

          {/* Statusy ofert */}
          {offers.length > 0 && (
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Statusy ofert</h2>
              <div className="space-y-2">
                {['draft', 'sent', 'accepted', 'rejected'].map(status => {
                  const count = offers.filter(offer => offer.status === status).length;
                  if (count === 0) return null;
                  
                  return (
                    <div key={status} className="flex justify-between items-center">
                      {getStatusBadge(status)}
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}