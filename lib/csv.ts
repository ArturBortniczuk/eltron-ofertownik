// lib/csv.ts - prosty parser/serializer CSV zgodny z Excelem (polskie ustawienia: separator ";", przecinek dziesiętny)

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).replace(/\s/g, '').replace('zł', '').replace('%', '').replace(',', '.');
  if (cleaned === '') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

const escapeCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  // Ochrona przed wstrzykiwaniem formuł w Excelu
  if (/^[=+@]/.test(s) || (/^-/.test(s) && isNaN(Number(s)))) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Liczby zapisujemy z przecinkiem dziesiętnym, żeby polski Excel rozpoznał je jako liczby
export function toCsv(header: string[], rows: unknown[][]): string {
  const fmt = (v: unknown) => (typeof v === 'number' ? String(v).replace('.', ',') : v);
  const lines = [header, ...rows.map((r) => r.map(fmt))].map((r) => r.map(escapeCell).join(';'));
  return '﻿' + lines.join('\r\n');
}

// Mapowanie nagłówków importu produktów (PL/EN) na pola
const HEADER_ALIASES: Record<string, string> = {
  nazwa: 'name', name: 'name', produkt: 'name', 'nazwa produktu': 'name',
  jednostka: 'unit', jm: 'unit', 'j.m.': 'unit', unit: 'unit',
  sku: 'sku', kod: 'sku', indeks: 'sku', symbol: 'sku',
  kategoria: 'category', category: 'category', grupa: 'category',
  'cena zakupu': 'cost_price', koszt: 'cost_price', cost: 'cost_price', 'cena zakupu netto': 'cost_price', zakup: 'cost_price',
  marza: 'margin_percent', 'marża': 'margin_percent', 'marża %': 'margin_percent', margin: 'margin_percent', 'narzut': 'margin_percent',
};

export interface ImportProductRow {
  name: string;
  unit?: string;
  sku?: string;
  category?: string;
  cost_price?: number | null;
  margin_percent?: number | null;
}

const CLIENT_ALIASES: Record<string, string> = {
  nazwa: 'name', 'nazwa firmy': 'name', firma: 'name', klient: 'name', name: 'name',
  email: 'email', 'e-mail': 'email', mail: 'email',
  telefon: 'phone', tel: 'phone', phone: 'phone',
  adres: 'address', address: 'address',
  nip: 'nip',
  'osoba kontaktowa': 'contact_person', kontakt: 'contact_person', 'osoba': 'contact_person', contact: 'contact_person',
  uwagi: 'notes', notatki: 'notes', notes: 'notes',
};

export interface ImportClientRow {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  nip?: string;
  contact_person?: string;
  notes?: string;
}

export function mapClientRows(table: string[][]): { rows: ImportClientRow[]; unknownHeaders: string[]; error?: string } {
  if (table.length < 2) return { rows: [], unknownHeaders: [], error: 'Plik musi zawierać nagłówek i co najmniej jeden wiersz' };
  const fields = table[0].map((h) => CLIENT_ALIASES[h.trim().toLowerCase()] || '');
  const unknownHeaders = table[0].filter((_, i) => !fields[i]);
  if (!fields.includes('name')) return { rows: [], unknownHeaders, error: 'Brak kolumny z nazwą klienta (Nazwa)' };

  const rows: ImportClientRow[] = [];
  for (const cells of table.slice(1)) {
    const get = (f: string) => {
      const idx = fields.indexOf(f);
      return idx >= 0 ? (cells[idx] || '').trim() : '';
    };
    const name = get('name');
    if (!name) continue;
    rows.push({
      name,
      email: get('email') || undefined,
      phone: get('phone') || undefined,
      address: get('address') || undefined,
      nip: get('nip') || undefined,
      contact_person: get('contact_person') || undefined,
      notes: get('notes') || undefined,
    });
  }
  return { rows, unknownHeaders };
}

export function mapProductRows(table: string[][]): { rows: ImportProductRow[]; unknownHeaders: string[]; error?: string } {
  if (table.length < 2) return { rows: [], unknownHeaders: [], error: 'Plik musi zawierać nagłówek i co najmniej jeden wiersz' };
  const headers = table[0].map((h) => h.trim().toLowerCase());
  const fields = headers.map((h) => HEADER_ALIASES[h] || '');
  const unknownHeaders = table[0].filter((_, i) => !fields[i]);
  if (!fields.includes('name')) return { rows: [], unknownHeaders, error: 'Brak kolumny z nazwą produktu (Nazwa)' };

  const rows: ImportProductRow[] = [];
  for (const cells of table.slice(1)) {
    const get = (f: string) => {
      const idx = fields.indexOf(f);
      return idx >= 0 ? (cells[idx] || '').trim() : '';
    };
    const name = get('name');
    if (!name) continue;
    rows.push({
      name,
      unit: get('unit') || 'szt',
      sku: get('sku') || undefined,
      category: get('category') || undefined,
      cost_price: parseNumber(get('cost_price')),
      margin_percent: parseNumber(get('margin_percent')),
    });
  }
  return { rows, unknownHeaders };
}
