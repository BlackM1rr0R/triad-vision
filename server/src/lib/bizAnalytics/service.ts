import type { CaseStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { csvSafe } from '../csvSafe.js';
import { STATUS_RANK } from '../funnel.js';
import { monthOf } from '../kpi/compute.js';
import { computeProfitability } from '../profitability/compute.js';
import { getProfitSettings } from '../profitability/settings.js';
import { bakuDay, bakuMidnight, bakuParts, dayRange } from '../reports/dates.js';
import { bottleneck, funnelCohorts, monthsIn, perfRows, stageStats, STAGE_STATUSES, type FunnelClient, type PerfCase, type StageCase } from './compute.js';

/**
 * Management analytics "Biznes analitikası" — /api/admin/analytics/business (ADMIN+). Three sections over one
 * period (Baku days, default: the last 12 months) and an optional visa category:
 *
 *   stages    time per visa stage (stages that ended in the period), monthly trend, per category, bottleneck now
 *   partners  per referral partner / agent / staff member: the cases opened in the period, approvals, refusals,
 *             processing time, revenue and commission (revenue / commission: lib/profitability, same allocation)
 *   funnel    clients who registered in the period: consultation → case → documents → visa → arrived, by month
 *
 * Every query is an aggregate or a flat select filtered through relations (no id lists, no per-row queries).
 */

const DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 731;

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'INVALID_DATE');

export const bizQuery = z
  .object({
    from: isoDay.optional(),
    to: isoDay.optional(),
    /** A visa category id, or 'none' for cases without one. */
    visaCategoryId: z.string().trim().min(1).max(40).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'INVALID_RANGE', path: ['to'] })
  .refine((q) => !q.from || !q.to || (Date.parse(q.to) - Date.parse(q.from)) / DAY + 1 <= MAX_RANGE_DAYS, { message: 'RANGE_TOO_LONG', path: ['from'] });
export type BizQuery = z.infer<typeof bizQuery>;

export const BIZ_SECTIONS = ['stages', 'partners', 'funnel'] as const;
export type BizSection = (typeof BIZ_SECTIONS)[number];

/** The period as Baku days: default from the 1st of the month 11 months back to today. */
export const bizPeriod = (q: BizQuery, now = new Date()) => {
  const p = bakuParts(now);
  const to = q.to ?? bakuDay(now);
  const from = q.from ?? bakuDay(bakuMidnight(p.y, p.m - 11, 1));
  const { start, end } = dayRange(from, to);
  return { from, to, start, end };
};

const caseCategory = (id: string | undefined): Prisma.CaseWhereInput => (id ? { visaCategoryId: id === 'none' ? null : id } : {});
const personName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() || null : null);

// ─── Stages ─────────────────────────────────────────────────────────────

const stagesSection = async (start: Date, end: Date, cat: Prisma.CaseWhereInput, now: Date) => {
  // Cases with a status change in the period (a stage can only end with one) and all their status changes.
  const inPeriod: Prisma.CaseWhereInput = { AND: [cat, { events: { some: { toStatus: { not: null }, createdAt: { gte: start, lt: end } } } }] };
  const openWhere: Prisma.CaseWhereInput = { AND: [cat, { status: { notIn: FINAL_STATUSES } }] };
  const [cases, events, open, lastChange] = await Promise.all([
    prisma.case.findMany({ where: inPeriod, select: { id: true, createdAt: true, visaCategoryId: true } }),
    prisma.caseEvent.findMany({ where: { toStatus: { not: null }, case: inPeriod }, select: { caseId: true, createdAt: true, fromStatus: true, toStatus: true } }),
    prisma.case.findMany({ where: openWhere, select: { id: true, status: true, createdAt: true } }),
    prisma.caseEvent.groupBy({ by: ['caseId'], where: { toStatus: { not: null }, case: openWhere }, _max: { createdAt: true } }),
  ]);
  const byCase = new Map<string, StageCase>(cases.map((c) => [c.id, { createdAt: c.createdAt, categoryId: c.visaCategoryId, events: [] }]));
  for (const e of events) byCase.get(e.caseId)?.events.push(e);
  const stats = stageStats([...byCase.values()], start, end, now);
  const since = new Map(lastChange.map((r) => [r.caseId, r._max.createdAt]));
  const typical = Object.fromEntries(stats.stages.map((s) => [s.stage, s.p75Days]));
  const now_ = bottleneck(
    open.map((c) => {
      const last = since.get(c.id);
      return { status: c.status, since: last && last > c.createdAt ? last : c.createdAt };
    }),
    typical,
    now,
  );
  return { ...stats, bottleneck: now_ };
};

