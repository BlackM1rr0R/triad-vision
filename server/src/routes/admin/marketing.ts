import { Router } from 'express';
import { z } from 'zod';
import { CaseStatus, VisaType, type Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { clearCache } from '../../lib/cache.js';
import {
  getLeadScoringSettings,
  LEAD_SCORING_DEFAULTS,
  leadScoringSchema,
  rescoreOpenLeads,
  saveLeadScoringSettings,
  scoreLead,
} from '../../lib/marketing/leadScoring.js';
import {
  conversionRate,
  DEFAULT_FORM_CONFIG,
  formConfigOf,
  formConfigSchema,
  LANDING_STATUSES,
  sectionsOf,
  sectionsSchema,
  slugSchema,
  uniqueLandingSlug,
} from '../../lib/marketing/landing.js';
import { COST_DEFAULTS, costCalculatorSchema, costCategories, documentPrices, getCostSettings, saveCostSettings } from '../../lib/marketing/costCalculator.js';
import { aggregateOrigins } from '../../lib/marketing/originMap.js';
import { presetForPurpose, singleAnyImage, storeCmsUpload } from '../../lib/publicImages.js';

/**
 * Admin side of growth & marketing — mounted at /api/admin/marketing (STAFF+; settings, publishing and
 * deletes ADMIN+):
 *   lead scoring rules + rescore, lead details of an inquiry (visitor history)
 *   landing pages (CRUD, duplicate, publish / unpublish / archive)
 *   cost calculator fees
 *   origin → destination analytics (exact counts, filters)
 */
export const adminMarketingRouter = Router();
const adminOnly = requireMinRole('ADMIN');

/**
 * Images for landing pages (section photos, testimonial portraits, social preview). The general CMS upload
 * (/admin/upload) stays ADMIN-only; landing pages are edited by STAFF too, so their editor uploads here — the
 * same public-image pipeline (lib/publicImages: content sniff, re-encode, EXIF stripped, size presets).
 */
adminMarketingRouter.post('/upload', singleAnyImage, async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED');
  const preset = presetForPurpose(req.query.purpose ?? (req.body as { purpose?: unknown } | undefined)?.purpose);
  const stored = await storeCmsUpload(req.file, preset);
  await audit(req, 'LANDING_IMAGE_UPLOADED', undefined, { url: stored.url });
  res.status(201).json(stored);
});

// ─── Lead scoring ──────────────────────────────────────────────────────

adminMarketingRouter.get('/lead-scoring', async (_req, res) => {
  const staff = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, role: true },
    take: 300,
  });
  res.json({ settings: await getLeadScoringSettings(), defaults: LEAD_SCORING_DEFAULTS, staff });
});

adminMarketingRouter.put('/lead-scoring', adminOnly, async (req, res) => {
  const settings = parse(leadScoringSchema, req.body);
  await saveLeadScoringSettings(settings);
  await audit(req, 'LEAD_SCORING_UPDATED', 'leadScoring', { thresholds: settings.thresholds, enabled: settings.enabled });
  res.json({ settings });
});

/** Recomputes the open leads of the last `days` days with the current rules (no HOT notifications). */
adminMarketingRouter.post('/lead-scoring/rescore', adminOnly, async (req, res) => {
  const { days } = parse(z.object({ days: z.number().int().min(1).max(365).default(90) }), req.body ?? {});
  const count = await rescoreOpenLeads(new Date(), { days, notify: false });
  await audit(req, 'LEAD_SCORING_RESCORED', 'leadScoring', { days, count });
  res.json({ count });
});

/** Score details of one inquiry: stored reasons, visitor counters (with consent), quiz / estimate, utm. */
adminMarketingRouter.get('/inquiries/:id/lead', async (req, res) => {
  const q = await prisma.inquiry.findUnique({ where: { id: String(req.params.id) } });
  if (!q) throw notFound();
  const [visitor, landing, settings] = await Promise.all([
    q.visitorId ? prisma.leadVisitor.findUnique({ where: { id: q.visitorId } }) : null,
    q.landingPageId ? prisma.landingPage.findUnique({ where: { id: q.landingPageId }, select: { id: true, slug: true, title: true } }) : null,
    getLeadScoringSettings(),
  ]);
  res.json({
    score: q.score,
    level: q.scoreLevel,
    reasons: q.scoreReasons ?? [],
    scoredAt: q.scoredAt,
    // what the score would be right now (recency may have moved on)
    preview: scoreLead({ ...q, visitor }, settings),
    visitor: visitor && {
      firstSeenAt: visitor.firstSeenAt,
      lastSeenAt: visitor.lastSeenAt,
      visits: visitor.visits,
      pageViews: visitor.pageViews,
      events: visitor.events ?? {},
      source: visitor.source,
      utm: visitor.utm,
      locale: visitor.locale,
    },
    utm: q.utm,
    quizResult: q.quizResult,
    estimate: q.estimate,
    landing,
  });
});

