import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma, QuoteStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { HttpError, badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { metaOf } from '../../lib/esign/http.js';
import { aiComplete } from '../../lib/ai/complete.js';
import { employerAiStatus } from '../../lib/ai/features/employer/common.js';
import { loadInvoiceSettings } from './invoices.js';
import { QUOTE_UNITS, computeQuoteTotals, quoteItems, type Discount } from '../../lib/quotes/math.js';
import { buildQuotePdf, quoteFileName } from '../../lib/quotes/pdf.js';
import { getQuoteSettings, quoteSettingsSchema, saveQuoteSettings, type QuoteSettings } from '../../lib/quotes/settings.js';
import {
  OPEN_STATUSES,
  convertQuote,
  loadQuote,
  logQuoteEvent,
  pdfName,
  quoteUrl,
  recipientOf,
  renderQuotePdf,
  sendQuote,
  tokenOf,
  totalsOf,
  type QuoteWithCompany,
} from '../../lib/quotes/service.js';

// Admin: quotes (Angebote) — mounted at /api/admin/quotes (ADMIN+, gated in admin/index.ts)
export const adminQuotesRouter = Router();

const DAY = 24 * 60 * 60 * 1000;
const STATUSES = ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CONVERTED'] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T12:00:00Z`)), 'INVALID_DATE');
const atNoon = (s: string) => new Date(`${s}T12:00:00Z`);
const todayIso = () => new Date().toISOString().slice(0, 10);
const twoDecimals = (n: number) => Math.round(n * 100) === Math.round(n * 1e6) / 1e4;

const optText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => v || null);

const itemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive().max(100000).refine(twoDecimals, 'MAX_2_DECIMALS'),
  unit: z.enum(QUOTE_UNITS).default('PERSON'),
  unitPriceCents: z.coerce.number().int().min(0).max(100_000_000),
  vatRate: z.coerce.number().int().min(0).max(100).nullable().optional(),
  catalogueId: z.string().trim().max(40).nullable().optional(),
});

const quoteInput = z.object({
  companyId: z.string().min(1).max(64),
  vacancyId: z.string().max(64).nullable().optional(),
  contactName: optText(160),
  contactEmail: z.union([z.literal('').transform(() => null), z.string().trim().toLowerCase().email().max(200)]).nullable().optional(),
  locale: z.enum(['de', 'en']).default('de'),
  title: z.string().trim().min(1).max(200),
  salutation: optText(200),
  introText: optText(5000),
  closingText: optText(5000),
  items: z.array(itemSchema).min(1).max(60),
  discount: z
    .object({ type: z.enum(['NONE', 'PERCENT', 'AMOUNT']), value: z.coerce.number().min(0).max(100_000_000) })
    .default({ type: 'NONE', value: 0 }),
  vatRate: z.coerce.number().int().min(0).max(100).optional(),
  validUntil: day.optional(),
  paymentTerms: optText(2000),
  deliveryTerms: optText(2000),
});
type QuoteInput = z.infer<typeof quoteInput>;

/** Validated input → row data with totals (the discount percent is stored in basis points). */
const buildData = async (body: QuoteInput, settings: QuoteSettings) => {
  const { invoicing } = await loadInvoiceSettings();
  const company = await prisma.company.findUnique({ where: { id: body.companyId }, select: { id: true } });
  if (!company) throw notFound('COMPANY_NOT_FOUND');
  if (body.vacancyId) {
    const v = await prisma.vacancy.findUnique({ where: { id: body.vacancyId }, select: { companyId: true } });
    if (!v) throw notFound('VACANCY_NOT_FOUND');
    if (v.companyId && v.companyId !== body.companyId) throw badRequest('VACANCY_COMPANY_MISMATCH');
  }
  // Small businesses (§19 UStG) never charge VAT, not even on single lines.
  const small = invoicing.smallBusiness;
  const vatRate = small ? 0 : (body.vatRate ?? invoicing.defaultVatRate);
  const items = body.items.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unit: l.unit,
    unitPriceCents: l.unitPriceCents,
    vatRate: small || l.vatRate === undefined || l.vatRate === null ? null : l.vatRate,
    catalogueId: l.catalogueId ?? null,
    convertedQty: 0,
  }));
  let discount: Discount = { type: 'NONE', value: 0 };
  if (body.discount.type === 'PERCENT') {
    if (body.discount.value > 100 || !twoDecimals(body.discount.value)) throw badRequest('INVALID_DISCOUNT');
    discount = { type: 'PERCENT', value: Math.round(body.discount.value * 100) };
  } else if (body.discount.type === 'AMOUNT') {
    if (!Number.isInteger(body.discount.value)) throw badRequest('INVALID_DISCOUNT');
    discount = { type: 'AMOUNT', value: body.discount.value };
  }
  if (discount.type !== 'NONE' && discount.value === 0) discount = { type: 'NONE', value: 0 };
  const totals = computeQuoteTotals(items, vatRate, { type: 'NONE', value: 0 });
  if (discount.type === 'AMOUNT' && discount.value > totals.subtotalCents) throw badRequest('DISCOUNT_TOO_HIGH');
  const t = computeQuoteTotals(items, vatRate, discount);
  const validUntil = body.validUntil ? atNoon(body.validUntil) : new Date(atNoon(todayIso()).getTime() + settings.validDays * DAY);
  return {
    companyId: body.companyId,
    vacancyId: body.vacancyId ?? null,
    contactName: body.contactName ?? null,
    contactEmail: body.contactEmail ?? null,
    locale: body.locale,
    title: body.title,
    salutation: body.salutation ?? null,
    introText: body.introText ?? null,
    closingText: body.closingText ?? null,
    items: items as unknown as Prisma.InputJsonValue,
    discountType: discount.type,
    discountValue: discount.value,
    vatRate,
    subtotalCents: t.subtotalCents,
    discountCents: t.discountCents,
    netCents: t.netCents,
    vatCents: t.vatCents,
    grossCents: t.grossCents,
    validUntil,
    paymentTerms: body.paymentTerms ?? null,
    deliveryTerms: body.deliveryTerms ?? null,
  };
};

