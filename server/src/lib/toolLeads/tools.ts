import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from '../../config.js';
import { TOOL_GROUPS } from '../seoCatalogue.js';

/**
 * Public tools of the site as analytics / lead keys ("tool slugs"): the tool's path without the leading slash
 * ("salary-calculator", "work-scenes/truck-cab"). Derived from the tools hub groups (seoCatalogue TOOL_GROUPS),
 * so a tool added there is known here without another list; EXTRA_TOOL_PATHS adds pages that are tools but are
 * not listed on the hub. Anything else is rejected by the beacon and the "e-mail me my result" form.
 */
export const EXTRA_TOOL_PATHS = ['/german-mock-exam/a1', '/german-mock-exam/b1', '/phrase-of-the-day'];

/** Tool paths that are no tools (plain listings / content sections of the hub). */
const NOT_TOOLS = new Set(['/events', '/status', '/guides', '/glossary', '/jobs', '/visas']);

export const TOOL_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

export const toolSlugs = (): string[] => {
  const paths = [...TOOL_GROUPS.flatMap((g) => g.paths), ...EXTRA_TOOL_PATHS].filter((p) => !NOT_TOOLS.has(p));
  return [...new Set(paths.map((p) => p.replace(/^\//, '')))].filter((s) => TOOL_SLUG_RE.test(s));
};

export const isToolSlug = (s: unknown): s is string => typeof s === 'string' && s.length <= 60 && TOOL_SLUG_RE.test(s) && toolSlugs().includes(s);

export const toolSlugSchema = z.string().trim().max(60).refine(isToolSlug, 'UNKNOWN_TOOL');

// ─── Result summary (what the e-mail lists) ─────────────────────────────

/**
 * The result lines the browser sends: label + value, short plain text. Links are refused (no URLs, no e-mail
 * addresses, no HTML) so the form can never be used to send arbitrary content to somebody else's inbox; the
 * e-mail only links back to our own tool page.
 */
const LINKISH = /(https?:|www\.|:\/\/|[a-z0-9-]+\.(?:com|net|org|ru|de|az|io|xyz|info|top|ly|me|co)\b|@|<|>)/i;

const cleanLine = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1).max(max))
    .refine((s) => !LINKISH.test(s), 'NO_LINKS');

export const summarySchema = z
  .array(z.object({ label: cleanLine(80), value: cleanLine(160) }))
  .min(1)
  .max(12);
export type ResultSummary = z.infer<typeof summarySchema>;

/** The tool page the e-mail links back to: a site path (optionally language-prefixed) with a short query. */
export const resultPathSchema = z
  .string()
  .trim()
  .max(600)
  .regex(/^\/[A-Za-z0-9\-/]*(\?[A-Za-z0-9\-_.~%&=,+]*)?$/, 'INVALID_PATH')
  .refine((p) => !p.startsWith('//'), 'INVALID_PATH');

/** The path part must be the tool itself (or a language version of it). */
export const pathMatchesTool = (path: string, slug: string) => {
  const bare = path.split('?')[0].replace(/^\/(de|en|ru|tr|uk)(?=\/)/, '');
  return bare === `/${slug}`;
};

/** Short plain-text summary for the lead (staff see it in the inquiry message). */
export const summaryText = (summary: ResultSummary) => summary.map((l) => `${l.label}: ${l.value}`).join('\n');

// ─── Signed links (confirm / unsubscribe) ───────────────────────────────

const sig = (id: string) => crypto.createHmac('sha256', config.jwtSecret).update(`tool-result-lead:${id}`).digest('base64url').slice(0, 32);

/** "<id>.<sig>": never stored, derived from the row id with the server secret. */
export const leadToken = (id: string) => `${id}.${sig(id)}`;

export const verifyLeadToken = (token: unknown): string | null => {
  if (typeof token !== 'string' || token.length > 120) return null;
  const [id, s, extra] = token.split('.');
  if (!id || !s || extra !== undefined || !/^[a-z0-9]{10,40}$/i.test(id)) return null;
  const want = Buffer.from(sig(id));
  const got = Buffer.from(s);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? id : null;
};

export const maskEmail = (email: string) => {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, local.length - 2)))}@${domain}`;
};

/** Follow-up "how can we help?" e-mail: this many days after the result (only after a confirmed opt-in). */
export const FOLLOW_UP_DAYS = 3;
/** Unconfirmed follow-up requests are dropped after this many days (double opt-in never completed). */
export const UNCONFIRMED_DAYS = 7;
/** The lead row (e-mail, state) is deleted this many days after it was created; the Inquiry stays for the team. */
export const LEAD_ROW_TTL_DAYS = 60;

const DAY = 24 * 60 * 60 * 1000;

/** When the follow-up is due for a lead confirmed at `confirmedAt` (never earlier than 3 days after the result). */
export const followUpDueAt = (createdAt: Date, confirmedAt: Date) => new Date(Math.max(createdAt.getTime() + FOLLOW_UP_DAYS * DAY, confirmedAt.getTime()));

/** Whether a confirmation link is still valid (double opt-in window). */
export const canConfirm = (createdAt: Date, now = new Date()) => now.getTime() - createdAt.getTime() <= UNCONFIRMED_DAYS * DAY;
