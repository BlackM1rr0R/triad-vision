import type { Locale } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { legalSchema } from '../legalSettings.js';

/**
 * Campaign texts: per language a subject, a body in a small formatting syntax and an optional SMS
 * text. Body syntax (what the editor's toolbar inserts):
 *   **bold**   *italic*   [link text](https://…)   bare https://… links   "- " list lines   "## " headings
 *   blank line = new paragraph, single line break = <br>
 * Placeholders: {{firstName}} {{lastName}} {{caseNumber}} {{appointmentDate}}.
 */

export const LOCALES = ['az', 'de', 'en', 'ru'] as const satisfies readonly Locale[];
export const PLACEHOLDERS = ['firstName', 'lastName', 'caseNumber', 'appointmentDate'] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
export type Vars = Partial<Record<Placeholder, string>>;

export const localeContent = z.object({
  subject: z.string().trim().max(200).default(''),
  body: z.string().max(20_000).default(''),
  sms: z.string().max(480).default(''),
});
export const campaignContent = z.object({
  az: localeContent.default({}),
  de: localeContent.default({}),
  en: localeContent.default({}),
  ru: localeContent.default({}),
});
export type CampaignContent = z.infer<typeof campaignContent>;
export type CampaignChannelName = 'EMAIL' | 'SMS' | 'IN_APP';

/** Content may be malformed in the DB (old rows); always read it through this. */
export const readContent = (raw: unknown): CampaignContent => {
  const parsed = campaignContent.safeParse(raw ?? {});
  return parsed.success ? parsed.data : campaignContent.parse({});
};

const hasText = (c: CampaignContent, l: Locale, channel: CampaignChannelName) => {
  const x = c[l];
  if (channel === 'SMS') return !!(x.sms.trim() || x.body.trim());
  return !!(x.subject.trim() && x.body.trim());
};

/** Language per recipient: their own locale → az → en (→ de → ru), the first one that has text for the channel. */
export const pickLocale = (content: CampaignContent, recipient: Locale, channel: CampaignChannelName): Locale | null => {
  const order = Array.from(new Set<Locale>([recipient, 'az', 'en', 'de', 'ru']));
  return order.find((l) => hasText(content, l, channel)) ?? null;
};

// ─── Formatting ────────────────────────────────────────────────────────

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// [text](url) or a bare URL. Trailing punctuation is not part of a bare URL.
const LINK_RE = /\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]{1,1500})\)|(https?:\/\/[^\s<>()]{1,1500}[^\s<>().,;:!?'"])/g;

type Piece = { kind: 'text'; text: string } | { kind: 'link'; text: string; url: string };

const tokenize = (line: string): Piece[] => {
  const out: Piece[] = [];
  let last = 0;
  for (const m of line.matchAll(LINK_RE)) {
    if (m.index! > last) out.push({ kind: 'text', text: line.slice(last, m.index) });
    if (m[2]) out.push({ kind: 'link', text: m[1]!, url: m[2] });
    else out.push({ kind: 'link', text: m[3]!, url: m[3]! });
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push({ kind: 'text', text: line.slice(last) });
  return out;
};

/** Escaped text with **bold** and *italic* / _italic_. */
const inlineHtml = (s: string) =>
  escapeHtml(s)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1<em>$2</em>');

const stripInline = (s: string) => s.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2').replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1$2');

/** Every http(s) link of a body, in order of appearance. */
export const extractLinks = (body: string) => [...body.matchAll(LINK_RE)].map((m) => m[2] ?? m[3]!);

/**
 * Body → HTML. `href(url)` returns the address to put in the link (a tracked redirect) or null to
 * print the text without a link. Placeholders stay as {{…}} and are filled afterwards.
 */
export const bodyToHtml = (body: string, href: (url: string) => string | null = (u) => u) => {
  const lineHtml = (line: string) =>
    tokenize(line)
      .map((p) => {
        if (p.kind === 'text') return inlineHtml(p.text);
        const target = href(p.url);
        const label = inlineHtml(p.text);
        return target ? `<a href="${escapeHtml(target)}" style="color:#1565e8">${label}</a>` : label;
      })
      .join('');
  return body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return `<ul style="margin:0 0 14px;padding-left:20px;line-height:1.6">${lines.map((l) => `<li>${lineHtml(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
      }
      if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0]!)) {
        return `<h3 style="margin:18px 0 10px;font-size:17px">${lineHtml(lines[0]!.replace(/^#{1,3}\s+/, ''))}</h3>`;
      }
      return `<p style="margin:0 0 14px;line-height:1.6">${lines.map(lineHtml).join('<br>')}</p>`;
    })
    .join('');
};

