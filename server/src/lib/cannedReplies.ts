import type { Locale, MailTemplate } from '@prisma/client';
import { prisma } from '../db.js';
import { htmlToText } from './mail/sanitize.js';

/**
 * Canned replies for the staff message composers (case messages, quick drawer, inquiries, live chat). They are
 * MailTemplate rows (the mail composer's templates): personal ones (author only) and team ones (shared = true,
 * managed by ADMIN+). A reply has a plain-text body, a "/" shortcut and an optional client language; rows that share
 * a shortcut are the language variants of one reply, and the picker shows the variant in the client's language
 * (exact language → language-neutral → Azerbaijani → any). Variables in {{double braces}} are filled from the
 * conversation's context (client, case, appointment, inquiry, live chat, the writing staff member).
 */

export const LOCALES: Locale[] = ['az', 'de', 'en', 'ru'];
export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as string[]).includes(v);

/** Variables a reply may use. Unknown ones stay as typed; known ones without a value become empty. */
export const VARIABLES = ['firstName', 'lastName', 'fullName', 'caseNumber', 'caseStatus', 'profession', 'appointmentDate', 'appointmentTime', 'appointmentPlace', 'staffName', 'staffFirstName', 'today'] as const;
export type Variable = (typeof VARIABLES)[number];
export type Vars = Partial<Record<Variable, string>>;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** HTML for the mail composer from a plain-text reply (paragraph per blank line, <br> per line break). */
export const textToHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

/** Plain-text body of a template: the reply text, or the mail template's HTML as text. */
export const bodyOf = (t: Pick<MailTemplate, 'text' | 'html'>) => (t.text != null && t.text !== '' ? t.text : htmlToText(t.html).trim());

/** Normalises a shortcut: lower case, letters / digits / - / _ only ("Sənəd tələbi" → "sənəd-tələbi"). */
export const normalizeShortcut = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase('az')
    .replace(/^\/+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, 40);

/** Fills {{var}} (spaces allowed inside the braces); unknown names are left untouched. */
export const fillVars = (text: string, vars: Vars) =>
  text.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (all, name: string) => ((VARIABLES as readonly string[]).includes(name) ? (vars[name as Variable] ?? '') : all));

const STATUS_LABEL: Record<Locale, Record<string, string>> = {
  az: { DOCUMENTS_PENDING: 'sənədlər gözlənilir', DOCUMENTS_REVIEW: 'sənədlər yoxlanılır', CONTRACT_SENT: 'müqavilə göndərilib', CONTRACT_SIGNED: 'müqavilə imzalanıb', EMBASSY_DOCUMENTS: 'səfirlik sənədləri', EMBASSY_REVIEW: 'səfirlik paketi yoxlanılır', APPOINTMENT_SCHEDULED: 'səfirlik görüş tarixi bəllidir', DECISION_PENDING: 'qərar gözlənilir', APPROVED: 'təsdiqlənib', REJECTED: 'imtina', CANCELLED: 'ləğv olunub' },
  de: { DOCUMENTS_PENDING: 'Unterlagen ausstehend', DOCUMENTS_REVIEW: 'Unterlagen in Prüfung', CONTRACT_SENT: 'Vertrag versendet', CONTRACT_SIGNED: 'Vertrag unterschrieben', EMBASSY_DOCUMENTS: 'Botschaftsunterlagen', EMBASSY_REVIEW: 'Botschaftspaket in Prüfung', APPOINTMENT_SCHEDULED: 'Botschaftstermin von der Botschaft erhalten', DECISION_PENDING: 'Entscheidung ausstehend', APPROVED: 'genehmigt', REJECTED: 'abgelehnt', CANCELLED: 'storniert' },
  en: { DOCUMENTS_PENDING: 'documents pending', DOCUMENTS_REVIEW: 'documents in review', CONTRACT_SENT: 'contract sent', CONTRACT_SIGNED: 'contract signed', EMBASSY_DOCUMENTS: 'embassy documents', EMBASSY_REVIEW: 'embassy package in review', APPOINTMENT_SCHEDULED: 'embassy appointment given by the embassy', DECISION_PENDING: 'decision pending', APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'cancelled' },
  ru: { DOCUMENTS_PENDING: 'ожидаются документы', DOCUMENTS_REVIEW: 'документы на проверке', CONTRACT_SENT: 'договор отправлен', CONTRACT_SIGNED: 'договор подписан', EMBASSY_DOCUMENTS: 'документы для посольства', EMBASSY_REVIEW: 'пакет для посольства на проверке', APPOINTMENT_SCHEDULED: 'посольство назначило дату приёма', DECISION_PENDING: 'ожидается решение', APPROVED: 'одобрено', REJECTED: 'отказ', CANCELLED: 'отменено' },
};

