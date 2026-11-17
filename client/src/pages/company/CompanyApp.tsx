import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Briefcase, Building2, ClipboardList, Clock3, FileSignature, FileText, Handshake, LayoutDashboard, Package, ShieldAlert, ShieldCheck, Users, Video, Workflow } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesJobs } from '@/i18n/pagesJobs';
import { pagesSign } from '@/i18n/pagesSign';
import { useJobLabels } from '@/components/jobs/labels';
import { COMPANY_STATUS_TONE } from '@/components/jobs/types';
import { CompanyInvoices } from '@/components/company/CompanyInvoices';
import { CompanyQuotes } from '@/components/company/CompanyQuotes';
import { pagesQuotes } from '@/i18n/pagesQuotes';
import { CompanyDashboard } from '@/components/company/CompanyDashboard';
import { CompanyVacancies, CompanyVacancyEditor } from '@/components/company/CompanyVacancies';
import { CompanyCandidatesArea } from '@/components/pool/CompanyPool'; // proposed candidates + anonymous candidate pool
import { CompanyWorkers } from '@/components/company/CompanyWorkers';
import { CompanyProfile } from '@/components/company/CompanyProfile';
import { CompanyInterviews } from '@/components/company/Interviews';
import { Loading, Section, useCompany } from '@/components/company/shared';
import { CompanyContracts } from '@/components/company/CompanyContracts';
import { CompanyForms } from '@/components/company/CompanyForms'; // official forms to complete + sign (Erklärung zum Beschäftigungsverhältnis)
import { pagesOfficialForms } from '@/i18n/pagesOfficialForms';
import { CompanyAvv, useCompanyAvv } from '@/components/company/CompanyAvv'; // AVV (Art. 28 DSGVO): shown once the owner approved the template
import { pagesAvv } from '@/i18n/pagesAvv';
import { CompanyRequests } from '@/components/requests/CompanyRequests';
import { pagesRequests } from '@/i18n/pagesRequests';
import { PortalNotificationBell, PortalNotificationsPage } from '@/components/notifications/PortalNotifications';
import { CompanyLogo } from '@/components/jobs/CompanyLogo';
import { CompanyPipeline } from '@/components/pipeline/CompanyPipeline'; // candidate pipeline: board / list / arrivals strip (live)
import { CompanyConfigurator } from '@/components/configurator/CompanyConfigurator'; // package configurator → offer request
import { pagesEmployerPipeline } from '@/i18n/pagesEmployerPipeline';
import { pagesConfigurator } from '@/i18n/pagesConfigurator';
import { CompanyNovruzCard } from '@/components/novruz/CompanyNovruzCard'; // Novruz greeting cards for the own workers
import { CompanyGate, useCompanyAccess, type CompanyPerm } from '@/components/company/access'; // employer roles (menu + page gates; the server enforces)

registerCopy(pagesJobs);
registerCopy(pagesSign);
registerCopy(pagesRequests);
registerCopy(pagesQuotes);
registerCopy(pagesOfficialForms);
registerCopy(pagesAvv);
registerCopy(pagesEmployerPipeline);
registerCopy(pagesConfigurator);

