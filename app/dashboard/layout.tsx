'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Ładowanie...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-6 bg-eltron-primary rounded flex items-center justify-center">
                <div className="text-white font-bold text-xs">E</div>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">
                Ofertownik Eltron
              </h1>
            </div>
            
            <nav className="hidden md:flex items-center space-x-8">
              <Link 
                href="/dashboard" 
                className="text-gray-600 hover:text-eltron-primary transition-colors"
              >
                Dashboard
              </Link>
              <Link 
                href="/dashboard/offers" 
                className="text-gray-600 hover:text-eltron-primary transition-colors"
              >
                Moje oferty
              </Link>
              <Link 
                href="/dashboard/offers/new" 
                className="btn-primary"
              >
                Nowa oferta
              </Link>
            </nav>

            <div className="flex items-center space-x-4">
              <div className="text-sm">
                <span className="text-gray-600">Zalogowany jako:</span>
                <br />
                <span className="font-medium">{session.user?.name}</span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="text-gray-600 hover:text-red-600 text-sm transition-colors"
              >
                Wyloguj
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile navigation */}
      <nav className="md:hidden bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex space-x-4">
          <Link 
            href="/dashboard" 
            className="text-gray-600 hover:text-eltron-primary text-sm transition-colors"
          >
            Dashboard
          </Link>
          <Link 
            href="/dashboard/offers" 
            className="text-gray-600 hover:text-eltron-primary text-sm transition-colors"
          >
            Oferty
          </Link>
          <Link 
            href="/dashboard/offers/new" 
            className="text-eltron-primary font-medium text-sm"
          >
            + Nowa
          </Link>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}