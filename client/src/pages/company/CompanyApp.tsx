import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Briefcase, Building2, Clock3, FileText, Handshake, LayoutDashboard, ShieldAlert, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesJobs } from '@/i18n/pagesJobs';
import { useJobLabels } from '@/components/jobs/labels';
import { COMPANY_STATUS_TONE } from '@/components/jobs/types';
import { CompanyInvoices } from '@/components/company/CompanyInvoices';
import { CompanyDashboard } from '@/components/company/CompanyDashboard';
import { CompanyVacancies, CompanyVacancyEditor } from '@/components/company/CompanyVacancies';
import { CompanyCandidates } from '@/components/company/CompanyCandidates';
import { CompanyWorkers } from '@/components/company/CompanyWorkers';
import { CompanyProfile } from '@/components/company/CompanyProfile';
import { Loading, Section, useCompany } from '@/components/company/shared';

registerCopy(pagesJobs);

/** Employer portal, mounted at /company/* behind RequireAuth roles=['COMPANY']. */
export default function CompanyApp() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const L = useJobLabels();
  const { data: company, isLoading, isError, refetch } = useCompany();
  usePageTitle(t('jobsArea.portal.title'));

  const tabs = [
    { to: '/company', label: t('jobsArea.portal.nav.dashboard'), icon: LayoutDashboard, match: (p: string) => p === '/company' || p === '/company/' },
    { to: '/company/vacancies', label: t('jobsArea.portal.nav.vacancies'), icon: Briefcase, match: (p: string) => p.startsWith('/company/vacancies') },
    { to: '/company/candidates', label: t('jobsArea.portal.nav.candidates'), icon: Users, match: (p: string) => p.startsWith('/company/candidates') },
    { to: '/company/workers', label: t('jobsArea.portal.nav.workers'), icon: Handshake, match: (p: string) => p.startsWith('/company/workers') },
    { to: '/company/invoices', label: t('jobsArea.portal.nav.invoices'), icon: FileText, match: (p: string) => p.startsWith('/company/invoices') },
    { to: '/company/profile', label: t('jobsArea.portal.nav.profile'), icon: Building2, match: (p: string) => p.startsWith('/company/profile') },
  ];

  const suspended = company?.status === 'SUSPENDED';

  return (
    <div className="min-h-screen bg-surface pt-24 pb-16 sm:pt-28 sm:pb-24 lg:pt-40">
      <div className="container-x">
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 px-5 pt-6 pb-4 text-white shadow-[0_30px_60px_-30px_rgba(5,15,36,0.8)] sm:px-8 sm:pt-8 sm:pb-5">
          <div className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-[radial-gradient(closest-side,var(--color-brand-500),transparent)] opacity-30" aria-hidden />
          <svg className="pointer-events-none absolute inset-0 size-full opacity-[0.07]" aria-hidden>
            <defs>
              <pattern id="company-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M32 0H0v32" fill="none" stroke="#fff" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#company-grid)" />
          </svg>
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="eyebrow text-brand-400">{t('jobsArea.portal.title')}</span>
                <motion.h1
                  className="mt-2 text-2xl font-extrabold break-words sm:text-4xl"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  {company?.name ?? ' '}
                </motion.h1>
                <p className="mt-1 truncate text-sm text-white/60">
                  {t('jobsArea.portal.hello', { name: user?.firstName ?? '' })} · {user?.email}
                </p>
              </div>
              {company && <span className={clsx('badge mt-1', COMPANY_STATUS_TONE[company.status])}>{L.companyStatus(company.status)}</span>}
            </div>

            {!suspended && (
              <nav
                className="-mx-5 mt-6 flex snap-x gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:mt-8 sm:px-0 [&::-webkit-scrollbar]:hidden"
                aria-label={t('jobsArea.portal.title')}
              >
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
                      {active && (
                        <motion.span layoutId="company-tab" className="absolute inset-0 rounded-xl bg-white shadow-lg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                      )}
                      <Icon className="relative size-4 shrink-0" aria-hidden />
                      <span className="relative">{tab.label}</span>
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>
        </header>

        <div className="mt-6 space-y-6 lg:mt-8">
          {isLoading ? (
            <Loading />
          ) : isError || !company ? (
            <Section>
              <p className="text-sm text-muted">{t('jobsArea.errors.generic')}</p>
              <button type="button" className="btn-ghost btn-sm mt-4" onClick={() => refetch()}>
                {t('jobsArea.common.retry')}
              </button>
            </Section>
          ) : suspended ? (
            <Section>
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-red-100 text-red-700">
                  <ShieldAlert className="size-6" aria-hidden />
                </span>
                <div>
                  <p className="font-display text-lg font-bold text-navy-900">{t('jobsArea.portal.suspendedTitle')}</p>
                  <p className="mt-1 text-sm text-muted">{t('jobsArea.portal.suspendedText')}</p>
                  <Link to="/contact" className="btn-primary btn-sm mt-4">
                    {t('jobsArea.portal.contactUs')}
                  </Link>
                </div>
              </div>
            </Section>
          ) : (
            <>
              {company.status === 'PENDING' && (
                <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
                    <Clock3 className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-bold text-amber-900">{t('jobsArea.portal.pendingTitle')}</p>
                    <p className="mt-1 text-sm text-amber-900/80">{t('jobsArea.portal.pendingText')}</p>
                  </div>
                </div>
              )}
              <Routes>
                <Route index element={<CompanyDashboard />} />
                <Route path="vacancies" element={<CompanyVacancies company={company} />} />
                <Route path="vacancies/new" element={<CompanyVacancyEditor company={company} />} />
                <Route path="vacancies/:id" element={<CompanyVacancyEditor company={company} />} />
                <Route path="candidates" element={<CompanyCandidates />} />
                <Route path="workers" element={<CompanyWorkers />} />
                <Route path="invoices" element={<CompanyInvoices />} />
                <Route path="profile" element={<CompanyProfile company={company} />} />
                <Route path="*" element={<Navigate to="/company" replace />} />
              </Routes>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
