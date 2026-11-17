import { Link, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { BookUser, Cake, House } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/ui/Avatar';
import { toolOfLocation, toolPath, type PortalToolKey } from '@/lib/portalTools';
import { profileCompleteness } from '@/components/portal/profileFields';
import { ProgressRing } from '@/components/portal/ProgressRing';
import { usePortalNav } from '@/components/portal/usePortalNav';
import { ALL_TOOLS_ICON, TOOL_ICON, stageLabel, toolLabel } from '@/components/portal/portalToolMeta';
import { registerCopy } from '@/i18n';
import { pagesAccount } from '@/i18n/pagesAccount';
import { VerifyBanner } from '@/components/auth/VerifyBanner';
import { pagesJobs } from '@/i18n/pagesJobs';
import { pagesJourney } from '@/i18n/pagesJourney';
import { pagesSign } from '@/i18n/pagesSign';
import AiLauncher from '@/components/ai/AiLauncher';
import { BottomNavPortal } from '@/components/nav/BottomNavPortal';
import { CLIENT_TOUR, TourHost, TourRestartButton } from '@/components/onboarding';
import { pagesPortalUx } from '@/i18n/pagesPortalUx';
import { pagesPortalNav } from '@/i18n/pagesPortalNav';
import { pagesWaitingRoom } from '@/i18n/pagesWaitingRoom';
import { pagesPortalStage } from '@/i18n/pagesPortalStage';
import { FamilySwitcher } from '@/components/portal/FamilySwitcher'; // family member cases: "Mən" / spouse / child chips
import { OfflineBadge } from '@/components/offline/OfflineBadge'; // "no internet — offline documents" strip
import { NotificationBell } from '@/components/notifications/center/NotificationCenter'; // header bell: notification center panel
import { PageHelpButton } from '@/components/pageHelp/PageHelpButton'; // page help "?" (what is this page)
import { ApprovedCelebration } from './portal/ApprovedCelebration'; // visa approved: one-time celebration screen

registerCopy(pagesAccount);
registerCopy(pagesSign);
registerCopy(pagesJobs);
registerCopy(pagesJourney);
registerCopy(pagesPortalUx);
registerCopy(pagesPortalNav);
registerCopy(pagesWaitingRoom);
registerCopy(pagesPortalStage);

const Badge = ({ count, label }: { count: number; label: string }) => (
  <AnimatePresence>
    {count > 0 && (
      <motion.span
        key="badge"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0 }}
        className="relative grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] leading-none font-bold text-white"
      >
        <span aria-hidden>{count > 99 ? '99+' : count}</span>
        <span className="sr-only">{label}</span>
      </motion.span>
    )}
  </AnimatePresence>
);

/** One pill of the section bar (desktop) or the sub-tab row. */
const NavPill = ({
  to,
  label,
  icon: Icon,
  active,
  badge,
  badgeLabel,
  tour,
  layoutId,
  small,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge: number;
  badgeLabel: string;
  tour?: string;
  layoutId: string;
  small?: boolean;
}) => (
  <Link
    to={to}
    className={clsx(
      'relative flex shrink-0 snap-start items-center gap-2 font-semibold whitespace-nowrap transition-colors',
      small ? 'min-h-11 rounded-full px-3.5 py-2 text-sm' : 'min-h-12 rounded-t-xl px-3.5 py-3 text-sm sm:px-4',
      active ? 'text-primary' : 'text-muted hover:bg-sunken hover:text-ink',
    )}
    aria-current={active ? 'page' : undefined}
    data-tour={tour}
  >
    {active && (
      <motion.span
        layoutId={layoutId}
        className={small ? 'absolute inset-0 rounded-full border border-line bg-sunken' : 'absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-highlight'}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        aria-hidden
      />
    )}
    <Icon className="relative size-4 shrink-0" aria-hidden />
    <span className="relative">{label}</span>
    <Badge count={badge} label={badgeLabel} />
  </Link>
);

/**
 * Client portal shell, stage-based: the header menu shows Home, the 4–7 tools the server features for the
 * client's stage (GET /api/account/next-step → portal.featured, lib/account/portalStage.ts) and "All tools"
 * (/account/all), where everything else lives. A page outside the stage menu (old link, bookmark) still
 * shows its tab while it is open. Phones: the same menu in the bottom bar (BottomNavPortal), shortened.
 */
