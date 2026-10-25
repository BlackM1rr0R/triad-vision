import crypto from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { escapeHtml } from '../seo.js';
import { ensureReferralCode, getReferralSettings } from '../growth/referral.js';
import { clearSuccessCardCache, type CardFormat, type CardInput } from './card.js';
import { CARD_LOCALES, CARD_TEXTS, PAGE_HEAD, PAGE_LOCALES, asCardLocale, type CardLocale, type PageLocale } from './texts.js';

/**
 * "Visa approved" share links (/success/:token).
 *
 * Storage without a schema change: one Setting row per share, key `successShare:<token>`, value = the
 * record below. Revoking deletes the row, so the public page, the card images and the lead form answer 404
 * at once. Nothing is public without the client's explicit consent (consentAt), the page is noindex unless
 * the client opted in to search engines, and only the first name or the initials are ever shown.
 *
 * The public view is computed on every request from the live data (case still APPROVED, client active),
 * so a case that is reopened or a deactivated / deleted account also takes the page down.
 */

export const SHARE_KEY_PREFIX = 'successShare:';
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
export const NAME_STYLES = ['first', 'initials'] as const;
export type NameStyle = (typeof NAME_STYLES)[number];

const recordSchema = z.object({
  v: z.literal(1),
  userId: z.string().min(1),
  caseId: z.string().min(1),
  nameStyle: z.enum(NAME_STYLES),
  showReferral: z.boolean(),
  allowIndexing: z.boolean(),
  locale: z.enum(CARD_LOCALES),
  consentAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  leads: z.number().int().min(0).default(0),
});
export type ShareRecord = z.infer<typeof recordSchema>;

const keyOf = (token: string) => `${SHARE_KEY_PREFIX}${token}`;
const newToken = () => crypto.randomBytes(16).toString('base64url'); // 22 characters

export const readShare = async (token: string): Promise<ShareRecord | null> => {
  if (!SHARE_TOKEN_RE.test(token)) return null;
  const row = await prisma.setting.findUnique({ where: { key: keyOf(token) } });
  const parsed = row ? recordSchema.safeParse(row.value) : null;
  return parsed?.success ? parsed.data : null;
};

const writeShare = async (token: string, record: ShareRecord) => {
  const value = record as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key: keyOf(token) }, create: { key: keyOf(token), value }, update: { value } });
};

/** All shares of a client (token + record). */
export const sharesOf = async (userId: string) => {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: SHARE_KEY_PREFIX }, value: { path: '$.userId', equals: userId } } });
  return rows.flatMap((r) => {
    const parsed = recordSchema.safeParse(r.value);
    return parsed.success ? [{ token: r.key.slice(SHARE_KEY_PREFIX.length), record: parsed.data }] : [];
  });
};

/** First name only, or initials ("A. Q."). Never the surname. */
export const displayNameOf = (user: { firstName: string; lastName: string }, style: NameStyle, locale: string) => {
  const first = user.firstName.trim().split(/\s+/)[0] ?? '';
  if (style === 'first' && first) return first;
  const initial = (s: string) => (s.trim()[0] ?? '').toLocaleUpperCase(locale);
  return [initial(user.firstName), initial(user.lastName)]
    .filter(Boolean)
    .map((c) => `${c}.`)
    .join(' ');
};

const l10n = (v: unknown, locale: CardLocale) => {
  if (!v || typeof v !== 'object') return '';
  const o = v as Record<string, unknown>;
  const s = o[locale] ?? o.en ?? o.az;
  return typeof s === 'string' ? s.trim() : '';
};

const caseSelect = {
  id: true,
  number: true,
  status: true,
  clientId: true,
  parentCaseId: true,
  visaType: true,
  decisionAt: true,
  profession: true,
  visaCategory: { select: { visaLabel: true, title: true } },
  company: { select: { city: true } },
  vacancy: { select: { city: true } },
  arrivalPlan: { select: { housingCity: true } },
} satisfies Prisma.CaseSelect;
type ShareCase = Prisma.CaseGetPayload<{ select: typeof caseSelect }>;

/** "§18b · Truck drivers" (CMS visa category) or the generic visa type label. */
export const visaLineOf = (c: Pick<ShareCase, 'visaType' | 'visaCategory'>, locale: CardLocale) => {
  const title = c.visaCategory ? l10n(c.visaCategory.title, locale) : '';
  if (c.visaCategory && title) return c.visaCategory.visaLabel ? `${c.visaCategory.visaLabel} · ${title}` : title;
  return CARD_TEXTS[locale].visa[c.visaType];
};

