import { Link, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Bell, BookUser, Briefcase, Cake, Compass, Gift, FileSignature, FileUser, FolderOpen, GraduationCap, Hourglass, Languages, LayoutDashboard, MailQuestion, MessageCircleQuestion, PenLine, PlaneLanding, ShieldCheck, UserRound, Vault, Video } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { FINAL } from '@/lib/caseStatus';
import { useNotifications } from '@/components/portal/useNotifications';
import { useOverview } from '@/components/portal/useOverview';
import { profileCompleteness } from '@/components/portal/profileFields';
import { ProgressRing } from '@/components/portal/ProgressRing';
import { registerCopy } from '@/i18n';
import { pagesAccount } from '@/i18n/pagesAccount';
import { VerifyBanner } from '@/components/auth/VerifyBanner';
import { pagesJobs } from '@/i18n/pagesJobs';
import { pagesJourney } from '@/i18n/pagesJourney';
import { pagesSign } from '@/i18n/pagesSign';
import { useMySignatures } from '@/components/esign/MySignatures';
import AiLauncher from '@/components/ai/AiLauncher';
import { BottomNavPortal } from '@/components/nav/BottomNavPortal';
import { CLIENT_TOUR, TourHost, TourRestartButton } from '@/components/onboarding';
import { pagesPortalUx } from '@/i18n/pagesPortalUx';
import { pagesWaitingRoom } from '@/i18n/pagesWaitingRoom';

registerCopy(pagesAccount);
registerCopy(pagesSign);
registerCopy(pagesJobs);
registerCopy(pagesJourney);
registerCopy(pagesPortalUx);
registerCopy(pagesWaitingRoom); // waiting room tab label

