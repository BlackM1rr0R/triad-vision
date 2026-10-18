/**
 * Split rule of the settlement ledger (Hesablaşmalar), as used in the team's Excel:
 *
 *   net       = payment − partner share (Sanani, converted to the payment currency) − expenses (Rasxod)
 *   Xalid     = net ÷ 3                       (THIRD_OF_NET, whole units, rounded half-up)
 *   Team      = 200 AZN fixed                 (FIXED; deducted from net converted to the payment currency,
 *                                              but owed in its own currency)
 *   Tofig     = Abdulla = (net − Xalid − Team) ÷ 2   (REMAINDER, split equally, whole units rounded down;
 *                                              the leftover unit, if any, is reported as `roundingCents`)
 *
 * Examples (AZN): 3000 → 1000/900/900/200 · 4000 → 1333/1233/1233/200 · 5000 with Rasxod 500 → 1500/1400/1400/200.
 * Mixed: 1500 EUR, Sanani 500 EUR, Team 200 AZN at 1 EUR = 2 AZN → 333/283/283 EUR + 200 AZN.
 *
 * Amounts are integer cents. All functions here are pure (no database).
 */

export type Currency = 'AZN' | 'EUR';
export const CURRENCIES: Currency[] = ['AZN', 'EUR'];
export type ShareStatus = 'PENDING' | 'PAID' | 'NONE';
export type Rule = 'THIRD_OF_NET' | 'PERCENT_OF_NET' | 'FIXED' | 'REMAINDER';

/** Key of the partner (Sanani) payment status inside `SettlementEntry.shares`. */
export const PARTNER_KEY = '_partner';
/** Text marker of a share "rawot": shown as-is, no money share for that row. */
export const RAWOT = 'rawot';

export interface BeneficiaryLike {
  id: string;
  name: string;
  rule: Rule;
  /** FIXED: cents in `currency`; PERCENT_OF_NET: basis points (10000 = 100 %). */
  value: number;
  currency: string | null;
  active: boolean;
  sortOrder: number;
}

/** A share as stored in `SettlementEntry.shares[beneficiaryId]`. */
export interface StoredShare {
  cents?: number | null;
  currency?: string | null;
  status?: ShareStatus;
  text?: string | null;
  manual?: boolean;
  paidAt?: string | null;
}

/** A share as shown: computed, or the stored manual / paid value. */
export interface EffectiveShare {
  cents: number;
  currency: Currency;
  status: ShareStatus;
  text?: string;
  manual?: boolean;
  paidAt?: string | null;
}

export interface EntryAmounts {
  amountCents: number | null;
  currency: string;
  partnerShareCents: number | null;
  partnerShareCurrency: string;
  expensesCents: number | null;
}

export const asCurrency = (c: string | null | undefined, fallback: Currency = 'AZN'): Currency =>
  c === 'EUR' || c === 'AZN' ? c : fallback;

/** `rate` = AZN per 1 EUR. Exact (no rounding): callers round where the rule says so. */
export const convert = (cents: number, from: string, to: string, rate: number) => {
  const f = asCurrency(from);
  const t = asCurrency(to);
  if (f === t) return cents;
  return f === 'EUR' ? cents * rate : cents / rate;
};

const UNIT = 100;
/** Whole currency units, half-up (also for negatives: −2.5 → −3, symmetric). */
export const roundUnitHalfUp = (cents: number) => Math.sign(cents) * Math.round(Math.abs(cents) / UNIT + 1e-9) * UNIT;
/** Whole currency units toward zero. */
export const truncUnit = (cents: number) => Math.sign(cents) * Math.floor(Math.abs(cents) / UNIT + 1e-9) * UNIT;

export interface SplitResult {
  /** Payment − partner share − expenses, in the payment currency (whole cents, unrounded units). */
  netCents: number;
  /** Computed share per beneficiary id. */
  shares: Record<string, { cents: number; currency: Currency }>;
  /** Units the equal REMAINDER split could not divide (payment currency). */
  roundingCents: number;
}

/**
 * Computes the shares of one row; null when there is no payment amount. `fixed` = shares that stick (manual
 * or already paid): they are deducted as they are, so the REMAINDER shares take what is really left
 * (sheet: Xalid typed as 830 of 2500 -> Tofig = Abdulla = 735).
 */
