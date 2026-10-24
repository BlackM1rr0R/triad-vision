import { Router } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { imageUpload, verifyUploadedFile } from '../../middleware/upload.js';
import { badRequest, forbidden, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { LEGAL_SETTING_SCHEMAS } from '../../lib/legalSettings.js';
import { retentionStatus } from '../../jobs/retention.js';
import { MODULES_SETTING_KEY } from '../../lib/navModules.js';
import { storyVideo } from '../../lib/seo.js';

export const adminContentRouter = Router();

const l10n = z.object({ az: z.string(), de: z.string(), en: z.string(), ru: z.string() });
const l10nList = z.object({
  az: z.array(z.string()),
  de: z.array(z.string()),
  en: z.array(z.string()),
  ru: z.array(z.string()),
});

/** Minimal shape shared by all Prisma model delegates used here. */
interface Delegate {
  findMany(args: object): Promise<unknown[]>;
  findUnique(args: object): Promise<unknown>;
  create(args: object): Promise<unknown>;
  update(args: object): Promise<unknown>;
  delete(args: object): Promise<unknown>;
}

const faqList = z.array(z.object({ q: l10n, a: l10n })).max(30);
/** http(s) links or site-relative paths only, so a stored value can never become a javascript: href. */
const safeUrl = z.string().max(2000).refine((v) => /^(https?:\/\/[^\s]+|\/[^\s]*)$/i.test(v), 'INVALID_URL');
const safeUrlOrEmpty = z.union([safeUrl, z.literal('')]);
const optInt = z.number().int().min(0).max(1_000_000).nullable().optional();
/** Story video: a YouTube / Vimeo link (embedded privacy-friendly) or an MP4 / WebM uploaded to /uploads (CSP media-src 'self'). */
const storyVideoUrl = z.union([
  z.literal(''),
  z.string().trim().max(500).refine((v) => storyVideo(v) !== null, 'VIDEO_URL'),
]);
/** Per-item SEO overrides (posts, services, visa categories): empty language = the generated title / text. */
const seoText = (max: number) => z.object({ az: z.string().max(max), de: z.string().max(max), en: z.string().max(max), ru: z.string().max(max) }).partial().nullable().optional();
const seoFields = {
  seoTitle: seoText(120),
  seoDescription: seoText(320),
  ogImage: safeUrlOrEmpty.nullable().optional(),
  noindex: z.boolean().optional(),
};

const resources: Record<string, { delegate: () => Delegate; schema: z.ZodObject<Record<string, ZodTypeAny>>; orderBy: object }> = {
  'visa-categories': {
    delegate: () => prisma.visaCategory as unknown as Delegate,
    orderBy: { sortOrder: 'asc' },
    schema: z.object({
      slug: z.string().regex(/^[a-z0-9-]+$/),
      icon: z.string().max(60),
      image: safeUrlOrEmpty,
      visaLabel: z.string().max(40),
      title: l10n,
      summary: l10n,
      items: l10nList,
      body: l10n,
      germanLevel: z.string().max(10).nullable().optional(),
      salaryMin: optInt,
      salaryMax: optInt,
      processingMin: optInt,
      processingMax: optInt,
      familyReunion: z.boolean().nullable().optional(),
      requirements: l10nList.nullable().optional(),
      documents: l10nList.nullable().optional(),
      faq: faqList.nullable().optional(),
      sortOrder: z.number().int(),
      published: z.boolean(),
      ...seoFields,
    }),
  },
  services: {
    delegate: () => prisma.service as unknown as Delegate,
    orderBy: { sortOrder: 'asc' },
    schema: z.object({
      slug: z.string().regex(/^[a-z0-9-]+$/),
      icon: z.string().max(60),
      image: safeUrlOrEmpty,
      audience: z.enum(['all', 'company', 'candidate']),
      title: l10n,
      summary: l10n,
      body: l10n,
      features: l10nList,
      steps: l10nList.nullable().optional(),
      duration: l10n.nullable().optional(),
      sortOrder: z.number().int(),
      published: z.boolean(),
      ...seoFields,
    }),
  },
  partners: {
    delegate: () => prisma.partner as unknown as Delegate,
    orderBy: { sortOrder: 'asc' },
    schema: z.object({
      name: z.string().min(1).max(160),
      logo: safeUrlOrEmpty.nullable(),
      website: safeUrlOrEmpty.nullable(),
      sector: z.enum(['logistics', 'courier', 'industry', 'construction', 'hospitality', 'healthcare', 'agriculture', 'other']).nullable().optional(),
      city: z.string().max(80).nullable().optional(),
      description: l10n.nullable().optional(),
      featured: z.boolean().optional(),
      sortOrder: z.number().int(),
      published: z.boolean(),
    }),
  },
  'visa-samples': {
    delegate: () => prisma.visaSample as unknown as Delegate,
    orderBy: { sortOrder: 'asc' },
    schema: z.object({
      image: safeUrlOrEmpty,
      profession: l10n,
      visaLabel: z.string(),
      dateLabel: l10n,
      sortOrder: z.number().int(),
      published: z.boolean(),
    }),
  },
  testimonials: {
    delegate: () => prisma.testimonial as unknown as Delegate,
    orderBy: { sortOrder: 'asc' },
    schema: z.object({
      quote: l10n,
      author: l10n,
      role: l10n,
      kind: z.enum(['company', 'candidate']),
      sortOrder: z.number().int(),
      published: z.boolean(),
      // Video success story (/stories): YouTube / Vimeo link or an uploaded MP4 / WebM (/uploads/…), poster image, filters.
      videoUrl: storyVideoUrl.nullable().optional(),
      posterUrl: safeUrlOrEmpty.nullable().optional(),
      profession: z.string().trim().max(120).nullable().optional(),
      country: z.string().trim().max(40).nullable().optional(),
      city: z.string().trim().max(80).nullable().optional(),
      visaType: z.string().trim().max(30).nullable().optional(),
    }),
  },
  stats: {
    delegate: () => prisma.stat as unknown as Delegate,
    orderBy: { sortOrder: 'asc' },
    schema: z.object({
      icon: z.string(),
      value: z.number().int(),
      prefix: z.string(),
      suffix: z.string(),
      label: l10n,
      sortOrder: z.number().int(),
    }),
  },
  faqs: {
    delegate: () => prisma.faq as unknown as Delegate,
    orderBy: { sortOrder: 'asc' },
    schema: z.object({
      question: l10n,
      answer: l10n,
      audience: z.enum(['all', 'company', 'candidate']),
      sortOrder: z.number().int(),
      published: z.boolean(),
    }),
  },
  posts: {
    delegate: () => prisma.post as unknown as Delegate,
    orderBy: { publishedAt: 'desc' },
    schema: z.object({
      slug: z.string().regex(/^[a-z0-9-]+$/),
      cover: safeUrlOrEmpty,
      title: l10n,
      excerpt: l10n,
      body: l10n,
      published: z.boolean(),
      publishedAt: z.coerce.date(),
      ...seoFields,
    }),
  },
};

const resource = (name: string) => {
  const r = resources[name];
  if (!r) throw notFound('UNKNOWN_RESOURCE');
  return r;
};

adminContentRouter.get('/:resource', async (req, res) => {
  const r = resource(req.params.resource);
  res.json({ items: await r.delegate().findMany({ orderBy: r.orderBy }) });
});

/** Optional JSON columns: Prisma needs DbNull (not plain null) to clear them. */
const JSON_FIELDS = new Set(['description', 'requirements', 'documents', 'faq', 'steps', 'duration', 'seoTitle', 'seoDescription']);
const toDb = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === null && JSON_FIELDS.has(k) ? Prisma.DbNull : v]));

