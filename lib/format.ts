// lib/format.ts - formatowanie i słowniki wspólne dla komponentów klienckich

export const formatCurrency = (amount: number | string | null | undefined): string => {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (typeof n !== 'number' || isNaN(n)) return '0,00 zł';
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(n);
};

export const formatCurrencyShort = (amount: number | null | undefined): string => {
  const n = Number(amount) || 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} mln zł`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)} tys. zł`;
  return formatCurrency(n);
};

export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return '-';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pl-PL');
};

export const formatDateTime = (value: string | Date | null | undefined): string => {
  if (!value) return '-';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '-' : d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
};

export const timeAgo = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'przed chwilą';
  if (min < 60) return `${min} min temu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} godz. temu`;
  const d = Math.floor(h / 24);
  if (d < 31) return `${d} ${d === 1 ? 'dzień' : 'dni'} temu`;
  return formatDate(value);
};

export const daysBetween = (from: string | Date, to: string | Date = new Date()): number =>
  Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000);

export const STATUS_META: Record<string, { label: string; badge: string; dot: string; column: string }> = {
  draft: { label: 'Szkic', badge: 'bg-gray-100 text-gray-800', dot: 'bg-gray-400', column: 'border-gray-300' },
  sent: { label: 'Wysłana', badge: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500', column: 'border-blue-300' },
  accepted: { label: 'Zaakceptowana', badge: 'bg-green-100 text-green-800', dot: 'bg-green-500', column: 'border-green-300' },
  rejected: { label: 'Odrzucona', badge: 'bg-red-100 text-red-800', dot: 'bg-red-500', column: 'border-red-300' },
};

export const APPROVAL_META: Record<string, { label: string; badge: string }> = {
  pending: { label: 'Czeka na akceptację', badge: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Marża zaakceptowana', badge: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Marża odrzucona', badge: 'bg-red-100 text-red-800' },
};

export const marginBadge = (margin: number | null | undefined): string => {
  if (typeof margin !== 'number' || isNaN(margin)) return 'bg-gray-100 text-gray-800';
  if (margin >= 20) return 'bg-green-100 text-green-800';
  if (margin >= 15) return 'bg-yellow-100 text-yellow-800';
  if (margin >= 10) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
};

export const ROLE_INFO: Record<string, { title: string; description: string; sees: string[] }> = {
  handlowiec: {
    title: 'Handlowiec',
    description: 'Pracuje na własnych klientach i ofertach.',
    sees: [
      'Tylko swoje oferty i klientów',
      'Marże widzi podczas wyceny, nie na listach',
      'Oferta z niską marżą trafia do akceptacji zarządu',
      'Własny cel sprzedażowy i zadania',
    ],
  },
  'zarząd': {
    title: 'Zarząd',
    description: 'Pełny wgląd w firmę i zatwierdzanie wyjątków.',
    sees: [
      'Wszystkie oferty, klientów i handlowców',
      'Marże, koszty i zyski na każdej ofercie',
      'Akceptuje oferty z niską marżą',
      'Zarządza zespołem i celami, resetuje demo',
    ],
  },
  'centrum elektryczne': {
    title: 'Centrum Elektryczne',
    description: 'Wsparcie sprzedaży - podgląd całej firmy.',
    sees: [
      'Wszystkie oferty i marże (podgląd)',
      'Zarządza cennikiem produktów',
      'Nie akceptuje ofert z niską marżą',
    ],
  },
  budowy: {
    title: 'Budowy',
    description: 'Zespół budów - oferty na własne projekty.',
    sees: ['Tylko własne oferty i klienci', 'Takie same uprawnienia jak handlowiec'],
  },
  inne: {
    title: 'Inne',
    description: 'Podstawowy dostęp.',
    sees: ['Tylko własne oferty i klienci'],
  },
};

export const roleBadge = (role: string): string =>
  ({
    handlowiec: 'bg-blue-100 text-blue-800',
    'zarząd': 'bg-purple-100 text-purple-800',
    'centrum elektryczne': 'bg-green-100 text-green-800',
    budowy: 'bg-orange-100 text-orange-800',
  } as Record<string, string>)[role] || 'bg-gray-100 text-gray-800';
