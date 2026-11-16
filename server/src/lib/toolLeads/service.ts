import type { Request } from 'express';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { brandSync } from '../brand/index.js';
import { escapeHtml, localizedPath } from '../seo.js';
import { STATIC_PAGES, textIn, type SeoLocale } from '../seoCatalogue.js';
import { renderEmail, sendMail, sendMailDetailed } from '../mailer.js';
import { notifyStaff } from '../notifications.js';
import { recordConsent } from '../privacy/consents.js';
import { onInquiryCreated } from '../assignment/inquiry.js';
import { attachLeadContext, type utmSchema } from '../marketing/leadScoring.js';
import { recordToolEvent } from '../toolAnalytics/service.js';
import { TOOL_MAIL } from './texts.js';
import {
  LEAD_ROW_TTL_DAYS,
  UNCONFIRMED_DAYS,
  canConfirm,
  followUpDueAt,
  leadToken,
  maskEmail,
  summaryText,
  type ResultSummary,
} from './tools.js';
import type { z } from 'zod';

/**
 * "E-mail me my result" on the public tools (model ToolResultLead + Inquiry source "tool:<slug>").
 *
 *  - The visitor enters an e-mail (+ optional name / phone) under a result. They get the result e-mail at once:
 *    that is what they asked for, nothing else is sent without consent.
 *  - A separate, unticked checkbox allows ONE follow-up e-mail ("how can we help?") three days later. Because
 *    that is promotional, it needs a double opt-in: the result e-mail carries a confirmation button; only a
 *    confirmed lead gets the follow-up (jobs/toolLeads.ts). The confirmation is logged in the consent log
 *    (MARKETING_EMAIL, source TOOL_RESULT) as the proof.
 *  - Every e-mail after the result carries an unsubscribe link (and List-Unsubscribe one-click headers);
 *    unsubscribing stops every pending follow-up of that address and is logged as a withdrawal.
 *  - Staff see the lead in the inquiries list (source "tool:<slug>", the result summary in the message). Several
 *    results of the same address within 7 days are added to the same open lead instead of creating new ones.
 *  - Lead rows (the e-mail state) are deleted after LEAD_ROW_TTL_DAYS; the Inquiry follows the inquiry retention.
 */

const DAY = 24 * 60 * 60 * 1000;
const MERGE_DAYS = 7;

/** Staff languages are az/de/en/ru: Turkish leads go to the Azerbaijani team, Ukrainian to the Russian one. */
const staffLocale = (lng: SeoLocale) => ({ tr: 'az', uk: 'ru' } as Record<string, string>)[lng] ?? lng;

export const toolName = (slug: string, lng: SeoLocale) => {
  const page = STATIC_PAGES[`/${slug}`];
  return page ? textIn(page.name, lng) : slug;
};

const absolute = (path: string) => `${new URL(config.clientUrl).origin}${path}`;

/** The tool page in the visitor's language, with the query the browser sent (values of the result). */
const toolUrl = (slug: string, lng: SeoLocale, path: string | null) => {
  const query = path?.includes('?') ? path.slice(path.indexOf('?')) : '';
  const sep = query ? '&' : '?';
  return absolute(`${localizedPath(`/${slug}`, lng)}${query}${sep}utm_source=tool-result&utm_medium=email`);
};

export const manageUrl = (token: string, lng: SeoLocale, action: 'confirm' | 'unsubscribe') =>
  absolute(`${localizedPath('/result-email', lng)}?token=${encodeURIComponent(token)}&action=${action}`);

export const oneClickUrl = (token: string) => `${absolute('/api/tools/result-email/unsubscribe')}/${encodeURIComponent(token)}`;

const summaryTable = (summary: ResultSummary) =>
  `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:4px 0 18px;font-size:14px">${summary
    .map(
      (l) =>
        `<tr><td style="padding:8px 10px;border-bottom:1px solid #e3e9f4;color:#5b6b88">${escapeHtml(l.label)}</td><td style="padding:8px 10px;border-bottom:1px solid #e3e9f4;text-align:right;font-weight:600">${escapeHtml(l.value)}</td></tr>`,
    )
    .join('')}</table>`;

