import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { isImpersonating } from './privacy/impersonationContext.js';
import { brandify, brandSync } from './brand/index.js';
import { htmlToText } from './mail/sanitize.js';

const transporter = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    })
  : null;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Header values must be a single line; anything else would let user input inject mail headers. */
const headerSafe = (s: string) => s.replace(/[\r\n]+/g, ' ').slice(0, 300);

/**
 * Plain-text alternative of an HTML mail. HTML-only mail is a spam signal (Gmail, SpamAssassin MIME_HTML_ONLY),
 * so every mail carries both parts. Links keep their address ("Confirm: https://…"), otherwise the text part
 * of a verification or reset mail would be useless.
 */
export const plainTextOf = (html: string) =>
  htmlToText(
    html.replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const url = href.replace(/&amp;/g, '&');
      const text = label.replace(/<[^>]+>/g, '').trim();
      if (!/^https?:/i.test(url)) return text;
      return !text || text === url ? url : `${text}: ${url}`;
    }),
  );

/**
 * Header and footer of the e-mail wrapper from the instance brand (lib/brand). With the default brand this is
 * exactly the former fixed markup: "TRIAD VISION", "PEOPLE · WORK · OPPORTUNITIES", navy, and the footer
 * "Triad Vision · triad-vision.de · +994 50 748 70 48".
 */
const emailBrand = () => {
  const b = brandSync();
  const footer = b.footerText || [b.name, b.domain, b.phone].filter(Boolean).join(' · ');
  return {
    name: escapeHtml(b.name.toLocaleUpperCase('en')),
    tagline: escapeHtml(b.tagline.toLocaleUpperCase('en')),
    // The owner's mails keep their navy header even if the site theme colour changes.
    color: !b.isDefault && /^#[0-9a-f]{6}$/i.test(b.primaryColor) ? b.primaryColor : '#0b1f44',
    footer: escapeHtml(footer),
  };
};

/**
 * Branded HTML wrapper. `body` is plain text; paragraphs are split on blank lines. `opts.html` is an optional
 * block of already-escaped HTML (tables of a report) placed after the paragraphs — callers must escape their data.
 */
export const renderEmail = (title: string, body: string, cta?: { label: string; url: string }, opts: { html?: string } = {}) => {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button = cta
    ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(cta.url)}" style="background:#1565e8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : '';
  const header = emailBrand();
  return `<!doctype html><html lang="${escapeHtml(brandSync().defaultLanguage)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#eef3fb;font-family:Segoe UI,Arial,sans-serif;color:#0b1f44">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="background:${header.color};padding:22px 28px;color:#fff;font-size:20px;font-weight:700;letter-spacing:2px">${header.name}
<div style="font-size:10px;letter-spacing:3px;opacity:.7;font-weight:400">${header.tagline}</div></td></tr>
<tr><td style="padding:28px">
<h2 style="margin:0 0 18px;font-size:20px">${escapeHtml(title)}</h2>${paragraphs}${opts.html ?? ''}${button}
</td></tr>
<tr><td style="background:#f5f8fd;padding:16px 28px;font-size:12px;color:#5b6b88">${header.footer}</td></tr>
</table></td></tr></table></body></html>`;
};

const log = async (data: { to: string; subject: string; status: string; error?: string }) => {
  try {
    await prisma.emailLog.create({ data });
  } catch (err) {
    console.error('[mail] could not write EmailLog', err);
  }
};

/** Optional file attached to an email (invoice PDF, calendar .ics). */
export interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

/**
 * Sends an email. Never throws and never rejects: callers use `void sendMail(...)`, and an
 * unhandled rejection would take the whole process down. `attachments` is optional; existing
 * callers are unaffected.
 */
export const sendMail = async (to: string, subject: string, html: string, attachments?: MailAttachment[]) => {
  if (!to) return;
  if (isImpersonating()) return; // "view as client" never sends mail
  const safeSubject = headerSafe(brandify(subject));
  html = brandify(html);
  try {
    if (!transporter) {
      if (!config.isTest) console.log(`\n[mail:console] to=${to}\n  subject=${safeSubject}\n`);
      await log({ to, subject: safeSubject, status: 'CONSOLE' });
      return;
    }
    try {
      await transporter.sendMail({
        from: brandSync().emailFrom,
        to: headerSafe(to),
        subject: safeSubject,
        html,
        text: plainTextOf(html),
        ...(attachments?.length
          ? { attachments: attachments.map((a) => ({ filename: headerSafe(a.filename), content: a.content, contentType: a.contentType })) }
          : {}),
      });
      await log({ to, subject: safeSubject, status: 'SENT' });
    } catch (err) {
      // Email failures must never break the workflow; the in-app notification is the source of truth.
      console.error('[mail] failed', err);
      await log({ to, subject: safeSubject, status: 'FAILED', error: String(err).slice(0, 2000) });
    }
  } catch (err) {
    console.error('[mail] unexpected', err);
  }
};

/** Outcome of sendMailDetailed: CONSOLE = no SMTP configured (dev/test), recorded in EmailLog only. */
export interface MailResult {
  status: 'SENT' | 'CONSOLE' | 'FAILED';
  error?: string;
  /** SMTP reply code of a rejection (5xx = permanent, e.g. unknown mailbox). */
  responseCode?: number;
}

/**
 * Like sendMail, but reports the outcome and accepts extra headers (List-Unsubscribe …) and a plain
 * text part. Used by bulk senders (campaigns) that throttle, retry and mark rejects themselves.
 * Never throws. Header names and values are made single-line.
 */
export const sendMailDetailed = async (msg: { to: string; subject: string; html: string; text?: string; headers?: Record<string, string> }): Promise<MailResult> => {
  const safeSubject = headerSafe(brandify(msg.subject));
  try {
    if (!msg.to) return { status: 'FAILED', error: 'NO_ADDRESS' };
    if (!transporter) {
      if (!config.isTest) console.log(`\n[mail:console] to=${msg.to}\n  subject=${safeSubject}\n`);
      await log({ to: msg.to, subject: safeSubject, status: 'CONSOLE' });
      return { status: 'CONSOLE' };
    }
    const headers = Object.fromEntries(
      Object.entries(msg.headers ?? {}).map(([k, v]) => [k.replace(/[^A-Za-z0-9-]/g, ''), headerSafe(v).slice(0, 900)]),
    );
    try {
      await transporter.sendMail({ from: brandSync().emailFrom, to: headerSafe(msg.to), subject: safeSubject, html: brandify(msg.html), text: msg.text === undefined ? plainTextOf(brandify(msg.html)) : brandify(msg.text), headers });
      await log({ to: msg.to, subject: safeSubject, status: 'SENT' });
      return { status: 'SENT' };
    } catch (err) {
      const e = err as { responseCode?: number; message?: string };
      const error = String(e.message ?? err).slice(0, 2000);
      await log({ to: msg.to, subject: safeSubject, status: 'FAILED', error });
      return { status: 'FAILED', error, responseCode: typeof e.responseCode === 'number' ? e.responseCode : undefined };
    }
  } catch (err) {
    console.error('[mail] unexpected', err);
    return { status: 'FAILED', error: String(err).slice(0, 2000) };
  }
};