const INTL: Record<Locale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };
const fmtDay = (d: Date, l: Locale) => new Intl.DateTimeFormat(INTL[l], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Baku' }).format(d);
const fmtTime = (d: Date, l: Locale) => new Intl.DateTimeFormat(INTL[l], { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baku' }).format(d);

export interface ReplyContext {
  caseId?: string;
  userId?: string;
  inquiryId?: string;
  liveChatId?: string;
}

const splitName = (full: string | null | undefined) => {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
};

/** Language and variables of a conversation. Unknown ids just give fewer variables (never throws for a missing row). */
export const contextVars = async (ctx: ReplyContext, staff: { firstName: string; lastName: string; locale: Locale }, now = new Date()) => {
  let lang: Locale | null = null;
  const vars: Vars = {};
  let client: { firstName: string; lastName: string; locale: Locale } | null = null;
  let kase: { number: string; status: string; profession: string; appointmentAt: Date | null; appointmentPlace: string | null } | null = null;

  if (ctx.caseId) {
    const c = await prisma.case.findUnique({
      where: { id: ctx.caseId },
      select: { number: true, status: true, profession: true, appointmentAt: true, appointmentPlace: true, client: { select: { firstName: true, lastName: true, locale: true } } },
    });
    if (c) {
      kase = c;
      client = c.client;
    }
  }
  if (!client && ctx.userId) {
    const u = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { firstName: true, lastName: true, locale: true } });
    if (u) {
      client = u;
      const c = await prisma.case.findFirst({
        where: { clientId: ctx.userId },
        orderBy: [{ updatedAt: 'desc' }],
        select: { number: true, status: true, profession: true, appointmentAt: true, appointmentPlace: true },
      });
      if (c) kase = c;
    }
  }
  if (client) {
    lang = client.locale;
    vars.firstName = client.firstName;
    vars.lastName = client.lastName;
  }
  if (!client && ctx.inquiryId) {
    const q = await prisma.inquiry.findUnique({ where: { id: ctx.inquiryId }, select: { contactName: true, locale: true } });
    if (q) {
      Object.assign(vars, splitName(q.contactName));
      lang = isLocale(q.locale) ? q.locale : null;
    }
  }
  if (!client && ctx.liveChatId) {
    const ch = await prisma.liveChat.findUnique({ where: { id: ctx.liveChatId }, select: { visitorName: true, locale: true, clientId: true } });
    if (ch) {
      const u = ch.clientId ? await prisma.user.findUnique({ where: { id: ch.clientId }, select: { firstName: true, lastName: true, locale: true } }) : null;
      if (u) {
        vars.firstName = u.firstName;
        vars.lastName = u.lastName;
      } else Object.assign(vars, splitName(ch.visitorName));
      lang = isLocale(ch.locale) ? ch.locale : (u?.locale ?? null);
    }
  }
  const l = lang ?? staff.locale;
  vars.fullName = `${vars.firstName ?? ''} ${vars.lastName ?? ''}`.trim();
  if (kase) {
    vars.caseNumber = kase.number;
    vars.caseStatus = STATUS_LABEL[l][kase.status] ?? kase.status;
    vars.profession = kase.profession;
    if (kase.appointmentAt) {
      vars.appointmentDate = fmtDay(kase.appointmentAt, l);
      vars.appointmentTime = fmtTime(kase.appointmentAt, l);
    }
    if (kase.appointmentPlace) vars.appointmentPlace = kase.appointmentPlace;
  }
  vars.staffName = `${staff.firstName} ${staff.lastName}`.trim();
  vars.staffFirstName = staff.firstName;
  vars.today = fmtDay(now, l);
  return { lang, vars };
};

/** Best variant per reply group (shortcut, or the row itself) for a language. */
export const pickVariants = <T extends { id: string; shortcut: string | null; lang: string | null; shared: boolean; userId: string }>(rows: T[], lang: Locale | null): T[] => {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const key = r.shortcut ? `${r.shared ? 'team' : r.userId}:${r.shortcut}` : `id:${r.id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const rank = (r: T) => (lang && r.lang === lang ? 0 : r.lang === null ? 1 : r.lang === 'az' ? 2 : 3);
  return [...groups.values()].map((g) => [...g].sort((a, b) => rank(a) - rank(b))[0]);
};