export default function AccountLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const outlet = useOutlet();
  const { data: notif } = useNotifications(!!user);
  const unread = notif?.unread ?? 0;

  const isClient = user?.role === 'CLIENT';
  const { data: overview } = useOverview(!!user && isClient);
  const cases = overview?.cases ?? [];
  // "My application" opens the active case directly; with several finished cases it shows the list.
  const primaryCase = cases.find((c) => !FINAL.includes(c.status)) ?? (cases.length === 1 ? cases[0] : null);
  const casesTo = primaryCase ? `/account/cases/${primaryCase.id}` : cases.length > 1 ? '/account#cases' : '/account#start';
  const completeness = profileCompleteness(user);
  // Post-arrival checklist only makes sense once a visa was approved.
  const hasApproved = cases.some((c) => c.status === 'APPROVED');
  // "Documents to sign" appears once something was sent to the user for signature.
  const { data: signatures } = useMySignatures({ enabled: !!user });
  const toSign = (signatures ?? []).filter((s) => s.myTurn).length;

  const tabs: { to: string; label: string; icon: typeof Bell; match: (p: string) => boolean; badge?: number; inBottomNav?: boolean; tour?: string }[] = [
    { to: '/account', label: t('accountPage.tabs.dashboard'), icon: LayoutDashboard, inBottomNav: true, match: (p: string) => p === '/account' || p === '/account/' },
    {
      to: casesTo,
      label: cases.length > 1 ? t('accountPage.tabs.myCases') : t('accountPage.tabs.myCase'),
      icon: FolderOpen,
      inBottomNav: true,
      tour: 'portal-tab-case',
      match: (p: string) => p.startsWith('/account/cases'),
    },
    { to: '/account/applications', label: t('jobsArea.applications.tab'), icon: Briefcase, match: (p: string) => p.startsWith('/account/applications') },
    ...(isClient
      ? [
          { to: '/account/cv', label: t('accountPage.tabs.cv'), icon: FileUser, match: (p: string) => p.startsWith('/account/cv') },
          { to: '/account/letters', label: t('accountPage.tabs.letters'), icon: PenLine, match: (p: string) => p === '/account/letters' || p.startsWith('/account/letters/') },
          { to: '/account/letters-explain', label: t('accountPage.tabs.lettersExplain'), icon: MailQuestion, match: (p: string) => p.startsWith('/account/letters-explain') },
          { to: '/account/vault', label: t('accountPage.tabs.vault'), icon: Vault, match: (p: string) => p.startsWith('/account/vault') },
        ]
      : []),
    ...(isClient ? [{ to: '/account/referral', label: t('nav.referral'), icon: Gift, match: (p: string) => p.startsWith('/account/referral') }] : []),
    ...(isClient && hasApproved ? [{ to: '/account/arrival', label: t('accountPage.tabs.arrival'), icon: PlaneLanding, match: (p: string) => p.startsWith('/account/arrival') }] : []),
    ...(isClient && hasApproved ? [{ to: '/account/onboarding', label: t('journey.nav.onboarding'), icon: Compass, match: (p: string) => p.startsWith('/account/onboarding') }] : []),
    ...(isClient ? [{ to: '/account/german', label: t('journey.nav.german'), icon: GraduationCap, match: (p: string) => p.startsWith('/account/german') }] : []),
    // Waiting room: "while you wait" lessons and exercises, for clients with an open case.
    ...(isClient && primaryCase && !FINAL.includes(primaryCase.status)
      ? [{ to: '/account/waiting-room', label: t('waitingRoom.nav'), icon: Hourglass, match: (p: string) => p.startsWith('/account/waiting-room') }]
      : []),
    { to: '/account/interviews', label: t('journey.nav.interviews'), icon: Video, match: (p: string) => p.startsWith('/account/interviews') },
    ...(isClient ? [{ to: '/account/interview-prep', label: t('accountPage.tabs.interviewPrep'), icon: MessageCircleQuestion, match: (p: string) => p.startsWith('/account/interview-prep') }] : []),
    ...(signatures?.length
      ? [{ to: '/account/signatures', label: t('esign.portal.title'), icon: FileSignature, badge: toSign, match: (p: string) => p.startsWith('/account/signatures') }]
      : []),
    ...(isClient ? [{ to: '/account/translations', label: t('accountPage.tabs.translations'), icon: Languages, match: (p: string) => p.startsWith('/account/translations') }] : []),
    { to: '/account/notifications', label: t('portal.notifications'), icon: Bell, badge: unread, match: (p: string) => p.startsWith('/account/notifications') },
    { to: '/account/profile', label: t('portal.profile'), icon: UserRound, inBottomNav: true, match: (p: string) => p.startsWith('/account/profile') },
    { to: '/account/privacy', label: t('accountPage.tabs.privacy'), icon: ShieldCheck, match: (p: string) => p.startsWith('/account/privacy') },
  ];

  return (
    <div className="min-h-screen bg-surface pt-24 pb-16 sm:pt-28 sm:pb-24 lg:pt-40">
      <div className="container-x">
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 px-5 pt-6 pb-4 text-white shadow-[0_30px_60px_-30px_rgba(5,15,36,0.8)] sm:px-8 sm:pt-8 sm:pb-5">
          <div className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-[radial-gradient(closest-side,var(--color-brand-500),transparent)] opacity-30" aria-hidden />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-[radial-gradient(closest-side,var(--color-brand-400),transparent)] opacity-15" aria-hidden />
          <svg className="pointer-events-none absolute inset-0 size-full opacity-[0.07]" aria-hidden>
            <defs>
              <pattern id="portal-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M32 0H0v32" fill="none" stroke="#fff" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#portal-grid)" />
          </svg>

          <div className="relative">
            {isClient && (
              <Link
                to="/account/profile"
                className="group float-right ml-4 flex items-center gap-3 rounded-2xl py-1 pr-1 pl-1 transition-colors hover:bg-white/10 sm:pl-3"
                aria-label={`${t('accountPage.header.profile')}: ${completeness.percent}% ${t('accountPage.header.complete')}`}
                data-tour="portal-profile"
              >
                <span className="hidden text-right sm:block">
                  <span className="block text-xs font-semibold text-white/60">{t('accountPage.header.profile')}</span>
                  <span className="block text-sm font-bold whitespace-nowrap text-white">
                    {completeness.percent < 100 ? t('accountPage.header.completeProfile') : `${completeness.percent}% ${t('accountPage.header.complete')}`}
                  </span>
                </span>
                <ProgressRing percent={completeness.percent} size={52} stroke={5} tone="light" />
              </Link>
            )}
            <motion.span
              className="eyebrow text-brand-400"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {t('portal.title')}
            </motion.span>
            <motion.h1
              className="mt-2 text-2xl font-extrabold break-words sm:text-4xl"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
            >
              {t('portal.hello')}, {user?.firstName}
            </motion.h1>
            {user?.email && (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/60">
                <span className="truncate">{user.email}</span>
                {user.birthDate && (
                  <span className="inline-flex items-center gap-1.5">
                    <Cake className="size-3.5" aria-hidden />
                    <span className="sr-only">{t('accountPage.header.birthDate')}: </span>
                    {user.birthDate.split('-').reverse().join('.')}
                  </span>
                )}
                {user.passportNumber && (
                  <span className="inline-flex items-center gap-1.5 font-mono tracking-wide">
                    <BookUser className="size-3.5" aria-hidden />
                    <span className="sr-only">{t('accountPage.header.passport')}: </span>
                    {user.passportNumber}
                  </span>
                )}
                <TourRestartButton tourId={CLIENT_TOUR} className="min-h-8 rounded-lg text-white/70 hover:text-white" />
              </p>
            )}

            <nav
              className="clear-both -mx-5 mt-6 flex snap-x gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:mt-8 sm:px-0 [&::-webkit-scrollbar]:hidden"
              aria-label={t('portal.title')}
            >
              {tabs.map((tab) => {
                const active = tab.match(location.pathname);
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.label}
                    to={tab.to}
                    className={clsx(
                      'relative flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors sm:px-4',
                      active ? 'text-navy-900' : 'text-white/75 hover:bg-white/10 hover:text-white',
                      // Phones: these live in the bottom bar.
                      tab.inBottomNav && 'max-md:hidden',
                    )}
                    aria-current={active ? 'page' : undefined}
                    data-tour={tab.tour}
                  >
                    {active && (
                      <motion.span
                        layoutId="portal-tab"
                        className="absolute inset-0 rounded-xl bg-white shadow-lg"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    <Icon className="relative size-4 shrink-0" aria-hidden />
                    <span className="relative">{tab.label}</span>
                    <AnimatePresence>
                      {!!tab.badge && (
                        <motion.span
                          key="badge"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          className="relative grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] leading-none font-bold text-white"
                          aria-label={`${tab.badge}`}
                        >
                          {tab.badge > 99 ? '99+' : tab.badge}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        <VerifyBanner className="mt-6" />

        <div className="mt-6 lg:mt-8">
          {/* Tab change: mount at once and fade in (CSS, compositor only) instead of waiting for an exit animation. */}
          <div key={location.pathname} className="page-in">
            {outlet}
          </div>
        </div>
      </div>
      {isClient && <AiLauncher />}
      <BottomNavPortal />
      <TourHost />
    </div>
  );
}
