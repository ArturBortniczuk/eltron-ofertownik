// lib/inquiry-parser.ts - wyciąganie pozycji z treści zapytania ofertowego (e-mail / tekst z PDF / arkusz)
// To zwykły parser regułowy (bez AI): działa na tekście. Odczyt PDF/skanów (OCR) w demo jest symulowany po stronie UI.

export interface ParsedRow {
  raw: string;
  name: string;
  quantity: number;
  unit: string;
  note: string;
}

export interface ParsedInquiry {
  rows: ParsedRow[];
  project: string;
  deadline: string;
  offerType: 'zakup' | 'przetarg';
  remarks: string[];
  clientHint: string;
  contactHint: string;
}

const UNIT_ALIASES: Record<string, string> = {
  m: 'm', mb: 'm', metr: 'm', metrów: 'm', metry: 'm', km: 'km',
  szt: 'szt', 'szt.': 'szt', sztuk: 'szt', sztuki: 'szt', pcs: 'szt',
  kpl: 'kpl', 'kpl.': 'kpl', komplet: 'kpl', komplety: 'kpl',
  opak: 'opak', 'opak.': 'opak', opakowanie: 'opak', opakowania: 'opak',
  kg: 'kg', godz: 'godz', 'godz.': 'godz', h: 'godz', usł: 'usł', 'usł.': 'usł',
};
const UNIT_RE = '(km|mb|m|szt\\.?|sztuk[i]?|pcs|kpl\\.?|komplet[y]?|opak\\.?|opakowa(?:nie|nia)|kg|godz\\.?|usł\\.?)';

const num = (s: string): number => {
  const cleaned = s.replace(/\s+/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

function toRow(raw: string, name: string, qtyStr: string, unitStr: string, note: string): ParsedRow | null {
  let quantity = num(qtyStr);
  let unit = UNIT_ALIASES[unitStr.toLowerCase()] || UNIT_ALIASES[unitStr.toLowerCase().replace(/\.$/, '')] || 'szt';
  if (unit === 'km') { quantity *= 1000; unit = 'm'; }
  const cleanName = name.replace(/^[\s\-–—•*·\d]+[.)]\s*/, '').replace(/[\s\-–—:,;|]+$/g, '').replace(/^[\s\-–—•*·]+/, '').trim();
  if (!cleanName || cleanName.length < 3 || quantity <= 0 || !/[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(cleanName)) return null;
  return { raw, name: cleanName, quantity, unit, note: note.replace(/^[\s\-–—:,;|(]+|[\s)]+$/g, '').trim() };
}

export function parseInquiry(text: string): ParsedInquiry {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const out: ParsedInquiry = { rows: [], project: '', deadline: '', offerType: 'zakup', remarks: [], clientHint: '', contactHint: '' };

  if (/przetarg|siwz|specyfikacj[aię] warunk|postępowani/i.test(text)) out.offerType = 'przetarg';

  for (const line of lines) {
    const header = line.match(/^(inwestycja|temat|dotyczy|zadanie|projekt|przedmiot(?: zamówienia)?|nazwa zadania)\s*[:\-–]\s*(.+)$/i);
    if (header) { if (!out.project) out.project = header[2].replace(/^["„”]|["„”]$/g, '').trim(); continue; }
    const deadline = line.match(/termin(?: składania)?(?: ofert)?\s*[:\-–]?\s*(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/i);
    if (deadline) { out.deadline = `${deadline[3]}-${deadline[2].padStart(2, '0')}-${deadline[1].padStart(2, '0')}`; continue; }
    const client = line.match(/^(zamawiający|firma|klient|od|from|nabywca)\s*[:\-–]\s*(.+)$/i);
    if (client) { if (!out.clientHint) out.clientHint = client[2].trim(); continue; }
    const contact = line.match(/^(osoba kontaktowa|kontakt|pozdrawiam,?|z poważaniem,?)\s*[:\-–]?\s*(.*)$/i);
    if (contact && contact[2] && !out.contactHint) { out.contactHint = contact[2].trim(); }
    const remark = line.match(/^(uwagi|uwaga|warunki|dodatkowo|ważne)\s*[:\-–]\s*(.+)$/i);
    if (remark) { out.remarks.push(remark[2].trim()); continue; }
    if (/^(dzień dobry|szanowni|witam|prosimy|proszę|w załączeniu|temat:|re:|fwd:|data:|do:|dw:|tel)/i.test(line)) continue;

    // 1) układ tabelaryczny: "nazwa ; ilość ; jedn." lub z tabulatorami
    const cells = line.split(/\t|;/).map((c) => c.trim()).filter((c) => c !== '');
    if (cells.length >= 2) {
      const qtyIdx = cells.findIndex((c, i) => i > 0 && /^\d[\d\s.,]*$/.test(c));
      if (qtyIdx > 0) {
        const unitCell = cells.find((c, i) => i > qtyIdx && new RegExp(`^${UNIT_RE}$`, 'i').test(c));
        const rest = cells.filter((_, i) => i > qtyIdx && cells[i] !== unitCell).join(' ');
        const row = toRow(line, cells.slice(0, qtyIdx).join(' '), cells[qtyIdx], unitCell || 'szt', rest);
        if (row) { out.rows.push(row); continue; }
      }
    }
    // 2) "ilość jednostka nazwa", np. "200 m kabel YKY 4x16"
    const qtyFirst = line.match(new RegExp(`^(?:\\d+[.)]\\s+)?(\\d[\\d\\s.,]*)\\s*${UNIT_RE}\\s+(.+)$`, 'i'));
    if (qtyFirst) {
      const row = toRow(line, qtyFirst[3], qtyFirst[1], qtyFirst[2], '');
      if (row) { out.rows.push(row); continue; }
    }
    // 3) "nazwa - ilość jednostka (uwaga)"
    const m = line.match(new RegExp(`^(.*?)[\\s\\-–—:,|x×]+(\\d[\\d\\s.,]*)\\s*${UNIT_RE}(?![a-zA-Zą-ź])\\.?(.*)$`, 'i'));
    if (m) {
      const row = toRow(line, m[1], m[2], m[3], m[4]);
      if (row) { out.rows.push(row); continue; }
    }
  }
  return out;
}

// ---------- dopasowanie do katalogu ----------

const stripDiacritics = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L');

export function tokens(s: string): string[] {
  const t = stripDiacritics(s.toLowerCase())
    .replace(/mm²|mm2|mm\^2/g, ' ')
    .replace(/(\d)\s*[x×]\s*(\d)/g, '$1x$2')
    .replace(/(\d),(\d)/g, '$1.$2');
  return (t.match(/\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)*|[a-z]+/g) || []).filter((x) => x.length > 1 || /\d/.test(x));
}

const SYNONYMS: Record<string, string> = { kabel: 'przewod', kable: 'przewod', przewody: 'przewod', wylacznik: 'wylacznik', mb: 'm' };

export function matchScore(query: string, candidate: string): number {
  const q = tokens(query).map((x) => SYNONYMS[x] || x);
  const c = tokens(candidate).map((x) => SYNONYMS[x] || x);
  if (q.length === 0 || c.length === 0) return 0;
  const weight = (t: string) => (/\d/.test(t) ? 2 : 1);
  const qSum = q.reduce((s, t) => s + weight(t), 0);
  const cSum = c.reduce((s, t) => s + weight(t), 0);
  let hit = 0;
  for (const t of q) {
    if (c.includes(t) || c.some((x) => x.length >= 4 && t.length >= 4 && (x.startsWith(t) || t.startsWith(x)))) hit += weight(t);
  }
  return (2 * hit) / (qSum + cSum);
}