const actorOf = async (req: Request) => {
  const u = req.user ? await prisma.user.findUnique({ where: { id: req.user.id }, select: { firstName: true, lastName: true } }) : null;
  return { actorId: req.user?.id ?? null, actorName: u ? `${u.firstName} ${u.lastName}`.trim() : null, ...metaOf(req) };
};

const listView = (q: QuoteWithCompany & { createdBy?: { firstName: string; lastName: string } | null }) => ({
  id: q.id,
  number: q.status === 'DRAFT' ? null : q.number,
  status: q.status,
  title: q.title,
  companyId: q.companyId,
  company: { id: q.company.id, name: q.company.name, email: q.company.email, city: q.company.city, status: q.company.status },
  contactName: q.contactName,
  contactEmail: q.contactEmail,
  netCents: q.netCents,
  grossCents: q.grossCents,
  currency: q.currency,
  validUntil: q.validUntil,
  sentAt: q.sentAt,
  viewedAt: q.viewedAt,
  acceptedAt: q.acceptedAt,
  declinedAt: q.declinedAt,
  invoiceId: q.invoiceId,
  createdAt: q.createdAt,
  createdBy: q.createdBy ? `${q.createdBy.firstName} ${q.createdBy.lastName}`.trim() : null,
});

const detailView = async (q: QuoteWithCompany & { createdBy?: { firstName: string; lastName: string } | null }) => {
  const events = await prisma.quoteEvent.findMany({ where: { quoteId: q.id }, orderBy: { createdAt: 'asc' }, take: 300 });
  const invoiceIds = [...new Set(events.filter((e) => e.type === 'CONVERTED').map((e) => (e.meta as { invoiceId?: string } | null)?.invoiceId).filter((x): x is string => !!x))];
  const invoices = invoiceIds.length
    ? await prisma.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, number: true, status: true, grossCents: true, createdAt: true }, orderBy: { createdAt: 'asc' } })
    : [];
  const token = tokenOf(q);
  return {
    ...listView(q),
    vacancyId: q.vacancyId,
    locale: q.locale,
    salutation: q.salutation,
    introText: q.introText,
    closingText: q.closingText,
    items: quoteItems(q.items),
    discount: { type: q.discountType, value: q.discountType === 'PERCENT' ? q.discountValue / 100 : q.discountValue },
    vatRate: q.vatRate,
    ...totalsOf(q),
    paymentTerms: q.paymentTerms,
    deliveryTerms: q.deliveryTerms,
    acceptedByName: q.acceptedByName,
    acceptedIp: q.acceptedIp,
    acceptedUa: q.acceptedUa,
    declinedReason: q.declinedReason,
    expiredAt: q.expiredAt,
    convertedAt: q.convertedAt,
    publicUrl: token && q.status !== 'DRAFT' ? quoteUrl(token) : null,
    recipient: await recipientOf(q),
    invoices: invoices.map((i) => ({ ...i, number: i.status === 'DRAFT' ? null : i.number })),
    events: events.map((e) => ({ id: e.id, type: e.type, actorName: e.actorName, note: e.note, meta: e.meta, ip: e.ip, userAgent: e.userAgent, createdAt: e.createdAt })),
  };
};

