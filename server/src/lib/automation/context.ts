import type { Locale, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import type { TriggerType } from './schema.js';
import type { EntityType } from './events.js';

/**
 * Everything a rule may look at for one trigger occurrence: the case (with client, owner, category), the
 * document / application / booking / inquiry that triggered it, and who a client message would go to.
 */

const caseInclude = {
  client: true,
  assignedStaff: { select: { id: true, firstName: true, lastName: true, locale: true, email: true, isActive: true } },
  visaCategory: { select: { id: true, title: true, visaLabel: true } },
  contract: { select: { signedAt: true, signerName: true } },
} satisfies Prisma.CaseInclude;

export type CaseRow = Prisma.CaseGetPayload<{ include: typeof caseInclude }>;

export interface Recipient {
  userId: string | null;
  email: string | null;
  phone: string | null;
  locale: Locale;
  firstName: string;
  lastName: string;
}

export interface AutoContext {
  triggerType: TriggerType;
  entityType: EntityType;
  entityId: string;
  case: CaseRow | null;
  recipient: Recipient | null;
  document: { id: string; originalName: string; status: string; stage: string; reviewNote: string | null; requirementKey: string | null; requirementTitle: Record<string, string> | null; uploadedById: string } | null;
  application: { id: string; status: string; vacancyTitle: string | null; userId: string } | null;
  booking: { id: string; status: string; name: string; email: string; phone: string | null; locale: string; startsAt: Date; userId: string | null } | null;
  inquiry: { id: string; status: string; kind: string; contactName: string; companyName: string | null; email: string; phone: string | null; locale: string; message: string } | null;
  /** Trigger details: event payload (from/to status, appointment time …) or the time-trigger snapshot. */
  payload: Record<string, unknown>;
  occurredAt: Date;
}

const asLocale = (l: string | null | undefined): Locale => (l === 'de' || l === 'en' || l === 'ru' ? l : 'az');

export const loadCase = (caseId: string) => prisma.case.findUnique({ where: { id: caseId }, include: caseInclude });

/** The client's current case (open, main application first), used for application / booking triggers. */
const activeCaseOf = async (userId: string) => {
  const c = await prisma.case.findFirst({
    where: { clientId: userId, status: { notIn: FINAL_STATUSES } },
    orderBy: [{ parentCaseId: 'asc' }, { createdAt: 'desc' }],
    select: { id: true },
  });
  return c ? loadCase(c.id) : null;
};

const recipientFromUser = (u: { id: string; email: string; phone: string | null; locale: Locale; firstName: string; lastName: string }): Recipient => ({
  userId: u.id,
  email: u.email,
  phone: u.phone,
  locale: u.locale,
  firstName: u.firstName,
  lastName: u.lastName,
});

/** Loads the context; null when the triggering entity no longer exists. */
export const buildContext = async (input: {
  triggerType: TriggerType;
  entityType: EntityType;
  entityId: string;
  caseId?: string | null;
  payload?: Record<string, unknown> | null;
  occurredAt?: Date;
}): Promise<AutoContext | null> => {
  const base: AutoContext = {
    triggerType: input.triggerType,
    entityType: input.entityType,
    entityId: input.entityId,
    case: null,
    recipient: null,
    document: null,
    application: null,
    booking: null,
    inquiry: null,
    payload: input.payload ?? {},
    occurredAt: input.occurredAt ?? new Date(),
  };
  if (input.entityType === 'case' || input.entityType === 'document') {
    const caseId = input.caseId ?? (input.entityType === 'case' ? input.entityId : null);
    if (input.entityType === 'document') {
      const d = await prisma.document.findUnique({ where: { id: input.entityId }, include: { requirement: { select: { key: true, title: true } } } });
      if (!d) return null;
      base.document = {
        id: d.id,
        originalName: d.originalName,
        status: d.status,
        stage: d.stage,
        reviewNote: d.reviewNote,
        requirementKey: d.requirement?.key ?? null,
        requirementTitle: (d.requirement?.title as Record<string, string> | null) ?? null,
        uploadedById: d.uploadedById,
      };
      base.case = await loadCase(d.caseId);
    } else if (caseId) base.case = await loadCase(caseId);
    if (!base.case) return null;
  } else if (input.entityType === 'application') {
    const a = await prisma.vacancyApplication.findUnique({ where: { id: input.entityId }, include: { vacancy: { select: { title: true } }, user: true } });
    if (!a) return null;
    const title = a.vacancy.title as Record<string, string> | string | null;
    base.application = { id: a.id, status: a.status, userId: a.userId, vacancyTitle: typeof title === 'string' ? title : title?.[a.user.locale] ?? title?.de ?? null };
    base.recipient = recipientFromUser(a.user);
    base.case = await activeCaseOf(a.userId);
  } else if (input.entityType === 'booking') {
    const b = await prisma.booking.findUnique({ where: { id: input.entityId }, include: { slot: { select: { startsAt: true } }, user: true } });
    if (!b) return null;
    base.booking = { id: b.id, status: b.status, name: b.name, email: b.email, phone: b.phone, locale: b.locale, startsAt: b.slot.startsAt, userId: b.userId };
    base.recipient = b.user
      ? recipientFromUser(b.user)
      : { userId: null, email: b.email, phone: b.phone, locale: asLocale(b.locale), firstName: b.name.split(' ')[0] ?? b.name, lastName: b.name.split(' ').slice(1).join(' ') };
    if (b.userId) base.case = await activeCaseOf(b.userId);
  } else if (input.entityType === 'inquiry') {
    const q = await prisma.inquiry.findUnique({ where: { id: input.entityId } });
    if (!q) return null;
    base.inquiry = { id: q.id, status: q.status, kind: q.kind, contactName: q.contactName, companyName: q.companyName, email: q.email, phone: q.phone, locale: q.locale, message: q.message };
    base.recipient = { userId: null, email: q.email || null, phone: q.phone, locale: asLocale(q.locale), firstName: q.contactName.split(' ')[0] ?? q.contactName, lastName: q.contactName.split(' ').slice(1).join(' ') };
  }
  if (base.case && !base.recipient) base.recipient = recipientFromUser(base.case.client);
  return base;
};
