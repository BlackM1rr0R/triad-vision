import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { AppointmentWidget, DashboardSkeleton, LastMessageCard } from '@/components/portal/Dashboard';
import { StartCase } from '@/components/portal/StartCase';
import { useHashScroll, useOverview } from '@/components/portal/useOverview';
import { usePortalNav } from '@/components/portal/usePortalNav';
import { CLIENT_TOUR, useAutoStartTour } from '@/components/onboarding';
import { registerCopy } from '@/i18n';
import { pagesAccount } from '@/i18n/pagesAccount';
import { pagesPortalUx } from '@/i18n/pagesPortalUx';
import { pagesPortalNav } from '@/i18n/pagesPortalNav';
import { usePageTitle } from '@/lib/usePageTitle';
import { NextWhileYouWait } from '@/components/waitingRoom/NextWhileYouWait'; // "Next while you wait" (waiting room)
import { NextStepCard } from './portal/NextStepCard';
import { HomeProgress } from './portal/HomeProgress';
import { caseHref } from './portal/useNextUp';

registerCopy(pagesAccount);
registerCopy(pagesPortalUx);
registerCopy(pagesPortalNav);

/**
 * Portal home, top to bottom: ONE card with the most important action now (GET /api/account/next-step),
 * a compact progress timeline and at most three small cards (messages, the next appointment, "while you
 * wait"). Everything else lives in its section (Documents · Messages · Learn · Profile).
 */
export default function AccountHome() {
  const { t } = useTranslation();
  usePageTitle(t('portal.title'));
  const { user } = useAuth();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, isFetching } = useOverview();
  const { next, stage } = usePortalNav();
  useHashScroll(!!data);
  useAutoStartTour(CLIENT_TOUR, user?.id, !!data);

  // Old links to the case list on the dashboard (#cases) open the case list page.
  useEffect(() => {
    if (hash === '#cases') navigate('/account/cases', { replace: true });
  }, [hash, navigate]);

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data || next.isError) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-warning" aria-hidden />
        <p className="mt-4 font-semibold text-ink">{t('accountPage.dash.error')}</p>
        <button
          type="button"
          className="btn-primary mt-6 min-h-11"
          onClick={() => void Promise.all([refetch(), next.refetch()])}
          disabled={isFetching || next.isFetching}
        >
          <RotateCw className="size-4" aria-hidden />
          {t('accountPage.dash.retry')}
        </button>
      </div>
    );
  }

  const { activeCase, cases, lastMessage } = data;
  const step = next.data;
  const caseId = step?.case?.id ?? null;
  const startHero = step?.primary?.kind === 'START_CASE' || (!step && cases.length === 0);
  const appointmentAhead = activeCase?.appointment && new Date(activeCase.appointment.at).getTime() > Date.now() ? activeCase : null;
  const waitingStage = stage === 'PREPARING' || stage === 'AT_EMBASSY';

  return (
    <div className="space-y-6 lg:space-y-8">
      {startHero ? (
        <div data-tour="portal-next">
          <StartCase hasCases={cases.length > 0} defaultProfession={user?.profession} />
        </div>
      ) : (
        <NextStepCard data={step} loading={next.isLoading} caseLink={caseId ? caseHref(caseId, 'overview') : null} tour="portal-next" />
      )}

      {step?.case && <HomeProgress next={step} stage={stage} detailsTo={caseId && activeCase ? caseHref(caseId, 'overview', '#forecast') : null} tour="portal-progress" />}

      {(lastMessage || appointmentAhead || waitingStage) && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {(lastMessage || caseId) && (
            <div data-tour="portal-messages" className="[&>section]:h-full">
              <LastMessageCard message={lastMessage} caseId={lastMessage?.caseId ?? caseId} />
            </div>
          )}
          {appointmentAhead && <AppointmentWidget c={appointmentAhead} />}
          {waitingStage && <NextWhileYouWait />}
        </div>
      )}
    </div>
  );
}
