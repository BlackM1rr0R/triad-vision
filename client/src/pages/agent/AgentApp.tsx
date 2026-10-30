import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { CircleUser, Coins, LayoutDashboard, LogOut, PauseCircle, ShieldAlert, UserPlus, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesAgents } from '@/i18n/pagesAgents';
import { ErrorRetry, Loading, Section, useAgentMe } from '@/components/agents/portal';
import { errorCode } from '@/lib/api';
import { usePartnerMe } from '@/components/partnerPortal/api';
import AgentDashboardPage from './Dashboard';
import AgentReferralsPage from './Referrals';
import AgentEarningsPage from './Earnings';
import AgentProfilePage from './Profile';
import AgentLeadsPage from './Leads'; // "Yeni müştəri" form + my leads
import { PortalNotificationBell, PortalNotificationsPage } from '@/components/notifications/PortalNotifications';

registerCopy(pagesAgents);

/** Agent (partner) portal, mounted at /agent/* behind RequireAuth roles=['AGENT']. */
export default function AgentApp() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me, isLoading, isError, error, refetch } = useAgentMe();
  usePageTitle(t('agents.portal.title'));
  // A referral partner's login without an Agent row belongs in the partner portal.
  const noAgent = isError && errorCode(error) === 'NO_AGENT_PROFILE';
  const partnerMe = usePartnerMe(noAgent);
  if (noAgent && partnerMe.data) return <Navigate to="/partner" replace />;

  const tabs = [
    { to: '/agent', label: t('agents.portal.nav.dashboard'), icon: LayoutDashboard, match: (p: string) => p === '/agent' || p === '/agent/' },
    { to: '/agent/referrals', label: t('agents.portal.nav.referrals'), icon: Users, match: (p: string) => p.startsWith('/agent/referrals') },
    { to: '/agent/leads', label: t('px.leads.nav'), icon: UserPlus, match: (p: string) => p.startsWith('/agent/leads') },
    { to: '/agent/earnings', label: t('agents.portal.nav.earnings'), icon: Coins, match: (p: string) => p.startsWith('/agent/earnings') },
    { to: '/agent/profile', label: t('agents.portal.nav.profile'), icon: CircleUser, match: (p: string) => p.startsWith('/agent/profile') },
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
                <span className="type-overline">{t('agents.portal.title')}</span>
                <motion.h1 className="type-page-title mt-1 break-words" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                  {t('agents.portal.hello', { name: user?.firstName ?? '' })}
                </motion.h1>
                <p className="mt-1 truncate text-sm text-muted">
                  {me ? `${me.agent.code} · ` : ''}
                  {user?.email}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {me && (
                  <span className={clsx('badge mt-1', me.agent.status === 'ACTIVE' ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg')}>
                    {t(`agents.agentStatus.${me.agent.status}`)}
                  </span>
                )}
                {me && <PortalNotificationBell allTo="/agent/notifications" />}
                <button type="button" onClick={onLogout} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-muted transition-colors hover:bg-sunken hover:text-ink">
                  <LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline">{t('agents.portal.logout')}</span>
                </button>
              </div>
            </div>

            <nav className="-mx-4 mt-5 flex snap-x gap-1 overflow-x-auto border-t border-line px-3 pt-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:mt-6 sm:px-0 [&::-webkit-scrollbar]:hidden" aria-label={t('agents.portal.title')}>
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
                    {active && <motion.span layoutId="agent-tab" className="absolute inset-0 rounded-xl bg-primary" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                    <Icon className="relative size-4 shrink-0" aria-hidden />
                    <span className="relative">{tab.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        <div className="mt-6 space-y-6 lg:mt-8">
          {isLoading || (noAgent && partnerMe.isLoading) ? (
            <Loading />
          ) : isError || !me ? (
            errorCode(error) === 'NO_AGENT_PROFILE' ? (
              <Section>
                <div className="flex items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-danger-bg text-danger-fg">
                    <ShieldAlert className="size-6" aria-hidden />
                  </span>
                  <p className="text-sm text-muted">{t('agents.portal.noProfile')}</p>
                </div>
              </Section>
            ) : (
              <ErrorRetry onRetry={() => refetch()} />
            )
          ) : (
            <>
              {me.agent.status === 'PAUSED' && (
                <div className="flex items-start gap-4 rounded-2xl border border-warning-border bg-warning-bg p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card text-warning-fg">
                    <PauseCircle className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold text-warning-fg">{t('agents.portal.pausedTitle')}</p>
                    <p className="mt-1 text-sm text-warning-fg">{t('agents.portal.pausedText')}</p>
                  </div>
                </div>
              )}
              <Routes>
                <Route index element={<AgentDashboardPage me={me} />} />
                <Route path="referrals" element={<AgentReferralsPage />} />
                <Route path="earnings" element={<AgentEarningsPage />} />
                <Route path="leads" element={<AgentLeadsPage me={me} />} />
                <Route path="notifications" element={<PortalNotificationsPage />} />
                <Route path="profile" element={<AgentProfilePage me={me} />} />
                <Route path="*" element={<Navigate to="/agent" replace />} />
              </Routes>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