/** Body → plain text (in-app notification, text/plain part, SMS fallback). Links become "text (url)". */
export const bodyToText = (body: string, href: (url: string) => string = (u) => u) =>
  body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      tokenize(line.replace(/^#{1,3}\s+/, '').replace(/^\s*[-*]\s+/, '• '))
        .map((p) => (p.kind === 'text' ? stripInline(p.text) : p.text === p.url ? href(p.url) : `${stripInline(p.text)} (${href(p.url)})`))
        .join(''),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const PH_RE = /\{\{\s*(firstName|lastName|caseNumber|appointmentDate)\s*\}\}/g;

/** Fills placeholders; `html` escapes the values. Unknown values become empty. */
export const fillPlaceholders = (s: string, vars: Vars, html = false) => s.replace(PH_RE, (_m, k: Placeholder) => (html ? escapeHtml(vars[k] ?? '') : (vars[k] ?? '')));

// ─── Link allow-list ───────────────────────────────────────────────────

/** Hosts tracked links may lead to: our own site, plus CAMPAIGN_LINK_HOSTS (comma separated). */
export const allowedHosts = () => {
  const own = new URL(config.clientUrl).hostname.toLowerCase();
  const extra = (process.env.CAMPAIGN_LINK_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([own, 'triad-vision.de', ...extra]));
};

export const isAllowedUrl = (raw: string) => {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (u.username || u.password) return false;
    const host = u.hostname.toLowerCase();
    return allowedHosts().some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

/** All links of every language (deduplicated, stable order) and those outside the allow-list. */
export const collectLinks = (content: CampaignContent) => {
  const links = Array.from(new Set(LOCALES.flatMap((l) => extractLinks(content[l].body))));
  return { links, rejected: links.filter((u) => !isAllowedUrl(u)) };
};

// ─── Footer / compliance texts ─────────────────────────────────────────

const FOOTER: Record<Locale, { marketing: string; service: string; unsubscribe: string; prefs: string; stop: string; test: string }> = {
  az: {
    marketing: 'Bu məktubu Triad Vision-dan xəbər və təkliflər almağa razılıq verdiyiniz üçün alırsınız.',
    service: 'Bu, Triad Vision hesabınızla bağlı xidmət məlumatıdır.',
    unsubscribe: 'Abunəlikdən çıxın',
    prefs: 'Bildiriş ayarları',
    stop: 'İmtina (STOP)',
    test: 'TEST',
  },
  de: {
    marketing: 'Sie erhalten diese E-Mail, weil Sie dem Erhalt von Neuigkeiten und Angeboten von Triad Vision zugestimmt haben.',
    service: 'Dies ist eine Serviceinformation zu Ihrem Konto bei Triad Vision.',
    unsubscribe: 'Abmelden',
    prefs: 'Benachrichtigungseinstellungen',
    stop: 'Abmelden (STOP)',
    test: 'TEST',
  },
  en: {
    marketing: 'You are receiving this email because you agreed to receive news and offers from Triad Vision.',
    service: 'This is service information about your Triad Vision account.',
    unsubscribe: 'Unsubscribe',
    prefs: 'Notification settings',
    stop: 'Opt out (STOP)',
    test: 'TEST',
  },
  ru: {
    marketing: 'Вы получили это письмо, потому что дали согласие на получение новостей и предложений от Triad Vision.',
    service: 'Это служебная информация о вашем аккаунте Triad Vision.',
    unsubscribe: 'Отписаться',
    prefs: 'Настройки уведомлений',
    stop: 'Отписаться (STOP)',
    test: 'ТЕСТ',
  },
};

/** Company line for the footer from Setting 'legal' (Impressum data); falls back to the brand line. */
export const legalFooterLine = async () => {
  const row = await prisma.setting.findUnique({ where: { key: 'legal' } }).catch(() => null);
  const parsed = legalSchema.safeParse(row?.value ?? {});
  const l = parsed.success ? parsed.data : legalSchema.parse({});
  const name = [l.companyName, l.legalForm].filter(Boolean).join(' ');
  const address = [l.street, [l.postalCode, l.city].filter(Boolean).join(' '), l.country].filter(Boolean).join(', ');
  const register = [l.registerCourt, l.registerNumber].filter(Boolean).join(' ');
  const parts = [name || 'Triad Vision', address, l.representative, register, l.vatId && `USt-IdNr. ${l.vatId}`, l.email, l.phone].filter(Boolean);
  return parts.length > 1 ? parts.join(' · ') : 'Triad Vision · triad-vision.de';
};

export const unsubscribePageUrl = (token: string) => `${config.clientUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
export const oneClickUrl = (token: string) => `${config.clientUrl}/api/unsubscribe/${encodeURIComponent(token)}`;
export const clickUrl = (token: string, linkIndex: number) => `${config.clientUrl}/api/c/${encodeURIComponent(token)}/${linkIndex}`;
export const pixelUrl = (token: string) => `${config.clientUrl}/api/o/${encodeURIComponent(token)}.gif`;

// ─── Messages ──────────────────────────────────────────────────────────

export interface BuildInput {
  kind: 'SERVICE' | 'MARKETING';
  content: CampaignContent;
  locale: Locale;
  vars: Vars;
  /** Recipient token: tracked links, pixel and unsubscribe. Null = preview / test (no tracking). */
  token: string | null;
  /** Frozen link list of the campaign (index = link id in /c/:token/:i). */
  links: string[];
  footerLine: string;
  test?: boolean;
}

const wrap = (title: string, inner: string, footer: string, pixel: string) => `<!doctype html><html><body style="margin:0;background:#eef3fb;font-family:Segoe UI,Arial,sans-serif;color:#0b1f44">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0b1f44;padding:22px 28px;color:#fff;font-size:20px;font-weight:700;letter-spacing:2px">TRIAD VISION
<div style="font-size:10px;letter-spacing:3px;opacity:.7;font-weight:400">PEOPLE · WORK · OPPORTUNITIES</div></td></tr>
<tr><td style="padding:28px">
<h2 style="margin:0 0 18px;font-size:20px">${escapeHtml(title)}</h2>${inner}
</td></tr>
<tr><td style="background:#f5f8fd;padding:16px 28px;font-size:12px;line-height:1.6;color:#5b6b88">${footer}</td></tr>
</table></td></tr></table>${pixel}</body></html>`;

/** Email for one recipient (or a preview / test when token is null): subject, HTML, text part and headers. */
export const buildEmail = (b: BuildInput) => {
  const c = b.content[b.locale];
  const f = FOOTER[b.locale];
  const tracked = (url: string) => {
    const i = b.links.indexOf(url);
    if (b.token && i >= 0) return clickUrl(b.token, i);
    return isAllowedUrl(url) ? url : null;
  };
  const subject = `${b.test ? `[${f.test}] ` : ''}${fillPlaceholders(c.subject, b.vars)}`;
  const inner = fillPlaceholders(bodyToHtml(c.body, tracked), b.vars, true);
  const unsubscribe = b.token ? unsubscribePageUrl(b.token) : unsubscribePageUrl('test');
  const prefs = `${config.clientUrl}/account/profile?tab=notifications`;
  const footer = [
    escapeHtml(b.kind === 'MARKETING' ? f.marketing : f.service),
    `<a href="${escapeHtml(unsubscribe)}" style="color:#1565e8">${escapeHtml(f.unsubscribe)}</a> · <a href="${escapeHtml(prefs)}" style="color:#1565e8">${escapeHtml(f.prefs)}</a>`,
    escapeHtml(b.footerLine),
  ].join('<br>');
  const pixel = b.token ? `<img src="${escapeHtml(pixelUrl(b.token))}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">` : '';
  const html = wrap(subject.replace(/^\[[^\]]+\] /, ''), inner, footer, pixel);
  const text = [
    fillPlaceholders(bodyToText(c.body, (u) => tracked(u) ?? u), b.vars),
    '',
    '—',
    b.kind === 'MARKETING' ? f.marketing : f.service,
    `${f.unsubscribe}: ${unsubscribe}`,
    b.footerLine,
  ].join('\n');
  // RFC 2369 + RFC 8058 one-click unsubscribe (Gmail / Yahoo bulk sender rules).
  const headers: Record<string, string> = b.token
    ? { 'List-Unsubscribe': `<${oneClickUrl(b.token)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : {};
  return { subject, html, text, headers };
};

/** In-app notification text (plain). */
export const buildInApp = (b: Pick<BuildInput, 'content' | 'locale' | 'vars'>) => {
  const c = b.content[b.locale];
  return { title: fillPlaceholders(c.subject, b.vars).slice(0, 190), body: fillPlaceholders(bodyToText(c.body), b.vars).slice(0, 5000) };
};

/** SMS text: the SMS field (or the body as plain text), plus the opt-out link for marketing. */
export const buildSms = (b: Pick<BuildInput, 'content' | 'locale' | 'vars' | 'kind' | 'token' | 'test'>) => {
  const c = b.content[b.locale];
  const raw = c.sms.trim() || bodyToText(c.body);
  let text = fillPlaceholders(raw, b.vars).slice(0, 480);
  if (b.kind === 'MARKETING') text += `\n${FOOTER[b.locale].stop}: ${unsubscribePageUrl(b.token ?? 'test')}`;
  return b.test ? `[${FOOTER[b.locale].test}] ${text}` : text;
};

const DATE_LOCALE: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

/** Placeholder values for a user: their latest open case (or latest case) and next embassy appointment. */
export const recipientVars = async (user: { id: string; firstName: string; lastName: string }, locale: Locale): Promise<Vars> => {
  const now = new Date();
  const [active, next] = await Promise.all([
    prisma.case.findFirst({ where: { clientId: user.id }, orderBy: [{ closedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }], select: { number: true } }),
    prisma.case.findFirst({ where: { clientId: user.id, appointmentAt: { gte: now } }, orderBy: { appointmentAt: 'asc' }, select: { appointmentAt: true } }),
  ]);
  const appointmentDate = next?.appointmentAt
    ? new Intl.DateTimeFormat(DATE_LOCALE[locale], { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Baku' }).format(next.appointmentAt)
    : '';
  return { firstName: user.firstName, lastName: user.lastName, caseNumber: active?.number ?? '', appointmentDate };
};

export const SAMPLE_VARS: Record<Locale, Vars> = {
  az: { firstName: 'Əli', lastName: 'Məmmədov', caseNumber: 'TV-2026-0042', appointmentDate: '20 noyabr 2026, 09:30' },
  de: { firstName: 'Ali', lastName: 'Mammadov', caseNumber: 'TV-2026-0042', appointmentDate: '20. November 2026, 09:30' },
  en: { firstName: 'Ali', lastName: 'Mammadov', caseNumber: 'TV-2026-0042', appointmentDate: '20 November 2026, 09:30' },
  ru: { firstName: 'Али', lastName: 'Мамедов', caseNumber: 'TV-2026-0042', appointmentDate: '20 ноября 2026, 09:30' },
};
