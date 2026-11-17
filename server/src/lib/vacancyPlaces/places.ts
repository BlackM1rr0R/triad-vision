import type { ApplicationStatus, CaseStatus } from '@prisma/client';

/**
 * Free places of a vacancy — pure rules (no database), shared by the public board, the employer portal, the staff
 * admin and the apply / case-create checks (service.ts).
 *
 * Rule ("who occupies a place"):
 *   - a person whose application to the vacancy is ACCEPTED (the employer / staff said yes), or
 *   - a person whose case is linked to the vacancy (Case.vacancyId) and has reached the contract / visa stage:
 *     CONTRACT_SIGNED, EMBASSY_DOCUMENTS, EMBASSY_REVIEW, APPOINTMENT_SCHEDULED, DECISION_PENDING or APPROVED.
 *   Each person counts once (an accepted application and the case made from it are the same place). New, short-listed,
 *   proposed, interviewing, rejected or withdrawn applications and cases before the contract (or refused / cancelled)
 *   do not occupy a place.
 *   filled = max(0, occupying people + Vacancy.filledAdjustment)   (staff correction, e.g. placed outside the system)
 *   free   = max(0, positions − filled)
 */
export const OCCUPYING_APPLICATION_STATUSES: ApplicationStatus[] = ['ACCEPTED'];
export const OCCUPYING_CASE_STATUSES: CaseStatus[] = ['CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED'];

export interface Places {
  positions: number;
  filled: number;
  free: number;
}

export const computePlaces = (v: { positions: number; filledAdjustment?: number | null }, occupying: number): Places => {
  const positions = Math.max(0, Math.trunc(v.positions || 0));
  const filled = Math.max(0, Math.trunc(occupying) + Math.trunc(v.filledAdjustment ?? 0));
  return { positions, filled, free: Math.max(0, positions - filled) };
};

/** Distinct people per vacancy from occupying applications and cases (each person once). */
export const countOccupying = (
  apps: { vacancyId: string; userId: string }[],
  cases: { vacancyId: string | null; clientId: string }[],
): Map<string, number> => {
  const people = new Map<string, Set<string>>();
  const add = (vacancyId: string | null, userId: string) => {
    if (!vacancyId) return;
    let set = people.get(vacancyId);
    if (!set) people.set(vacancyId, (set = new Set()));
    set.add(userId);
  };
  for (const a of apps) add(a.vacancyId, a.userId);
  for (const c of cases) add(c.vacancyId, c.clientId);
  return new Map([...people].map(([id, set]) => [id, set.size]));
};

/** Open vacancies with free places first, full ones after; the order inside each group is kept. */
export const fullLast = <T>(items: T[], isFull: (x: T) => boolean): T[] => [...items.filter((x) => !isFull(x)), ...items.filter(isFull)];

/** Visa type of a case started from a vacancy: Ausbildung vacancies → AUSBILDUNG, everything else → WORK. */
export const visaTypeOfVacancy = (v: { employmentType: string; visaCategory?: { slug: string } | null }): 'WORK' | 'AUSBILDUNG' =>
  v.employmentType === 'AUSBILDUNG' || v.visaCategory?.slug === 'ausbildung' ? 'AUSBILDUNG' : 'WORK';
