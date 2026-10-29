// Kalendarz: zadania, kontakty z klientami i wygasające oferty
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { canAccessAllData } from '../../../lib/client-auth-utils';
import { formatCurrency } from '../../../lib/format';

interface CalEvent {
  type: 'task' | 'followup' | 'expiry';
  id: string;
  taskId?: number;
  title: string;
  date: string;
  done?: boolean;
  value?: number;
  href: string;
}

const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const TYPE_STYLE: Record<string, { chip: string; label: string; icon: string }> = {
  task: { chip: 'bg-blue-100 text-blue-800', label: 'Zadanie', icon: '✅' },
  followup: { chip: 'bg-amber-100 text-amber-800', label: 'Kontakt z klientem', icon: '📞' },
  expiry: { chip: 'bg-red-100 text-red-800', label: 'Wygasa oferta', icon: '⏳' },
};

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export default function CalendarPage() {
  const { data: session } = useSession();
  const canViewAll = canAccessAllData(session);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState(iso(now.getFullYear(), now.getMonth() + 1, now.getDate()));
  const [loading, setLoading] = useState(true);

  // Zarząd i Centrum Elektryczne nie mają własnych zadań - domyślnie pokazujemy cały zespół
  useEffect(() => {
    if (canViewAll) setAll(true);
  }, [canViewAll]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/calendar?month=${year}-${String(month).padStart(2, '0')}${all ? '&all=1' : ''}`);
    if (res.ok) setEvents((await res.json()).events);
    setLoading(false);
  }, [year, month, all]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    events.forEach((e) => {
      (map[e.date] = map[e.date] || []).push(e);
    });
    return map;
  }, [events]);

  const shift = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  // Siatka: poniedziałek jako pierwszy dzień tygodnia
  const first = new Date(year, month - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<number | null> = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayIso = iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const dayEvents = byDay[selected] || [];

  const toggleTask = async (e: CalEvent) => {
    if (!e.taskId) return;
    setEvents((list) => list.map((x) => (x.id === e.id ? { ...x, done: !x.done } : x)));
    await fetch(`/api/tasks/${e.taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: !e.done }) });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Kalendarz</h1>
          <p className="text-gray-600 mt-1">Zadania, terminy kontaktu z klientem i daty wygaśnięcia wysłanych ofert.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {canViewAll && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Cały zespół
            </label>
          )}
          <div className="flex items-center gap-1">
            <button onClick={() => shift(-1)} className="btn-secondary !px-3">←</button>
            <div className="w-44 text-center font-semibold text-gray-900 capitalize">{MONTHS[month - 1]} {year}</div>
            <button onClick={() => shift(1)} className="btn-secondary !px-3">→</button>
          </div>
          <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); setSelected(todayIso); }} className="btn-secondary">Dziś</button>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-gray-600 flex-wrap">
        {Object.entries(TYPE_STYLE).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1"><span className={`inline-block w-3 h-3 rounded-sm ${v.chip}`} />{v.label}</span>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`card lg:col-span-2 !p-3 ${loading ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500 mb-1">
            {DAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} className="bg-gray-50 min-h-[84px]" />;
              const key = iso(year, month, day);
              const list = byDay[key] || [];
              const isToday = key === todayIso;
              const isSel = key === selected;
              return (
                <button
                  key={i}
                  onClick={() => setSelected(key)}
                  className={`bg-white min-h-[84px] p-1.5 text-left align-top hover:bg-sky-50 transition ${isSel ? 'ring-2 ring-inset ring-eltron-primary' : ''}`}
                >
                  <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-eltron-primary text-white' : 'text-gray-700'}`}>{day}</div>
                  <div className="mt-1 space-y-0.5">
                    {list.slice(0, 2).map((e) => (
                      <div key={e.id} className={`truncate text-[10px] leading-4 px-1 rounded ${TYPE_STYLE[e.type].chip} ${e.done ? 'line-through opacity-60' : ''}`}>{e.title}</div>
                    ))}
                    {list.length > 2 && <div className="text-[10px] text-gray-500">+{list.length - 2} więcej</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            {new Date(selected + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h2>
          {dayEvents.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">Nic zaplanowanego na ten dzień.</div>
          ) : (
            <ul className="space-y-3">
              {dayEvents.map((e) => (
                <li key={e.id} className="flex gap-2 items-start">
                  {e.type === 'task' ? (
                    <input type="checkbox" checked={!!e.done} onChange={() => toggleTask(e)} className="mt-1 h-4 w-4" />
                  ) : (
                    <span>{TYPE_STYLE[e.type].icon}</span>
                  )}
                  <div className="min-w-0">
                    <Link href={e.href} className={`text-sm hover:text-eltron-primary ${e.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>{e.title}</Link>
                    <div className="text-xs text-gray-500">{TYPE_STYLE[e.type].label}{e.value ? ` · ${formatCurrency(e.value)}` : ''}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Link href="/dashboard/tasks" className="text-sm text-eltron-primary hover:underline">+ Dodaj zadanie</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
