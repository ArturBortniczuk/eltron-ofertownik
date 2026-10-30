// Lejek ofert - tablica kanban z przeciąganiem kart między statusami
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { formatCurrency, formatCurrencyShort, daysBetween, STATUS_META } from '../../../lib/format';
import { canAccessAllData } from '../../../lib/client-auth-utils';
import { ApprovalBadge, TypeBadge } from '../../components/StatusBadge';
import CloseOfferModal, { CloseTarget } from '../../components/CloseOfferModal';
import { offerLabel } from '../../../lib/offer-rules';

interface PipelineOffer {
  id: number;
  user_id: number;
  client_name: string;
  total_gross: number;
  status: string;
  created_at: string;
  sent_at?: string;
  accepted_at?: string;
  approval_status?: string;
  follow_up_date?: string | null;
  view_count?: number;
  salesperson_name?: string;
  margin_percent?: number;
  offer_number?: string;
  revision?: number;
  project_name?: string;
  offer_type?: string;
  outcome?: string | null;
  total_net?: number;
}

const COLUMNS = ['draft', 'sent', 'accepted', 'rejected'] as const;
const HINTS: Record<string, string> = {
  draft: 'Przeciągnij tu, aby wrócić do szkicu',
  sent: 'Przeciągnij tu, aby oznaczyć jako wysłaną',
  accepted: 'Przeciągnij tu, gdy oferta wygrana (lub częściowo)',
  rejected: 'Przeciągnij tu, gdy oferta przegrana',
};

