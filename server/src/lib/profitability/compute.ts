import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { toEur, type ProfitSettings } from './settings.js';
import { labourByCase } from '../timeTracking/rates.js'; // LABOUR cost (time tracking)

/**
 * Profitability per case (Gəlirlilik): lifetime revenue and costs of each case, in EUR cents.
 *
 * Revenue
 *  - Employer invoices (PAID, net amount — VAT is not revenue). Invoices are addressed to companies, so:
 *      1. an invoice line whose description contains the number of one of the company's cases (e.g.
 *         "Vermittlung TV-2026-0012") goes to that case (split equally when it names several);
 *      2. the rest of the invoice's net amount is split equally over the company's cases that are not
 *         CANCELLED (all its cases when every one is cancelled). Whole cents; the remainder goes to the
 *         oldest cases so the parts add up exactly.
 *  - Client payments recorded in the settlement ledger (SettlementEntry.paidCents of entries linked to the case).
 *  - Delivered translation orders (price) — as revenue by default (like the finance reports) or, with the
 *    setting translationAs = 'cost', as a TRANSLATION cost.
 * Costs
 *  - Agent commissions and referral partner commissions that are not CANCELLED (accrued: pending, approved, paid).
 *  - The partner share of a settlement row, unless a PartnerCommission row is synced from it (no double count).
 *  - Settlement expenses ("Rasxod").
 *  - Manual costs (CaseCost): translation, courier, embassy / visa fees paid on behalf, travel, other.
 *  - LABOUR: staff time on the case (TimeEntry minutes × the staff member's hourly cost rate in force that day).
 *  Owner shares of the settlement ledger (beneficiaries) are a split of the profit, not costs.
 * Records without a case link fall back to the client: translation orders and agent commissions with only a
 * client go to the client's latest case opened on or before the record (else the client's first case).
 * Currency: base EUR. AZN amounts are converted with the record's own rate (manual costs store theirs) or the
 * default rate of the profitability settings.
 */

export type RevenueSource = 'INVOICE' | 'SETTLEMENT' | 'TRANSLATION';
// LABOUR = staff time × hourly cost rate (lib/timeTracking).
export type CostKey = 'TRANSLATION' | 'COURIER' | 'EMBASSY_FEE' | 'VISA_FEE' | 'AGENT_COMMISSION' | 'PARTNER_COMMISSION' | 'TRAVEL' | 'OTHER' | 'LEDGER_EXPENSES' | 'LABOUR';
export const COST_KEYS: CostKey[] = ['TRANSLATION', 'COURIER', 'EMBASSY_FEE', 'VISA_FEE', 'AGENT_COMMISSION', 'PARTNER_COMMISSION', 'TRAVEL', 'OTHER', 'LEDGER_EXPENSES', 'LABOUR'];

export interface ProfitLine {
  kind: 'revenue' | 'cost';
  source: RevenueSource | 'AGENT_COMMISSION' | 'PARTNER_COMMISSION' | 'SETTLEMENT_PARTNER' | 'SETTLEMENT_EXPENSES' | 'CASE_COST' | 'LABOUR';
  category: CostKey | null;
  ref: string;
  date: Date | null;
  /** Amount in the record's currency (for invoices: this case's share). */
  amountCents: number;
  currency: string;
  eurCents: number;
  /** How an invoice was allocated: a line naming the case, or an equal split over n cases. */
  allocation?: 'line' | 'split';
  splitOver?: number;
  costId?: string;
  note?: string | null;
}

export interface CaseProfit {
  caseId: string;
  number: string;
  status: string;
  visaType: string;
  visaCategoryId: string | null;
  categoryLabel: string | null;
  clientId: string;
  clientName: string;
  staffId: string | null;
  staffName: string | null;
  partnerId: string | null;
  partnerName: string | null;
  agentId: string | null;
  agentName: string | null;
  companyId: string | null;
  companyName: string | null;
  createdAt: Date;
  revenue: Record<RevenueSource, number> & { total: number };
  costs: Record<CostKey, number> & { total: number };
  marginCents: number;
  marginPct: number | null;
  lines: ProfitLine[];
}

const name = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);

