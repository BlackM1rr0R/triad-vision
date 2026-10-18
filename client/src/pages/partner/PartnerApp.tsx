import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowUpRight, CircleUser, Coins, LayoutDashboard, LogOut, PauseCircle, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPartnerPortal } from '@/i18n/pagesPartnerPortal';
import { usePartnerMe } from '@/components/partnerPortal/api';
import { ErrorRetry, Loading } from '@/components/partnerPortal/ui';
import PartnerDashboardPage from './Dashboard';
import PartnerClientsPage from './Clients';
import PartnerClientDetailPage from './ClientDetail';
import PartnerCommissionsPage from './Commissions';
import PartnerProfilePage from './Profile';

registerCopy(pagesPartnerPortal);

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
    { to: '/partner/clients', label: t('partnerPortal.nav.clients'), icon: Users, match: (p: string) => p.startsWith('/partner/clients') },
    { to: '/partner/commissions', label: t('partnerPortal.nav.commissions'), icon: Coins, match: (p: string) => p.startsWith('/partner/commissions') },
    { to: '/partner/profile', label: t('partnerPortal.nav.profile'), icon: CircleUser, match: (p: string) => p.startsWith('/partner/profile') },
  ];

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-surface pt-24 pb-16 sm:pt-28 sm:pb-24 lg:pt-40">
      <div className="container-x">
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 px-5 pt-6 pb-4 text-white shadow-[0_30px_60px_-30px_rgba(5,15,36,0.8)] sm:px-8 sm:pt-8 sm:pb-5">
          <div className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-[radial-gradient(closest-side,var(--color-brand-500),transparent)] opacity-30" aria-hidden />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="eyebrow text-brand-400">{t('partnerPortal.title')}</span>
                <motion.h1 className="mt-2 text-2xl font-extrabold break-words sm:text-4xl" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                  {t('partnerPortal.hello', { name: user?.firstName ?? '' })}
                </motion.h1>
                <p className="mt-1 truncate text-sm text-white/60">
                  {me ? `${me.partner.name} · ` : ''}
                  {user?.email}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {me?.alsoAgent && (
                  <Link to="/agent" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/20 px-3 text-sm font-semibold text-white/85 hover:bg-white/10 hover:text-white">
                    {t('partnerPortal.agentPortal')} <ArrowUpRight className="size-4" aria-hidden />
                  </Link>
                )}
                <button type="button" onClick={onLogout} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white">
                  <LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline">{t('partnerPortal.logout')}</span>
                </button>
              </div>
            </div>

            <nav className="-mx-5 mt-6 flex snap-x gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:mt-8 sm:px-0 [&::-webkit-scrollbar]:hidden" aria-label={t('partnerPortal.title')}>
              {tabs.map((tab) => {
                const active = tab.match(location.pathname);
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    className={clsx(
                      'relative flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors sm:px-4',
                      active ? 'text-navy-900' : 'text-white/75 hover:bg-white/10 hover:text-white',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    {active && <motion.span layoutId="partner-tab" className="absolute inset-0 rounded-xl bg-white shadow-lg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
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
                <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
                    <PauseCircle className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-bold text-amber-900">{t('partnerPortal.inactiveTitle')}</p>
                    <p className="mt-1 text-sm text-amber-900/80">{t('partnerPortal.inactiveText')}</p>
                  </div>
                </div>
              )}
              <Routes>
                <Route index element={<PartnerDashboardPage me={me} />} />
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
