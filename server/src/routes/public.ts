import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { limiter, notFound, parse } from '../lib/http.js';
import { notifyStaff } from '../lib/notifications.js';

// whitelabel.customers: the owner's list of agencies that bought the platform (white-label, never public).
const PRIVATE_SETTING_KEYS = ['invoicing', 'retention', 'whitelabel.customers'];
import { cached } from '../lib/cache.js';

import { onInquiryCreated } from '../lib/assignment/inquiry.js';
import { attachLeadContext, utmSchema, visitorIdSchema } from '../lib/marketing/leadScoring.js';

export const publicRouter = Router();

/** Lets browsers/CDNs reuse public content briefly; admin edits clear the server cache immediately. */
const publicCache = (res: Response) => res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');

// Detail pages are public too; let browsers reuse them briefly (the global no-store is for private data).
publicRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=30');
  next();
});

publicRouter.get('/content', async (_req, res) => {
  publicCache(res);
  res.json(await cached('content', loadContent));
});

const loadContent = async () => {
  const [stats, visaCategories, services, partners, samples, testimonials, faqs, posts, settings] = await Promise.all([
    prisma.stat.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.visaCategory.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.service.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.partner.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.visaSample.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.testimonial.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.faq.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.post.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
      take: 6,
      select: { id: true, slug: true, cover: true, title: true, excerpt: true, publishedAt: true },
    }),
    // Internal settings (bank details for invoices, retention policy) never leave the admin API.
    prisma.setting.findMany({ where: { key: { notIn: PRIVATE_SETTING_KEYS } } }),
  ]);
  return {
    stats,
    visaCategories,
    services,
    partners,
    samples,
    testimonials,
    faqs,
    posts,
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
  };
};

publicRouter.get('/visa/:slug', async (req, res) => {
  const visa = await prisma.visaCategory.findUnique({ where: { slug: req.params.slug } });
  if (!visa || !visa.published) throw notFound();
  res.json({ visa });
});

publicRouter.get('/services', async (_req, res) => {
  publicCache(res);
  res.json({ services: (await cached('content', loadContent)).services });
});

publicRouter.get('/services/:slug', async (req, res) => {
  const service = await prisma.service.findUnique({ where: { slug: req.params.slug } });
  if (!service || !service.published) throw notFound();
  res.json({ service });
});

publicRouter.get('/posts', async (_req, res) => {
  publicCache(res);
  const posts = await cached('posts', () =>
    prisma.post.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, slug: true, cover: true, title: true, excerpt: true, publishedAt: true },
    }),
  );
  res.json({ posts });
});

publicRouter.get('/posts/:slug', async (req, res) => {
  const post = await prisma.post.findUnique({ where: { slug: req.params.slug } });
  if (!post || !post.published) throw notFound();
  res.json({ post });
});

const inquiryLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10 });

publicRouter.post('/inquiries', inquiryLimiter, async (req, res) => {
  const body = parse(
    z.object({
      kind: z.enum(['company', 'contact']),
      companyName: z.string().trim().max(160).optional(),
      contactName: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(200),
      phone: z.string().trim().max(40).optional(),
      sector: z.string().trim().max(120).optional(),
      workersNeeded: z.coerce.number().int().min(1).max(10000).optional(),
      message: z.string().trim().min(5).max(5000),
      locale: z.enum(['az', 'de', 'en', 'ru']).catch('az'),
      // honeypot: real users never fill this hidden field
      website: z.string().max(200).optional(),
      // lead scoring context (the visitor id only exists after analytics consent)
      visitorId: visitorIdSchema.optional().catch(undefined),
      utm: utmSchema.optional().catch(undefined),
    }),
    req.body,
  );
  const { website: honeypot, visitorId, utm, ...data } = body;
  if (honeypot) {
    // A bot filled the hidden field. Answer exactly like a success so it learns nothing.
    res.status(201).json({ ok: true, id: 'ok' });
    return;
  }
  const inquiry = await prisma.inquiry.create({ data });
  void onInquiryCreated(inquiry.id); // automation rules + optional auto-assignment (never throws)

  const lines = [
    body.kind === 'company' ? 'Növ: Şirkət əməkdaşlıq təklifi' : 'Növ: Əlaqə formu',
    body.companyName ? `Şirkət: ${body.companyName}` : null,
    `Ad: ${body.contactName}`,
    `Email: ${body.email}`,
    body.phone ? `Telefon: ${body.phone}` : null,
    body.sector ? `Sahə: ${body.sector}` : null,
    body.workersNeeded ? `Lazım olan işçi sayı: ${body.workersNeeded}` : null,
    `Dil: ${body.locale}`,
    '',
    body.message,
  ].filter((l) => l !== null);
  await notifyStaff(
    body.kind === 'company' ? `Yeni əməkdaşlıq təklifi: ${body.companyName ?? body.contactName}` : `Yeni mesaj: ${body.contactName}`,
    lines.join('\n'),
    { link: `/admin/inquiries` },
  );
  // Lead score after the "new inquiry" notice, so a HOT alert never arrives before it (never throws).
  await attachLeadContext(inquiry.id, { visitorId, utm });
  res.status(201).json({ ok: true, id: inquiry.id });
});
