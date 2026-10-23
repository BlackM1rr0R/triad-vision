import type { ArrivalStatus, Locale, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';
import { arrivalNotice, formatArrival, housingLabel, type ArrivalNoticeKind, type ArrivalNoticeParams } from './texts.js';
import { isImpersonating } from '../privacy/impersonationContext.js';

/**
 * Arrival planning: one plan per APPROVED case (created lazily the first time the client opens the
 * page). The client fills flight / pickup / first-accommodation wishes while DRAFT or SUBMITTED;
 * staff confirm, arrange pickup and housing and finally mark the arrival COMPLETED.
 */

export const CLIENT_EDITABLE: ArrivalStatus[] = ['DRAFT', 'SUBMITTED'];
export const OPEN_STATUSES: ArrivalStatus[] = ['SUBMITTED', 'CONFIRMED'];
export const STAFF_ROLES = ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;

/** Staff status changes: target → allowed current statuses. */
export const STAFF_TRANSITIONS: Record<'CONFIRMED' | 'COMPLETED' | 'CANCELLED', ArrivalStatus[]> = {
  CONFIRMED: ['DRAFT', 'SUBMITTED'],
  COMPLETED: ['SUBMITTED', 'CONFIRMED'],
  CANCELLED: ['DRAFT', 'SUBMITTED', 'CONFIRMED'],
};

const person = { select: { id: true, firstName: true, lastName: true } } as const;

export const planInclude = {
  case: { select: { id: true, number: true, profession: true, status: true, assignedStaffId: true, assignedStaff: person } },
  client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, locale: true } },
  handledBy: person,
} satisfies Prisma.ArrivalPlanInclude;

export type PlanWithRefs = Prisma.ArrivalPlanGetPayload<{ include: typeof planInclude }>;

export const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '—');

/** Lazily creates a DRAFT plan for every APPROVED case of the client (idempotent). */
export const ensurePlans = async (clientId: string) => {
  const cases = await prisma.case.findMany({ where: { clientId, status: 'APPROVED' }, select: { id: true } });
  // "View as client" is read-only: existing plans are shown, missing drafts are not created.
  if (cases.length && !isImpersonating()) {
    await prisma.arrivalPlan.createMany({ data: cases.map((c) => ({ caseId: c.id, clientId })), skipDuplicates: true });
  }
  return cases.map((c) => c.id);
};

/** What the client sees (no internal staff note). */
export const clientView = (p: PlanWithRefs) => ({
  id: p.id,
  caseId: p.caseId,
  case: { id: p.case.id, number: p.case.number, profession: p.case.profession },
  status: p.status,
  flightDate: p.flightDate,
  flightNumber: p.flightNumber,
  departureAirport: p.departureAirport,
  arrivalAirport: p.arrivalAirport,
  arrivalTime: p.arrivalTime,
  travellers: p.travellers,
  luggageNote: p.luggageNote,
  pickupRequested: p.pickupRequested,
  pickupConfirmed: p.pickupConfirmed,
  pickupDetails: p.pickupConfirmed ? p.pickupDetails : null,
  housingStatus: p.housingStatus,
  housingCity: p.housingCity,
  housingBudget: p.housingBudget,
  housingFrom: p.housingFrom,
  housingNote: p.housingNote,
  housingDetails: p.housingStatus === 'OFFERED' || p.housingStatus === 'ARRANGED' ? p.housingDetails : null,
  clientNote: p.clientNote,
  handledBy: p.handledBy ?? p.case.assignedStaff ?? null,
  submittedAt: p.submittedAt,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  editable: CLIENT_EDITABLE.includes(p.status),
});

export const staffView = (p: PlanWithRefs, now = new Date()) => ({
  ...clientView(p),
  pickupDetails: p.pickupDetails,
  housingDetails: p.housingDetails,
  staffNote: p.staffNote,
  handledById: p.handledById,
  handledBy: p.handledBy,
  client: { id: p.client.id, firstName: p.client.firstName, lastName: p.client.lastName, email: p.client.email, phone: p.client.phone, locale: p.client.locale },
  case: { id: p.case.id, number: p.case.number, profession: p.case.profession, status: p.case.status, assignedStaff: p.case.assignedStaff },
  upcoming: !!p.arrivalTime && p.arrivalTime > now && p.arrivalTime.getTime() - now.getTime() <= 14 * 24 * 60 * 60 * 1000,
});

