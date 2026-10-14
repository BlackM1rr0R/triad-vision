import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { prisma } from '../db.js';

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

/** Branded HTML wrapper. `body` is plain text; paragraphs are split on blank lines. */
export const renderEmail = (title: string, body: string, cta?: { label: string; url: string }) => {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button = cta
    ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(cta.url)}" style="background:#1565e8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#eef3fb;font-family:Segoe UI,Arial,sans-serif;color:#0b1f44">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0b1f44;padding:22px 28px;color:#fff;font-size:20px;font-weight:700;letter-spacing:2px">TRIAD VISION
<div style="font-size:10px;letter-spacing:3px;opacity:.7;font-weight:400">PEOPLE · WORK · OPPORTUNITIES</div></td></tr>
<tr><td style="padding:28px">
<h2 style="margin:0 0 18px;font-size:20px">${escapeHtml(title)}</h2>${paragraphs}${button}
</td></tr>
<tr><td style="background:#f5f8fd;padding:16px 28px;font-size:12px;color:#5b6b88">Triad Vision · triad-vision.de · +994 50 748 70 48</td></tr>
</table></td></tr></table></body></html>`;
};

const log = async (data: { to: string; subject: string; status: string; error?: string }) => {
  try {
    await prisma.emailLog.create({ data });
  } catch (err) {
    console.error('[mail] could not write EmailLog', err);
  }
};

/**
 * Sends an email. Never throws and never rejects: callers use `void sendMail(...)`, and an
 * unhandled rejection would take the whole process down.
 */
export const sendMail = async (to: string, subject: string, html: string) => {
  if (!to) return;
  const safeSubject = headerSafe(subject);
  try {
    if (!transporter) {
      if (!config.isTest) console.log(`\n[mail:console] to=${to}\n  subject=${safeSubject}\n`);
      await log({ to, subject: safeSubject, status: 'CONSOLE' });
      return;
    }
    try {
      await transporter.sendMail({ from: config.smtp.from, to: headerSafe(to), subject: safeSubject, html });
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
