import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAccessEmployers } from '@/i18n/pagesAccessEmployers';
import { Section } from './shared';

registerCopy(pagesAccessEmployers);

/** Permission keys of server/src/lib/companyAccess/permissions.ts. */
export const COMPANY_PERMS = [
  'manageTeam',
  'editCompanyProfile',
  'manageVacancies',
  'viewPipeline',
  'viewWorkers',
  'manageArrivalChecklist',
  'viewPersonalDocuments',
  'viewSalaries',
  'viewContracts',
  'fillEzb',
  'signEzb',
  'signAvv',
  'viewCandidatePool',
  'decideCandidates',
  'createRequests',
  'viewInvoices',
  'manageBilling',
] as const;
export type CompanyPerm = (typeof COMPANY_PERMS)[number];
export type CompanyRoleName = 'OWNER' | 'ADMIN' | 'HR' | 'MANAGER' | 'VIEWER' | 'STANDARD';

interface AccessMe {
  role: CompanyRoleName;
  isOwner: boolean;
  permissions: Record<CompanyPerm, boolean>;
}

export const COMPANY_ACCESS_KEY = ['company-access-me'];

/**
 * The signed-in employer's own role and permissions (GET /api/company/access/me). Cosmetic only: the server
 * enforces every permission. Until the answer is there (or if it fails) everything shows as before.
 */
export const useCompanyAccess = () => {
  const q = useQuery({ queryKey: COMPANY_ACCESS_KEY, queryFn: async () => (await api.get<AccessMe>('/company/access/me')).data, staleTime: 60_000 });
  const can = (...perms: CompanyPerm[]) => !q.data || perms.every((p) => q.data!.permissions[p] !== false);
  const canAny = (...perms: CompanyPerm[]) => !q.data || perms.some((p) => q.data!.permissions[p] !== false);
  return { data: q.data, can, canAny };
};

export const NoCompanyAccess = () => {
  const { t } = useTranslation();
  return (
    <Section>
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-sunken text-muted">
          <Lock className="size-6" aria-hidden />
        </span>
        <div>
          <p className="type-section-title text-ink">{t('companyRoles.noAccess.title')}</p>
          <p className="mt-1 text-sm text-muted">{t('companyRoles.noAccess.text')}</p>
        </div>
      </div>
    </Section>
  );
};

/** Renders the page only with every `all` permission and at least one of `any` (when given). */
export const CompanyGate = ({ all = [], any = [], children }: { all?: CompanyPerm[]; any?: CompanyPerm[]; children: ReactNode }) => {
  const { can, canAny } = useCompanyAccess();
  return can(...all) && (any.length === 0 || canAny(...any)) ? <>{children}</> : <NoCompanyAccess />;
};
