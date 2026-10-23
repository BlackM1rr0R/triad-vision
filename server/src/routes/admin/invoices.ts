import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { Company, Invoice, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { HttpError, badRequest, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { renderEmail, sendMail } from '../../lib/mailer.js';
import { notifyUser } from '../../lib/notifications.js';
import {
  buildInvoicePdf,
  computeTotals,
  readInvoicing,
  readLegal,
  type InvoiceLine,
  type InvoicingSettings,
} from '../../lib/invoicePdf.js';
import { asInvoiceLocale, formatEur, formatInvoiceDate, invoiceTexts } from '../../lib/invoiceTexts.js';
import { config } from '../../config.js';
import { awardInvoiceCommission } from '../../lib/agents/commissions.js';
import { requestMaskGroups } from '../../lib/privacy/mask.js';

// Admin: invoices — mounted at /api/admin/invoices (ADMIN+, gated in admin/index.ts)
export const adminInvoicesRouter = Router();

const DAY = 24 * 60 * 60 * 1000;
export const INVOICE_SETTING_KEY = 'invoicing';
export const LEGAL_SETTING_KEY = 'legal';
const COMPANY_LINK = '/company/invoices';

// ─── Shared services (also used by the overdue job and the company portal) ──

export const loadInvoiceSettings = async () => {
  const rows = await prisma.setting.findMany({ where: { key: { in: [INVOICE_SETTING_KEY, LEGAL_SETTING_KEY] } } });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const invoicing = readInvoicing(byKey[INVOICE_SETTING_KEY]);
  const { seller, missing } = readLegal(byKey[LEGAL_SETTING_KEY]);
  return { invoicing, seller, legalMissing: missing };
};

/** Lines stored in Invoice.items, tolerant of older/malformed rows. */
export const invoiceLines = (items: Prisma.JsonValue): InvoiceLine[] =>
  Array.isArray(items)
    ? items
        .filter((l): l is Prisma.JsonObject => !!l && typeof l === 'object' && !Array.isArray(l))
        .map((l) => ({
          description: String(l.description ?? ''),
          quantity: Number(l.quantity ?? 0),
          unitPriceCents: Math.round(Number(l.unitPriceCents ?? 0)),
          servicePeriod: (l.servicePeriod as InvoiceLine['servicePeriod']) ?? null,
        }))
    : [];

export const renderInvoicePdf = async (invoice: Invoice & { company: Company }, settings?: Awaited<ReturnType<typeof loadInvoiceSettings>>) => {
  const s = settings ?? (await loadInvoiceSettings());
  return buildInvoicePdf({
    invoice: { ...invoice, items: invoiceLines(invoice.items) },
    company: invoice.company,
    seller: s.seller,
    invoicing: s.invoicing,
  });
};

export const pdfFileName = (inv: Pick<Invoice, 'number' | 'status'>) =>
  `${inv.status === 'DRAFT' ? 'Rechnung-Entwurf' : inv.status === 'CANCELLED' ? `Storno-${inv.number}` : `Rechnung-${inv.number}`}.pdf`;

/**
 * Who receives invoice mail for a company: the company's own e-mail (billing address) or, when that
 * is empty, its first active employer account. Language: the employer users' language, else German.
 */
const companyRecipients = async (company: Company) => {
  const users = await prisma.user.findMany({
    where: { companyId: company.id, role: 'COMPANY', isActive: true },
    select: { id: true, email: true, locale: true },
    orderBy: { createdAt: 'asc' },
  });
  const billing = company.email?.trim() || users[0]?.email || '';
  const locale = asInvoiceLocale(users.find((u) => u.email === billing)?.locale ?? users[0]?.locale ?? 'de');
  return { users, billing, locale };
};

export type CompanyInvoiceMail = 'sent' | 'overdue' | 'reminder' | 'cancelled';

/** Emails the billing address (PDF attached) and leaves an in-app notification for each employer user. */
export const notifyCompanyAboutInvoice = async (
  invoice: Invoice & { company: Company },
  kind: CompanyInvoiceMail,
  opts: { days?: number; attachPdf?: boolean; note?: string | null } = {},
) => {
  const { users, billing, locale } = await companyRecipients(invoice.company);
  const ctx = {
    number: invoice.number,
    company: invoice.company.name,
    amount: formatEur(invoice.grossCents),
    due: formatInvoiceDate(invoice.dueDate, locale),
    days: opts.days,
    note: opts.note ?? null,
  };
  const t = invoiceTexts[locale];
  const msg = t[kind](ctx);
  if (billing) {
    const attachments = opts.attachPdf !== false ? [{ filename: pdfFileName(invoice), content: await renderInvoicePdf(invoice), contentType: 'application/pdf' }] : undefined;
    void sendMail(billing, `Triad Vision · ${msg.title}`, renderEmail(msg.title, msg.body, { label: t.cta, url: `${config.clientUrl}${COMPANY_LINK}` }), attachments);
  }
  for (const u of users) {
    const um = invoiceTexts[asInvoiceLocale(u.locale)][kind]({ ...ctx, due: formatInvoiceDate(invoice.dueDate, asInvoiceLocale(u.locale)) });
    // The billing mailbox already got the email; users get in-app + push only.
    await notifyUser(u.id, { type: `INVOICE_${kind.toUpperCase()}`, title: um.title, body: um.body, link: COMPANY_LINK, email: false }).catch(() => undefined);
  }
  return { emailed: !!billing };
};

// ─── Validation ──────────────────────────────────────────────────────

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T12:00:00Z`)), 'INVALID_DATE');
/** Calendar days are stored at noon UTC so they never shift a day in any time zone. */
const atNoon = (s: string) => new Date(`${s}T12:00:00Z`);
const todayIso = () => new Date().toISOString().slice(0, 10);

const lineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive().max(100000).refine((n) => Math.round(n * 100) === n * 100, 'MAX_2_DECIMALS'),
  unitPriceCents: z.coerce.number().int().min(-100_000_000).max(100_000_000),
});

const invoiceInput = z.object({
  companyId: z.string().min(1).max(64),
  issueDate: day.optional(),
  dueDate: day.optional(),
  vatRate: z.coerce.number().int().min(0).max(100).optional(),
  items: z.array(lineSchema).min(1).max(60),
  servicePeriodFrom: day.optional().nullable().or(z.literal('').transform(() => null)),
  servicePeriodTo: day.optional().nullable().or(z.literal('').transform(() => null)),
  note: z.string().trim().max(2000).optional().nullable(),
});

const buildData = (body: z.infer<typeof invoiceInput>, settings: InvoicingSettings) => {
  const issue = body.issueDate ?? todayIso();
  const issueDate = atNoon(issue);
  const dueDate = body.dueDate ? atNoon(body.dueDate) : new Date(issueDate.getTime() + settings.paymentTermsDays * DAY);
  if (dueDate.getTime() < issueDate.getTime()) throw badRequest('DUE_BEFORE_ISSUE');
  if (body.servicePeriodFrom && body.servicePeriodTo && body.servicePeriodTo < body.servicePeriodFrom) throw badRequest('INVALID_PERIOD');
  // Small businesses (§19 UStG) never charge VAT.
  const vatRate = settings.smallBusiness ? 0 : (body.vatRate ?? settings.defaultVatRate);
  const servicePeriod = body.servicePeriodFrom || body.servicePeriodTo ? { from: body.servicePeriodFrom ?? null, to: body.servicePeriodTo ?? null } : null;
  const items = body.items.map((l) => ({ ...l, ...(servicePeriod ? { servicePeriod } : {}) }));
  const totals = computeTotals(items, vatRate);
  if (totals.grossCents < 0) throw badRequest('NEGATIVE_TOTAL');
  return { issueDate, dueDate, vatRate, items: items as Prisma.InputJsonValue, ...totals, note: body.note || null };
};

const draftNumber = () => `DRAFT-${crypto.randomUUID()}`;

/** Next number in the yearly sequence TV-RE-YYYY-NNNN (numeric maximum, not string order). */
export const nextInvoiceNumber = async (tx: Prisma.TransactionClient, year: number) => {
  const prefix = `TV-RE-${year}-`;
  const rows = await tx.invoice.findMany({ where: { number: { startsWith: prefix } }, select: { number: true } });
  const max = rows.reduce((m, r) => {
    const n = Number(r.number.slice(prefix.length));
    return Number.isInteger(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
};

const withCompany = { company: true } as const;

const findInvoice = async (id: string) => {
  const inv = await prisma.invoice.findUnique({ where: { id }, include: withCompany });
  if (!inv) throw notFound('INVOICE_NOT_FOUND');
  return inv;
};

const view = (inv: Invoice & { company: Company }) => ({
  ...inv,
  number: inv.status === 'DRAFT' ? null : inv.number,
  items: invoiceLines(inv.items),
  company: { id: inv.company.id, name: inv.company.name, email: inv.company.email, city: inv.company.city, vatId: inv.company.vatId },
});

// ─── Settings ────────────────────────────────────────────────────────

adminInvoicesRouter.get('/settings', async (_req, res) => {
  res.json(await loadInvoiceSettings());
});

const settingsSchema = z.object({
  accountHolder: z.string().trim().max(160).default(''),
  iban: z
    .string()
    .trim()
    .max(42)
    .transform((s) => s.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim())
    .refine((s) => s === '' || /^[A-Z]{2}\d{2}[A-Z0-9 ]{10,40}$/.test(s), 'INVALID_IBAN')
    .default(''),
  bic: z.string().trim().toUpperCase().max(11).refine((s) => s === '' || /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(s), 'INVALID_BIC').default(''),
  bank: z.string().trim().max(160).default(''),
  defaultVatRate: z.coerce.number().int().min(0).max(100).default(19),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(14),
  smallBusiness: z.boolean().default(false),
  footer: z.string().trim().max(500).default(''),
});

adminInvoicesRouter.put('/settings', async (req, res) => {
  const raw = { ...((req.body?.invoicing ?? req.body ?? {}) as Record<string, unknown>) };
  // Masked bank details (sensitive-data settings) come back without iban / bic: keep the stored ones.
  if (requestMaskGroups(res).has('IBAN')) {
    const current = (await loadInvoiceSettings()).invoicing;
    for (const k of ['iban', 'bic'] as const) if (raw[k] === undefined) raw[k] = current[k];
  }
  const value = parse(settingsSchema, raw);
  await prisma.setting.upsert({ where: { key: INVOICE_SETTING_KEY }, create: { key: INVOICE_SETTING_KEY, value }, update: { value } });
  await audit(req, 'INVOICE_SETTINGS', INVOICE_SETTING_KEY);
  res.json(await loadInvoiceSettings());
});

adminInvoicesRouter.get('/companies', async (_req, res) => {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, legalForm: true, email: true, city: true, address: true, vatId: true, status: true },
    orderBy: { name: 'asc' },
    take: 2000,
  });
  res.json({ companies });
});

// ─── List + totals ──────────────────────────────────────────────────

adminInvoicesRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
      companyId: z.string().max(64).optional(),
      from: day.optional(),
      to: day.optional(),
      q: z.string().trim().max(60).optional(),
    }),
    req.query,
  );
  const where: Prisma.InvoiceWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.companyId ? { companyId: q.companyId } : {}),
    ...(q.from || q.to ? { issueDate: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59Z`) } : {}) } } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q } }, { company: { name: { contains: q.q } } }] } : {}),
  };
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [invoices, open, overdue, paid, drafts] = await Promise.all([
    prisma.invoice.findMany({ where, include: withCompany, orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }], take: 500 }),
    prisma.invoice.aggregate({ where: { status: { in: ['SENT', 'OVERDUE'] } }, _sum: { grossCents: true }, _count: { _all: true } }),
    prisma.invoice.aggregate({ where: { status: 'OVERDUE' }, _sum: { grossCents: true }, _count: { _all: true } }),
    prisma.invoice.aggregate({ where: { status: 'PAID', paidAt: { gte: monthStart } }, _sum: { grossCents: true }, _count: { _all: true } }),
    prisma.invoice.count({ where: { status: 'DRAFT' } }),
  ]);
  res.json({
    invoices: invoices.map(view),
    totals: {
      openCents: open._sum.grossCents ?? 0,
      openCount: open._count._all,
      overdueCents: overdue._sum.grossCents ?? 0,
      overdueCount: overdue._count._all,
      paidThisMonthCents: paid._sum.grossCents ?? 0,
      paidThisMonthCount: paid._count._all,
      draftCount: drafts,
    },
  });
});

