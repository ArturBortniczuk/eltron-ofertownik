// Zadania i przypomnienia (follow-up)
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { canAccessAllData } from '../../../lib/client-auth-utils';
import { formatCurrency, formatDate, daysBetween } from '../../../lib/format';

interface Task {
  id: number;
  title: string;
  due_date: string | null;
  done: boolean;
  offer_id: number | null;
  client_id: number | null;
  client_name?: string;
  offer_client?: string;
  user_name?: string;
}
interface Suggestion {
  id: number;
  client_name: string;
  total_gross: number;
  sent_at: string;
  view_count: number;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function TasksPage() {
  const { data: session } = useSession();
  const canViewAll = canAccessAllData(session);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(todayStr());
  const [showAll, setShowAll] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks${showAll ? '?all=1' : ''}`);
    if (res.ok) {
      const data = await res.json();
      setTasks(data.tasks);
      setSuggestions(data.suggestions);
    }
    setLoading(false);
  }, [showAll]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (payload: { title: string; due_date?: string; offer_id?: number }) => {
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    await load();
  };

  const toggle = async (t: Task) => {
    setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await fetch(`/api/tasks/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: !t.done }) });
    load();
  };

  const remove = async (t: Task) => {
    setTasks((list) => list.filter((x) => x.id !== t.id));
    await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' });
  };

  const today = todayStr();
  const open = tasks.filter((t) => !t.done);
  const groups = [
    { key: 'overdue', label: 'Zaległe', tone: 'text-red-700', list: open.filter((t) => t.due_date && t.due_date.slice(0, 10) < today) },
    { key: 'today', label: 'Na dziś', tone: 'text-amber-700', list: open.filter((t) => t.due_date && t.due_date.slice(0, 10) === today) },
    { key: 'upcoming', label: 'Nadchodzące', tone: 'text-gray-900', list: open.filter((t) => t.due_date && t.due_date.slice(0, 10) > today) },
    { key: 'none', label: 'Bez terminu', tone: 'text-gray-600', list: open.filter((t) => !t.due_date) },
  ];
  const done = tasks.filter((t) => t.done);

  const row = (t: Task) => (
    <div key={t.id} className="flex items-start gap-3 py-2.5 group">
      <input type="checkbox" checked={t.done} onChange={() => toggle(t)} className="mt-1 h-4 w-4 cursor-pointer" />
      <div className="flex-1 min-w-0">
        <div className={t.done ? 'line-through text-gray-400' : 'text-gray-900'}>{t.title}</div>
        <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
          {t.due_date && <span>Termin: {formatDate(t.due_date)}</span>}
          {t.offer_id && <Link href={`/dashboard/offers/${t.offer_id}`} className="text-eltron-primary hover:underline">Oferta #{t.offer_id}{t.offer_client ? ` · ${t.offer_client}` : ''}</Link>}
          {t.client_id && !t.offer_id && <Link href={`/dashboard/clients/${t.client_id}`} className="text-eltron-primary hover:underline">{t.client_name || 'Klient'}</Link>}
          {showAll && t.user_name && <span>👤 {t.user_name}</span>}
        </div>
      </div>
      <button onClick={() => remove(t)} className="text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 text-sm" title="Usuń">✕</button>
    </div>
  );

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Zadania</h1>
          <p className="text-gray-600 mt-1">Przypomnienia o kontaktach z klientami i ofertach czekających na odpowiedź.</p>
        </div>
        {canViewAll && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Pokaż zadania całego zespołu
          </label>
        )}
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await add({ title: title.trim(), due_date: due || undefined });
          setTitle('');
        }}
        className="card flex flex-col sm:flex-row gap-3"
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-field flex-1" placeholder="Nowe zadanie, np. Zadzwonić w sprawie rabatu na kable" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input-field sm:!w-44" />
        <button type="submit" className="btn-primary">Dodaj</button>
      </form>

      {suggestions.length > 0 && (
        <div className="card border-amber-200 bg-amber-50">
          <h2 className="text-lg font-semibold text-amber-900 mb-1">💡 Warto zadzwonić</h2>
          <p className="text-sm text-amber-800 mb-3">Te oferty zostały wysłane ponad 5 dni temu i nikt nie ma do nich zadania.</p>
          <div className="divide-y divide-amber-200">
            {suggestions.map((s) => (
              <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2">
                <div>
                  <Link href={`/dashboard/offers/${s.id}`} className="font-medium text-gray-900 hover:text-eltron-primary">#{s.id} · {s.client_name}</Link>
                  <div className="text-xs text-gray-600">
                    {formatCurrency(s.total_gross)} · wysłana {daysBetween(s.sent_at)} dni temu · {s.view_count ? `klient otworzył ${s.view_count}x` : 'klient jeszcze nie otworzył'}
                  </div>
                </div>
                <button
                  onClick={() => add({ title: `Zadzwonić do ${s.client_name} w sprawie oferty`, due_date: todayStr(), offer_id: s.id })}
                  className="btn-secondary text-sm"
                >
                  + Dodaj zadanie na dziś
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="card animate-pulse h-40" />
      ) : open.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-4xl mb-2">✅</div>
          <div className="text-gray-900 font-semibold">Brak otwartych zadań</div>
        </div>
      ) : (
        groups.filter((g) => g.list.length > 0).map((g) => (
          <div key={g.key} className="card">
            <h2 className={`text-lg font-semibold mb-1 ${g.tone}`}>{g.label} <span className="text-sm font-normal text-gray-500">({g.list.length})</span></h2>
            <div className="divide-y divide-gray-100">{g.list.map(row)}</div>
          </div>
        ))
      )}

      {done.length > 0 && (
        <div>
          <button onClick={() => setShowDone((v) => !v)} className="text-sm text-gray-600 hover:underline">
            {showDone ? '▲ Ukryj zrobione' : `▼ Pokaż zrobione (${done.length})`}
          </button>
          {showDone && <div className="card mt-2 divide-y divide-gray-100">{done.map(row)}</div>}
        </div>
      )}
    </div>
  );
}
