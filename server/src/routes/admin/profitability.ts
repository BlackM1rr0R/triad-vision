import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { dayRange } from '../../lib/reports/dates.js';
import { caseProfit, profitOverview } from '../../lib/profitability/service.js';
import { CURRENCIES, getProfitSettings, profitSettingsSchema, saveProfitSettings } from '../../lib/profitability/settings.js';

/**
 * Profitability per case "Gəlirlilik" — /api/admin/profitability (ADMIN and above).
 *
 *   GET    /                         overview (?from&to = cases opened, status, visaType, staffId, partnerId, companyId)
 *   GET    /settings · PUT           default AZN-per-EUR rate, translation orders as revenue or cost
 *   GET    /cases/:caseId            the case card: revenue, costs by category, margin, lines, manual costs
 *   POST   /cases/:caseId/costs      manual cost { category, amount, currency, fxRate?, incurredAt, note?, documentId? }
 *   PATCH  /costs/:id · DELETE       edit / delete a manual cost
 *
 * Allocation rules and currency handling: lib/profitability/compute.ts. Export: report builder dataset "profitability".
 */
export const adminProfitabilityRouter = Router();
adminProfitabilityRouter.use(requireMinRole('ADMIN'));

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const STATUSES = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;
const list = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.array(z.enum(values)), z.string()])
    .optional()
    .transform((v) => (v === undefined ? undefined : (Array.isArray(v) ? v : String(v).split(',')).filter(Boolean)))
    .pipe(z.array(z.enum(values)).max(values.length).optional());

const overviewQuery = z.object({
  from: day.optional(),
  to: day.optional(),
  status: list(STATUSES),
  visaType: list(VISA_TYPES),
  staffId: z.string().max(40).optional(),
  partnerId: z.string().max(40).optional(),
  companyId: z.string().max(40).optional(),
});

adminProfitabilityRouter.get('/', async (req, res) => {
  const q = parse(overviewQuery, req.query);
  res.json(await profitOverview(q));
});

adminProfitabilityRouter.get('/settings', async (_req, res) => {
  res.json({ settings: await getProfitSettings() });
});

adminProfitabilityRouter.put('/settings', async (req, res) => {
  const body = parse(profitSettingsSchema, req.body);
  const settings = await saveProfitSettings(body);
  await audit(req, 'PROFITABILITY_SETTINGS', 'profitability', settings);
  res.json({ settings: { ...settings, rateSource: 'profitability' } });
});

/** Manual costs with the file name of their linked document. */
const costsOf = async (caseId: string) => {
  const costs = await prisma.caseCost.findMany({ where: { caseId }, orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }] });
  const docIds = [...new Set(costs.map((c) => c.documentId).filter((x): x is string => !!x))];
  const docs = docIds.length ? await prisma.document.findMany({ where: { id: { in: docIds }, caseId }, select: { id: true, originalName: true } }) : [];
  const docName = new Map(docs.map((d) => [d.id, d.originalName]));
  return costs.map((c) => ({ ...c, documentName: c.documentId ? (docName.get(c.documentId) ?? null) : null }));
};

adminProfitabilityRouter.get('/cases/:caseId', async (req, res) => {
  const exists = await prisma.case.findUnique({ where: { id: req.params.caseId }, select: { id: true } });
  if (!exists) throw notFound('CASE_NOT_FOUND');
  const [{ settings, profit }, costs, documents] = await Promise.all([
    caseProfit(exists.id),
    costsOf(exists.id),
    prisma.document.findMany({ where: { caseId: exists.id }, select: { id: true, originalName: true, stage: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
  ]);
  res.json({ settings, profit, costs, documents });
});

const CATEGORIES = ['TRANSLATION', 'COURIER', 'EMBASSY_FEE', 'VISA_FEE', 'AGENT_COMMISSION', 'PARTNER_COMMISSION', 'TRAVEL', 'OTHER'] as const;

const costBody = z.object({
  category: z.enum(CATEGORIES),
  /** Amount in currency units (e.g. 120.50). */
  amount: z.coerce.number().positive().max(10_000_000).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'MAX_2_DECIMALS'),
  currency: z.enum(CURRENCIES).default('EUR'),
  /** AZN per 1 EUR at the date; default: the profitability setting. */
  fxRate: z.coerce.number().positive().max(100).optional().nullable(),
  incurredAt: day,
  note: z.string().trim().max(2000).optional().nullable(),
  documentId: z.string().max(40).optional().nullable(),
});

const checkDocument = async (caseId: string, documentId: string | null | undefined) => {
  if (!documentId) return null;
  const d = await prisma.document.findFirst({ where: { id: documentId, caseId }, select: { id: true } });
  if (!d) throw badRequest('COST_DOCUMENT_NOT_IN_CASE');
  return d.id;
};

const noonOf = (d: string) => new Date(dayRange(d, d).start.getTime() + 12 * 60 * 60 * 1000);

const costAudit = (req: Request, action: string, c: { id: string; caseId: string; category: string; amountCents: number; currency: string; fxRate: number }) =>
  audit(req, action, c.id, { caseId: c.caseId, category: c.category, amountCents: c.amountCents, currency: c.currency, fxRate: c.fxRate });

adminProfitabilityRouter.post('/cases/:caseId/costs', async (req, res) => {
  const c = await prisma.case.findUnique({ where: { id: req.params.caseId }, select: { id: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const body = parse(costBody, req.body);
  const fxRate = body.fxRate ?? (await getProfitSettings()).eurAzn;
  const cost = await prisma.caseCost.create({
    data: {
      caseId: c.id,
      category: body.category,
      amountCents: Math.round(body.amount * 100),
      currency: body.currency,
      fxRate,
      incurredAt: noonOf(body.incurredAt),
      note: body.note || null,
      documentId: await checkDocument(c.id, body.documentId),
      createdById: req.user!.id,
    },
  });
  await costAudit(req, 'CASE_COST_CREATED', cost);
  res.status(201).json({ cost });
});

adminProfitabilityRouter.patch('/costs/:id', async (req, res) => {
  const cur = await prisma.caseCost.findUnique({ where: { id: req.params.id } });
  if (!cur) throw notFound('COST_NOT_FOUND');
  const body = parse(costBody.partial(), req.body);
  const data: Prisma.CaseCostUpdateInput = {};
  if (body.category) data.category = body.category;
  if (body.amount !== undefined) data.amountCents = Math.round(body.amount * 100);
  if (body.currency) data.currency = body.currency;
  if (body.fxRate) data.fxRate = body.fxRate;
  if (body.incurredAt) data.incurredAt = noonOf(body.incurredAt);
  if (body.note !== undefined) data.note = body.note || null;
  if (body.documentId !== undefined) data.documentId = await checkDocument(cur.caseId, body.documentId);
  const cost = await prisma.caseCost.update({ where: { id: cur.id }, data });
  await costAudit(req, 'CASE_COST_UPDATED', cost);
  res.json({ cost });
});

adminProfitabilityRouter.delete('/costs/:id', async (req, res) => {
  const cur = await prisma.caseCost.findUnique({ where: { id: req.params.id } });
  if (!cur) throw notFound('COST_NOT_FOUND');
  await prisma.caseCost.delete({ where: { id: cur.id } });
  await costAudit(req, 'CASE_COST_DELETED', cur);
  res.json({ ok: true });
});
