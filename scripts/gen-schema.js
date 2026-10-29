// Generuje lib/schema.generated.ts z database-schema.sql,
// dzięki czemu aplikacja może sama utworzyć schemat (bez czytania plików w runtime).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'database-schema.sql'), 'utf8');

const out =
  '// WYGENEROWANE przez scripts/gen-schema.js z database-schema.sql - nie edytuj ręcznie.\n' +
  'export const SCHEMA_SQL = ' + JSON.stringify(sql) + ';\n';

fs.writeFileSync(path.join(root, 'lib', 'schema.generated.ts'), out);
console.log('lib/schema.generated.ts zaktualizowany');