// ─── Landing pages ─────────────────────────────────────────────────────

const pageBody = z.object({
  title: z.string().trim().min(2).max(200),
  slug: slugSchema.optional(),
  locale: z.enum(['az', 'de', 'en', 'ru', 'tr', 'uk']).default('az'), // tr / uk: campaign pages for Türkiye and Ukraine
  country: z.string().trim().max(40).nullable().optional(),
  campaignId: z.string().trim().max(40).nullable().optional(),
  sections: sectionsSchema.default([]),
  formConfig: formConfigSchema.nullable().optional(),
  seoTitle: z.string().trim().max(200).nullable().optional(),
  seoDescription: z.string().trim().max(400).nullable().optional(),
  ogImage: z
    .string()
    .trim()
    .max(1000)
    .refine((u) => u === '' || /^https:\/\//i.test(u) || /^\/uploads\/[\w.-]+$/.test(u), 'IMAGE_URL')
    // Social previews: raster only (crawlers ignore SVG).
    .refine((u) => !/\.svg(?:[?#].*)?$/i.test(u), 'OG_IMAGE_SVG')
    .nullable()
    .optional(),
});

const listRow = (p: { views: number; submissions: number } & Record<string, unknown>) => ({ ...p, rate: conversionRate(p.views, p.submissions) });

adminMarketingRouter.get('/landing-pages', async (_req, res) => {
  const pages = await prisma.landingPage.findMany({
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    take: 500,
    select: { id: true, slug: true, locale: true, title: true, status: true, country: true, campaignId: true, views: true, submissions: true, publishedAt: true, updatedAt: true, createdAt: true },
  });
  const totals = pages.reduce((a, p) => ({ views: a.views + p.views, submissions: a.submissions + p.submissions }), { views: 0, submissions: 0 });
  res.json({ pages: pages.map(listRow), totals: { ...totals, rate: conversionRate(totals.views, totals.submissions) } });
});

/** Published testimonials for the testimonials section picker. */
adminMarketingRouter.get('/landing-pages/testimonials', async (_req, res) => {
  const items = await prisma.testimonial.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, quote: true, author: true, role: true, kind: true } });
  res.json({ items });
});

adminMarketingRouter.get('/landing-pages/:id', async (req, res) => {
  const page = await prisma.landingPage.findUnique({ where: { id: String(req.params.id) } });
  if (!page) throw notFound();
  res.json({ page: { ...page, sections: sectionsOf(page.sections), formConfig: formConfigOf(page.formConfig), rate: conversionRate(page.views, page.submissions) } });
});

const slugTaken = async (slug: string, exceptId?: string) => {
  const hit = await prisma.landingPage.findUnique({ where: { slug }, select: { id: true } });
  return !!hit && hit.id !== exceptId;
};

adminMarketingRouter.post('/landing-pages', async (req, res) => {
  const body = parse(pageBody, req.body);
  if (body.slug && (await slugTaken(body.slug))) throw conflict('SLUG_TAKEN');
  const page = await prisma.landingPage.create({
    data: {
      slug: body.slug ?? (await uniqueLandingSlug(body.title)),
      title: body.title,
      locale: body.locale,
      country: body.country ?? null,
      campaignId: body.campaignId ?? null,
      sections: body.sections as Prisma.InputJsonValue,
      formConfig: (body.formConfig ?? DEFAULT_FORM_CONFIG) as Prisma.InputJsonValue,
      seoTitle: body.seoTitle || null,
      seoDescription: body.seoDescription || null,
      ogImage: body.ogImage || null,
      createdById: req.user!.id,
    },
  });
  await audit(req, 'LANDING_PAGE_CREATED', page.id, { slug: page.slug });
  res.status(201).json({ page });
});

adminMarketingRouter.put('/landing-pages/:id', async (req, res) => {
  const existing = await prisma.landingPage.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw notFound();
  const body = parse(pageBody, req.body);
  const slug = body.slug ?? existing.slug;
  // A published page keeps its address (links in ads / QR codes); unpublish first to change it.
  if (slug !== existing.slug && existing.status === 'PUBLISHED' && req.user!.role === 'STAFF') throw badRequest('SLUG_LOCKED');
  if (slug !== existing.slug && (await slugTaken(slug, existing.id))) throw conflict('SLUG_TAKEN');
  const page = await prisma.landingPage.update({
    where: { id: existing.id },
    data: {
      slug,
      title: body.title,
      locale: body.locale,
      country: body.country ?? null,
      campaignId: body.campaignId ?? null,
      sections: body.sections as Prisma.InputJsonValue,
      formConfig: (body.formConfig ?? formConfigOf(existing.formConfig)) as Prisma.InputJsonValue,
      seoTitle: body.seoTitle || null,
      seoDescription: body.seoDescription || null,
      ogImage: body.ogImage || null,
    },
  });
  if (page.status === 'PUBLISHED') clearCache();
  await audit(req, 'LANDING_PAGE_UPDATED', page.id, { slug: page.slug });
  res.json({ page });
});

adminMarketingRouter.post('/landing-pages/:id/duplicate', async (req, res) => {
  const src = await prisma.landingPage.findUnique({ where: { id: String(req.params.id) } });
  if (!src) throw notFound();
  const page = await prisma.landingPage.create({
    data: {
      slug: await uniqueLandingSlug(`${src.slug}-copy`),
      title: `${src.title} (copy)`.slice(0, 200),
      locale: src.locale,
      country: src.country,
      campaignId: src.campaignId,
      sections: (src.sections ?? []) as Prisma.InputJsonValue,
      formConfig: (src.formConfig ?? DEFAULT_FORM_CONFIG) as Prisma.InputJsonValue,
      seoTitle: src.seoTitle,
      seoDescription: src.seoDescription,
      ogImage: src.ogImage,
      createdById: req.user!.id,
    },
  });
  await audit(req, 'LANDING_PAGE_DUPLICATED', page.id, { from: src.id, slug: page.slug });
  res.status(201).json({ page });
});

adminMarketingRouter.post('/landing-pages/:id/status', adminOnly, async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(LANDING_STATUSES) }), req.body);
  const existing = await prisma.landingPage.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw notFound();
  if (status === 'PUBLISHED' && sectionsOf(existing.sections).length === 0) throw badRequest('NO_SECTIONS');
  const page = await prisma.landingPage.update({
    where: { id: existing.id },
    data: { status, ...(status === 'PUBLISHED' && !existing.publishedAt ? { publishedAt: new Date() } : {}) },
  });
  clearCache(); // sitemap / head meta
  await audit(req, 'LANDING_PAGE_STATUS', page.id, { from: existing.status, to: status });
  res.json({ page });
});

