import type { CaseStatus, Prisma, VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest } from '../http.js';
import { l10nTitle } from '../expiry/index.js';
import { loadRows, stageFromCase } from '../settlement/service.js';
import { addTo, asCurrency, computeSplit, convert, storedShares, type Currency } from '../settlement/split.js';
import { normaliseName } from '../settlement/parse.js';

/**
 * Safe, parameterised analytics for the super-admin assistant (`report_query`) and the settlement anomaly
 * finder (`settlement_anomalies`). No free SQL: a fixed list of metrics, group-bys and filters, each mapped to
 * Prisma queries; results are small tables (≤ 50 rows) with totals. Money is in whole units per currency.
 */

export const METRICS = [
  'cases',
  'approvals',
  'refusals',
  'decisions',
  'avg_days_per_step',
  'documents',
  'invoices',
  'payments',
  'settlements',
  'partner_commissions',
  'ai_spend',
] as const;
export type Metric = (typeof METRICS)[number];

export const GROUP_BYS = ['none', 'status', 'visaType', 'category', 'partner', 'staff', 'month', 'stage', 'beneficiary', 'project', 'scope', 'user'] as const;
export type GroupBy = (typeof GROUP_BYS)[number];

/** Allowed group-bys per metric (first = default). */
export const METRIC_GROUPS: Record<Metric, GroupBy[]> = {
  cases: ['status', 'visaType', 'category', 'partner', 'staff', 'month', 'none'],
  approvals: ['month', 'visaType', 'category', 'partner', 'staff', 'none'],
  refusals: ['month', 'visaType', 'category', 'partner', 'staff', 'none'],
  decisions: ['month', 'visaType', 'category', 'partner', 'staff', 'none'],
  avg_days_per_step: ['status'],
  documents: ['status', 'stage', 'month', 'staff', 'partner', 'none'],
  invoices: ['month', 'status', 'none'],
  payments: ['month', 'none'],
  settlements: ['beneficiary', 'partner', 'stage', 'month', 'project', 'none'],
  partner_commissions: ['partner', 'status', 'month', 'none'],
  ai_spend: ['month', 'scope', 'user', 'none'],
};

export interface ReportFilters {
  from?: string; // YYYY-MM-DD (inclusive)
  to?: string; // YYYY-MM-DD (inclusive)
  partnerId?: string;
  staffId?: string;
  visaType?: VisaType;
  project?: string;
  paid?: 'paid' | 'unpaid' | 'all';
}

export interface ReportResult {
  metric: Metric;
  groupBy: GroupBy;
  rows: Record<string, unknown>[];
  totals: Record<string, unknown>;
  truncated?: boolean;
  note?: string;
}

type Bag = Partial<Record<Currency | string, number>>;
const units = (b: Bag) => Object.fromEntries(Object.entries(b).filter(([, v]) => !!v).map(([c, v]) => [c, Math.round(v!) / 100]));
const addBag = (b: Bag, c: string, cents: number | null | undefined) => {
  if (!cents) return;
  b[c] = (b[c] ?? 0) + cents;
};
const month = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 7) : '—');
const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '—');
const MAX_ROWS = 50;

const range = (f: ReportFilters): Prisma.DateTimeFilter | undefined => {
  if (!f.from && !f.to) return undefined;
  const r: Prisma.DateTimeFilter = {};
  if (f.from) r.gte = new Date(`${f.from}T00:00:00Z`);
  if (f.to) r.lt = new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000);
  return r;
};
const monthIn = (m: string, f: ReportFilters) => (!f.from || m >= f.from.slice(0, 7)) && (!f.to || m <= f.to.slice(0, 7));

const caseWhere = (f: ReportFilters, dateField?: 'createdAt' | 'decisionAt'): Prisma.CaseWhereInput => ({
  ...(f.partnerId ? { partnerId: f.partnerId } : {}),
  ...(f.staffId ? { assignedStaffId: f.staffId } : {}),
  ...(f.visaType ? { visaType: f.visaType } : {}),
  ...(dateField && range(f) ? { [dateField]: range(f) } : {}),
});

