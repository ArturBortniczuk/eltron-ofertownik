// Publiczna lista użytkowników demo (do ekranu wyboru roli)
import { NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { DEMO_MODE } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!DEMO_MODE) {
    return NextResponse.json({ demo: false, ready: false, users: [] });
  }
  try {
    const result = await db.query(`
      SELECT id, name, first_name, last_name, role, market_region
      FROM users
      WHERE is_active IS NOT FALSE
      ORDER BY CASE role WHEN 'handlowiec' THEN 1 WHEN 'zarząd' THEN 2 WHEN 'centrum elektryczne' THEN 3 ELSE 4 END, id
    `);
    return NextResponse.json({ demo: true, ready: true, users: result.rows });
  } catch (error: any) {
    // Brak tabel = baza nie jest jeszcze przygotowana
    const missing = error?.code === '42P01';
    if (!missing) console.error('Demo users error:', error);
    return NextResponse.json({
      demo: true,
      ready: false,
      users: [],
      error: missing ? null : 'Brak połączenia z bazą danych (sprawdź DATABASE_URL)',
    });
  }
}