const footer = (text: string) => `<p style="margin:18px 0 0;font-size:12px;color:#5b6b88">${escapeHtml(text)}</p>`;

export const renderResultMail = (o: { slug: string; lng: SeoLocale; name: string | null; summary: ResultSummary; path: string | null; token: string; askConfirm: boolean }) => {
  const m = TOOL_MAIL[o.lng];
  const tool = toolName(o.slug, o.lng);
  const confirm = o.askConfirm
    ? `<div style="margin:22px 0 0;padding:16px 18px;border-radius:10px;background:#f0f6ff"><p style="margin:0 0 6px;font-weight:700">${escapeHtml(m.confirmTitle)}</p><p style="margin:0 0 12px;line-height:1.5">${escapeHtml(m.confirmText)}</p><a href="${escapeHtml(manageUrl(o.token, o.lng, 'confirm'))}" style="background:#0f9d58;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(m.confirmCta)}</a></div>`
    : '';
  const subject = m.resultSubject(tool);
  const html = renderEmail(subject, `${m.hello(o.name)}\n\n${m.resultIntro(tool)}`, { label: m.openTool, url: toolUrl(o.slug, o.lng, o.path) }, {
    html: `${summaryTable(o.summary)}<p style="margin:0;font-size:12px;color:#5b6b88">${escapeHtml(m.estimateNote)}</p>${confirm}${footer(m.footerResult)}`,
  });
  return { subject, html };
};

export const renderFollowUpMail = (o: { slug: string; lng: SeoLocale; name: string | null; token: string }) => {
  const m = TOOL_MAIL[o.lng];
  const tool = toolName(o.slug, o.lng);
  const utm = 'utm_source=tool-follow-up&utm_medium=email';
  const register = absolute(`${localizedPath('/register', o.lng)}?${utm}`);
  const phone = brandSync().phone;
  const html = renderEmail(m.followSubject, `${m.hello(o.name)}\n\n${m.followBody(tool)}`, { label: m.followBooking, url: absolute(`${localizedPath('/booking', o.lng)}?${utm}`) }, {
    html: `<p style="margin:8px 0 0"><a href="${escapeHtml(register)}" style="color:#1565e8;font-weight:600">${escapeHtml(m.followRegister)}</a>${phone ? ` · ${escapeHtml(m.phone)}: ${escapeHtml(phone)}` : ''}</p>${footer(m.followFooter)}<p style="margin:8px 0 0;font-size:12px"><a href="${escapeHtml(manageUrl(o.token, o.lng, 'unsubscribe'))}" style="color:#5b6b88">${escapeHtml(m.unsubscribe)}</a></p>`,
  });
  return { subject: m.followSubject, html };
};

export interface CreateToolLeadInput {
  slug: string;
  email: string;
  name?: string;
  phone?: string;
  lng: SeoLocale;
  summary: ResultSummary;
  path?: string;
  followUp: boolean;
  visitorId?: string;
  utm?: z.infer<typeof utmSchema>;
}

