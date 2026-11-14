import { prisma } from '../../db.js';
import { approvedCaseFor, onboardingForCase } from '../journey/onboarding.js';
import { ensurePlans } from '../arrival/core.js';
import { firstDayOf, workerChecklist } from '../employerArrival.js';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Portal "Gəlişə hazırlıq" (arrival preparation): one list from booking the flight to the first weeks in Germany.
 *   before departure — flight, housing, first day: derived from the arrival plan (lib/arrival), the housing
 *                      search (CaseHousing) and the employer's arrival checklist; they tick themselves when the
 *                      data is there and link to the page where the client does it.
 *   after arrival    — Anmeldung, health insurance, bank account, tax ID, SIM card … : the post-arrival onboarding
 *                      items (lib/journey/onboarding), ticked by the client through PUT /api/journey/onboarding/:id.
 *                      Due dates count from the arrival day when it is known (else the visa start, as before).
 * Approved cases only (that is when the arrival plan exists); the case must belong to the caller.
 */

export type PrepTaskKey = 'flight' | 'housing' | 'firstDay';

/** Onboarding slugs shown in the "after arrival" group first, in this order (the rest follow by sortOrder). */
export const CORE_SLUGS = ['anmeldung', 'krankenversicherung', 'bankkonto', 'steuer-id', 'mobilfunk'];

export const arrivalPrep = async (clientId: string, caseId: string | null, now = new Date()) => {
  const c = await approvedCaseFor(clientId, caseId);
  if (!c) return { case: null, arrivalAt: null, before: [], after: [], progress: null };
  await ensurePlans(clientId);
  const [plan, housing, employer] = await Promise.all([
    prisma.arrivalPlan.findUnique({ where: { caseId: c.id } }),
    prisma.caseHousing.findUnique({ where: { caseId: c.id }, select: { moveInDate: true, contractUploadedAt: true, appointmentAt: true, anmeldungDoneAt: true, city: true } }),
    workerChecklist(c.id),
  ]);

  const arrivalAt = plan?.arrivalTime ?? plan?.flightDate ?? null;
  const firstWorkDay = employer ? firstDayOf(employer.items) : null;

  const before = [
    {
      key: 'flight' as PrepTaskKey,
      done: !!(plan?.flightDate && plan.flightNumber),
      date: plan?.flightDate ?? null,
      detail: plan?.flightNumber ? [plan.flightNumber, [plan.departureAirport, plan.arrivalAirport].filter(Boolean).join(' → ')].filter(Boolean).join(' · ') : null,
      link: '/account/arrival',
    },
    {
      key: 'housing' as PrepTaskKey,
      done: plan?.housingStatus === 'ARRANGED' || !!housing?.contractUploadedAt || !!housing?.moveInDate,
      date: housing?.moveInDate ?? plan?.housingFrom ?? null,
      detail: plan?.housingStatus && plan.housingStatus !== 'NONE' ? plan.housingStatus : null,
      link: '/account/housing',
    },
    {
      key: 'firstDay' as PrepTaskKey,
      done: plan?.status === 'CONFIRMED' || plan?.status === 'COMPLETED' || !!plan?.pickupConfirmed,
      date: firstWorkDay ?? arrivalAt,
      detail: employer ? `${employer.progress.done}/${employer.progress.total}` : null,
      link: '/account/arrival',
    },
  ];

  const onboarding = await onboardingForCase(c);
  const base = arrivalAt ?? onboarding.baseDate;
  const rank = (slug: string) => {
    const i = CORE_SLUGS.indexOf(slug);
    return i < 0 ? CORE_SLUGS.length : i;
  };
  const after = onboarding.items
    .map((i) => {
      // The Anmeldung deadline is 14 days after moving in when the move-in day is known.
      const anmeldungDue = i.slug === 'anmeldung' && housing?.moveInDate ? new Date(housing.moveInDate.getTime() + 14 * DAY) : null;
      const dueAt = anmeldungDue ?? (base && i.dueDays !== null ? new Date(base.getTime() + i.dueDays * DAY) : null);
      const done = i.done || (i.slug === 'anmeldung' && !!housing?.anmeldungDoneAt);
      return {
        id: i.id,
        slug: i.slug,
        icon: i.icon,
        title: i.title,
        body: i.body,
        link: i.link,
        dueDays: i.dueDays,
        dueAt,
        done,
        doneAt: i.doneAt ?? (done ? (housing?.anmeldungDoneAt ?? null) : null),
        overdue: !done && !!dueAt && dueAt.getTime() < now.getTime(),
        core: CORE_SLUGS.includes(i.slug),
        appointmentAt: i.slug === 'anmeldung' ? (housing?.appointmentAt ?? null) : null,
      };
    })
    .sort((a, b) => rank(a.slug) - rank(b.slug));

  const total = before.length + after.length;
  const done = before.filter((t) => t.done).length + after.filter((t) => t.done).length;
  return {
    case: { id: c.id, number: c.number },
    arrivalAt,
    firstWorkDay,
    before,
    after,
    progress: { done, total, percent: total ? Math.round((done / total) * 100) : 0 },
  };
};
