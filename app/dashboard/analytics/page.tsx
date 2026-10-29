// Analityka sprzedaży
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { canAccessAllData } from '../../../lib/client-auth-utils';
import { formatCurrency, formatCurrencyShort, marginBadge } from '../../../lib/format';
import { BarChart, Donut, HBars, LineChart, ProgressBar } from '../../components/charts';

interface Analytics {
  scope: string;
  monthly: Array<{ month: string; label: string; offers: number; won: number; lost: number; value: number; won_value: number; avg_margin?: number | null }>;
  statuses: Record<string, { n: number; value: number }>;
  conversion: number;
  avgCycleDays: number;
  topClients: Array<{ id: number; name: string; offers: number; won: number; won_value: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number; offers: number }>;
  lostReasons: Array<{ reason: string; n: number }>;
  target: { monthly_target: number; achieved: number };
  pipeline: { value: number; openOffers: number; weighted: number };
  forecast: {
    winRate: number;
    cycleDays: number;
    baseline: number;
    beyond: number;
    months: Array<{ key: string; label: string; achieved: number; weighted: number; open: number }>;
  };
  team?: Array<{ id: number; name: string; region?: string; role: string; target: number; offers: number; won: number; lost: number; won_value: number; pipeline: number; month_value: number; avg_margin: number }>;
  regions?: Array<{ region: string; offers: number; won: number; won_value: number }>;
}

const KPI = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="card">
    <div className="text-sm text-gray-600">{label}</div>
    <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>
);

