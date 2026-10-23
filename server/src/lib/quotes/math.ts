import type { Prisma } from '@prisma/client';

/**
 * Quote (Angebot) lines and totals. Everything is integer cents; the discount is spread over the VAT
 * groups in proportion to their subtotal (the last group takes the rounding rest), so the VAT is
 * computed on what the customer actually pays.
 */

export const QUOTE_UNITS = ['PERSON', 'PIECE', 'FLAT', 'MONTH'] as const;
export type QuoteUnit = (typeof QUOTE_UNITS)[number];

export const asUnit = (u: unknown): QuoteUnit => (QUOTE_UNITS.includes(u as QuoteUnit) ? (u as QuoteUnit) : 'PIECE');

/** German unit label as printed in the document ("Person" / "Personen", "Stück", "Pauschal", "Monat" / "Monate"). */
export const unitLabel = (unit: QuoteUnit, quantity = 1) => {
  const one = quantity === 1;
  switch (unit) {
    case 'PERSON':
      return one ? 'Person' : 'Personen';
    case 'MONTH':
      return one ? 'Monat' : 'Monate';
    case 'FLAT':
      return 'Pauschal';
    default:
      return 'Stück';
  }
};

export interface QuoteItem {
  description: string;
  quantity: number;
  unit: QuoteUnit;
  unitPriceCents: number;
  /** Own VAT rate (percent); null = the quote's rate. */
  vatRate: number | null;
  catalogueId: string | null;
  /** Quantity already turned into invoices (partial conversion). */
  convertedQty: number;
}

export type DiscountType = 'NONE' | 'PERCENT' | 'AMOUNT';
/** PERCENT: value in basis points (10 % = 1000); AMOUNT: value in cents. */
export interface Discount {
  type: DiscountType;
  value: number;
}

/** Lines stored in Quote.items, tolerant of malformed rows. */
export const quoteItems = (json: Prisma.JsonValue | undefined | null): QuoteItem[] =>
  Array.isArray(json)
    ? json
        .filter((l): l is Prisma.JsonObject => !!l && typeof l === 'object' && !Array.isArray(l))
        .map((l) => {
          const rate = l.vatRate === null || l.vatRate === undefined ? null : Number(l.vatRate);
          return {
            description: String(l.description ?? ''),
            quantity: Number(l.quantity ?? 0),
            unit: asUnit(l.unit),
            unitPriceCents: Math.round(Number(l.unitPriceCents ?? 0)),
            vatRate: rate !== null && Number.isFinite(rate) ? Math.round(rate) : null,
            catalogueId: typeof l.catalogueId === 'string' ? l.catalogueId : null,
            convertedQty: Number(l.convertedQty ?? 0) || 0,
          };
        })
    : [];

export const itemTotalCents = (l: Pick<QuoteItem, 'quantity' | 'unitPriceCents'>) => Math.round(l.quantity * l.unitPriceCents);

export const discountCentsOf = (subtotalCents: number, d: Discount) => {
  if (d.type === 'PERCENT') return Math.min(subtotalCents, Math.round((subtotalCents * d.value) / 10000));
  if (d.type === 'AMOUNT') return Math.min(subtotalCents, Math.max(0, Math.round(d.value)));
  return 0;
};

export interface VatGroup {
  rate: number;
  netCents: number;
  vatCents: number;
}

export interface QuoteTotals {
  subtotalCents: number;
  discountCents: number;
  netCents: number;
  vatCents: number;
  grossCents: number;
  vatBreakdown: VatGroup[];
}

export const computeQuoteTotals = (items: Pick<QuoteItem, 'quantity' | 'unitPriceCents' | 'vatRate'>[], defaultVatRate: number, discount: Discount): QuoteTotals => {
  const subtotalCents = items.reduce((a, l) => a + itemTotalCents(l), 0);
  const discountCents = discountCentsOf(subtotalCents, discount);
  const groups = new Map<number, number>();
  for (const l of items) {
    const rate = l.vatRate ?? defaultVatRate;
    groups.set(rate, (groups.get(rate) ?? 0) + itemTotalCents(l));
  }
  const rates = [...groups.keys()].sort((a, b) => b - a);
  let rest = discountCents;
  const vatBreakdown = rates.map((rate, i) => {
    const sub = groups.get(rate)!;
    const share = i === rates.length - 1 ? rest : subtotalCents ? Math.round((discountCents * sub) / subtotalCents) : 0;
    rest -= share;
    const netCents = sub - share;
    return { rate, netCents, vatCents: Math.round((netCents * rate) / 100) };
  });
  const netCents = subtotalCents - discountCents;
  const vatCents = vatBreakdown.reduce((a, g) => a + g.vatCents, 0);
  return { subtotalCents, discountCents, netCents, vatCents, grossCents: netCents + vatCents, vatBreakdown };
};

/** "10 %" / "7,5 %" from basis points. */
export const percentLabel = (bp: number) => `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(bp / 100)} %`;
