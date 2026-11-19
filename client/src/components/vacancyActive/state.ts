import type { VacancyStatus } from '@/components/jobs/types';

/**
 * Pure helpers of the per-vacancy "Aktiv / Deaktiv" (server lib/vacancyActive.ts).
 *  - public payloads carry `active` (false: deactivated by staff or expired); missing on older payloads = open;
 *  - admin rows: the switch is shown for published vacancies only (OPEN / CLOSED).
 */
export const isDeactivated = (v: { active?: boolean }) => v.active === false;

export type Toggleable = { id: string; status: VacancyStatus; closesAt?: string | null };

/** "active" = open and not past its closing date; null = no switch (draft / pending: approve or reject instead). */
export const activeStateOf = (v: Toggleable, now = Date.now()): 'active' | 'inactive' | null => {
  if (v.status === 'OPEN') return v.closesAt && new Date(v.closesAt).getTime() <= now ? 'inactive' : 'active';
  if (v.status === 'CLOSED') return 'inactive';
  return null;
};
