// Panel zarządczy: wszystkie zapytania z filtrami, ceny po bonusie dostawców, koszty, sprzedaż utracona, eksport do Process App
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { canAccessAllData } from '../../../lib/client-auth-utils';
import { formatCurrency, formatCurrencyShort, formatDate, marginBadge } from '../../../lib/format';
import { OFFER_TYPES, OUTCOMES } from '../../../lib/offer-rules';
import { HBars } from '../../components/charts';
import { StatusBadge } from '../../components/StatusBadge';

interface Row {
  id: number; number: string; project_name?: string; segment?: string; offer_type: string; status: string; outcome?: string | null;
  won_amount: number | null; lost_reason?: string; competitor?: string; client_name: string; salesperson: string; market?: string;
  created_at: string; total_net: number; cost: number; cost_after_bonus: number; margin_after_bonus: number;
  margin_percent_after_bonus: number; below_min: number; ekonom_order_no?: string | null;
}
interface Group { label: string; value: number; count: number }
interface Payload {
  rows: Row[];
  summary: Record<string, number>;
  lostAnalysis: { byReason: Group[]; bySegment: Group[]; byManufacturer: Group[]; bySalesperson: Group[]; byCompetitor: Group[] };
  filters: { segments: string[]; markets: string[]; salespeople: Array<{ id: number; name: string }>; manufacturers: string[] };
}

const EMPTY = { q: '', segment: '', manufacturer: '', product: '', user_id: '', market: '', client: '', type: '', outcome: '', from: '', to: '' };