const withCreator = { company: true, createdBy: { select: { firstName: true, lastName: true } } } as const;

const findQuote = async (id: string) => {
  const q = await prisma.quote.findUnique({ where: { id }, include: withCreator });
  if (!q) throw notFound('QUOTE_NOT_FOUND');
  return q;
};

// ─── Settings ────────────────────────────────────────────────────────

const settingsResponse = async () => {
  const [settings, inv] = await Promise.all([getQuoteSettings(), loadInvoiceSettings()]);
  return { settings, invoicing: { smallBusiness: inv.invoicing.smallBusiness, defaultVatRate: inv.invoicing.defaultVatRate }, legalMissing: inv.legalMissing };
};

adminQuotesRouter.get('/settings', async (_req, res) => {
  res.json(await settingsResponse());
});

adminQuotesRouter.put('/settings', async (req, res) => {
  const value = parse(
    quoteSettingsSchema.superRefine((s, ctx) => {
      for (const [k, list] of [['catalogue', s.catalogue], ['introTemplates', s.introTemplates], ['closingTemplates', s.closingTemplates]] as const) {
        const ids = list.map((x) => x.id);
        if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: [k], message: 'DUPLICATE_ID' });
      }
    }),
    req.body?.settings ?? req.body,
  );
  await saveQuoteSettings(value);
  await audit(req, 'QUOTE_SETTINGS', 'quotes', { catalogue: value.catalogue.length });
  res.json(await settingsResponse());
});

/** Everything the wizard needs: companies, vacancies (positions prefill quantities), AI availability. */
adminQuotesRouter.get('/options', async (req, res) => {
  const [companies, vacancies, ai] = await Promise.all([
    prisma.company.findMany({
      select: { id: true, name: true, legalForm: true, email: true, contactName: true, city: true, address: true, status: true },
      orderBy: { name: 'asc' },
      take: 2000,
    }),
    prisma.vacancy.findMany({
      where: { companyId: { not: null }, status: { in: ['DRAFT', 'PENDING', 'OPEN'] } },
      select: { id: true, companyId: true, title: true, positions: true, status: true, profession: true, drivingLicence: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    employerAiStatus(req.user!.id, 'ADMIN').catch(() => ({ available: false as const, reason: 'UPSTREAM' as const })),
  ]);
  const titleOf = (t: unknown) => {
    const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
    for (const k of ['de', 'en', 'az', 'ru']) if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim();
    return '';
  };
  res.json({ companies, vacancies: vacancies.map((v) => ({ ...v, title: titleOf(v.title) })), ai: { available: ai.available } });
});

/** Quick prospect company (status PENDING) created from the wizard. */
adminQuotesRouter.post('/prospect', async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(2).max(200),
      legalForm: optText(100),
      contactName: optText(160),
      email: z.union([z.literal('').transform(() => null), z.string().trim().toLowerCase().email().max(200)]).nullable().optional(),
      phone: optText(50),
      city: optText(100),
      address: optText(1000),
    }),
    req.body,
  );
  const company = await prisma.company.create({
    data: {
      name: body.name,
      legalForm: body.legalForm ?? null,
      contactName: body.contactName ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      city: body.city ?? null,
      address: body.address ?? null,
      status: 'PENDING',
      note: 'Interessent (angelegt im Angebots-Assistenten)',
    },
    select: { id: true, name: true, legalForm: true, email: true, contactName: true, city: true, address: true, status: true },
  });
  await audit(req, 'QUOTE_PROSPECT_CREATE', `company:${company.id}`, { name: company.name });
  res.status(201).json({ company });
});

/** Optional "improve wording" (only when AI is configured): returns a suggestion, never saves. */
adminQuotesRouter.post('/improve', async (req, res) => {
  const body = parse(z.object({ kind: z.enum(['intro', 'closing', 'payment', 'delivery', 'title']), text: z.string().trim().min(3).max(5000) }), req.body);
  const r = await aiComplete({
    userId: req.user!.id,
    scope: 'ADMIN',
    purpose: 'quote-wording',
    system:
      'Du überarbeitest Textbausteine für Angebote eines deutschen Personaldienstleisters (Vermittlung ausländischer Fachkräfte) an Arbeitgeber in Deutschland. ' +
      'Schreibe in formellem, freundlichem Geschäftsdeutsch (Sie-Form), knapp und präzise. Behalte alle Fakten, Zahlen, Fristen und Platzhalter in geschweiften Klammern unverändert bei. ' +
      'Erfinde nichts hinzu. Antworte nur mit dem überarbeiteten Text, ohne Anführungszeichen und ohne Erklärungen.',
    input: `Art des Textes: ${body.kind}\n\nText:\n${body.text}`,
    maxTokens: 700,
    temperature: 0.3,
  });
  if (!r.ok) throw new HttpError(503, 'AI_UNAVAILABLE', r.reason);
  await audit(req, 'QUOTE_AI_WORDING', body.kind);
  res.json({ text: r.text.replace(/^["„“]+|["“”]+$/g, '').trim().slice(0, 5000) });
});

