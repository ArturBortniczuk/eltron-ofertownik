// app/login/page.tsx - ekran wyboru roli (tryb demo) + opcjonalne logowanie hasłem
'use client';

import { useState, useEffect, useCallback } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import ClientOnly from '../components/ClientOnly';
import { ROLE_INFO, roleBadge } from '../../lib/format';

interface DemoUser {
  id: number;
  name: string;
  role: string;
  market_region?: string | null;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const [users, setUsers] = useState<DemoUser[]>([]);
  const [demo, setDemo] = useState(true);
  const [ready, setReady] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [dbError, setDbError] = useState('');
  const [settingUp, setSettingUp] = useState(false);
  const [signingIn, setSigningIn] = useState<number | null>(null);
  const [error, setError] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const message =
    searchParams?.get('message') === 'session_expired' ? 'Sesja wygasła. Wybierz użytkownika ponownie.' : '';

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/demo/users');
      const data = await res.json();
      setDemo(data.demo !== false);
      setReady(!!data.ready);
      setUsers(data.users || []);
      setDbError(data.error || '');
      if (data.demo === false) setShowPassword(true);
    } catch {
      setDbError('Nie udało się połączyć z serwerem');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const setupDemo = async () => {
    setSettingUp(true);
    setError('');
    try {
      const res = await fetch('/api/demo/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Nie udało się przygotować danych demo');
      await loadUsers();
    } catch {
      setError('Nie udało się przygotować danych demo');
    } finally {
      setSettingUp(false);
    }
  };

  const enterAs = async (user: DemoUser) => {
    setSigningIn(user.id);
    setError('');
    const result = await signIn('demo', { userId: String(user.id), redirect: false });
    if (result?.error) {
      setError('Nie udało się zalogować jako ten użytkownik');
      setSigningIn(null);
    } else {
      router.push('/dashboard');
    }
  };

  const passwordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await signIn('credentials', { email: email.toLowerCase(), password, redirect: false });
    if (result?.error) setError('Nieprawidłowy email lub hasło');
    else router.push('/dashboard');
  };

  const noUsers = !loadingUsers && demo && users.length === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-eltron-primary via-gray-100 to-eltron-light py-10 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <div className="mx-auto w-32 h-14 bg-eltron-primary rounded-lg flex items-center justify-center mb-4 shadow">
            <div className="text-white font-bold text-lg">ELTRON</div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Ofertownik – wersja demonstracyjna</h1>
          <p className="text-gray-700 mt-2">
            Wybierz, kim chcesz być. Bez hasła – rolę możesz zmienić w każdej chwili w prawym górnym rogu.
          </p>
        </div>

        {message && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-amber-800 text-sm text-center">{message}</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm text-center">{error}</div>
        )}

        {session?.user && (
          <div className="card mb-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-sm text-gray-700">
              Jesteś zalogowany jako <strong>{session.user.name}</strong>
            </div>
            <button className="btn-primary" onClick={() => router.push('/dashboard')}>
              Kontynuuj →
            </button>
          </div>
        )}

        {loadingUsers && (
          <div className="card text-center text-gray-600">Ładowanie użytkowników...</div>
        )}

        {dbError && !loadingUsers && (
          <div className="card text-center">
            <div className="text-red-600 font-medium mb-2">{dbError}</div>
            <p className="text-sm text-gray-600">
              Ustaw zmienną <code className="bg-gray-100 px-1 rounded">DATABASE_URL</code> w pliku{' '}
              <code className="bg-gray-100 px-1 rounded">.env.local</code> i uruchom ponownie aplikację.
            </p>
          </div>
        )}

        {noUsers && !dbError && (
          <div className="card text-center py-10">
            <div className="text-5xl mb-4">🧪</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {ready ? 'Baza jest pusta' : 'Baza nie jest jeszcze przygotowana'}
            </h2>
            <p className="text-gray-600 mb-6 max-w-xl mx-auto">
              Jednym kliknięciem utworzę tabele i wgram dane demo: 7 użytkowników, ok. 40 klientów, 45 produktów
              i 140 ofert z ostatnich 10 miesięcy (różne statusy, marże i oferty czekające na akceptację).
            </p>
            <button onClick={setupDemo} disabled={settingUp} className="btn-primary disabled:opacity-50">
              {settingUp ? 'Przygotowuję dane... (ok. 10 s)' : 'Przygotuj dane demo'}
            </button>
          </div>
        )}

        {users.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map((u) => {
              const info = ROLE_INFO[u.role] || ROLE_INFO.inne;
              return (
                <button
                  key={u.id}
                  onClick={() => enterAs(u)}
                  disabled={signingIn !== null}
                  className="card text-left hover:border-eltron-primary hover:shadow-md transition disabled:opacity-60"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-semibold text-gray-900 text-lg">{u.name}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${roleBadge(u.role)}`}>{info.title}</span>
                        {u.market_region && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">{u.market_region}</span>
                        )}
                      </div>
                    </div>
                    <div className="w-10 h-10 shrink-0 rounded-full bg-eltron-primary text-white flex items-center justify-center font-semibold">
                      {u.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{info.description}</p>
                  <ul className="text-xs text-gray-500 space-y-1">
                    {info.sees.map((s) => (
                      <li key={s}>• {s}</li>
                    ))}
                  </ul>
                  <div className="mt-3 text-eltron-primary text-sm font-medium">
                    {signingIn === u.id ? 'Wchodzę...' : 'Wejdź jako ten użytkownik →'}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-center">
          <button className="text-sm text-gray-600 hover:text-gray-900 underline" onClick={() => setShowPassword((v) => !v)}>
            {showPassword ? 'Ukryj logowanie hasłem' : 'Zaloguj się hasłem'}
          </button>
          {showPassword && (
            <form onSubmit={passwordLogin} className="card max-w-sm mx-auto mt-4 space-y-4 text-left">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" placeholder="Email" required />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" placeholder="Hasło" required />
              <button type="submit" className="w-full btn-primary">Zaloguj się</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <ClientOnly
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-lg">Ładowanie...</div>
        </div>
      }
    >
      <LoginForm />
    </ClientOnly>
  );
}