/** Groups items by a key, then turns each group into a row; sorted by `sort` (desc) and cut to 50 rows. */
const grouped = <T>(items: T[], keyOf: (x: T) => string, row: (key: string, xs: T[]) => Record<string, unknown>, sortBy: 'key' | string = 'count') => {
  const map = new Map<string, T[]>();
  for (const x of items) {
    const k = keyOf(x);
    map.set(k, [...(map.get(k) ?? []), x]);
  }
  let rows = [...map.entries()].map(([k, xs]) => row(k, xs));
  rows = sortBy === 'key' ? rows.sort((a, b) => String(a.key).localeCompare(String(b.key))) : rows.sort((a, b) => Number(b[sortBy] ?? 0) - Number(a[sortBy] ?? 0));
  return { rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
};

type CaseRow = {
  status: CaseStatus;
  visaType: VisaType;
  createdAt: Date;
  decisionAt: Date | null;
  visaCategory: { title: unknown } | null;
  partner: { name: string } | null;
  assignedStaff: { firstName: string; lastName: string } | null;
};
const CASE_SELECT = {
  status: true,
  visaType: true,
  createdAt: true,
  decisionAt: true,
  visaCategory: { select: { title: true } },
  partner: { select: { name: true } },
  assignedStaff: { select: { firstName: true, lastName: true } },
} as const;

const caseKey = (g: GroupBy, dateOf: (c: CaseRow) => Date | null) => (c: CaseRow): string => {
  switch (g) {
    case 'status':
      return c.status;
    case 'visaType':
      return c.visaType;
    case 'category':
      return c.visaCategory ? l10nTitle(c.visaCategory.title, 'az') || '—' : '—';
    case 'partner':
      return c.partner?.name ?? '—';
    case 'staff':
      return fullName(c.assignedStaff);
    case 'month':
      return month(dateOf(c));
    default:
      return 'all';
  }
};

export const runReport = async (metric: Metric, groupByIn: GroupBy | undefined, f: ReportFilters): Promise<ReportResult> => {
  const allowed = METRIC_GROUPS[metric];
  const groupBy = groupByIn ?? allowed[0];
  if (!allowed.includes(groupBy)) throw badRequest(`GROUP_BY_NOT_SUPPORTED: ${metric} supports ${allowed.join(', ')}`);
  const sortKey = groupBy === 'month' ? 'key' : 'count';

  if (metric === 'cases') {
    const cases = await prisma.case.findMany({ where: caseWhere(f, 'createdAt'), select: CASE_SELECT, take: 20000 });
    const g = grouped(cases, caseKey(groupBy, (c) => c.createdAt), (key, xs) => ({ key, count: xs.length, open: xs.filter((c) => !['APPROVED', 'REJECTED', 'CANCELLED'].includes(c.status)).length, approved: xs.filter((c) => c.status === 'APPROVED').length, refused: xs.filter((c) => c.status === 'REJECTED').length }), sortKey);
    return { metric, groupBy, ...g, totals: { count: cases.length, approved: cases.filter((c) => c.status === 'APPROVED').length, refused: cases.filter((c) => c.status === 'REJECTED').length } };
  }

  if (metric === 'approvals' || metric === 'refusals' || metric === 'decisions') {
    const statuses: CaseStatus[] = metric === 'approvals' ? ['APPROVED'] : metric === 'refusals' ? ['REJECTED'] : ['APPROVED', 'REJECTED'];
    const cases = await prisma.case.findMany({ where: { ...caseWhere(f, 'decisionAt'), status: { in: statuses }, decisionAt: range(f) ?? { not: null } }, select: CASE_SELECT, take: 20000 });
    const g = grouped(
      cases,
      caseKey(groupBy, (c) => c.decisionAt),
      (key, xs) => {
        const approved = xs.filter((c) => c.status === 'APPROVED').length;
        const refused = xs.length - approved;
        const days = xs.map((c) => (c.decisionAt!.getTime() - c.createdAt.getTime()) / 86_400_000);
        return { key, count: xs.length, ...(metric === 'decisions' ? { approved, refused, approvalRatePct: Math.round((approved / xs.length) * 100) } : {}), avgDaysToDecision: Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 };
      },
      sortKey,
    );
    const approved = cases.filter((c) => c.status === 'APPROVED').length;
    return { metric, groupBy, ...g, totals: { count: cases.length, ...(metric === 'decisions' ? { approved, refused: cases.length - approved } : {}) } };
  }

  if (metric === 'avg_days_per_step') {
    const cases = await prisma.case.findMany({
      where: caseWhere(f, 'createdAt'),
      select: { status: true, createdAt: true, closedAt: true, events: { where: { toStatus: { not: null } }, orderBy: { createdAt: 'asc' }, select: { toStatus: true, createdAt: true } } },
      take: 5000,
    });
    const spans = new Map<string, number[]>();
    const now = Date.now();
    for (const c of cases) {
      const ev = c.events;
      for (let i = 0; i < ev.length; i++) {
        const st = ev[i].toStatus!;
        if (['APPROVED', 'REJECTED', 'CANCELLED'].includes(st)) continue;
        const end = ev[i + 1]?.createdAt.getTime() ?? (c.status === st ? now : null);
        if (end == null) continue;
        spans.set(st, [...(spans.get(st) ?? []), (end - ev[i].createdAt.getTime()) / 86_400_000]);
      }
    }
    const order: CaseStatus[] = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'];
    const rows = order.filter((s) => spans.has(s)).map((s) => {
      const xs = spans.get(s)!;
      return { key: s, cases: xs.length, avgDays: Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10, maxDays: Math.round(Math.max(...xs) * 10) / 10 };
    });
    return { metric, groupBy, rows, totals: { cases: cases.length }, note: 'Days spent in each status (the current status counts until now).' };
  }

  if (metric === 'documents') {
    const docs = await prisma.document.findMany({
      where: { ...(range(f) ? { createdAt: range(f) } : {}), case: caseWhere(f) },
      select: { status: true, stage: true, createdAt: true, case: { select: { partner: { select: { name: true } }, assignedStaff: { select: { firstName: true, lastName: true } } } } },
      take: 50000,
    });
    const key = (d: (typeof docs)[number]) =>
      groupBy === 'status' ? d.status : groupBy === 'stage' ? d.stage : groupBy === 'month' ? month(d.createdAt) : groupBy === 'staff' ? fullName(d.case.assignedStaff) : groupBy === 'partner' ? (d.case.partner?.name ?? '—') : 'all';
    const g = grouped(docs, key, (k, xs) => ({ key: k, count: xs.length, pending: xs.filter((d) => d.status === 'PENDING').length, accepted: xs.filter((d) => d.status === 'ACCEPTED').length, rejected: xs.filter((d) => d.status === 'REJECTED').length }), sortKey);
    return { metric, groupBy, ...g, totals: { count: docs.length } };
  }

  if (metric === 'invoices' || metric === 'payments') {
    const where: Prisma.InvoiceWhereInput =
      metric === 'payments' ? { status: 'PAID', ...(range(f) ? { paidAt: range(f) } : {}) } : { status: { not: 'CANCELLED' }, ...(range(f) ? { issueDate: range(f) } : {}) };
    const inv = await prisma.invoice.findMany({ where, select: { status: true, issueDate: true, paidAt: true, currency: true, netCents: true, grossCents: true }, take: 20000 });
    const key = (i: (typeof inv)[number]) => (groupBy === 'status' ? i.status : groupBy === 'month' ? month(metric === 'payments' ? i.paidAt : i.issueDate) : 'all');
    const sum = (xs: typeof inv) => {
      const gross: Bag = {};
      const net: Bag = {};
      for (const i of xs) {
        addBag(gross, i.currency, i.grossCents);
        addBag(net, i.currency, i.netCents);
      }
      return { gross: units(gross), net: units(net) };
    };
    const g = grouped(inv, key, (k, xs) => ({ key: k, count: xs.length, ...sum(xs), ...(metric === 'invoices' ? { paid: xs.filter((i) => i.status === 'PAID').length, open: xs.filter((i) => i.status === 'SENT' || i.status === 'OVERDUE').length } : {}) }), sortKey);
    return { metric, groupBy, ...g, totals: { count: inv.length, ...sum(inv) }, note: 'Company invoices (employers); client payments of the settlement ledger are in the "settlements" metric.' };
  }

  if (metric === 'settlements') {
    const { rows: all, beneficiaries } = await loadRows({ project: f.project, partnerId: f.partnerId });
    let rows = all.filter((r) => monthIn(r.month, f));
    if (f.staffId || f.visaType) {
      // Only rows linked to a case of that staff member / visa type.
      const ids = new Set((await prisma.case.findMany({ where: caseWhere(f), select: { id: true } })).map((c) => c.id));
      rows = rows.filter((r) => r.caseId && ids.has(r.caseId));
    }
    const partners = new Map((await prisma.referralPartner.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]));
    const wantPaid = f.paid ?? 'all';
    const bens = beneficiaries.filter((b) => b.active);

    if (groupBy === 'beneficiary') {
      const out = bens.map((b) => {
        const pending: Bag = {};
        const paid: Bag = {};
        let clients = 0;
        for (const r of rows) {
          const s = r.shares[b.id];
          if (!s || s.status === 'NONE' || !s.cents) continue;
          clients++;
          addTo(s.status === 'PAID' ? paid : pending, s.currency, s.cents);
        }
        return { key: b.name, clients, ...(wantPaid !== 'paid' ? { unpaid: units(pending) } : {}), ...(wantPaid !== 'unpaid' ? { paid: units(paid) } : {}) };
      });
      const pp: Bag = {};
      const pPaid: Bag = {};
      for (const r of rows) if (r.partnerShareCents && r.partnerId) addTo(r.partnerPaid ? pPaid : pp, r.partnerShareCurrency, r.partnerShareCents);
      out.push({ key: 'Partner share', clients: rows.filter((r) => r.partnerShareCents && r.partnerId).length, ...(wantPaid !== 'paid' ? { unpaid: units(pp) } : {}), ...(wantPaid !== 'unpaid' ? { paid: units(pPaid) } : {}) });
      const amount: Bag = {};
      const received: Bag = {};
      for (const r of rows) {
        addTo(amount, r.currency, r.amountCents);
        addTo(received, r.currency, r.paidCents);
      }
      return { metric, groupBy, rows: out, totals: { clients: rows.length, visa: rows.filter((r) => r.stage === 'VISA').length, refused: rows.filter((r) => r.stage === 'REFUSED').length, agreed: units(amount), received: units(received) } };
    }

    const key = (r: (typeof rows)[number]) =>
      groupBy === 'partner' ? (r.partnerId ? (partners.get(r.partnerId) ?? '—') : '—') : groupBy === 'stage' ? r.stage : groupBy === 'month' ? r.month : groupBy === 'project' ? r.project : 'all';
    const sum = (xs: typeof rows) => {
      const amount: Bag = {};
      const received: Bag = {};
      const sharesUnpaid: Bag = {};
      const sharesPaid: Bag = {};
      const partnerUnpaid: Bag = {};
      const partnerPaid: Bag = {};
      for (const r of xs) {
        addTo(amount, r.currency, r.amountCents);
        addTo(received, r.currency, r.paidCents);
        if (r.partnerShareCents && r.partnerId) addTo(r.partnerPaid ? partnerPaid : partnerUnpaid, r.partnerShareCurrency, r.partnerShareCents);
        for (const s of Object.values(r.shares)) if (s && s.status !== 'NONE' && s.cents) addTo(s.status === 'PAID' ? sharesPaid : sharesUnpaid, s.currency, s.cents);
      }
      return {
        agreed: units(amount),
        received: units(received),
        ...(wantPaid !== 'paid' ? { sharesUnpaid: units(sharesUnpaid), partnerUnpaid: units(partnerUnpaid) } : {}),
        ...(wantPaid !== 'unpaid' ? { sharesPaid: units(sharesPaid), partnerPaid: units(partnerPaid) } : {}),
      };
    };
    const g = grouped(rows, key, (k, xs) => ({ key: k, count: xs.length, visa: xs.filter((r) => r.stage === 'VISA').length, refused: xs.filter((r) => r.stage === 'REFUSED').length, ...sum(xs) }), sortKey);
    return { metric, groupBy, ...g, totals: { count: rows.length, visa: rows.filter((r) => r.stage === 'VISA').length, ...sum(rows) } };
  }

  if (metric === 'partner_commissions') {
    const status = f.paid === 'paid' ? { status: 'PAID' as const } : f.paid === 'unpaid' ? { status: { in: ['PENDING' as const, 'APPROVED' as const] } } : {};
    const items = await prisma.partnerCommission.findMany({
      where: { ...(f.partnerId ? { partnerId: f.partnerId } : {}), ...(range(f) ? { createdAt: range(f) } : {}), ...status },
      select: { status: true, amountCents: true, currency: true, createdAt: true, partner: { select: { name: true } } },
      take: 20000,
    });
    const key = (c: (typeof items)[number]) => (groupBy === 'partner' ? c.partner.name : groupBy === 'status' ? c.status : groupBy === 'month' ? month(c.createdAt) : 'all');
    const sum = (xs: typeof items) => {
      const open: Bag = {};
      const paid: Bag = {};
      for (const c of xs) if (c.status !== 'CANCELLED') addBag(c.status === 'PAID' ? paid : open, c.currency, c.amountCents);
      return { open: units(open), paid: units(paid) };
    };
    const g = grouped(items, key, (k, xs) => ({ key: k, count: xs.length, ...sum(xs) }), sortKey);
    return { metric, groupBy, ...g, totals: { count: items.length, ...sum(items) } };
  }

  // ai_spend
  const msgs = await prisma.aiMessage.findMany({
    where: { costMicros: { gt: 0 }, ...(range(f) ? { createdAt: range(f) } : {}) },
    select: { costMicros: true, createdAt: true, conversation: { select: { scope: true, user: { select: { firstName: true, lastName: true } } } } },
    take: 100000,
  });
  const key = (m: (typeof msgs)[number]) => (groupBy === 'month' ? month(m.createdAt) : groupBy === 'scope' ? m.conversation.scope : groupBy === 'user' ? fullName(m.conversation.user) : 'all');
  const usd = (xs: typeof msgs) => Math.round(xs.reduce((a, m) => a + m.costMicros, 0) / 1e4) / 100;
  const g = grouped(msgs, key, (k, xs) => ({ key: k, calls: xs.length, usd: usd(xs) }), groupBy === 'month' ? 'key' : 'usd');
  return { metric, groupBy, ...g, totals: { calls: msgs.length, usd: usd(msgs) } };
};

