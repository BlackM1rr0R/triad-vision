import { getBrand, publicBrand, type Brand, type BrandLanguage } from './index.js';

/**
 * Brand parts of the HTML shell and the installable site (PWA). With the default brand both are exactly the
 * static files they replace (client/index.html tags, client/public/manifest.webmanifest), so the owner's site
 * does not change; client/public/manifest.webmanifest stays as the fallback when the API is down.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const DEFAULT_THEME_COLOR = '#0b1f44';
/** The owner keeps the navy browser bar even when the site theme colour changes (as before). */
const themeColor = (b: Brand) => (!b.isDefault && /^#[0-9a-f]{6}$/i.test(b.primaryColor) ? b.primaryColor : DEFAULT_THEME_COLOR);

/** Google Search Console verification of the owner's triad-vision.de (formerly fixed in index.html). */
const OWNER_SITE_VERIFICATION = 'W7ASmkW0-5qq0rKMp2DrlQfP0kCTxliKR5rQQgiH7w4';
/** GOOGLE_SITE_VERIFICATION per instance; the owner's token only while the brand is the default one. */
const siteVerification = (b: Brand) => {
  const fromEnv = (process.env.GOOGLE_SITE_VERIFICATION ?? '').trim();
  if (/^[A-Za-z0-9_-]{10,100}$/.test(fromEnv)) return fromEnv;
  return b.isDefault ? OWNER_SITE_VERIFICATION : '';
};

/** Tags for the Caddy include /__seo/brand (no data-seo: the SPA's head manager leaves them alone). */
export const brandHeadTags = async () => {
  const b = await getBrand();
  const verification = siteVerification(b);
  const out = [
    ...(verification ? [`<meta name="google-site-verification" content="${esc(verification)}" />`] : []),
    `<meta name="theme-color" content="${esc(themeColor(b))}" />`,
    `<link rel="icon" type="${esc(b.icons.faviconType)}" href="${esc(b.icons.favicon)}" />`,
    `<link rel="apple-touch-icon" href="${esc(b.icons.appleTouch)}" />`,
    `<meta name="apple-mobile-web-app-title" content="${esc(b.shortName)}" />`,
    // The SPA reads its brand from here synchronously (client/src/lib/brand.ts): no flash of another name.
    `<meta name="tv-brand" content="${esc(JSON.stringify(publicBrand(b)))}" />`,
  ];
  return out.join('\n    ');
};

const SHORTCUTS: Record<BrandLanguage, { account: string; status: string; statusShort: string }> = {
  az: { account: 'Kabinet', status: 'Müraciət statusu', statusShort: 'Status' },
  de: { account: 'Konto', status: 'Antragsstatus', statusShort: 'Status' },
  en: { account: 'Account', status: 'Application status', statusShort: 'Status' },
  ru: { account: 'Кабинет', status: 'Статус заявки', statusShort: 'Статус' },
  tr: { account: 'Hesabım', status: 'Başvuru durumu', statusShort: 'Durum' },
  uk: { account: 'Кабінет', status: 'Статус заявки', statusShort: 'Статус' },
};

export const webManifest = async () => {
  const b = await getBrand();
  const color = themeColor(b);
  const sc = SHORTCUTS[b.defaultLanguage] ?? SHORTCUTS.az;
  const icons: Record<string, string>[] = [
    { src: b.icons.icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: b.icons.icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: b.icons.maskable192, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: b.icons.maskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
  if (b.icons.faviconType === 'image/svg+xml') icons.push({ src: b.icons.favicon, sizes: 'any', type: 'image/svg+xml', purpose: 'any' });
  return {
    id: '/',
    name: b.tagline ? `${b.name} — ${b.tagline}` : b.name,
    short_name: b.shortName,
    description: b.description || b.name,
    lang: b.defaultLanguage,
    dir: 'ltr',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: color,
    theme_color: color,
    categories: ['business', 'productivity'],
    icons,
    shortcuts: [
      { name: sc.account, short_name: sc.account, url: '/account?source=pwa', icons: [{ src: b.icons.icon192, sizes: '192x192' }] },
      { name: sc.status, short_name: sc.statusShort, url: '/status?source=pwa', icons: [{ src: b.icons.icon192, sizes: '192x192' }] },
    ],
  };
};
