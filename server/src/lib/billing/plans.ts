import { z } from 'zod';
import type { CaseStatus, PaymentInstallment, PaymentPlan } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound, parse } from '../http.js';
import { firesOnStatus, isValidTrigger, parseTrigger, splitByPercent } from './math.js';
import { createAndSendInvoice, refreshPlanStatus, todayIso } from './service.js';
import { effectiveVatRate, loadBillingContext } from './settings.js';
import { currencySchema } from './currency.js';
import { getBillingEntities } from './entities.js';

/**
 * Payment plans: a total split into instalments, each with a trigger —
 *   DATE                  → the hourly job invoices it on its date;
 *   ON_SIGN               → when the package contract is signed (packages.ts) or the case contract is signed;
 *   CASE_STATUS:<status>  → when the case reaches that status (caseFlow transition hook; also when it jumps past it).
 * When a trigger fires, the instalment gets its own ClientInvoice (numbered and e-mailed at once). Instalment
 * amounts are gross amounts (what the client pays, VAT included) — the invoice computes the net part.
 * A plan is COMPLETED once every instalment is paid (service.ts refreshPlanStatus). Staff can edit, add and
 * remove instalments that are still PENDING.
 */

type L10n = { az: string; de: string; en: string; ru: string };

export interface PlanTemplate {
  key: string;
  title: L10n;
  items: { label: L10n; percent: number; trigger: string; monthsAfterStart?: number }[];
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    key: 'standard',
    title: { az: '40 / 30 / 30 (imza, səfirlik, təsdiq)', de: '40 / 30 / 30 (Unterschrift, Botschaft, Zusage)', en: '40 / 30 / 30 (signing, embassy, approval)', ru: '40 / 30 / 30 (подпись, посольство, одобрение)' },
    items: [
      { label: { az: 'Müqavilə imzalananda ilkin ödəniş', de: 'Anzahlung bei Vertragsunterzeichnung', en: 'Deposit on signing', ru: 'Предоплата при подписании' }, percent: 40, trigger: 'ON_SIGN' },
      { label: { az: 'Səfirlik sənədləri mərhələsi', de: 'Rate bei Botschaftsunterlagen', en: 'Embassy documents stage', ru: 'Этап документов для посольства' }, percent: 30, trigger: 'CASE_STATUS:EMBASSY_DOCUMENTS' },
      { label: { az: 'Viza təsdiqləndikdə', de: 'Schlussrate bei Visumzusage', en: 'On visa approval', ru: 'При одобрении визы' }, percent: 30, trigger: 'CASE_STATUS:APPROVED' },
    ],
  },
  {
    key: 'half',
    title: { az: '50 / 50 (imza, təsdiq)', de: '50 / 50 (Unterschrift, Zusage)', en: '50 / 50 (signing, approval)', ru: '50 / 50 (подпись, одобрение)' },
    items: [
      { label: { az: 'Müqavilə imzalananda ilkin ödəniş', de: 'Anzahlung bei Vertragsunterzeichnung', en: 'Deposit on signing', ru: 'Предоплата при подписании' }, percent: 50, trigger: 'ON_SIGN' },
      { label: { az: 'Viza təsdiqləndikdə', de: 'Schlussrate bei Visumzusage', en: 'On visa approval', ru: 'При одобрении визы' }, percent: 50, trigger: 'CASE_STATUS:APPROVED' },
    ],
  },
  {
    key: 'full',
    title: { az: 'Tam ödəniş imza zamanı', de: 'Vollzahlung bei Unterschrift', en: 'Full payment on signing', ru: 'Полная оплата при подписании' },
    items: [{ label: { az: 'Xidmət haqqı', de: 'Servicegebühr', en: 'Service fee', ru: 'Сервисный сбор' }, percent: 100, trigger: 'ON_SIGN' }],
  },
  {
    key: 'monthly3',
    title: { az: '3 aylıq ödəniş', de: '3 Monatsraten', en: '3 monthly instalments', ru: '3 ежемесячных платежа' },
    items: [
      { label: { az: '1-ci ödəniş', de: '1. Rate', en: '1st instalment', ru: '1-й платёж' }, percent: 34, trigger: 'DATE', monthsAfterStart: 0 },
      { label: { az: '2-ci ödəniş', de: '2. Rate', en: '2nd instalment', ru: '2-й платёж' }, percent: 33, trigger: 'DATE', monthsAfterStart: 1 },
      { label: { az: '3-cü ödəniş', de: '3. Rate', en: '3rd instalment', ru: '3-й платёж' }, percent: 33, trigger: 'DATE', monthsAfterStart: 2 },
    ],
  },
];

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T12:00:00Z`)), 'INVALID_DATE');
const atNoon = (s: string) => new Date(`${s}T12:00:00Z`);

export const installmentInput = z
  .object({
    label: z.string().trim().min(1).max(160),
    trigger: z.string().trim().max(40).refine(isValidTrigger, 'INVALID_TRIGGER'),
    dueDate: day.optional().nullable().or(z.literal('').transform(() => null)),
    amountCents: z.coerce.number().int().min(1).max(100_000_000),
  })
  .refine((i) => i.trigger !== 'DATE' || !!i.dueDate, { message: 'DATE_REQUIRED', path: ['dueDate'] });

export const planInput = z.object({
  clientId: z.string().trim().min(1).max(40),
  caseId: z.string().trim().max(40).optional().nullable(),
  title: z.string().trim().min(2).max(200),
  installments: z.array(installmentInput).min(1).max(24),
  /** Currency of the plan and of every instalment invoice (default: the billing default currency). */
  currency: currencySchema.optional(),
});

/**
 * Instalment amounts of a template for a total (whole cents, the last one takes the rounding rest). DATE items
 * get their date from `start` + monthsAfterStart.
 */
export const fromTemplate = (tpl: Pick<PlanTemplate, 'items'>, totalCents: number, lang: keyof L10n, start = new Date()) => {
  const amounts = splitByPercent(totalCents, tpl.items.map((i) => i.percent));
  return tpl.items.map((i, k) => {
    let dueDate: string | null = null;
    if (i.trigger === 'DATE') {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (i.monthsAfterStart ?? 0), Math.min(start.getUTCDate(), 28), 12));
      dueDate = d.toISOString().slice(0, 10);
    }
    return { label: (i.label[lang] || i.label.de).slice(0, 160), trigger: i.trigger, dueDate, amountCents: amounts[k] };
  });
};

/** The net unit price whose invoice total (net + VAT) is exactly `gross` (when such a net exists). */
export const netForGross = (gross: number, rate: number) => {
  if (rate <= 0) return gross;
  const n0 = Math.round((gross * 100) / (100 + rate));
  for (const d of [0, -1, 1, -2, 2]) {
    const n = n0 + d;
    if (n + Math.round((n * rate) / 100) === gross) return n;
  }
  return n0;
};

export const findPlan = async (id: string) => {
  const p = await prisma.paymentPlan.findUnique({ where: { id } });
  if (!p) throw notFound('PLAN_NOT_FOUND');
  return p;
};

const recomputeTotal = async (planId: string) => {
  const s = await prisma.paymentInstallment.aggregate({ where: { planId, status: { not: 'CANCELLED' } }, _sum: { amountCents: true } });
  await prisma.paymentPlan.update({ where: { id: planId }, data: { totalCents: s._sum.amountCents ?? 0 } });
};

export const createPlan = async (input: z.input<typeof planInput>, actorId: string | null, opts: { orderId?: string; catchUp?: boolean } = {}) => {
  const body = parse(planInput, input);
  const client = await prisma.user.findUnique({ where: { id: body.clientId }, select: { role: true } });
  if (!client || client.role !== 'CLIENT') throw notFound('CLIENT_NOT_FOUND');
  if (body.caseId) {
    const c = await prisma.case.findUnique({ where: { id: body.caseId }, select: { clientId: true } });
    if (!c || c.clientId !== body.clientId) throw badRequest('CASE_NOT_OF_CLIENT');
  }
  const total = body.installments.reduce((a, i) => a + i.amountCents, 0);
  const currency = body.currency ?? (await getBillingEntities()).defaultCurrency;
  const plan = await prisma.$transaction(async (tx) => {
    const p = await tx.paymentPlan.create({
      data: { clientId: body.clientId, caseId: body.caseId ?? null, title: body.title, totalCents: total, currency, orderId: opts.orderId ?? null, createdById: actorId },
    });
    await tx.paymentInstallment.createMany({
      data: body.installments.map((i, k) => ({ planId: p.id, seq: k + 1, label: i.label, trigger: i.trigger, dueDate: i.dueDate ? atNoon(i.dueDate) : null, amountCents: i.amountCents })),
    });
    return p;
  });
  const invoiced = opts.catchUp === false ? [] : await catchUp(plan);
  return { plan, invoiced };
};

/** A plan created mid-way: instalments whose trigger already happened are invoiced right away. */
const catchUp = async (plan: PaymentPlan, now = new Date()) => {
  const status = plan.caseId ? (await prisma.case.findUnique({ where: { id: plan.caseId }, select: { status: true } }))?.status : null;
  const items = await prisma.paymentInstallment.findMany({ where: { planId: plan.id, status: 'PENDING' }, orderBy: { seq: 'asc' } });
  const out: string[] = [];
  for (const i of items) {
    const t = parseTrigger(i.trigger);
    const due = (t?.kind === 'DATE' && i.dueDate && todayIso(i.dueDate) <= todayIso(now)) || (!!status && firesOnStatus(i.trigger, status as CaseStatus));
    if (due) {
      const inv = await invoiceInstallment(i.id);
      if (inv) out.push(inv.id);
    }
  }
  return out;
};

const lineFor = (inst: PaymentInstallment, plan: PaymentPlan, count: number) => `Rate ${inst.seq}/${count}: ${inst.label ?? ''} – ${plan.title}`.slice(0, 500);

/**
 * Invoices one instalment (idempotent: only the call that claims the PENDING row creates the invoice).
 * Returns the invoice, or null when it was already invoiced / not pending / the plan is not active.
 */
export const invoiceInstallment = async (installmentId: string, actorId: string | null = null) => {
  const inst = await prisma.paymentInstallment.findUnique({ where: { id: installmentId } });
  if (!inst || inst.status !== 'PENDING' || inst.invoiceId) return null;
  const plan = await prisma.paymentPlan.findUnique({ where: { id: inst.planId } });
  if (!plan || plan.status !== 'ACTIVE') return null;
  const claimed = await prisma.paymentInstallment.updateMany({ where: { id: inst.id, status: 'PENDING', invoiceId: null }, data: { status: 'INVOICED' } });
  if (!claimed.count) return null;
  try {
    // VAT of the entity that issues documents in the plan's currency (billing/entities.ts).
    const { billing } = await loadBillingContext({ currency: plan.currency });
    const count = await prisma.paymentInstallment.count({ where: { planId: plan.id, status: { not: 'CANCELLED' } } });
    const unit = netForGross(inst.amountCents, effectiveVatRate(billing));
    const inv = await createAndSendInvoice(
      { clientId: plan.clientId, caseId: plan.caseId, issueDate: todayIso(), currency: currencySchema.catch('EUR').parse(plan.currency), items: [{ description: lineFor(inst, plan, count), quantity: 1, unitPriceCents: unit, category: 'SERVICE_FEE' }] },
      actorId,
      { planId: plan.id, installmentId: inst.id, orderId: plan.orderId ?? undefined },
    );
    // Rare 1-cent rounding gap (no net amount gives exactly this gross at the rate): the instalment follows its invoice.
    await prisma.paymentInstallment.update({ where: { id: inst.id }, data: { invoiceId: inv.id, amountCents: inv.grossCents, status: inv.status === 'OVERDUE' ? 'OVERDUE' : inv.status === 'PAID' ? 'PAID' : 'INVOICED' } });
    if (inv.grossCents !== inst.amountCents) await recomputeTotal(plan.id);
    return inv;
  } catch (err) {
    await prisma.paymentInstallment.updateMany({ where: { id: inst.id, invoiceId: null }, data: { status: 'PENDING' } });
    throw err;
  }
};

/** Package contract signed: the plan's ON_SIGN instalments. */
export const fireOnSign = async (planId: string) => {
  const items = await prisma.paymentInstallment.findMany({ where: { planId, status: 'PENDING', trigger: 'ON_SIGN' }, orderBy: { seq: 'asc' } });
  const out = [];
  for (const i of items) {
    const inv = await invoiceInstallment(i.id);
    if (inv) out.push(inv);
  }
  return out;
};

/** Case status change hook (lib/caseFlow.ts): instalments of the case's active plans that this status fires. Never throws. */
export const fireCaseStatusInstallments = async (caseId: string, to: CaseStatus) => {
  try {
    const plans = await prisma.paymentPlan.findMany({ where: { caseId, status: 'ACTIVE' }, select: { id: true } });
    if (!plans.length) return [];
    const items = await prisma.paymentInstallment.findMany({ where: { planId: { in: plans.map((p) => p.id) }, status: 'PENDING', trigger: { not: 'DATE' } }, orderBy: [{ planId: 'asc' }, { seq: 'asc' }] });
    const out = [];
    for (const i of items) {
      if (!firesOnStatus(i.trigger, to)) continue;
      const inv = await invoiceInstallment(i.id);
      if (inv) out.push(inv);
    }
    return out;
  } catch (err) {
    console.error('[billing] case status instalments failed', caseId, to, err);
    return [];
  }
};

/** Hourly job: DATE instalments whose day has come. */
export const runDateInstallments = async (now = new Date()) => {
  const endOfDay = new Date(`${todayIso(now)}T23:59:59Z`);
  const items = await prisma.paymentInstallment.findMany({ where: { status: 'PENDING', trigger: 'DATE', dueDate: { lte: endOfDay } }, select: { id: true }, take: 500 });
  let invoiced = 0;
  for (const i of items) {
    try {
      if (await invoiceInstallment(i.id)) invoiced++;
    } catch (err) {
      console.error('[billing] date instalment failed', i.id, err);
    }
  }
  return invoiced;
};

// ─── Staff edits ─────────────────────────────────────────────────────

const pendingInstallment = async (id: string) => {
  const i = await prisma.paymentInstallment.findUnique({ where: { id } });
  if (!i) throw notFound('INSTALLMENT_NOT_FOUND');
  if (i.status !== 'PENDING' || i.invoiceId) throw conflict('INSTALLMENT_NOT_PENDING');
  const plan = await findPlan(i.planId);
  if (plan.status !== 'ACTIVE') throw conflict('PLAN_NOT_ACTIVE');
  return { i, plan };
};

export const updateInstallment = async (id: string, input: z.input<typeof installmentInput>) => {
  const body = parse(installmentInput, input);
  const { i, plan } = await pendingInstallment(id);
  const r = await prisma.paymentInstallment.updateMany({
    where: { id: i.id, status: 'PENDING', invoiceId: null },
    data: { label: body.label, trigger: body.trigger, dueDate: body.dueDate ? atNoon(body.dueDate) : null, amountCents: body.amountCents },
  });
  if (!r.count) throw conflict('INSTALLMENT_NOT_PENDING');
  await recomputeTotal(plan.id);
  await catchUp(await findPlan(plan.id));
  return prisma.paymentInstallment.findUniqueOrThrow({ where: { id } });
};

export const addInstallment = async (planId: string, input: z.input<typeof installmentInput>) => {
  const body = parse(installmentInput, input);
  const plan = await findPlan(planId);
  if (plan.status === 'CANCELLED') throw conflict('PLAN_NOT_ACTIVE');
  for (let attempt = 0; attempt < 5; attempt++) {
    const max = await prisma.paymentInstallment.aggregate({ where: { planId }, _max: { seq: true } });
    try {
      const created = await prisma.paymentInstallment.create({
        data: { planId, seq: (max._max.seq ?? 0) + 1, label: body.label, trigger: body.trigger, dueDate: body.dueDate ? atNoon(body.dueDate) : null, amountCents: body.amountCents },
      });
      if (plan.status === 'COMPLETED') await prisma.paymentPlan.update({ where: { id: planId }, data: { status: 'ACTIVE' } });
      await recomputeTotal(planId);
      await catchUp(await findPlan(planId));
      return created;
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
    }
  }
  throw conflict('SEQ_CONFLICT');
};

export const deleteInstallment = async (id: string) => {
  const { i, plan } = await pendingInstallment(id);
  await prisma.paymentInstallment.deleteMany({ where: { id: i.id, status: 'PENDING', invoiceId: null } });
  await recomputeTotal(plan.id);
  await refreshPlanStatus(plan.id);
};

export const updatePlan = async (id: string, data: { title?: string }) => {
  await findPlan(id);
  return prisma.paymentPlan.update({ where: { id }, data: { ...(data.title ? { title: data.title.slice(0, 200) } : {}) } });
};

/** Cancels a plan: pending instalments are cancelled; issued invoices stay (cancel them one by one if needed). */
export const cancelPlan = async (id: string) => {
  const plan = await findPlan(id);
  if (plan.status === 'CANCELLED') return plan;
  await prisma.$transaction([
    prisma.paymentInstallment.updateMany({ where: { planId: id, status: 'PENDING' }, data: { status: 'CANCELLED' } }),
    prisma.paymentPlan.update({ where: { id }, data: { status: 'CANCELLED' } }),
  ]);
  return findPlan(id);
};

export const planWithItems = async (id: string) => {
  const plan = await findPlan(id);
  const installments = await prisma.paymentInstallment.findMany({ where: { planId: id }, orderBy: { seq: 'asc' } });
  return { ...plan, installments };
};

