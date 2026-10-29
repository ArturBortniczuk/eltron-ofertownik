// lib/api-auth.ts - pomocnik dla endpointów API
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, userFromSession, ApiUser, DEMO_MODE } from './auth';
import { ensureSchemaReady } from './schema-guard';

export async function getApiUser(): Promise<ApiUser | null> {
  // Każdy endpoint zaczyna od tego wywołania - tu dbamy, żeby schemat bazy był aktualny
  await ensureSchemaReady().catch((e) => console.error('Aktualizacja schematu nie powiodła się:', e));
  const session = await getServerSession(authOptions);
  return userFromSession(session);
}

export const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
export const forbidden = (msg = 'Brak uprawnień') => NextResponse.json({ error: msg }, { status: 403 });
export const notFound = (msg = 'Nie znaleziono') => NextResponse.json({ error: msg }, { status: 404 });
export const badRequest = (msg: string, details?: string[]) =>
  NextResponse.json({ error: msg, details }, { status: 400 });
export const serverError = (label: string, error: unknown, msg = 'Błąd serwera') => {
  console.error(label, error);
  // W trybie demo dołączamy przyczynę (komunikat bazy), żeby łatwo było ją zobaczyć w zakładce Network
  const detail = DEMO_MODE && error instanceof Error ? error.message : undefined;
  return NextResponse.json({ error: msg, detail }, { status: 500 });
};

// Bezpieczne parsowanie liczb z query stringa
export const intParam = (value: string | null, fallback: number, min = 1, max = 1000) => {
  const n = parseInt(value || '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export const OFFER_STATUSES = ['draft', 'sent', 'accepted', 'rejected'] as const;