/** Employer portal, mounted at /company/* behind RequireAuth roles=['COMPANY']. */
export default function CompanyApp() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const L = useJobLabels();
  const { data: company, isLoading, isError, refetch } = useCompany();
  const avv = useCompanyAvv(); // 404 until the AVV template is approved → no tab
  const access = useCompanyAccess();
  usePageTitle(t('jobsArea.portal.title'));

  type Tab = { to: string; label: string; icon: typeof Briefcase; match: (p: string) => boolean; all?: CompanyPerm[]; any?: CompanyPerm[] };
  const allTabs: Tab[] = [
    { to: '/company', label: t('jobsArea.portal.nav.dashboard'), icon: LayoutDashboard, match: (p: string) => p === '/company' || p === '/company/' },
    { to: '/company/vacancies', label: t('jobsArea.portal.nav.vacancies'), icon: Briefcase, match: (p: string) => p.startsWith('/company/vacancies') },
    { to: '/company/candidates', label: t('jobsArea.portal.nav.candidates'), icon: Users, match: (p: string) => p.startsWith('/company/candidates'), all: ['viewCandidatePool'] },
    { to: '/company/requests', label: t('requests.nav'), icon: ClipboardList, match: (p: string) => p.startsWith('/company/requests'), any: ['viewPipeline', 'createRequests'] },
    { to: '/company/pipeline', label: t('employerPipeline.nav'), icon: Workflow, match: (p: string) => p.startsWith('/company/pipeline'), all: ['viewPipeline'] },
    { to: '/company/workers', label: t('jobsArea.portal.nav.workers'), icon: Handshake, match: (p: string) => p.startsWith('/company/workers') || p.startsWith('/company/novruz-card'), all: ['viewWorkers'] },
    { to: '/company/interviews', label: t('ops.company.title'), icon: Video, match: (p: string) => p.startsWith('/company/interviews') },
    { to: '/company/contracts', label: t('esign.portal.companyTitle'), icon: FileSignature, match: (p: string) => p.startsWith('/company/contracts'), any: ['viewContracts', 'signEzb', 'signAvv'] },
    { to: '/company/forms', label: t('officialForms.company.nav'), icon: FileText, match: (p: string) => p.startsWith('/company/forms'), all: ['fillEzb', 'viewSalaries'] },
    ...(avv.isSuccess ? [{ to: '/company/avv', label: t('avv.nav'), icon: ShieldCheck, match: (p: string) => p.startsWith('/company/avv'), any: ['signAvv', 'viewContracts'] as CompanyPerm[] }] : []),
    { to: '/company/configurator', label: t('packageConfigurator.nav'), icon: Package, match: (p: string) => p.startsWith('/company/configurator'), all: ['manageBilling'] },
    { to: '/company/quotes', label: t('companyQuotes.nav'), icon: FileSignature, match: (p: string) => p.startsWith('/company/quotes'), all: ['viewInvoices'] },
    { to: '/company/invoices', label: t('jobsArea.portal.nav.invoices'), icon: FileText, match: (p: string) => p.startsWith('/company/invoices'), all: ['viewInvoices'] },
    { to: '/company/profile', label: t('jobsArea.portal.nav.profile'), icon: Building2, match: (p: string) => p.startsWith('/company/profile') },
  ];
  const tabs = allTabs.filter((tab) => access.can(...(tab.all ?? [])) && (!tab.any || access.canAny(...tab.any)));

  const suspended = company?.status === 'SUSPENDED';

  return (
    <div className="min-h-screen bg-canvas pt-24 pb-16 sm:pt-28 sm:pb-24 lg:pt-36">
      <div className="container-x">
        <header className="rounded-3xl border border-line bg-card px-4 pt-5 pb-3 shadow-[var(--tv-shadow-card)] sm:px-7 sm:pt-6 sm:pb-4">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-4">
                {company?.logo && <CompanyLogo logo={company.logo} name={company.name} className="mt-1 size-14 sm:size-16" />}
                <div className="min-w-0">
                  <span className="type-overline">{t('jobsArea.portal.title')}</span>
                  <motion.h1
                    className="type-page-title mt-1 break-words"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    {company?.name ?? ' '}
                  </motion.h1>
                  <p className="mt-1 truncate text-sm text-muted">
                    {t('jobsArea.portal.hello', { name: user?.firstName ?? '' })} · {user?.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {company && <span className={clsx('badge', COMPANY_STATUS_TONE[company.status])}>{L.companyStatus(company.status)}</span>}
                {company && <PortalNotificationBell allTo="/company/notifications" />}
              </div>
            </div>

            {!suspended && (
              <nav
                className="-mx-4 mt-5 flex snap-x gap-1 overflow-x-auto border-t border-line px-3 pt-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:mt-6 sm:px-0 [&::-webkit-scrollbar]:hidden"
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
                        active ? 'text-primary-contrast' : 'text-muted hover:bg-sunken hover:text-ink',
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      {active && (
                        <motion.span layoutId="company-tab" className="absolute inset-0 rounded-xl bg-primary" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
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
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-danger-bg text-danger-fg">
                  <ShieldAlert className="size-6" aria-hidden />
                </span>
                <div>
                  <p className="type-section-title text-ink">{t('jobsArea.portal.suspendedTitle')}</p>
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
                <div className="flex items-start gap-4 rounded-2xl border border-warning-border bg-warning-bg p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card text-warning-fg">
                    <Clock3 className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold text-warning-fg">{t('jobsArea.portal.pendingTitle')}</p>
                    <p className="mt-1 text-sm text-warning-fg">{t('jobsArea.portal.pendingText')}</p>
                  </div>
                </div>
              )}
              <Routes>
                <Route index element={<CompanyDashboard />} />
                <Route path="vacancies" element={<CompanyVacancies company={company} />} />
                <Route path="vacancies/new" element={<CompanyGate all={['manageVacancies']}><CompanyVacancyEditor company={company} /></CompanyGate>} />
                <Route path="vacancies/:id" element={<CompanyVacancyEditor company={company} />} />
                <Route path="candidates/*" element={<CompanyGate all={['viewCandidatePool']}><CompanyCandidatesArea /></CompanyGate>} />
                <Route path="requests/*" element={<CompanyGate any={['viewPipeline', 'createRequests']}><CompanyRequests /></CompanyGate>} />
                <Route path="pipeline" element={<CompanyGate all={['viewPipeline']}><CompanyPipeline /></CompanyGate>} />
                <Route path="workers" element={<CompanyGate all={['viewWorkers']}><CompanyWorkers /></CompanyGate>} />
                <Route path="novruz-card" element={<CompanyGate all={['viewWorkers']}><CompanyNovruzCard /></CompanyGate>} />
                <Route path="interviews" element={<CompanyInterviews />} />
                <Route path="contracts" element={<CompanyGate any={['viewContracts', 'signEzb', 'signAvv']}><CompanyContracts /></CompanyGate>} />
                <Route path="contracts/:signerId" element={<CompanyGate any={['viewContracts', 'signEzb', 'signAvv']}><CompanyContracts /></CompanyGate>} />
                <Route path="forms" element={<CompanyGate all={['fillEzb', 'viewSalaries']}><CompanyForms /></CompanyGate>} />
                <Route path="forms/:id" element={<CompanyGate all={['fillEzb', 'viewSalaries']}><CompanyForms /></CompanyGate>} />
                <Route path="avv" element={<CompanyGate any={['signAvv', 'viewContracts']}><CompanyAvv /></CompanyGate>} />
                <Route path="configurator" element={<CompanyGate all={['manageBilling']}><CompanyConfigurator /></CompanyGate>} />
                <Route path="quotes" element={<CompanyGate all={['viewInvoices']}><CompanyQuotes /></CompanyGate>} />
                <Route path="quotes/:id" element={<CompanyGate all={['viewInvoices']}><CompanyQuotes /></CompanyGate>} />
                <Route path="invoices" element={<CompanyGate all={['viewInvoices']}><CompanyInvoices /></CompanyGate>} />
                <Route path="notifications" element={<PortalNotificationsPage />} />
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
