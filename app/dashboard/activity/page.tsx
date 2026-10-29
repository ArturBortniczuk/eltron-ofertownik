// Aktywność zespołu - strumień zdarzeń na ofertach
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { canAccessAllData } from '../../../lib/client-auth-utils';
import { formatCurrency, timeAgo, formatDateTime } from '../../../lib/format';
import { StatusBadge } from '../../components/StatusBadge';

interface Item {
  id: number;
  type: string;
  message: string;
  actor_name?: string;
  created_at: string;
  offer_id: number;
  client_name: string;
  total_gross: number;
  status: string;
}

const TYPES: Array<{ key: string; label: string; icon: string }> = [
  { key: '', label: 'Wszystko', icon: '📰' },
  { key: 'status', label: 'Statusy', icon: '🔄' },
  { key: 'client_response', label: 'Odpowiedzi klientów', icon: '🤝' },
  { key: 'viewed', label: 'Otwarcia ofert', icon: '👀' },
  { key: 'approval', label: 'Akceptacje', icon: '🛡️' },
  { key: 'email', label: 'Wysyłki', icon: '✉️' },
  { key: 'comment', label: 'Komentarze', icon: '💬' },
  { key: 'created', label: 'Nowe oferty', icon: '🆕' },
];

export default function ActivityPage() {
  const { data: session } = useSession();
  const canViewAll = canAccessAllData(session);
  const [items, setItems] = useState<Item[]>([]);
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/activity?limit=80${type ? `&type=${type}` : ''}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [type]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const icon = (t: string) => TYPES.find((x) => x.key === t)?.icon || '•';

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Aktywność</h1>
        <p className="text-gray-600 mt-1">
          {canViewAll ? 'Co dzieje się na ofertach w całej firmie' : 'Co dzieje się na Twoich ofertach'} · odświeża się co 30 s.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${type === t.key ? 'bg-eltron-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className={`card !p-0 divide-y divide-gray-100 ${loading ? 'opacity-60' : ''}`}>
        {items.length === 0 && !loading && <div className="p-8 text-center text-gray-500">Brak zdarzeń.</div>}
        {items.map((a) => (
          <div key={a.id} className="flex gap-3 p-4 hover:bg-gray-50">
            <span className="text-xl leading-6">{icon(a.type)}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-gray-900 break-words">
                <strong>{a.actor_name || 'System'}</strong> · {a.message}
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                <Link href={`/dashboard/offers/${a.offer_id}`} className="text-eltron-primary hover:underline">#{a.offer_id} {a.client_name}</Link>
                <span>{formatCurrency(a.total_gross)}</span>
                <StatusBadge status={a.status} />
                <span title={formatDateTime(a.created_at)}>{timeAgo(a.created_at)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
