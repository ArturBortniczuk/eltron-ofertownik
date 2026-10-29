// Zespół i ustawienia demo (tylko zarząd)
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { canManageUsers } from '../../../lib/client-auth-utils';
import { formatCurrency, formatDateTime, ROLE_INFO, roleBadge } from '../../../lib/format';
import { ProgressBar } from '../../components/charts';

interface TeamUser {
  id: number;
  name: string;
  email: string;
  role: string;
  market_region: string | null;
  is_active: boolean;
  last_login: string | null;
  monthly_target: number;
  offers: number;
  month_value: number;
  pipeline: number;
}

const ROLES = ['handlowiec', 'zarząd', 'centrum elektryczne', 'budowy', 'inne'];
const REGIONS = ['', 'Podlaski', 'Pomorski', 'Lubelski', 'Śląski', 'Mazowiecki', 'Wielkopolski', 'Małopolski', 'Dolnośląski'];

export default function AdminPage() {
  const { data: session, status } = useSession();
  const allowed = canManageUsers(session);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/users');
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (allowed) load();
    else if (status !== 'loading') setLoading(false);
  }, [allowed, status, load]);

  const patch = async (id: number, change: Record<string, unknown>) => {
    setError('');
    setMessage('');
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...change }),
    });
    if (res.ok) {
      setMessage('Zapisano zmiany');
      load();
    } else {
      setError((await res.json()).error || 'Nie udało się zapisać');
    }
  };

  const reset = async () => {
    if (!confirm('Na pewno? To USUNIE wszystkie dane (oferty, klientów, produkty, użytkowników) i wgra dane demo od nowa.')) return;
    setResetting(true);
    setError('');
    try {
      const res = await fetch('/api/demo/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }) });
      if (res.ok) window.location.href = '/dashboard';
      else setError((await res.json()).error || 'Reset nie powiódł się');
    } finally {
      setResetting(false);
    }
  };

  if (status === 'loading') return null;
  if (!allowed) {
    return (
      <div className="card text-center py-10">
        <div className="text-red-600 text-lg mb-2">Brak uprawnień</div>
        <p className="text-gray-600">Panel zespołu jest dostępny tylko dla zarządu. Przełącz rolę w prawym górnym rogu.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Zespół</h1>
        <p className="text-gray-600 mt-1">Role, regiony i cele miesięczne. Zmiany zapisują się od razu.</p>
      </div>

      {message && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="animate-pulse h-40" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="py-2 pr-3">Użytkownik</th><th className="py-2 pr-3">Rola</th><th className="py-2 pr-3">Region</th>
                <th className="py-2 pr-3">Cel miesięczny (netto)</th><th className="py-2 pr-3 w-48">Realizacja</th>
                <th className="py-2 pr-3 text-right">Oferty</th><th className="py-2 pr-3">Aktywny</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`border-b border-gray-100 ${u.is_active ? '' : 'opacity-50'}`}>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-gray-900">{u.name}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                    {u.last_login && <div className="text-xs text-gray-400">ost. logowanie: {formatDateTime(u.last_login)}</div>}
                  </td>
                  <td className="py-3 pr-3">
                    <select defaultValue={u.role} onChange={(e) => patch(u.id, { role: e.target.value })} className="input-field !py-1 !w-auto">
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_INFO[r]?.title || r}</option>)}
                    </select>
                    <div className="mt-1"><span className={`px-2 py-0.5 text-xs rounded-full ${roleBadge(u.role)}`}>{ROLE_INFO[u.role]?.title || u.role}</span></div>
                  </td>
                  <td className="py-3 pr-3">
                    <select defaultValue={u.market_region || ''} onChange={(e) => patch(u.id, { market_region: e.target.value })} className="input-field !py-1 !w-auto">
                      {REGIONS.map((r) => <option key={r} value={r}>{r || '—'}</option>)}
                    </select>
                  </td>
                  <td className="py-3 pr-3">
                    <input
                      type="number" min={0} step={1000} defaultValue={u.monthly_target}
                      onBlur={(e) => { const v = parseFloat(e.target.value) || 0; if (v !== u.monthly_target) patch(u.id, { monthly_target: v }); }}
                      className="input-field !py-1 !w-32"
                    />
                  </td>
                  <td className="py-3 pr-3">
                    {u.monthly_target > 0 ? (
                      <ProgressBar value={u.month_value} max={u.monthly_target} sub={`${formatCurrency(u.month_value)}`} />
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-3 pr-3 text-right">{u.offers}</td>
                  <td className="py-3 pr-3">
                    <input type="checkbox" defaultChecked={u.is_active} onChange={(e) => patch(u.id, { is_active: e.target.checked })} className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card border-red-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Dane demo</h2>
        <p className="text-sm text-gray-600 mb-4">
          Po serii testów możesz przywrócić dane wyjściowe: 7 użytkowników, ok. 40 klientów, 46 produktów i 140 ofert.
          <strong className="text-red-700"> Operacja usuwa wszystkie obecne dane w bazie.</strong>
        </p>
        <button onClick={reset} disabled={resetting} className="btn-danger disabled:opacity-50">
          {resetting ? 'Resetuję... (ok. 10 s)' : 'Zresetuj dane demo'}
        </button>
      </div>
    </div>
  );
}
