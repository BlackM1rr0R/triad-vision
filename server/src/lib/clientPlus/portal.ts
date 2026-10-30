import type { CaseStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { choosePrimary } from '../account/nextStep.js';
import { anmeldungDeadline, berlinParts, dayToDate } from '../housing/core.js';
import { weatherFor, type Weather } from './weather.js';

/**
 * Client portal extras (routes/accountPlus.ts):
 *  - the family switcher: every case of the logged-in client (main application + family-member cases, which
 *    share the client user — lib/family/members.ts) with who it is for ("Mən", spouse, child: name);
 *  - the countdown cards of the portal home: embassy appointment, flight / arrival (ArrivalPlan), Anmeldung
 *    deadline and Bürgeramt appointment (CaseHousing), plus the destination city's weather (lib/clientPlus/weather).
 * Access rule everywhere: Case.clientId === the user — a case id of someone else is "not found".
 */

const DAY = 24 * 60 * 60 * 1000;

export type FamilyKind = 'self' | 'spouse' | 'child' | 'parent' | 'other';

const KIND_OF: Record<string, FamilyKind> = { SPOUSE: 'spouse', CHILD: 'child', PARENT: 'parent', OTHER: 'other', spouse: 'spouse', child: 'child', parent: 'parent', other: 'other' };

export interface SwitchCase {
  id: string;
  number: string;
  status: CaseStatus;
  kind: FamilyKind;
  firstName: string | null;
  parentCaseId: string | null;
  /** The case the portal shows when nothing is chosen. */
  isDefault: boolean;
}

/** The client's cases for the family switcher (main applications first, then their members). */
export const familyCases = async (userId: string): Promise<SwitchCase[]> => {
  const rows = await prisma.case.findMany({
    where: { clientId: userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, number: true, status: true, parentCaseId: true, relation: true, familyProfile: { select: { relation: true, firstName: true } } },
  });
  const primary = choosePrimary(rows);
  const list = rows.map((c) => ({
    id: c.id,
    number: c.number,
    status: c.status,
    kind: c.parentCaseId ? (KIND_OF[c.familyProfile?.relation ?? c.relation ?? 'other'] ?? 'other') : ('self' as FamilyKind),
    firstName: c.parentCaseId ? (c.familyProfile?.firstName ?? null) : null,
    parentCaseId: c.parentCaseId,
    isDefault: c.id === primary?.id,
  }));
  const order: Record<FamilyKind, number> = { self: 0, spouse: 1, child: 2, parent: 3, other: 4 };
  return list.sort((a, b) => order[a.kind] - order[b.kind]);
};

/** One case of the client or null (the switcher's choice is validated with this). */
export const ownCaseId = async (userId: string, caseId: string | null | undefined) => {
  if (!caseId || caseId.length > 40) return null;
  const c = await prisma.case.findFirst({ where: { id: caseId, clientId: userId }, select: { id: true } });
  return c?.id ?? null;
};

/** Whole calendar days (German time) from today to the day of `at`; negative once passed. */
export const daysUntil = (at: Date, now = new Date()) => Math.round((dayToDate(berlinParts(at).day).getTime() - dayToDate(berlinParts(now).day).getTime()) / DAY);

export type CountdownKind = 'EMBASSY' | 'FLIGHT' | 'ANMELDUNG' | 'BUERGERAMT';

export interface Countdown {
  kind: CountdownKind;
  at: string; // ISO instant (deadline: 00:00 UTC of the day)
  days: number;
  place: string | null;
  detail: string | null; // flight number, arrival airport …
  to: string; // portal link
}

export interface Countdowns {
  caseId: string | null;
  cards: Countdown[];
  city: string | null;
  weather: Weather | null;
}

/**
 * Countdown cards of one case (the chosen one, else the case the portal is about). Member cases without their
 * own travel / housing records use the main case's (the family usually flies and registers together).
 * Past dates are left out (an overdue Anmeldung stays: it still has to be done).
 */
export const countdownsFor = async (userId: string, chosen: string | null, now = new Date(), opts: { weather?: boolean } = {}): Promise<Countdowns> => {
  const cases = await prisma.case.findMany({ where: { clientId: userId }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, parentCaseId: true } });
  const target = (chosen && cases.find((c) => c.id === chosen)) || choosePrimary(cases);
  if (!target) return { caseId: null, cards: [], city: null, weather: null };

  const select = {
    id: true,
    appointmentAt: true,
    appointmentPlace: true,
    company: { select: { city: true } },
    vacancy: { select: { city: true } },
    arrivalPlan: { select: { flightDate: true, arrivalTime: true, flightNumber: true, arrivalAirport: true, housingCity: true, status: true } },
    housing: { select: { city: true, moveInDate: true, anmeldungDoneAt: true, appointmentAt: true, appointmentAddress: true } },
  } as const;
  const own = await prisma.case.findUniqueOrThrow({ where: { id: target.id }, select });
  const parent = target.parentCaseId ? await prisma.case.findUnique({ where: { id: target.parentCaseId }, select }) : null;
  const plan = own.arrivalPlan ?? parent?.arrivalPlan ?? null;
  const housing = own.housing ?? parent?.housing ?? null;

  const cards: Countdown[] = [];
  const caseLink = (tab?: string) => `/account/cases/${own.id}${tab ? `?tab=${tab}` : ''}`;
  if (own.appointmentAt && own.appointmentAt.getTime() > now.getTime() - 2 * 60 * 60 * 1000) {
    cards.push({ kind: 'EMBASSY', at: own.appointmentAt.toISOString(), days: daysUntil(own.appointmentAt, now), place: own.appointmentPlace ?? null, detail: null, to: caseLink() });
  }
  const flight = plan && plan.status !== 'CANCELLED' ? (plan.arrivalTime ?? plan.flightDate) : null;
  if (flight && daysUntil(flight, now) >= 0) {
    cards.push({ kind: 'FLIGHT', at: flight.toISOString(), days: daysUntil(flight, now), place: plan?.arrivalAirport ?? null, detail: plan?.flightNumber ?? null, to: '/account/arrival' });
  }
  if (housing && !housing.anmeldungDoneAt) {
    const deadline = anmeldungDeadline(housing.moveInDate);
    if (deadline) cards.push({ kind: 'ANMELDUNG', at: deadline.toISOString(), days: Math.round((deadline.getTime() - dayToDate(berlinParts(now).day).getTime()) / DAY), place: null, detail: null, to: '/account/housing' });
    if (housing.appointmentAt && daysUntil(housing.appointmentAt, now) >= 0) {
      cards.push({ kind: 'BUERGERAMT', at: housing.appointmentAt.toISOString(), days: daysUntil(housing.appointmentAt, now), place: housing.appointmentAddress ?? null, detail: null, to: '/account/housing' });
    }
  }
  cards.sort((a, b) => a.days - b.days);

  const city = housing?.city || plan?.housingCity || own.vacancy?.city || own.company?.city || parent?.vacancy?.city || parent?.company?.city || null;
  // Weather only next to a card (nothing to count down → no upstream call).
  const weather = cards.length && opts.weather !== false ? await weatherFor(city) : null;
  return { caseId: own.id, cards, city, weather };
};