/** PDF of unsaved wizard input (preview). */
adminQuotesRouter.post('/preview', async (req, res) => {
  const body = parse(quoteInput, req.body);
  const [settings, inv] = await Promise.all([getQuoteSettings(), loadInvoiceSettings()]);
  const data = await buildData(body, settings);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: body.companyId } });
  const pdf = await buildQuotePdf({
    quote: {
      number: null,
      status: 'DRAFT',
      date: new Date(),
      validUntil: data.validUntil,
      title: data.title,
      salutation: data.salutation,
      introText: data.introText,
      closingText: data.closingText,
      items: quoteItems(data.items as Prisma.JsonValue),
      discount: { type: data.discountType, value: data.discountValue },
      vatRate: data.vatRate,
      totals: computeQuoteTotals(quoteItems(data.items as Prisma.JsonValue), data.vatRate, { type: data.discountType, value: data.discountValue }),
      paymentTerms: data.paymentTerms,
      deliveryTerms: data.deliveryTerms,
      contactName: data.contactName,
      acceptedAt: null,
      acceptedByName: null,
    },
    company,
    seller: inv.seller,
    invoicing: inv.invoicing,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${quoteFileName({ number: null, status: 'DRAFT' })}"`);
  res.send(pdf);
});

// ─── List + totals ──────────────────────────────────────────────────

adminQuotesRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(STATUSES).optional(),
      companyId: z.string().max(64).optional(),
      from: day.optional(),
      to: day.optional(),
      q: z.string().trim().max(60).optional(),
    }),
    req.query,
  );
  const where: Prisma.QuoteWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.companyId ? { companyId: q.companyId } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59Z`) } : {}) } } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q } }, { title: { contains: q.q } }, { company: { name: { contains: q.q } } }] } : {}),
  };
  const soon = new Date(Date.now() + 7 * DAY);
  const [quotes, groups, expiringSoon] = await Promise.all([
    prisma.quote.findMany({ where, include: withCreator, orderBy: [{ createdAt: 'desc' }], take: 500 }),
    prisma.quote.groupBy({ by: ['status'], _sum: { grossCents: true }, _count: { _all: true } }),
    prisma.quote.count({ where: { status: { in: OPEN_STATUSES }, validUntil: { lte: soon } } }),
  ]);
  const g = (s: QuoteStatus) => groups.find((x) => x.status === s);
  const count = (...s: QuoteStatus[]) => s.reduce((a, x) => a + (g(x)?._count._all ?? 0), 0);
  const sum = (...s: QuoteStatus[]) => s.reduce((a, x) => a + (g(x)?._sum.grossCents ?? 0), 0);
  const won = count('ACCEPTED', 'CONVERTED');
  const decided = won + count('DECLINED', 'EXPIRED');
  res.json({
    quotes: quotes.map(listView),
    totals: {
      openCents: sum('SENT', 'VIEWED'),
      openCount: count('SENT', 'VIEWED'),
      acceptedCents: sum('ACCEPTED', 'CONVERTED'),
      acceptedCount: won,
      toConvertCount: count('ACCEPTED'),
      declinedCount: count('DECLINED'),
      expiredCount: count('EXPIRED'),
      draftCount: count('DRAFT'),
      expiringSoon,
      acceptanceRate: decided ? Math.round((won / decided) * 100) : null,
      byStatus: Object.fromEntries(STATUSES.map((s) => [s, count(s)])),
    },
  });
});

adminQuotesRouter.get('/:id', async (req, res) => {
  res.json({ quote: await detailView(await findQuote(req.params.id)) });
});

adminQuotesRouter.get('/:id/pdf', async (req, res) => {
  const q = await loadQuote(req.params.id);
  const pdf = await renderQuotePdf(q);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${pdfName(q)}"`);
  res.send(pdf);
});

// ─── Drafts ─────────────────────────────────────────────────────────

