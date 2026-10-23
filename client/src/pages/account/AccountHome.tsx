import { PortalCallbackCard } from '@/components/calls/CallbackForm'; // "Mənə zəng edin" from the portal
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FolderOpen, RotateCw } from 'lucide-react';
import { FINAL } from '@/lib/caseStatus';
import { useAuth } from '@/lib/auth';
import { Stagger, StaggerItem } from '@/components/motion';
import { CaseSummaryCard } from '@/components/portal/CaseSummaryCard';
import {
  AppointmentWidget,
  DashboardSkeleton,
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
import type { AccountOverview, ActiveCase, OverviewCaseRow } from '@/components/portal/accountTypes';
import { OnboardingCard } from '@/components/journey/OnboardingCard';
import { RecommendationsCard } from '@/components/aiWriting/Recommendations';
import { CLIENT_TOUR, useAutoStartTour } from '@/components/onboarding';
import { registerCopy } from '@/i18n';
import { pagesAccount } from '@/i18n/pagesAccount';
import { pagesPortalUx } from '@/i18n/pagesPortalUx';
import { usePageTitle } from '@/lib/usePageTitle';
import { NextUpCard } from './portal/NextUpCard';
import { NextItems } from './portal/NextItems';
import { ProgressSteps } from './portal/ProgressSteps';
import { GermanTeaser, ReferralTeaser } from './portal/SecondaryCards';
import { caseHref, useNextUp } from './portal/useNextUp';

registerCopy(pagesAccount);
registerCopy(pagesPortalUx);

const CaseList = ({ cases, title }: { cases: OverviewCaseRow[]; title: string }) => (
  <section id="cases" className="scroll-mt-28 lg:scroll-mt-36" aria-labelledby="cases-title">
    <h2 id="cases-title" className="type-section-title mb-4 flex items-center gap-2">
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

/**
 * Portal home with an active case, top to bottom: one "what do I need to do now?" card, the 6-step
 * progress, the other open items, then calm secondary cards (each hides itself when empty).
 */
type HomeRest = Pick<AccountOverview, 'notifications' | 'lastMessage' | 'profile'> & { hasApproved: boolean; visaSlug: string | null };

const ActiveHome = ({ c, rest }: { c: ActiveCase; rest: HomeRest }) => {
  const next = useNextUp(c.id);
  return (
    <div className="space-y-6 lg:space-y-8">
      <NextUpCard next={next} tour="portal-next" caseLink={caseHref(c.id, 'overview')} />
      <ProgressSteps status={c.status} visaType={c.visaType} number={c.number} detailsTo={caseHref(c.id, 'overview', '#forecast')} tour="portal-progress" />
      <NextItems items={next.items} short={next.short} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        <div data-tour="portal-messages" className="[&>section]:h-full">
          <LastMessageCard message={rest.lastMessage} caseId={c.id} />
        </div>
        {c.appointment && <AppointmentWidget c={c} />}
        <ManagerCard c={c} />
        <GermanTeaser />
        {rest.profile.percent < 100 && <ProfileCard percent={rest.profile.percent} missing={rest.profile.missing} />}
        {rest.hasApproved && <OnboardingCard />}
        {rest.notifications.unread > 0 && <LatestNotifications items={rest.notifications.items} unread={rest.notifications.unread} />}
        <ReferralTeaser />
        <PortalCallbackCard />
        <QuickLinks visaSlug={rest.visaSlug} />
      </div>
      <RecommendationsCard />
    </div>
  );
};

export default function AccountHome() {
  const { t } = useTranslation();
  usePageTitle(t('portal.title'));
  const { user } = useAuth();
  const { data, isLoading, isError, refetch, isFetching } = useOverview();
  useHashScroll(!!data);
  useAutoStartTour(CLIENT_TOUR, user?.id, !!data);

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-warning" aria-hidden />
        <p className="mt-4 font-semibold text-ink">{t('accountPage.dash.error')}</p>
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
        <ActiveHome c={activeCase} rest={{ notifications, lastMessage, profile, hasApproved, visaSlug }} />
        {others.length > 0 && <CaseList cases={others} title={othersTitle} />}
      </div>
    );
  }

  // No active case: starting a case is the one thing to do.
  return (
    <div className="space-y-8 lg:space-y-10">
      <div data-tour="portal-next">
        <StartCase hasCases={cases.length > 0} defaultProfession={user?.profession} />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        {profile.percent < 100 && <ProfileCard percent={profile.percent} missing={profile.missing} />}
        {lastMessage && (
          <div data-tour="portal-messages" className="[&>section]:h-full">
            <LastMessageCard message={lastMessage} caseId={null} />
          </div>
        )}
        {notifications.items.length > 0 && <LatestNotifications items={notifications.items} unread={notifications.unread} />}
        {hasApproved && <OnboardingCard />}
        <GermanTeaser />
        <ReferralTeaser />
        <TipsCard status={latest?.status === 'APPROVED' ? 'APPROVED' : null} />
        <QuickLinks visaSlug={visaSlug} />
      </div>
      <RecommendationsCard />
      {cases.length > 0 && <CaseList cases={cases} title={t('accountPage.dash.pastCases')} />}
    </div>
  );
}
