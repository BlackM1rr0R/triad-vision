import { Router } from 'express';
import { parseLocale } from '../lib/seo.js';
import { getCaseAiSettings } from '../lib/ai/features/caseAi/config.js';
import { compareContent, currentThresholds, formatAmount } from '../lib/compare/visaCompare.js';
import { getPublishedGuides, guidePath, guidesFor, localizedPath } from '../lib/guides/service.js';

/**
 * "Which visa fits me?" comparison (/compare-visas) — mounted at /api/compare-visas:
 *   GET /?lng=tr   table (routes × criteria), FAQ and intro in that language, Blue Card / 45+ thresholds filled
 *                  in, and each route's guide resolved to its URL in the language (English guide as fallback).
 * The wizard that recommends routes runs in the browser (client/src/lib/visaCompare.ts).
 */
export const compareRouter = Router();

compareRouter.get('/', async (req, res) => {
  const lng = parseLocale(req.query.lng) ?? 'az';
  const [settings, guides] = await Promise.all([getCaseAiSettings(), getPublishedGuides()]);
  const thresholds = currentThresholds(settings);
  const content = compareContent(lng, thresholds);
  const inLang = guidesFor(guides, lng);
  const guideOf = (key: string) => {
    const g = inLang.find((x) => x.key === key);
    return g ? { title: g.title, path: localizedPath(guidePath(g.slug), parseLocale(g.locale) ?? 'en') } : null;
  };
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    ...content,
    // Formatted Blue Card thresholds for the wizard's salary options.
    amounts: { standard: formatAmount(thresholds.standard, lng), shortage: formatAmount(thresholds.shortage, lng) },
    routes: content.routes.map((r) => ({ ...r, guide: guideOf(r.guideKey) })),
  });
});