adminInvoicesRouter.get('/:id', async (req, res) => {
  res.json({ invoice: view(await findInvoice(req.params.id)) });
});

adminInvoicesRouter.get('/:id/pdf', async (req, res) => {
  const inv = await findInvoice(req.params.id);
  const pdf = await renderInvoicePdf(inv);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${pdfFileName(inv)}"`);
  res.send(pdf);
});

// ─── Drafts ─────────────────────────────────────────────────────────

const requireCompany = async (id: string) => {
  const c = await prisma.company.findUnique({ where: { id }, select: { id: true } });
  if (!c) throw notFound('COMPANY_NOT_FOUND');
};

adminInvoicesRouter.post('/', async (req, res) => {
  const body = parse(invoiceInput, req.body);
  await requireCompany(body.companyId);
  const { invoicing } = await loadInvoiceSettings();
  const inv = await prisma.invoice.create({
    data: { number: draftNumber(), companyId: body.companyId, status: 'DRAFT', ...buildData(body, invoicing) },
    include: withCompany,
  });
  await audit(req, 'INVOICE_CREATE', inv.id, { companyId: inv.companyId, grossCents: inv.grossCents });
  res.status(201).json({ invoice: view(inv) });
});

adminInvoicesRouter.put('/:id', async (req, res) => {
  const body = parse(invoiceInput, req.body);
  const current = await findInvoice(req.params.id);
  if (current.status !== 'DRAFT') throw new HttpError(409, 'INVOICE_NOT_DRAFT');
  await requireCompany(body.companyId);
  const { invoicing } = await loadInvoiceSettings();
  const updated = await prisma.invoice.updateMany({
    where: { id: current.id, status: 'DRAFT' },
    data: { companyId: body.companyId, ...buildData(body, invoicing) },
  });
  if (updated.count === 0) throw new HttpError(409, 'INVOICE_NOT_DRAFT');
  await audit(req, 'INVOICE_UPDATE', current.id);
  res.json({ invoice: view(await findInvoice(current.id)) });
});

