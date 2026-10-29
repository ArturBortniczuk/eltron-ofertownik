'use client';

// Proste wykresy SVG/HTML bez zewnętrznych bibliotek

import { formatCurrencyShort } from '../../lib/format';

// ---------- słupki miesięczne (wartość całkowita + wygrane) ----------
export interface BarPoint {
  label: string;
  value: number;
  highlight?: number;
}

export function BarChart({
  data,
  height = 220,
  format = formatCurrencyShort,
  valueLabel = 'Wartość ofert',
  highlightLabel = 'Wygrane',
}: {
  data: BarPoint[];
  height?: number;
  format?: (n: number) => string;
  valueLabel?: string;
  highlightLabel?: string;
}) {
  const width = 640;
  const pad = { top: 16, right: 8, bottom: 26, left: 8 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.min(36, slot * 0.62);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Wykres słupkowy">
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={pad.left} x2={width - pad.right} y1={pad.top + innerH * (1 - t)} y2={pad.top + innerH * (1 - t)} stroke="#e5e7eb" strokeDasharray="3 3" />
        ))}
        {data.map((d, i) => {
          const x = pad.left + slot * i + (slot - barW) / 2;
          const h = (d.value / max) * innerH;
          const hh = ((d.highlight || 0) / max) * innerH;
          return (
            <g key={i}>
              <title>{`${d.label}: ${format(d.value)}${d.highlight !== undefined ? ` (wygrane: ${format(d.highlight)})` : ''}`}</title>
              <rect x={x} y={pad.top + innerH - h} width={barW} height={Math.max(h, 0)} rx={3} fill="#c7d2e0" />
              {d.highlight !== undefined && (
                <rect x={x} y={pad.top + innerH - hh} width={barW} height={Math.max(hh, 0)} rx={3} fill="#3B4A5C" />
              )}
              <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="#6b7280">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 text-xs text-gray-600 mt-1 justify-center">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#c7d2e0' }} />{valueLabel}</span>
        {data.some((d) => d.highlight !== undefined) && (
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#3B4A5C' }} />{highlightLabel}</span>
        )}
      </div>
    </div>
  );
}

// ---------- linia (np. trend marży) ----------
export function LineChart({
  points,
  height = 160,
  suffix = '%',
  color = '#16a34a',
}: {
  points: Array<{ label: string; value: number | null }>;
  height?: number;
  suffix?: string;
  color?: string;
}) {
  const width = 640;
  const pad = { top: 16, right: 16, bottom: 26, left: 16 };
  const valid = points.filter((p) => p.value !== null) as Array<{ label: string; value: number }>;
  if (valid.length < 2) return <div className="text-sm text-gray-500 py-6 text-center">Za mało danych do wykresu</div>;

  const min = Math.min(...valid.map((p) => p.value));
  const max = Math.max(...valid.map((p) => p.value));
  const range = max - min || 1;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const step = innerW / Math.max(1, points.length - 1);
  const coords = points.map((p, i) => ({
    x: pad.left + step * i,
    y: p.value === null ? null : pad.top + innerH - ((p.value - min) / range) * innerH,
    ...p,
  }));
  const path = coords.filter((c) => c.y !== null).map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Wykres liniowy">
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      {coords.map((c, i) => (
        <g key={i}>
          {c.y !== null && (
            <>
              <circle cx={c.x} cy={c.y} r={3.5} fill={color}><title>{`${c.label}: ${c.value!.toFixed(1)}${suffix}`}</title></circle>
              {(i === 0 || i === coords.length - 1 || i % 3 === 0) && (
                <text x={c.x} y={c.y - 8} textAnchor="middle" fontSize="10" fill="#374151">{c.value!.toFixed(1)}{suffix}</text>
              )}
            </>
          )}
          <text x={c.x} y={height - 8} textAnchor="middle" fontSize="11" fill="#6b7280">{c.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ---------- poziome słupki (rankingi) ----------
export function HBars({
  items,
  format = formatCurrencyShort,
  color = 'bg-eltron-primary',
}: {
  items: Array<{ label: string; value: number; sub?: string }>;
  format?: (n: number) => string;
  color?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <div className="text-sm text-gray-500 py-4 text-center">Brak danych</div>;
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex justify-between gap-3 text-sm mb-1">
            <span className="text-gray-800 truncate" title={item.label}>{item.label}</span>
            <span className="font-medium text-gray-900 shrink-0">{format(item.value)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} />
          </div>
          {item.sub && <div className="text-xs text-gray-500 mt-0.5">{item.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ---------- wykres kołowy (donut) ----------
export function Donut({
  slices,
  size = 160,
  centerLabel,
  centerValue,
}: {
  slices: Array<{ label: string; value: number; color: string }>;
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-6 flex-wrap justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Wykres kołowy">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={22} />
        {total > 0 &&
          slices.map((s, i) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={22}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        {centerValue && (
          <>
            <text x="50%" y="48%" textAnchor="middle" fontSize="22" fontWeight="700" fill="#111827">{centerValue}</text>
            {centerLabel && <text x="50%" y="62%" textAnchor="middle" fontSize="11" fill="#6b7280">{centerLabel}</text>}
          </>
        )}
      </svg>
      <ul className="space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />
            <span className="text-gray-700">{s.label}</span>
            <span className="font-medium text-gray-900">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- pasek postępu ----------
export function ProgressBar({ value, max, label, sub }: { value: number; max: number; label?: string; sub?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-eltron-primary' : pct >= 30 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div>
      {label && (
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-700">{label}</span>
          <span className="font-medium text-gray-900">{max > 0 ? `${Math.round((value / max) * 100)}%` : '-'}</span>
        </div>
      )}
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}
