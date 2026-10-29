'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '../../lib/format';
import { StatusBadge } from './StatusBadge';

interface Results {
  offers: Array<{ id: number; client_name: string; status: string; total_gross: number }>;
  clients: Array<{ id: number; name: string; contact_person?: string; email?: string }>;
  products: Array<{ id: number; name: string; unit: string; sku?: string; category?: string }>;
}

const EMPTY: Results = { offers: [], clients: [], products: [] };

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults(EMPTY);
    }
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) setResults(await res.json());
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const total = results.offers.length + results.clients.length + results.products.length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        title="Szukaj (Ctrl+K)"
      >
        <span>🔍</span>
        <span className="hidden lg:inline">Szukaj...</span>
        <kbd className="hidden lg:inline text-xs bg-white border border-gray-300 rounded px-1">Ctrl K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-24 px-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const first =
                    results.offers[0] ? `/dashboard/offers/${results.offers[0].id}` :
                    results.clients[0] ? `/dashboard/clients/${results.clients[0].id}` :
                    results.products[0] ? `/dashboard/products?q=${encodeURIComponent(results.products[0].name)}` : null;
                  if (first) go(first);
                }
              }}
              placeholder="Szukaj ofert, klientów, produktów... (numer oferty, nazwa, NIP, SKU)"
              className="w-full px-5 py-4 text-base border-b border-gray-200 focus:outline-none"
            />
            <div className="max-h-96 overflow-y-auto">
              {query.trim().length < 2 && (
                <div className="p-5 text-sm text-gray-500">Wpisz co najmniej 2 znaki. Enter otwiera pierwszy wynik, Esc zamyka.</div>
              )}
              {query.trim().length >= 2 && !loading && total === 0 && (
                <div className="p-5 text-sm text-gray-500">Brak wyników dla „{query}”.</div>
              )}

              {results.offers.length > 0 && (
                <div>
                  <div className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase">Oferty</div>
                  {results.offers.map((o) => (
                    <button key={o.id} onClick={() => go(`/dashboard/offers/${o.id}`)} className="w-full text-left px-5 py-2 hover:bg-gray-50 flex items-center justify-between gap-3">
                      <span className="truncate"><span className="text-eltron-primary font-medium">#{o.id}</span> {o.client_name}</span>
                      <span className="flex items-center gap-2 shrink-0 text-sm text-gray-600">
                        {formatCurrency(o.total_gross)} <StatusBadge status={o.status} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {results.clients.length > 0 && (
                <div>
                  <div className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase">Klienci</div>
                  {results.clients.map((c) => (
                    <button key={c.id} onClick={() => go(`/dashboard/clients/${c.id}`)} className="w-full text-left px-5 py-2 hover:bg-gray-50">
                      <div className="font-medium text-gray-900">{c.name}</div>
                      <div className="text-xs text-gray-500">{[c.contact_person, c.email].filter(Boolean).join(' • ')}</div>
                    </button>
                  ))}
                </div>
              )}
              {results.products.length > 0 && (
                <div className="pb-2">
                  <div className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase">Produkty</div>
                  {results.products.map((p) => (
                    <button key={p.id} onClick={() => go(`/dashboard/products?q=${encodeURIComponent(p.name)}`)} className="w-full text-left px-5 py-2 hover:bg-gray-50">
                      <div className="font-medium text-gray-900">{p.name}</div>
                      <div className="text-xs text-gray-500">{[p.sku, p.category, p.unit].filter(Boolean).join(' • ')}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