export default function PipelinePage() {
  const { data: session } = useSession();
  const canViewAll = canAccessAllData(session);

  const [offers, setOffers] = useState<PipelineOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragId, setDragId] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [salesperson, setSalesperson] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [closing, setClosing] = useState<{ target: CloseTarget; initial: 'won' | 'lost' } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/offers?limit=500&sort=created_desc');
      if (res.ok) setOffers((await res.json()).offers);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const people = useMemo(() => {
    const map = new Map<number, string>();
    offers.forEach((o) => o.salesperson_name && map.set(o.user_id, o.salesperson_name));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [offers]);

  const columns = useMemo(() => {
    const cutoff = Date.now() - 60 * 86400000;
    const filtered = offers.filter((o) => !salesperson || String(o.user_id) === salesperson);
    return COLUMNS.map((status) => {
      let list = filtered.filter((o) => o.status === status);
      if ((status === 'accepted' || status === 'rejected') && !showOld) {
        list = list.filter((o) => new Date(o.accepted_at || o.sent_at || o.created_at).getTime() >= cutoff);
      }
      return { status, list, total: list.reduce((s, o) => s + o.total_gross, 0) };
    });
  }, [offers, salesperson, showOld]);

  const move = async (id: number, status: string) => {
    const offer = offers.find((o) => o.id === id);
    if (!offer || offer.status === status) return;
    setError('');

    // Wygrana / przegrana wymaga rozliczenia (wygrana, częściowo, przegrana + powód)
    if (status === 'accepted' || status === 'rejected') {
      if (offer.status === 'draft') { setError('Szkic nie był wysłany – najpierw oznacz ofertę jako wysłaną'); return; }
      setClosing({
        target: { id: offer.id, label: offerLabel(offer), client_name: offer.client_name, total_net: Number(offer.total_net) || 0 },
        initial: status === 'accepted' ? 'won' : 'lost',
      });
      return;
    }
    const lostReason: string | undefined = undefined;

    const previous = offers;
    setOffers((list) => list.map((o) => (o.id === id ? { ...o, status } : o)));
    try {
      const res = await fetch(`/api/offers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', status, lost_reason: lostReason }),
      });
      if (!res.ok) {
        setOffers(previous);
        setError((await res.json()).error || 'Nie udało się zmienić statusu');
      } else {
        load();
      }
    } catch {
      setOffers(previous);
      setError('Nie udało się zmienić statusu');
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Lejek ofert</h1>
          <p className="text-gray-600 mt-1">Przeciągaj karty między kolumnami, aby zmieniać status oferty.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {canViewAll && (
            <select value={salesperson} onChange={(e) => setSalesperson(e.target.value)} className="input-field !w-auto">
              <option value="">Wszyscy handlowcy</option>
              {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} />
            Pokaż starsze zamknięte
          </label>
          <Link href="/dashboard/offers/new" className="btn-primary">+ Nowa oferta</Link>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 animate-pulse">
          {COLUMNS.map((c) => <div key={c} className="h-96 bg-gray-200 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {columns.map(({ status, list, total }) => {
            const meta = STATUS_META[status];
            return (
              <div
                key={status}
                onDragOver={(e) => { e.preventDefault(); setOverCol(status); }}
                onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverCol(null);
                  const id = dragRef.current ?? dragId;
                  if (id !== null) move(id, status);
                  dragRef.current = null;
                  setDragId(null);
                }}
                className={`bg-gray-100 rounded-xl p-3 border-t-4 ${meta.column} transition-colors ${overCol === status ? 'bg-blue-50 ring-2 ring-eltron-primary' : ''}`}
              >
                <div className="flex justify-between items-baseline mb-3 px-1">
                  <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                    <span className="text-sm font-normal text-gray-500">({list.length})</span>
                  </h2>
                  <span className="text-sm font-medium text-gray-700">{formatCurrencyShort(total)}</span>
                </div>

                <div className="space-y-2 min-h-[120px] max-h-[70vh] overflow-y-auto pr-1">
                  {list.length === 0 && (
                    <div className="text-xs text-gray-400 text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">{HINTS[status]}</div>
                  )}
                  {list.map((o) => {
                    const overdue = o.status === 'sent' && o.follow_up_date && o.follow_up_date.slice(0, 10) <= today;
                    return (
                      <div
                        key={o.id}
                        draggable
                        onDragStart={(e) => {
                          // setData jest wymagane, aby przeciąganie działało w Firefoksie
                          e.dataTransfer.setData('text/plain', String(o.id));
                          e.dataTransfer.effectAllowed = 'move';
                          dragRef.current = o.id;
                          setDragId(o.id);
                        }}
                        onDragEnd={() => { setDragId(null); setOverCol(null); }}
                        className={`bg-white rounded-lg border border-gray-200 p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition ${dragId === o.id ? 'opacity-40' : ''}`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <Link href={`/dashboard/offers/${o.id}`} className="font-medium text-gray-900 hover:text-eltron-primary leading-snug">
                            {o.project_name || o.client_name}
                          </Link>
                          <span className="text-xs text-gray-400 shrink-0">{offerLabel(o)}</span>
                        </div>
                        {o.project_name && <div className="text-xs text-gray-500">{o.client_name}</div>}
                        <div className="mt-1 font-semibold text-eltron-primary">{formatCurrency(o.total_gross)}</div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <ApprovalBadge status={o.approval_status} />
                          <TypeBadge type={o.offer_type} />
                          {o.outcome === 'partial' && <span className="px-2 py-0.5 text-xs rounded-full bg-lime-100 text-lime-800">częściowo</span>}
                          {overdue && <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">📞 czas na kontakt</span>}
                          {o.status === 'sent' && !!o.view_count && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-sky-100 text-sky-700">👀 oglądana {o.view_count}x</span>
                          )}
                        </div>
                        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
                          <span>{o.salesperson_name || `${daysBetween(o.created_at)} dni temu`}</span>
                          {canViewAll && typeof o.margin_percent === 'number' && o.margin_percent > 0 && (
                            <span className={o.margin_percent < 10 ? 'text-red-600 font-medium' : ''}>marża {o.margin_percent.toFixed(1)}%</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {closing && (
        <CloseOfferModal offer={closing.target} initial={closing.initial} onClose={() => setClosing(null)} onDone={() => { setClosing(null); load(); }} />
      )}
    </div>
  );
}
