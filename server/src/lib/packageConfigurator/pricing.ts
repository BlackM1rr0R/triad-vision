import { z } from 'zod';
import { computeQuoteTotals, type QuoteUnit } from '../quotes/math.js';
import { CONFIGURATOR_SERVICES, type ConfiguratorService, type QuoteSettings } from '../quotes/settings.js';

/**
 * Package configurator pricing (public /for-employers and company portal /company/configurator).
 *
 * The single source of prices is the quote catalogue (Setting `quotes`, lib/quotes/settings): a line tagged with
 * a configurator `service` prices that service; RECRUITMENT lines may name the professions they apply to.
 * Nothing here invents a price: a service without an active, priced catalogue line is "on request" and adds
 * nothing to the total. Volume discounts exist only when the catalogue line defines `volumeTiers`; the tier is
 * chosen by the total number of workers of the configuration.
 *
 * Catalogues stored before the configurator existed get the tags of the shipped default lines when they are read
 * (lib/quotes/settings withLegacyTags).
 *
 * Apostille, translations and embassy appointment booking are not offered (owner decision): they are no service
 * of the configurator, and a catalogue line whose name mentions them is never used, even when tagged.
 */

export const EXCLUDED_NAME_RE = /apostill|übersetz|uebersetz|translat|dolmetsch|beglaubig|termin|appointment/i;

export const MAX_WORKERS = 500;
export const MAX_POSITIONS = 10;
export const MAX_MONTHS = 24;

export interface ConfigOption {
  catalogueId: string;
  name: string;
  unit: QuoteUnit;
  /** null = on request (no price configured). */
  unitPriceCents: number | null;
  vatRate: number | null;
  professions: string[];
  volumeTiers: { minQty: number; discountBp: number }[];
}

/** Configurator options per service from the catalogue (active, tagged, not an excluded service). */
export const configuratorCatalogue = (catalogue: QuoteSettings['catalogue']): Record<ConfiguratorService, ConfigOption[]> => {
  const out = Object.fromEntries(CONFIGURATOR_SERVICES.map((s) => [s, [] as ConfigOption[]])) as Record<ConfiguratorService, ConfigOption[]>;
  for (const c of catalogue) {
    if (!c.active || EXCLUDED_NAME_RE.test(c.name)) continue;
    const service = c.service ?? null;
    if (!service || !out[service]) continue;
    out[service].push({
      catalogueId: c.id,
      name: c.name,
      unit: c.unit,
      unitPriceCents: c.unitPriceCents > 0 ? c.unitPriceCents : null,
      vatRate: c.vatRate,
      professions: c.professions ?? [],
      volumeTiers: [...(c.volumeTiers ?? [])].sort((a, b) => a.minQty - b.minQty),
    });
  }
  return out;
};

export const configInput = z.object({
  positions: z
    .array(z.object({ profession: z.string().trim().min(1).max(40), count: z.coerce.number().int().min(1).max(MAX_WORKERS) }))
    .min(1)
    .max(MAX_POSITIONS),
  services: z.array(z.enum(CONFIGURATOR_SERVICES)).min(1).max(CONFIGURATOR_SERVICES.length),
  /** Months of support after the start (services priced per month). */
  months: z.coerce.number().int().min(1).max(MAX_MONTHS).default(3),
});
export type ConfigInput = z.infer<typeof configInput>;

export interface PricedLine {
  service: ConfiguratorService;
  profession: string | null;
  catalogueId: string | null;
  description: string;
  unit: QuoteUnit;
  quantity: number;
  unitPriceCents: number | null;
  totalCents: number | null;
  discountBp: number;
  discountCents: number;
  vatRate: number | null;
  onRequest: boolean;
}

/** Best tier for a volume (highest minQty not above it), in basis points; 0 without tiers. */
export const tierDiscount = (tiers: ConfigOption['volumeTiers'], volume: number) => tiers.filter((t) => t.minQty <= volume).reduce((best, t) => (t.minQty >= best.minQty ? t : best), { minQty: 0, discountBp: 0 }).discountBp;

const quantityFor = (unit: QuoteUnit, workers: number, months: number) => (unit === 'FLAT' ? 1 : unit === 'MONTH' ? workers * months : workers);

/**
 * Lines and totals of a configuration. `vat`: the invoicing default rate and the small-business flag (§ 19 UStG:
 * no VAT at all). Positions of the same profession are merged; service order follows CONFIGURATOR_SERVICES.
 */
export const priceConfiguration = (
  input: ConfigInput,
  options: Record<ConfiguratorService, ConfigOption[]>,
  vat: { defaultRate: number; smallBusiness: boolean },
  professionName: (key: string) => string = (k) => k,
) => {
  const merged = new Map<string, number>();
  for (const p of input.positions) merged.set(p.profession, Math.min(MAX_WORKERS, (merged.get(p.profession) ?? 0) + p.count));
  const workers = Math.min(MAX_WORKERS, [...merged.values()].reduce((a, n) => a + n, 0));
  const wanted = new Set(input.services);
  const lines: PricedLine[] = [];

  const push = (service: ConfiguratorService, opt: ConfigOption | undefined, quantity: number, profession: string | null) => {
    const priced = !!opt && opt.unitPriceCents !== null;
    const totalCents = priced ? Math.round(quantity * opt!.unitPriceCents!) : null;
    const discountBp = priced ? tierDiscount(opt!.volumeTiers, workers) : 0;
    lines.push({
      service,
      profession,
      catalogueId: opt?.catalogueId ?? null,
      description: opt ? `${opt.name}${profession ? ` – ${professionName(profession)}` : ''}` : '',
      unit: opt?.unit ?? 'PERSON',
      quantity,
      unitPriceCents: priced ? opt!.unitPriceCents : null,
      totalCents,
      discountBp,
      discountCents: totalCents !== null ? Math.round((totalCents * discountBp) / 10000) : 0,
      vatRate: vat.smallBusiness ? null : (opt?.vatRate ?? null),
      onRequest: !priced,
    });
  };

  for (const service of CONFIGURATOR_SERVICES) {
    if (!wanted.has(service)) continue;
    const opts = options[service] ?? [];
    if (service === 'RECRUITMENT') {
      for (const [profession, count] of merged) {
        const opt = opts.find((o) => o.professions.includes(profession)) ?? opts.find((o) => !o.professions.length);
        push(service, opt, count, profession);
      }
      continue;
    }
    const opt = opts[0];
    push(service, opt, opt ? quantityFor(opt.unit, workers, input.months) : workers, null);
  }

  const priced = lines.filter((l) => !l.onRequest);
  const rate = vat.smallBusiness ? 0 : vat.defaultRate;
  const discountCents = priced.reduce((a, l) => a + l.discountCents, 0);
  const totals = computeQuoteTotals(
    priced.map((l) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents!, vatRate: l.vatRate })),
    rate,
    discountCents ? { type: 'AMOUNT', value: discountCents } : { type: 'NONE', value: 0 },
  );
  return { workers, months: input.months, lines, totals, vatRate: rate, onRequest: lines.some((l) => l.onRequest), complete: priced.length === lines.length };
};

export type PricedConfiguration = ReturnType<typeof priceConfiguration>;
