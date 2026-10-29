// app/dashboard/clients/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { canAccessAllData } from '../../../lib/client-auth-utils';
import { formatCurrency } from '../../../lib/format';
import { mapClientRows, parseCsv, ImportClientRow } from '../../../lib/csv';

// Segmentacja po czasie od ostatniej oferty: aktywni <= 60 dni, uśpieni <= 180 dni, do reaktywacji - starsi
const VIP_THRESHOLD = 100000;
const daysSince = (d?: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null);
const segmentOf = (c: { offers_count?: number; last_offer_at?: string | null }) => {
  if (!c.offers_count) return 'new';
  const days = daysSince(c.last_offer_at);
  if (days === null || days <= 60) return 'active';
  return days <= 180 ? 'sleeping' : 'lost';
};
const isVip = (c: { won_value?: number }) => (c.won_value || 0) >= VIP_THRESHOLD;
const SEGMENTS = [
  { key: '', label: 'Wszyscy' },
  { key: 'active', label: '🟢 Aktywni' },
  { key: 'sleeping', label: '🟡 Uśpieni (60–180 dni)' },
  { key: 'lost', label: '🔴 Do reaktywacji (>180 dni)' },
  { key: 'new', label: '⚪ Bez ofert' },
  { key: 'vip', label: '⭐ VIP (wygrane ≥ 100 tys.)' },
];

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
  owner_name?: string;
  offers_count?: number;
  won_value?: number;
  open_value?: number;
  last_offer_at?: string | null;
}