adminContentRouter.post('/:resource', async (req, res) => {
  const r = resource(req.params.resource);
  const data = toDb(parse(r.schema, req.body));
  res.status(201).json({ item: await r.delegate().create({ data }) });
});

adminContentRouter.put('/:resource/:id', async (req, res) => {
  const r = resource(req.params.resource);
  const data = toDb(parse(r.schema.partial(), req.body));
  res.json({ item: await r.delegate().update({ where: { id: req.params.id }, data }) });
});

/**
 * Cases and vacancies still pointing at a visa category. Deleting it would silently detach them (the relation is
 * SET NULL), so DELETE refuses while it is in use — the admin deactivates it (published = false) instead: it then
 * disappears from the public site and from new applications, but existing cases keep it.
 */
export const visaCategoryUsage = async (id: string) => {
  const [cases, vacancies] = await Promise.all([prisma.case.count({ where: { visaCategoryId: id } }), prisma.vacancy.count({ where: { visaCategoryId: id } })]);
  return { cases, vacancies };
};

adminContentRouter.delete('/:resource/:id', async (req, res) => {
  const r = resource(req.params.resource);
  if (req.params.resource === 'visa-categories') {
    const usage = await visaCategoryUsage(req.params.id);
    if (usage.cases || usage.vacancies) {
      res.status(409).json({ error: 'VISA_CATEGORY_IN_USE', message: 'VISA_CATEGORY_IN_USE', ...usage });
      return;
    }
  }
  await r.delegate().delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ─── Site settings (contact info, social links) ───────────────────────

export const adminSettingsRouter = Router();

adminSettingsRouter.get('/', async (_req, res) => {
  const settings = await prisma.setting.findMany();
  res.json({ settings: Object.fromEntries(settings.map((s) => [s.key, s.value])) });
});

/** DSGVO retention overview for Admin → Settings (period, schedule, cases due). */
adminSettingsRouter.get('/retention-status', async (_req, res) => {
  res.json(await retentionStatus());
});

adminSettingsRouter.put('/:key', async (req, res) => {
  const key = parse(z.string().regex(/^[a-zA-Z0-9_.-]{1,64}$/), req.params.key);
  const body = parse(z.object({ value: z.unknown() }), req.body);
  if (body.value === undefined) throw badRequest('VALUE_REQUIRED');
  // Module toggles have their own SUPER_ADMIN endpoint (PUT /api/admin/nav/modules) with validation.
  if (key === MODULES_SETTING_KEY) throw forbidden('USE_MODULES_ENDPOINT');
  // Keys with a fixed shape (legal & security stream) are validated; others stay free-form.
  const schema = LEGAL_SETTING_SCHEMAS[key];
  const value = schema ? parse(schema, body.value) : body.value;
  if (schema) await audit(req, 'SETTING_UPDATED', `setting:${key}`);
  const setting = await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
  res.json({ setting });
});

// ─── Image upload for content ─────────────────────────────────────────

export const adminUploadRouter = Router();

adminUploadRouter.post('/', imageUpload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED');
  await verifyUploadedFile(req.file);
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});