export default function ManagementPage() {
  const { data: session } = useSession();
  const allowed = canAccessAllData(session);
  const [f, setF] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const [limit, setLimit] = useState(40);

  const qs = useCallback((extra = '') => {
    const p = new URLSearchParams();
    Object.entries(applied).forEach(([k, v]) => { if (v) p.set(k, v); });
    return `${p.toString()}${extra}`;
  }, [applied]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/management/offers?${qs()}`);
      if (res.ok) setData(await res.json());
      else setError((await res.json()).error || 'Nie udało się pobrać danych');
    } catch {
      setError('Nie udało się pobrać danych');
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  // filtry tekstowe stosujemy z lekkim opóźnieniem, listy rozwijane od razu
  useEffect(() => {
    const t = setTimeout(() => setApplied(f), 350);
    return () => clearTimeout(t);
  }, [f]);

  const sendToProcessApp = async () => {
    const res = await fetch('/api/management/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records: data?.rows.length || 0 }) });
    const d = await res.json();
    if (res.ok) setSent(`Wysłano ${d.records} rekordów do Process App (partia ${d.batch}) – symulacja, nic nie wyszło poza demo.`);
  };

  if (session && !allowed) {
    return <div className="card text-center py-12"><div className="text-4xl mb-3">🔒</div><h2 className="text-xl font-semibold">Panel zarządczy jest dostępny tylko dla wybranych osób</h2><p className="text-gray-600 mt-2">Przełącz rolę na Zarząd lub Centrum Elektryczne.</p></div>;
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((cur) => ({ ...cur, [k]: e.target.value }));
  const s = data?.summary;
  const tile = (title: string, value: string, sub?: string, tone = 'text-gray-900') => (
    <div className="card !p-4">
      <div className="text-xs text-gray-500">{title}</div>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
  const active = Object.values(applied).some(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Panel zarządczy</h1>
          <p className="text-gray-600 mt-1">Wszystkie zapytania i oferty, ceny po bonusie dostawców, koszty oraz sprzedaż utracona.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/management/offers?${qs('&format=csv')}`} className="btn-secondary text-sm">⬇ CSV (Excel)</a>
          <a href={`/api/management/offers?${qs('&format=json')}`} className="btn-secondary text-sm">⬇ JSON</a>
          <button onClick={sendToProcessApp} className="btn-primary text-sm">📤 Wyślij do Process App</button>
        </div>
      </div>
      {sent && <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg p-3">{sent}</div>}

      <div className="card space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <input value={f.q} onChange={set('q')} className="input-field col-span-2" placeholder="Temat / inwestycja / numer" />
          <select value={f.segment} onChange={set('segment')} className="input-field"><option value="">Segment: wszystkie</option>{data?.filters.segments.map((x) => <option key={x}>{x}</option>)}</select>
          <select value={f.manufacturer} onChange={set('manufacturer')} className="input-field"><option value="">Producent: wszyscy</option>{data?.filters.manufacturers.map((x) => <option key={x}>{x}</option>)}</select>
          <input value={f.product} onChange={set('product')} className="input-field" placeholder="Towar (np. YKY)" />
          <input value={f.client} onChange={set('client')} className="input-field" placeholder="Klient" />
          <select value={f.user_id} onChange={set('user_id')} className="input-field"><option value="">Handlowiec: wszyscy</option>{data?.filters.salespeople.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <select value={f.market} onChange={set('market')} className="input-field"><option value="">Rynek: wszystkie</option>{data?.filters.markets.map((x) => <option key={x}>{x}</option>)}</select>
          <select value={f.type} onChange={set('type')} className="input-field"><option value="">Zakup i przetarg</option>{Object.entries(OFFER_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select value={f.outcome} onChange={set('outcome')} className="input-field"><option value="">Wynik: dowolny</option>{Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <input type="date" value={f.from} onChange={set('from')} className="input-field" aria-label="Od daty" />
          <input type="date" value={f.to} onChange={set('to')} className="input-field" aria-label="Do daty" />
          {active && <button onClick={() => { setF(EMPTY); setApplied(EMPTY); }} className="btn-secondary text-sm">Wyczyść filtry</button>}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>}

      {s && (
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 ${loading ? 'opacity-60' : ''}`}>
          {tile('Oferty / zapytania', String(s.count), `wartość ${formatCurrencyShort(s.totalValue)} netto · ${s.tenders} przetargów · ${s.openCount} w toku`)}
          {tile('Wygrane', formatCurrencyShort(s.wonValue), `${s.wonCount} ofert · skuteczność ${s.winRate.toFixed(0)}%`, 'text-green-700')}
          {tile('Sprzedaż utracona', formatCurrencyShort(s.lostValue), `${s.lostCount} przegranych ofert`, 'text-red-600')}
          {tile('Marża po bonusie', formatCurrencyShort(s.marginAfterBonus), `koszt po bonusie ${formatCurrencyShort(s.costAfterBonus)} (bonus: −${formatCurrencyShort(s.bonusEffect)})`)}
        </div>
      )}
      {s && s.belowMin > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-800">🔴 {s.belowMin} ofert zawiera pozycje sprzedawane poniżej minimalnej ceny.</div>
      )}

      {data && (
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Analiza sprzedaży utraconej</h2>
          <p className="text-sm text-gray-500 mb-4">Wartość netto ofert przegranych oraz niezamówionej części ofert wygranych częściowo – dla bieżących filtrów.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {([
              ['Powody utraty', data.lostAnalysis.byReason],
              ['Segmenty', data.lostAnalysis.bySegment],
              ['Producenci (pozycje przegranych ofert)', data.lostAnalysis.byManufacturer],
              ['Handlowcy', data.lostAnalysis.bySalesperson],
              ['Konkurencja', data.lostAnalysis.byCompetitor],
            ] as Array<[string, Group[]]>).map(([title, groups]) => (
              <div key={title}>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">{title}</h3>
                <HBars items={groups.map((g) => ({ label: g.label, value: g.value, sub: `${g.count} ofert` }))} color="bg-red-400" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Zapytania i oferty ({data?.rows.length ?? 0})</h2>
        {loading && !data ? <div className="animate-pulse h-40 bg-gray-100 rounded" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-700">
                  <th className="py-2 px-2 font-medium">Nr</th>
                  <th className="py-2 px-2 font-medium">Temat / klient</th>
                  <th className="py-2 px-2 font-medium">Handlowiec / rynek</th>
                  <th className="py-2 px-2 font-medium text-right">Netto</th>
                  <th className="py-2 px-2 font-medium text-right">Koszt po bonusie</th>
                  <th className="py-2 px-2 font-medium text-right">Marża po bonusie</th>
                  <th className="py-2 px-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows || []).slice(0, limit).map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-2 whitespace-nowrap font-medium text-eltron-primary">
                      <Link href={`/dashboard/offers/${r.id}`}>{r.number}</Link>
                    </td>
                    <td className="py-2 px-2">
                      <div className="text-gray-900">{r.project_name || '—'} {r.offer_type === 'przetarg' && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${OFFER_TYPES.przetarg.badge}`}>przetarg</span>}</div>
                      <div className="text-xs text-gray-500">{r.client_name}{r.segment ? ` · ${r.segment}` : ''}</div>
                    </td>
                    <td className="py-2 px-2 text-gray-600">{r.salesperson}<div className="text-xs text-gray-400">{r.market}</div></td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">{formatCurrency(r.total_net)}{r.below_min > 0 && <div className="text-[11px] text-red-600">🔴 poniżej min. ceny</div>}</td>
                    <td className="py-2 px-2 text-right whitespace-nowrap text-gray-600">{formatCurrency(r.cost_after_bonus)}<div className="text-[11px] text-gray-400">przed bonusem {formatCurrency(r.cost)}</div></td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      {r.cost_after_bonus > 0 ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${marginBadge(r.margin_percent_after_bonus)}`}>{r.margin_percent_after_bonus.toFixed(1)}%</span> : '—'}
                      <div className="text-[11px] text-gray-400">{formatCurrency(r.margin_after_bonus)}</div>
                    </td>
                    <td className="py-2 px-2">
                      <StatusBadge status={r.status} outcome={r.outcome} />
                      {(r.lost_reason && r.outcome) && <div className="text-[11px] text-gray-500 mt-0.5 max-w-[160px]">{r.lost_reason}{r.competitor ? ` · ${r.competitor}` : ''}</div>}
                      <div className="text-[11px] text-gray-400">{formatDate(r.created_at)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data?.rows.length || 0) > limit && (
              <div className="text-center mt-4"><button onClick={() => setLimit((l) => l + 40)} className="btn-secondary text-sm">Pokaż więcej</button></div>
            )}
            {data && data.rows.length === 0 && <div className="text-center text-gray-500 py-8">Brak ofert dla wybranych filtrów.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
