'use client';

import { STATUS_META, APPROVAL_META } from '../../lib/format';

export function StatusBadge({ status, large = false }: { status: string; large?: boolean }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  return (
    <span className={`${large ? 'px-3 py-1 text-sm' : 'px-2 py-1 text-xs'} font-medium rounded-full ${meta.badge}`}>
      {meta.label}
    </span>
  );
}

export function ApprovalBadge({ status }: { status?: string | null }) {
  if (!status || status === 'none') return null;
  const meta = APPROVAL_META[status];
  if (!meta) return null;
  return <span className={`px-2 py-1 text-xs font-medium rounded-full ${meta.badge}`}>{meta.label}</span>;
}