adminQuotesRouter.post('/', async (req, res) => {
  const body = parse(quoteInput, req.body);
  const data = await buildData(body, await getQuoteSettings());
  const q = await prisma.quote.create({ data: { ...data, status: 'DRAFT', createdById: req.user!.id }, include: withCreator });
  await logQuoteEvent(q.id, 'CREATED', await actorOf(req));
  await audit(req, 'QUOTE_CREATE', q.id, { companyId: q.companyId, grossCents: q.grossCents });
  res.status(201).json({ quote: await detailView(q) });
});

adminQuotesRouter.put('/:id', async (req, res) => {
  const body = parse(quoteInput, req.body);
  const current = await findQuote(req.params.id);
  if (current.status !== 'DRAFT') throw conflict('QUOTE_NOT_DRAFT');
  const data = await buildData(body, await getQuoteSettings());
  const r = await prisma.quote.updateMany({ where: { id: current.id, status: 'DRAFT' }, data });
  if (!r.count) throw conflict('QUOTE_NOT_DRAFT');
  await logQuoteEvent(current.id, 'UPDATED', await actorOf(req));
  await audit(req, 'QUOTE_UPDATE', current.id);
  res.json({ quote: await detailView(await findQuote(current.id)) });
});

adminQuotesRouter.delete('/:id', async (req, res) => {
  const current = await findQuote(req.params.id);
  if (current.status !== 'DRAFT') throw conflict('QUOTE_NOT_DRAFT');
  await prisma.quote.deleteMany({ where: { id: current.id, status: 'DRAFT' } });
  await audit(req, 'QUOTE_DELETE', current.id);
  res.json({ ok: true });
});

adminQuotesRouter.post('/:id/duplicate', async (req, res) => {
  const src = await findQuote(req.params.id);
  const settings = await getQuoteSettings();
  const items = quoteItems(src.items).map(({ convertedQty: _c, ...l }) => l);
  const data = await buildData(
    parse(quoteInput, {
      companyId: src.companyId,
      vacancyId: src.vacancyId,
      contactName: src.contactName,
      contactEmail: src.contactEmail,
      locale: src.locale === 'en' ? 'en' : 'de',
      title: src.title,
      salutation: src.salutation,
      introText: src.introText,
      closingText: src.closingText,
      items,
      discount: { type: src.discountType, value: src.discountType === 'PERCENT' ? src.discountValue / 100 : src.discountValue },
      vatRate: src.vatRate,
      paymentTerms: src.paymentTerms,
      deliveryTerms: src.deliveryTerms,
    }),
    settings,
  );
  const q = await prisma.quote.create({ data: { ...data, status: 'DRAFT', createdById: req.user!.id }, include: withCreator });
  await logQuoteEvent(q.id, 'DUPLICATED', { ...(await actorOf(req)), meta: { from: src.id, fromNumber: src.number } });
  await audit(req, 'QUOTE_DUPLICATE', q.id, { from: src.id });
  res.status(201).json({ quote: await detailView(q) });
});

// ─── Lifecycle ──────────────────────────────────────────────────────

adminQuotesRouter.post('/:id/send', async (req, res) => {
  const body = parse(
    z.object({
      to: z.union([z.literal('').transform(() => undefined), z.string().trim().toLowerCase().email().max(200)]).optional(),
      locale: z.enum(['de', 'en']).optional(),
    }),
    req.body ?? {},
  );
  const before = await findQuote(req.params.id);
  const { emailed, to } = await sendQuote(before.id, { to: body.to, locale: body.locale }, await actorOf(req));
  const q = await findQuote(before.id);
  await audit(req, before.status === 'DRAFT' ? 'QUOTE_SEND' : 'QUOTE_RESEND', q.id, { number: q.number, emailed, to: to || null });
  res.json({ quote: await detailView(q), emailed });
});

adminQuotesRouter.post('/:id/convert', async (req, res) => {
  const body = parse(
    z.object({ lines: z.array(z.object({ index: z.coerce.number().int().min(0).max(59), quantity: z.coerce.number().min(0).max(100000).refine(twoDecimals, 'MAX_2_DECIMALS') })).max(60).optional() }),
    req.body ?? {},
  );
  const q = await loadQuote(req.params.id);
  const { invoice, partial } = await convertQuote(q, body.lines, await actorOf(req));
  await audit(req, 'INVOICE_CREATE', invoice.id, { companyId: invoice.companyId, grossCents: invoice.grossCents, fromQuote: q.id });
  await audit(req, 'QUOTE_CONVERT', q.id, { invoiceId: invoice.id, partial });
  res.status(201).json({ invoiceId: invoice.id, partial, quote: await detailView(await findQuote(q.id)) });
});
