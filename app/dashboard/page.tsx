// app/dashboard/page.tsx - ZAKTUALIZOWANA WERSJA
'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DashboardStats {
  totalOffers: number;
  draftOffers: number;
  sentOffers: number;
  monthlyTotal: number;
  recentOffers: Array<{
    id: number;
    client_name: string;
    total_gross: number;
    created_at: string;
    status: string;
  }>;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/dashboard/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

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

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Witaj, {session?.user?.name}!
        </h1>
        <p className="text-gray-600 mt-2">
          Oto przegląd Twoich ofert i aktywności
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-eltron-primary/10 rounded-lg">
              <div className="w-6 h-6 text-eltron-primary">📊</div>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-bold text-gray-900">
                {stats?.totalOffers || 0}
              </p>
              <p className="text-gray-600 text-sm">Wszystkie oferty</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <div className="w-6 h-6 text-yellow-600">📝</div>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-bold text-gray-900">
                {stats?.draftOffers || 0}
              </p>
              <p className="text-gray-600 text-sm">Szkice</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <div className="w-6 h-6 text-blue-600">📤</div>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-bold text-gray-900">
                {stats?.sentOffers || 0}
              </p>
              <p className="text-gray-600 text-sm">Wysłane</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <div className="w-6 h-6 text-green-600">💰</div>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-bold text-gray-900">
                {stats?.monthlyTotal ? formatCurrency(stats.monthlyTotal) : '0 zł'}
              </p>
              <p className="text-gray-600 text-sm">Ten miesiąc</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Szybkie akcje</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link 
            href="/dashboard/clients/new"
            className="p-4 border border-gray-200 rounded-lg hover:border-eltron-primary hover:bg-eltron-primary/5 transition-colors group"
          >
            <div className="text-center">
              <div className="text-2xl mb-2">👥</div>
              <h3 className="font-medium text-gray-900 group-hover:text-eltron-primary">
                Dodaj klienta
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Nowy klient do bazy
              </p>
            </div>
          </Link>

          <Link 
            href="/dashboard/offers/new"
            className="p-4 border border-gray-200 rounded-lg hover:border-eltron-primary hover:bg-eltron-primary/5 transition-colors group"
          >
            <div className="text-center">
              <div className="text-2xl mb-2">➕</div>
              <h3 className="font-medium text-gray-900 group-hover:text-eltron-primary">
                Utwórz nową ofertę
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Wybierz klienta i utwórz ofertę
              </p>
            </div>
          </Link>

          <Link 
            href="/dashboard/clients"
            className="p-4 border border-gray-200 rounded-lg hover:border-eltron-primary hover:bg-eltron-primary/5 transition-colors group"
          >
            <div className="text-center">
              <div className="text-2xl mb-2">📋</div>
              <h3 className="font-medium text-gray-900 group-hover:text-eltron-primary">
                Zarządzaj klientami
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Przeglądaj bazę klientów
              </p>
            </div>
          </Link>

          <Link 
            href="/dashboard/offers" 
            className="p-4 border border-gray-200 rounded-lg hover:border-eltron-primary hover:bg-eltron-primary/5 transition-colors group"
          >
            <div className="text-center">
              <div className="text-2xl mb-2">📄</div>
              <h3 className="font-medium text-gray-900 group-hover:text-eltron-primary">
                Moje oferty
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Przeglądaj i edytuj oferty
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent offers */}
      {stats?.recentOffers && stats.recentOffers.length > 0 && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Ostatnie oferty</h2>
            <Link 
              href="/dashboard/offers" 
              className="text-eltron-primary hover:text-eltron-primary/80 text-sm font-medium"
            >
              Zobacz wszystkie →
            </Link>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Klient</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Wartość</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Data</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOffers.map((offer) => (
                  <tr key={offer.id} className="table-row">
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{offer.client_name}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">
                        {formatCurrency(offer.total_gross)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(offer.status)}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {formatDate(offer.created_at)}
                    </td>
                    <td className="py-3 px-4">
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
        </div>
      )}

      {/* Empty state */}
      {stats && stats.totalOffers === 0 && (
        <div className="card text-center py-12">
          <div className="text-4xl mb-4">🎯</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Zacznij od dodania klienta!
          </h3>
          <p className="text-gray-600 mb-6">
            Dodaj pierwszego klienta, a następnie utwórz dla niego ofertę.
          </p>
          <div className="flex justify-center space-x-4">
            <Link href="/dashboard/clients/new" className="btn-primary">
              Dodaj klienta
            </Link>
            <Link href="/dashboard/offers/new" className="btn-secondary">
              Utwórz ofertę
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
