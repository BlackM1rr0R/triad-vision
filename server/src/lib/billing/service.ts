import crypto from 'node:crypto';
import { z } from 'zod';
import type { ClientInvoice, ClientPayment, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound, parse } from '../http.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyStaff, notifyUser } from '../notifications.js';
import { config } from '../../config.js';
import { formatEur, formatInvoiceDate } from '../invoiceTexts.js';
import {
  LINE_CATEGORIES,
  OPEN_STATUSES,
  PAYMENT_METHODS,
  clientLines,
  computeClientTotals,
  daysPastDue,
  deriveStatus,
  isPastDue,
  nextNumberFrom,
  openCents,
  type ClientInvoiceStatus,
  type ClientLine,
} from './math.js';
import { effectiveVatRate, loadBillingContext, type BillingContext, type ClientBillingSettings } from './settings.js';
import { asBillingLocale, billingTexts, staffBillingTexts, type BillingLocale } from './texts.js';
import { buildClientInvoicePdf, buildReceiptPdf } from './pdf.js';
import { createAutomationTask } from '../automation/tasks.js';

/**
 * Client invoices and payments (private clients). Mirrors the company invoices (routes/admin/invoices.ts):
 * drafts get a placeholder number, sending issues the next TV-KR-YYYY-NNNN number and e-mails the PDF; the
 * status follows the payments (PARTIALLY_PAID / PAID) and the due date (OVERDUE, hourly job). Cancelling keeps
 * the number and turns the invoice into a Stornorechnung (only while nothing was paid). Instalment invoices of
 * a payment plan (plans.ts) go through the same functions.
 */

const DAY = 24 * 60 * 60 * 1000;
export const PORTAL_LINK = '/account/payments';

