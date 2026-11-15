import { Router } from 'express';
import { notFound } from '../lib/http.js';
import { glossaryDetail, glossaryList, glossaryLocale } from '../lib/glossary/index.js';

/**
 * German bureaucracy glossary, mounted at /api/glossary (public, static data in lib/glossary):
 *   GET /?lng=az|de|en|ru|tr|uk        → { asOf, categories, items } (alphabetical, short definition in lng)
 *   GET /:slug?lng=…                   → { asOf, term, related, prev, next } (404 GLOSSARY_TERM_NOT_FOUND)
 * Unknown / missing lng → az. tr and uk get the English long explanation (term.longFallback = 'en').
 */
export const glossaryRouter = Router();

const CACHE = 'public, max-age=3600';

glossaryRouter.get('/', (req, res) => {
  res.setHeader('Cache-Control', CACHE);
  res.json(glossaryList(glossaryLocale(req.query.lng)));
});

glossaryRouter.get('/:slug', (req, res) => {
  const detail = glossaryDetail(String(req.params.slug), glossaryLocale(req.query.lng));
  if (!detail) throw notFound('GLOSSARY_TERM_NOT_FOUND');
  res.setHeader('Cache-Control', CACHE);
  res.json(detail);
});
