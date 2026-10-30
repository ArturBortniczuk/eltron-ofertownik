// Symulacja wysyłki danych do Process App (w demo nic nie wychodzi na zewnątrz – zwracamy tylko potwierdzenie)
import { NextRequest, NextResponse } from 'next/server';
import { getApiUser, unauthorized, forbidden } from '../../../../lib/api-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (!user.canViewAll) return forbidden();
  const body = await request.json().catch(() => ({}));
  const records = Math.max(0, parseInt(body.records, 10) || 0);
  const batch = `PA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
  return NextResponse.json({ success: true, batch, records, simulated: true });
}
