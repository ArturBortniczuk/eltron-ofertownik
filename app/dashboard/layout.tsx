// app/dashboard/layout.tsx
'use client';

import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ClientOnly from '../components/ClientOnly';
import GlobalSearch from '../components/GlobalSearch';
import NotificationsBell, { NotificationData } from '../components/NotificationsBell';
import RoleSwitcher from '../components/RoleSwitcher';
import { canAccessAllData, canManageUsers } from '../../lib/client-auth-utils';
import { ROLE_INFO } from '../../lib/format';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<NotificationData | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?message=session_expired');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/notifications');
        if (res.ok && !cancelled) setNotifications(await res.json());
      } catch {
        /* powiadomienia są opcjonalne */
      }
    };
    load();
    const timer = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status, pathname]);

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">{status === 'loading' ? 'Ładowanie...' : 'Przekierowanie...'}</div>
      </div>
    );
  }

  const userRole = (session.user as any)?.role || 'inne';
  const canViewAll = canAccessAllData(session);
  const isManagement = canManageUsers(session);
  const roleInfo = ROLE_INFO[userRole] || ROLE_INFO.inne;

  const nav: Array<{ href: string; label: string; badge?: number }> = [
    { href: '/dashboard', label: 'Pulpit' },
    { href: '/dashboard/pipeline', label: 'Lejek ofert' },
    { href: '/dashboard/offers', label: canViewAll ? 'Wszystkie oferty' : 'Moje oferty' },
    { href: '/dashboard/clients', label: 'Klienci' },
    { href: '/dashboard/products', label: 'Produkty' },
    { href: '/dashboard/tasks', label: 'Zadania', badge: notifications?.counts.tasks },
    { href: '/dashboard/calendar', label: 'Kalendarz' },
    { href: '/dashboard/analytics', label: 'Analityka' },
    { href: '/dashboard/activity', label: 'Aktywność' },
  ];
  if (isManagement) nav.push({ href: '/dashboard/approvals', label: 'Akceptacje', badge: notifications?.counts.approvals });
  if (canViewAll) nav.push({ href: '/dashboard/margins', label: 'Marże' });
  if (isManagement) nav.push({ href: '/dashboard/admin', label: 'Zespół' });

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname === href || pathname?.startsWith(href + '/');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14">
            <Link href="/dashboard" className="flex items-center space-x-3">
              <div className="w-8 h-6 bg-eltron-primary rounded flex items-center justify-center">
                <div className="text-white font-bold text-xs">E</div>
              </div>
              <h1 className="text-lg font-semibold text-gray-900">Ofertownik Eltron</h1>
            </Link>

            <div className="flex items-center gap-1 sm:gap-2">
              <GlobalSearch />
              <Link href="/dashboard/offers/new" className="btn-primary text-sm hidden sm:block">
                + Nowa oferta
              </Link>
              <NotificationsBell data={notifications} />
              <RoleSwitcher />
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto pb-2 -mx-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`relative whitespace-nowrap px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isActive(item.href)
                    ? 'bg-eltron-primary text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-eltron-primary'
                }`}
              >
                {item.label}
                {!!item.badge && item.badge > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
            <Link href="/dashboard/offers/new" className="sm:hidden whitespace-nowrap px-3 py-1.5 rounded-md text-sm text-eltron-primary font-medium">
              + Nowa
            </Link>
          </nav>
        </div>
      </header>

      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
        <div className="max-w-7xl mx-auto text-amber-900 text-xs sm:text-sm">
          🎭 <strong>Tryb demo</strong> – jesteś jako <strong>{roleInfo.title}</strong>. {roleInfo.sees[0]}.
          Zmień rolę w prawym górnym rogu, aby zobaczyć różnice.
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
