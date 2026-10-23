import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { familyKey as journeyFamilyKey } from '@/components/journey/api';
import type { FamilyOverview } from './types';

export const familyOverviewKey = (caseId: string) => ['family-overview', caseId] as const;

export const useFamilyOverview = (caseId: string, enabled = true) =>
  useQuery({
    queryKey: familyOverviewKey(caseId),
    queryFn: async () => (await api.get<FamilyOverview>(`/family/cases/${caseId}`)).data,
    enabled: !!caseId && enabled,
    staleTime: 15_000,
  });

/** After a write: the overview of every case in the group plus the older journey group card and case lists. */
export const useFamilyRefresh = () => {
  const qc = useQueryClient();
  return (ov?: FamilyOverview | null) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['family-overview'] }),
      ov ? qc.invalidateQueries({ queryKey: journeyFamilyKey(ov.main.id) }) : qc.invalidateQueries({ queryKey: ['journey-family'] }),
      qc.invalidateQueries({ queryKey: ['cases'] }),
      qc.invalidateQueries({ queryKey: ['admin-cases'] }),
    ]);
};
