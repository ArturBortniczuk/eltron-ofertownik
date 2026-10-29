// Porównanie dwóch ofert (np. wersji dla tego samego klienta)
'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { formatCurrency, formatDate } from '../../../lib/format';
import { StatusBadge } from '../../components/StatusBadge';

interface OfferOption { id: number; client_name: string; total_gross: number; created_at: string; status: string }
interface Detail {
  offer: { id: number; client_name: string; total_net: number; total_gross: number; created_at: string; status: string; delivery_days: number; valid_days: number };
  items: Array<{ product_name: string; unit: string; quantity: number; unit_price: number; gross_amount: number }>;
}

function CompareContent() {
  const params = useSearchParams();
  const [options, setOptions] = useState<OfferOption[]>([]);
  const [a, setA] = useState(params?.get('a') || '');
  const [b, setB] = useState(params?.get('b') || '');
  const [da, setDa] = useState<Detail | null>(null);
  const [db, setDb] = useState<Detail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/offers?limit=200&sort=created_desc').then((r) => r.json()).then((d) => setOptions(d.offers || [])).catch(() => undefined);
  }, []);

  const load = async (id: string, set: (d: Detail | null) => void) => {
    if (!id) return set(null);
    const res = await fetch(`/api/offers/${id}`);
    if (res.ok) { set(await res.json()); setError(''); } else { set(null); setError('Nie udało się wczytać oferty'); }
  };

  useEffect(() => { load(a, setDa); }, [a]);
  useEffect(() => { load(b, setDb); }, [b]);

  const rows = useMemo(() => {
    if (!da || !db) return [];
    const names = Array.from(new Set([...da.items.map((i) => i.product_name), ...db.items.map((i) => i.product_name)]));
    return names.map((name) => {
      const x = da.items.find((i) => i.product_name === name);
      const y = db.items.find((i) => i.product_name === name);
      return { name, x, y };
    });
  }, [da, db]);

  const diffClass = (x?: number, y?: number) => (x === undefined || y === undefined || x === y ? '' : y > x ? 'text-red-600' : 'text-green-600');
  const selectLabel = (o: OfferOption) => `#${o.id} · ${o.client_name} · ${formatCurrency(o.total_gross)} · ${formatDate(o.created_at)}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Porównanie ofert</h1>
        <p className="text-gray-600 mt-1">Wybierz dwie oferty – zobaczysz różnice w pozycjach, ilościach i cenach. Zielony = taniej w ofercie B, czerwony = drożej.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[['A', a, setA], ['B', b, setB]].map(([label, value, setter]) => (
          <div key={label as string} className="card">
            <label className="block text-sm font-medium text-gray-700 mb-2">Oferta {label as string}</label>
            <select value={value as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)} className="input-field">
              <option value="">— wybierz ofertę —</option>
              {options.map((o) => <option key={o.id} value={o.id}>{selectLabel(o)}</option>)}
            </select>
          </div>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      {da && db && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Wartość netto', x: da.offer.total_net, y: db.offer.total_net },
              { label: 'Wartość brutto', x: da.offer.total_gross, y: db.offer.total_gross },
            ].map((s) => (
              <div key={s.label} className="card">
                <div className="text-sm text-gray-600">{s.label}</div>
                <div className="flex justify-between mt-1 text-lg font-semibold"><span>{formatCurrency(s.x)}</span><span className={diffClass(s.x, s.y)}>{formatCurrency(s.y)}</span></div>
                <div className={`text-xs mt-1 ${diffClass(s.x, s.y)}`}>
                  {s.y === s.x ? 'bez zmian' : `${s.y > s.x ? '+' : ''}${formatCurrency(s.y - s.x)} (${(((s.y - s.x) / (s.x || 1)) * 100).toFixed(1)}%)`}
                </div>
              </div>
            ))}
            <div className="card text-sm space-y-1">
              {[da, db].map((d, i) => (
                <div key={i} className="flex justify-between items-center">
                  <Link href={`/dashboard/offers/${d.offer.id}`} className="text-eltron-primary hover:underline">#{d.offer.id}</Link>
                  <span className="text-gray-600">dostawa {d.offer.delivery_days} dni, ważna {d.offer.valid_days} dni</span>
                  <StatusBadge status={d.offer.status} />
                </div>
              ))}
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-2 pr-3">Produkt</th>
                  <th className="py-2 pr-3 text-right">Ilość A</th><th className="py-2 pr-3 text-right">Cena A</th>
                  <th className="py-2 pr-3 text-right">Ilość B</th><th className="py-2 pr-3 text-right">Cena B</th>
                  <th className="py-2 text-right">Zmiana ceny</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const only = !r.x ? 'bg-green-50' : !r.y ? 'bg-red-50' : '';
                  const delta = r.x && r.y ? ((r.y.unit_price - r.x.unit_price) / (r.x.unit_price || 1)) * 100 : null;
                  return (
                    <tr key={r.name} className={`border-b border-gray-100 ${only}`}>
                      <td className="py-2 pr-3 font-medium text-gray-900">
                        {r.name}
                        {!r.x && <span className="ml-2 text-xs text-green-700">tylko w B</span>}
                        {!r.y && <span className="ml-2 text-xs text-red-700">tylko w A</span>}
                      </td>
                      <td className="py-2 pr-3 text-right">{r.x ? `${r.x.quantity} ${r.x.unit}` : '—'}</td>
                      <td className="py-2 pr-3 text-right">{r.x ? formatCurrency(r.x.unit_price) : '—'}</td>
                      <td className={`py-2 pr-3 text-right ${diffClass(r.x?.quantity, r.y?.quantity)}`}>{r.y ? `${r.y.quantity} ${r.y.unit}` : '—'}</td>
                      <td className={`py-2 pr-3 text-right ${diffClass(r.x?.unit_price, r.y?.unit_price)}`}>{r.y ? formatCurrency(r.y.unit_price) : '—'}</td>
                      <td className={`py-2 text-right ${delta ? (delta > 0 ? 'text-red-600' : 'text-green-600') : 'text-gray-400'}`}>{delta === null || delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="card animate-pulse h-40" />}>
      <CompareContent />
    </Suspense>
  );
}
