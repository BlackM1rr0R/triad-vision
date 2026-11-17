import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { api, errorCode } from '@/lib/api';

/** Free places of a vacancy (server lib/vacancyPlaces): positions, people occupying a place, what is left. */
export interface Places {
  positions: number;
  filled?: number;
  free?: number;
}

/** Full = known free count of 0 (older payloads without `free` are treated as open). */
export const isFull = (v: Places) => v.free !== undefined && v.free <= 0;

/** Admin setting (GET /api/vacancies/policy, PUT /api/admin/vacancies/policy). */
export interface ApplicationPolicy {
  clientsOnlyActiveVacancies: boolean;
  allowExternalApplications: boolean;
}

export const POLICY_KEY = ['vacancy-application-policy'];

export const useApplicationPolicy = (enabled = true) =>
  useQuery({
    queryKey: POLICY_KEY,
    queryFn: async () => (await api.get<{ policy: ApplicationPolicy }>('/vacancies/policy')).data.policy,
    staleTime: 60_000,
    enabled,
  });

const CODES = ['VACANCY_FULL', 'VACANCY_CLOSED', 'VACANCY_NOT_FOUND', 'VACANCY_REQUIRED', 'EXTERNAL_APPLICATIONS_DISABLED'];

/** Text for the place / policy error codes of the server, or null for any other error. */
export const placesErrorText = (t: TFunction, err: unknown): string | null => {
  const code = errorCode(err);
  return CODES.includes(code) ? t(`vacPlaces.errors.${code}`) : null;
};