const CASE_SELECT = {
  id: true,
  number: true,
  status: true,
  visaType: true,
  visaCategoryId: true,
  visaCategory: { select: { slug: true, visaLabel: true, title: true } },
  createdAt: true,
  clientId: true,
  client: { select: { firstName: true, lastName: true, referredByAgentId: true } },
  assignedStaffId: true,
  assignedStaff: { select: { firstName: true, lastName: true } },
  partnerId: true,
  partner: { select: { name: true } },
  companyId: true,
  company: { select: { name: true } },
} satisfies Prisma.CaseSelect;

/** Splits `cents` over `n` parts in whole cents; the first parts take the remainder. */
export const splitCents = (cents: number, n: number) => {
  const share = Math.trunc(cents / n);
  let rest = cents - share * n;
  return Array.from({ length: n }, () => {
    const step = rest > 0 ? 1 : rest < 0 ? -1 : 0;
    rest -= step;
    return share + step;
  });
};

/** Invoice.items lines (tolerant of older / malformed rows), with their net total in cents. */
const invoiceLines = (items: Prisma.JsonValue) =>
  Array.isArray(items)
    ? items
        .filter((l): l is Prisma.JsonObject => !!l && typeof l === 'object' && !Array.isArray(l))
        .map((l) => ({ description: String(l.description ?? ''), totalCents: Math.round(Number(l.quantity ?? 0) * Math.round(Number(l.unitPriceCents ?? 0))) || 0 }))
    : [];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case numbers named in an invoice line ("… TV-2026-0012 …"), matched as whole tokens, case-insensitive. */
export const casesNamedIn = (description: string, numbers: string[]) =>
  numbers.filter((n) => new RegExp(`(^|[^A-Za-z0-9-])${escapeRe(n)}($|[^A-Za-z0-9-])`, 'i').test(description));