adminInvoicesRouter.delete('/:id', async (req, res) => {
  const current = await findInvoice(req.params.id);
  if (current.status !== 'DRAFT') throw new HttpError(409, 'INVOICE_NOT_DRAFT');
  await prisma.invoice.deleteMany({ where: { id: current.id, status: 'DRAFT' } });
  await audit(req, 'INVOICE_DELETE', current.id);
  res.json({ ok: true });
});

adminInvoicesRouter.post('/:id/duplicate', async (req, res) => {
  const src = await findInvoice(req.params.id);
  const { invoicing } = await loadInvoiceSettings();
  const lines = invoiceLines(src.items).map(({ servicePeriod: _p, ...l }) => l);
  const data = buildData(
    { companyId: src.companyId, items: lines, vatRate: src.vatRate, note: src.status === 'CANCELLED' ? null : src.note },
    invoicing,
  );
  const inv = await prisma.invoice.create({ data: { number: draftNumber(), companyId: src.companyId, status: 'DRAFT', ...data }, include: withCompany });
  await audit(req, 'INVOICE_DUPLICATE', inv.id, { from: src.id });
  res.status(201).json({ invoice: view(inv) });
});

// ─── Lifecycle ──────────────────────────────────────────────────────

adminInvoicesRouter.post('/:id/send', async (req, res) => {
  const current = await findInvoice(req.params.id);
  if (current.status === 'PAID' || current.status === 'CANCELLED') throw new HttpError(409, 'INVOICE_CLOSED');
  if (current.status === 'DRAFT') {
    if (invoiceLines(current.items).length === 0) throw badRequest('INVOICE_EMPTY');
    const year = current.issueDate.getUTCFullYear();
    // Two admins sending at once can compute the same number; the unique index rejects one, which retries.
    let sent = false;
    for (let attempt = 0; attempt < 5 && !sent; attempt++) {
      try {
        await prisma.$transaction(async (tx) => {
          const number = await nextInvoiceNumber(tx, year);
          const r = await tx.invoice.updateMany({ where: { id: current.id, status: 'DRAFT' }, data: { number, status: 'SENT', sentAt: new Date() } });
          if (r.count === 0) throw new HttpError(409, 'INVOICE_NOT_DRAFT');
        });
        sent = true;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code !== 'P2002' && code !== 'P2034') throw err;
      }
    }
    if (!sent) throw new HttpError(409, 'NUMBER_CONFLICT');
  }
  const inv = await findInvoice(current.id);
  const { emailed } = await notifyCompanyAboutInvoice(inv, 'sent');
  await audit(req, current.status === 'DRAFT' ? 'INVOICE_SEND' : 'INVOICE_RESEND', inv.id, { number: inv.number, emailed });
  res.json({ invoice: view(inv), emailed });
});

