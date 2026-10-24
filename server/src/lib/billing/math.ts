import type { CaseStatus } from '@prisma/client';

/**
 * Client billing (private clients: service fee, translations, apostille, embassy fees …) — the pure part:
 * line categories, VAT, totals, invoice status rules, instalment splitting and trigger matching. Unit tested
 * (tests/unit/clientBillingMath.test.ts); everything with the database lives in service.ts / plans.ts.
 *
 * VAT: every category is taxable at the invoice's rate except EMBASSY_FEE, a fee paid to the embassy in the
 * client's name and passed on unchanged ("durchlaufender Posten", § 10 Abs. 1 Satz 6 UStG): it is part of the
 * invoice total but never of the VAT base (and not revenue in the profitability view either).
 */

export const LINE_CATEGORIES = ['SERVICE_FEE', 'TRANSLATION', 'APOSTILLE', 'EMBASSY_FEE', 'COURIER', 'OTHER'] as const;
export type LineCategory = (typeof LINE_CATEGORIES)[number];
export const PASS_THROUGH: readonly LineCategory[] = ['EMBASSY_FEE'];
export const isPassThrough = (c: LineCategory | null | undefined) => !!c && PASS_THROUGH.includes(c);

export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'] as const;
export type ClientInvoiceStatus = (typeof INVOICE_STATUSES)[number];
/** Statuses with an amount the client still owes. */
export const OPEN_STATUSES: ClientInvoiceStatus[] = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'];

export const PAYMENT_METHODS = ['CASH', 'BANK', 'CARD', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface ClientLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  category: LineCategory;
  /** Leistungszeitraum / Leistungsdatum, stored on every line (YYYY-MM-DD; from = to for one day). */
  servicePeriod?: { from?: string | null; to?: string | null } | null;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const asCategory = (v: unknown): LineCategory => (LINE_CATEGORIES as readonly string[]).includes(String(v)) ? (v as LineCategory) : 'OTHER';

/** Lines stored in ClientInvoice.items, tolerant of malformed rows. */
export const clientLines = (items: unknown): ClientLine[] =>
  Array.isArray(items)
    ? items
        .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object' && !Array.isArray(l))
        .map((l) => ({
          description: String(l.description ?? ''),
          quantity: Number(l.quantity ?? 0) || 0,
          unitPriceCents: Math.round(Number(l.unitPriceCents ?? 0)) || 0,
          category: asCategory(l.category),
          servicePeriod: (l.servicePeriod as ClientLine['servicePeriod']) ?? null,
        }))
    : [];

export const lineTotal = (l: Pick<ClientLine, 'quantity' | 'unitPriceCents'>) => Math.round(l.quantity * l.unitPriceCents);

export interface ClientTotals {
  /** sum of all lines (taxable + pass-through) */
  netCents: number;
  /** VAT base: the taxable lines */
  taxableCents: number;
  /** embassy fees passed on without VAT */
  passThroughCents: number;
  vatCents: number;
  grossCents: number;
}

/** Totals of an invoice: VAT (rounded half up on the whole taxable base) only on taxable lines. */
export const computeClientTotals = (items: Pick<ClientLine, 'quantity' | 'unitPriceCents' | 'category'>[], vatRate: number): ClientTotals => {
  let taxable = 0;
  let pass = 0;
  for (const l of items) {
    if (isPassThrough(l.category)) pass += lineTotal(l);
    else taxable += lineTotal(l);
  }
  const vatCents = Math.round((taxable * vatRate) / 100);
  return { netCents: taxable + pass, taxableCents: taxable, passThroughCents: pass, vatCents, grossCents: taxable + pass + vatCents };
};

/** Revenue of an invoice in the profitability sense: net without pass-through fees, scaled to what was paid. */
export const recognisedRevenue = (inv: { items: unknown; grossCents: number; paidCents: number; vatRate: number }) => {
  if (inv.paidCents <= 0 || inv.grossCents <= 0) return 0;
  const t = computeClientTotals(clientLines(inv.items), inv.vatRate);
  const share = Math.min(1, inv.paidCents / inv.grossCents);
  return Math.round(t.taxableCents * share);
};

/** Due dates are calendar days stored at 12:00 UTC: the invoice is overdue once its due day is over. */
export const isPastDue = (dueDate: Date, now = new Date()) => now.getTime() - 12 * HOUR > dueDate.getTime();

/** Calendar days since the due day (due on the 10th → 3 on the 13th). */
export const daysPastDue = (dueDate: Date, now = new Date()) => Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / DAY));

