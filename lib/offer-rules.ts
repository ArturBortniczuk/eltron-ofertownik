// lib/offer-rules.ts - słowniki i reguły biznesowe wspólne dla serwera i przeglądarki (bez zależności od bazy)

// Segmenty oferty = grupy towarowe (wybór wymuszony przy tworzeniu oferty)
export const SEGMENTS = [
  'Kable i przewody',
  'Rury i osprzęt kablowy',
  'Bednarki i uziemienia',
  'Osprzęt energetyczny',
  'Osprzęt instalacyjny',
  'Aparatura modułowa',
  'Rozdzielnice',
  'Oświetlenie LED',
  'Automatyka',
  'Fotowoltaika i e-mobility',
  'Usługi',
  'Mieszany',
] as const;

export const OFFER_TYPES: Record<string, { label: string; badge: string }> = {
  zakup: { label: 'Zakup', badge: 'bg-sky-100 text-sky-800' },
  przetarg: { label: 'Przetarg', badge: 'bg-fuchsia-100 text-fuchsia-800' },
};

export const AVAILABILITY: Record<string, { label: string; badge: string }> = {
  available: { label: 'Dostępny', badge: 'bg-green-100 text-green-800' },
  partial: { label: 'Częściowo od ręki', badge: 'bg-amber-100 text-amber-800' },
  production: { label: 'Na zamówienie / produkcja', badge: 'bg-orange-100 text-orange-800' },
  on_request: { label: 'Do potwierdzenia', badge: 'bg-gray-100 text-gray-700' },
};

export const OUTCOMES: Record<string, { label: string; badge: string }> = {
  won: { label: 'Wygrana', badge: 'bg-green-100 text-green-800' },
  partial: { label: 'Wygrana częściowo', badge: 'bg-lime-100 text-lime-800' },
  lost: { label: 'Przegrana', badge: 'bg-red-100 text-red-800' },
};

export const LOST_REASON_OPTIONS = [
  'Wybrali tańszego dostawcę',
  'Zbyt długi termin dostawy',
  'Projekt wstrzymany przez inwestora',
  'Zmiana specyfikacji – nowa oferta',
  'Brak budżetu w tym kwartale',
  'Kupili u konkurencji (jakość / marka)',
  'Przetarg wygrał inny oferent',
  'Inny powód',
];

export const REMARK_TARGETS = ['Klient', 'Producent', 'Wewnętrzna'] as const;
export interface Remark { target: string; text: string }

// Limit ofert „wiszących”: oferta wysłana, której termin ważności minął o więcej niż OVERDUE_GRACE_DAYS dni,
// a handlowiec nie oznaczył wyniku (wygrana / przegrana / częściowo). Po przekroczeniu limitu
// nie można tworzyć nowych ofert, dopóki stare nie zostaną rozliczone.
export const OPEN_OFFERS_LIMIT = 5;
export const OVERDUE_GRACE_DAYS = 7;

// Progi akceptacji wg wartości netto oferty (coś w rodzaju obiegu DMS)
export const AMOUNT_TIERS = [
  { from: 150000, level: 'zarząd', label: 'Zarząd' },
  { from: 50000, level: 'dyrektor', label: 'Dyrektor handlowy' },
] as const;

export const amountTier = (net: number): { level: string; label: string } | null => {
  for (const t of AMOUNT_TIERS) if (net >= t.from) return { level: t.level, label: t.label };
  return null;
};

// Adresaci „DW” podpowiadani przy wysyłce / akceptacji
export const CC_SUGGESTIONS = [
  { label: 'Dyrektor handlowy', email: 'dyrektor.handlowy@eltron.pl' },
  { label: 'Dyrektor ds. kluczowych klientów', email: 'klucz@eltron.pl' },
  { label: 'Logistyka / magazyn', email: 'logistyka@eltron.pl' },
  { label: 'Zakupy', email: 'zakupy@eltron.pl' },
];

// Numer wyświetlany: OF/2026/0042 oraz kolejne warianty negocjacyjne OF/2026/0042.1, .2 ...
export const offerLabel = (o: { offer_number?: string | null; revision?: number | null; id?: number }): string => {
  const base = o.offer_number || (o.id ? `#${o.id}` : '');
  return o.revision && o.revision > 0 ? `${base}.${o.revision}` : base;
};

// Dostępność pozycji na podstawie stanu magazynowego (demo: stan z kartoteki produktu)
export function availabilityFor(
  quantity: number,
  stock: number | null | undefined,
  unit: string,
  productionNote?: string | null
): { availability: string; availability_note: string } {
  if (stock === null || stock === undefined) return { availability: 'on_request', availability_note: '' };
  if (stock >= quantity) return { availability: 'available', availability_note: '' };
  const note = productionNote || 'produkcja ok. 14 dni';
  if (stock > 0) {
    return { availability: 'partial', availability_note: `${stock} ${unit} od ręki, reszta: ${note}` };
  }
  return { availability: 'production', availability_note: note };
}

// Segment sugerowany na podstawie dominującej kategorii pozycji (wg wartości)
export function suggestSegment(items: Array<{ category?: string | null; net_amount?: number }>): string {
  const sums = new Map<string, number>();
  let total = 0;
  for (const i of items) {
    if (!i.category) continue;
    const v = Number(i.net_amount) || 1;
    sums.set(i.category, (sums.get(i.category) || 0) + v);
    total += v;
  }
  let best = '';
  let bestV = 0;
  sums.forEach((v, k) => { if (v > bestV) { best = k; bestV = v; } });
  if (!best) return '';
  return bestV / total >= 0.6 ? best : 'Mieszany';
}
