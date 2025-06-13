// app/dashboard/clients/page.tsx
'use client';

import { useState, useEffect } from 'react';
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

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredClients(clients);
    } else {
      const filtered = clients.filter(client =>
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredClients(filtered);
    }
  }, [clients, searchTerm]);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/clients');
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteClient = async (clientId: number) => {
    if (!confirm('Czy na pewno chcesz usunąć tego klienta?')) return;

    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchClients();
      } else {
        const error = await response.json();
        alert(error.error || 'Błąd podczas usuwania klienta');
      }
    } catch (error) {
      alert('Błąd podczas usuwania klienta');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 bg-gray-200 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Klienci</h1>
          <p className="text-gray-600 mt-2">
            Zarządzaj bazą klientów ({clients.length} łącznie)
          </p>
        </div>
        <Link href="/dashboard/clients/new" className="btn-primary">
          ➕ Dodaj klienta
        </Link>
      </div>

      {/* Wyszukiwanie */}
      <div className="card">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Szukaj klientów..."
              className="input-field"
            />
          </div>
          <div className="text-sm text-gray-600">
            Znaleziono: {filteredClients.length}
          </div>
        </div>
      </div>

      {/* Lista klientów */}
      {filteredClients.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-4">👥</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {searchTerm ? 'Brak wyników wyszukiwania' : 'Nie masz jeszcze żadnych klientów'}
          </h3>
          <p className="text-gray-600 mb-6">
            {searchTerm 
              ? 'Spróbuj innych słów kluczowych.'
              : 'Dodaj pierwszego klienta, aby móc tworzyć dla niego oferty.'}
          </p>
          {!searchTerm && (
            <Link href="/dashboard/clients/new" className="btn-primary">
              Dodaj pierwszego klienta
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map((client) => (
            <div key={client.id} className="card hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {client.name}
                  </h3>
                  {client.contact_person && (
                    <p className="text-sm text-gray-600">
                      Kontakt: {client.contact_person}
                    </p>
                  )}
                </div>
                <div className="flex space-x-2">
                  <Link 
                    href={`/dashboard/clients/${client.id}/edit`}
                    className="text-eltron-primary hover:text-eltron-primary/80 text-sm"
                  >
                    ✏️
                  </Link>
                  <button
                    onClick={() => deleteClient(client.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {client.email && (
                  <div className="flex items-center text-gray-600">
                    <span className="w-4">📧</span>
                    <a href={`mailto:${client.email}`} className="text-eltron-primary hover:underline ml-2">
                      {client.email}
                    </a>
                  </div>
                )}
                
                {client.phone && (
                  <div className="flex items-center text-gray-600">
                    <span className="w-4">📞</span>
                    <a href={`tel:${client.phone}`} className="text-eltron-primary hover:underline ml-2">
                      {client.phone}
                    </a>
                  </div>
                )}
                
                {client.address && (
                  <div className="flex items-start text-gray-600">
                    <span className="w-4 mt-0.5">📍</span>
                    <span className="ml-2">{client.address}</span>
                  </div>
                )}

                {client.nip && (
                  <div className="flex items-center text-gray-600">
                    <span className="w-4">🏢</span>
                    <span className="ml-2">NIP: {client.nip}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Dodano: {formatDate(client.created_at)}</span>
                  <span>Ostatnio: {formatDate(client.last_used)}</span>
                </div>
              </div>

              <div className="mt-3 flex space-x-2">
                <Link
                  href={`/dashboard/offers/new?client=${client.id}`}
                  className="flex-1 bg-eltron-primary/10 text-eltron-primary hover:bg-eltron-primary/20 text-center py-2 px-3 rounded text-sm font-medium transition-colors"
                >
                  📋 Nowa oferta
                </Link>
                <Link
                  href={`/dashboard/clients/${client.id}`}
                  className="flex-1 bg-gray-100 text-gray-700 hover:bg-gray-200 text-center py-2 px-3 rounded text-sm font-medium transition-colors"
                >
                  👁️ Szczegóły
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}