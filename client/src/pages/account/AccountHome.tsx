import { useTranslation } from 'react-i18next';
import { AlertTriangle, BellRing, CalendarDays, FileUp, FolderOpen, Hourglass, MessageCircle, RotateCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FINAL } from '@/lib/caseStatus';
import { useAuth } from '@/lib/auth';
import { Stagger, StaggerItem } from '@/components/motion';
import { CaseSummaryCard } from '@/components/portal/CaseSummaryCard';
import {
  AppointmentWidget,
  DashboardSkeleton,
  DocumentChecklist,
  JourneyCard,
  LastMessageCard,
  LatestNotifications,
  ManagerCard,
  ProfileCard,
  QuickLinks,
  TipsCard,
} from '@/components/portal/Dashboard';
import { StartCase } from '@/components/portal/StartCase';
import { profileCompleteness } from '@/components/portal/profileFields';
import { useHashScroll, useOverview } from '@/components/portal/useOverview';
import type { ActiveCase, OverviewCaseRow } from '@/components/portal/accountTypes';
import { OnboardingCard } from '@/components/journey/OnboardingCard';
import { RecommendationsCard } from '@/components/aiWriting/Recommendations';
import { registerCopy } from '@/i18n';
import { pagesAccount } from '@/i18n/pagesAccount';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesAccount);

const CaseList = ({ cases, title }: { cases: OverviewCaseRow[]; title: string }) => (
  <section id="cases" className="scroll-mt-28 lg:scroll-mt-36" aria-labelledby="cases-title">
    <h2 id="cases-title" className="mb-4 flex items-center gap-2 text-xl font-bold text-navy-900">
      <FolderOpen className="size-5 text-brand-600" aria-hidden />
      {title}
      <span className="badge bg-brand-100 text-brand-700">{cases.length}</span>
    </h2>
    <Stagger className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
      {cases.map((c) => (
        <StaggerItem key={c.id}>
          <CaseSummaryCard c={c} />
        </StaggerItem>
      ))}
    </Stagger>
  </section>
);

/** "Your application in numbers": compact counters under the journey card. */
const CaseNumbers = ({ c }: { c: ActiveCase }) => {
  const { t } = useTranslation();
  const items: { icon: LucideIcon; label: string; value: number }[] = [
    { icon: CalendarDays, label: t('accountPage.dash.numbers.age'), value: c.stats.ageDays },
    { icon: Hourglass, label: t('accountPage.dash.numbers.step'), value: c.stats.daysInStatus },
    { icon: FileUp, label: t('accountPage.dash.numbers.uploads'), value: c.stats.uploads },
    { icon: MessageCircle, label: t('accountPage.dash.numbers.messages'), value: c.stats.messages },
    { icon: BellRing, label: t('accountPage.dash.numbers.updates'), value: c.stats.events },
  ];
  return (
    <section className="card" aria-label={t('accountPage.dash.numbers.title')}>
      <ul className="grid grid-cols-2 divide-y divide-line sm:grid-cols-5 sm:divide-x sm:divide-y-0 [&>*]:min-w-0">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-3 px-4 py-3 sm:flex-col sm:items-start sm:gap-1.5 sm:px-5 sm:py-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <it.icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-xl leading-tight font-extrabold text-navy-900">{it.value}</span>
              <span className="block truncate text-[11px] font-medium text-muted">{it.label}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default function AccountHome() {
  const { t } = useTranslation();
  usePageTitle(t('portal.title'));
  const { user } = useAuth();
  const { data, isLoading, isError, refetch, isFetching } = useOverview();
  useHashScroll(!!data);

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-warning" aria-hidden />
        <p className="mt-4 font-semibold text-navy-900">{t('accountPage.dash.error')}</p>
        <button type="button" className="btn-primary mt-6 min-h-11" onClick={() => void refetch()} disabled={isFetching}>
          <RotateCw className="size-4" aria-hidden />
          {t('accountPage.dash.retry')}
        </button>
      </div>
    );
  }

  const { activeCase, cases, notifications, lastMessage } = data;
  // The auth user updates immediately after a profile save; the overview may be a moment behind.
  const profile = user ? profileCompleteness(user) : data.profile;
  const past = cases.filter((c) => FINAL.includes(c.status));
  // Everything except the active case: finished cases and family-member cases (shown with their relation).
  const others = activeCase ? cases.filter((c) => c.id !== activeCase.id) : past;
  const othersTitle = others.every((c) => FINAL.includes(c.status)) ? t('accountPage.dash.pastCases') : t('portal.myCases');
  const latest = cases[0] ?? null;
  const visaSlug = (activeCase ?? latest)?.visaCategory?.slug ?? null;
  const hasApproved = cases.some((c) => c.status === 'APPROVED');

  if (activeCase) {
    return (
      <div className="space-y-8 lg:space-y-10">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <div className="min-w-0 space-y-6">
            <JourneyCard c={activeCase} />
            <CaseNumbers c={activeCase} />
            {hasApproved && <OnboardingCard />}
            {activeCase.appointment && (
              <div className="lg:hidden">
                <AppointmentWidget c={activeCase} />
              </div>
            )}
            <DocumentChecklist c={activeCase} />
            <TipsCard status={activeCase.status} />
            <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
              <LastMessageCard message={lastMessage} caseId={activeCase.id} />
              <LatestNotifications items={notifications.items} unread={notifications.unread} />
            </div>
          </div>
          <aside className="min-w-0 space-y-6">
            {activeCase.appointment && (
              <div className="hidden lg:block">
                <AppointmentWidget c={activeCase} />
              </div>
            )}
            <ManagerCard c={activeCase} />
            {profile.percent < 100 && <ProfileCard percent={profile.percent} missing={profile.missing} />}
            <QuickLinks visaSlug={visaSlug} />
            <RecommendationsCard />
          </aside>
        </div>
        {others.length > 0 && <CaseList cases={others} title={othersTitle} />}
      </div>
    );
  }

  return (
    <div className="space-y-8 lg:space-y-10">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="min-w-0 space-y-6">
          <StartCase hasCases={cases.length > 0} defaultProfession={user?.profession} />
          <RecommendationsCard />
          {hasApproved && <OnboardingCard />}
          <TipsCard status={latest?.status === 'APPROVED' ? 'APPROVED' : null} />
        </div>
        <aside className="min-w-0 space-y-6">
          <ProfileCard percent={profile.percent} missing={profile.missing} />
          <LatestNotifications items={notifications.items} unread={notifications.unread} />
          {lastMessage && <LastMessageCard message={lastMessage} caseId={null} />}
          <QuickLinks visaSlug={visaSlug} />
        </aside>
      </div>
      {cases.length > 0 && <CaseList cases={cases} title={t('accountPage.dash.pastCases')} />}
    </div>
  );
}