adminInvoicesRouter.post('/:id/paid', async (req, res) => {
  const { paidAt } = parse(z.object({ paidAt: day.optional() }), req.body ?? {});
  const current = await findInvoice(req.params.id);
  if (current.status !== 'SENT' && current.status !== 'OVERDUE') throw new HttpError(409, 'INVOICE_NOT_OPEN');
  const when = paidAt ? atNoon(paidAt) : new Date();
  if (when.getTime() > Date.now() + DAY) throw badRequest('PAID_IN_FUTURE');
  const r = await prisma.invoice.updateMany({ where: { id: current.id, status: { in: ['SENT', 'OVERDUE'] } }, data: { status: 'PAID', paidAt: when } });
  if (r.count === 0) throw new HttpError(409, 'INVOICE_NOT_OPEN');
  await audit(req, 'INVOICE_PAID', current.id, { number: current.number, paidAt: when.toISOString() });
  await awardInvoiceCommission(current); // agent programme (never throws)
  res.json({ invoice: view(await findInvoice(current.id)) });
});

adminInvoicesRouter.post('/:id/cancel', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().max(1000).optional() }), req.body ?? {});
  const current = await findInvoice(req.params.id);
  if (current.status === 'DRAFT') throw new HttpError(409, 'INVOICE_IS_DRAFT');
  if (current.status === 'PAID') throw new HttpError(409, 'INVOICE_PAID');
  if (current.status === 'CANCELLED') throw new HttpError(409, 'INVOICE_CANCELLED');
  const stornoNote = `Stornorechnung: Rechnung ${current.number} wurde am ${formatInvoiceDate(new Date())} storniert.${reason ? ` Grund: ${reason}` : ''}`;
  const note = [current.note, stornoNote].filter(Boolean).join('\n\n').slice(0, 4000);
  const r = await prisma.invoice.updateMany({ where: { id: current.id, status: { in: ['SENT', 'OVERDUE'] } }, data: { status: 'CANCELLED', note } });
  if (r.count === 0) throw new HttpError(409, 'INVOICE_NOT_OPEN');
  const inv = await findInvoice(current.id);
  await notifyCompanyAboutInvoice(inv, 'cancelled', { note: reason ?? null });
  await audit(req, 'INVOICE_CANCEL', inv.id, { number: inv.number, reason: reason ?? null });
  res.json({ invoice: view(inv) });
});

// ─── For other features (quote → invoice conversion) ────────────────

/** Creates a DRAFT invoice through the same validation and totals as POST /. */
export const createDraftInvoice = async (input: { companyId: string; items: { description: string; quantity: number; unitPriceCents: number }[]; vatRate?: number; note?: string | null }) => {
  const body = parse(invoiceInput, input);
  await requireCompany(body.companyId);
  const { invoicing } = await loadInvoiceSettings();
  return prisma.invoice.create({
    data: { number: draftNumber(), companyId: body.companyId, status: 'DRAFT', ...buildData(body, invoicing) },
    include: withCompany,
  });
};