/**
 * Status of an issued invoice from its amounts and due date. DRAFT and CANCELLED never change here.
 * Paid in full → PAID; past due → OVERDUE (even when partly paid); partly paid → PARTIALLY_PAID; else SENT.
 */
export const deriveStatus = (inv: { status: string; grossCents: number; paidCents: number; dueDate: Date }, now = new Date()): ClientInvoiceStatus => {
  if (inv.status === 'DRAFT' || inv.status === 'CANCELLED') return inv.status;
  if (inv.paidCents >= inv.grossCents) return 'PAID';
  if (isPastDue(inv.dueDate, now)) return 'OVERDUE';
  return inv.paidCents > 0 ? 'PARTIALLY_PAID' : 'SENT';
};

export const openCents = (inv: { status: string; grossCents: number; paidCents: number }) =>
  OPEN_STATUSES.includes(inv.status as ClientInvoiceStatus) ? Math.max(0, inv.grossCents - inv.paidCents) : 0;

/** Yearly invoice number TV-KR-YYYY-NNNN after the highest existing number of that year. */
export const CLIENT_INVOICE_PREFIX = 'TV-KR';
export const formatClientNumber = (year: number, n: number) => `${CLIENT_INVOICE_PREFIX}-${year}-${String(n).padStart(4, '0')}`;
export const nextNumberFrom = (existing: string[], year: number) => {
  const prefix = `${CLIENT_INVOICE_PREFIX}-${year}-`;
  const max = existing.reduce((m, s) => {
    if (!s.startsWith(prefix)) return m;
    const n = Number(s.slice(prefix.length));
    return Number.isInteger(n) && n > m ? n : m;
  }, 0);
  return formatClientNumber(year, max + 1);
};

// ─── Instalment plans ────────────────────────────────────────────────

/** Case statuses in workflow order (a CASE_STATUS trigger also fires when the case jumps past its status). */
export const STATUS_ORDER: CaseStatus[] = [
  'DOCUMENTS_PENDING',
  'DOCUMENTS_REVIEW',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'EMBASSY_DOCUMENTS',
  'EMBASSY_REVIEW',
  'APPOINTMENT_SCHEDULED',
  'DECISION_PENDING',
  'APPROVED',
];

export type Trigger = { kind: 'DATE' } | { kind: 'ON_SIGN' } | { kind: 'CASE_STATUS'; status: CaseStatus };

export const parseTrigger = (raw: string | null | undefined): Trigger | null => {
  if (!raw) return null;
  if (raw === 'DATE') return { kind: 'DATE' };
  if (raw === 'ON_SIGN') return { kind: 'ON_SIGN' };
  const m = /^CASE_STATUS:([A-Z_]+)$/.exec(raw);
  if (m && (STATUS_ORDER as string[]).includes(m[1])) return { kind: 'CASE_STATUS', status: m[1] as CaseStatus };
  return null;
};

export const isValidTrigger = (raw: string) => parseTrigger(raw) !== null;

/** Has a case at `current` reached `target`? REJECTED / CANCELLED reach nothing. */
export const statusReached = (current: CaseStatus, target: CaseStatus) => {
  const c = STATUS_ORDER.indexOf(current);
  const t = STATUS_ORDER.indexOf(target);
  return c >= 0 && t >= 0 && c >= t;
};

/** Does a status change to `to` fire this trigger? ON_SIGN also fires when the case contract is signed. */
export const firesOnStatus = (trigger: string | null | undefined, to: CaseStatus) => {
  const t = parseTrigger(trigger);
  if (!t) return false;
  if (t.kind === 'CASE_STATUS') return statusReached(to, t.status);
  if (t.kind === 'ON_SIGN') return statusReached(to, 'CONTRACT_SIGNED');
  return false;
};

/**
 * Splits a total by percentages in whole cents; the rounding difference goes to the last part so the parts
 * always add up to the total exactly. Percentages are normalised when they do not sum to 100.
 */
export const splitByPercent = (totalCents: number, percents: number[]) => {
  if (!percents.length) return [];
  const sum = percents.reduce((a, p) => a + p, 0);
  if (sum <= 0) return percents.map((_, i) => (i === percents.length - 1 ? totalCents : 0));
  const parts = percents.map((p) => Math.round((totalCents * p) / sum));
  const diff = totalCents - parts.reduce((a, p) => a + p, 0);
  parts[parts.length - 1] += diff;
  return parts;
};
