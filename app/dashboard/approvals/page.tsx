// Akceptacje ofert z niską marżą (zarząd decyduje, Centrum Elektryczne ma podgląd)
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { canAccessAllData, canManageUsers } from '../../../lib/client-auth-utils';
import { formatCurrency, formatDate, marginBadge, timeAgo } from '../../../lib/format';
import { ApprovalBadge } from '../../components/StatusBadge';
import { APPROVAL_RULES } from '../../../lib/offer-calc';

interface PendingOffer {
  id: number;
  client_name: string;
  total_gross: number;
  created_at: string;
  salesperson_name?: string;
  market_region?: string;
  margin_percent: number;
  total_margin: number;
  approval_status: string;
}
interface Detail {
  items: Array<{ id: number; product_name: string; quantity: number; unit: string; unit_price: number; cost_price: number; margin_percent: number; discount_percent: number }>;
  offer: { notes?: string };
}

export default function ApprovalsPage() {
  const { data: session, status } = useSession();
  const canView = canAccessAllData(session);
  const canDecide = canManageUsers(session);

  const [pending, setPending] = useState<PendingOffer[]>([]);
  const [decided, setDecided] = useState<PendingOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<number, Detail>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [p, a, r] = await Promise.all([
      fetch('/api/offers?approval=pending&limit=100&sort=created_asc').then((x) => x.json()),
      fetch('/api/offers?approval=approved&limit=8').then((x) => x.json()),
      fetch('/api/offers?approval=rejected&limit=8').then((x) => x.json()),
    ]);
    setPending(p.offers || []);
    setDecided([...(a.offers || []), ...(r.offers || [])].sort((x, y) => +new Date(y.created_at) - +new Date(x.created_at)).slice(0, 10));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canView) load();
    else if (status !== 'loading') setLoading(false);
  }, [canView, status, load]);

  const toggle = async (id: number) => {
    if (expanded === id) return setExpanded(null);
    setExpanded(id);
    if (!detail[id]) {
      const res = await fetch(`/api/offers/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDetail((d) => ({ ...d, [id]: { items: data.items, offer: data.offer } }));
      }
    }
  };

  const decide = async (id: number, action: 'approve' | 'reject') => {
    setBusy(id);
    setError('');
    try {
      const res = await fetch(`/api/offers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: notes[id] || '' }),
      });
      if (res.ok) await load();
      else setError((await res.json()).error || 'Nie udało się zapisać decyzji');
    } finally {
      setBusy(null);
    }
  };

  if (status === 'loading') return null;
  if (!canView) {
    return (
      <div className="card text-center py-10">
        <div className="text-red-600 text-lg mb-2">Brak uprawnień</div>
        <p className="text-gray-600">Akceptacje ofert są dostępne dla zarządu i Centrum Elektrycznego.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Akceptacje marży</h1>
        <p className="text-gray-600 mt-1">
          Oferty ze średnią marżą poniżej {APPROVAL_RULES.minOfferMarginPercent}% lub pozycją poniżej {APPROVAL_RULES.minItemMarginPercent}% czekają tutaj na decyzję zarządu.
          Handlowiec nie może ich wysłać do czasu akceptacji.
        </p>
        {!canDecide && (
          <div className="mt-3 bg-sky-50 border border-sky-200 text-sky-800 text-sm rounded-lg p-3">
            Masz tu tylko podgląd – decyzje podejmuje zarząd. Przełącz się na rolę Zarząd, aby zaakceptować lub odrzucić ofertę.
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      {loading ? (
        <div className="card animate-pulse h-40" />
      ) : pending.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">🎉</div>
          <div className="text-lg font-semibold text-gray-900">Brak ofert do akceptacji</div>
          <p className="text-gray-600 mt-1">Wszystkie oferty mają zaakceptowaną marżę.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((o) => (
            <div key={o.id} className="card">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/dashboard/offers/${o.id}`} className="text-lg font-semibold text-gray-900 hover:text-eltron-primary">
                      #{o.id} · {o.client_name}
                    </Link>
                    <ApprovalBadge status={o.approval_status} />
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {o.salesperson_name}{o.market_region ? ` (${o.market_region})` : ''} · {timeAgo(o.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div><div className="text-gray-500">Wartość</div><div className="font-semibold">{formatCurrency(o.total_gross)}</div></div>
                  <div><div className="text-gray-500">Zysk</div><div className="font-semibold">{formatCurrency(o.total_margin)}</div></div>
                  <div>
                    <div className="text-gray-500">Marża</div>
                    <span className={`px-2 py-0.5 rounded-full text-sm font-semibold ${marginBadge(o.margin_percent)}`}>{o.margin_percent.toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <button onClick={() => toggle(o.id)} className="text-sm text-eltron-primary mt-3 hover:underline">
                {expanded === o.id ? '▲ Ukryj pozycje' : '▼ Pokaż pozycje i marże'}
              </button>

              {expanded === o.id && (
                <div className="mt-3 overflow-x-auto">
                  {!detail[o.id] ? (
                    <div className="text-sm text-gray-500 py-4">Ładowanie...</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-gray-600">
                          <th className="py-2 pr-2">Produkt</th><th className="py-2 pr-2 text-right">Ilość</th>
                          <th className="py-2 pr-2 text-right">Koszt</th><th className="py-2 pr-2 text-right">Cena</th>
                          <th className="py-2 pr-2 text-right">Rabat</th><th className="py-2 text-right">Marża</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail[o.id].items.map((it) => (
                          <tr key={it.id} className="border-b border-gray-100">
                            <td className="py-2 pr-2">{it.product_name}</td>
                            <td className="py-2 pr-2 text-right whitespace-nowrap">{it.quantity} {it.unit}</td>
                            <td className="py-2 pr-2 text-right">{formatCurrency(it.cost_price)}</td>
                            <td className="py-2 pr-2 text-right">{formatCurrency(it.unit_price)}</td>
                            <td className="py-2 pr-2 text-right">{it.discount_percent ? `${it.discount_percent.toFixed(1)}%` : '-'}</td>
                            <td className="py-2 text-right">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${marginBadge(it.margin_percent)}`}>{it.margin_percent.toFixed(1)}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {canDecide && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col md:flex-row gap-3">
                  <input
                    value={notes[o.id] || ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [o.id]: e.target.value }))}
                    placeholder="Komentarz dla handlowca (opcjonalnie)"
                    className="input-field flex-1"
                  />
                  <button disabled={busy === o.id} onClick={() => decide(o.id, 'approve')} className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50">
                    ✅ Zaakceptuj marżę
                  </button>
                  <button disabled={busy === o.id} onClick={() => decide(o.id, 'reject')} className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50">
                    ❌ Odrzuć
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Ostatnio rozpatrzone</h2>
          <div className="divide-y divide-gray-100">
            {decided.map((o) => (
              <Link key={o.id} href={`/dashboard/offers/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50 px-2 -mx-2 rounded">
                <span className="truncate text-gray-900">#{o.id} · {o.client_name} <span className="text-gray-500 text-sm">({o.salesperson_name})</span></span>
                <span className="flex items-center gap-3 shrink-0 text-sm">
                  <span className="text-gray-500">{formatDate(o.created_at)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${marginBadge(o.margin_percent)}`}>{o.margin_percent.toFixed(1)}%</span>
                  <ApprovalBadge status={o.approval_status} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
