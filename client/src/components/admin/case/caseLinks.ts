import { useQuery } from '@tanstack/react-query';
import { registerCopy } from '@/i18n';
import { api } from '@/lib/api';
import type { L10n } from '@/lib/types';

/** The case's employer / vacancy link (company portal "our workers"); not in the shared CaseDetail type. */
export type CaseLink = { companyId?: string | null; vacancyId?: string | null };
export type CompanyOption = { id: string; name: string };
export type VacancyOption = { id: string; title: L10n; companyId: string | null };

/**
 * The jobsArea.admin.caseLink.* labels live in the (large) jobs copy bundle: load it only when an employer link is shown
 * or edited. The query result change re-renders the caller once the labels are registered.
 */
export const useJobsCopy = (enabled: boolean) =>
  useQuery({
    queryKey: ['copy', 'pagesJobs'],
    queryFn: async () => {
      registerCopy((await import('@/i18n/pagesJobs')).pagesJobs);
      return true;
    },
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  }).data === true;

/** Option lists are only loaded when needed (a linked employer is shown, or the edit dialog is open). */
export const useCompanyOptions = (enabled: boolean) =>
  useQuery({
    queryKey: ['admin-company-options'],
    queryFn: async () => (await api.get<{ items: CompanyOption[] }>('/admin/companies/options')).data.items,
    staleTime: 60_000,
    enabled,
  });

export const useVacancyOptions = (enabled: boolean) =>
  useQuery({
    queryKey: ['admin-vacancy-options'],
    queryFn: async () => (await api.get<{ items: VacancyOption[] }>('/admin/vacancies/options')).data.items,
    staleTime: 60_000,
    enabled,
  });
