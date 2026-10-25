import type { Express, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { getSiteTheme } from '../site/theme.js';

/**
 * White-label brand of this instance (one instance per agency: own server, domain, database, brand).
 *
 * Resolution, per field: Setting `brand` (SUPER_ADMIN → System → Brand) → BRAND_* environment variables
 * (written by deploy/whitelabel/new-instance.sh) → the built-in Triad Vision defaults. Without any brand
 * setting or BRAND_* variable an instance is exactly the owner's Triad Vision site.
 *
 * Contact data, the legal entity and social links are NOT duplicated here: they stay in the `contact`,
 * `legal` and `social` settings. Colours come from the site theme (Setting `theme`, lib/site/theme.ts).
 *
 * The server's copy (e-mails, PDFs, SEO, AI prompts …) keeps the literal "Triad Vision". `brandify()` swaps
 * the default brand tokens for this instance's brand at the output sinks (mailer, notifications, PDF text,
 * SEO head/body/RSS, AI requests, API JSON). With the default brand it is a no-op, so the owner's output is
 * byte-identical. Brand texts are restricted to characters that are safe inside HTML, JSON, XML and PDF text
 * (no < > " & \ { }), so a plain string replacement can never break the surrounding markup.
 */

export const DEFAULT_BRAND = {
  name: 'Triad Vision',
  shortName: 'Triad Vision',
  tagline: 'People · Work · Opportunities',
  domain: 'triad-vision.de',
  phone: '+994 50 748 70 48',
  legalName: '',
  supportEmail: '',
  country: 'DE',
  description: 'Almaniyada iş və viza: müraciətiniz, sənədləriniz və bildirişləriniz bir yerdə.',
  footerText: '',
  primaryColor: '#0b1f44',
} as const;

export const BRAND_LANGUAGES = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
export type BrandLanguage = (typeof BRAND_LANGUAGES)[number];

export const BRAND_SETTING_KEY = 'brand';

/** Characters allowed in every brand text (see the header comment). */
const SAFE_TEXT = /^[^<>"&\\{}\u0000-\u001f\u007f]*$/;
const safe = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(SAFE_TEXT, 'BRAND_UNSAFE_CHARACTERS');
const optionalEmail = z.union([z.literal(''), z.string().trim().toLowerCase().email().max(200)]);
/** Only files this instance stored itself (lib/brand/assets.ts). */
const brandAsset = z.union([z.literal(''), z.string().regex(/^\/uploads\/brand\/[a-z0-9-]+(\/[a-z0-9-]+)?\.png$/)]);

export const brandSettingSchema = z
  .object({
    name: safe(60),
    shortName: safe(30),
    tagline: safe(80),
    legalName: safe(200),
    supportEmail: optionalEmail,
    phone: z.string().trim().max(40).regex(/^[+0-9 ()./-]*$/, 'BRAND_PHONE'),
    country: z.union([z.literal(''), z.string().trim().regex(/^[A-Za-z]{2}$/).transform((s) => s.toUpperCase())]),
    description: safe(300),
    footerText: safe(300),
    emailFromName: safe(80),
    emailFromAddress: optionalEmail,
    languages: z.array(z.enum(BRAND_LANGUAGES)).max(BRAND_LANGUAGES.length),
    defaultLanguage: z.union([z.literal(''), z.enum(BRAND_LANGUAGES)]),
    logoLight: brandAsset,
    logoDark: brandAsset,
    /** Folder of the generated icon set: /uploads/brand/<iconSet>/icon-192.png … ('' = the built-in icons). */
    iconSet: z.union([z.literal(''), z.string().regex(/^icons-[a-z0-9]{8,32}$/)]),
  })
  .partial();
export type BrandSetting = z.infer<typeof brandSettingSchema>;

export interface BrandIcons {
  favicon: string;
  faviconType: string;
  icon192: string;
  icon512: string;
  maskable192: string;
  maskable512: string;
  appleTouch: string;
  badge: string;
}

export interface Brand {
  name: string;
  shortName: string;
  tagline: string;
  legalName: string;
  /** Public domain of the site (e-mail footers, OG cards); the URLs themselves come from CLIENT_URL. */
  domain: string;
  siteUrl: string;
  supportEmail: string;
  phone: string;
  country: string;
  description: string;
  footerText: string;
  /** "Name <address>" for outgoing mail. */
  emailFrom: string;
  languages: BrandLanguage[];
  defaultLanguage: BrandLanguage;
  primaryColor: string;
  logoLight: string;
  logoDark: string;
  icons: BrandIcons;
  /** True when every token brandify() swaps equals the default (owner instance): output stays untouched. */
  isDefault: boolean;
}

const DEFAULT_ICONS: BrandIcons = {
  favicon: '/favicon.svg',
  faviconType: 'image/svg+xml',
  icon192: '/icons/icon-192.png',
  icon512: '/icons/icon-512.png',
  maskable192: '/icons/icon-maskable-192.png',
  maskable512: '/icons/icon-maskable-512.png',
  appleTouch: '/icons/apple-touch-icon.png',
  badge: '/icons/badge-96.png',
};

export const iconsFor = (iconSet: string | undefined): BrandIcons => {
  if (!iconSet) return DEFAULT_ICONS;
  const base = `/uploads/brand/${iconSet}`;
  return {
    favicon: `${base}/favicon-48.png`,
    faviconType: 'image/png',
    icon192: `${base}/icon-192.png`,
    icon512: `${base}/icon-512.png`,
    maskable192: `${base}/icon-maskable-192.png`,
    maskable512: `${base}/icon-maskable-512.png`,
    appleTouch: `${base}/apple-touch-icon.png`,
    badge: `${base}/badge-96.png`,
  };
};

// ─── Environment defaults ─────────────────────────────────────────────

const envText = (env: NodeJS.ProcessEnv, name: string, max: number) => {
  const raw = (env[name] ?? '').trim();
  if (!raw) return undefined;
  if (raw.length > max || !SAFE_TEXT.test(raw)) {
    console.warn(`[brand] ignoring ${name}: too long or contains < > " & \\ { }`);
    return undefined;
  }
  return raw;
};

const parseLanguages = (raw: string | undefined): BrandLanguage[] | undefined => {
  if (!raw) return undefined;
  const list = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is BrandLanguage => (BRAND_LANGUAGES as readonly string[]).includes(s));
  return list.length ? [...new Set(list)] : undefined;
};

/** BRAND_* variables (deploy/whitelabel/env.template). Unset → undefined (the built-in default applies). */
export const brandEnv = (env: NodeJS.ProcessEnv = process.env) => ({
  name: envText(env, 'BRAND_NAME', 60),
  shortName: envText(env, 'BRAND_SHORT', 30),
  tagline: envText(env, 'BRAND_TAGLINE', 80),
  domain: envText(env, 'BRAND_DOMAIN', 200)?.toLowerCase(),
  legalName: envText(env, 'BRAND_LEGAL_NAME', 200),
  supportEmail: envText(env, 'BRAND_SUPPORT_EMAIL', 200),
  phone: envText(env, 'BRAND_PHONE', 40),
  country: envText(env, 'BRAND_COUNTRY', 2)?.toUpperCase(),
  description: envText(env, 'BRAND_DESCRIPTION', 300),
  languages: parseLanguages(env.BRAND_LANGUAGES),
});

const pick = (...values: (string | undefined)[]) => values.find((v) => typeof v === 'string' && v.trim() !== '') ?? '';

/** Pure resolution (tests call it directly). */
export const resolveBrand = (
  setting: BrandSetting | null | undefined,
  opts: { env?: NodeJS.ProcessEnv; primaryColor?: string; smtpFrom?: string; clientUrl?: string } = {},
): Brand => {
  const s = setting ?? {};
  const e = brandEnv(opts.env ?? process.env);
  const name = pick(s.name, e.name, DEFAULT_BRAND.name);
  // A renamed brand without its own short name uses the new name (never "Triad Vision").
  const shortName = pick(s.shortName, e.shortName, name !== DEFAULT_BRAND.name ? name : DEFAULT_BRAND.shortName);
  const tagline = pick(s.tagline, e.tagline, DEFAULT_BRAND.tagline);
  const domain = pick(e.domain, DEFAULT_BRAND.domain);
  const phone = pick(s.phone, e.phone, name === DEFAULT_BRAND.name ? DEFAULT_BRAND.phone : '');
  const languages = s.languages?.length ? s.languages : (e.languages ?? [...BRAND_LANGUAGES]);
  const defaultLanguage = s.defaultLanguage && languages.includes(s.defaultLanguage) ? s.defaultLanguage : (languages[0] ?? 'az');
  const smtpFrom = opts.smtpFrom ?? config.smtp.from;
  const fromAddress = pick(s.emailFromAddress);
  const fromName = pick(s.emailFromName);
  const emailFrom = fromAddress
    ? `${fromName || name} <${fromAddress}>`
    : fromName
      ? `${fromName} <${smtpFrom.replace(/^.*<|>.*$/g, '').trim()}>`
      : smtpFrom;
  const brand: Brand = {
    name,
    shortName,
    tagline,
    legalName: pick(s.legalName, e.legalName),
    domain,
    siteUrl: new URL(opts.clientUrl ?? config.clientUrl).origin,
    supportEmail: pick(s.supportEmail, e.supportEmail),
    phone,
    country: pick(s.country, e.country, DEFAULT_BRAND.country),
    description: pick(s.description, e.description, name === DEFAULT_BRAND.name ? DEFAULT_BRAND.description : ''),
    footerText: pick(s.footerText),
    emailFrom,
    languages,
    defaultLanguage,
    primaryColor: opts.primaryColor ?? DEFAULT_BRAND.primaryColor,
    logoLight: pick(s.logoLight),
    logoDark: pick(s.logoDark),
    icons: iconsFor(s.iconSet),
    isDefault: false,
  };
  brand.isDefault = replacementPairs(brand).length === 0;
  return brand;
};

// ─── brandify ─────────────────────────────────────────────────────────

const upper = (s: string) => s.toLocaleUpperCase('en');

/** [default token, this brand's value] for every token that differs. */
export const replacementPairs = (b: Pick<Brand, 'name' | 'domain' | 'phone' | 'tagline'>): [string, string][] => {
  const pairs: [string, string][] = [
    ['Triad Vision', b.name],
    ['TRIAD VISION', upper(b.name)],
    ['Triad-Vision', b.name.replace(/\s+/g, '-')],
    // "TriadVision" (meeting room names, user agents) is deliberately not swapped: a room link stored in the
    // database must stay identical to the one in the e-mail.
    ['PEOPLE · WORK · OPPORTUNITIES', upper(b.tagline)],
    ['People · Work · Opportunities', b.tagline],
    ['triad-vision.de', b.domain],
  ];
  // An empty phone is not swapped in (the e-mail footer builds its line from the brand itself).
  if (b.phone) pairs.push([DEFAULT_BRAND.phone, b.phone]);
  // A value that contains its own token is not swapped: brandify() must be idempotent (sinks may apply it twice,
  // e.g. a notification text that is then e-mailed).
  return pairs.filter(([from, to]) => to && !to.includes(from));
};

const NAME_TOKENS = new Set(['Triad Vision', 'TRIAD VISION', 'Triad-Vision']);

const swap = (text: string, pairs: [string, string][]) => {
  let out = text;
  for (const [from, to] of pairs) if (out.includes(from)) out = out.split(from).join(to);
  return out;
};

// ─── Cached snapshot ──────────────────────────────────────────────────

const TTL_MS = 60_000;
let snapshot: Brand = resolveBrand(null);
let pairs: [string, string][] = replacementPairs(snapshot);
let namePairs: [string, string][] = pairs.filter(([from]) => NAME_TOKENS.has(from));
let loadedAt = 0;
let started = false;
let loading: Promise<Brand> | null = null;
const apps = new Set<Express>();

/** Swaps the default brand tokens (name, domain, phone, tagline) for this instance's brand. */
export const brandify = (text: string): string => (pairs.length && text ? swap(text, pairs) : text);

/** Only the brand name (API JSON: user data may legitimately contain domains or phone numbers). */
export const brandifyNames = (text: string): string => (namePairs.length && text ? swap(text, namePairs) : text);

const jsonReplacer = (_key: string, value: unknown) => (typeof value === 'string' ? brandifyNames(value) : value);

const TEXT_TYPES = /^(text\/(html|plain|calendar)|application\/(xml|rss\+xml|manifest\+json))/i;

/**
 * Text responses (iCalendar feeds, robots.txt, HTML fragments, RSS) follow the brand too. Registered by
 * createApp; does nothing while the brand is the default. JSON uses the replacer above, PDFs pdfPatch.ts,
 * CSV exports are user data and stay untouched.
 */
export const brandTextResponses = (_req: Request, res: Response, next: NextFunction) => {
  if (!pairs.length) return next();
  const send = res.send.bind(res);
  res.send = (body?: unknown) => {
    if (typeof body === 'string' && TEXT_TYPES.test(String(res.get('Content-Type') ?? ''))) return send(brandify(body));
    return send(body);
  };
  next();
};

const applySnapshot = (next: Brand) => {
  snapshot = next;
  pairs = replacementPairs(next);
  namePairs = pairs.filter(([from]) => NAME_TOKENS.has(from));
  // API JSON: a JSON replacer only while the brand differs (the default brand pays nothing).
  for (const app of apps) app.set('json replacer', namePairs.length ? jsonReplacer : undefined);
};

export const readBrandSetting = async (): Promise<BrandSetting> => {
  const row = await prisma.setting.findUnique({ where: { key: BRAND_SETTING_KEY } });
  const parsed = brandSettingSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : {};
};

/** Reloads the brand from the database (settings + theme colour). */
export const refreshBrand = (): Promise<Brand> => {
  started = true;
  loading ??= (async () => {
    try {
      const [setting, theme] = await Promise.all([readBrandSetting(), getSiteTheme()]);
      applySnapshot(resolveBrand(setting, { primaryColor: theme.brandPrimary }));
      loadedAt = Date.now();
      return snapshot;
    } finally {
      loading = null;
    }
  })();
  return loading;
};

/** The brand, loaded from the database when the cached copy is older than a minute. */
export const getBrand = async (): Promise<Brand> => {
  if (!started || Date.now() - loadedAt > TTL_MS) {
    try {
      await refreshBrand();
    } catch (err) {
      console.error('[brand] could not load the brand setting', err);
    }
  }
  return snapshot;
};

/**
 * The cached brand, synchronously (PDF and e-mail rendering). Once the brand was loaded (startup, first
 * getBrand) a stale copy triggers a background refresh; before that it is the environment default.
 */
export const brandSync = (): Brand => {
  if (started && !loading && Date.now() - loadedAt > TTL_MS) void refreshBrand().catch(() => undefined);
  return snapshot;
};

/** After a brand / theme change: the next read reloads. */
export const invalidateBrand = () => {
  loadedAt = 0;
};

/** Express apps whose JSON responses follow the brand (createApp registers itself). */
export const registerBrandApp = (app: Express) => {
  apps.add(app);
  app.set('json replacer', namePairs.length ? jsonReplacer : undefined);
};

/** Tests: back to the environment default without a database read. */
export const resetBrandForTests = () => {
  started = false;
  loadedAt = 0;
  applySnapshot(resolveBrand(null));
};

/** Public part of the brand (site bootstrap, /api/site/brand, the <meta name="tv-brand"> tag). */
export const publicBrand = (b: Brand) => ({
  name: b.name,
  shortName: b.shortName,
  tagline: b.tagline,
  domain: b.domain,
  legalName: b.legalName,
  supportEmail: b.supportEmail,
  phone: b.phone,
  country: b.country,
  footerText: b.footerText,
  languages: b.languages,
  defaultLanguage: b.defaultLanguage,
  primaryColor: b.primaryColor,
  logoLight: b.logoLight,
  logoDark: b.logoDark,
  icons: b.icons,
  isDefault: b.isDefault,
});
export type PublicBrand = ReturnType<typeof publicBrand>;
