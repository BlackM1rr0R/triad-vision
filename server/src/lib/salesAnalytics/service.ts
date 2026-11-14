import { z } from 'zod';
import { prisma } from '../../db.js';
import { csvSafe } from '../csvSafe.js';
import { OPEN_STATUSES } from '../billing/math.js';
import { monthsIn } from '../bizAnalytics/compute.js';
import { bakuDay, bakuMidnight, bakuParts, dayRange } from '../reports/dates.js';
import {
  LEAD_SOURCES,
  allocatePayment,
  daysOverdue,
  expectedPayments,
  inquiryLeadSource,
  isOverdue,
  leadSourceRows,
  leadsByMonth,
  partnerRows,
  pctChange,
  previousWindow,
  revenueByMonth,
  salesFunnel,
  serviceRows,
  signupLeadSource,
  sumIn,
  type DueRow,
  type Lead,
  type PartnerPayment,
  type ServiceKey,
} from './compute.js';

/**
 * Revenue & sales dashboard "Gəlir və satış" — GET /api/admin/analytics/sales (ADMIN+), a tab of Biznes analitikası.
 * One period (Baku days, default: the 1st of the month 11 months back to today) compared with the same number of
 * days right before it:
 *
 *   revenue   paid revenue by month: paid company invoices (gross, by paidAt) + client payments in EUR (by paidAt)
 *             — the definition of the analytics overview (lib/analyticsOverview)
 *   expected  what is still to come by due month (current month + 5): open client invoices (gross − paid), sent
 *             company invoices, pending instalments without an invoice yet; overdue total and the biggest rows
 *   services  revenue by service package / invoice line category / employer invoices (lib/salesAnalytics/compute)
 *   leads     leads by source and the cohort funnel lead → client → case → visa (rules: compute.ts)
 *   partners  referral partners by the revenue of their clients, partner commission created in the period
 *
 * Every query is a flat select / aggregate; id lists only for the payments' invoices, plans, orders and cases.
 */

const DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 731;
const OVERDUE_ROWS = 10;

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'INVALID_DATE');

export const salesQuery = z
  .object({ from: isoDay.optional(), to: isoDay.optional() })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'INVALID_RANGE', path: ['to'] })
  .refine((q) => !q.from || !q.to || (Date.parse(q.to) - Date.parse(q.from)) / DAY + 1 <= MAX_RANGE_DAYS, { message: 'RANGE_TOO_LONG', path: ['from'] });
export type SalesQuery = z.infer<typeof salesQuery>;

export const SALES_SECTIONS = ['revenue', 'expected', 'services', 'leads', 'partners'] as const;
export type SalesSection = (typeof SALES_SECTIONS)[number];

export const salesPeriod = (q: SalesQuery, now = new Date()) => {
  const p = bakuParts(now);
  const to = q.to ?? bakuDay(now);
  const from = q.from ?? bakuDay(bakuMidnight(p.y, p.m - 11, 1));
  const { start, end } = dayRange(from, to);
  const prev = previousWindow(start, end);
  return { from, to, start, end, prevStart: prev.start, prevEnd: prev.end, prevFrom: bakuDay(prev.start), prevTo: bakuDay(new Date(prev.end.getTime() - 1)) };
};

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');
const uniq = <T>(xs: (T | null | undefined)[]) => [...new Set(xs.filter((x): x is T => x !== null && x !== undefined))];

// ─── Money ──────────────────────────────────────────────────────────────

