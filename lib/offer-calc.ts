// lib/offer-calc.ts
// Przeliczanie ofert po stronie serwera - ceny i sumy z przeglądarki nie są brane "na słowo".
// Marża pozycji = (cena sprzedaży - koszt) / koszt * 100 (narzut na koszt), tak jak w PricingManager.

export const APPROVAL_RULES = {
  // Oferta o średniej marży poniżej tej wartości wymaga akceptacji zarządu
  minOfferMarginPercent: 10,
  // Pojedyncza pozycja o marży poniżej tej wartości również wymaga akceptacji
  minItemMarginPercent: 5,
};

export const ADDITIONAL_COSTS_VAT = 23;
// Zakładamy, że koszty dodatkowe (transport, montaż) mają koszt własny = 80% ceny
export const ADDITIONAL_COSTS_COST_RATIO = 0.8;

export const round2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const num = (v: any, fallback = 0): number => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export interface CalcItem {
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  cost_price: number;
  margin_percent: number;
  discount_percent: number;
  original_price: number;
}

export interface OfferCalculation {
  items: CalcItem[];
  totals: {
    net: number;
    vat: number;
    gross: number;
    cost: number;
    margin: number;
    marginPercent: number;
  };
  itemsMarginPercent: number | null;
  needsApproval: boolean;
  approvalReasons: string[];
}

export function computeOffer(input: { items: any[]; additional_costs?: any }): OfferCalculation {
  const items: CalcItem[] = (input.items || []).map((raw: any) => {
    const quantity = Math.max(0, num(raw.quantity));
    const unitPrice = Math.max(0, num(raw.unit_price));
    const vatRate = Math.min(100, Math.max(0, num(raw.vat_rate, 23)));
    const costPrice = Math.max(0, num(raw.cost_price));
    const net = round2(quantity * unitPrice);
    const vat = round2(net * (vatRate / 100));
    return {
      product_name: String(raw.product_name || '').trim(),
      unit: String(raw.unit || 'szt').trim() || 'szt',
      quantity,
      unit_price: unitPrice,
      vat_rate: vatRate,
      net_amount: net,
      vat_amount: vat,
      gross_amount: round2(net + vat),
      cost_price: costPrice,
      margin_percent: costPrice > 0 ? round2(((unitPrice - costPrice) / costPrice) * 100) : 0,
      discount_percent: Math.min(100, Math.max(0, num(raw.discount_percent))),
      original_price: num(raw.original_price) > 0 ? num(raw.original_price) : unitPrice,
    };
  });

  const additional = Math.max(0, num(input.additional_costs));
  const itemsNet = items.reduce((s, i) => s + i.net_amount, 0);
  const itemsVat = items.reduce((s, i) => s + i.vat_amount, 0);
  const itemsCost = items.reduce((s, i) => s + i.cost_price * i.quantity, 0);

  const net = round2(itemsNet + additional);
  const vat = round2(itemsVat + additional * (ADDITIONAL_COSTS_VAT / 100));
  const cost = round2(itemsCost + additional * ADDITIONAL_COSTS_COST_RATIO);
  const margin = round2(net - cost);

  // Marża liczona tylko na pozycjach z podanym kosztem (inaczej "0 kosztu" zawyżałoby marżę)
  const costed = items.filter((i) => i.cost_price > 0);
  const costedNet = costed.reduce((s, i) => s + i.net_amount, 0);
  const costedCost = costed.reduce((s, i) => s + i.cost_price * i.quantity, 0);
  const itemsMarginPercent = costedCost > 0 ? round2(((costedNet - costedCost) / costedCost) * 100) : null;

  const approvalReasons: string[] = [];
  if (itemsMarginPercent !== null && itemsMarginPercent < APPROVAL_RULES.minOfferMarginPercent) {
    approvalReasons.push(`średnia marża oferty ${itemsMarginPercent.toFixed(1)}% jest poniżej ${APPROVAL_RULES.minOfferMarginPercent}%`);
  }
  const veryLow = costed.filter((i) => i.margin_percent < APPROVAL_RULES.minItemMarginPercent);
  if (veryLow.length > 0) {
    approvalReasons.push(`${veryLow.length} poz. z marżą poniżej ${APPROVAL_RULES.minItemMarginPercent}%`);
  }

  return {
    items,
    totals: {
      net,
      vat,
      gross: round2(net + vat),
      cost,
      margin,
      marginPercent: cost > 0 ? round2((margin / cost) * 100) : 0,
    },
    itemsMarginPercent,
    needsApproval: approvalReasons.length > 0,
    approvalReasons,
  };
}
