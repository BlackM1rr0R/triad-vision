import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, ChevronDown, ChevronRight, RotateCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { AppointmentWidget, LastMessageCard } from '@/components/portal/Dashboard';
import { JourneyCard } from '@/components/portal/JourneyCard';
import { StartCase } from '@/components/portal/StartCase';
import { useHashScroll, useOverview } from '@/components/portal/useOverview';
import { usePortalNav } from '@/components/portal/usePortalNav';
import { CLIENT_TOUR, useAutoStartTour } from '@/components/onboarding';
import { registerCopy } from '@/i18n';
import { pagesAccount } from '@/i18n/pagesAccount';
import { pagesPortalUx } from '@/i18n/pagesPortalUx';
import { pagesPortalNav } from '@/i18n/pagesPortalNav';
import { pagesPortalStage } from '@/i18n/pagesPortalStage';
import { toolPath, type PortalToolKey, type ToolLinkContext } from '@/lib/portalTools';
import { ALL_TOOLS_ICON, TOOL_ICON, toolLabel } from '@/components/portal/portalToolMeta';
import { usePageTitle } from '@/lib/usePageTitle';
import { NextWhileYouWait } from '@/components/waitingRoom/NextWhileYouWait'; // "Next while you wait" (waiting room)
import { SuccessShareCard } from '@/components/portal/SuccessShareCard'; // visa approved: congratulations + share card (hideable)
import { PermitExpiryCard } from '@/components/portal/PermitExpiryCard'; // after the visa: residence permit / Blue Card, insurance, passport validity
import { PartnerSharingCard } from '@/components/portal/PartnerSharingCard'; // client of a referral partner: who it is + data-sharing consent
import { NextStepCard } from './portal/NextStepCard';
import { HomeProgress } from './portal/HomeProgress';
import { caseHref } from './portal/useNextUp';
import { AccountHomeSkeleton } from './portal/HomeSkeleton';
import { CountdownCards } from '@/components/portal/CountdownCards'; // embassy / flight / Anmeldung countdowns + destination weather
import { GermanyDayCard } from '@/components/portal/GermanyDayCard'; // visa approved: countdown, week weather, packing list, first-day phrases
import { BadgesPanel } from '@/components/portal/BadgesPanel'; // private achievements (compact)
import { ReadinessCard } from '@/components/readiness/Readiness'; // Germany readiness score 0–100 + the next step with the biggest gain
import { FutureLetterCta, ReadyHomeCard } from '@/components/ready/ReadyCards'; // Germany Ready points + weekly challenge; letter to my future self

registerCopy(pagesAccount);
registerCopy(pagesPortalUx);
registerCopy(pagesPortalNav);
registerCopy(pagesPortalStage);

/** "For this stage": the tools the server features for the client's stage, plus "All tools". */
function StageTools({ tools, ctx, badge, allBadge }: { tools: PortalToolKey[]; ctx: ToolLinkContext; badge: (k: PortalToolKey) => number; allBadge: number }) {
  const { t } = useTranslation();
  const items = tools.map((k) => ({ k, to: toolPath(k, ctx) })).filter((x): x is { k: PortalToolKey; to: string } => !!x.to);
  const tile =
    'group relative flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-card px-3.5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-sunken focus-visible:ring-2 focus-visible:ring-primary';
  const Count = ({ n }: { n: number }) =>
    n > 0 ? (
      <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] leading-none font-bold text-white">
        <span aria-hidden>{n > 99 ? '99+' : n}</span>
        <span className="sr-only">{t('pux.nav.badge', { count: n })}</span>
      </span>
    ) : null;
  return (
    <section aria-labelledby="stage-tools-title" data-tour="portal-stage-tools">
      <h2 id="stage-tools-title" className="type-overline text-muted">
        {t('pstage.home.forStage')}
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {items.map(({ k, to }) => {
          const Icon = TOOL_ICON[k];
          return (
            <li key={k} className="min-w-0">
              <Link to={to} className={tile}>
                <Icon className="size-5 shrink-0 text-link" aria-hidden />
                <span className="min-w-0 break-words">{toolLabel(t, k)}</span>
                <Count n={badge(k)} />
              </Link>
            </li>
          );
        })}
        <li className="min-w-0">
          <Link to="/account/all" className={clsx(tile, 'border-dashed text-link')} data-tour="portal-all-home">
            <ALL_TOOLS_ICON className="size-5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{t('pstage.home.allTools')}</span>
            {allBadge > 0 ? <Count n={allBadge} /> : <ChevronRight className="ml-auto size-4 shrink-0 text-muted" aria-hidden />}
          </Link>
        </li>
      </ul>
    </section>
  );
}

/** "More": the cards that used to crowd the home (progress, journey map, readiness …), folded away and mounted on demand. */
function MoreArea({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
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
 * Portal home, calm and stage-based, top to bottom: ONE big card "Do this now" with the most important
 * action (GET /api/account/next-step), at most three small cards (messages, the next appointment, one stage
 * card), the tools of the client's stage (server: lib/account/portalStage.ts) and a folded "More" area with
 * everything else that used to live here (progress, journey map, countdowns, readiness, Germany Ready …).
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
  const ctx: ToolLinkContext = { caseId: nav.caseId, caseCount: nav.caseCount, approvedCaseId: nav.approvedCaseId };

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

      {/* A referral partner's data-sharing consent: only shown when it applies, and it needs an answer. */}
      <PartnerSharingCard />

      {small.length > 0 && <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">{small}</div>}

      {nav.featured.length > 0 && <StageTools tools={nav.featured} ctx={ctx} badge={nav.toolBadges} allBadge={nav.allBadge} />}

      <MoreArea>
        {step?.case && <HomeProgress next={step} stage={stage} detailsTo={caseId && activeCase ? caseHref(caseId, 'overview', '#forecast') : null} tour="portal-progress" />}
        {/* Home city → German city with the six milestones (map on tablet / desktop, list on phones). */}
        {step?.case && <JourneyCard next={step} />}
        {cases.length > 0 && <CountdownCards />}
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
