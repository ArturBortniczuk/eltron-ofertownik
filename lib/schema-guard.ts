// lib/schema-guard.ts
// Gdy baza pochodzi ze starszej wersji aplikacji (brak nowych kolumn/tabel), schemat jest uzupełniany
// automatycznie. Instrukcje wykonują się po jednej: błąd jednej (np. nietypowy stan starej bazy) nie
// cofa pozostałych. Skrypt jest idempotentny i nie usuwa żadnych danych (poza odtwarzanym widokiem).
import { db } from './db';
import { SCHEMA_STATEMENTS } from './schema.generated';

export interface SchemaRunResult {
  ran: number;
  errors: Array<{ statement: string; message: string }>;
}

// Wynik ostatniej migracji - widoczny w /api/health
export let lastMigration: SchemaRunResult | null = null;

export async function runSchema(): Promise<SchemaRunResult> {
  const result: SchemaRunResult = { ran: 0, errors: [] };
  for (const statement of SCHEMA_STATEMENTS) {
    try {
      await db.query(statement);
      result.ran++;
    } catch (error: any) {
      const head = statement.replace(/\s+/g, ' ').slice(0, 90);
      console.error(`Schemat: instrukcja nie powiodła się (${head}...): ${error?.message}`);
      result.errors.push({ statement: head, message: String(error?.message || error) });
    }
  }
  lastMigration = result;
  return result;
}

export async function schemaStatus() {
  const r = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = current_schema() AND (
          (table_name = 'offers' AND column_name IN ('public_token', 'approval_status', 'sent_at', 'offer_number', 'outcome'))
          OR (table_name = 'product_prices' AND column_name = 'price_type')
          OR (table_name = 'products' AND column_name IN ('sku', 'min_price'))
          OR (table_name = 'users' AND column_name = 'monthly_target')
          OR (table_name = 'offer_margin_summary' AND column_name = 'user_id'))) AS cols,
      (SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name IN ('tasks', 'offer_templates', 'offer_activity', 'client_interactions', 'client_discounts', 'supplier_requests')) AS tabs
  `);
  const cols = Number(r.rows[0].cols);
  const tabs = Number(r.rows[0].tabs);
  return { cols, tabs, upToDate: cols >= 10 && tabs >= 6 };
}

let ready: Promise<void> | null = null;

export function ensureSchemaReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      try {
        if (!(await schemaStatus()).upToDate) {
          console.log('Aktualizuję schemat bazy danych do najnowszej wersji...');
          await runSchema();
        }
      } catch (error) {
        ready = null; // spróbuj ponownie przy kolejnym żądaniu
        throw error;
      }
    })();
  }
  return ready;
}