export default function AccountLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const outlet = useOutlet();
  const nav = usePortalNav();
  const isClient = user?.role === 'CLIENT';
  const completeness = profileCompleteness(user);

  const here = toolOfLocation(pathname, search);
  const linkCtx = { caseId: nav.caseId, caseCount: nav.caseCount, approvedCaseId: nav.approvedCaseId };
  const featured = nav.featured.filter((k) => toolPath(k, linkCtx));
  // A page the stage does not feature (old link, bookmark, "All tools") still shows its tab while it is open.
  const extra: PortalToolKey | null = here && here !== 'home' && here !== 'all' && !featured.includes(here) ? here : null;
  const menu = extra ? [...featured, extra] : featured;
  const countLabel = (n: number) => t('pux.nav.badge', { count: n });

  return (
    <div className="min-h-screen bg-canvas pt-24 pb-36 sm:pt-28 sm:pb-24 lg:pt-40">
      <div className="container-x">
        <header className="vt-portal-header relative rounded-3xl border border-line bg-card px-5 pt-6 pb-2 shadow-[var(--tv-shadow-card)] sm:px-8 sm:pt-7 md:pb-0">
          <div>
            {isClient && (
              <Link
                to="/account/profile"
                className="group float-right ml-4 flex min-h-11 items-center gap-3 rounded-2xl py-1 pr-1 pl-1 transition-colors hover:bg-sunken sm:pl-3"
                aria-label={`${t('accountPage.header.profile')}: ${completeness.percent}% ${t('accountPage.header.complete')}`}
                data-tour="portal-profile"
              >
                <span className="hidden text-right sm:block">
                  <span className="block text-xs font-semibold text-muted">{t('accountPage.header.profile')}</span>
                  <span className="block text-sm font-semibold whitespace-nowrap text-ink">
                    {completeness.percent < 100 ? t('accountPage.header.completeProfile') : `${completeness.percent}% ${t('accountPage.header.complete')}`}
                  </span>
                </span>
                {user && <Avatar name={`${user.firstName ?? ''} ${user.lastName ?? ''}`} size="lg" className="hidden sm:inline-flex" />}
                <ProgressRing percent={completeness.percent} size={52} stroke={5} />
              </Link>
            )}
            {/* Notification center bell (left of the profile ring; settings live in the profile). */}
            {isClient && (
              <div className="float-right ml-1 py-1.5">
                <NotificationBell allTo="/account/notifications" prefsTo="/account/profile" />
              </div>
            )}
            {/* Page help "?" for the open portal page (lib/pageHelp; nothing on pages without a text). */}
            <div className="float-right ml-1 py-1.5">
              <PageHelpButton />
            </div>
            <motion.span className="type-overline inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <span className="size-1.5 rounded-full bg-highlight" aria-hidden />
              <span className="whitespace-nowrap">{t('portal.title')}</span>
              {isClient && nav.overview && <span className="font-semibold normal-case"> · {nav.portalStage ? stageLabel(t, nav.portalStage) : t(`pnav.stage.${nav.stage}`)}</span>}
            </motion.span>
            <motion.h1
              className="type-page-title mt-2 break-words text-ink"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
            >
              {t('portal.hello')}, {user?.firstName}
            </motion.h1>
            {user?.email && (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <span className="min-w-0 truncate">{user.email}</span>
                {user.birthDate && (
                  <span className="hidden items-center gap-1.5 sm:inline-flex">
                    <Cake className="size-3.5" aria-hidden />
                    <span className="sr-only">{t('accountPage.header.birthDate')}: </span>
                    {user.birthDate.split('-').reverse().join('.')}
                  </span>
                )}
                {user.passportNumber && (
                  <span className="hidden items-center gap-1.5 font-mono tracking-wide sm:inline-flex">
                    <BookUser className="size-3.5" aria-hidden />
                    <span className="sr-only">{t('accountPage.header.passport')}: </span>
                    {user.passportNumber}
                  </span>
                )}
                <TourRestartButton tourId={CLIENT_TOUR} className="min-h-11 rounded-lg text-muted hover:text-ink sm:min-h-8" />
              </p>
            )}

            {isClient && <FamilySwitcher className="clear-both mt-4" />}

            {/* Stage menu: tablet / desktop (phones: bottom bar). */}
            <nav
              className="clear-both -mx-2 mt-6 hidden snap-x gap-1 overflow-x-auto border-t border-line pt-1 [scrollbar-width:none] sm:mt-7 md:flex [&::-webkit-scrollbar]:hidden"
              aria-label={t('pstage.nav.label')}
              data-tour="portal-stage-nav"
            >
              <NavPill
                to="/account"
                label={t('pstage.nav.home')}
                icon={House}
                active={here === 'home'}
                badge={nav.badges.actions}
                badgeLabel={countLabel(nav.badges.actions)}
                tour="portal-tab-home"
                layoutId="portal-section"
              />
              {menu.map((k) => (
                <NavPill
                  key={k}
                  to={toolPath(k, linkCtx) ?? `${pathname}${search}`}
                  label={toolLabel(t, k)}
                  icon={TOOL_ICON[k]}
                  active={k === here}
                  badge={nav.toolBadges(k)}
                  badgeLabel={countLabel(nav.toolBadges(k))}
                  tour={`portal-tool-${k}`}
                  layoutId="portal-section"
                />
              ))}
              <NavPill
                to="/account/all"
                label={t('pstage.nav.all')}
                icon={ALL_TOOLS_ICON}
                active={here === 'all'}
                badge={nav.allBadge}
                badgeLabel={t('pstage.nav.allBadge', { count: nav.allBadge })}
                tour="portal-all"
                layoutId="portal-section"
              />
            </nav>
            <div className="clear-both h-2 md:hidden" aria-hidden />
          </div>
        </header>

        <VerifyBanner className="mt-6" />
        {isClient && <OfflineBadge className="mt-4" />}

        <div className="mt-6 lg:mt-8">
          {/* Tab change: mount at once and fade in (CSS, compositor only) instead of waiting for an exit animation. */}
          <div key={pathname} className="page-in">
            {outlet}
          </div>
        </div>
      </div>
      {isClient && <AiLauncher />}
      {isClient && <ApprovedCelebration />}
      <BottomNavPortal />
      <TourHost helpTour={CLIENT_TOUR} />
    </div>
  );
}
