// Katalog produktów: wyszukiwanie, ceny, import/eksport CSV
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { formatCurrency } from '../../../lib/format';
import { canAccessAllData } from '../../../lib/client-auth-utils';
import { mapProductRows, parseCsv, ImportProductRow } from '../../../lib/csv';

interface Product {
  id: number;
  name: string;
  unit: string;
  sku?: string;
  category?: string;
  base_price?: number | null;
  cost_price?: number | null;
  margin_percent?: number | null;
  min_margin_percent?: number | null;
  max_discount_percent?: number | null;
  usage_count: number;
  last_sale?: number | null;
}

const TEMPLATE_CSV = 'Nazwa;Jednostka;SKU;Kategoria;Cena zakupu;Marża %\r\nPrzewód YDY 3x1,5 mm²;m;KB-YDY-3x15;Kable i przewody;2,10;32\r\nWyłącznik nadprądowy B16;szt;AP-B16-1P;Aparatura modułowa;9,80;36\r\n';

export default function ProductsPage() {
  const { data: session } = useSession();
  const canViewAll = canAccessAllData(session);
  const searchParams = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Array<{ category: string; n: number }>>([]);
  const [canSeeCosts, setCanSeeCosts] = useState(false);
  const [q, setQ] = useState(searchParams?.get('q') || '');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', unit: 'szt', sku: '', category: '', cost_price: '', margin_percent: '25' });
  const [formError, setFormError] = useState('');

  const [importRows, setImportRows] = useState<ImportProductRow[] | null>(null);
  const [importInfo, setImportInfo] = useState('');
  const [importResult, setImportResult] = useState('');
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '30' });
    if (q.trim()) params.set('q', q.trim());
    if (category) params.set('category', category);
    const res = await fetch(`/api/products?${params}`);
    if (res.ok) {
      const d = await res.json();
      setProducts(d.products);
      setCategories(d.categories);
      setCanSeeCosts(d.canSeeCosts);
      setTotalPages(d.totalPages);
      setTotal(d.total);
    }
    setLoading(false);
  }, [page, q, category]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const addProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) {
      setShowAdd(false);
      setForm({ name: '', unit: 'szt', sku: '', category: '', cost_price: '', margin_percent: '25' });
      load();
    } else {
      setFormError((await res.json()).error || 'Nie udało się dodać produktu');
    }
  };

  const onFile = async (file: File | undefined) => {
    setImportResult('');
    setImportRows(null);
    if (!file) return;
    const text = await file.text();
    const { rows, unknownHeaders, error } = mapProductRows(parseCsv(text));
    if (error) {
      setImportInfo(error);
      return;
    }
    setImportRows(rows);
    setImportInfo(
      `Wczytano ${rows.length} produktów.` + (unknownHeaders.length ? ` Pominięte kolumny: ${unknownHeaders.join(', ')}.` : '')
    );
  };

  const runImport = async () => {
    if (!importRows) return;
    setImporting(true);
    try {
      const res = await fetch('/api/products/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: importRows }) });
      const d = await res.json();
      if (res.ok) {
        setImportResult(`Import zakończony: dodano ${d.created}, zaktualizowano ${d.updated}.${d.errors?.length ? ` Błędy: ${d.errors.join('; ')}` : ''}`);
        setImportRows(null);
        load();
      } else {
        setImportResult(d.error || 'Import nie powiódł się');
      }
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob(['﻿' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wzor-importu-produktow.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Produkty</h1>
          <p className="text-gray-600 mt-1">
            {total} pozycji w katalogu.{' '}
            {canSeeCosts ? 'Widzisz ceny zakupu i marże.' : 'Handlowiec widzi cenę katalogową – koszty i marże zna tylko zarząd i Centrum Elektryczne.'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href="/api/export/products" className="btn-secondary">⬇ Eksport CSV</a>
          <button onClick={() => setShowAdd((v) => !v)} className="btn-primary">+ Nowy produkt</button>
          {canViewAll && (
            <Link href="/dashboard/products/pricing" className="btn-secondary">Edycja cen i marż</Link>
          )}
        </div>
      </div>

      {showAdd && (
        <form onSubmit={addProduct} className="card grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-700 mb-1">Nazwa *</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Jednostka</label>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="input-field">
              {['szt', 'm', 'kg', 'opak', 'kpl', 'godz', 'usł'].map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">SKU</label>
            <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Kategoria</label>
            <input list="cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-field" />
            <datalist id="cats">{categories.map((c) => <option key={c.category} value={c.category} />)}</datalist>
          </div>
          {canViewAll ? (
            <div className="flex gap-2">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Koszt</label>
                <input type="number" step="0.01" min="0" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Marża %</label>
                <input type="number" step="0.1" min="0" value={form.margin_percent} onChange={(e) => setForm({ ...form, margin_percent: e.target.value })} className="input-field" />
              </div>
            </div>
          ) : <div />}
          <div className="md:col-span-6 flex items-center gap-3">
            <button type="submit" className="btn-primary">Zapisz produkt</button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Anuluj</button>
            {formError && <span className="text-sm text-red-600">{formError}</span>}
          </div>
        </form>
      )}

      {canViewAll && (
        <div className="card">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">Import cennika z CSV / Excela</h2>
              <p className="text-sm text-gray-600">
                Kolumny: Nazwa, Jednostka, SKU, Kategoria, Cena zakupu, Marża %. Istniejące produkty (po SKU lub nazwie) zostaną zaktualizowane,
                a ceny zakupu zapiszą się dla wszystkich handlowców. W Excelu zapisz plik jako „CSV (rozdzielany średnikami)”.
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <button onClick={downloadTemplate} className="btn-secondary text-sm">Pobierz wzór</button>
              <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
            </div>
          </div>
          {importInfo && <div className="mt-3 text-sm text-gray-700">{importInfo}</div>}
          {importRows && importRows.length > 0 && (
            <div className="mt-3">
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr><th className="p-2">Nazwa</th><th className="p-2">J.m.</th><th className="p-2">SKU</th><th className="p-2">Kategoria</th><th className="p-2 text-right">Koszt</th><th className="p-2 text-right">Marża</th></tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="p-2">{r.name}</td><td className="p-2">{r.unit}</td><td className="p-2">{r.sku}</td><td className="p-2">{r.category}</td>
                        <td className="p-2 text-right">{r.cost_price ?? ''}</td><td className="p-2 text-right">{r.margin_percent ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importRows.length > 5 && <div className="text-xs text-gray-500 mt-1">... i {importRows.length - 5} kolejnych wierszy</div>}
              <button onClick={runImport} disabled={importing} className="btn-primary mt-3 disabled:opacity-50">
                {importing ? 'Importuję...' : `Importuj ${importRows.length} produktów`}
              </button>
            </div>
          )}
          {importResult && <div className="mt-3 text-sm font-medium text-green-700">{importResult}</div>}
        </div>
      )}

      <div className="card">
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="input-field flex-1" placeholder="Szukaj po nazwie lub SKU..." />
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="input-field md:!w-64">
            <option value="">Wszystkie kategorie</option>
            {categories.map((c) => <option key={c.category} value={c.category}>{c.category} ({c.n})</option>)}
          </select>
        </div>

        <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="py-2 pr-3">SKU</th><th className="py-2 pr-3">Nazwa</th><th className="py-2 pr-3">Kategoria</th><th className="py-2 pr-3">J.m.</th>
                <th className="py-2 pr-3 text-right">Cena katalogowa</th>
                {canSeeCosts && <><th className="py-2 pr-3 text-right">Koszt</th><th className="py-2 pr-3 text-right">Marża</th><th className="py-2 pr-3 text-right">Max rabat</th></>}
                <th className="py-2 pr-3 text-right">Użyć w ofertach</th><th className="py-2 text-right">Ostatnia sprzedaż</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">{p.sku || '-'}</td>
                  <td className="py-2 pr-3 font-medium text-gray-900">{p.name}</td>
                  <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{p.category || '-'}</td>
                  <td className="py-2 pr-3">{p.unit}</td>
                  <td className="py-2 pr-3 text-right font-medium">{p.base_price ? formatCurrency(p.base_price) : '-'}</td>
                  {canSeeCosts && (
                    <>
                      <td className="py-2 pr-3 text-right">{p.cost_price ? formatCurrency(p.cost_price) : '-'}</td>
                      <td className="py-2 pr-3 text-right">{p.margin_percent != null ? `${p.margin_percent.toFixed(1)}%` : '-'}</td>
                      <td className="py-2 pr-3 text-right">{p.max_discount_percent != null ? `${p.max_discount_percent}%` : '-'}</td>
                    </>
                  )}
                  <td className="py-2 pr-3 text-right">{p.usage_count}</td>
                  <td className="py-2 text-right">{p.last_sale ? formatCurrency(p.last_sale) : '-'}</td>
                </tr>
              ))}
              {!loading && products.length === 0 && (
                <tr><td colSpan={10} className="py-10 text-center text-gray-500">Brak produktów spełniających kryteria</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200 text-sm">
            <span className="text-gray-600">Strona {page} z {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50">← Poprzednia</button>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50">Następna →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
