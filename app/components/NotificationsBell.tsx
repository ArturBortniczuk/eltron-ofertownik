'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface NotificationData {
  items: Array<{ id: string; type: string; title: string; subtitle?: string; href: string }>;
  counts: { approvals: number; tasks: number; followUps: number; expiring: number; viewed: number; decisions: number };
  total: number;
}

const ICONS: Record<string, string> = {
  approval: '🛡️', task: '✅', followup: '📞', expiring: '⏳', viewed: '👀', decision: '📝',
};

export default function NotificationsBell({ data }: { data: NotificationData | null }) {
  const [open, setOpen] = useState(false);
  const total = data?.total ?? 0;

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-lg hover:bg-gray-100" title="Powiadomienia">
        <span className="text-lg">🔔</span>
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-40 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900">Powiadomienia</div>
            {!data || data.items.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">Wszystko załatwione 🎉</div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {data.items.map((n) => (
                  <Link key={n.id} href={n.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50">
                    <span className="text-lg">{ICONS[n.type] || '•'}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900 truncate">{n.title}</span>
                      {n.subtitle && <span className="block text-xs text-gray-500 truncate">{n.subtitle}</span>}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