// ─── Shapes ──────────────────────────────────────────────────────────

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T12:00:00Z`)), 'INVALID_DATE');
/** Calendar days are stored at noon UTC so they never shift a day in any time zone. */
export const atNoon = (s: string) => new Date(`${s}T12:00:00Z`);
export const todayIso = (now = new Date()) => now.toISOString().slice(0, 10);
const emptyToNull = z.literal('').transform(() => null);

export const lineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive().max(100000).refine((n) => Math.round(n * 100) === n * 100, 'MAX_2_DECIMALS'),
  unitPriceCents: z.coerce.number().int().min(-100_000_000).max(100_000_000),
  category: z.enum(LINE_CATEGORIES).default('SERVICE_FEE'),
});

export const invoiceInput = z.object({
  clientId: z.string().trim().min(1).max(40),
  caseId: z.string().trim().max(40).optional().nullable().or(emptyToNull),
  issueDate: day.optional(),
  dueDate: day.optional(),
  serviceFrom: day.optional().nullable().or(emptyToNull),
  serviceTo: day.optional().nullable().or(emptyToNull),
  items: z.array(lineSchema).min(1).max(60),
  note: z.string().trim().max(2000).optional().nullable(),
});
export type InvoiceInput = z.input<typeof invoiceInput>;

export const paymentInput = z.object({
  amountCents: z.coerce.number().int().min(1).max(100_000_000),
  method: z.enum(PAYMENT_METHODS),
  paidAt: day.optional(),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

type ClientUser = { id: string; firstName: string; lastName: string; email: string; address: string | null; city: string | null; locale: string; role: string; isActive: boolean };
const CLIENT_SELECT = { id: true, firstName: true, lastName: true, email: true, address: true, city: true, locale: true, role: true, isActive: true } as const;

export const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

const loadClient = async (id: string): Promise<ClientUser> => {
  const u = await prisma.user.findUnique({ where: { id }, select: CLIENT_SELECT });
  if (!u || u.role !== 'CLIENT') throw notFound('CLIENT_NOT_FOUND');
  return u;
};

export const findInvoice = async (id: string) => {
  const inv = await prisma.clientInvoice.findUnique({ where: { id } });
  if (!inv) throw notFound('INVOICE_NOT_FOUND');
  return inv;
};

export const invoiceView = (inv: ClientInvoice, extra: { clientName?: string; clientEmail?: string; caseNumber?: string | null } = {}) => {
  const items = clientLines(inv.items);
  const t = computeClientTotals(items, inv.vatRate);
  return {
    ...inv,
    number: inv.status === 'DRAFT' ? null : inv.number,
    items,
    taxableCents: t.taxableCents,
    passThroughCents: t.passThroughCents,
    openCents: openCents(inv),
    ...extra,
  };
};
export type ClientInvoiceView = ReturnType<typeof invoiceView>;

export const pdfFileName = (inv: Pick<ClientInvoice, 'number' | 'status'>) =>
  `${inv.status === 'DRAFT' ? 'Rechnung-Entwurf' : inv.status === 'CANCELLED' ? `Storno-${inv.number}` : `Rechnung-${inv.number}`}.pdf`;

// ─── Data building ───────────────────────────────────────────────────

const buildData = (body: z.infer<typeof invoiceInput>, settings: ClientBillingSettings) => {
  const issue = body.issueDate ?? todayIso();
  const issueDate = atNoon(issue);
  const dueDate = body.dueDate ? atNoon(body.dueDate) : new Date(issueDate.getTime() + settings.paymentTermsDays * DAY);
  if (dueDate.getTime() < issueDate.getTime()) throw badRequest('DUE_BEFORE_ISSUE');
  if (body.serviceFrom && body.serviceTo && body.serviceTo < body.serviceFrom) throw badRequest('INVALID_PERIOD');
  const vatRate = effectiveVatRate(settings);
  const servicePeriod = body.serviceFrom || body.serviceTo ? { from: body.serviceFrom ?? body.serviceTo ?? null, to: body.serviceTo ?? body.serviceFrom ?? null } : null;
  const items: ClientLine[] = body.items.map((l) => ({ ...l, ...(servicePeriod ? { servicePeriod } : {}) }));
  const totals = computeClientTotals(items, vatRate);
  if (totals.grossCents <= 0) throw badRequest('NEGATIVE_TOTAL');
  return {
    issueDate,
    dueDate,
    vatRate,
    items: items as unknown as Prisma.InputJsonValue,
    netCents: totals.netCents,
    vatCents: totals.vatCents,
    grossCents: totals.grossCents,
    note: body.note || null,
  };
};

const draftNumber = () => `DRAFT-${crypto.randomUUID().slice(0, 24)}`;

/** The case must belong to the client (or be left out). */
const checkCase = async (clientId: string, caseId: string | null | undefined) => {
  if (!caseId) return null;
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
  if (!c || c.clientId !== clientId) throw badRequest('CASE_NOT_OF_CLIENT');
  return c.id;
};

export const createDraft = async (input: InvoiceInput, actorId: string | null, link: { planId?: string; installmentId?: string; orderId?: string } = {}) => {
  const body = parse(invoiceInput, input);
  await loadClient(body.clientId);
  const caseId = await checkCase(body.clientId, body.caseId);
  const { billing } = await loadBillingContext();
  return prisma.clientInvoice.create({
    data: {
      number: draftNumber(),
      clientId: body.clientId,
      caseId,
      status: 'DRAFT',
      createdById: actorId,
      planId: link.planId ?? null,
      installmentId: link.installmentId ?? null,
      orderId: link.orderId ?? null,
      ...buildData(body, billing),
    },
  });
};

export const updateDraft = async (id: string, input: InvoiceInput) => {
  const body = parse(invoiceInput, input);
  const current = await findInvoice(id);
  if (current.status !== 'DRAFT') throw conflict('INVOICE_NOT_DRAFT');
  await loadClient(body.clientId);
  const caseId = await checkCase(body.clientId, body.caseId);
  const { billing } = await loadBillingContext();
  const r = await prisma.clientInvoice.updateMany({ where: { id, status: 'DRAFT' }, data: { clientId: body.clientId, caseId, ...buildData(body, billing) } });
  if (!r.count) throw conflict('INVOICE_NOT_DRAFT');
  return findInvoice(id);
};

export const deleteDraft = async (id: string) => {
  const current = await findInvoice(id);
  if (current.status !== 'DRAFT') throw conflict('INVOICE_NOT_DRAFT');
  await prisma.clientInvoice.deleteMany({ where: { id, status: 'DRAFT' } });
  if (current.installmentId) await prisma.paymentInstallment.updateMany({ where: { id: current.installmentId, invoiceId: id }, data: { invoiceId: null, status: 'PENDING' } });
};

/** Gives a draft the next number of its issue year (retries when two issues race for the same number). */
const issue = async (id: string, now = new Date()) => {
  const inv = await findInvoice(id);
  if (inv.status !== 'DRAFT') return inv;
  if (!clientLines(inv.items).length) throw badRequest('INVOICE_EMPTY');
  const year = inv.issueDate.getUTCFullYear();
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const rows = await tx.clientInvoice.findMany({ where: { number: { startsWith: `TV-KR-${year}-` } }, select: { number: true } });
        const number = nextNumberFrom(rows.map((r) => r.number), year);
        const r = await tx.clientInvoice.updateMany({ where: { id, status: 'DRAFT' }, data: { number, status: 'SENT', sentAt: now } });
        if (!r.count) throw conflict('INVOICE_NOT_DRAFT');
      });
      // A back-dated invoice may already be past due.
      const issued = await findInvoice(id);
      const status = deriveStatus(issued, now);
      if (status !== issued.status) await prisma.clientInvoice.update({ where: { id }, data: { status } });
      return findInvoice(id);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'P2002' && code !== 'P2034') throw err;
    }
  }
  throw conflict('NUMBER_CONFLICT');
};

// ─── Mail / notifications ────────────────────────────────────────────

const REF_LABEL: Record<BillingLocale, string> = { az: 'Təyinat', de: 'Verwendungszweck', en: 'Reference', ru: 'Назначение платежа' };

const bankText = (ctx: BillingContext) =>
  ctx.bank.iban ? [ctx.bank.accountHolder, `IBAN: ${ctx.bank.iban}`, ctx.bank.bic ? `BIC: ${ctx.bank.bic}` : '', ctx.bank.bank].filter(Boolean).join('\n') : '';

export const renderInvoicePdf = async (inv: ClientInvoice, ctx?: BillingContext, client?: ClientUser) => {
  const c = ctx ?? (await loadBillingContext());
  const u = client ?? (await prisma.user.findUniqueOrThrow({ where: { id: inv.clientId }, select: CLIENT_SELECT }));
  return buildClientInvoicePdf({
    invoice: { ...inv, items: clientLines(inv.items) },
    client: { name: fullName(u), address: u.address, city: u.city, email: u.email, locale: asBillingLocale(u.locale) },
    seller: c.seller,
    bank: c.bank,
    billing: c.billing,
  });
};

export type ClientMailKind = 'sent' | 'reminder1' | 'reminder2' | 'cancelled';

/** E-mails the client (PDF attached except for cancellations get the Storno PDF too) + in-app notification. */
export const mailClient = async (inv: ClientInvoice, kind: ClientMailKind, opts: { note?: string | null; ctx?: BillingContext } = {}) => {
  const ctx = opts.ctx ?? (await loadBillingContext());
  const u = await prisma.user.findUnique({ where: { id: inv.clientId }, select: CLIENT_SELECT });
  if (!u || !u.isActive) return { emailed: false };
  const locale = asBillingLocale(u.locale);
  const t = billingTexts[locale];
  const msg = t[kind]({
    name: u.firstName || fullName(u),
    number: inv.number,
    amount: formatEur(inv.grossCents),
    open: formatEur(Math.max(0, inv.grossCents - inv.paidCents)),
    due: formatInvoiceDate(inv.dueDate, locale),
    days: daysPastDue(inv.dueDate),
    bank: kind === 'cancelled' ? '' : bankText(ctx),
    reference: `${REF_LABEL[locale]}: ${inv.number} ${fullName(u)}`,
    note: opts.note ?? null,
  });
  const pdf = await renderInvoicePdf(inv, ctx, u);
  void sendMail(u.email, `Triad Vision · ${msg.title}`, renderEmail(msg.title, msg.body, { label: t.cta, url: `${config.clientUrl}${PORTAL_LINK}` }), [
    { filename: pdfFileName(inv), content: pdf, contentType: 'application/pdf' },
  ]);
  await notifyUser(u.id, { type: `CLIENT_INVOICE_${kind.toUpperCase()}`, title: msg.title, body: msg.body, link: PORTAL_LINK, caseId: inv.caseId ?? undefined, email: false }).catch(() => undefined);
  return { emailed: true };
};

/** DRAFT → SENT (numbered) and the e-mail; an issued open invoice is simply re-sent. */
export const sendInvoice = async (id: string, now = new Date()) => {
  const current = await findInvoice(id);
  if (current.status === 'PAID' || current.status === 'CANCELLED') throw conflict('INVOICE_CLOSED');
  const inv = current.status === 'DRAFT' ? await issue(id, now) : current;
  if (inv.installmentId) await syncInstallment(inv);
  const { emailed } = await mailClient(inv, 'sent');
  return { invoice: inv, emailed, resent: current.status !== 'DRAFT' };
};

/** Creates, numbers and sends an invoice in one go (instalments, package orders). */
export const createAndSendInvoice = async (input: InvoiceInput, actorId: string | null, link: { planId?: string; installmentId?: string; orderId?: string } = {}) => {
  const draft = await createDraft(input, actorId, link);
  return (await sendInvoice(draft.id)).invoice;
};

// ─── Payments ────────────────────────────────────────────────────────

/** Receipt number: invoice number + "-Z" + the payment's position among the invoice's payments. */
export const receiptNumber = async (p: ClientPayment) => {
  if (!p.invoiceId) return `Z-${p.id.slice(-8).toUpperCase()}`;
  const inv = await prisma.clientInvoice.findUnique({ where: { id: p.invoiceId }, select: { number: true } });
  const earlier = await prisma.clientPayment.count({ where: { invoiceId: p.invoiceId, OR: [{ createdAt: { lt: p.createdAt } }, { createdAt: p.createdAt, id: { lt: p.id } }] } });
  return `${inv?.number ?? 'TV-KR'}-Z${earlier + 1}`;
};

export const renderReceiptPdf = async (p: ClientPayment, ctx?: BillingContext) => {
  const c = ctx ?? (await loadBillingContext());
  const u = await prisma.user.findUniqueOrThrow({ where: { id: p.clientId }, select: CLIENT_SELECT });
  const inv = p.invoiceId ? await prisma.clientInvoice.findUnique({ where: { id: p.invoiceId } }) : null;
  // Paid amount as of this payment (later payments are not on this receipt).
  const paidUpTo = p.invoiceId
    ? ((await prisma.clientPayment.aggregate({ where: { invoiceId: p.invoiceId, OR: [{ createdAt: { lt: p.createdAt } }, { id: p.id }] }, _sum: { amountCents: true } }))._sum.amountCents ?? 0)
    : p.amountCents;
  return buildReceiptPdf({
    receiptNo: await receiptNumber(p),
    payment: p,
    invoice: { number: inv?.number ?? '—', grossCents: inv?.grossCents ?? p.amountCents, paidCents: paidUpTo, issueDate: inv?.issueDate ?? p.paidAt },
    client: { name: fullName(u), address: u.address, city: u.city, email: u.email, locale: asBillingLocale(u.locale) },
    seller: c.seller,
    bank: c.bank,
    footer: c.billing.footer,
  });
};

/**
 * Records a (partial) payment. Optimistic update on paidCents so two payments recorded at the same moment can
 * never both pass the "not more than open" check; the status follows deriveStatus.
 */
export const recordPayment = async (invoiceId: string, input: z.input<typeof paymentInput>, actorId: string | null, now = new Date()) => {
  const body = parse(paymentInput, input);
  const paidAt = body.paidAt ? atNoon(body.paidAt) : now;
  if (paidAt.getTime() > now.getTime() + DAY) throw badRequest('PAID_IN_FUTURE');
  let payment: ClientPayment | null = null;
  let inv: ClientInvoice | null = null;
  for (let attempt = 0; attempt < 5 && !payment; attempt++) {
    const current = await findInvoice(invoiceId);
    if (!OPEN_STATUSES.includes(current.status as ClientInvoiceStatus)) throw conflict('INVOICE_NOT_OPEN');
    const open = current.grossCents - current.paidCents;
    if (body.amountCents > open) throw badRequest('AMOUNT_EXCEEDS_OPEN');
    const paidCents = current.paidCents + body.amountCents;
    const status = deriveStatus({ ...current, paidCents }, now);
    payment = await prisma.$transaction(async (tx) => {
      const r = await tx.clientInvoice.updateMany({
        where: { id: current.id, paidCents: current.paidCents, status: current.status },
        data: { paidCents, status, paidAt: status === 'PAID' ? paidAt : null },
      });
      if (!r.count) return null;
      return tx.clientPayment.create({
        data: { clientId: current.clientId, invoiceId: current.id, caseId: current.caseId, amountCents: body.amountCents, currency: current.currency, method: body.method, paidAt, reference: body.reference || null, note: body.note || null, recordedById: actorId },
      });
    });
    if (payment) inv = await findInvoice(current.id);
  }
  if (!payment || !inv) throw conflict('PAYMENT_CONFLICT');
  await syncInstallment(inv);
  await mailReceipt(payment, inv);
  return { payment, invoice: inv };
};

const mailReceipt = async (p: ClientPayment, inv: ClientInvoice) => {
  try {
    const u = await prisma.user.findUnique({ where: { id: p.clientId }, select: CLIENT_SELECT });
    if (!u?.isActive) return;
    const locale = asBillingLocale(u.locale);
    const t = billingTexts[locale];
    const msg = (inv.status === 'PAID' ? t.paid : t.partial)({
      name: u.firstName || fullName(u),
      number: inv.number,
      amount: formatEur(p.amountCents),
      open: formatEur(Math.max(0, inv.grossCents - inv.paidCents)),
      due: formatInvoiceDate(inv.dueDate, locale),
    });
    const pdf = await renderReceiptPdf(p);
    void sendMail(u.email, `Triad Vision · ${msg.title}`, renderEmail(msg.title, msg.body, { label: t.cta, url: `${config.clientUrl}${PORTAL_LINK}` }), [
      { filename: `Quittung-${await receiptNumber(p)}.pdf`, content: pdf, contentType: 'application/pdf' },
    ]);
    await notifyUser(u.id, { type: 'CLIENT_PAYMENT_RECEIVED', title: msg.title, body: msg.body, link: PORTAL_LINK, caseId: inv.caseId ?? undefined, email: false }).catch(() => undefined);
  } catch (err) {
    console.error('[billing] receipt mail failed', p.id, err);
  }
};

/** Removes a wrongly recorded payment (ADMIN): the invoice and its instalment go back to open. */
export const voidPayment = async (paymentId: string, now = new Date()) => {
  const p = await prisma.clientPayment.findUnique({ where: { id: paymentId } });
  if (!p) throw notFound('PAYMENT_NOT_FOUND');
  if (!p.invoiceId) {
    await prisma.clientPayment.delete({ where: { id: p.id } });
    return null;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const inv = await findInvoice(p.invoiceId);
    if (inv.status === 'CANCELLED') throw conflict('INVOICE_CANCELLED');
    const paidCents = Math.max(0, inv.paidCents - p.amountCents);
    const status = deriveStatus({ ...inv, status: 'SENT', paidCents }, now);
    const ok = await prisma.$transaction(async (tx) => {
      const r = await tx.clientInvoice.updateMany({ where: { id: inv.id, paidCents: inv.paidCents }, data: { paidCents, status, paidAt: status === 'PAID' ? inv.paidAt : null } });
      if (!r.count) return false;
      await tx.clientPayment.delete({ where: { id: p.id } });
      return true;
    });
    if (ok) {
      const updated = await findInvoice(inv.id);
      await syncInstallment(updated);
      return updated;
    }
  }
  throw conflict('PAYMENT_CONFLICT');
};

// ─── Cancellation ────────────────────────────────────────────────────

export const cancelInvoice = async (id: string, reason: string | null) => {
  const current = await findInvoice(id);
  if (current.status === 'DRAFT') throw conflict('INVOICE_IS_DRAFT');
  if (current.status === 'CANCELLED') throw conflict('INVOICE_CANCELLED');
  if (current.paidCents > 0) throw conflict('INVOICE_HAS_PAYMENTS');
  const storno = `Stornorechnung: Rechnung ${current.number} wurde am ${formatInvoiceDate(new Date())} storniert.${reason ? ` Grund: ${reason}` : ''}`;
  const note = [current.note, storno].filter(Boolean).join('\n\n').slice(0, 4000);
  const r = await prisma.clientInvoice.updateMany({ where: { id, status: { in: OPEN_STATUSES }, paidCents: 0 }, data: { status: 'CANCELLED', note } });
  if (!r.count) throw conflict('INVOICE_NOT_OPEN');
  const inv = await findInvoice(id);
  // The instalment can be invoiced again (staff: "invoice now").
  if (inv.installmentId) await prisma.paymentInstallment.updateMany({ where: { id: inv.installmentId, invoiceId: inv.id }, data: { invoiceId: null, status: 'PENDING' } });
  await mailClient(inv, 'cancelled', { note: reason });
  return inv;
};

// ─── Instalment status follows its invoice ───────────────────────────

const INSTALLMENT_OF: Partial<Record<ClientInvoiceStatus, string>> = { SENT: 'INVOICED', PARTIALLY_PAID: 'INVOICED', OVERDUE: 'OVERDUE', PAID: 'PAID' };

export const syncInstallment = async (inv: Pick<ClientInvoice, 'id' | 'status' | 'installmentId' | 'planId'>) => {
  if (!inv.installmentId) return;
  const status = INSTALLMENT_OF[inv.status as ClientInvoiceStatus];
  if (status) await prisma.paymentInstallment.updateMany({ where: { id: inv.installmentId, invoiceId: inv.id }, data: { status } });
  if (inv.planId) await refreshPlanStatus(inv.planId);
};

/** A plan is COMPLETED once every (not cancelled) instalment is paid; back to ACTIVE when a payment is voided. */
export const refreshPlanStatus = async (planId: string) => {
  const plan = await prisma.paymentPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.status === 'CANCELLED') return plan;
  const items = await prisma.paymentInstallment.findMany({ where: { planId, status: { not: 'CANCELLED' } }, select: { status: true } });
  const done = items.length > 0 && items.every((i) => i.status === 'PAID');
  const status = done ? 'COMPLETED' : 'ACTIVE';
  if (status !== plan.status) await prisma.paymentPlan.update({ where: { id: planId }, data: { status } });
  return { ...plan, status };
};

// ─── Overviews ───────────────────────────────────────────────────────

const totalsOf = (invoices: ClientInvoice[]) => {
  const live = invoices.filter((i) => i.status !== 'DRAFT' && i.status !== 'CANCELLED');
  return {
    invoicedCents: live.reduce((a, i) => a + i.grossCents, 0),
    paidCents: live.reduce((a, i) => a + i.paidCents, 0),
    openCents: live.reduce((a, i) => a + openCents(i), 0),
    overdueCents: live.filter((i) => i.status === 'OVERDUE').reduce((a, i) => a + openCents(i), 0),
    overdueCount: live.filter((i) => i.status === 'OVERDUE').length,
    draftCount: invoices.filter((i) => i.status === 'DRAFT').length,
  };
};

const plansWithItems = async (where: Prisma.PaymentPlanWhereInput) => {
  const plans = await prisma.paymentPlan.findMany({ where, orderBy: { createdAt: 'desc' } });
  const items = plans.length ? await prisma.paymentInstallment.findMany({ where: { planId: { in: plans.map((p) => p.id) } }, orderBy: [{ planId: 'asc' }, { seq: 'asc' }] }) : [];
  return plans.map((p) => ({ ...p, installments: items.filter((i) => i.planId === p.id) }));
};

/** Staff: everything billing of one case (and the client's invoices without a case). */
export const caseBilling = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, clientId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const where: Prisma.ClientInvoiceWhereInput = { clientId: c.clientId, OR: [{ caseId: c.id }, { caseId: null }] };
  const [invoices, payments, plans, client] = await Promise.all([
    prisma.clientInvoice.findMany({ where, orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }] }),
    prisma.clientPayment.findMany({ where: { clientId: c.clientId, OR: [{ caseId: c.id }, { caseId: null }] }, orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }] }),
    plansWithItems({ clientId: c.clientId, OR: [{ caseId: c.id }, { caseId: null }] }),
    loadClient(c.clientId),
  ]);
  const numbers = new Map(invoices.map((i) => [i.id, i.number]));
  return {
    case: { id: c.id, number: c.number },
    client: { id: client.id, name: fullName(client), email: client.email, locale: client.locale },
    invoices: invoices.map((i) => invoiceView(i)),
    payments: payments.map((p) => ({ ...p, invoiceNumber: p.invoiceId ? (numbers.get(p.invoiceId) ?? null) : null })),
    plans,
    totals: totalsOf(invoices),
  };
};

/** Client portal: issued invoices, payments, plans, balance and how to pay. */
export const clientBilling = async (clientId: string) => {
  const [invoices, payments, plans, ctx] = await Promise.all([
    prisma.clientInvoice.findMany({ where: { clientId, status: { not: 'DRAFT' } }, orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }] }),
    prisma.clientPayment.findMany({ where: { clientId }, orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }] }),
    plansWithItems({ clientId, status: { not: 'CANCELLED' } }),
    loadBillingContext(),
  ]);
  const numbers = new Map(invoices.map((i) => [i.id, i.number]));
  return {
    invoices: invoices.map((i) => invoiceView(i)),
    payments: payments.map(({ recordedById: _r, note: _n, ...p }) => ({ ...p, invoiceNumber: p.invoiceId ? (numbers.get(p.invoiceId) ?? null) : null })),
    plans: plans.map((p) => ({ id: p.id, title: p.title, totalCents: p.totalCents, currency: p.currency, status: p.status, caseId: p.caseId, installments: p.installments })),
    totals: totalsOf(invoices),
    bank: ctx.bank.iban ? ctx.bank : null,
    seller: { name: ctx.seller.name },
  };
};

/** Open invoices of a client for the portal's next-step card (oldest due first). */
export const openInvoicesOf = (clientId: string) =>
  prisma.clientInvoice.findMany({ where: { clientId, status: { in: OPEN_STATUSES } }, orderBy: { dueDate: 'asc' }, select: { id: true, number: true, grossCents: true, paidCents: true, dueDate: true, status: true }, take: 20 });

// ─── Admin list / CSV ────────────────────────────────────────────────

export const listQuery = z.object({
  status: z.enum(['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  overdue: z.enum(['1', 'true']).optional(),
  clientId: z.string().max(40).optional(),
  caseId: z.string().max(40).optional(),
  from: day.optional(),
  to: day.optional(),
  q: z.string().trim().max(80).optional(),
});

export const listInvoices = async (q: z.infer<typeof listQuery>, take = 500) => {
  const and: Prisma.ClientInvoiceWhereInput[] = [];
  if (q.status) and.push({ status: q.status });
  if (q.overdue) and.push({ status: 'OVERDUE' });
  if (q.clientId) and.push({ clientId: q.clientId });
  if (q.caseId) and.push({ caseId: q.caseId });
  if (q.from || q.to) and.push({ issueDate: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59Z`) } : {}) } });
  if (q.q) {
    const words = q.q.split(/\s+/).filter(Boolean).slice(0, 3);
    const users = await prisma.user.findMany({
      where: { role: 'CLIENT', AND: words.map((w) => ({ OR: [{ firstName: { contains: w } }, { lastName: { contains: w } }, { email: { contains: w } }] })) },
      select: { id: true },
      take: 500,
    });
    and.push({ OR: [{ number: { contains: q.q } }, ...(users.length ? [{ clientId: { in: users.map((u) => u.id) } }] : [])] });
  }
  const where: Prisma.ClientInvoiceWhereInput = { AND: and };
  const invoices = await prisma.clientInvoice.findMany({ where, orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }], take });
  const [clients, cases] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(invoices.map((i) => i.clientId))] } }, select: { id: true, firstName: true, lastName: true, email: true } }),
    prisma.case.findMany({ where: { id: { in: [...new Set(invoices.map((i) => i.caseId).filter((x): x is string => !!x))] } }, select: { id: true, number: true } }),
  ]);
  const cMap = new Map(clients.map((c) => [c.id, c]));
  const caseMap = new Map(cases.map((c) => [c.id, c.number]));
  const rows = invoices.map((i) => {
    const c = cMap.get(i.clientId);
    return invoiceView(i, { clientName: c ? fullName(c) : '—', clientEmail: c?.email ?? '', caseNumber: i.caseId ? (caseMap.get(i.caseId) ?? null) : null });
  });
  return { invoices: rows, totals: { ...totalsOf(invoices), count: invoices.length } };
};

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const euro = (c: number) => (c / 100).toFixed(2).replace('.', ',');

