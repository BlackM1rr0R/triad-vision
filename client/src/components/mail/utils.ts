import i18n, { currentLocale } from '@/i18n';
import { errorCode } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/components/admin/labels';
import type { Address, MessageDetail, MessageRow } from './types';

const t = (key: string, opts?: Record<string, unknown>): string => String(i18n.t(key, opts));

export const errorText = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`mail.errors.${code}`) ? t(`mail.errors.${code}`) : t('mail.toast.failed');
};

export const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export const displayName = (a: Address | null | undefined) => (a ? a.name?.trim() || a.address.split('@')[0] || a.address : '');
export const formatAddress = (a: Address) => (a.name?.trim() ? `${a.name.trim()} <${a.address}>` : a.address);
export const formatList = (list: Address[]) => list.map(formatAddress).join(', ');

export const initialsOf = (a: Address | null | undefined) => {
  const name = displayName(a);
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0]!.slice(0, 2) : `${parts[0]![0]}${parts[parts.length - 1]![0]}`).toUpperCase();
};

const TONES = ['bg-brand-100 text-brand-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-800', 'bg-violet-100 text-violet-700', 'bg-sky-100 text-sky-800', 'bg-rose-100 text-rose-700', 'bg-teal-100 text-teal-800'];
export const avatarTone = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length]!;
};

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** List-row time: today → HH:MM, this year → day + month, else full date. */
export const fmtListDate = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtTime(iso);
  const locale = currentLocale();
  if (d.getFullYear() === now.getFullYear()) {
    if (locale === 'az') return `${d.getDate()} ${['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'][d.getMonth()]}`;
    return new Intl.DateTimeFormat({ de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale], { day: 'numeric', month: 'short' }).format(d);
  }
  return fmtDate(iso);
};

export const fmtFull = (iso: string) => fmtDateTime(iso);

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export const subjectOf = (m: Pick<MessageRow, 'subject'>) => m.subject?.trim() || t('mail.list.noSubject');

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const textToHtml = (text: string) => `<div style="white-space:pre-wrap">${escapeHtml(text)}</div>`;

const bodyHtml = (m: MessageDetail) => m.html ?? (m.text ? textToHtml(m.text) : '');

/** The quoted original under a reply. */
export const quoteForReply = (m: MessageDetail) =>
  `<br><br><div class="tv-quote" style="border-left:2px solid #c7d2e3;margin:8px 0 0;padding-left:12px;color:#5b6b88">` +
  `<p style="margin:0 0 8px">${escapeHtml(t('mail.compose.quoteHeader', { date: fmtFull(m.date), from: m.from ? formatAddress(m.from) : '' }))}</p>${bodyHtml(m)}</div>`;

export const quoteForForward = (m: MessageDetail) => {
  const line = (label: string, value: string) => (value ? `<div><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</div>` : '');
  return (
    `<br><br><div class="tv-forward"><p style="margin:0 0 8px;color:#5b6b88">---------- ${escapeHtml(t('mail.compose.forwardHeader'))} ----------</p>` +
    line(t('mail.compose.fwd.from'), m.from ? formatAddress(m.from) : '') +
    line(t('mail.compose.fwd.date'), fmtFull(m.date)) +
    line(t('mail.compose.fwd.subject'), m.subject ?? '') +
    line(t('mail.compose.fwd.to'), formatList(m.to)) +
    `<br>${bodyHtml(m)}</div>`
  );
};

export const replySubject = (s: string | null) => (/^\s*(re|aw|sv|отв|cavab)\s*(\[\d+\])?\s*:/i.test(s ?? '') ? (s ?? '').trim() : `Re: ${(s ?? '').trim()}`.trim());
export const forwardSubject = (s: string | null) => (/^\s*(fwd?|fw|wg|tr)\s*:/i.test(s ?? '') ? (s ?? '').trim() : `Fwd: ${(s ?? '').trim()}`.trim());

/** Reply-all recipients: the sender (or Reply-To) plus everybody else except my own address. */
export const replyRecipients = (m: MessageDetail, myEmail: string, all: boolean) => {
  const me = myEmail.toLowerCase();
  const sender: Address | null = m.replyTo ? { name: m.from?.name ?? '', address: m.replyTo } : m.from;
  const to: Address[] = [];
  const cc: Address[] = [];
  const seen = new Set<string>([me]);
  const push = (list: Address[], a: Address | null) => {
    if (!a) return;
    const k = a.address.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    list.push(a);
  };
  push(to, sender);
  if (all) {
    for (const a of m.to) push(to, a);
    for (const a of m.cc) push(cc, a);
  }
  if (!to.length && m.from) to.push(m.from);
  return { to, cc };
};

export const signatureBlock = (html: string | null | undefined) => (html?.trim() ? `<br><br><div class="tv-signature">${html}</div>` : '');

/** Plain-text version of an html body (for the `text` part of outgoing messages). */
export const htmlToText = (html: string) => {
  const el = document.createElement('div');
  el.innerHTML = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n');
  return (el.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
};

export const isEmptyHtml = (html: string) => !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

/** Local-time ISO without seconds for <input type="datetime-local">. */
export const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