/** Lifetime profitability of the cases matching `where`. Batched queries only (no per-case round trips). */
export const computeProfitability = async (where: Prisma.CaseWhereInput, s: Pick<ProfitSettings, 'eurAzn' | 'translationAs'>, opts: { take?: number } = {}): Promise<CaseProfit[]> => {
  const cases = await prisma.case.findMany({ where, select: CASE_SELECT, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], ...(opts.take ? { take: opts.take } : {}) });
  if (!cases.length) return [];
  const ids = cases.map((c) => c.id);
  const clientIds = [...new Set(cases.map((c) => c.clientId))];
  const companyIds = [...new Set(cases.map((c) => c.companyId).filter((x): x is string => !!x))];
  const agentIds = [...new Set(cases.map((c) => c.client.referredByAgentId).filter((x): x is string => !!x))];
  const rate = s.eurAzn;

  const [invoices, companyCases, clientCases, settlements, translations, agentComms, partnerComms, manual, agents, labour] = await Promise.all([
    companyIds.length
      ? prisma.invoice.findMany({ where: { companyId: { in: companyIds }, status: 'PAID' }, select: { id: true, number: true, companyId: true, netCents: true, currency: true, items: true, paidAt: true } })
      : [],
    companyIds.length ? prisma.case.findMany({ where: { companyId: { in: companyIds } }, select: { id: true, number: true, status: true, companyId: true, createdAt: true } }) : [],
    prisma.case.findMany({ where: { clientId: { in: clientIds } }, select: { id: true, clientId: true, createdAt: true } }),
    prisma.settlementEntry.findMany({
      where: { caseId: { in: ids } },
      select: { id: true, caseId: true, project: true, clientName: true, paidCents: true, currency: true, partnerShareCents: true, partnerShareCurrency: true, expensesCents: true, visaDate: true, tlsDate: true, createdAt: true },
    }),
    prisma.translationOrder.findMany({
      where: { status: 'DELIVERED', priceCents: { gt: 0 }, OR: [{ caseId: { in: ids } }, { caseId: null, clientId: { in: clientIds } }] },
      select: { id: true, number: true, caseId: true, clientId: true, priceCents: true, currency: true, completedAt: true, createdAt: true },
    }),
    prisma.agentCommission.findMany({
      where: { status: { not: 'CANCELLED' }, OR: [{ caseId: { in: ids } }, { caseId: null, clientId: { in: clientIds } }] },
      select: { id: true, caseId: true, clientId: true, amountCents: true, currency: true, event: true, status: true, createdAt: true, agent: { select: { code: true } } },
    }),
    prisma.partnerCommission.findMany({
      where: { status: { not: 'CANCELLED' }, caseId: { in: ids } },
      select: { id: true, caseId: true, amountCents: true, currency: true, status: true, settlementEntryId: true, createdAt: true, partner: { select: { name: true } } },
    }),
    prisma.caseCost.findMany({ where: { caseId: { in: ids } }, orderBy: [{ incurredAt: 'asc' }, { id: 'asc' }] }),
    agentIds.length ? prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, code: true, user: { select: { firstName: true, lastName: true } } } }) : [],
    labourByCase(ids), // LABOUR (time tracking)
  ]);

  const lines = new Map<string, ProfitLine[]>(ids.map((id) => [id, []]));
  const add = (caseId: string | null | undefined, l: ProfitLine) => {
    if (caseId) lines.get(caseId)?.push(l);
  };

  // Client fallback: latest case of the client opened on or before the record, else the client's first case.
  const byClient = new Map<string, { id: string; createdAt: Date }[]>();
  for (const c of clientCases.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))) {
    byClient.set(c.clientId, [...(byClient.get(c.clientId) ?? []), c]);
  }
  const caseOfClient = (clientId: string | null, at: Date) => {
    const list = clientId ? byClient.get(clientId) : undefined;
    if (!list?.length) return null;
    const before = list.filter((c) => c.createdAt <= at);
    return (before[before.length - 1] ?? list[0]).id;
  };

  // ── Invoices ──
  const casesOfCompany = new Map<string, typeof companyCases>();
  for (const c of companyCases.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))) {
    casesOfCompany.set(c.companyId!, [...(casesOfCompany.get(c.companyId!) ?? []), c]);
  }
  for (const inv of invoices) {
    const all = casesOfCompany.get(inv.companyId) ?? [];
    if (!all.length) continue;
    const numbers = all.map((c) => c.number);
    const idOf = new Map(all.map((c) => [c.number.toLowerCase(), c.id]));
    let referenced = 0;
    for (const line of invoiceLines(inv.items)) {
      const named = casesNamedIn(line.description, numbers);
      if (!named.length) continue;
      const total = line.totalCents;
      referenced += total;
      splitCents(total, named.length).forEach((part, i) =>
        add(idOf.get(named[i].toLowerCase()), {
          kind: 'revenue',
          source: 'INVOICE',
          category: null,
          ref: inv.number,
          date: inv.paidAt,
          amountCents: part,
          currency: inv.currency,
          eurCents: toEur(part, inv.currency, rate),
          allocation: 'line',
          splitOver: named.length,
        }),
      );
    }
    const pool = inv.netCents - referenced;
    if (pool === 0) continue;
    const active = all.filter((c) => c.status !== 'CANCELLED');
    const over = active.length ? active : all;
    splitCents(pool, over.length).forEach((part, i) =>
      add(over[i].id, {
        kind: 'revenue',
        source: 'INVOICE',
        category: null,
        ref: inv.number,
        date: inv.paidAt,
        amountCents: part,
        currency: inv.currency,
        eurCents: toEur(part, inv.currency, rate),
        allocation: 'split',
        splitOver: over.length,
      }),
    );
  }

  // ── Settlement ledger ──
  const syncedEntries = new Set(partnerComms.map((p) => p.settlementEntryId).filter((x): x is string => !!x));
  for (const e of settlements) {
    const ref = `${e.project} · ${e.clientName}`;
    const date = e.visaDate ?? e.tlsDate ?? e.createdAt;
    if (e.paidCents) add(e.caseId, { kind: 'revenue', source: 'SETTLEMENT', category: null, ref, date, amountCents: e.paidCents, currency: e.currency, eurCents: toEur(e.paidCents, e.currency, rate) });
    if (e.partnerShareCents && !syncedEntries.has(e.id)) {
      add(e.caseId, {
        kind: 'cost',
        source: 'SETTLEMENT_PARTNER',
        category: 'PARTNER_COMMISSION',
        ref,
        date,
        amountCents: e.partnerShareCents,
        currency: e.partnerShareCurrency,
        eurCents: toEur(e.partnerShareCents, e.partnerShareCurrency, rate),
      });
    }
    if (e.expensesCents) add(e.caseId, { kind: 'cost', source: 'SETTLEMENT_EXPENSES', category: 'LEDGER_EXPENSES', ref, date, amountCents: e.expensesCents, currency: e.currency, eurCents: toEur(e.expensesCents, e.currency, rate) });
  }

  // ── Translation orders ──
  for (const t of translations) {
    const caseId = t.caseId ?? caseOfClient(t.clientId, t.createdAt);
    const cents = t.priceCents ?? 0;
    const base = { ref: `TR-${String(t.number).padStart(4, '0')}`, date: t.completedAt ?? t.createdAt, amountCents: cents, currency: t.currency, eurCents: toEur(cents, t.currency, rate) };
    if (s.translationAs === 'cost') add(caseId, { kind: 'cost', source: 'TRANSLATION', category: 'TRANSLATION', ...base });
    else add(caseId, { kind: 'revenue', source: 'TRANSLATION', category: null, ...base });
  }

  // ── Commissions ──
  for (const c of agentComms) {
    const caseId = c.caseId ?? caseOfClient(c.clientId, c.createdAt);
    add(caseId, {
      kind: 'cost',
      source: 'AGENT_COMMISSION',
      category: 'AGENT_COMMISSION',
      ref: `${c.agent.code} · ${c.event}`,
      date: c.createdAt,
      amountCents: c.amountCents,
      currency: c.currency,
      eurCents: toEur(c.amountCents, c.currency, rate),
      note: c.status,
    });
  }
  for (const c of partnerComms) {
    add(c.caseId, {
      kind: 'cost',
      source: 'PARTNER_COMMISSION',
      category: 'PARTNER_COMMISSION',
      ref: c.partner.name,
      date: c.createdAt,
      amountCents: c.amountCents,
      currency: c.currency,
      eurCents: toEur(c.amountCents, c.currency, rate),
      note: c.status,
    });
  }

  // ── Manual costs (own stored rate) ──
  for (const m of manual) {
    add(m.caseId, {
      kind: 'cost',
      source: 'CASE_COST',
      category: m.category,
      ref: m.category,
      date: m.incurredAt,
      amountCents: m.amountCents,
      currency: m.currency,
      eurCents: toEur(m.amountCents, m.currency, m.fxRate > 0 ? m.fxRate : rate),
      costId: m.id,
      note: m.note,
    });
  }

  // ── LABOUR: staff time × hourly cost rate — one line per case (the rates themselves stay SUPER_ADMIN-only) ──
  for (const [caseId, l] of labour) {
    if (l.cents) add(caseId, { kind: 'cost', source: 'LABOUR', category: 'LABOUR', ref: `${Math.round((l.minutes / 60) * 10) / 10} h`, date: l.lastAt, amountCents: l.cents, currency: 'EUR', eurCents: l.cents });
  }

  const agentById = new Map(agents.map((a) => [a.id, a]));
  return cases.map((c) => {
    const ls = lines.get(c.id) ?? [];
    for (const l of ls) l.eurCents = Math.round(l.eurCents);
    const revenue = { INVOICE: 0, SETTLEMENT: 0, TRANSLATION: 0, total: 0 } as CaseProfit['revenue'];
    const costs = Object.fromEntries([...COST_KEYS.map((k) => [k, 0]), ['total', 0]]) as CaseProfit['costs'];
    for (const l of ls) {
      if (l.kind === 'revenue') {
        revenue[l.source as RevenueSource] += l.eurCents;
        revenue.total += l.eurCents;
      } else {
        costs[l.category ?? 'OTHER'] += l.eurCents;
        costs.total += l.eurCents;
      }
    }
    const marginCents = revenue.total - costs.total;
    const agent = c.client.referredByAgentId ? agentById.get(c.client.referredByAgentId) : undefined;
    const title = c.visaCategory?.title as Record<string, string> | null | undefined;
    return {
      caseId: c.id,
      number: c.number,
      status: c.status,
      visaType: c.visaType,
      visaCategoryId: c.visaCategoryId,
      categoryLabel: c.visaCategory ? `${title?.az ?? c.visaCategory.slug}${c.visaCategory.visaLabel ? ` (${c.visaCategory.visaLabel})` : ''}` : null,
      clientId: c.clientId,
      clientName: name(c.client) ?? '',
      staffId: c.assignedStaffId,
      staffName: name(c.assignedStaff),
      partnerId: c.partnerId,
      partnerName: c.partner?.name ?? null,
      agentId: agent?.id ?? null,
      agentName: agent ? (name(agent.user) || agent.code) : null,
      companyId: c.companyId,
      companyName: c.company?.name ?? null,
      createdAt: c.createdAt,
      revenue,
      costs,
      marginCents,
      marginPct: revenue.total > 0 ? Math.round((marginCents / revenue.total) * 1000) / 10 : null,
      lines: ls.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0)),
    };
  });
};
