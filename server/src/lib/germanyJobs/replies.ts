import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { classifyReply, matchByDomain, referencedIds, type ReplyClass } from './replyRules.js';

/**
 * Employer answers to the automatic applications (Reply-To = agency inbox). The workspace mail sync hands every new
 * INBOX mail of the agency mailboxes to `matchEmployerReply` (lib/deliverability/inbound.ts). A match is stored as
 * ExternalJobApplicationReply with a keyword suggestion (replyRules.ts) and the assigned staff member + admins are
 * notified. The status never changes by itself: staff apply the suggestion or keep the status
 * (POST /api/admin/external-applications/:id/replies/:replyId). Never throws.
 */

export interface InboundMail {
  mailMessageId: string;
  rfcMessageId: string | null;
  inReplyTo: string | null;
  refs: string | null;
  fromAddr: string | null;
  fromName: string | null;
  subject: string | null;
  text: string | null;
  date: Date;
}

/** How far back a domain-only match looks (answers often take weeks). */
const DOMAIN_WINDOW_DAYS = 180;

const CLASS_AZ: Record<ReplyClass, string> = {
  INTERVIEW: 'müsahibəyə dəvət',
  REJECTION: 'imtina',
  DOCUMENTS: 'əlavə sənəd istəyir',
  OTHER: 'cavab',
};

export const findApplicationForReply = async (mail: InboundMail): Promise<{ id: string; matchedBy: 'MESSAGE_ID' | 'DOMAIN' } | null> => {
  const ids = referencedIds(mail.inReplyTo, mail.refs);
  if (ids.length) {
    const byHeader = await prisma.externalJobApplication.findFirst({ where: { autoMessageId: { in: ids } }, select: { id: true } });
    if (byHeader) return { id: byHeader.id, matchedBy: 'MESSAGE_ID' };
  }
  const from = (mail.fromAddr ?? '').trim().toLowerCase();
  const domain = from.split('@')[1];
  if (!domain) return null;
  const root = domain.split('.').slice(-2).join('.');
  const since = new Date(mail.date.getTime() - DOMAIN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.externalJobApplication.findMany({
    where: {
      autoSentAt: { gte: since },
      employerEmail: { not: null },
      inquiry: { anonymizedAt: null },
      OR: [{ employerEmail: from }, { employerEmail: { endsWith: `@${root}` } }, { employerEmail: { endsWith: `.${root}` } }],
    },
    select: { id: true, employerEmail: true, listingTitle: true, inquiry: { select: { contactName: true } } },
    orderBy: { autoSentAt: 'desc' },
    take: 50,
  });
  const id = matchByDomain(mail, rows.map((r) => ({ id: r.id, employerEmail: r.employerEmail, listingTitle: r.listingTitle, contactName: r.inquiry.contactName })));
  return id ? { id, matchedBy: 'DOMAIN' } : null;
};

/** Returns the new reply id, or null (no match / already stored from another mailbox). */
export const matchEmployerReply = async (mail: InboundMail): Promise<string | null> => {
  if (isImpersonating()) return null;
  try {
    const match = await findApplicationForReply(mail);
    if (!match) return null;
    const { classification, suggestedStatus } = classifyReply(mail.subject, mail.text);
    let replyId: string;
    try {
      const row = await prisma.externalJobApplicationReply.create({
        data: {
          applicationId: match.id,
          rfcMessageId: (mail.rfcMessageId ?? `mail:${mail.mailMessageId}`).slice(0, 500),
          mailMessageId: mail.mailMessageId.slice(0, 40),
          fromAddr: mail.fromAddr?.slice(0, 255) ?? null,
          fromName: mail.fromName?.slice(0, 255) ?? null,
          subject: mail.subject?.slice(0, 1000) ?? null,
          excerpt: (mail.text ?? '').trim().slice(0, 4000) || null,
          receivedAt: mail.date,
          matchedBy: match.matchedBy,
          classification,
          suggestedStatus,
        },
      });
      replyId = row.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null; // same mail, other mailbox
      throw err;
    }
    await notifyReply(match.id, classification);
    return replyId;
  } catch (err) {
    console.error('[germany-jobs] employer reply not matched', err);
    return null;
  }
};

/** Assigned staff member of the lead + admins: in-app + push (no e-mail; the mail is in the inbox already). */
const notifyReply = async (applicationId: string, classification: ReplyClass) => {
  const app = await prisma.externalJobApplication.findUnique({
    where: { id: applicationId },
    select: { inquiryId: true, listingTitle: true, listingCompany: true, inquiry: { select: { contactName: true, assignedStaffId: true } } },
  });
  if (!app) return;
  const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true } });
  const ids = Array.from(new Set([...(app.inquiry.assignedStaffId ? [app.inquiry.assignedStaffId] : []), ...admins.map((a) => a.id)]));
  const what = [app.listingTitle, app.listingCompany].filter(Boolean).join(' · ');
  for (const userId of ids) {
    await notifyUser(userId, {
      type: 'EXTERNAL_JOB_REPLY',
      title: `İşəgötürən cavab verdi: ${CLASS_AZ[classification]}`,
      body: `${app.inquiry.contactName}${what ? ` — ${what}` : ''}. Təklif olunan statusu yoxlayın.`,
      link: `/admin/inquiries?open=${app.inquiryId}`,
      email: false,
    });
  }
};

export const replyView = (r: {
  id: string;
  fromAddr: string | null;
  fromName: string | null;
  subject: string | null;
  excerpt: string | null;
  receivedAt: Date;
  matchedBy: string;
  classification: string;
  suggestedStatus: string | null;
  resolution: string | null;
  resolvedAt: Date | null;
}) => ({
  id: r.id,
  from: r.fromName ? `${r.fromName} <${r.fromAddr ?? ''}>` : (r.fromAddr ?? ''),
  subject: r.subject,
  excerpt: r.excerpt,
  receivedAt: r.receivedAt,
  matchedBy: r.matchedBy,
  classification: r.classification,
  suggestedStatus: r.suggestedStatus,
  resolution: r.resolution,
  resolvedAt: r.resolvedAt,
});
