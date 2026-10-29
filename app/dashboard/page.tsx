// app/dashboard/page.tsx - pulpit
'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import MarginDashboard from '../components/MarginDashboard';
import { ProgressBar } from '../components/charts';
import { StatusBadge, ApprovalBadge } from '../components/StatusBadge';
import { canAccessAllData, canManageUsers } from '../../lib/client-auth-utils';
import { formatCurrency, formatCurrencyShort, formatDate, marginBadge, ROLE_INFO } from '../../lib/format';

interface DashboardStats {
  totalOffers: number;
  draftOffers: number;
  sentOffers: number;
  acceptedOffers: number;
  rejectedOffers: number;
  monthlyTotal: number;
  pipelineValue: number;
  pendingApprovals: number;
  followUps: number;
  tasksDue: number;
  conversionRate: number;
  target: { monthly_target: number; achieved: number };
  recentOffers: Array<{
    id: number;
    client_name: string;
    total_gross: number;
    created_at: string;
    status: string;
    approval_status?: string;
    salesperson_name?: string;
    margin_percent?: number;
    total_margin?: number;
  }>;
  avgMargin?: number;
  totalProfit?: number;
  lowMarginOffers?: number;
  topProducts?: Array<{ name: string; avg_margin: number; total_profit: number; total_revenue: number }>;
  topSalespeople?: Array<{ name: string; market_region?: string; avg_margin: number; total_profit: number; offers_count: number }>;
}

