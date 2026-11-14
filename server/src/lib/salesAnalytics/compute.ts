import { clientLines, lineTotal, type LineCategory } from '../billing/math.js';
import { monthOf } from '../kpi/compute.js';
import { bakuMidnight, bakuParts } from '../reports/dates.js';

/**
 * Pure maths of the revenue & sales dashboard "Gəlir və satış" (no database access, unit tested in
 * tests/unit/salesAnalytics.test.ts). Months are Baku calendar months ("2026-10"), like the other analytics.
 *
 * Lead sources (the five buckets of the dashboard), first matching rule wins:
 *
 *   inquiries   partner   came with a referral partner's link (partnerId) or was registered by an agent (agentId)
 *               campaign  marketing traffic: any UTM tag, a campaign landing page (landingPageId / "landing:…"),
 *                         an info-session registration ("event:…") or a campaign form ("campaign:…")
 *               website   any other form of the public site: a tracked visitor (visitorId), a named form source
 *                         ("cost-calculator", "ebook:…", "package:…", call-back forms) or the live chat
 *               direct    nothing known: e-mail / WhatsApp / phone leads created by the team or the inbox
 *   signups     client accounts registered in the period that no inquiry was converted into:
 *               referral  signed up with another client's referral code (ClientReferral)
 *               partner   owned by a referral partner (ownerPartnerId) or referred by an agent
 *               website   everything else (the account was created on the site)
 */