export default function ClientsPage() {
  const { data: session } = useSession();
  const canViewAll = canAccessAllData(session);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [segment, setSegment] = useState('');
  const [reminded, setReminded] = useState<number[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportClientRow[] | null>(null);
  const [importInfo, setImportInfo] = useState('');
  const [importResult, setImportResult] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    setFilteredClients(
      clients.filter((client) => {
        if (segment && segmentOf(client) !== segment && !(segment === 'vip' && isVip(client))) return false;
        if (!term) return true;
        return (
          client.name.toLowerCase().includes(term) ||
          client.email?.toLowerCase().includes(term) ||
          client.contact_person?.toLowerCase().includes(term)
        );
      })
    );
  }, [clients, searchTerm, segment]);

  const remindAbout = async (client: Client) => {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Odświeżyć kontakt z ${client.name}`, due_date: new Date().toISOString().slice(0, 10), client_id: client.id }),
    });
    setReminded((r) => [...r, client.id]);
  };

  const onImportFile = async (file: File | undefined) => {
    setImportResult('');
    setImportRows(null);
    if (!file) return;
    const { rows, unknownHeaders, error } = mapClientRows(parseCsv(await file.text()));
    if (error) return setImportInfo(error);
    setImportRows(rows);
    setImportInfo(`Wczytano ${rows.length} klientów.` + (unknownHeaders.length ? ` Pominięte kolumny: ${unknownHeaders.join(', ')}.` : ''));
  };

  const runImport = async () => {
    if (!importRows) return;
    setImporting(true);
    try {
      const res = await fetch('/api/clients/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: importRows }) });
      const d = await res.json();
      if (res.ok) {
        setImportResult(`Dodano ${d.created} klientów, pominięto ${d.skipped} duplikatów (ten sam NIP lub nazwa).${d.errors?.length ? ` Błędy: ${d.errors.join('; ')}` : ''}`);
        setImportRows(null);
        fetchClients();
      } else {
        setImportResult(d.error || 'Import nie powiódł się');
      }
    } finally {
      setImporting(false);
    }
  };

  const downloadClientTemplate = () => {
    const csv = '﻿Nazwa;NIP;Osoba kontaktowa;E-mail;Telefon;Adres;Uwagi\r\nPrzykładowa Firma Sp. z o.o.;1234567890;Jan Kowalski;jan@firma.pl;+48 500 100 200;ul. Prosta 1, 00-001 Warszawa;Stały klient\r\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'wzor-importu-klientow.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

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
            {canViewAll ? 'Wszyscy klienci firmy' : 'Twoi klienci'} ({clients.length} łącznie)
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport((v) => !v)} className="btn-secondary">⬆ Import CSV</button>
          <a href="/api/export/clients" className="btn-secondary">⬇ Eksport CSV</a>
          <Link href="/dashboard/clients/new" className="btn-primary">
            ➕ Dodaj klienta
          </Link>
        </div>
      </div>

      {showImport && (
        <div className="card">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">Import klientów z CSV / Excela</h2>
              <p className="text-sm text-gray-600">Kolumny: Nazwa, NIP, Osoba kontaktowa, E-mail, Telefon, Adres, Uwagi. Duplikaty (ten sam NIP lub nazwa) zostaną pominięte, a nowi klienci trafią do Ciebie.</p>
            </div>
            <div className="flex gap-2 items-center">
              <button onClick={downloadClientTemplate} className="btn-secondary text-sm">Pobierz wzór</button>
              <input type="file" accept=".csv,text/csv" onChange={(e) => onImportFile(e.target.files?.[0])} className="text-sm" />
            </div>
          </div>
          {importInfo && <div className="mt-3 text-sm text-gray-700">{importInfo}</div>}
          {importRows && importRows.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-gray-500 mb-2">Podgląd: {importRows.slice(0, 3).map((r) => r.name).join(', ')}{importRows.length > 3 ? '...' : ''}</div>
              <button onClick={runImport} disabled={importing} className="btn-primary disabled:opacity-50">{importing ? 'Importuję...' : `Importuj ${importRows.length} klientów`}</button>
            </div>
          )}
          {importResult && <div className="mt-3 text-sm font-medium text-green-700">{importResult}</div>}
        </div>
      )}

      {/* Segmenty */}
      <div className="flex flex-wrap gap-2">
        {SEGMENTS.map((s) => {
          const count = s.key === 'vip' ? clients.filter(isVip).length : s.key ? clients.filter((c) => segmentOf(c) === s.key).length : clients.length;
          return (
            <button key={s.key || 'all'} onClick={() => setSegment(s.key)} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${segment === s.key ? 'bg-eltron-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {s.label} ({count})
            </button>
          );
        })}
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
                    {isVip(client) && <span title="Klient VIP">⭐ </span>}{client.name}
                  </h3>
                  <div className="mb-1">
                    {({
                      active: <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">Aktywny</span>,
                      sleeping: <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800">Uśpiony · {daysSince(client.last_offer_at)} dni bez oferty</span>,
                      lost: <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800">Do reaktywacji · {daysSince(client.last_offer_at)} dni</span>,
                      new: <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">Bez ofert</span>,
                    } as Record<string, JSX.Element>)[segmentOf(client)]}
                  </div>
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

              <div className="mt-4 grid grid-cols-3 gap-2 text-center bg-gray-50 rounded-lg p-2">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{client.offers_count || 0}</div>
                  <div className="text-[11px] text-gray-500">ofert</div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-green-700">{formatCurrency(client.won_value || 0)}</div>
                  <div className="text-[11px] text-gray-500">wygrane</div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-blue-700">{formatCurrency(client.open_value || 0)}</div>
                  <div className="text-[11px] text-gray-500">w lejku</div>
                </div>
              </div>
              {canViewAll && client.owner_name && (
                <div className="mt-2 text-xs text-gray-500">Opiekun: {client.owner_name}</div>
              )}

              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Dodano: {formatDate(client.created_at)}</span>
                  <span>Ostatnio: {formatDate(client.last_used)}</span>
                </div>
              </div>

              {(segmentOf(client) === 'sleeping' || segmentOf(client) === 'lost') && (
                <button
                  onClick={() => remindAbout(client)}
                  disabled={reminded.includes(client.id)}
                  className="mt-3 w-full border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 rounded py-1.5 text-sm disabled:opacity-60"
                >
                  {reminded.includes(client.id) ? '✓ Dodano zadanie na dziś' : '📞 Przypomnij o kontakcie'}
                </button>
              )}

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