/** Creates (or extends) the lead, sends the result e-mail and notifies the team. */
export const createToolLead = async (input: CreateToolLeadInput, req?: Pick<Request, 'ip' | 'get'>) => {
  const now = new Date();
  const tool = toolName(input.slug, 'az');
  const block = [`Alət: ${tool} (/${input.slug})`, summaryText(input.summary), `Dil: ${input.lng}`, `Sonrakı məktuba razılıq: ${input.followUp ? 'bəli (təsdiq gözlənilir)' : 'xeyr'}`].join('\n');

  // One open lead per address for a week: later results are appended (staff see the whole story in one place).
  const open = await prisma.inquiry.findFirst({
    where: { email: input.email, source: { startsWith: 'tool:' }, status: 'NEW', anonymizedAt: null, createdAt: { gte: new Date(now.getTime() - MERGE_DAYS * DAY) } },
    orderBy: { createdAt: 'desc' },
  });
  let inquiryId: string;
  if (open && open.message.length < 50_000) {
    await prisma.inquiry.update({
      where: { id: open.id },
      data: { message: `${open.message}\n\n— ${now.toISOString().slice(0, 16).replace('T', ' ')} —\n${block}`, ...(input.phone && !open.phone ? { phone: input.phone } : {}) },
    });
    inquiryId = open.id;
  } else {
    const inquiry = await prisma.inquiry.create({
      data: {
        kind: 'contact',
        source: `tool:${input.slug}`.slice(0, 80),
        contactName: input.name || input.email.split('@')[0].slice(0, 120),
        email: input.email,
        phone: input.phone ?? null,
        sector: tool.slice(0, 120),
        message: block,
        locale: staffLocale(input.lng),
      },
    });
    inquiryId = inquiry.id;
    void onInquiryCreated(inquiry.id); // automation rules + optional auto-assignment (never throws)
  }

  // An address that unsubscribed before is never asked again.
  const unsubscribed = input.followUp ? await prisma.toolResultLead.count({ where: { email: input.email, unsubscribedAt: { not: null } } }) : 0;
  const followUp = input.followUp && unsubscribed === 0;
  const lead = await prisma.toolResultLead.create({
    data: { tool: input.slug, email: input.email, name: input.name ?? null, locale: input.lng, inquiryId, followUpConsent: followUp },
  });
  const token = leadToken(lead.id);
  const mail = renderResultMail({ slug: input.slug, lng: input.lng, name: input.name ?? null, summary: input.summary, path: input.path ?? null, token, askConfirm: followUp });
  await sendMail(input.email, mail.subject, mail.html);
  await recordToolEvent(input.slug, 'lead');
  if (!open) {
    await notifyStaff(
      `Alət nəticəsi e-poçtla: ${input.name || input.email} · ${tool}`,
      [`Email: ${input.email}`, input.phone ? `Telefon: ${input.phone}` : null, '', block].filter((l): l is string => l !== null).join('\n'),
      { link: '/admin/inquiries' },
    );
  }
  await attachLeadContext(inquiryId, { visitorId: input.visitorId, utm: input.utm });
  void req; // consent is logged on confirmation (double opt-in), not here
  return { lead, inquiryId, merged: !!open };
};

export const findLead = (id: string) => prisma.toolResultLead.findUnique({ where: { id } });

type LeadRow = NonNullable<Awaited<ReturnType<typeof findLead>>>;

export const leadView = (l: LeadRow) => ({
  tool: l.tool,
  email: maskEmail(l.email),
  locale: l.locale,
  followUpConsent: l.followUpConsent,
  confirmed: !!l.confirmedAt,
  followUpSent: !!l.followUpSentAt,
  unsubscribed: !!l.unsubscribedAt,
});

/** Double opt-in: 'ok' | 'expired' (link older than 7 days) | 'not-requested' (the box was not ticked) | 'unsubscribed'. */
export const confirmLead = async (l: LeadRow, req?: Pick<Request, 'ip' | 'get'>, now = new Date()) => {
  if (!l.followUpConsent) return { status: 'not-requested' as const, lead: l };
  if (l.unsubscribedAt) return { status: 'unsubscribed' as const, lead: l };
  if (l.confirmedAt) return { status: 'ok' as const, lead: l };
  if (!canConfirm(l.createdAt, now)) return { status: 'expired' as const, lead: l };
  const lead = await prisma.toolResultLead.update({ where: { id: l.id }, data: { confirmedAt: now, followUpDueAt: followUpDueAt(l.createdAt, now) } });
  await recordConsent({ email: l.email, type: 'MARKETING_EMAIL', granted: true, source: 'TOOL_RESULT', req });
  if (l.inquiryId) {
    const q = await prisma.inquiry.findUnique({ where: { id: l.inquiryId }, select: { message: true } });
    if (q) await prisma.inquiry.update({ where: { id: l.inquiryId }, data: { message: `${q.message}\nSonrakı məktub: e-poçtla təsdiqləndi (${now.toISOString().slice(0, 10)})` } }).catch(() => null);
  }
  return { status: 'ok' as const, lead };
};