export default function AnalyticsPage() {
  const { data: session } = useSession();
  const canViewAll = canAccessAllData(session);
  const [data, setData] = useState<Analytics | null>(null);
  const [months, setMonths] = useState(12);
  const [userId, setUserId] = useState('');
  const [people, setPeople] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics?months=${months}${userId ? `&user_id=${userId}` : ''}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || 'Błąd');
        const d: Analytics = await res.json();
        setData(d);
        if (d.team && !userId) setPeople(d.team.map((t) => ({ id: t.id, name: t.name })));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [months, userId]);

  if (error) return <div className="card text-red-600">{error}</div>;
  if (loading && !data) return <div className="card animate-pulse h-64" />;
  if (!data) return null;

  const statusSlices = [
    { label: 'Szkice', value: data.statuses.draft?.n || 0, color: '#9ca3af' },
    { label: 'Wysłane', value: data.statuses.sent?.n || 0, color: '#3b82f6' },
    { label: 'Zaakceptowane', value: data.statuses.accepted?.n || 0, color: '#22c55e' },
    { label: 'Odrzucone', value: data.statuses.rejected?.n || 0, color: '#ef4444' },
  ];
  const totalOffers = statusSlices.reduce((s, x) => s + x.value, 0);
  const wonValue = data.monthly.reduce((s, m) => s + m.won_value, 0);
  const periodValue = data.monthly.reduce((s, m) => s + m.value, 0);

  return (
    <div className={`space-y-8 ${loading ? 'opacity-60' : ''}`}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analityka sprzedaży</h1>
          <p className="text-gray-600 mt-1">
            {data.scope === 'company' ? 'Cała firma' : canViewAll ? 'Wybrany handlowiec' : 'Twoje wyniki'} · ostatnie {months} mies. · kwoty netto
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {canViewAll && (
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="input-field !w-auto">
              <option value="">Cała firma</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <select value={months} onChange={(e) => setMonths(parseInt(e.target.value, 10))} className="input-field !w-auto">
            <option value={6}>6 miesięcy</option>
            <option value={12}>12 miesięcy</option>
            <option value={24}>24 miesiące</option>
          </select>
          <a href="/api/export/offers" className="btn-secondary">⬇ Eksport ofert (CSV)</a>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPI label="Wartość ofert" value={formatCurrencyShort(periodValue)} sub={`${totalOffers} ofert`} />
        <KPI label="Wygrana sprzedaż" value={formatCurrencyShort(wonValue)} sub={`${data.statuses.accepted?.n || 0} ofert`} />
        <KPI label="Skuteczność" value={`${data.conversion.toFixed(1)}%`} sub="wygrane / zamknięte" />
        <KPI label="Średni czas decyzji" value={`${data.avgCycleDays.toFixed(1)} dni`} sub="od wysłania do akceptacji" />
        <KPI label="Otwarty lejek" value={formatCurrencyShort(data.pipeline.value)} sub={`ważony: ${formatCurrencyShort(data.pipeline.weighted)} · ${data.pipeline.openOffers} ofert`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Sprzedaż miesięczna</h2>
          <BarChart data={data.monthly.map((m) => ({ label: m.label, value: m.value, highlight: m.won_value }))} />
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Cel w tym miesiącu</h2>
          {data.target.monthly_target > 0 ? (
            <>
              <ProgressBar
                value={data.target.achieved}
                max={data.target.monthly_target}
                label="Zaakceptowane oferty (netto)"
                sub={`${formatCurrency(data.target.achieved)} z ${formatCurrency(data.target.monthly_target)}`}
              />
              <p className="text-xs text-gray-500 mt-3">
                Do celu brakuje {formatCurrency(Math.max(0, data.target.monthly_target - data.target.achieved))}. W otwartym lejku jest {formatCurrency(data.pipeline.value)}.
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">Brak ustawionego celu miesięcznego.</p>
          )}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Statusy ofert</h3>
            <Donut slices={statusSlices} size={140} centerValue={String(totalOffers)} centerLabel="ofert" />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1 mb-2">
          <h2 className="text-lg font-semibold text-gray-900">Prognoza sprzedaży na 3 miesiące</h2>
          <span className="text-xs text-gray-500">
            Otwarte oferty × skuteczność {data.forecast.winRate.toFixed(0)}%, decyzja po ok. {data.forecast.cycleDays} dniach od wysłania
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <div className="lg:col-span-2">
            <BarChart
              height={180}
              data={data.forecast.months.map((m) => ({ label: m.label, value: m.achieved + m.weighted, highlight: m.achieved }))}
              valueLabel="Prognoza (z lejka)"
              highlightLabel="Już zaakceptowane"
            />
          </div>
          <div className="space-y-3 text-sm">
            {data.forecast.months.map((m, i) => (
              <div key={m.key} className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-600">{i === 0 ? 'Ten miesiąc' : `+${i} mies.`} ({m.label})</span>
                <span className="font-semibold text-gray-900">{formatCurrencyShort(m.achieved + m.weighted)}</span>
              </div>
            ))}
            <div className="text-xs text-gray-500">
              Dla porównania: średnia z ostatnich 3 pełnych miesięcy to {formatCurrencyShort(data.forecast.baseline)}.
              {data.forecast.beyond > 0 && <> Dalszy lejek: {formatCurrencyShort(data.forecast.beyond)}.</>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Najlepsi klienci (wygrane)</h2>
          <HBars items={data.topClients.filter((c) => c.won_value > 0).map((c) => ({ label: c.name, value: c.won_value, sub: `${c.won} z ${c.offers} ofert wygranych` }))} />
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Najlepiej sprzedające się produkty</h2>
          <HBars items={data.topProducts.map((p) => ({ label: p.name, value: p.revenue, sub: `${p.offers} ofert · ${Math.round(p.quantity)} szt./m` }))} color="bg-emerald-600" />
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Dlaczego tracimy oferty</h2>
          <HBars items={data.lostReasons.map((r) => ({ label: r.reason, value: r.n }))} format={(n) => `${n}`} color="bg-red-500" />
        </div>
      </div>

      {canViewAll && data.monthly.some((m) => m.avg_margin != null) && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Średnia marża (narzut na koszt) w czasie</h2>
          <LineChart points={data.monthly.map((m) => ({ label: m.label, value: m.avg_margin ?? null }))} />
        </div>
      )}

      {canViewAll && data.team && (
        <div className="card overflow-x-auto">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Ranking zespołu</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="py-2 pr-3">Handlowiec</th><th className="py-2 pr-3">Region</th>
                <th className="py-2 pr-3 text-right">Oferty</th><th className="py-2 pr-3 text-right">Skuteczność</th>
                <th className="py-2 pr-3 text-right">Wygrana sprzedaż</th><th className="py-2 pr-3 text-right">Lejek</th>
                <th className="py-2 pr-3 text-right">Marża</th><th className="py-2 w-48">Cel miesięczny</th>
              </tr>
            </thead>
            <tbody>
              {data.team.map((t, i) => {
                const closed = t.won + t.lost;
                return (
                  <tr key={t.id} className="border-b border-gray-100">
                    <td className="py-2.5 pr-3 font-medium text-gray-900">{i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}{t.name}</td>
                    <td className="py-2.5 pr-3 text-gray-600">{t.region || '-'}</td>
                    <td className="py-2.5 pr-3 text-right">{t.offers}</td>
                    <td className="py-2.5 pr-3 text-right">{closed ? `${((t.won / closed) * 100).toFixed(0)}%` : '-'}</td>
                    <td className="py-2.5 pr-3 text-right font-medium">{formatCurrency(t.won_value)}</td>
                    <td className="py-2.5 pr-3 text-right">{formatCurrency(t.pipeline)}</td>
                    <td className="py-2.5 pr-3 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${marginBadge(t.avg_margin)}`}>{t.avg_margin.toFixed(1)}%</span>
                    </td>
                    <td className="py-2.5">{t.target > 0 ? <ProgressBar value={t.month_value} max={t.target} sub={`${formatCurrencyShort(t.month_value)} / ${formatCurrencyShort(t.target)}`} /> : <span className="text-gray-400">-</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canViewAll && data.regions && data.regions.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Wygrana sprzedaż wg regionów</h2>
          <HBars items={data.regions.map((r) => ({ label: r.region, value: r.won_value, sub: `${r.won} z ${r.offers} ofert wygranych` }))} color="bg-indigo-600" />
        </div>
      )}

      <div className="text-sm text-gray-500">
        Szczegółowe marże na pozycjach znajdziesz w <Link href="/dashboard/margins" className="text-eltron-primary hover:underline">raporcie marż</Link>{' '}
        (zarząd i Centrum Elektryczne).
      </div>
    </div>
  );
}