export const loadPlan = (caseId: string) => prisma.arrivalPlan.findUnique({ where: { caseId }, include: planInclude });

// ─── Notifications ─────────────────────────────────────────────────────

const airportLine = (p: PlanWithRefs) => [p.departureAirport, p.arrivalAirport].filter(Boolean).join(' → ') || null;

export const noticeParams = (p: PlanWithRefs, locale: Locale, extra: Partial<ArrivalNoticeParams> = {}, staff = false): ArrivalNoticeParams => ({
  number: p.case.number,
  client: fullName(p.client),
  flight: p.flightNumber,
  when: p.arrivalTime ? formatArrival(p.arrivalTime, locale) : null,
  airport: airportLine(p),
  pickup: p.pickupConfirmed && p.pickupDetails ? p.pickupDetails : staff && p.pickupRequested ? '✓' : null,
  housing:
    p.housingStatus === 'NONE'
      ? null
      : `${housingLabel(p.housingStatus, locale)}${(staff || p.housingStatus === 'OFFERED' || p.housingStatus === 'ARRANGED') && p.housingDetails ? ` — ${p.housingDetails}` : staff && p.housingCity ? ` — ${p.housingCity}` : ''}`,
  ...extra,
});

const clientLink = '/account/arrival';
const staffLink = (p: { caseId: string }) => `/admin/arrivals/${p.caseId}`;

export const notifyPlanClient = async (p: PlanWithRefs, kind: Extract<ArrivalNoticeKind, 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'UPDATED' | 'REMINDER_48H' | 'REMINDER_6H'>, note?: string | null) => {
  const locale = p.client.locale;
  const { title, body } = arrivalNotice(kind, locale, noticeParams(p, locale, { note }));
  await notifyUser(p.clientId, {
    type: `ARRIVAL_${kind}`,
    title,
    body,
    caseId: p.caseId,
    link: kind === 'COMPLETED' ? '/account/onboarding' : clientLink,
  });
};

/** Responsible staff for a plan: the handler, else the case's assigned staff member (only active staff). */
export const responsibleStaff = async (p: Pick<PlanWithRefs, 'handledById' | 'case'>) => {
  const id = p.handledById ?? p.case.assignedStaffId;
  if (!id) return null;
  return prisma.user.findFirst({ where: { id, isActive: true, role: { in: [...STAFF_ROLES] } }, select: { id: true, locale: true } });
};

export const adminRecipients = () => prisma.user.findMany({ where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, locale: true } });

/**
 * Staff notification. `to: 'responsible'` → handler / assigned staff, falling back to ADMIN+ when
 * nobody is responsible; `to: 'admins'` → every ADMIN+; or an explicit list of user ids.
 */
export const notifyPlanStaff = async (
  p: PlanWithRefs,
  kind: Extract<ArrivalNoticeKind, 'SUBMITTED' | 'CLIENT_UPDATED' | 'CLIENT_CANCELLED' | 'ASSIGNED' | 'STAFF_REMINDER_48H' | 'STAFF_REMINDER_6H' | 'STALE'>,
  to: 'responsible' | 'admins' | string[],
  opts: { exclude?: string } = {},
) => {
  let users: { id: string; locale: Locale }[];
  if (Array.isArray(to)) {
    users = await prisma.user.findMany({ where: { id: { in: to }, isActive: true, role: { in: [...STAFF_ROLES] } }, select: { id: true, locale: true } });
  } else if (to === 'responsible') {
    const r = await responsibleStaff(p);
    users = r ? [r] : await adminRecipients();
  } else {
    users = await adminRecipients();
  }
  users = users.filter((u) => u.id !== opts.exclude);
  await Promise.all(
    users.map((u) => {
      const { title, body } = arrivalNotice(kind, u.locale, noticeParams(p, u.locale, kind === 'SUBMITTED' ? { note: p.clientNote } : {}, true));
      return notifyUser(u.id, { type: `ARRIVAL_${kind}`, title, body, caseId: p.caseId, link: staffLink(p) }).catch((e) => console.error('[arrival] staff notification failed', e));
    }),
  );
};