export const computeSplit = (
  entry: EntryAmounts,
  beneficiaries: BeneficiaryLike[],
  rate: number,
  fixed: Record<string, { cents: number; currency: string }> = {},
): SplitResult | null => {
  if (entry.amountCents == null) return null;
  const cur = asCurrency(entry.currency);
  const partner = entry.partnerShareCents ? convert(entry.partnerShareCents, entry.partnerShareCurrency, cur, rate) : 0;
  const net = Math.round(entry.amountCents - partner - (entry.expensesCents ?? 0));
  const active = [...beneficiaries].filter((b) => b.active).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const shares: SplitResult['shares'] = {};
  let deducted = 0;
  const deductFixed = (id: string) => {
    const f = fixed[id]!;
    deducted += asCurrency(f.currency, cur) === cur ? f.cents : roundUnitHalfUp(convert(f.cents, f.currency, cur, rate));
  };
  for (const b of active) {
    if (fixed[b.id] && b.rule !== 'REMAINDER') deductFixed(b.id);
    if (b.rule === 'THIRD_OF_NET') {
      const c = roundUnitHalfUp(net / 3);
      shares[b.id] = { cents: c, currency: cur };
      if (!fixed[b.id]) deducted += c;
    } else if (b.rule === 'PERCENT_OF_NET') {
      const c = roundUnitHalfUp((net * b.value) / 10000);
      shares[b.id] = { cents: c, currency: cur };
      if (!fixed[b.id]) deducted += c;
    } else if (b.rule === 'FIXED') {
      const own = asCurrency(b.currency, cur);
      shares[b.id] = { cents: b.value, currency: own };
      if (!fixed[b.id]) deducted += own === cur ? b.value : roundUnitHalfUp(convert(b.value, own, cur, rate));
    }
  }
  const remainder = active.filter((b) => b.rule === 'REMAINDER');
  for (const b of remainder) if (fixed[b.id]) deductFixed(b.id);
  const rest = remainder.filter((b) => !fixed[b.id]);
  let roundingCents = 0;
  for (const b of remainder) if (fixed[b.id]) shares[b.id] = { cents: fixed[b.id]!.cents, currency: asCurrency(fixed[b.id]!.currency, cur) };
  if (rest.length) {
    const left = net - deducted;
    const each = truncUnit(left / rest.length);
    for (const b of rest) shares[b.id] = { cents: each, currency: cur };
    roundingCents = left - each * rest.length;
  } else {
    roundingCents = net - deducted;
  }
  return { netCents: net, shares, roundingCents };
};

/**
 * What a row shows for one beneficiary: a manual value (incl. "rawot") or a paid share sticks as stored;
 * otherwise the computed value with the stored payment status.
 */
export const effectiveShare = (
  stored: StoredShare | undefined | null,
  computed: { cents: number; currency: Currency } | undefined,
  fallbackCurrency: Currency,
): EffectiveShare | null => {
  const frozen = stored && (stored.manual || (stored.status === 'PAID' && stored.cents != null));
  if (stored && frozen) {
    const out: EffectiveShare = {
      cents: stored.cents ?? 0,
      currency: asCurrency(stored.currency, computed?.currency ?? fallbackCurrency),
      status: stored.text ? 'NONE' : (stored.status ?? 'PENDING'),
    };
    if (stored.text) out.text = stored.text;
    if (stored.manual) out.manual = true;
    if (stored.paidAt) out.paidAt = stored.paidAt;
    return out;
  }
  if (!computed) return null;
  const out: EffectiveShare = { cents: computed.cents, currency: computed.currency, status: stored?.status ?? 'PENDING' };
  if (stored?.paidAt && out.status === 'PAID') out.paidAt = stored.paidAt;
  return out;
};

/** All shares of a row (every active beneficiary, null where nothing applies). */
export const rowShares = (
  entry: EntryAmounts & { shares: unknown },
  beneficiaries: BeneficiaryLike[],
  rate: number,
) => {
  const stored = storedShares(entry.shares);
  const split = computeSplit(entry, beneficiaries, rate, fixedShares(stored, asCurrency(entry.currency)));
  const cur = asCurrency(entry.currency);
  const shares: Record<string, EffectiveShare | null> = {};
  for (const b of beneficiaries) {
    if (!b.active) continue;
    shares[b.id] = effectiveShare(stored[b.id], split?.shares[b.id], cur);
  }
  return { shares, netCents: split?.netCents ?? null, roundingCents: split?.roundingCents ?? 0 };
};

/** Stored shares that stick (manual or paid with a frozen amount), for `computeSplit`. */
export const fixedShares = (stored: Record<string, StoredShare>, fallback: Currency) => {
  const out: Record<string, { cents: number; currency: string }> = {};
  for (const [k, s] of Object.entries(stored)) {
    if (k.startsWith('_')) continue;
    // "rawot" is left out: that beneficiary gets no money here, the others keep their rule-based share.
    if (s.text) continue;
    if (s.manual || (s.status === 'PAID' && s.cents != null)) out[k] = { cents: s.cents ?? 0, currency: s.currency ?? fallback };
  }
  return out;
};

export const storedShares = (raw: unknown): Record<string, StoredShare> =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, StoredShare>) : {};

/** Adds cents to a per-currency bag. */
export const addTo = (bag: Partial<Record<Currency, number>>, currency: string, cents: number | null | undefined) => {
  if (!cents) return;
  const c = asCurrency(currency);
  bag[c] = (bag[c] ?? 0) + cents;
};
