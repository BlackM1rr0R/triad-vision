import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowUpRight, CircleUser, Coins, FolderOpen, LayoutDashboard, LogOut, PauseCircle, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPartnerPortal } from '@/i18n/pagesPartnerPortal';
import { pagesCaseProcessing } from '@/i18n/pagesCaseProcessing'; // visa kind filter + "rədd" KPI
import { pagesPartnerClients } from '@/i18n/pagesPartnerClients'; // own clients, sign-up link
import { usePartnerMe } from '@/components/partnerPortal/api';
import { ErrorRetry, Loading } from '@/components/partnerPortal/ui';
import PartnerDashboardPage from './Dashboard';
import PartnerClientsPage from './Clients';
import PartnerClientDetailPage from './ClientDetail';
import PartnerCommissionsPage from './Commissions';
import PartnerProfilePage from './Profile';
import PartnerPeoplePage from './People';

registerCopy(pagesPartnerPortal);
registerCopy(pagesCaseProcessing);
registerCopy(pagesPartnerClients);

/**
 * Referral-partner portal, mounted at /partner/* behind RequireAuth roles=['AGENT']. Only logins linked to a
 * ReferralPartner may use it; an AGENT without that link is sent to the agent portal (which handles the rest).
 */
export default function PartnerApp() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me, isLoading, isError, error, refetch } = usePartnerMe();
  usePageTitle(t('partnerPortal.title'));

  if (isError && errorCode(error) === 'NO_PARTNER_PROFILE') return <Navigate to="/agent" replace />;

  const tabs = [
    { to: '/partner', label: t('partnerPortal.nav.dashboard'), icon: LayoutDashboard, match: (p: string) => p === '/partner' || p === '/partner/' },
    { to: '/partner/people', label: t('partnerClients.nav'), icon: Users, match: (p: string) => p.startsWith('/partner/people') },
    { to: '/partner/clients', label: t('partnerPortal.nav.clients'), icon: FolderOpen, match: (p: string) => p.startsWith('/partner/clients') },
    { to: '/partner/commissions', label: t('partnerPortal.nav.commissions'), icon: Coins, match: (p: string) => p.startsWith('/partner/commissions') },
    { to: '/partner/profile', label: t('partnerPortal.nav.profile'), icon: CircleUser, match: (p: string) => p.startsWith('/partner/profile') },
  ];

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-canvas pt-24 pb-16 sm:pt-28 sm:pb-24 lg:pt-36">
      <div className="container-x">
        <header className="rounded-3xl border border-line bg-card px-4 pt-5 pb-3 shadow-[var(--tv-shadow-card)] sm:px-7 sm:pt-6 sm:pb-4">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="type-overline">{t('partnerPortal.title')}</span>
                <motion.h1 className="type-page-title mt-1 break-words" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                  {t('partnerPortal.hello', { name: user?.firstName ?? '' })}
                </motion.h1>
                <p className="mt-1 truncate text-sm text-muted">
                  {me ? `${me.partner.name} · ` : ''}
                  {user?.email}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {me?.alsoAgent && (
                  <Link to="/agent" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line-strong px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-sunken">
                    {t('partnerPortal.agentPortal')} <ArrowUpRight className="size-4" aria-hidden />
                  </Link>
                )}
                <button type="button" onClick={onLogout} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-muted transition-colors hover:bg-sunken hover:text-ink">
                  <LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline">{t('partnerPortal.logout')}</span>
                </button>
              </div>
            </div>

            <nav className="-mx-4 mt-5 flex snap-x gap-1 overflow-x-auto border-t border-line px-3 pt-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:mt-6 sm:px-0 [&::-webkit-scrollbar]:hidden" aria-label={t('partnerPortal.title')}>
              {tabs.map((tab) => {
                const active = tab.match(location.pathname);
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    className={clsx(
                      'relative flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors sm:px-4',
                      active ? 'text-primary-contrast' : 'text-muted hover:bg-sunken hover:text-ink',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    {active && <motion.span layoutId="partner-tab" className="absolute inset-0 rounded-xl bg-primary" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                    <Icon className="relative size-4 shrink-0" aria-hidden />
                    <span className="relative">{tab.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        <div className="mt-6 space-y-6 lg:mt-8">
          {isLoading ? (
            <Loading />
          ) : isError || !me ? (
            <ErrorRetry onRetry={() => refetch()} />
          ) : (
            <>
              {!me.partner.active && (
                <div className="flex items-start gap-4 rounded-2xl border border-warning-border bg-warning-bg p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card text-warning-fg">
                    <PauseCircle className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold text-warning-fg">{t('partnerPortal.inactiveTitle')}</p>
                    <p className="mt-1 text-sm text-warning-fg">{t('partnerPortal.inactiveText')}</p>
                  </div>
                </div>
              )}
              <Routes>
                <Route index element={<PartnerDashboardPage me={me} />} />
                <Route path="people" element={<PartnerPeoplePage me={me} />} />
                <Route path="clients" element={<PartnerClientsPage />} />
                <Route path="clients/:id" element={<PartnerClientDetailPage />} />
                <Route path="commissions" element={<PartnerCommissionsPage />} />
                <Route path="profile" element={<PartnerProfilePage me={me} />} />
                <Route path="*" element={<Navigate to="/partner" replace />} />
              </Routes>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
