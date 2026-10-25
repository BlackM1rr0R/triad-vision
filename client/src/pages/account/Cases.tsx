import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';
import { Stagger, StaggerItem } from '@/components/motion';
import { CaseSummaryCard } from '@/components/portal/CaseSummaryCard';
import { DashboardSkeleton } from '@/components/portal/Dashboard';
import { StartCase } from '@/components/portal/StartCase';
import { useOverview } from '@/components/portal/useOverview';
import { useAuth } from '@/lib/auth';
import { FINAL } from '@/lib/caseStatus';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesPortalNav } from '@/i18n/pagesPortalNav';

registerCopy(pagesPortalNav);

/** /account/cases — every application of the client (own, family members, finished ones). Home › My applications. */
export default function AccountCases() {
  const { t } = useTranslation();
  usePageTitle(t('pnav.cases.title'));
  const { user } = useAuth();
  const { data, isLoading } = useOverview();
  if (isLoading || !data) return <DashboardSkeleton />;
  const cases = data.cases;
  const hasOpen = cases.some((c) => !FINAL.includes(c.status));

  return (
    <div className="space-y-6 lg:space-y-8">
      <section aria-labelledby="cases-title">
        <h2 id="cases-title" className="type-section-title mb-4 flex items-center gap-2">
          <FolderOpen className="size-5 text-primary" aria-hidden />
          {t('pnav.cases.title')}
          <span className="badge bg-sunken text-link">{cases.length}</span>
        </h2>
        {cases.length ? (
          <Stagger className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
            {cases.map((c) => (
              <StaggerItem key={c.id}>
                <CaseSummaryCard c={c} />
              </StaggerItem>
            ))}
          </Stagger>
        ) : (
          <p className="type-small">{t('pnav.cases.empty')}</p>
        )}
      </section>
      {!hasOpen && <StartCase hasCases={cases.length > 0} defaultProfession={user?.profession} />}
    </div>
  );
}