// ─── Partners / agents / staff ──────────────────────────────────────────

const partnersSection = async (start: Date, end: Date, cat: Prisma.CaseWhereInput) => {
  const where: Prisma.CaseWhereInput = { AND: [cat, { createdAt: { gte: start, lt: end } }] };
  const referred: Prisma.UserWhereInput = { role: 'CLIENT', referredByAgentId: { not: null }, createdAt: { gte: start, lt: end } };
  const settings = await getProfitSettings();
  const [profits, cases, referredClients, referredWithCase] = await Promise.all([
    computeProfitability(where, settings),
    prisma.case.findMany({ where, select: { id: true, clientId: true, createdAt: true, status: true, processingStage: true, processingStageAt: true, decisionAt: true, closedAt: true } }),
    prisma.user.groupBy({ by: ['referredByAgentId'], where: referred, _count: { _all: true } }),
    // Referred clients of the period with at least one case (in the category, when filtered).
    prisma.user.groupBy({ by: ['referredByAgentId'], where: { ...referred, cases: { some: cat } }, _count: { _all: true } }),
  ]);
  const profitOf = new Map(profits.map((p) => [p.caseId, p]));
  const names = { partner: new Map<string, string | null>(), agent: new Map<string, string | null>(), staff: new Map<string, string | null>() };
  const rows = cases.map((c) => {
    const p = profitOf.get(c.id);
    if (p?.partnerId) names.partner.set(p.partnerId, p.partnerName);
    if (p?.agentId) names.agent.set(p.agentId, p.agentName);
    if (p?.staffId) names.staff.set(p.staffId, p.staffName);
    const decidedAt = c.decisionAt ?? c.closedAt ?? (c.processingStage === 'REFUSED' ? c.processingStageAt : null);
    return {
      base: { clientId: c.clientId, createdAt: c.createdAt, status: c.status, processingStage: c.processingStage, decidedAt, revenueCents: p?.revenue.total ?? 0 },
      partnerId: p?.partnerId ?? null,
      agentId: p?.agentId ?? null,
      staffId: p?.staffId ?? null,
      partnerCommission: p?.costs.PARTNER_COMMISSION ?? 0,
      agentCommission: p?.costs.AGENT_COMMISSION ?? 0,
    };
  });

  // Agents with referred clients but no case in the period still get a row (name looked up once).
  const clientsOf = new Map<string, { total: number; withCase: number }>();
  for (const r of referredClients) clientsOf.set(r.referredByAgentId!, { total: r._count._all, withCase: 0 });
  for (const r of referredWithCase) clientsOf.get(r.referredByAgentId!)!.withCase = r._count._all;
  const missing = [...clientsOf.keys()].filter((id) => !names.agent.has(id));
  if (missing.length) {
    const agents = await prisma.agent.findMany({ where: { id: { in: missing } }, select: { id: true, code: true, user: { select: { firstName: true, lastName: true } } } });
    for (const a of agents) names.agent.set(a.id, personName(a.user) ?? a.code);
  }

  const clientsPerGroup = (key: (r: (typeof rows)[number]) => string | null) => {
    const m = new Map<string, Set<string>>();
    for (const r of rows) {
      const k = key(r) ?? '';
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(r.base.clientId);
    }
    return m;
  };
  const partnerClients = clientsPerGroup((r) => r.partnerId);
  const partners = perfRows(
    rows.map((r): PerfCase & { key: string | null } => ({ ...r.base, commissionCents: r.partnerCommission, key: r.partnerId })),
    (k) => names.partner.get(k) ?? null,
  ).map((r) => ({ ...r, clients: partnerClients.get(r.id ?? '')?.size ?? 0 }));
  const agents = perfRows(
    rows.filter((r) => r.agentId).map((r): PerfCase & { key: string | null } => ({ ...r.base, commissionCents: r.agentCommission, key: r.agentId })),
    (k) => names.agent.get(k) ?? null,
    clientsOf,
  );
  const staffClients = clientsPerGroup((r) => r.staffId);
  const staff = perfRows(
    rows.map((r): PerfCase & { key: string | null } => ({ ...r.base, commissionCents: 0, key: r.staffId })),
    (k) => names.staff.get(k) ?? null,
  ).map((r) => ({ ...r, clients: staffClients.get(r.id ?? '')?.size ?? 0, commissionCents: 0, commissionShare: null }));
  return { partners, agents, staff };
};