/** German city of the placement (employer, vacancy, then the arrival housing city), first part only. */
export const cityOf = (c: Pick<ShareCase, 'company' | 'vacancy' | 'arrivalPlan'>) => {
  const raw = c.company?.city?.trim() || c.vacancy?.city?.trim() || c.arrivalPlan?.housingCity?.trim() || '';
  const city = raw.split(',')[0].trim().replace(/\s+/g, ' ').slice(0, 60);
  return city || null;
};

const localePrefix = (l: string) => (l === 'az' ? '' : `/${l}`);
export const shareUrlOf = (token: string, locale: string) => `${config.clientUrl}${localePrefix(locale)}/success/${token}`;

/** Cases that can be shared: the client's own approved main cases. */
export const shareableCases = (userId: string) =>
  prisma.case.findMany({ where: { clientId: userId, status: 'APPROVED', parentCaseId: null }, orderBy: { decisionAt: 'desc' }, select: caseSelect, take: 20 });

export interface ShareView {
  token: string;
  record: ShareRecord;
  displayName: string;
  visaLine: string;
  city: string | null;
  destination: string;
  locale: CardLocale;
  referralCode: string | null;
  shareUrl: string;
  qrUrl: string;
}

const referralCodeFor = async (record: ShareRecord) => {
  if (!record.showReferral) return null;
  if (!(await getReferralSettings()).enabled) return null;
  return (await ensureReferralCode(record.userId)).code;
};

/** Public view of a share, or null when it does not exist (revoked), the case is no longer approved or the account is gone. */
export const shareView = async (token: string): Promise<ShareView | null> => {
  const record = await readShare(token);
  if (!record) return null;
  const [user, c] = await Promise.all([
    prisma.user.findUnique({ where: { id: record.userId }, select: { firstName: true, lastName: true, isActive: true, role: true } }),
    prisma.case.findUnique({ where: { id: record.caseId }, select: caseSelect }),
  ]);
  if (!user || !user.isActive || user.role !== 'CLIENT' || !c || c.clientId !== record.userId || c.status !== 'APPROVED') return null;
  const locale = record.locale;
  const city = cityOf(c);
  const country = CARD_TEXTS[locale].country;
  const referralCode = await referralCodeFor(record);
  const shareUrl = shareUrlOf(token, locale);
  return {
    token,
    record,
    displayName: displayNameOf(user, record.nameStyle, locale),
    visaLine: visaLineOf(c, locale),
    city,
    destination: city ? `${city}, ${country}` : country,
    locale,
    referralCode,
    shareUrl,
    qrUrl: referralCode ? `${shareUrl}?ref=${encodeURIComponent(referralCode)}` : shareUrl,
  };
};

/** The JSON the public page gets: no ids, no surname, nothing beyond what the card shows. */
export const publicShareJson = (v: ShareView) => ({
  token: v.token,
  displayName: v.displayName,
  visaLine: v.visaLine,
  city: v.city,
  destination: v.destination,
  locale: v.locale,
  referralCode: v.referralCode,
  allowIndexing: v.record.allowIndexing,
  shareUrl: v.shareUrl,
  cards: { post: `/api/success/${v.token}/card-post.png`, story: `/api/success/${v.token}/card-story.png` },
});

export const cardInputOf = (v: ShareView, format: CardFormat): CardInput => {
  const tx = CARD_TEXTS[v.locale];
  return {
    format,
    displayName: v.displayName,
    kicker: tx.kicker,
    headline: tx.headline,
    visaLine: v.visaLine,
    destination: v.destination,
    subline: tx.subline,
    withUs: tx.withUs,
    scanLabel: tx.scan,
    codeLine: v.referralCode ? tx.code(v.referralCode) : null,
    qrUrl: v.qrUrl,
    lang: v.locale,
  };
};

export interface ShareOptions {
  caseId: string;
  nameStyle: NameStyle;
  showReferral: boolean;
  allowIndexing: boolean;
  locale: string;
}

/**
 * Creates the share link of an approved case (the caller has checked the explicit consent) or updates
 * the options of the existing one (same token, so links already shared keep working).
 */
