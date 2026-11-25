import { useEffect, useId, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, ChevronDown, RotateCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { AppointmentWidget, LastMessageCard } from '@/components/portal/Dashboard';
import { JourneyCard } from '@/components/portal/JourneyCard';
import { StartCase } from '@/components/portal/StartCase';
import { useHashScroll, useOverview } from '@/components/portal/useOverview';
import { usePortalNav } from '@/components/portal/usePortalNav';
import { CLIENT_TOUR, useAutoStartTour } from '@/components/onboarding';
import { registerCopy, registerLazyCopy } from '@/i18n';
import pagesAccount from '@/i18n/pagesAccount?lazy-copy';
import { pagesPortalUx } from '@/i18n/pagesPortalUx';
import { pagesPortalNav } from '@/i18n/pagesPortalNav';
import { pagesPortalStage } from '@/i18n/pagesPortalStage';
import { usePageTitle } from '@/lib/usePageTitle';
import { NextWhileYouWait } from '@/components/waitingRoom/NextWhileYouWait'; // "Next while you wait" (waiting room)
import { SuccessShareCard } from '@/components/portal/SuccessShareCard'; // visa approved: congratulations + share card (hideable)
import { PermitExpiryCard } from '@/components/portal/PermitExpiryCard'; // after the visa: residence permit / Blue Card, insurance, passport validity
import { PartnerSharingCard } from '@/components/portal/PartnerSharingCard'; // client of a referral partner: who it is + data-sharing consent
import { NextStepCard } from './portal/NextStepCard';
import { DocStatusSection } from '@/components/docProgress/DocProgress'; // "Sənədlərimin vəziyyəti": ring, steps, status bars, team stage
import { caseHref } from './portal/useNextUp';
import { AccountHomeSkeleton } from './portal/HomeSkeleton';
import { CountdownCards } from '@/components/portal/CountdownCards'; // embassy / flight / Anmeldung countdowns + destination weather
import { GermanyDayCard } from '@/components/portal/GermanyDayCard'; // visa approved: countdown, week weather, packing list, first-day phrases
import { First30DaysCard, MyGermanyCard } from '@/components/portal/FirstWeeks'; // first 30 days checklist + "My Germany" city card
import { BadgesPanel } from '@/components/portal/BadgesPanel'; // private achievements (compact)
import { ReadinessCard } from '@/components/readiness/Readiness'; // Germany readiness score 0–100 + the next step with the biggest gain
import { FutureLetterCta, ReadyHomeCard } from '@/components/ready/ReadyCards'; // Germany Ready points + weekly challenge; letter to my future self
import { opensMoreArea } from './portal/homeAnchors'; // #permits lives in the folded "More" area before the arrival

registerLazyCopy(pagesAccount); // only the copy of the language in use, awaited before the page renders (vite/lazyCopy.ts)
registerCopy(pagesPortalUx);
registerCopy(pagesPortalNav);
registerCopy(pagesPortalStage);

/** "More": the cards that used to crowd the home (countdowns, readiness, Germany Ready …), folded away and mounted on demand. */
function MoreArea({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { hash } = useLocation();
  // A link to a card inside (permit reminder → /account#permits) opens the area, so the anchor exists to scroll to.
  const [open, setOpen] = useState(() => opensMoreArea(hash));
  useEffect(() => {
    if (opensMoreArea(hash)) setOpen(true);
  }, [hash]);
  const id = useId();
  return (
    <section className="rounded-3xl border border-line bg-card" data-tour="portal-more">
      <button
        type="button"
        className="flex min-h-14 w-full items-center gap-3 rounded-3xl px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-6"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{open ? t('pstage.home.less') : t('pstage.home.more')}</span>
          {!open && <span className="block text-sm text-muted">{t('pstage.home.moreText')}</span>}
        </span>
        <ChevronDown className={clsx('size-5 shrink-0 text-muted transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>
      <div id={id} hidden={!open} className="space-y-6 border-t border-line p-4 sm:p-6 lg:space-y-8">
        {open && children}
      </div>
    </section>
  );
}

/**
 * Portal home ("Əsas"), a short overview, top to bottom: ONE big card "Do this now" with the most important action
 * (GET /api/account/next-step), "Sənədlərimin vəziyyəti" (documents + the six stages), a compact "Sizin yolunuz"
 * (current stage → next step, linking to the case page), at most three small cards (last message, the next
 * appointment, one stage card) and a folded "More" area (countdowns, readiness, Germany Ready …).
 * The case details — current-step card, the full journey map, the dated forecast, documents, messages — live on
 * "Müraciətim" (/account/cases/:id) only, so the two pages do not repeat each other. The stage's tools are in the
 * top navigation (no tool panel here).
 */
export default function AccountHome() {
  const { t } = useTranslation();
  usePageTitle(t('portal.title'));
  const { user } = useAuth();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, isFetching } = useOverview();
  const nav = usePortalNav();
  const { next, stage } = nav;
  useHashScroll(!!data);
  useAutoStartTour(CLIENT_TOUR, user?.id, !!data);

  // Old links to the case list on the dashboard (#cases) open the case list page.
  useEffect(() => {
    if (hash === '#cases') navigate('/account/cases', { replace: true });
  }, [hash, navigate]);

  if (isLoading) return <AccountHomeSkeleton />;
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
  const approved = cases.some((c) => c.status === 'APPROVED');

  // At most three small cards: messages, the next appointment and one card of the stage.
  const small = [
    (lastMessage || caseId) && (
      <div key="msg" data-tour="portal-messages" className="[&>section]:h-full">
        <LastMessageCard message={lastMessage} caseId={lastMessage?.caseId ?? caseId} />
      </div>
    ),
    appointmentAhead && <AppointmentWidget key="appt" c={appointmentAhead} />,
    waitingStage && <NextWhileYouWait key="wait" />,
    stage === 'IN_GERMANY' && <PermitExpiryCard key="permit" />,
  ]
    .filter(Boolean)
    .slice(0, 3);

  return (
    <div className="space-y-6 lg:space-y-8">
      {startHero ? (
        <div data-tour="portal-next">
          <StartCase hasCases={cases.length > 0} defaultProfession={user?.profession} />
        </div>
      ) : (
        <NextStepCard data={step} loading={next.isLoading} caseLink={caseId ? caseHref(caseId, 'overview') : null} tour="portal-next" />
      )}

      {/* Right below "Do this now": the documents and the six stages at a glance (own case only; one progress block). */}
      {!startHero && caseId && <DocStatusSection caseId={caseId} />}
      {/* "Sizin yolunuz", short: current stage → next step; the map and the dates are on the case page. */}
      {step?.case && <JourneyCard next={step} compactTo={caseId ? caseHref(caseId, 'overview') : null} tour="portal-progress" />}

      {/* A referral partner's data-sharing consent: only shown when it applies, and it needs an answer. */}
      <PartnerSharingCard />

      {/* Visa approved or already in Germany: the first errands (Anmeldung, bank, Krankenkasse …) with map links. */}
      {(approved || stage === 'IN_GERMANY') && <First30DaysCard />}

      {small.length > 0 && <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">{small}</div>}

      <MoreArea>
        {cases.length > 0 && <CountdownCards />}
        {(approved || stage === 'IN_GERMANY') && <MyGermanyCard />}
        {approved && stage !== 'IN_GERMANY' && <GermanyDayCard />}
        {approved && <SuccessShareCard dismissible />}
        {approved && stage !== 'IN_GERMANY' && <PermitExpiryCard />}
        <ReadinessCard />
        {/* Germany Ready: practice points + the weekly challenge; letter to my future self (before the arrival). */}
        <ReadyHomeCard />
        <FutureLetterCta />
        {cases.length > 0 && <BadgesPanel compact />}
      </MoreArea>
    </div>
  );
}
