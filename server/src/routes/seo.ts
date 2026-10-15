import { Router, type Request, type Response } from 'express';
import { getSeoData, getSitemap, parseLocale, renderHead, renderRobots } from '../lib/seo.js';

// SEO: /sitemap.xml, /robots.txt and /api/seo/* (mounted at the app root)
export const seoRouter = Router();

seoRouter.get('/robots.txt', (_req, res) => {
  res.type('text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(renderRobots());
});

seoRouter.get('/sitemap.xml', async (_req, res) => {
  res.type('application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.send(await getSitemap());
});

/**
 * Head tags for one page: GET ?path=/visas/lkw-fahrer&lng=de → HTML fragment.
 * It never fails: any error answers 200 with an empty body, so the page still renders with the static
 * fallbacks from index.html (Caddy's httpInclude turns a non-2xx answer into a broken page).
 */
const head = async (req: Request, res: Response) => {
  res.type('text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  try {
    const html = renderHead(String(req.query.path ?? '/'), parseLocale(req.query.lng), await getSeoData());
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    res.send(html);
  } catch (err) {
    console.error('[seo] head failed', err);
    res.setHeader('Cache-Control', 'no-store');
    res.send('');
  }
};

// Public endpoint used by the SPA on navigation (shares the /api rate limit).
seoRouter.get('/api/seo/head', head);
// Same fragment for Caddy's server-side include. Kept outside /api so every page view (which all reach the
// API from Caddy's own address) does not count against the per-IP /api limiter; Caddy only routes it for its
// internal sub-requests (see deploy/Caddyfile).
seoRouter.get('/__seo/head', head);