export const LEAD_SOURCES = ['website', 'partner', 'referral', 'campaign', 'direct'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface InquiryAttribution {
  partnerId: string | null;
  agentId: string | null;
  source: string | null;
  landingPageId: string | null;
  utm: unknown;
  visitorId: string | null;
  sector?: string | null;
}

const hasUtm = (utm: unknown) =>
  !!utm && typeof utm === 'object' && !Array.isArray(utm) && Object.values(utm as Record<string, unknown>).some((v) => typeof v === 'string' && v.trim() !== '');

const CAMPAIGN_PREFIXES = ['landing:', 'event:', 'campaign:'];

export const inquiryLeadSource = (i: InquiryAttribution): LeadSource => {
  if (i.partnerId || i.agentId) return 'partner';
  const source = i.source?.trim().toLowerCase() ?? '';
  if (hasUtm(i.utm) || i.landingPageId || CAMPAIGN_PREFIXES.some((p) => source.startsWith(p))) return 'campaign';
  if (source.startsWith('referral')) return 'referral';
  if (i.visitorId || source || i.sector === 'Live chat') return 'website';
  return 'direct';
};

export const signupLeadSource = (u: { referredByClient: boolean; ownerPartnerId: string | null; referredByAgentId: string | null }): LeadSource => {
  if (u.referredByClient) return 'referral';
  if (u.ownerPartnerId || u.referredByAgentId) return 'partner';
  return 'website';
};

// ─── Periods ────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

/** The period of the same length right before [start, end). */
export const previousWindow = (start: Date, end: Date) => ({ start: new Date(start.getTime() - (end.getTime() - start.getTime())), end: start });

export const pctChange = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
export const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

const inWin = (d: Date, w: { start: Date; end: Date }) => d >= w.start && d < w.end;

// ─── Revenue ────────────────────────────────────────────────────────────

export interface MoneyRow {
  at: Date;
  cents: number;
}

/** Paid revenue per month of `months` (company invoices and client payments apart). */
export const revenueByMonth = (months: string[], invoices: MoneyRow[], payments: MoneyRow[]) => {
  const idx = new Map(months.map((m, i) => [m, i]));
  const inv = months.map(() => 0);
  const pay = months.map(() => 0);
  for (const r of invoices) {
    const i = idx.get(monthOf(r.at));
    if (i !== undefined) inv[i] += r.cents;
  }
  for (const r of payments) {
    const i = idx.get(monthOf(r.at));
    if (i !== undefined) pay[i] += r.cents;
  }
  return { invoices: inv, payments: pay, total: inv.map((v, i) => v + pay[i]) };
};

export const sumIn = (rows: MoneyRow[], w: { start: Date; end: Date }) => rows.reduce((a, r) => (inWin(r.at, w) ? a + r.cents : a), 0);

// ─── Revenue by package / service ───────────────────────────────────────

/** Bucket keys: `package:<id>`, `category:<LineCategory>`, `employer` (company invoices), `other`. */
export type ServiceKey = `package:${string}` | `category:${LineCategory}` | 'employer' | 'other';

export interface PaymentForService {
  cents: number;
  /** The package ordered with the invoice (invoice.orderId or its plan's orderId → PackageOrder.packageId). */
  packageId: string | null;
  /** The paid invoice's lines (null: payment without an invoice). */
  items: unknown | null;
}

/**
 * Splits one payment over services: a package order takes all of it; otherwise the invoice lines share it in
 * proportion to their totals (rounding remainder on the biggest line); no invoice / no lines → "other".
 */
export const allocatePayment = (p: PaymentForService): { key: ServiceKey; cents: number }[] => {
  if (p.packageId) return [{ key: `package:${p.packageId}`, cents: p.cents }];
  const perCat = new Map<LineCategory, number>();
  for (const l of clientLines(p.items)) {
    const v = lineTotal(l);
    if (v > 0) perCat.set(l.category, (perCat.get(l.category) ?? 0) + v);
  }
  const total = [...perCat.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return [{ key: 'other', cents: p.cents }];
  const parts = [...perCat.entries()].sort((a, b) => b[1] - a[1]).map(([cat, v]) => ({ key: `category:${cat}` as ServiceKey, cents: Math.floor((p.cents * v) / total) }));
  parts[0].cents += p.cents - parts.reduce((a, x) => a + x.cents, 0);
  return parts.filter((x) => x.cents !== 0);
};

/** Revenue per service for the current and the previous period, biggest first. */
export const serviceRows = (cur: { key: ServiceKey; cents: number }[], prev: { key: ServiceKey; cents: number }[]) => {
  const c = new Map<ServiceKey, number>();
  const p = new Map<ServiceKey, number>();
  for (const x of cur) c.set(x.key, (c.get(x.key) ?? 0) + x.cents);
  for (const x of prev) p.set(x.key, (p.get(x.key) ?? 0) + x.cents);
  const total = [...c.values()].reduce((a, b) => a + b, 0);
  return [...new Set([...c.keys(), ...p.keys()])]
    .map((key) => ({ key, cents: c.get(key) ?? 0, prevCents: p.get(key) ?? 0, share: rate(c.get(key) ?? 0, total), delta: pctChange(c.get(key) ?? 0, p.get(key) ?? 0) }))
    .sort((a, b) => b.cents - a.cents || b.prevCents - a.prevCents || a.key.localeCompare(b.key));
};

// ─── Expected payments and overdue ──────────────────────────────────────

export type DueKind = 'client' | 'company' | 'installment';
export interface DueRow {
  kind: DueKind;
  due: Date;
  cents: number;
}

/** The current Baku month and the `n - 1` after it. */
export const nextMonths = (now: Date, n = 6) => {
  const p = bakuParts(now);
  return Array.from({ length: n }, (_, i) => monthOf(bakuMidnight(p.y, p.m + i, 1)));
};

/** A row is overdue from the day after its due date (same rule as the overview's receivables). */
export const isOverdue = (due: Date, now: Date) => now.getTime() - due.getTime() >= DAY;

/**
 * Money still to come by due month (overdue rows are left out: they are in `overdue`), per kind, plus what is
 * due after the horizon ("later") and the overdue total.
 */
export const expectedPayments = (rows: DueRow[], now: Date, n = 6) => {
  const months = nextMonths(now, n);
  const idx = new Map(months.map((m, i) => [m, i]));
  const empty = () => ({ client: 0, company: 0, installment: 0 }) as Record<DueKind, number>;
  const buckets = months.map(() => empty());
  const later = empty();
  const overdue = { cents: 0, count: 0 };
  for (const r of rows) {
    if (r.cents <= 0) continue;
    if (isOverdue(r.due, now)) {
      overdue.cents += r.cents;
      overdue.count++;
      continue;
    }
    const i = idx.get(monthOf(r.due));
    // Not overdue but before the current month cannot happen; anything past the horizon is "later".
    if (i === undefined) later[r.kind] += r.cents;
    else buckets[i][r.kind] += r.cents;
  }
  const total = (b: Record<DueKind, number>) => b.client + b.company + b.installment;
  return {
    months: months.map((month, i) => ({ month, ...buckets[i], total: total(buckets[i]) })),
    later: { ...later, total: total(later) },
    upcomingCents: buckets.reduce((a, b) => a + total(b), 0),
    overdue,
  };
};

export const daysOverdue = (due: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - due.getTime()) / DAY));

