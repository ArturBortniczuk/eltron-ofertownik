'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDate, formatDateTime } from '../../lib/format';

interface Interaction {
  id: number;
  type: 'call' | 'meeting' | 'email' | 'note';
  content: string;
  created_at: string;
  user_name?: string;
}
interface Discount {
  product_id: number;
  product_name: string;
  unit: string;
  discount_percent: number;
  valid_until: string | null;
  notes?: string;
}
interface ProductHit {
  id: number;
  name: string;
  unit: string;
}

const TYPE_META: Record<string, { icon: string; label: string }> = {
  call: { icon: '📞', label: 'Rozmowa' },
  meeting: { icon: '🤝', label: 'Spotkanie' },
  email: { icon: '✉️', label: 'E-mail' },
  note: { icon: '📝', label: 'Notatka' },
};

export default function ClientActivity({ clientId }: { clientId: number }) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [type, setType] = useState('call');
  const [content, setContent] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [error, setError] = useState('');

  const [productQuery, setProductQuery] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [picked, setPicked] = useState<ProductHit | null>(null);
  const [percent, setPercent] = useState('5');
  const [until, setUntil] = useState('');
  const [discountError, setDiscountError] = useState('');

  const load = useCallback(async () => {
    const [i, d] = await Promise.all([
      fetch(`/api/clients/${clientId}/interactions`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/clients/${clientId}/discounts`).then((r) => (r.ok ? r.json() : [])),
    ]);
    setInteractions(i);
    setDiscounts(d);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (picked || productQuery.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/products?q=${encodeURIComponent(productQuery.trim())}&limit=6`);
      if (res.ok) setHits((await res.json()).products);
    }, 250);
    return () => clearTimeout(t);
  }, [productQuery, picked]);

  const addInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await fetch(`/api/clients/${clientId}/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content, follow_up_date: followUp || undefined }),
    });
    if (res.ok) {
      setContent('');
      setFollowUp('');
      load();
    } else {
      setError((await res.json()).error || 'Nie udało się zapisać');
    }
  };

  const addDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDiscountError('');
    if (!picked) return setDiscountError('Wybierz produkt z listy');
    const res = await fetch(`/api/clients/${clientId}/discounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: picked.id, discount_percent: percent, valid_until: until || null }),
    });
    if (res.ok) {
      setPicked(null);
      setProductQuery('');
      setPercent('5');
      setUntil('');
      load();
    } else {
      setDiscountError((await res.json()).error || 'Nie udało się zapisać rabatu');
    }
  };

  const removeDiscount = async (productId: number) => {
    await fetch(`/api/clients/${clientId}/discounts?product_id=${productId}`, { method: 'DELETE' });
    load();
  };

  return (
    <>
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Aktywność i kontakty</h2>
        <form onSubmit={addInteraction} className="space-y-3 mb-6">
          <div className="flex flex-wrap gap-2">
            {Object.entries(TYPE_META).map(([key, meta]) => (
              <button
                key={key}
                type="button"
                onClick={() => setType(key)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${type === key ? 'bg-eltron-primary text-white border-eltron-primary' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                {meta.icon} {meta.label}
              </button>
            ))}
          </div>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} className="input-field" placeholder="Co ustalono z klientem?" required />
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <label className="text-sm text-gray-600 flex items-center gap-2">
              Przypomnij mi:
              <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="input-field !w-auto" />
            </label>
            <button type="submit" className="btn-primary sm:ml-auto">Zapisz kontakt</button>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </form>

        {interactions.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-4">Brak zapisanych kontaktów z tym klientem.</div>
        ) : (
          <ol className="space-y-4 border-l-2 border-gray-200 pl-5 ml-2">
            {interactions.map((i) => (
              <li key={i.id} className="relative">
                <span className="absolute -left-[31px] top-0 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-xs">{TYPE_META[i.type]?.icon}</span>
                <div className="text-sm text-gray-900">{i.content}</div>
                <div className="text-xs text-gray-500 mt-0.5">{TYPE_META[i.type]?.label} · {i.user_name} · {formatDateTime(i.created_at)}</div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Rabaty indywidualne</h2>
        <p className="text-sm text-gray-600 mb-4">Rabat jest automatycznie uwzględniany w cenie, gdy dodajesz ten produkt do oferty dla klienta.</p>

        {discounts.length > 0 && (
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-2 pr-3">Produkt</th><th className="py-2 pr-3 text-right">Rabat</th><th className="py-2 pr-3">Ważny do</th><th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {discounts.map((d) => (
                  <tr key={d.product_id} className="border-b border-gray-100">
                    <td className="py-2 pr-3">{d.product_name}</td>
                    <td className="py-2 pr-3 text-right font-medium">{d.discount_percent}%</td>
                    <td className="py-2 pr-3 text-gray-600">{d.valid_until ? formatDate(d.valid_until) : 'bezterminowo'}</td>
                    <td className="py-2 text-right"><button onClick={() => removeDiscount(d.product_id)} className="text-red-600 hover:text-red-800 text-xs">Usuń</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={addDiscount} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-2 relative">
            <label className="block text-xs text-gray-600 mb-1">Produkt</label>
            <input
              value={picked ? picked.name : productQuery}
              onChange={(e) => { setPicked(null); setProductQuery(e.target.value); }}
              className="input-field"
              placeholder="Zacznij pisać nazwę..."
            />
            {hits.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {hits.map((h) => (
                  <button type="button" key={h.id} onClick={() => { setPicked(h); setHits([]); }} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50">{h.name}</button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Rabat %</label>
            <input type="number" min="0" max="100" step="0.5" value={percent} onChange={(e) => setPercent(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Ważny do</label>
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="input-field" />
          </div>
          <button type="submit" className="btn-secondary">Dodaj rabat</button>
        </form>
        {discountError && <div className="text-sm text-red-600 mt-2">{discountError}</div>}
      </div>
    </>
  );
}