function Stat({ icon, tone, value, label, sub, href }: { icon: string; tone: string; value: string; label: string; sub?: string; href?: string }) {
  const body = (
    <div className="card h-full hover:shadow-md transition">
      <div className="flex items-center">
        <div className={`p-2 rounded-lg ${tone}`}><div className="w-6 h-6 text-center">{icon}</div></div>
        <div className="ml-4 min-w-0">
          <p className="text-2xl font-bold text-gray-900 truncate">{value}</p>
          <p className="text-gray-600 text-sm">{label}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMarginAnalysis, setShowMarginAnalysis] = useState(false);

  const canViewAllData = canAccessAllData(session);
  const isManagement = canManageUsers(session);
  const role = (session?.user as any)?.role || 'inne';

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>)}
        </div>
      </div>
    );
  }

  const todo: Array<{ icon: string; text: string; href: string; tone: string }> = [];
  if (stats) {
    if (isManagement && stats.pendingApprovals > 0)
      todo.push({ icon: '🛡️', text: `${stats.pendingApprovals} ofert czeka na Twoją akceptację marży`, href: '/dashboard/approvals', tone: 'bg-amber-50 border-amber-200 text-amber-900' });
    if (stats.tasksDue > 0)
      todo.push({ icon: '✅', text: `${stats.tasksDue} zadań na dziś lub zaległych`, href: '/dashboard/tasks', tone: 'bg-red-50 border-red-200 text-red-900' });
    if (!canViewAllData && stats.followUps > 0)
      todo.push({ icon: '📞', text: `${stats.followUps} wysłanych ofert czeka na kontakt z klientem`, href: '/dashboard/pipeline', tone: 'bg-blue-50 border-blue-200 text-blue-900' });
    if (canViewAllData && (stats.lowMarginOffers || 0) > 0)
      todo.push({ icon: '⚠️', text: `${stats.lowMarginOffers} ofert w tym miesiącu ma marżę poniżej 10%`, href: '/dashboard/margins', tone: 'bg-red-50 border-red-200 text-red-900' });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Witaj, {session?.user?.name}!</h1>
        <p className="text-gray-600 mt-2">
          {ROLE_INFO[role]?.title}: {canViewAllData ? 'przegląd całej firmy i zespołu handlowego' : 'przegląd Twoich ofert i aktywności'}
        </p>
      </div>

      {todo.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {todo.map((t) => (
            <Link key={t.text} href={t.href} className={`flex items-center gap-3 border rounded-lg px-4 py-3 hover:shadow-sm transition ${t.tone}`}>
              <span className="text-xl">{t.icon}</span>
              <span className="font-medium">{t.text}</span>
              <span className="ml-auto">→</span>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon="📊" tone="bg-eltron-primary/10" value={String(stats?.totalOffers || 0)} label={canViewAllData ? 'Wszystkie oferty' : 'Twoje oferty'} sub={`${stats?.draftOffers || 0} szkiców`} href="/dashboard/offers" />
        <Stat icon="📤" tone="bg-blue-100" value={formatCurrencyShort(stats?.pipelineValue || 0)} label="W lejku (wysłane)" sub={`${stats?.sentOffers || 0} ofert czeka na decyzję`} href="/dashboard/pipeline" />
        <Stat icon="💰" tone="bg-green-100" value={formatCurrencyShort(stats?.monthlyTotal || 0)} label="Wysłane w tym miesiącu" sub="wartość brutto" />
        <Stat icon="🎯" tone="bg-purple-100" value={`${(stats?.conversionRate || 0).toFixed(1)}%`} label="Skuteczność" sub={`${stats?.acceptedOffers || 0} wygranych, ${stats?.rejectedOffers || 0} przegranych`} href="/dashboard/analytics" />
      </div>

      {stats && stats.target.monthly_target > 0 && (
        <div className="card">
          <div className="flex justify-between items-baseline mb-3">
            <h2 className="text-lg font-semibold text-gray-900">{canViewAllData ? 'Cel firmy w tym miesiącu' : 'Twój cel w tym miesiącu'}</h2>
            <Link href="/dashboard/analytics" className="text-sm text-eltron-primary hover:underline">Szczegóły →</Link>
          </div>
          <ProgressBar
            value={stats.target.achieved}
            max={stats.target.monthly_target}
            sub={`Zaakceptowane: ${formatCurrency(stats.target.achieved)} z ${formatCurrency(stats.target.monthly_target)} (netto)`}
          />
        </div>
      )}

      {canViewAllData && stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat icon="📈" tone="bg-purple-100" value={`${(stats.avgMargin || 0).toFixed(1)}%`} label="Średnia marża" sub="oferty wysłane w tym miesiącu" />
          <Stat icon="💵" tone="bg-green-100" value={formatCurrencyShort(stats.totalProfit || 0)} label="Zysk w tym miesiącu" sub="z ofert niebędących szkicami" />
          <Stat icon="⚠️" tone="bg-red-100" value={String(stats.lowMarginOffers || 0)} label="Niskie marże" sub="oferty poniżej 10%" href="/dashboard/margins" />
        </div>
      )}

      {canViewAllData && stats && ((stats.topSalespeople?.length || 0) > 0 || (stats.topProducts?.length || 0) > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Handlowcy – zysk w tym miesiącu</h2>
            <div className="divide-y divide-gray-100">
              {stats.topSalespeople?.map((p) => (
                <div key={p.name} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <div className="font-medium text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.market_region || '—'} · {p.offers_count} ofert</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-green-700">{formatCurrency(p.total_profit)}</div>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${marginBadge(p.avg_margin)}`}>{p.avg_margin.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Produkty – zysk w tym miesiącu</h2>
            <div className="divide-y divide-gray-100">
              {stats.topProducts?.map((p) => (
                <div key={p.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{p.name}</div>
                    <div className="text-xs text-gray-500">obrót {formatCurrency(p.total_revenue)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-green-700">{formatCurrency(p.total_profit)}</div>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${marginBadge(p.avg_margin)}`}>{p.avg_margin.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {canViewAllData && (
        <div className="card">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Analiza marż i rentowności</h2>
              <p className="text-gray-600 text-sm mt-1">Szczegółowy przegląd marż, rabatów i rentowności sprzedaży</p>
            </div>
            <button onClick={() => setShowMarginAnalysis(!showMarginAnalysis)} className="btn-secondary">
              {showMarginAnalysis ? 'Ukryj analizę' : 'Pokaż analizę'}
            </button>
          </div>
          {showMarginAnalysis && (
            <div className="mt-6 border-t border-gray-200 pt-6">
              <MarginDashboard />
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Szybkie akcje</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { href: '/dashboard/offers/new', icon: '➕', title: 'Nowa oferta', sub: 'Wycena krok po kroku lub z szablonu' },
            { href: '/dashboard/clients/new', icon: '👥', title: 'Dodaj klienta', sub: 'Nowy klient do bazy' },
            { href: '/dashboard/pipeline', icon: '🗂️', title: 'Lejek ofert', sub: 'Przeciągaj oferty między statusami' },
            { href: '/dashboard/compare', icon: '⚖️', title: 'Porównaj oferty', sub: 'Dwie wersje obok siebie' },
          ].map((a) => (
            <Link key={a.href} href={a.href} className="p-4 border border-gray-200 rounded-lg hover:border-eltron-primary hover:bg-eltron-primary/5 transition-colors group text-center">
              <div className="text-2xl mb-2">{a.icon}</div>
              <h3 className="font-medium text-gray-900 group-hover:text-eltron-primary">{a.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{a.sub}</p>
            </Link>
          ))}
        </div>
      </div>

      {stats?.recentOffers && stats.recentOffers.length > 0 && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Ostatnie oferty</h2>
            <Link href="/dashboard/offers" className="text-eltron-primary hover:text-eltron-primary/80 text-sm font-medium">Zobacz wszystkie →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-700 text-sm">
                  <th className="py-3 px-4 font-medium">Klient</th>
                  {canViewAllData && <th className="py-3 px-4 font-medium">Handlowiec</th>}
                  <th className="py-3 px-4 font-medium">Wartość</th>
                  {canViewAllData && <><th className="py-3 px-4 font-medium">Marża</th><th className="py-3 px-4 font-medium">Zysk</th></>}
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Data</th>
                  <th className="py-3 px-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOffers.map((offer) => (
                  <tr key={offer.id} className="table-row">
                    <td className="py-3 px-4 font-medium text-gray-900">{offer.client_name}</td>
                    {canViewAllData && <td className="py-3 px-4 text-sm text-gray-600">{offer.salesperson_name || '-'}</td>}
                    <td className="py-3 px-4 font-medium">{formatCurrency(offer.total_gross)}</td>
                    {canViewAllData && (
                      <>
                        <td className="py-3 px-4">
                          {typeof offer.margin_percent === 'number'
                            ? <span className={`px-2 py-1 text-xs font-medium rounded-full ${marginBadge(offer.margin_percent)}`}>{offer.margin_percent.toFixed(1)}%</span>
                            : <span className="text-gray-400 text-sm">-</span>}
                        </td>
                        <td className="py-3 px-4 font-medium text-green-600">{typeof offer.total_margin === 'number' ? formatCurrency(offer.total_margin) : '-'}</td>
                      </>
                    )}
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1"><StatusBadge status={offer.status} /><ApprovalBadge status={offer.approval_status === 'pending' ? 'pending' : undefined} /></div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{formatDate(offer.created_at)}</td>
                    <td className="py-3 px-4">
                      <Link href={`/dashboard/offers/${offer.id}`} className="text-eltron-primary hover:text-eltron-primary/80 text-sm font-medium">Podgląd</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stats && stats.totalOffers === 0 && (
        <div className="card text-center py-12">
          <div className="text-4xl mb-4">🎯</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Zacznij od dodania klienta!</h3>
          <p className="text-gray-600 mb-6">Dodaj pierwszego klienta, a następnie utwórz dla niego ofertę.</p>
          <div className="flex justify-center space-x-4">
            <Link href="/dashboard/clients/new" className="btn-primary">Dodaj klienta</Link>
            <Link href="/dashboard/offers/new" className="btn-secondary">Utwórz ofertę</Link>
          </div>
        </div>
      )}
    </div>
  );
}
