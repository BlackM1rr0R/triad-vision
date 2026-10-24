import { Router } from 'express';
import { notFound } from '../lib/http.js';
import { parseLocale } from '../lib/seo.js';
import { findGuide, getPublishedGuides, guidePath, guidesFor, localizedPath, renderGuide } from '../lib/guides/service.js';

/**
 * Public topic guides (/guides, /guides/:slug in every site language).
 *   GET /api/guides?lng=tr          → list for that language (English versions fill missing keys)
 *   GET /api/guides/:slug?lng=tr    → the rendered guide (HTML from the safe markdown renderer, TOC, FAQ,
 *                                     alternates, related); a slug of another language answers with
 *                                     { redirect } to the guide's URL in the requested language.
 */
export const guidesRouter = Router();

guidesRouter.get('/', async (req, res) => {
  const lng = parseLocale(req.query.lng) ?? 'az';
  const guides = guidesFor(await getPublishedGuides(), lng);
  res.setHeader('Cache-Control', 'public, max-age=120');
  res.json({
    items: guides.map((g) => ({
      key: g.key,
      locale: g.locale,
      slug: g.slug,
      title: g.title,
      description: g.description,
      updatedAt: g.updatedAt,
      path: localizedPath(guidePath(g.slug), parseLocale(g.locale) ?? 'en'),
    })),
  });
});

guidesRouter.get('/:slug', async (req, res) => {
  const lng = parseLocale(req.query.lng) ?? 'az';
  const all = await getPublishedGuides();
  const guide = findGuide(all, lng, req.params.slug);
  if (guide) {
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.json({ guide: renderGuide(all, guide) });
    return;
  }
  // Slug of another language (language switch, shared link): point to this language's version of the guide.
  const other = all.find((g) => g.slug === req.params.slug);
  const target = other && (all.find((g) => g.key === other.key && g.locale === lng) ?? other);
  if (!target) throw notFound('GUIDE_NOT_FOUND');
  res.json({ redirect: localizedPath(guidePath(target.slug), parseLocale(target.locale) ?? 'en') });
});
