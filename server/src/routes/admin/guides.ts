import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { SEO_LOCALES } from '../../lib/seoCatalogue.js';
import { renderGuideMarkdown } from '../../lib/guides/markdown.js';
import { guidePath, localizedPath } from '../../lib/guides/service.js';

/**
 * Admin CRUD for the topic guides (/admin/guides). One row per (key, locale); each language version has its
 * own slug (unique per language). Writes clear the public cache (admin/index.ts), so the site, sitemap, RSS
 * and the crawler HTML show the change at once.
 */
export const adminGuidesRouter = Router();

const faqItem = z.object({ q: z.string().trim().min(1).max(300), a: z.string().trim().min(1).max(2000) });
const schema = z.object({
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,59}$/),
  locale: z.enum(SEO_LOCALES),
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{2,159}$/),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(400),
  body: z.string().max(200_000),
  faq: z.array(faqItem).max(20).default([]),
  published: z.boolean().default(true),
});

const uniqueError = (err: unknown) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = String((err.meta as { target?: unknown } | undefined)?.target ?? '');
    return conflict(target.includes('slug') ? 'GUIDE_SLUG_TAKEN' : 'GUIDE_LOCALE_EXISTS');
  }
  return err;
};

adminGuidesRouter.get('/', async (_req, res) => {
  const items = await prisma.guidePage.findMany({
    orderBy: [{ key: 'asc' }, { locale: 'asc' }],
    select: { id: true, key: true, locale: true, slug: true, title: true, description: true, published: true, updatedAt: true, createdAt: true },
  });
  res.json({ items: items.map((g) => ({ ...g, path: localizedPath(guidePath(g.slug), g.locale as (typeof SEO_LOCALES)[number]) })) });
});

adminGuidesRouter.get('/:id', async (req, res) => {
  const item = await prisma.guidePage.findUnique({ where: { id: req.params.id } });
  if (!item) throw notFound('GUIDE_NOT_FOUND');
  res.json({ item });
});

/** Markdown preview, rendered exactly like the public page (links get the language prefix). */
adminGuidesRouter.post('/preview', async (req, res) => {
  const { body, locale } = parse(z.object({ body: z.string().max(200_000), locale: z.enum(SEO_LOCALES).default('az') }), req.body);
  const guides = await prisma.guidePage.findMany({ where: { locale }, select: { key: true, slug: true } });
  res.json(
    renderGuideMarkdown(body, {
      localize: (p) => localizedPath(p, locale),
      guideHref: (key) => {
        const g = guides.find((x) => x.key === key);
        return g ? localizedPath(guidePath(g.slug), locale) : null;
      },
    }),
  );
});

adminGuidesRouter.post('/', async (req, res) => {
  const data = parse(schema, req.body);
  const item = await prisma.guidePage.create({ data }).catch((err) => {
    throw uniqueError(err);
  });
  await audit(req, 'GUIDE_CREATED', `guide:${item.id}`, { key: item.key, locale: item.locale });
  res.status(201).json({ item });
});

adminGuidesRouter.put('/:id', async (req, res) => {
  const data = parse(schema.partial(), req.body);
  const exists = await prisma.guidePage.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!exists) throw notFound('GUIDE_NOT_FOUND');
  const item = await prisma.guidePage.update({ where: { id: req.params.id }, data }).catch((err) => {
    throw uniqueError(err);
  });
  await audit(req, 'GUIDE_UPDATED', `guide:${item.id}`, { key: item.key, locale: item.locale });
  res.json({ item });
});

adminGuidesRouter.delete('/:id', async (req, res) => {
  const item = await prisma.guidePage.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!item) throw notFound('GUIDE_NOT_FOUND');
  await audit(req, 'GUIDE_DELETED', `guide:${item.id}`, { key: item.key, locale: item.locale });
  res.json({ ok: true });
});