const loadMoney = async (start: Date, end: Date) => {
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { status: 'PAID', paidAt: { gte: start, lt: end } }, select: { paidAt: true, grossCents: true } }),
    prisma.clientPayment.findMany({ where: { paidAt: { gte: start, lt: end }, currency: 'EUR' }, select: { paidAt: true, amountCents: true, clientId: true, caseId: true, invoiceId: true } }),
  ]);
  // The payments' invoices → their package order (directly or through the instalment plan).
  const clientInvoices = await (async () => {
    const ids = uniq(payments.map((p) => p.invoiceId));
    return ids.length ? prisma.clientInvoice.findMany({ where: { id: { in: ids } }, select: { id: true, items: true, orderId: true, planId: true } }) : [];
  })();
  const planIds = uniq(clientInvoices.filter((i) => !i.orderId).map((i) => i.planId));
  const plans = planIds.length ? await prisma.paymentPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, orderId: true } }) : [];
  const planOrder = new Map(plans.map((p) => [p.id, p.orderId]));
  const orderIds = uniq(clientInvoices.map((i) => i.orderId ?? (i.planId ? planOrder.get(i.planId) : null)));
  const caseIds = uniq(payments.map((p) => p.caseId));
  const clientIds = uniq(payments.map((p) => p.clientId));
  const [orders, cases, clients] = await Promise.all([
    orderIds.length ? prisma.packageOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, packageId: true } }) : [],
    caseIds.length ? prisma.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, partnerId: true } }) : [],
    clientIds.length ? prisma.user.findMany({ where: { id: { in: clientIds } }, select: { id: true, ownerPartnerId: true } }) : [],
  ]);
  const packageOfOrder = new Map(orders.map((o) => [o.id, o.packageId]));
  const invoiceOf = new Map(clientInvoices.map((i) => [i.id, i]));
  const partnerOfCase = new Map(cases.map((c) => [c.id, c.partnerId]));
  const ownerOf = new Map(clients.map((c) => [c.id, c.ownerPartnerId]));

  const rows = payments.map((p) => {
    const inv = p.invoiceId ? invoiceOf.get(p.invoiceId) : undefined;
    const orderId = inv ? (inv.orderId ?? (inv.planId ? planOrder.get(inv.planId) : null)) : null;
    return {
      at: p.paidAt,
      cents: p.amountCents,
      clientId: p.clientId,
      partnerId: (p.caseId ? partnerOfCase.get(p.caseId) : null) ?? ownerOf.get(p.clientId) ?? null,
      packageId: orderId ? (packageOfOrder.get(orderId) ?? null) : null,
      items: inv ? inv.items : null,
    };
  });
  return { invoices: invoices.map((i) => ({ at: i.paidAt!, cents: i.grossCents })), payments: rows };
};

