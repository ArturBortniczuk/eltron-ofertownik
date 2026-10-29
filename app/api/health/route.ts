// Diagnostyka (tylko w trybie demo): połączenie z bazą, stan schematu i ostatnia migracja.
// Wejdź na /api/health, gdy coś zwraca błędy 500.
import { NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { DEMO_MODE } from '../../../lib/auth';
import { ensureSchemaReady, lastMigration, schemaStatus } from '../../../lib/schema-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!DEMO_MODE) return NextResponse.json({ error: 'Niedostępne' }, { status: 404 });

  const out: Record<string, unknown> = { database: 'nieznany', hasDatabaseUrl: !!process.env.DATABASE_URL };
  try {
    await db.query('SELECT 1');
    out.database = 'połączono';
  } catch (e: any) {
    out.database = `BŁĄD POŁĄCZENIA: ${e?.message}`;
    return NextResponse.json(out, { status: 500 });
  }

  try {
    await ensureSchemaReady();
    out.schema = await schemaStatus();
    out.lastMigration = lastMigration;
    const missing = await db.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'offers' ORDER BY ordinal_position`);
    out.offersColumns = missing.rows.map((r: any) => r.column_name);
  } catch (e: any) {
    out.schemaError = e?.message;
  }
  return NextResponse.json(out);
}
