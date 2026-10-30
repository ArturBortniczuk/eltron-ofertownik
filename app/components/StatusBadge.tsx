'use client';

import { STATUS_META, APPROVAL_META } from '../../lib/format';
import { OUTCOMES, OFFER_TYPES } from '../../lib/offer-rules';

// Dla zamkniętych ofert pokazujemy wynik (wygrana / wygrana częściowo / przegrana)
export function StatusBadge({ status, large = false, outcome }: { status: string; large?: boolean; outcome?: string | null }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  const label = outcome === 'partial' && status === 'accepted' ? OUTCOMES.partial.label : meta.label;
  const badge = outcome === 'partial' && status === 'accepted' ? OUTCOMES.partial.badge : meta.badge;
  return (
    <span className={`${large ? 'px-3 py-1 text-sm' : 'px-2 py-1 text-xs'} font-medium rounded-full ${badge}`}>
      {label}
    </span>
  );
}

export function TypeBadge({ type }: { type?: string | null }) {
  if (!type || type === 'zakup') return null;
  const meta = OFFER_TYPES[type];
  if (!meta) return null;
  return <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${meta.badge}`}>{meta.label}</span>;
}

export function ApprovalBadge({ status }: { status?: string | null }) {
  if (!status || status === 'none') return null;
  const meta = APPROVAL_META[status];
  if (!meta) return null;
  return <span className={`px-2 py-1 text-xs font-medium rounded-full ${meta.badge}`}>{meta.label}</span>;
}
