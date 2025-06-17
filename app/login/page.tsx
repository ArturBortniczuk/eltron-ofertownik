// app/login/page.tsx - ZAKTUALIZOWANA WERSJA
'use client';

import { useState, useEffect } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ClientOnly from '../components/ClientOnly';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Sprawdź czy użytkownik jest już zalogowany
    getSession().then(session => {
      if (session) {
        router.push('/dashboard');
      }
    });

    // Sprawdź wiadomości z URL
    const urlMessage = searchParams?.get('message');
    if (urlMessage === 'registration_success') {
      setMessage('Konto zostało utworzone pomyślnie! Możesz się teraz zalogować.');
    } else if (urlMessage === 'session_expired') {
      setMessage('Sesja wygasła. Zaloguj się ponownie.');
    }
  }, [router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email: email.toLowerCase(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Nieprawidłowy email lub hasło');
      } else if (result?.ok) {
        // Sprawdź rolę użytkownika i przekieruj
        const session = await getSession();
        console.log('Login successful, user role:', session?.user?.role);
        router.push('/dashboard');
      }
    } catch (err) {
      setError('Wystąpił błąd podczas logowania');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-eltron-primary via-gray-100 to-eltron-light">
      <div className="max-w-md w-full mx-4">
        <div className="card">
          <div className="text-center mb-8">
            <div className="mx-auto w-32 h-16 bg-eltron-primary rounded-lg flex items-center justify-center mb-4">
              <div className="text-white font-bold text-lg">ELTRON</div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Ofertownik</h1>
            <p className="text-gray-600 mt-2">Zaloguj się do systemu</p>
          </div>

          {message && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="text-green-600 text-sm">{message}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="twoj@grupaeltron.pl"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Hasło
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <div className="error-text">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logowanie...' : 'Zaloguj się'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Nie masz konta?{' '}
              <Link href="/register" className="text-eltron-primary hover:underline font-medium">
                Zarejestruj się
              </Link>
            </p>
          </div>

          <div className="mt-8 text-center text-sm text-gray-500">
            <p><strong>Konto administratora:</strong></p>
            <p className="mt-2">
              <strong>admin@eltron.pl</strong> / hasło: <strong>[ZMIEŃ_TO_HASŁO]</strong>
            </p>
            <p className="mt-4 text-xs">
              💡 Zmień hasło administratora na trudniejsze w bazie danych
            </p>
          </div>
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