/** Stops every pending follow-up of the address (all its lead rows) and logs the withdrawal once. */
export const unsubscribeLead = async (l: LeadRow, req?: Pick<Request, 'ip' | 'get'>, now = new Date()) => {
  const r = await prisma.toolResultLead.updateMany({ where: { email: l.email, unsubscribedAt: null }, data: { unsubscribedAt: now } });
  if (r.count > 0) await recordConsent({ email: l.email, type: 'MARKETING_EMAIL', granted: false, source: 'UNSUBSCRIBE', req });
  return (await findLead(l.id)) ?? l;
};

/** Due follow-ups (confirmed, not unsubscribed, not sent yet), at most `limit` per run. */
export const runToolFollowUps = async (now = new Date(), limit = 100) => {
  const due = await prisma.toolResultLead.findMany({
    where: { confirmedAt: { not: null }, followUpDueAt: { lte: now }, followUpSentAt: null, unsubscribedAt: null, followUpConsent: true },
    orderBy: { followUpDueAt: 'asc' },
    take: limit,
  });
  let sent = 0;
  const done = new Set<string>();
  for (const l of due) {
    // One follow-up per address, even when several tools asked for one.
    const already = done.has(l.email) || (await prisma.toolResultLead.count({ where: { email: l.email, followUpSentAt: { gte: new Date(now.getTime() - 30 * DAY) } } })) > 0;
    // Claim the row first, so a restart or a parallel run never sends twice.
    const claimed = await prisma.toolResultLead.updateMany({ where: { id: l.id, followUpSentAt: null }, data: { followUpSentAt: now } });
    if (!claimed.count || already) continue;
    done.add(l.email);
    const token = leadToken(l.id);
    const lng = (l.locale in TOOL_MAIL ? l.locale : 'az') as SeoLocale;
    const mail = renderFollowUpMail({ slug: l.tool, lng, name: l.name, token });
    await sendMailDetailed({
      to: l.email,
      subject: mail.subject,
      html: mail.html,
      headers: { 'List-Unsubscribe': `<${oneClickUrl(token)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    });
    sent++;
  }
  return { sent };
};

/** DSGVO housekeeping: never-confirmed opt-ins lose the flag after 7 days; rows are deleted after 60 days. */
export const purgeToolLeads = async (now = new Date()) => {
  const dropped = await prisma.toolResultLead.updateMany({
    where: { followUpConsent: true, confirmedAt: null, createdAt: { lt: new Date(now.getTime() - UNCONFIRMED_DAYS * DAY) } },
    data: { followUpConsent: false },
  });
  // Unsubscribed rows are kept a little longer than the rest: they block new follow-ups for that address.
  const deleted = await prisma.toolResultLead.deleteMany({
    where: {
      OR: [
        { unsubscribedAt: null, createdAt: { lt: new Date(now.getTime() - LEAD_ROW_TTL_DAYS * DAY) } },
        { unsubscribedAt: { lt: new Date(now.getTime() - 365 * DAY) } },
      ],
    },
  });
  return { dropped: dropped.count, deleted: deleted.count };
};

/** Art. 15: the "e-mail me my result" rows of an address (no tokens). */
export const exportToolLeads = async (email: string) =>
  (await prisma.toolResultLead.findMany({ where: { email: email.toLowerCase() }, orderBy: { createdAt: 'asc' } })).map((l) => ({
    tool: l.tool,
    locale: l.locale,
    createdAt: l.createdAt,
    followUpConsent: l.followUpConsent,
    confirmedAt: l.confirmedAt,
    followUpSentAt: l.followUpSentAt,
    unsubscribedAt: l.unsubscribedAt,
  }));

/** Art. 17: deletes them (the Inquiry is anonymised by the inquiries erasure). */
export const eraseToolLeads = async (email: string) => (await prisma.toolResultLead.deleteMany({ where: { email: email.toLowerCase() } })).count;
