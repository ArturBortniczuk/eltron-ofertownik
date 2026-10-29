// Tworzy schemat i dane demo.
// - bez body: tworzy schemat i wypełnia bazę danymi demo tylko gdy nie ma żadnych użytkowników
// - { reset: true }: kasuje WSZYSTKIE dane i generuje demo od nowa (wymaga zalogowanego zarządu, o ile baza ma już użytkowników)
import { NextRequest, NextResponse } from 'next/server';
import { DEMO_MODE } from '../../../../lib/auth';
import { db } from '../../../../lib/db';
import { getApiUser } from '../../../../lib/api-auth';
import { setupDemo } from '../../../../lib/demo-seed';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!DEMO_MODE) {
    return NextResponse.json({ error: 'Tryb demo jest wyłączony' }, { status: 403 });
  }

  let body: any = {};
  try { body = await request.json(); } catch { /* puste body */ }
  const reset = body?.reset === true;

  try {
    if (reset) {
      let hasUsers = false;
      try {
        const r = await db.query('SELECT COUNT(*)::int AS n FROM users');
        hasUsers = r.rows[0].n > 0;
      } catch { /* brak tabel */ }
      if (hasUsers) {
        const user = await getApiUser();
        if (!user || !user.isManagement) {
          return NextResponse.json({ error: 'Reset danych demo może wykonać tylko zarząd' }, { status: 403 });
        }
      }
    }

    const result = await setupDemo(reset);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Demo setup error:', error);
    return NextResponse.json({ error: `Nie udało się przygotować bazy: ${error?.message || 'nieznany błąd'}` }, { status: 500 });
  }
}
