// lib/schema-guard.ts
// Gdy baza pochodzi ze starszej wersji aplikacji (brak nowych kolumn/tabel), schemat jest uzupełniany
// automatycznie przy pierwszym żądaniu. Skrypt schematu jest idempotentny, więc nie usuwa żadnych danych.
import { db } from './db';
import { SCHEMA_SQL } from './schema.generated';

let ready: Promise<void> | null = null;

async function needsMigration(): Promise<boolean> {
  const r = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = current_schema() AND (
          (table_name = 'offers' AND column_name IN ('public_token', 'approval_status', 'sent_at'))
          OR (table_name = 'product_prices' AND column_name = 'price_type')
          OR (table_name = 'products' AND column_name = 'sku')
          OR (table_name = 'users' AND column_name = 'monthly_target')
          OR (table_name = 'offer_margin_summary' AND column_name = 'user_id'))) AS cols,
      (SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name IN ('tasks', 'offer_templates', 'offer_activity', 'client_interactions', 'client_discounts')) AS tabs
  `);
  return Number(r.rows[0].cols) < 7 || Number(r.rows[0].tabs) < 5;
}

export function ensureSchemaReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      try {
        if (await needsMigration()) {
          console.log('Aktualizuję schemat bazy danych do najnowszej wersji...');
          await db.query(SCHEMA_SQL);
        }
      } catch (error) {
        ready = null; // spróbuj ponownie przy kolejnym żądaniu
        throw error;
      }
    })();
  }
  return ready;
}