// ─── Funnel ─────────────────────────────────────────────────────────────

const funnelSection = async (start: Date, end: Date, cat: Prisma.CaseWhereInput, hasCat: boolean, months: string[]) => {
  // With a category filter the cohort is the clients with a case in that category (registration still in the period).
  const clientWhere: Prisma.UserWhereInput = { role: 'CLIENT', createdAt: { gte: start, lt: end }, ...(hasCat ? { cases: { some: cat } } : {}) };
  const caseWhere: Prisma.CaseWhereInput = { AND: [cat, { client: clientWhere }] };
  const [clients, bookings, cases, reached, arrived, inquiries] = await Promise.all([
    prisma.user.findMany({ where: clientWhere, select: { id: true, createdAt: true } }),
    prisma.booking.findMany({ where: { status: { in: ['BOOKED', 'DONE'] }, user: clientWhere }, select: { userId: true }, distinct: ['userId'] }),
    prisma.case.findMany({ where: caseWhere, select: { id: true, clientId: true, status: true } }),
    // Distinct (case, status) pairs — enough for the furthest step, far fewer rows than the events.
    prisma.caseEvent.groupBy({ by: ['caseId', 'toStatus'], where: { toStatus: { not: null }, case: caseWhere } }),
    prisma.arrivalPlan.findMany({ where: { status: 'COMPLETED', case: caseWhere }, select: { clientId: true }, distinct: ['clientId'] }),
    hasCat ? Promise.resolve([]) : prisma.inquiry.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { createdAt: true } }),
  ]);
  const caseRank = new Map<string, number>(cases.map((c) => [c.id, STATUS_RANK[c.status]]));
  for (const r of reached) caseRank.set(r.caseId, Math.max(caseRank.get(r.caseId) ?? 0, STATUS_RANK[r.toStatus as CaseStatus]));
  const clientRank = new Map<string, number>();
  for (const c of cases) clientRank.set(c.clientId, Math.max(clientRank.get(c.clientId) ?? 0, caseRank.get(c.id) ?? 0));
  const booked = new Set(bookings.map((b) => b.userId));
  const departed = new Set(arrived.map((a) => a.clientId));
  const input: FunnelClient[] = clients.map((u) => ({ registeredAt: u.createdAt, consultation: booked.has(u.id), caseRank: clientRank.get(u.id) ?? null, departed: departed.has(u.id) }));
  const f = funnelCohorts(input, months);
  const inquiriesByMonth = new Map<string, number>();
  for (const i of inquiries) inquiriesByMonth.set(monthOf(i.createdAt), (inquiriesByMonth.get(monthOf(i.createdAt)) ?? 0) + 1);
  return {
    ...f,
    // Company / contact inquiries are not linked to client accounts: shown beside the cohort, not in it.
    inquiries: hasCat ? null : inquiries.length,
    cohorts: f.cohorts.map((c) => ({ ...c, inquiries: hasCat ? null : (inquiriesByMonth.get(c.month) ?? 0) })),
    categoryFiltered: hasCat,
  };
};

// ─── Report ─────────────────────────────────────────────────────────────

export const bizAnalytics = async (q: BizQuery, now = new Date()) => {
  const { from, to, start, end } = bizPeriod(q, now);
  const cat = caseCategory(q.visaCategoryId);
  const months = monthsIn(start, end);
  const [stages, partners, funnel, categories] = await Promise.all([
    stagesSection(start, end, cat, now),
    partnersSection(start, end, cat),
    funnelSection(start, end, cat, !!q.visaCategoryId, months),
    prisma.visaCategory.findMany({ select: { id: true, slug: true, visaLabel: true, title: true }, orderBy: { slug: 'asc' } }),
  ]);
  return {
    range: { from, to, visaCategoryId: q.visaCategoryId ?? null, months },
    stageKeys: STAGE_STATUSES,
    stages,
    performance: partners,
    funnel,
    categories: categories.map((c) => ({ ...c, title: c.title as Record<string, string> | null })),
  };
};
export type BizAnalytics = Awaited<ReturnType<typeof bizAnalytics>>;

