import type { Request } from 'express';
import type { Locale, MailTriage, MailTriageCategory, Prisma } from '@prisma/client';
import { prisma } from '../../../db.js';
import { audit } from '../../audit.js';
import { notifyUser } from '../../notifications.js';
import { activityRow, createNumbered } from '../../tasks/core.js';
import { notifyAssigned } from '../../tasks/notify.js';
import type { TriageSettings } from './mailTriage.js';

/**
 * What a triage result can lead to: server-side client matching, the "AI · …" labels, leads
 * (Inquiry), assignments (task or notification) and the auto-actions of the routing rules.
 * Every function here is called by code (a staff click or a super-admin auto rule), never by the model.
 */

export interface ExistingClientMatch {
  userId: string;
  name: string;
  role: string;
  caseId: string | null;
  caseNumber: string | null;
  staffId: string | null;
  companyName: string | null;
  matchedBy: 'email' | 'phone';
}

export interface TriageContact {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  country?: string;
}

export interface TriageSummary {
  lang?: string;
  text?: string;
  en?: string;
}

export interface TriageDraft {
  language: string;
  subject: string;
  body: string;
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** Finds the sender among our clients / employers / agents by the sender's own address or phone. */
export const matchExistingClient = async (emails: (string | null | undefined)[], phone: string | null | undefined): Promise<ExistingClientMatch | null> => {
  const list = [...new Set(emails.filter((e): e is string => !!e).map((e) => e.trim().toLowerCase()))].slice(0, 4);
  const select = {
    id: true,
    firstName: true,
    lastName: true,
    role: true,
    phone: true,
    company: { select: { name: true } },
    cases: { orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, number: true, assignedStaffId: true, closedAt: true } },
  } satisfies Prisma.UserSelect;
  const roles = { in: ['CLIENT', 'COMPANY', 'AGENT'] as ('CLIENT' | 'COMPANY' | 'AGENT')[] };
  let user = list.length ? await prisma.user.findFirst({ where: { email: { in: list }, role: roles }, select }) : null;
  let matchedBy: 'email' | 'phone' = 'email';
  const d = digits(phone);
  if (!user && d.length >= 9) {
    const tail = d.slice(-9);
    // Phones are stored as typed ("+994 50-123 45 67"): compare digits only.
    const hits = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM User
      WHERE role IN ('CLIENT', 'COMPANY', 'AGENT') AND phone IS NOT NULL
        AND REGEXP_REPLACE(phone, '[^0-9]', '') LIKE ${`%${tail}`}
      ORDER BY createdAt DESC LIMIT 1`;
    user = hits[0] ? await prisma.user.findUnique({ where: { id: hits[0].id }, select }) : null;
    matchedBy = 'phone';
  }
  if (!user) return null;
  const c = user.cases.find((x) => !x.closedAt) ?? user.cases[0] ?? null;
  return {
    userId: user.id,
    name: `${user.firstName} ${user.lastName}`.trim(),
    role: user.role,
    caseId: c?.id ?? null,
    caseNumber: c?.number ?? null,
    staffId: c?.assignedStaffId ?? null,
    companyName: user.company?.name ?? null,
    matchedBy,
  };
};

// ─── Texts (notifications, labels, tasks) ────────────────────────────

const CATEGORY_LABEL: Record<Locale, Record<MailTriageCategory, string>> = {
  az: { CANDIDATE: 'Namizəd', EMPLOYER: 'İşəgötürən', PARTNER: 'Partnyor', EXISTING_CLIENT: 'Mövcud müştəri', SUPPLIER: 'Təchizatçı', SPAM: 'Spam', OTHER: 'Digər' },
  de: { CANDIDATE: 'Bewerber', EMPLOYER: 'Arbeitgeber', PARTNER: 'Partner', EXISTING_CLIENT: 'Bestandskunde', SUPPLIER: 'Lieferant', SPAM: 'Spam', OTHER: 'Sonstiges' },
  en: { CANDIDATE: 'Candidate', EMPLOYER: 'Employer', PARTNER: 'Partner', EXISTING_CLIENT: 'Existing client', SUPPLIER: 'Supplier', SPAM: 'Spam', OTHER: 'Other' },
  ru: { CANDIDATE: 'Кандидат', EMPLOYER: 'Работодатель', PARTNER: 'Партнёр', EXISTING_CLIENT: 'Текущий клиент', SUPPLIER: 'Поставщик', SPAM: 'Спам', OTHER: 'Другое' },
};

const TEXTS: Record<Locale, { assignedTitle: (cat: string, urgent: boolean) => string; suggestedTitle: (cat: string, urgent: boolean) => string; from: string; subject: string; open: string }> = {
  az: {
    assignedTitle: (c, u) => `${u ? 'Təcili · ' : ''}Sizə e-poçt yönləndirildi (${c})`,
    suggestedTitle: (c, u) => `${u ? 'Təcili · ' : ''}Yeni e-poçt sizin üçün (${c})`,
    from: 'Göndərən',
    subject: 'Mövzu',
    open: 'Aç',
  },
  de: {
    assignedTitle: (c, u) => `${u ? 'Dringend · ' : ''}E-Mail an Sie weitergeleitet (${c})`,
    suggestedTitle: (c, u) => `${u ? 'Dringend · ' : ''}Neue E-Mail für Sie (${c})`,
    from: 'Von',
    subject: 'Betreff',
    open: 'Öffnen',
  },
  en: {
    assignedTitle: (c, u) => `${u ? 'Urgent · ' : ''}E-mail assigned to you (${c})`,
    suggestedTitle: (c, u) => `${u ? 'Urgent · ' : ''}New e-mail for you (${c})`,
    from: 'From',
    subject: 'Subject',
    open: 'Open',
  },
  ru: {
    assignedTitle: (c, u) => `${u ? 'Срочно · ' : ''}Вам передано письмо (${c})`,
    suggestedTitle: (c, u) => `${u ? 'Срочно · ' : ''}Новое письмо для вас (${c})`,
    from: 'От',
    subject: 'Тема',
    open: 'Открыть',
  },
};

const asLocale = (l: string | null | undefined): Locale => (l === 'de' || l === 'en' || l === 'ru' ? l : 'az');

/** Summary for a reader: their language when the mail is in it, else English, else the original. */
export const summaryFor = (s: TriageSummary | null | undefined, locale: string) => (s?.lang === locale ? s.text : s?.en || s?.text) ?? '';

const LABEL_COLORS: Record<MailTriageCategory | 'URGENT', string> = {
  URGENT: '#dc2626',
  CANDIDATE: '#2563eb',
  EMPLOYER: '#7c3aed',
  PARTNER: '#0d9488',
  EXISTING_CLIENT: '#059669',
  SUPPLIER: '#64748b',
  SPAM: '#9ca3af',
  OTHER: '#94a3b8',
};

const labelName = (key: MailTriageCategory | 'URGENT', locale: Locale) => `AI · ${key === 'URGENT' ? { az: 'Təcili', de: 'Dringend', en: 'Urgent', ru: 'Срочно' }[locale] : CATEGORY_LABEL[locale][key]}`;

/** "AI · Bewerber", "AI · Dringend" labels in the mailbox owner's mail client (labels are per user). */
export const applyAutoLabels = async (t: Pick<MailTriage, 'messageId' | 'category' | 'urgency'>, ownerId: string) => {
  if (!t.category || t.category === 'OTHER') return;
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { locale: true } });
  const locale = asLocale(owner?.locale);
  const keys: (MailTriageCategory | 'URGENT')[] = [t.category, ...(t.urgency === 'URGENT' ? (['URGENT'] as const) : [])];
  for (const key of keys) {
    const name = labelName(key, locale);
    const label = await prisma.mailLabel.upsert({ where: { userId_name: { userId: ownerId, name } }, update: {}, create: { userId: ownerId, name, color: LABEL_COLORS[key], sortOrder: 900 } });
    await prisma.mailMessageLabel.upsert({ where: { messageId_labelId: { messageId: t.messageId, labelId: label.id } }, update: {}, create: { messageId: t.messageId, labelId: label.id } });
  }
};

// ─── Action log ──────────────────────────────────────────────────────

const pushAction = (t: Pick<MailTriage, 'actions'>, entry: Record<string, unknown>): Prisma.InputJsonValue => {
  const list = Array.isArray(t.actions) ? (t.actions as Prisma.JsonArray) : [];
  return [...list.slice(-30), { ...entry, at: new Date().toISOString() }] as Prisma.InputJsonValue;
};

export const recordAction = (t: MailTriage, entry: Record<string, unknown>, data: Prisma.MailTriageUpdateInput = {}) =>
  prisma.mailTriage.update({ where: { id: t.id }, data: { ...data, actions: pushAction(t, entry) } });

type Actor = { id: string } | null;
type AuditReq = Pick<Request, 'user' | 'ip'>;
const systemReq = { ip: undefined } as AuditReq;

// ─── Lead (Inquiry) ──────────────────────────────────────────────────

export interface MailFacts {
  subject: string | null;
  mailbox: string;
  date: Date;
  fromName: string | null;
  fromAddr: string | null;
  text: string | null;
}

export const mailFactsOf = async (messageId: string): Promise<MailFacts | null> => {
  const m = await prisma.mailMessage.findUnique({ where: { id: messageId }, select: { subject: true, date: true, fromName: true, fromAddr: true, text: true, snippet: true, account: { select: { email: true } } } });
  return m ? { subject: m.subject, mailbox: m.account.email, date: m.date, fromName: m.fromName, fromAddr: m.fromAddr, text: m.text ?? m.snippet } : null;
};

/**
 * Creates the Inquiry for a triaged e-mail (or links an open one of the same sender from the last
 * two weeks). Idempotent: a triage with a lead returns it. Copies of the same e-mail in other
 * mailboxes get the same lead.
 */
export const createLeadFromTriage = async (t: MailTriage, facts: MailFacts, actor: Actor, req: AuditReq = systemReq) => {
  if (t.leadInquiryId) {
    const existing = await prisma.inquiry.findUnique({ where: { id: t.leadInquiryId } });
    if (existing) return { inquiry: existing, triage: t, created: false };
  }
  const contact = (t.contact ?? {}) as TriageContact;
  const summary = (t.summary ?? {}) as TriageSummary;
  const email = (contact.email || facts.fromAddr || '').toLowerCase().slice(0, 200);
  const recent = email
    ? await prisma.inquiry.findFirst({ where: { email, status: { in: ['NEW', 'IN_PROGRESS'] }, createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) } }, orderBy: { createdAt: 'desc' } })
    : null;
  let inquiry = recent;
  let created = false;
  if (!inquiry) {
    const lines = [
      `[AI · ${t.category ?? 'OTHER'}${t.urgency === 'URGENT' ? ' · URGENT' : ''}] ${t.intent ?? ''}`.trim(),
      summary.en || summary.text || '',
      summary.en && summary.text && summary.en !== summary.text ? summary.text : '',
      '',
      `E-mail: ${facts.subject ?? '—'}`,
      `${facts.mailbox} · ${facts.date.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      contact.country ? `Country: ${contact.country}` : '',
      '',
      (facts.text ?? '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 3000),
    ];
    inquiry = await prisma.inquiry.create({
      data: {
        kind: t.category === 'EMPLOYER' || t.category === 'PARTNER' || t.category === 'SUPPLIER' ? 'company' : 'contact',
        companyName: contact.company?.slice(0, 160) || null,
        contactName: (contact.name || facts.fromName || email.split('@')[0] || '—').slice(0, 120),
        email: email || '—',
        phone: contact.phone?.slice(0, 40) || null,
        message: lines.filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n').trim().slice(0, 5000),
        locale: t.language === 'de' || t.language === 'en' || t.language === 'ru' || t.language === 'az' ? t.language : 'en',
      },
    });
    created = true;
  }
  const triage = await recordAction(t, { type: 'lead', by: actor?.id ?? 'auto', inquiryId: inquiry.id, created }, { leadInquiryId: inquiry.id, status: t.status === 'DISMISSED' ? 'DISMISSED' : 'ACTIONED' });
  if (t.rfcMessageId) await prisma.mailTriage.updateMany({ where: { rfcMessageId: t.rfcMessageId, id: { not: t.id }, leadInquiryId: null }, data: { leadInquiryId: inquiry.id } });
  await audit(req, 'AI_MAIL_LEAD_CREATED', inquiry.id, { triageId: t.id, messageId: t.messageId, category: t.category, auto: !actor, linkedExisting: !created });
  return { inquiry, triage, created };
};

// ─── Assignment (task or notification) ───────────────────────────────

/** Link for a staff member: their own copy of the e-mail when they have the mailbox, else the lead / mail page. */
const linkFor = async (userId: string, t: MailTriage) => {
  if (t.rfcMessageId) {
    const own = await prisma.mailMessage.findFirst({ where: { messageId: t.rfcMessageId, account: { userId } }, select: { id: true, accountId: true } });
    if (own) return `/workspace/mail/${own.accountId}/v-inbox/${own.id}`;
  }
  const own = await prisma.mailMessage.findFirst({ where: { id: t.messageId, account: { userId } }, select: { id: true, accountId: true } });
  if (own) return `/workspace/mail/${own.accountId}/v-inbox/${own.id}`;
  return t.leadInquiryId ? '/admin/inquiries' : '/workspace/mail';
};

const notificationBody = (t: MailTriage, facts: MailFacts, locale: Locale) => {
  const tx = TEXTS[locale];
  const contact = (t.contact ?? {}) as TriageContact;
  return [summaryFor(t.summary as TriageSummary, locale), `${tx.from}: ${[contact.name || facts.fromName, contact.email || facts.fromAddr].filter(Boolean).join(' · ')}`, `${tx.subject}: ${facts.subject ?? '—'}`].filter(Boolean).join('\n');
};

export const notifyAboutTriage = async (userId: string, t: MailTriage, facts: MailFacts, kind: 'assigned' | 'suggested') => {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
  const locale = asLocale(u?.locale);
  const cat = CATEGORY_LABEL[locale][t.category ?? 'OTHER'];
  const urgent = t.urgency === 'URGENT';
  await notifyUser(userId, {
    type: kind === 'assigned' ? 'AI_MAIL_ASSIGNED' : 'AI_MAIL_SUGGESTED',
    title: (kind === 'assigned' ? TEXTS[locale].assignedTitle : TEXTS[locale].suggestedTitle)(cat, urgent),
    body: notificationBody(t, facts, locale),
    link: await linkFor(userId, t),
    email: urgent || kind === 'assigned',
    ctaLabel: TEXTS[locale].open,
  });
};

export const assignTriage = async (t: MailTriage, facts: MailFacts, assignee: { id: string; locale: string }, mode: 'task' | 'notify', actor: { id: string; firstName: string; lastName: string }, req: AuditReq) => {
  let taskNumber: number | null = null;
  if (mode === 'task') {
    const locale = asLocale(assignee.locale);
    const contact = (t.contact ?? {}) as TriageContact;
    const existing = (t.existingClient ?? null) as ExistingClientMatch | null;
    const description = [
      summaryFor(t.summary as TriageSummary, locale),
      t.intent ? `Intent: ${t.intent}` : '',
      '',
      `${TEXTS[locale].from}: ${[contact.name || facts.fromName, contact.email || facts.fromAddr, contact.phone, contact.company].filter(Boolean).join(' · ')}`,
      `${TEXTS[locale].subject}: ${facts.subject ?? '—'}`,
      `${facts.mailbox} · ${facts.date.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    ]
      .filter((l, i) => l !== '' || i === 2)
      .join('\n');
    const task = await createNumbered(async (tx, number) => {
      const top = await tx.task.aggregate({ _min: { sortOrder: true }, where: { status: 'TODO' } });
      const row = await tx.task.create({
        data: {
          number,
          title: `${CATEGORY_LABEL[locale][t.category ?? 'OTHER']}: ${facts.subject ?? contact.name ?? 'E-mail'}`.slice(0, 200),
          description: description.slice(0, 5000),
          priority: t.urgency === 'URGENT' ? 'URGENT' : t.urgency === 'LOW' ? 'LOW' : 'NORMAL',
          dueAt: t.urgency === 'URGENT' ? new Date(Date.now() + 86_400_000) : null,
          sortOrder: (top._min.sortOrder ?? 0) - 1024,
          caseId: existing?.caseId ?? null,
          createdById: actor.id,
          assignees: { create: [{ userId: assignee.id }] },
        },
      });
      await tx.taskComment.create({ data: activityRow(row.id, actor.id, { type: 'created' }) });
      return row;
    });
    taskNumber = task.number;
    await notifyAssigned(task, [assignee.id], actor);
  } else {
    await notifyAboutTriage(assignee.id, t, facts, 'assigned');
  }
  const triage = await recordAction(t, { type: mode === 'task' ? 'task' : 'notify', by: actor.id, userId: assignee.id, ...(taskNumber ? { taskNumber } : {}) }, { assignedToId: assignee.id, status: 'ACTIONED' });
  await audit(req, 'AI_MAIL_ASSIGNED', t.messageId, { triageId: t.id, assigneeId: assignee.id, mode, taskNumber });
  return { triage, taskNumber };
};

// ─── Auto-actions (routing rules) ────────────────────────────────────

export const runAutoActions = async (t: MailTriage, s: TriageSettings, ctx: MailFacts & { ownerId: string }) => {
  let row = t;
  if (s.autoLabel) await applyAutoLabels(row, ctx.ownerId).catch((err) => console.error('[mail-triage] labels failed', (err as Error)?.message));
  if (s.autoLead && (row.category === 'CANDIDATE' || row.category === 'EMPLOYER') && !row.existingClient && !row.leadInquiryId) {
    row = (await createLeadFromTriage(row, ctx, null)).triage;
  }
  if (s.notifyAssignee && row.suggestedAssigneeId && row.category !== 'SPAM') {
    await notifyAboutTriage(row.suggestedAssigneeId, row, ctx, 'suggested');
    row = await recordAction(row, { type: 'notified', by: 'auto', userId: row.suggestedAssigneeId });
  }
  return row;
};