adminMarketingRouter.delete('/landing-pages/:id', adminOnly, async (req, res) => {
  const existing = await prisma.landingPage.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw notFound();
  if (existing.status === 'PUBLISHED') throw conflict('UNPUBLISH_FIRST');
  await prisma.landingPage.delete({ where: { id: existing.id } });
  await audit(req, 'LANDING_PAGE_DELETED', existing.id, { slug: existing.slug });
  res.json({ ok: true });
});

// ─── Cost calculator ───────────────────────────────────────────────────

adminMarketingRouter.get('/cost-calculator', async (_req, res) => {
  const settings = await getCostSettings();
  const [categories, prices] = await Promise.all([costCategories(settings), documentPrices({ ...settings, translationPrice: null, apostillePrice: null })]);
  res.json({
    settings,
    defaults: COST_DEFAULTS,
    categories: categories.map((c) => ({ id: c.id, slug: c.slug, title: c.title, visaLabel: c.visaLabel, configured: c.configured })),
    /** Prices from the translation price list (used while translationPrice / apostillePrice are null). */
    listPrices: prices,
  });
});

adminMarketingRouter.put('/cost-calculator', adminOnly, async (req, res) => {
  const settings = parse(costCalculatorSchema, req.body);
  await saveCostSettings(settings);
  clearCache();
  await audit(req, 'COST_CALCULATOR_UPDATED', 'costCalculator');
  res.json({ settings });
});

// ─── Origin → destination analytics ────────────────────────────────────

adminMarketingRouter.get('/origins', async (req, res) => {
  const q = parse(
    z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      visaType: z.nativeEnum(VisaType).optional().catch(undefined),
      status: z.nativeEnum(CaseStatus).optional().catch(undefined),
      placed: z.enum(['1', '0']).default('0'),
    }),
    req.query,
  );
  const data = await aggregateOrigins(
    {
      from: q.from ? new Date(`${q.from}T00:00:00.000Z`) : undefined,
      to: q.to ? new Date(`${q.to}T23:59:59.999Z`) : undefined,
      visaType: q.visaType,
      status: q.status,
    },
    { destinationsOnlyPlaced: q.placed === '1' },
  );
  res.json(data);
});