// ─── CSV ────────────────────────────────────────────────────────────────

/** Azerbaijani CSV headers (semicolon, UTF-8 with BOM, like the other admin exports). */
const STAGE_AZ: Record<string, string> = {
  DOCUMENTS_PENDING: 'Sənədlər gözlənilir',
  DOCUMENTS_REVIEW: 'Sənədlər yoxlanılır',
  CONTRACT_SENT: 'Müqavilə göndərilib',
  CONTRACT_SIGNED: 'Müqavilə imzalanıb',
  EMBASSY_DOCUMENTS: 'Səfirlik sənədləri',
  EMBASSY_REVIEW: 'Səfirlik sənədləri yoxlanılır',
  APPOINTMENT_SCHEDULED: 'Görüş təyin edilib',
  DECISION_PENDING: 'Qərar gözlənilir',
};
const STEP_AZ: Record<string, string> = {
  registered: 'Qeydiyyat',
  consultation: 'Konsultasiya',
  caseOpened: 'Müraciət açılıb',
  documentsComplete: 'Sənədlər tamam',
  approved: 'Viza verilib',
  departed: 'Almaniyaya çatıb',
};

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : v;
  const safe = csvSafe(s);
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const eur = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const lines = (rows: (string | number | null | undefined)[][]) => `﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;

export const bizCsv = (r: BizAnalytics, section: BizSection) => {
  if (section === 'stages') {
    return lines([
      ['Mərhələ', 'Hal sayı', 'Orta gün', 'Median gün', 'P75 gün', ...r.stages.trend.months.map((m) => `Median ${m}`), 'Açıq hallar', 'Gözləmə median gün', 'Normadan uzun'],
      ...r.stages.stages.map((s, i) => {
        const b = r.stages.bottleneck.rows[i];
        return [STAGE_AZ[s.stage] ?? s.stage, s.cases, s.avgDays, s.medianDays, s.p75Days, ...r.stages.trend.rows[i].medianDays, b.open, b.medianWaitingDays, b.overTypical];
      }),
    ]);
  }
  if (section === 'partners') {
    const head = ['Növ', 'Ad', 'Müştərilər', 'Müraciət açan müştərilər', 'Müraciətə keçid %', 'Müraciətlər', 'Aktiv', 'Viza', 'Rədd', 'Ləğv', 'Rədd faizi %', 'Orta gün', 'Median gün', 'Gəlir EUR', 'Komissiya EUR', 'Komissiya / gəlir %'];
    const kinds = [
      ['Partnyor', r.performance.partners, 'Partnyorsuz'],
      ['Agent', r.performance.agents, 'Agentsiz'],
      ['Əməkdaş', r.performance.staff, 'Təyin edilməyib'],
    ] as const;
    return lines([
      head,
      ...kinds.flatMap(([kind, list, none]) =>
        list.map((x) => [kind, x.name ?? none, x.clients, x.clientsWithCase, x.caseRate, x.cases, x.active, x.approved, x.refused, x.cancelled, x.refusalRate, x.avgDays, x.medianDays, eur(x.revenueCents), eur(x.commissionCents), x.commissionShare]),
      ),
    ]);
  }
  return lines([
    ['Ay', ...r.funnel.steps.map((s) => STEP_AZ[s.key]), ...r.funnel.steps.slice(1).map((s) => `${STEP_AZ[s.key]} %`), 'Sorğular'],
    ...[...r.funnel.cohorts, { month: 'Cəmi', steps: r.funnel.steps, inquiries: r.funnel.inquiries }].map((c) => [
      c.month,
      ...c.steps.map((s) => s.count),
      ...c.steps.slice(1).map((s) => s.ofFirst),
      c.inquiries,
    ]),
  ]);
};
