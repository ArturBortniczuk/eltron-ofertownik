'use client';

import { useSession } from 'next-auth/react';
import { canAccessAllData } from '../../../lib/auth';
import MarginDashboard from '../../components/MarginDashboard';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function MarginDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session || !canAccessAllData(session)) {
      router.push('/dashboard');
    }
  }, [session, status, router]);

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Ładowanie...</div>
      </div>
    );
  }

  if (!session || !canAccessAllData(session)) {
    return (
      <div className="card text-center py-8">
        <div className="text-red-600 text-lg mb-4">Brak uprawnień</div>
        <p className="text-gray-600">Ta sekcja jest dostępna tylko dla zarządu i centrum elektrycznego.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analiza marż i rentowności</h1>
        <p className="text-gray-600 mt-2">
          Przegląd marż, rabatów i rentowności sprzedaży
        </p>
      </div>

      <MarginDashboard />
    </div>
  );
}
