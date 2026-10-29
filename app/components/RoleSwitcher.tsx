'use client';

import { useEffect, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { ROLE_INFO, roleBadge } from '../../lib/format';

interface DemoUser {
  id: number;
  name: string;
  role: string;
  market_region?: string | null;
}

export default function RoleSwitcher() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [switching, setSwitching] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/demo/users')
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => undefined);
  }, []);

  const role = (session?.user as any)?.role || 'inne';
  const region = (session?.user as any)?.marketRegion;
  const name = session?.user?.name || 'Użytkownik';

  const switchTo = async (u: DemoUser) => {
    setSwitching(u.id);
    const result = await signIn('demo', { userId: String(u.id), redirect: false });
    if (!result?.error) {
      // Pełne przeładowanie, żeby wyczyścić stan stron poprzedniego użytkownika
      window.location.href = '/dashboard';
    } else {
      setSwitching(null);
    }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-100 text-left">
        <span className="w-8 h-8 rounded-full bg-eltron-primary text-white flex items-center justify-center text-xs font-semibold">
          {name.split(' ').map((p: string) => p[0]).slice(0, 2).join('')}
        </span>
        <span className="hidden sm:block leading-tight">
          <span className="block text-sm font-medium text-gray-900">{name}</span>
          <span className="block text-xs text-gray-500">
            {ROLE_INFO[role]?.title || role}{region ? ` • ${region}` : ''}
          </span>
        </span>
        <span className="text-gray-400 text-xs">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-40 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="font-semibold text-gray-900">Przełącz użytkownika (demo)</div>
              <div className="text-xs text-gray-500">Zobacz aplikację oczami innej roli</div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {users.map((u) => {
                const current = String(u.id) === (session?.user as any)?.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => !current && switchTo(u)}
                    disabled={switching !== null}
                    className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-gray-50 ${current ? 'bg-gray-50' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900 truncate">{u.name}</span>
                      <span className="block text-xs text-gray-500">{u.market_region || ROLE_INFO[u.role]?.title || u.role}</span>
                    </span>
                    {current ? (
                      <span className="text-xs text-green-600 font-medium">aktywny</span>
                    ) : (
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${roleBadge(u.role)}`}>
                        {switching === u.id ? '...' : ROLE_INFO[u.role]?.title || u.role}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full px-4 py-3 text-left text-sm text-gray-600 hover:text-red-600 hover:bg-gray-50 border-t border-gray-100"
            >
              Wyloguj
            </button>
          </div>
        </>
      )}
    </div>
  );
}