// ─── Settlement anomalies ───────────────────────────────────────────────

export type AnomalyType = 'OVER_ALLOCATED' | 'RULE_MISMATCH' | 'SHARES_WITHOUT_PAYMENT' | 'REFUSED_BUT_PAID' | 'DUPLICATE_CLIENT' | 'CASE_STAGE_MISMATCH';

export interface Anomaly {
  id: string;
  project: string;
  client: string;
  case: string | null;
  type: AnomalyType;
  detail: string;
}

const fmt = (cents: number, c: string) => `${Math.round(cents) / 100} ${c}`;

/**
 * Rows of the ledger that do not follow the split rule or contradict their case:
 *   OVER_ALLOCATED          shares + partner share + expenses exceed the payment
 *   RULE_MISMATCH           a share differs from the rule's value by more than the tolerance
 *   SHARES_WITHOUT_PAYMENT  no payment amount, but shares are set or marked paid
 *   REFUSED_BUT_PAID        refused / cancelled (row or linked case), but shares or the partner share are paid
 *   DUPLICATE_CLIENT        the same client name appears more than once (e.g. in two projects)
 *   CASE_STAGE_MISMATCH     the linked case's status implies another stage than the row has
 */
export const findSettlementAnomalies = async (opts: { project?: string; toleranceUnits?: number; types?: AnomalyType[] } = {}) => {
  const tolerance = Math.max(0, opts.toleranceUnits ?? 5) * 100;
  const { rows, beneficiaries, eurAzn } = await loadRows({ project: opts.project });
  const entries = await prisma.settlementEntry.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, shares: true } });
  const storedById = new Map(entries.map((e) => [e.id, storedShares(e.shares)]));
  const caseStatus = new Map(
    (await prisma.case.findMany({ where: { id: { in: rows.map((r) => r.caseId).filter((x): x is string => !!x) } }, select: { id: true, status: true } })).map((c) => [c.id, c.status]),
  );
  const bens = beneficiaries.filter((b) => b.active);
  const benName = new Map(bens.map((b) => [b.id, b.name]));
  const out: Anomaly[] = [];
  const push = (r: (typeof rows)[number], type: AnomalyType, detail: string) => out.push({ id: r.id, project: r.project, client: r.clientName, case: r.case?.number ?? null, type, detail });

  for (const r of rows) {
    const cur = asCurrency(r.currency);
    const stored = storedById.get(r.id) ?? {};
    const shareList = Object.entries(r.shares).filter(([, s]) => s && s.status !== 'NONE' && s.cents) as [string, NonNullable<(typeof r.shares)[string]>][];

    if (r.amountCents) {
      const sharesSum = shareList.reduce((a, [, s]) => a + convert(s.cents, s.currency, cur, eurAzn), 0);
      const partner = r.partnerShareCents ? convert(r.partnerShareCents, r.partnerShareCurrency, cur, eurAzn) : 0;
      const total = sharesSum + partner + (r.expensesCents ?? 0);
      if (total > r.amountCents + 100) push(r, 'OVER_ALLOCATED', `shares ${fmt(sharesSum, cur)} + partner ${fmt(partner, cur)} + expenses ${fmt(r.expensesCents ?? 0, cur)} = ${fmt(total, cur)} > payment ${fmt(r.amountCents, cur)}`);

      const rule = computeSplit(r, bens, eurAzn);
      if (rule) {
        const diffs: string[] = [];
        for (const [id, s] of shareList) {
          const expected = rule.shares[id];
          if (!expected) continue;
          const actual = convert(s.cents, s.currency, expected.currency, eurAzn);
          const tol = Math.max(tolerance, Math.abs(expected.cents) * 0.05);
          if (Math.abs(actual - expected.cents) > tol) diffs.push(`${benName.get(id) ?? id}: ${fmt(s.cents, s.currency)} (rule ${fmt(expected.cents, expected.currency)})`);
        }
        if (diffs.length) push(r, 'RULE_MISMATCH', diffs.join('; '));
      }
    } else {
      const set = Object.entries(stored).filter(([k, s]) => !k.startsWith('_') && !s.text && ((s.cents ?? 0) > 0 || s.status === 'PAID'));
      if (set.length) push(r, 'SHARES_WITHOUT_PAYMENT', `no payment amount, but shares set: ${set.map(([k, s]) => `${benName.get(k) ?? k}${s.status === 'PAID' ? ' (paid)' : ''}`).join(', ')}`);
    }

    const linked = r.caseId ? caseStatus.get(r.caseId) : undefined;
    const refused = r.stage === 'REFUSED' || r.stage === 'CANCELLED' || linked === 'REJECTED' || linked === 'CANCELLED';
    if (refused) {
      const paid = shareList.filter(([, s]) => s.status === 'PAID').map(([id]) => benName.get(id) ?? id);
      if (r.partnerPaid) paid.push('partner');
      if (paid.length) push(r, 'REFUSED_BUT_PAID', `${linked === 'REJECTED' ? 'visa refused (case)' : r.stage.toLowerCase()}, but paid: ${paid.join(', ')}`);
    }

    if (linked) {
      const implied = stageFromCase(linked);
      if (implied && implied !== r.stage) push(r, 'CASE_STAGE_MISMATCH', `row stage ${r.stage}, case ${r.case?.number ?? ''} is ${linked} (→ ${implied})${r.stageAuto ? '' : ', stage set by hand'}`);
    }
  }

  // Duplicate client names (transliteration- and order-insensitive).
  const byName = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) {
    const k = normaliseName(r.clientName);
    if (k) byName.set(k, [...(byName.get(k) ?? []), r]);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const where = group.map((r) => r.project);
    for (const r of group) push(r, 'DUPLICATE_CLIENT', `"${r.clientName}" appears ${group.length}× (${[...new Set(where)].join(', ')})`);
  }

  const items = opts.types?.length ? out.filter((a) => opts.types!.includes(a.type)) : out;
  const byType: Partial<Record<AnomalyType, number>> = {};
  for (const a of items) byType[a.type] = (byType[a.type] ?? 0) + 1;
  return { count: items.length, byType, items: items.slice(0, 60), truncated: items.length > 60, toleranceUnits: tolerance / 100, rowsChecked: rows.length };
};
