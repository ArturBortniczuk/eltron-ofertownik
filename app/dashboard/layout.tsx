// app/dashboard/layout.tsx - NAPRAWIONA WERSJA BEZ IMPORTU lib/auth
'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import ClientOnly from '../components/ClientOnly';
import { 
  canAccessAllData, 
  canManageUsers, 
  getRoleDisplayName, 
  getRoleBadgeColor 
} from '../../lib/client-auth-utils';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?message=session_expired');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Ładowanie...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Przekierowanie...</div>
      </div>
    );
  }

  const userRole = (session.user as any)?.role || 'inne';
  const userMarketRegion = (session.user as any)?.marketRegion;
  const firstName = (session.user as any)?.firstName || session.user?.name?.split(' ')[0] || 'Użytkownik';

  // Określ dostępne funkcje na podstawie roli
  const canViewAllOffers = canAccessAllData(session);
  const canManageUsersPermission = canManageUsers(session);

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
                href="/dashboard/clients" 
                className="text-gray-600 hover:text-eltron-primary transition-colors"
              >
                Klienci
              </Link>
              <Link 
                href="/dashboard/offers" 
                className="text-gray-600 hover:text-eltron-primary transition-colors"
              >
                {canViewAllOffers ? 'Wszystkie oferty' : 'Moje oferty'}
              </Link>
              
              {/* Dodatkowe opcje dla zarządu */}
              {canManageUsersPermission && (
                <Link 
                  href="/dashboard/admin" 
                  className="text-gray-600 hover:text-eltron-primary transition-colors"
                >
                  Administracja
                </Link>
              )}
              
              <Link 
                href="/dashboard/offers/new" 
                className="btn-primary"
              >
                Nowa oferta
              </Link>
            </nav>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="flex items-center space-x-2">
                  <div className="text-sm">
                    <span className="font-medium">{firstName}</span>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(userRole)}`}>
                        {getRoleDisplayName(userRole)}
                      </span>
                      {userMarketRegion && (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                          {userMarketRegion}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
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
        <div className="flex space-x-4 overflow-x-auto">
          <Link 
            href="/dashboard" 
            className="text-gray-600 hover:text-eltron-primary text-sm transition-colors whitespace-nowrap"
          >
            Dashboard
          </Link>
          <Link 
            href="/dashboard/clients" 
            className="text-gray-600 hover:text-eltron-primary text-sm transition-colors whitespace-nowrap"
          >
            Klienci
          </Link>
          <Link 
            href="/dashboard/offers" 
            className="text-gray-600 hover:text-eltron-primary text-sm transition-colors whitespace-nowrap"
          >
            Oferty
          </Link>
          {canManageUsersPermission && (
            <Link 
              href="/dashboard/admin" 
              className="text-gray-600 hover:text-eltron-primary text-sm transition-colors whitespace-nowrap"
            >
              Admin
            </Link>
          )}
          <Link 
            href="/dashboard/offers/new" 
            className="text-eltron-primary font-medium text-sm whitespace-nowrap"
          >
            + Nowa
          </Link>
        </div>
      </nav>

      {/* Role info banner - tylko dla development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
          <div className="max-w-7xl mx-auto">
            <div className="text-yellow-800 text-sm">
              🔧 Dev: Zalogowany jako <strong>{userRole}</strong>
              {userMarketRegion && <span> - region <strong>{userMarketRegion}</strong></span>}
              {canViewAllOffers && <span> - dostęp do wszystkich danych</span>}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClientOnly 
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-lg">Ładowanie...</div>
        </div>
      }
    >
      <DashboardContent>{children}</DashboardContent>
    </ClientOnly>
  );
}
