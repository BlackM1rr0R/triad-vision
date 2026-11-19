import type { Prisma, Vacancy } from '@prisma/client';
import { isOpen, openVacancyWhere } from './vacancies.js';

/**
 * Per-vacancy activation (owner decision Nov 2026: "deactivated vacancies stay visible, applications closed").
 *
 *  - OPEN         status OPEN and not past `closesAt`: listed first, can be applied to.
 *  - DEACTIVATED  staff deactivated it (status CLOSED after it had been published) or its closing date passed
 *                 (status OPEN, `closesAt` ≤ now): still listed on /jobs, the vacancy page, the start-case picker,
 *                 profession hubs and the home section — after the open ones, with a "Deaktiv" badge, no apply
 *                 (the server keeps refusing with 409 VACANCY_CLOSED) and the waitlist form. Its page answers 200
 *                 but is noindex and carries no JobPosting.
 *  - HIDDEN       drafts, submissions waiting for review / sent back, and CLOSED ones that were never published:
 *                 never public.
 *
 * "Activate" = CLOSED → OPEN (keeps the first publication date), "deactivate" = OPEN → CLOSED. DRAFT / PENDING go
 * through the review workflow (approve / reject) instead.
 */

export type VacancyPublicState = 'OPEN' | 'DEACTIVATED' | 'HIDDEN';
type StateFields = Pick<Vacancy, 'status' | 'closesAt' | 'publishedAt'>;

export const publicStateOf = (v: StateFields, now = new Date()): VacancyPublicState => {
  if (isOpen(v, now)) return 'OPEN';
  if (v.status === 'OPEN') return 'DEACTIVATED'; // expired
  if (v.status === 'CLOSED' && v.publishedAt) return 'DEACTIVATED';
  return 'HIDDEN';
};

export const isPubliclyVisible = (v: StateFields, now = new Date()) => publicStateOf(v, now) !== 'HIDDEN';

/** Deactivated (closed after publication) or expired. */
export const deactivatedVacancyWhere = (now = new Date()): Prisma.VacancyWhereInput => ({
  OR: [
    { status: 'CLOSED', publishedAt: { not: null } },
    { status: 'OPEN', closesAt: { lte: now } },
  ],
});

/** Everything the public may see: open + deactivated. */
export const publicVacancyWhere = (now = new Date()): Prisma.VacancyWhereInput => ({
  OR: [openVacancyWhere(now), deactivatedVacancyWhere(now)],
});

/** Most deactivated vacancies a public list appends after the open ones (newest change first). */
export const DEACTIVATED_LIST_CAP = 200;

// ─── Staff toggle ──────────────────────────────────────────────────────

export type ToggleError = 'NOT_PUBLISHED' | 'ALREADY_ACTIVE' | 'ALREADY_INACTIVE' | 'CLOSING_DATE_PASSED' | 'COMPANY_NOT_ACTIVE';

/**
 * Why a vacancy cannot be switched (null = it can). `companyActive`: false when the employer is not ACTIVE (the
 * super admin may still activate, like on approve).
 */
export const toggleRefusal = (
  v: Pick<Vacancy, 'status' | 'closesAt'>,
  active: boolean,
  o: { now?: Date; companyActive?: boolean; superAdmin?: boolean } = {},
): ToggleError | null => {
  const now = o.now ?? new Date();
  if (v.status === 'DRAFT' || v.status === 'PENDING') return 'NOT_PUBLISHED';
  if (active) {
    if (v.status === 'OPEN' && (!v.closesAt || v.closesAt > now)) return 'ALREADY_ACTIVE';
    if (v.closesAt && v.closesAt <= now) return 'CLOSING_DATE_PASSED';
    if (o.companyActive === false && !o.superAdmin) return 'COMPANY_NOT_ACTIVE';
    return null;
  }
  return v.status === 'CLOSED' ? 'ALREADY_INACTIVE' : null;
};