export const upsertShare = async (userId: string, opts: ShareOptions, now = new Date()) => {
  const c = await prisma.case.findUnique({ where: { id: opts.caseId }, select: { clientId: true, status: true, parentCaseId: true } });
  if (!c || c.clientId !== userId) return { error: 'CASE_NOT_FOUND' as const };
  if (c.status !== 'APPROVED' || c.parentCaseId) return { error: 'CASE_NOT_APPROVED' as const };
  const existing = (await sharesOf(userId)).find((s) => s.record.caseId === opts.caseId);
  const token = existing?.token ?? newToken();
  const record: ShareRecord = {
    v: 1,
    userId,
    caseId: opts.caseId,
    nameStyle: opts.nameStyle,
    showReferral: opts.showReferral,
    allowIndexing: opts.allowIndexing,
    locale: asCardLocale(opts.locale),
    consentAt: now.toISOString(),
    createdAt: existing?.record.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    leads: existing?.record.leads ?? 0,
  };
  await writeShare(token, record);
  if (existing) clearSuccessCardCache();
  return { token, record };
};

/** Revokes (deletes) one of the client's shares. */
export const revokeShare = async (userId: string, token: string) => {
  const record = await readShare(token);
  if (!record || record.userId !== userId) return false;
  await prisma.setting.deleteMany({ where: { key: keyOf(token) } });
  clearSuccessCardCache();
  return true;
};

/** Every share of a user (account deletion / DSGVO erasure). */
export const revokeAllShares = async (userId: string) => {
  const shares = await sharesOf(userId);
  if (shares.length) await prisma.setting.deleteMany({ where: { key: { in: shares.map((s) => keyOf(s.token)) } } });
  clearSuccessCardCache();
  return shares.length;
};

export const countShareLead = async (token: string) => {
  const record = await readShare(token);
  if (record) await writeShare(token, { ...record, leads: record.leads + 1 });
};

// ─── Head tags of the public page (Caddy include / SPA navigation) ─────

const SHARE_PATH_RE = /^(?:\/(de|en|ru|tr|uk|az))?\/success\/([A-Za-z0-9_-]{22})\/?$/;

/** Head fragment for /success/:token (null for any other path). Unknown / revoked tokens get a noindex head. */
export const successShareHead = async (rawPath: string): Promise<string | null> => {
  const m = SHARE_PATH_RE.exec(rawPath.split('?')[0] ?? '');
  if (!m) return null;
  const lng = ((PAGE_LOCALES as readonly string[]).includes(m[1] ?? '') ? m[1] : 'az') as PageLocale;
  const view = await shareView(m[2]);
  const a = escapeHtml;
  const head = PAGE_HEAD[lng];
  if (!view) return `<title data-seo>Triad Vision</title>\n<meta data-seo name="robots" content="noindex, nofollow">`;
  const title = head.title(view.displayName);
  const image = `${config.clientUrl}/api/success/${view.token}/card-post.png`;
  const url = `${config.clientUrl}${localePrefix(lng)}/success/${view.token}`;
  const out = [
    `<title data-seo>${a(title)}</title>`,
    `<meta data-seo name="description" content="${a(head.description)}">`,
    `<meta data-seo name="robots" content="${view.record.allowIndexing ? 'index, follow, max-image-preview:large' : 'noindex, nofollow'}">`,
    ...(view.record.allowIndexing ? [`<link data-seo rel="canonical" href="${a(url)}">`] : []),
    `<meta data-seo property="og:site_name" content="Triad Vision">`,
    `<meta data-seo property="og:type" content="website">`,
    `<meta data-seo property="og:title" content="${a(title)}">`,
    `<meta data-seo property="og:description" content="${a(head.description)}">`,
    `<meta data-seo property="og:url" content="${a(url)}">`,
    `<meta data-seo property="og:image" content="${a(image)}">`,
    `<meta data-seo property="og:image:width" content="1080">`,
    `<meta data-seo property="og:image:height" content="1350">`,
    `<meta data-seo property="og:image:alt" content="${a(`${view.displayName} · ${view.visaLine}`)}">`,
    `<meta data-seo name="twitter:card" content="summary_large_image">`,
    `<meta data-seo name="twitter:title" content="${a(title)}">`,
    `<meta data-seo name="twitter:image" content="${a(image)}">`,
  ];
  return out.join('\n');
};