/** Semicolon CSV with BOM and German decimals (opens directly in Excel / DATEV-style tools). */
export const invoicesCsv = (rows: Awaited<ReturnType<typeof listInvoices>>['invoices']) => {
  const head = ['Rechnungsnummer', 'Rechnungsdatum', 'Fällig', 'Kunde', 'E-Mail', 'Fall', 'Netto', 'USt-Satz', 'USt', 'Durchlaufende Posten', 'Brutto', 'Bezahlt', 'Offen', 'Status'];
  const lines = rows.map((r) =>
    [r.number ?? 'ENTWURF', todayIso(r.issueDate), todayIso(r.dueDate), r.clientName ?? '', r.clientEmail ?? '', r.caseNumber ?? '', euro(r.taxableCents), r.vatRate, euro(r.vatCents), euro(r.passThroughCents), euro(r.grossCents), euro(r.paidCents), euro(r.openCents), r.status]
      .map(csvCell)
      .join(';'),
  );
  return `﻿${[head.join(';'), ...lines].join('\r\n')}\r\n`;
};

// ─── Job: overdue + reminders + escalation ───────────────────────────

const claim = async (key: string) => {
  try {
    await prisma.reminderLog.create({ data: { key } });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
};

/**
 * Hourly: open invoices past their due day become OVERDUE; the client gets the first reminder `reminder1Days`
 * after the due day (default 3), the second after `reminder2Days` (default 10); after that the assigned case
 * manager (or the admins) get a team task once. Idempotent (ReminderLog keys + reminderCount).
 */
export const runClientInvoiceReminders = async (now = new Date()) => {
  const result = { markedOverdue: 0, reminders: 0, escalated: 0 };
  const due = await prisma.clientInvoice.findMany({ where: { status: { in: ['SENT', 'PARTIALLY_PAID'] }, dueDate: { lt: now } }, select: { id: true, dueDate: true, status: true } });
  for (const inv of due) {
    if (!isPastDue(inv.dueDate, now)) continue;
    const r = await prisma.clientInvoice.updateMany({ where: { id: inv.id, status: inv.status }, data: { status: 'OVERDUE' } });
    if (r.count) {
      result.markedOverdue++;
      await syncInstallment(await findInvoice(inv.id));
    }
  }
  const overdue = await prisma.clientInvoice.findMany({ where: { status: 'OVERDUE', reminderCount: { lt: 3 } } });
  if (!overdue.length) return result;
  const ctx = await loadBillingContext();
  const s = ctx.billing;
  for (const inv of overdue) {
    const days = daysPastDue(inv.dueDate, now);
    if (inv.reminderCount === 0 && days >= s.reminder1Days && (await claim(`client-invoice-reminder-1:${inv.id}`))) {
      await prisma.clientInvoice.update({ where: { id: inv.id }, data: { reminderCount: 1, remindedAt: now } });
      await mailClient(inv, 'reminder1', { ctx });
      result.reminders++;
    } else if (inv.reminderCount === 1 && days >= s.reminder2Days && (await claim(`client-invoice-reminder-2:${inv.id}`))) {
      await prisma.clientInvoice.update({ where: { id: inv.id }, data: { reminderCount: 2, remindedAt: now } });
      await mailClient(inv, 'reminder2', { ctx });
      result.reminders++;
    } else if (inv.reminderCount === 2 && days >= s.reminder2Days + 1 && (await claim(`client-invoice-escalate:${inv.id}`))) {
      await prisma.clientInvoice.update({ where: { id: inv.id }, data: { reminderCount: 3 } });
      await escalate(inv, days);
      result.escalated++;
    }
  }
  return result;
};

const escalate = async (inv: ClientInvoice, days: number) => {
  const u = await prisma.user.findUnique({ where: { id: inv.clientId }, select: { firstName: true, lastName: true } });
  const kase = inv.caseId ? await prisma.case.findUnique({ where: { id: inv.caseId }, select: { assignedStaffId: true } }) : null;
  const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true }, take: 3, orderBy: { createdAt: 'asc' } });
  const assignees = kase?.assignedStaffId ? [kase.assignedStaffId] : admins.map((a) => a.id);
  const msg = staffBillingTexts.escalation({ number: inv.number, name: u ? fullName(u) : '—', open: formatEur(inv.grossCents - inv.paidCents), days });
  try {
    await createAutomationTask({ title: msg.title, description: msg.body, assigneeIds: assignees, dueAt: new Date(Date.now() + 2 * DAY), priority: 'HIGH', caseId: inv.caseId });
  } catch (err) {
    console.error('[billing] escalation task failed', inv.id, err);
  }
  await notifyStaff(msg.title, msg.body, { caseId: inv.caseId ?? undefined, link: inv.caseId ? `/admin/cases/${inv.caseId}?tab=finance` : '/admin/client-invoices', type: 'CLIENT_INVOICE_ESCALATION' });
};

