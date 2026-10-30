'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { canAccessAllData } from '../../../lib/client-auth-utils';
import { formatCurrency, formatDate, marginBadge, STATUS_META } from '../../../lib/format';
import { StatusBadge, ApprovalBadge, TypeBadge } from '../../components/StatusBadge';
import CloseOfferModal, { CloseTarget } from '../../components/CloseOfferModal';
import { offerLabel, SEGMENTS, OPEN_OFFERS_LIMIT } from '../../../lib/offer-rules';

interface Offer {
  id: number;
  user_id: number;
  client_name: string;
  client_email?: string;
  total_gross: number;
  status: string;
  created_at: string;
  approval_status?: string;
  follow_up_date?: string | null;
  view_count?: number;
  public_token?: string;
  salesperson_name?: string;
  market_region?: string;
  margin_percent?: number;
  total_margin?: number;
  offer_number?: string;
  revision?: number;
  project_name?: string;
  segment?: string;
  offer_type?: string;
  outcome?: string | null;
  won_amount?: number | null;
  contact_person?: string;
  ekonom_order_no?: string | null;
  total_net?: number;
  valid_days?: number;
  sent_at?: string | null;
}

const FILTERS = ['', 'draft', 'sent', 'accepted', 'rejected'] as const;

export default function OffersListPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const canViewAll = canAccessAllData(session);

  const [offers, setOffers] = useState<Offer[]>([]);
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, totalCount: 0, hasNext: false, hasPrev: false });
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [approvalOnly, setApprovalOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState('created_desc');
  const [salesperson, setSalesperson] = useState('');
  const [people, setPeople] = useState<Array<{ id: number; name: string }>>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [copied, setCopied] = useState<number | null>(null);
  const [duplicating, setDuplicating] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  const [segment, setSegment] = useState('');
  const [offerType, setOfferType] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [overdueInfo, setOverdueInfo] = useState<{ count: number; blocked: boolean } | null>(null);
  const [closing, setClosing] = useState<CloseTarget | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('overdue') === '1') setOverdueOnly(true);
  }, []);

  const loadOverdue = useCallback(() => {
    fetch('/api/offers/overdue').then((r) => (r.ok ? r.json() : null)).then((d) => d && setOverdueInfo({ count: d.count, blocked: d.blocked })).catch(() => undefined);
  }, []);
  useEffect(() => { loadOverdue(); }, [loadOverdue]);

  const toggleOne = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const runBulk = async (body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBulkBusy(true);
    setBulkMsg('');
    try {
      const res = await fetch('/api/offers/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected, ...body }) });
      const d = await res.json();
      if (res.ok) {
        const skipped = d.skipped?.length ? ` Pominięto ${d.skipped.length}: ${d.skipped.slice(0, 3).map((s: any) => `#${s.id} (${s.reason})`).join(', ')}${d.skipped.length > 3 ? '...' : ''}.` : '';
        setBulkMsg(`Zmieniono ${d.updated} ofert.${skipped}`);
        setSelected([]);
        fetchOffers();
      } else {
        setBulkMsg(d.error || 'Akcja zbiorcza nie powiodła się');
      }
    } finally {
      setBulkBusy(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setCurrentPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!canViewAll) return;
    fetch('/api/demo/users').then((r) => r.json()).then((d) => setPeople((d.users || []).filter((u: any) => u.role !== 'zarząd'))).catch(() => undefined);
  }, [canViewAll]);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: '12', sort });
      if (statusFilter) params.set('status', statusFilter);
      if (debounced) params.set('q', debounced);
      if (approvalOnly) params.set('approval', 'pending');
      if (salesperson) params.set('user_id', salesperson);
      if (segment) params.set('segment', segment);
      if (offerType) params.set('type', offerType);
      if (overdueOnly) params.set('overdue', '1');
      const response = await fetch(`/api/offers?${params}`);
      if (response.ok) {
        const data = await response.json();
        setOffers(data.offers);
        setPagination(data.pagination);
        setStatusCounts(data.statusCounts || {});
        setTotalValue(data.totalValue || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, debounced, approvalOnly, sort, salesperson, segment, offerType, overdueOnly]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  const duplicate = async (id: number) => {
    setDuplicating(id);
    try {
      const res = await fetch(`/api/offers/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'duplicate' }) });
      if (res.ok) router.push(`/dashboard/offers/${(await res.json()).offerId}`);
    } finally {
      setDuplicating(null);
    }
  };

  const copyLink = async (offer: Offer) => {
    if (!offer.public_token) return;
    await navigator.clipboard?.writeText(`${window.location.origin}/o/${offer.public_token}`).catch(() => undefined);
    setCopied(offer.id);
    setTimeout(() => setCopied(null), 1800);
  };

  const stale = (o: Offer) => {
    const base = new Date(o.sent_at || o.created_at).getTime();
    return base + ((o.valid_days || 30) + 7) * 86400000 < Date.now();
  };

  const allCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{canViewAll ? 'Wszystkie oferty' : 'Moje oferty'}</h1>
          <p className="text-gray-600 mt-2">
            {pagination.totalCount} ofert · łączna wartość brutto {formatCurrency(totalValue)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href={`/api/export/offers${statusFilter ? `?status=${statusFilter}` : ''}`} className="btn-secondary">⬇ Eksport CSV</a>
          <Link href="/dashboard/compare" className="btn-secondary">⚖️ Porównaj</Link>
          <Link href="/dashboard/offers/new" className="btn-primary">➕ Nowa oferta</Link>
        </div>
      </div>

      {overdueInfo && overdueInfo.count > 0 && (
        <div className={`rounded-lg border p-4 flex flex-col md:flex-row md:items-center gap-3 ${overdueInfo.blocked ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
          <div className="flex-1 text-sm">
            <div className={`font-semibold ${overdueInfo.blocked ? 'text-red-900' : 'text-amber-900'}`}>
              {overdueInfo.blocked ? '⛔ Nowe oferty zablokowane' : '⚠️ Masz oferty bez wyniku'} – {overdueInfo.count} {overdueInfo.count === 1 ? 'oferta' : 'ofert'} po terminie ważności nadal „wisi” jako wysłana
            </div>
            <div className={overdueInfo.blocked ? 'text-red-800' : 'text-amber-800'}>
              Oznacz każdą jako wygraną, przegraną lub wygraną częściowo (limit: {OPEN_OFFERS_LIMIT}). Dzięki temu lejek i prognoza są prawdziwe.
            </div>
          </div>
          <button onClick={() => { setOverdueOnly(!overdueOnly); setCurrentPage(1); }} className="btn-secondary text-sm whitespace-nowrap">
            {overdueOnly ? 'Pokaż wszystkie' : 'Pokaż oferty do rozliczenia'}
          </button>
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input-field flex-1" placeholder="Szukaj: klient, temat / inwestycja, numer oferty..." />
          <select value={segment} onChange={(e) => { setSegment(e.target.value); setCurrentPage(1); }} className="input-field md:!w-52">
            <option value="">Wszystkie segmenty</option>
            {SEGMENTS.map((sg) => <option key={sg}>{sg}</option>)}
          </select>
          <select value={offerType} onChange={(e) => { setOfferType(e.target.value); setCurrentPage(1); }} className="input-field md:!w-40">
            <option value="">Zakup i przetarg</option>
            <option value="zakup">Zakup</option>
            <option value="przetarg">Przetarg</option>
          </select>
          {canViewAll && (
            <select value={salesperson} onChange={(e) => { setSalesperson(e.target.value); setCurrentPage(1); }} className="input-field md:!w-56">
              <option value="">Wszyscy handlowcy</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="input-field md:!w-48">
            <option value="created_desc">Najnowsze</option>
            <option value="created_asc">Najstarsze</option>
            <option value="value_desc">Najwyższa wartość</option>
            <option value="value_asc">Najniższa wartość</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {FILTERS.map((s) => (
            <button
              key={s || 'all'}
              onClick={() => { setStatusFilter(s); setCurrentPage(1); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-eltron-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {s ? STATUS_META[s].label : 'Wszystkie'} ({s ? statusCounts[s] || 0 : allCount})
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm text-gray-700 ml-2">
            <input type="checkbox" checked={approvalOnly} onChange={(e) => { setApprovalOnly(e.target.checked); setCurrentPage(1); }} />
            Tylko czekające na akceptację
          </label>
        </div>
      </div>

      {loading && offers.length === 0 ? (
        <div className="card animate-pulse space-y-4">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-gray-200 rounded" />)}</div>
      ) : offers.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-4">📋</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Brak ofert spełniających kryteria</h3>
          <p className="text-gray-600 mb-6">Zmień filtry lub utwórz nową ofertę.</p>
          <Link href="/dashboard/offers/new" className="btn-primary">Utwórz ofertę</Link>
        </div>
      ) : (
        <div className={`card ${loading ? 'opacity-60' : ''}`}>
          {bulkMsg && <div className="mb-4 bg-sky-50 border border-sky-200 text-sky-800 text-sm rounded-lg p-3">{bulkMsg}</div>}
          {selected.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 bg-eltron-primary text-white rounded-lg px-4 py-3 text-sm">
              <strong>Zaznaczono: {selected.length}</strong>
              <span className="mx-1 opacity-60">|</span>
              {(['sent', 'accepted', 'rejected', 'draft'] as const).map((s) => (
                <button key={s} disabled={bulkBusy} onClick={() => runBulk({ action: 'status', status: s })} className="bg-white/15 hover:bg-white/25 rounded px-3 py-1 disabled:opacity-50">
                  → {STATUS_META[s].label}
                </button>
              ))}
              <button disabled={bulkBusy} onClick={() => runBulk({ action: 'extend', days: 14 })} className="bg-white/15 hover:bg-white/25 rounded px-3 py-1 disabled:opacity-50">⏳ +14 dni ważności</button>
              <button disabled={bulkBusy} onClick={() => runBulk({ action: 'delete' }, `Usunąć ${selected.length} zaznaczonych ofert? Tej operacji nie można cofnąć.`)} className="bg-red-500/80 hover:bg-red-500 rounded px-3 py-1 disabled:opacity-50">🗑️ Usuń</button>
              <button onClick={() => setSelected([])} className="ml-auto underline opacity-80 hover:opacity-100">Odznacz</button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left text-sm text-gray-700">
                  <th className="py-3 px-3 w-8">
                    <input
                      type="checkbox"
                      aria-label="Zaznacz wszystkie na stronie"
                      checked={offers.length > 0 && offers.every((o) => selected.includes(o.id))}
                      onChange={(e) => setSelected(e.target.checked ? offers.map((o) => o.id) : [])}
                    />
                  </th>
                  <th className="py-3 px-3 font-medium">Nr</th>
                  <th className="py-3 px-3 font-medium">Temat / klient</th>
                  {canViewAll && <th className="py-3 px-3 font-medium">Handlowiec</th>}
                  <th className="py-3 px-3 font-medium text-right">Wartość</th>
                  {canViewAll && <th className="py-3 px-3 font-medium text-right">Marża</th>}
                  <th className="py-3 px-3 font-medium">Status</th>
                  <th className="py-3 px-3 font-medium">Data</th>
                  <th className="py-3 px-3 font-medium text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((offer) => {
                  const overdue = offer.status === 'sent' && offer.follow_up_date && offer.follow_up_date.slice(0, 10) <= today;
                  return (
                    <tr key={offer.id} className={`table-row ${selected.includes(offer.id) ? 'bg-sky-50' : ''}`}>
                      <td className="py-3 px-3"><input type="checkbox" aria-label={`Zaznacz ofertę ${offer.id}`} checked={selected.includes(offer.id)} onChange={() => toggleOne(offer.id)} /></td>
                      <td className="py-3 px-3 font-medium text-eltron-primary whitespace-nowrap">{offerLabel(offer)}</td>
                      <td className="py-3 px-3">
                        <Link href={`/dashboard/offers/${offer.id}`} className="font-medium text-gray-900 hover:text-eltron-primary">{offer.project_name || offer.client_name}</Link>
                        <div className="text-xs text-gray-500">{offer.client_name}{offer.contact_person ? ` · ${offer.contact_person}` : ''}{offer.segment ? ` · ${offer.segment}` : ''}</div>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          <TypeBadge type={offer.offer_type} />
                          {offer.ekonom_order_no && <span className="text-xs text-indigo-600">🔗 {offer.ekonom_order_no}</span>}
                          {offer.status === 'sent' && stale(offer) && <span className="text-xs text-red-600 font-medium">⏰ do rozliczenia</span>}
                          {overdue && <span className="text-xs text-red-600">📞 czas na kontakt</span>}
                          {offer.status === 'sent' && !!offer.view_count && <span className="text-xs text-sky-600">👀 {offer.view_count}x</span>}
                        </div>
                      </td>
                      {canViewAll && (
                        <td className="py-3 px-3 text-sm text-gray-600">{offer.salesperson_name}<div className="text-xs text-gray-400">{offer.market_region}</div></td>
                      )}
                      <td className="py-3 px-3 text-right font-medium whitespace-nowrap">{formatCurrency(offer.total_gross)}</td>
                      {canViewAll && (
                        <td className="py-3 px-3 text-right">
                          {offer.margin_percent
                            ? <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${marginBadge(offer.margin_percent)}`}>{offer.margin_percent.toFixed(1)}%</span>
                            : <span className="text-gray-400">-</span>}
                        </td>
                      )}
                      <td className="py-3 px-3">
                        <div className="flex flex-col items-start gap-1"><StatusBadge status={offer.status} outcome={offer.outcome} /><ApprovalBadge status={offer.approval_status} /></div>
                      </td>
                      <td className="py-3 px-3 text-gray-600 whitespace-nowrap">{formatDate(offer.created_at)}</td>
                      <td className="py-3 px-3">
                        <div className="flex gap-3 justify-end text-sm whitespace-nowrap">
                          <Link href={`/dashboard/offers/${offer.id}`} className="text-eltron-primary hover:underline font-medium">Podgląd</Link>
                          {offer.status === 'sent' && (
                            <button
                              onClick={() => setClosing({ id: offer.id, label: offerLabel(offer), client_name: offer.client_name, total_net: Number(offer.total_net) || 0 })}
                              className="text-green-700 hover:text-green-900 font-medium"
                            >
                              Rozlicz
                            </button>
                          )}
                          <button onClick={() => duplicate(offer.id)} disabled={duplicating === offer.id} className="text-gray-600 hover:text-eltron-primary disabled:opacity-50">
                            {duplicating === offer.id ? '...' : 'Kopiuj'}
                          </button>
                          {offer.status !== 'draft' && offer.public_token && (
                            <button onClick={() => copyLink(offer)} className="text-gray-600 hover:text-eltron-primary">{copied === offer.id ? '✓ Skopiowano' : '🔗 Link'}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex justify-between items-center mt-6 pt-6 border-t border-gray-200">
              <div className="text-sm text-gray-600">Strona {pagination.currentPage} z {pagination.totalPages}</div>
              <div className="flex space-x-2">
                <button onClick={() => setCurrentPage(currentPage - 1)} disabled={!pagination.hasPrev} className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50">← Poprzednia</button>
                <button onClick={() => setCurrentPage(currentPage + 1)} disabled={!pagination.hasNext} className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50">Następna →</button>
              </div>
            </div>
          )}
        </div>
      )}
      {closing && (
        <CloseOfferModal offer={closing} onClose={() => setClosing(null)} onDone={() => { setClosing(null); fetchOffers(); loadOverdue(); }} />
      )}
    </div>
  );
}