// ─── Leads and funnel ───────────────────────────────────────────────────

export interface Lead {
  source: LeadSource;
  at: Date;
  /** The client account of the lead (converted inquiry or the signup itself); null while it has none. */
  clientId: string | null;
}

export const FUNNEL_STEPS = ['leads', 'clients', 'cases', 'approved'] as const;
export type SalesFunnelStep = (typeof FUNNEL_STEPS)[number];

/**
 * Cohort funnel: the leads of a window followed up to now — lead → client account → case opened → visa
 * approved. `rate` is the conversion from the step before, `ofFirst` from the leads.
 */
export const salesFunnel = (leads: Lead[], withCase: ReadonlySet<string>, approved: ReadonlySet<string>) => {
  // One client counts once per step even when several leads point at it.
  const clients = new Set<string>();
  for (const l of leads) if (l.clientId) clients.add(l.clientId);
  const counts = [leads.length, clients.size, [...clients].filter((c) => withCase.has(c)).length, [...clients].filter((c) => approved.has(c)).length];
  return FUNNEL_STEPS.map((key, i) => ({ key, count: counts[i], rate: i === 0 ? null : rate(counts[i], counts[i - 1]), ofFirst: i === 0 ? null : rate(counts[i], counts[0]) }));
};

/** Leads per source in both windows, with the share of the current window and the conversion to a client. */
export const leadSourceRows = (cur: Lead[], prev: Lead[], approved: ReadonlySet<string>) =>
  LEAD_SOURCES.map((source) => {
    const c = cur.filter((l) => l.source === source);
    const clients = new Set(c.map((l) => l.clientId).filter((x): x is string => !!x));
    return {
      source,
      count: c.length,
      prev: prev.filter((l) => l.source === source).length,
      share: rate(c.length, cur.length),
      clients: clients.size,
      clientRate: rate(clients.size, c.length),
      approved: [...clients].filter((x) => approved.has(x)).length,
      delta: pctChange(c.length, prev.filter((l) => l.source === source).length),
    };
  });

/** Leads per month of `months`, per source. */
export const leadsByMonth = (months: string[], leads: Lead[]) => {
  const idx = new Map(months.map((m, i) => [m, i]));
  const rows = Object.fromEntries(LEAD_SOURCES.map((s) => [s, months.map(() => 0)])) as Record<LeadSource, number[]>;
  for (const l of leads) {
    const i = idx.get(monthOf(l.at));
    if (i !== undefined) rows[l.source][i]++;
  }
  return rows;
};

// ─── Partners ───────────────────────────────────────────────────────────

export interface PartnerPayment {
  partnerId: string | null;
  clientId: string;
  cents: number;
}

/** Referral partners by revenue (payments of their clients), with the previous period and commission. */
export const partnerRows = (cur: PartnerPayment[], prev: PartnerPayment[], commissions: Map<string, number>, limit = 10) => {
  const agg = new Map<string, { revenue: number; prev: number; clients: Set<string>; payments: number }>();
  const get = (id: string) => {
    let a = agg.get(id);
    if (!a) agg.set(id, (a = { revenue: 0, prev: 0, clients: new Set(), payments: 0 }));
    return a;
  };
  for (const p of cur) {
    if (!p.partnerId) continue;
    const a = get(p.partnerId);
    a.revenue += p.cents;
    a.payments++;
    a.clients.add(p.clientId);
  }
  for (const p of prev) if (p.partnerId) get(p.partnerId).prev += p.cents;
  for (const id of commissions.keys()) get(id);
  const total = cur.reduce((a, p) => a + p.cents, 0);
  return [...agg.entries()]
    .map(([id, a]) => ({
      id,
      revenueCents: a.revenue,
      prevRevenueCents: a.prev,
      delta: pctChange(a.revenue, a.prev),
      share: rate(a.revenue, total),
      clients: a.clients.size,
      payments: a.payments,
      commissionCents: commissions.get(id) ?? 0,
    }))
    .filter((r) => r.revenueCents > 0 || r.prevRevenueCents > 0 || r.commissionCents > 0)
    .sort((a, b) => b.revenueCents - a.revenueCents || b.prevRevenueCents - a.prevRevenueCents || a.id.localeCompare(b.id))
    .slice(0, limit);
};
