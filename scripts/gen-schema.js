// Generuje lib/schema.generated.ts z database-schema.sql,
// dzięki czemu aplikacja może sama utworzyć schemat (bez czytania plików w runtime).
// Eksportuje cały skrypt oraz listę pojedynczych instrukcji (do wykonywania po jednej, odpornie na błędy).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'database-schema.sql'), 'utf8');

// Skrypt nie zawiera średników ani "--" wewnątrz tekstów, więc proste cięcie jest bezpieczne
const statements = sql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

const out =
  '// WYGENEROWANE przez scripts/gen-schema.js z database-schema.sql - nie edytuj ręcznie.\n' +
  'export const SCHEMA_SQL = ' + JSON.stringify(sql) + ';\n' +
  'export const SCHEMA_STATEMENTS: string[] = ' + JSON.stringify(statements, null, 2) + ';\n';

fs.writeFileSync(path.join(root, 'lib', 'schema.generated.ts'), out);
console.log(`lib/schema.generated.ts zaktualizowany (${statements.length} instrukcji)`);
