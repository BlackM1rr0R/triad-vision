import { Router, type Request, type Response } from 'express';
import {
  getRss,
  getSeoData,
  getSitemap,
  getSitemapGroup,
  parseLocale,
  renderHead,
  renderRobots,
  SITEMAP_GROUPS,
  type OgKind,
  type SitemapGroup,
} from '../lib/seo.js';
import { getBody } from '../lib/seoBody.js';
import { ogCardPng, ogCardText } from '../lib/ogImage.js';
import { getCaseAiSettings } from '../lib/ai/features/caseAi/config.js';
import { successShareHead } from '../lib/successShare/service.js';
import { brandify } from '../lib/brand/index.js';
import { brandHeadTags, webManifest } from '../lib/brand/web.js';

// SEO: robots.txt, sitemaps, RSS, Open Graph cards, /api/seo/* and the Caddy includes (mounted at the app root).
export const seoRouter = Router();

seoRouter.get('/robots.txt', (_req, res) => {
  res.type('text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(renderRobots());
});

const xml = (res: Response, body: string, maxAge = 600) => {
  res.type('application/xml; charset=utf-8');
  res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
  res.send(body);
};

/** Sitemap index: one child sitemap per content group (see SITEMAP_GROUPS). */
seoRouter.get('/sitemap.xml', async (_req, res) => xml(res, await getSitemap()));

seoRouter.get('/sitemaps/:file', async (req, res) => {
  const group = /^([a-z]+)\.xml$/.exec(req.params.file)?.[1];
  if (!group || !(SITEMAP_GROUPS as readonly string[]).includes(group)) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  xml(res, await getSitemapGroup(group as SitemapGroup));
});

/** RSS: /rss.xml (Azerbaijani) and /de/rss.xml, /tr/rss.xml … (also ?lang=de). */
const rss = async (req: Request, res: Response) => {
  const lng = parseLocale(req.params.lng ?? req.query.lang) ?? 'az';
  if (req.params.lng && !parseLocale(req.params.lng)) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  res.type('application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=900');
  res.send(brandify(await getRss(lng)));
};
seoRouter.get('/rss.xml', rss);
seoRouter.get('/:lng/rss.xml', rss);

/**
 * Head tags for one page: GET ?path=/de/visas/lkw-fahrer → HTML fragment (the language comes from the path
 * prefix; a legacy &lng= is honoured for unprefixed paths).
 * It never fails: any error answers 200 with an empty body, so the page still renders with the static
 * fallbacks from index.html (Caddy's httpInclude turns a non-2xx answer into a broken page).
 */
/**
 * Defence in depth for the Caddy include: Caddy renders the included fragment as a template (delimiters
 * "<!--tv:" / ":tv-->", deploy/Caddyfile), so a fragment that somehow contains a delimiter (all CMS text is
 * escaped, so it never should) is dropped instead of being executed as a template action.
 */
export const TEMPLATE_DELIMITER_RE = /<!--\s*tv:|:tv\s*-->/i;
export const templateSafe = (html: string) => {
  if (!TEMPLATE_DELIMITER_RE.test(html)) return html;
  console.error('[seo] fragment contained a template delimiter; dropped');
  return '';
};

const head = async (req: Request, res: Response) => {
  res.type('text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  try {
    // Visa-approved share pages (/success/:token) depend on the client's consent: computed live, never cached.
    const share = await successShareHead(String(req.query.path ?? '/'));
    const html = templateSafe(brandify(share ?? renderHead(String(req.query.path ?? '/'), parseLocale(req.query.lng), await getSeoData())));
    res.setHeader('Cache-Control', share !== null ? 'no-store' : 'public, max-age=60, stale-while-revalidate=600');
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

/**
 * Crawlable page body for the Caddy include into <div id="root"> (lib/seoBody.ts). Same failure rule as the
 * head: errors answer 200 with an empty body (the SPA renders as before).
 */
seoRouter.get('/__seo/body', async (req, res) => {
  res.type('text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  try {
    const html = templateSafe(brandify(await getBody(String(req.query.path ?? '/'), await getSeoData())));
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    res.send(html);
  } catch (err) {
    console.error('[seo] body failed', err);
    res.setHeader('Cache-Control', 'no-store');
    res.send('');
  }
});

/**
 * White-label brand tags of the HTML shell (Caddy include, client/index.html): theme colour, favicon, app
 * icons, the installed-app title and <meta name="tv-brand"> (the brand the SPA starts with). Same failure
 * rule as the head: an error answers 200 with an empty body and index.html keeps its static Triad Vision tags.
 */
seoRouter.get('/__seo/brand', async (_req, res) => {
  res.type('text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  try {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(templateSafe(await brandHeadTags()));
  } catch (err) {
    console.error('[seo] brand tags failed', err);
    res.setHeader('Cache-Control', 'no-store');
    res.send('');
  }
});

/** Web app manifest of the installable site, from the brand (Caddy forwards /manifest.webmanifest here). */
seoRouter.get('/manifest.webmanifest', async (_req, res) => {
  res.type('application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(JSON.stringify(await webManifest(), null, 2));
});

/** Generated Open Graph title card: /og/<kind>/<lng>/<slug>.png (lib/ogImage.ts). */
const OG_KINDS: OgKind[] = ['visas', 'services', 'news', 'jobs', 'events', 'guides'];
seoRouter.get('/og/:kind/:lng/:file', async (req, res) => {
  const kind = req.params.kind as OgKind;
  const lng = parseLocale(req.params.lng);
  const slug = /^(.{1,200})\.png$/.exec(req.params.file)?.[1];
  const text = OG_KINDS.includes(kind) && lng && slug ? ogCardText(await getSeoData(), kind, slug, lng) : null;
  if (!text) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  try {
    const png = await ogCardPng(text.title, text.kicker, lng ?? 'en');
    res.type('image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.send(png);
  } catch (err) {
    console.error('[seo] og card failed', err);
    res.redirect(302, '/og-default.png');
  }
});

/** Public client configuration for SEO/analytics: the GA4 measurement id (Setting `analytics` or env GA4_ID). */
seoRouter.get('/api/seo/config', async (_req, res) => {
  const data = await getSeoData();
  const fromSetting = (data.settings.analytics as { ga4Id?: unknown } | undefined)?.ga4Id;
  const raw = typeof fromSetting === 'string' && fromSetting.trim() ? fromSetting.trim() : (process.env.GA4_ID ?? '').trim();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ ga4Id: /^G-[A-Z0-9]{4,15}$/.test(raw) ? raw : null });
});

/**
 * EU Blue Card salary thresholds (§ 18g AufenthG) for the public salary check (/blue-card-check). The values
 * are the admin-editable ones of the case AI settings (lib/ai/features/caseAi/config.ts), so the tool, the
 * contract checks and the guides never disagree.
 */
seoRouter.get('/api/seo/blue-card', async (_req, res) => {
  const s = await getCaseAiSettings();
  const years = Object.keys(s.blueCard).sort();
  const current = String(new Date().getFullYear());
  const year = years.includes(current) ? current : years[years.length - 1];
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({ year, thresholds: s.blueCard, current: year ? s.blueCard[year] : null, olderWorker: year ? (s.olderWorker[year] ?? null) : null });
});