const loadDue = async (now: Date) => {
  const [clientOpen, companyOpen, installments] = await Promise.all([
    prisma.clientInvoice.findMany({
      where: { status: { in: OPEN_STATUSES } },
      select: { id: true, number: true, dueDate: true, grossCents: true, paidCents: true, clientId: true },
    }),
    prisma.invoice.findMany({ where: { status: { in: ['SENT', 'OVERDUE'] } }, select: { id: true, number: true, dueDate: true, grossCents: true, company: { select: { name: true } } } }),
    prisma.paymentInstallment.findMany({ where: { status: { in: ['PENDING', 'OVERDUE'] }, invoiceId: null, dueDate: { not: null } }, select: { id: true, planId: true, seq: true, label: true, dueDate: true, amountCents: true } }),
  ]);
  const planIds = uniq(installments.map((i) => i.planId));
  const plans = planIds.length ? await prisma.paymentPlan.findMany({ where: { id: { in: planIds }, status: 'ACTIVE' }, select: { id: true, clientId: true, title: true } }) : [];
  const planOf = new Map(plans.map((p) => [p.id, p]));
  const activeInstallments = installments.filter((i) => planOf.has(i.planId));
  const clientIds = uniq([...clientOpen.map((c) => c.clientId), ...plans.map((p) => p.clientId)]);
  const users = clientIds.length ? await prisma.user.findMany({ where: { id: { in: clientIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const nameOf = new Map(users.map((u) => [u.id, fullName(u)]));

  const items = [
    ...clientOpen.map((c) => ({ kind: 'client' as const, id: c.id, number: c.number, who: nameOf.get(c.clientId) ?? '', due: c.dueDate, cents: Math.max(0, c.grossCents - c.paidCents), link: `/admin/client-invoices?overdue=1&q=${encodeURIComponent(c.number ?? '')}` })),
    ...companyOpen.map((c) => ({ kind: 'company' as const, id: c.id, number: c.number, who: c.company.name, due: c.dueDate, cents: c.grossCents, link: `/admin/invoices?q=${encodeURIComponent(c.number ?? '')}` })),
    ...activeInstallments.map((i) => {
      const plan = planOf.get(i.planId)!;
      return { kind: 'installment' as const, id: i.id, number: `${plan.title} · ${i.label ?? `#${i.seq}`}`, who: nameOf.get(plan.clientId) ?? '', due: i.dueDate!, cents: i.amountCents, link: `/admin/client-invoices?q=${encodeURIComponent(nameOf.get(plan.clientId) ?? '')}` };
    }),
  ].filter((r) => r.cents > 0);
  const dueRows: DueRow[] = items.map((r) => ({ kind: r.kind, due: r.due, cents: r.cents }));
  const overdueRows = items
    .filter((r) => isOverdue(r.due, now))
    .sort((a, b) => b.cents - a.cents || a.due.getTime() - b.due.getTime())
    .slice(0, OVERDUE_ROWS)
    .map((r) => ({ kind: r.kind, id: r.id, number: r.number, who: r.who, dueDate: bakuDay(r.due), cents: r.cents, daysOverdue: daysOverdue(r.due, now), link: r.link }));
  const overdueByKind = { client: 0, company: 0, installment: 0 };
  for (const r of items) if (isOverdue(r.due, now)) overdueByKind[r.kind] += r.cents;
  return { ...expectedPayments(dueRows, now), overdueRows, overdueByKind };
};

// ─── Leads ──────────────────────────────────────────────────────────────

const loadLeads = async (start: Date, end: Date) => {
  const [inquiries, signups] = await Promise.all([
    prisma.inquiry.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { createdAt: true, partnerId: true, agentId: true, source: true, landingPageId: true, utm: true, visitorId: true, sector: true, convertedUserId: true },
    }),
    prisma.user.findMany({
      where: { role: 'CLIENT', createdAt: { gte: start, lt: end }, mergedIntoId: null },
      select: { id: true, createdAt: true, ownerPartnerId: true, referredByAgentId: true, referredBy: { select: { id: true } } },
    }),
  ]);
  // A signup that some inquiry (of any date) was converted into is that inquiry's conversion, not a new lead.
  const signupIds = signups.map((s) => s.id);
  const converted = signupIds.length ? await prisma.inquiry.findMany({ where: { convertedUserId: { in: signupIds } }, select: { convertedUserId: true }, distinct: ['convertedUserId'] }) : [];
  const fromInquiry = new Set(converted.map((c) => c.convertedUserId));
  const leads: Lead[] = [
    ...inquiries.map((i) => ({ source: inquiryLeadSource(i), at: i.createdAt, clientId: i.convertedUserId })),
    ...signups.filter((s) => !fromInquiry.has(s.id)).map((s) => ({ source: signupLeadSource({ referredByClient: !!s.referredBy, ownerPartnerId: s.ownerPartnerId, referredByAgentId: s.referredByAgentId }), at: s.createdAt, clientId: s.id })),
  ];
  return leads;
};

const caseProgress = async (clientIds: string[]) => {
  if (!clientIds.length) return { withCase: new Set<string>(), approved: new Set<string>() };
  const rows = await prisma.case.groupBy({ by: ['clientId', 'status'], where: { clientId: { in: clientIds } } });
  return { withCase: new Set(rows.map((r) => r.clientId)), approved: new Set(rows.filter((r) => r.status === 'APPROVED').map((r) => r.clientId)) };
};

// ─── Report ─────────────────────────────────────────────────────────────

export const salesAnalytics = async (q: SalesQuery, now = new Date()) => {
  const period = salesPeriod(q, now);
  const cur = { start: period.start, end: period.end };
  const prev = { start: period.prevStart, end: period.prevEnd };
  const months = monthsIn(cur.start, cur.end);
  const prevMonths = monthsIn(prev.start, prev.end);

  const [money, due, leadsAll, commissions] = await Promise.all([
    loadMoney(prev.start, cur.end),
    loadDue(now),
    loadLeads(prev.start, cur.end),
    prisma.partnerCommission.groupBy({ by: ['partnerId'], where: { createdAt: { gte: cur.start, lt: cur.end }, status: { not: 'CANCELLED' } }, _sum: { amountCents: true } }),
  ]);

  // Revenue
  const inWin = (d: Date, w: typeof cur) => d >= w.start && d < w.end;
  const curPayments = money.payments.filter((p) => inWin(p.at, cur));
  const prevPayments = money.payments.filter((p) => inWin(p.at, prev));
  const series = revenueByMonth(months, money.invoices, money.payments);
  const prevSeries = revenueByMonth(prevMonths, money.invoices, money.payments);
  const invCur = sumIn(money.invoices, cur);
  const invPrev = sumIn(money.invoices, prev);
  const payCur = curPayments.reduce((a, p) => a + p.cents, 0);
  const payPrev = prevPayments.reduce((a, p) => a + p.cents, 0);

  // Services
  const alloc = (rows: typeof curPayments, invoiceCents: number) => [...rows.flatMap((p) => allocatePayment(p)), ...(invoiceCents ? [{ key: 'employer' as ServiceKey, cents: invoiceCents }] : [])];
  const services = serviceRows(alloc(curPayments, invCur), alloc(prevPayments, invPrev));
  const packageIds = uniq(services.map((s) => (s.key.startsWith('package:') ? s.key.slice(8) : null)));
  const packages = packageIds.length ? await prisma.servicePackage.findMany({ where: { id: { in: packageIds } }, select: { id: true, slug: true, tier: true, title: true } }) : [];
  const pkgOf = new Map(packages.map((p) => [p.id, p]));

  // Leads and funnel
  const curLeads = leadsAll.filter((l) => inWin(l.at, cur));
  const prevLeads = leadsAll.filter((l) => inWin(l.at, prev));
  const progress = await caseProgress(uniq(leadsAll.map((l) => l.clientId)));
  const funnelCur = salesFunnel(curLeads, progress.withCase, progress.approved);
  const funnelPrev = salesFunnel(prevLeads, progress.withCase, progress.approved);

  // Partners
  const commissionOf = new Map(commissions.map((c) => [c.partnerId, c._sum.amountCents ?? 0]));
  const toPartner = (p: (typeof curPayments)[number]): PartnerPayment => ({ partnerId: p.partnerId, clientId: p.clientId, cents: p.cents });
  const partnersRaw = partnerRows(curPayments.map(toPartner), prevPayments.map(toPartner), commissionOf);
  const partnerNames = partnersRaw.length ? await prisma.referralPartner.findMany({ where: { id: { in: partnersRaw.map((p) => p.id) } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(partnerNames.map((p) => [p.id, p.name]));
  const partnerRevenue = curPayments.filter((p) => p.partnerId).reduce((a, p) => a + p.cents, 0);

  const total = invCur + payCur;
  const totalPrev = invPrev + payPrev;
  return {
    range: { from: period.from, to: period.to, prevFrom: period.prevFrom, prevTo: period.prevTo, months, prevMonths },
    summary: {
      revenueCents: total,
      revenuePrevCents: totalPrev,
      revenueDelta: pctChange(total, totalPrev),
      invoicesCents: invCur,
      paymentsCents: payCur,
      upcomingCents: due.upcomingCents,
      overdueCents: due.overdue.cents,
      overdueCount: due.overdue.count,
      leads: curLeads.length,
      leadsPrev: prevLeads.length,
      leadsDelta: pctChange(curLeads.length, prevLeads.length),
      conversion: funnelCur[3].ofFirst,
      conversionPrev: funnelPrev[3].ofFirst,
      partnerShare: payCur + invCur > 0 ? Math.round((partnerRevenue / (payCur + invCur)) * 1000) / 10 : null,
    },
    revenue: { months, invoices: series.invoices, payments: series.payments, total: series.total, prevTotal: prevSeries.total },
    expected: { months: due.months, later: due.later, overdue: { ...due.overdue, byKind: due.overdueByKind, rows: due.overdueRows } },
    services: services.map((s) => {
      const pkg = s.key.startsWith('package:') ? pkgOf.get(s.key.slice(8)) : undefined;
      return { ...s, kind: s.key.startsWith('package:') ? ('package' as const) : s.key.startsWith('category:') ? ('category' as const) : (s.key as 'employer' | 'other'), title: pkg ? (pkg.title as Record<string, string>) : null, tier: pkg?.tier ?? null };
    }),
    leads: {
      sources: leadSourceRows(curLeads, prevLeads, progress.approved),
      monthly: leadsByMonth(months, curLeads),
      sourceKeys: LEAD_SOURCES,
    },
    funnel: funnelCur.map((s, i) => ({ ...s, prev: funnelPrev[i].count, prevOfFirst: funnelPrev[i].ofFirst })),
    partners: partnersRaw.map((p) => ({ ...p, name: nameOf.get(p.id) ?? null })),
  };
};
export type SalesAnalytics = Awaited<ReturnType<typeof salesAnalytics>>;

// ─── CSV ────────────────────────────────────────────────────────────────

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : v;
  const safe = csvSafe(s);
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const eur = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const lines = (rows: (string | number | null | undefined)[][]) => `﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;

const SOURCE_AZ: Record<string, string> = { website: 'Sayt', partner: 'Partnyor', referral: 'Tövsiyə', campaign: 'Kampaniya', direct: 'Birbaşa' };
const KIND_AZ: Record<string, string> = { client: 'Müştəri hesabı', company: 'İşəgötürən hesabı', installment: 'Hissəli ödəniş' };
const STEP_AZ: Record<string, string> = { leads: 'Müraciət edənlər', clients: 'Müştərilər', cases: 'Müraciət açılıb', approved: 'Viza verilib' };
const CATEGORY_AZ: Record<string, string> = { SERVICE_FEE: 'Xidmət haqqı', TRANSLATION: 'Tərcümə', APOSTILLE: 'Apostil', EMBASSY_FEE: 'Səfirlik rüsumu', COURIER: 'Kuryer', OTHER: 'Digər' };

export const salesCsv = (r: SalesAnalytics, section: SalesSection) => {
  switch (section) {
    case 'revenue':
      return lines([
        ['Ay', 'İşəgötürən hesabları EUR', 'Müştəri ödənişləri EUR', 'Cəmi EUR', 'Əvvəlki dövr EUR'],
        ...r.revenue.months.map((m, i) => [m, eur(r.revenue.invoices[i]), eur(r.revenue.payments[i]), eur(r.revenue.total[i]), r.revenue.prevTotal[i] === undefined ? '' : eur(r.revenue.prevTotal[i])]),
        ['Cəmi', eur(r.summary.invoicesCents), eur(r.summary.paymentsCents), eur(r.summary.revenueCents), eur(r.summary.revenuePrevCents)],
      ]);
    case 'expected':
      return lines([
        ['Ay', 'Müştəri hesabları EUR', 'İşəgötürən hesabları EUR', 'Hissəli ödənişlər EUR', 'Cəmi EUR'],
        ...r.expected.months.map((m) => [m.month, eur(m.client), eur(m.company), eur(m.installment), eur(m.total)]),
        ['Sonra', eur(r.expected.later.client), eur(r.expected.later.company), eur(r.expected.later.installment), eur(r.expected.later.total)],
        ['Gecikmiş', eur(r.expected.overdue.byKind.client), eur(r.expected.overdue.byKind.company), eur(r.expected.overdue.byKind.installment), eur(r.expected.overdue.cents)],
        [],
        ['Növ', 'Nömrə', 'Kim', 'Son tarix', 'Məbləğ EUR', 'Gecikmə günü'],
        ...r.expected.overdue.rows.map((x) => [KIND_AZ[x.kind], x.number, x.who, x.dueDate, eur(x.cents), x.daysOverdue]),
      ]);
    case 'services':
      return lines([
        ['Xidmət', 'Gəlir EUR', 'Əvvəlki dövr EUR', 'Pay %', 'Dəyişmə %'],
        ...r.services.map((s) => [
          s.kind === 'package' ? (s.title?.az ?? s.key) : s.kind === 'category' ? (CATEGORY_AZ[s.key.slice(9)] ?? s.key) : s.kind === 'employer' ? 'İşəgötürən xidmətləri' : 'Digər',
          eur(s.cents),
          eur(s.prevCents),
          s.share,
          s.delta,
        ]),
      ]);
    case 'leads':
      return lines([
        ['Mənbə', 'Müraciət edənlər', 'Əvvəlki dövr', 'Pay %', 'Müştəri olub', 'Müştəriyə keçid %', 'Viza verilib'],
        ...r.leads.sources.map((s) => [SOURCE_AZ[s.source], s.count, s.prev, s.share, s.clients, s.clientRate, s.approved]),
        [],
        ['Huni', 'Say', 'Əvvəlki addımdan %', 'Müraciət edənlərdən %', 'Əvvəlki dövr'],
        ...r.funnel.map((s) => [STEP_AZ[s.key], s.count, s.rate, s.ofFirst, s.prev]),
      ]);
    case 'partners':
      return lines([
        ['Partnyor', 'Gəlir EUR', 'Əvvəlki dövr EUR', 'Pay %', 'Müştərilər', 'Ödənişlər', 'Komissiya EUR'],
        ...r.partners.map((p) => [p.name ?? p.id, eur(p.revenueCents), eur(p.prevRevenueCents), p.share, p.clients, p.payments, eur(p.commissionCents)]),
      ]);
  }
};
