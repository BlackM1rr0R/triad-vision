import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RequireAuth, useAuth } from './lib/auth';
import { whenIdle } from './lib/idle';
import { PageLoader } from './components/ui/Spinner';
import { SiteLayout } from './components/layout/SiteLayout';
import { getImpersonation, subscribeImpersonation } from './lib/api';
import { splitLocalePath } from './lib/siteLocale';

// "View as client" bar: its chunk (and copy) loads only while an admin is actually viewing a portal.
const ImpersonationBanner = lazy(() => import('./components/privacyTools/ImpersonationBanner').then((m) => ({ default: m.ImpersonationBanner })));
const ImpersonationGate = () => {
  const active = useSyncExternalStore(subscribeImpersonation, getImpersonation, getImpersonation) !== null;
  return active ? (
    <Suspense fallback={null}>
      <ImpersonationBanner />
    </Suspense>
  ) : null;
};

// Re-acceptance of updated legal texts: own chunk, fetched only for signed-in users.
const LegalGate = lazy(() => import('./components/legal/LegalGate'));
const LegalGateHost = () => {
  const { user } = useAuth();
  return user ? (
    <Suspense fallback={null}>
      <LegalGate />
    </Suspense>
  ) : null;
};

const Home = lazy(() => import('./pages/Home'));
const About = lazy(() => import('./pages/About'));
const Services = lazy(() => import('./pages/Services'));
const ServiceDetail = lazy(() => import('./pages/ServiceDetail'));
const Eligibility = lazy(() => import('./pages/Eligibility'));
const EligibilityQuiz = lazy(() => import('./pages/EligibilityQuiz'));
const Visas = lazy(() => import('./pages/Visas'));
const VisaDetail = lazy(() => import('./pages/VisaDetail'));
const Partners = lazy(() => import('./pages/Partners'));
const Stories = lazy(() => import('./pages/Stories'));
const Ausbildung = lazy(() => import('./pages/Ausbildung'));
const FaqPage = lazy(() => import('./pages/FaqPage'));
const News = lazy(() => import('./pages/News'));
const NewsDetail = lazy(() => import('./pages/NewsDetail'));
const Contact = lazy(() => import('./pages/Contact'));
const Cooperation = lazy(() => import('./pages/Cooperation'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AccessibilityPage = lazy(() => import('./pages/Accessibility'));

const AccountLayout = lazy(() => import('./pages/account/AccountLayout'));
const AccountHome = lazy(() => import('./pages/account/AccountHome'));
const CaseView = lazy(() => import('./pages/account/CaseView'));
const Notifications = lazy(() => import('./pages/account/Notifications'));
const Profile = lazy(() => import('./pages/account/Profile'));
const AccountApplications = lazy(() => import('./pages/account/Applications'));

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminOversight = lazy(() => import('./pages/admin/Oversight'));
const AdminStaffDetail = lazy(() => import('./pages/admin/StaffDetail'));
const AdminCases = lazy(() => import('./pages/admin/CasesList'));
const AdminCase = lazy(() => import('./pages/admin/CaseAdmin'));
const AdminInquiries = lazy(() => import('./pages/admin/Inquiries'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminMailboxes = lazy(() => import('./pages/admin/Mailboxes'));
const AdminSignatures = lazy(() => import('./pages/admin/Signatures'));
const SignPage = lazy(() => import('./pages/SignPage'));
const QuotePage = lazy(() => import('./pages/QuotePage'));
const SharePage = lazy(() => import('./pages/SharePage'));
const CandidateSharePage = lazy(() => import('./pages/CandidateSharePage')); // employer share link of a candidate
const AccountSignatures = lazy(() => import('./pages/account/Signatures'));
const WorkspaceLayout = lazy(() => import('./pages/workspace/WorkspaceLayout'));
const WorkspaceDrive = lazy(() => import('./pages/workspace/Drive'));
const WorkspaceTasks = lazy(() => import('./pages/workspace/Tasks'));
const WorkspaceHome = lazy(() => import('./pages/workspace/Home'));
const WorkspaceMail = lazy(() => import('./pages/workspace/Mail'));
const WorkspaceChat = lazy(() => import('./pages/workspace/Chat'));
const WorkspaceCalendar = lazy(() => import('./pages/workspace/Calendar'));
const WorkspaceContacts = lazy(() => import('./pages/workspace/Contacts'));
const WorkspaceTeam = lazy(() => import('./pages/workspace/Team'));
const WorkspaceLiveChats = lazy(() => import('./pages/workspace/LiveChats')); // AI → human live chat queue
const AdminCalls = lazy(() => import('./pages/admin/Calls')); // call log, callback requests, phone provider
const AdminDocsAudit = lazy(() => import('./pages/admin/DocsAudit'));
const AdminContent = lazy(() => import('./pages/admin/ContentManager'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));
const Impressum = lazy(() => import('./pages/legal/Impressum'));
const Privacy = lazy(() => import('./pages/legal/Privacy'));
// Versioned legal texts: AGB (/agb, /terms), cookie policy, archived versions.
const TermsPage = lazy(() => import('./pages/legal/LegalDocument').then((m) => ({ default: m.TermsPage })));
const CookiesPage = lazy(() => import('./pages/legal/LegalDocument').then((m) => ({ default: m.CookiesPage })));
const LegalArchivedVersion = lazy(() => import('./pages/legal/LegalDocument').then((m) => ({ default: m.LegalArchivedVersion })));
const AdminLegal = lazy(() => import('./pages/admin/Legal'));
const AdminWaitingRoom = lazy(() => import('./pages/admin/WaitingRoom'));
const AccountWaitingRoom = lazy(() => import('./pages/account/WaitingRoom'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'));
const TwoFactor = lazy(() => import('./pages/auth/TwoFactor'));
const Jobs = lazy(() => import('./pages/jobs/Jobs'));
const JobDetail = lazy(() => import('./pages/jobs/JobDetail'));
const EmployerRegister = lazy(() => import('./pages/company/EmployerRegister'));
const CompanyApp = lazy(() => import('./pages/company/CompanyApp'));
const AgentApp = lazy(() => import('./pages/agent/AgentApp'));
const PartnerApp = lazy(() => import('./pages/partner/PartnerApp'));
const AdminHelp = lazy(() => import('./pages/admin/Help'));
const AdminAnnouncements = lazy(() => import('./pages/admin/Announcements'));
const AccountCv = lazy(() => import('./pages/account/Cv'));
const AccountLetters = lazy(() => import('./pages/account/Letters'));
const AccountLetterExplain = lazy(() => import('./pages/account/LetterExplain'));
const AccountVault = lazy(() => import('./pages/account/Vault'));
const AccountArrival = lazy(() => import('./pages/account/Arrival'));
const SalaryCalculator = lazy(() => import('./pages/tools/SalaryCalculator'));
const StartCalculator = lazy(() => import('./pages/growth/Calculator'));
const PlacementMapPage = lazy(() => import('./pages/growth/MapPage'));
const InfoEvents = lazy(() => import('./pages/growth/Events'));
const InfoEventDetail = lazy(() => import('./pages/growth/EventDetail'));
const CostCalculatorPage = lazy(() => import('./pages/growth/CostCalculator')); // client cost calculator
const LandingPageView = lazy(() => import('./pages/growth/LandingPage')); // public landing pages /l/:slug
const AccountReferral = lazy(() => import('./pages/account/Referral'));
const AdminGrowthEvents = lazy(() => import('./pages/admin/GrowthEvents'));
const AdminGrowthTools = lazy(() => import('./pages/admin/GrowthTools'));
const AdminLandingPages = lazy(() => import('./pages/admin/LandingPages')); // landing page builder
const AnerkennungGuide = lazy(() => import('./pages/tools/Anerkennung'));
const CitiesGuide = lazy(() => import('./pages/tools/Cities'));
// SEO: topic guides and interactive tools (Chancenkarte points, Blue Card salary check)
const Guides = lazy(() => import('./pages/guides/Guides'));
const GuideDetail = lazy(() => import('./pages/guides/GuideDetail'));
const ChancenkarteCalculator = lazy(() => import('./pages/tools/ChancenkarteCalculator'));
const BlueCardCheck = lazy(() => import('./pages/tools/BlueCardCheck'));
const AdminGuides = lazy(() => import('./pages/admin/Guides'));
const AdminArrivals = lazy(() => import('./pages/admin/Arrivals'));
const AdminExpiring = lazy(() => import('./pages/admin/Expiring'));
const AdminOriginals = lazy(() => import('./pages/admin/Originals'));
const AdminDuplicates = lazy(() => import('./pages/admin/Duplicates'));
const AdminHistory = lazy(() => import('./pages/admin/History')); // field-level change history + revert
const AdminStorageReport = lazy(() => import('./pages/admin/StorageReport'));
const QrRedirect = lazy(() => import('./pages/QrRedirect'));
const AdminToday = lazy(() => import('./pages/admin/Today'));
const StatusPage = lazy(() => import('./pages/Status')); // public status check without login
const AdminProblemReports = lazy(() => import('./pages/admin/ProblemReports')); // "Problem bildirişləri"

/** /admin: STAFF land on their "my work today" queue, ADMIN / SUPER_ADMIN on the dashboard (also at /admin/dashboard). */
const AdminIndex = () => {
  const { user } = useAuth();
  return user?.role === 'STAFF' ? <Navigate to="/admin/today" replace /> : <AdminDashboard />;
};
const AdminPartners = lazy(() => import('./pages/admin/Partners'));
const AdminClientRegister = lazy(() => import('./pages/admin/ClientRegister'));
const AdminSettlements = lazy(() => import('./pages/admin/Settlements'));
const SheetEditor = lazy(() => import('./pages/workspace/SheetEditor'));
const PdfEditor = lazy(() => import('./pages/workspace/PdfEditor'));
const AccountInterviewPrep = lazy(() => import('./pages/account/InterviewPrep'));
const AdminInterviewPrep = lazy(() => import('./pages/admin/InterviewPrep'));
const AdminFinance = lazy(() => import('./pages/admin/Finance'));
const AdminReports = lazy(() => import('./pages/admin/Reports'));
const AdminProfitability = lazy(() => import('./pages/admin/Profitability'));
const AdminAi = lazy(() => import('./pages/admin/Ai'));
const AdminAiSettings = lazy(() => import('./pages/admin/AiSettings'));
const AdminWeeklyReports = lazy(() => import('./pages/admin/WeeklyReports'));
const AdminSecurityAlerts = lazy(() => import('./pages/admin/SecurityAlerts'));
const AdminSensitiveAccess = lazy(() => import('./pages/admin/SensitiveAccess'));
const AdminAiMailTriage = lazy(() => import('./pages/admin/AiMailTriage'));
const AdminSurveys = lazy(() => import('./pages/admin/Surveys'));
const AdminCampaigns = lazy(() => import('./pages/admin/Campaigns'));
const Unsubscribe = lazy(() => import('./pages/Unsubscribe'));
const AdminContractTemplates = lazy(() => import('./pages/admin/ContractTemplates'));
const AdminCandidateRequests = lazy(() => import('./pages/admin/CandidateRequests'));
const SurveyAnswer = lazy(() => import('./pages/SurveyAnswer'));
const CheckInAnswer = lazy(() => import('./pages/CheckInAnswer')); // post-arrival check-in (one tap)
const AdminTimeTracking = lazy(() => import('./pages/admin/TimeTracking')); // staff time tracking
const AdminKpi = lazy(() => import('./pages/admin/Kpi')); // staff KPI leaderboard (ADMIN+)
const AdminTraining = lazy(() => import('./pages/admin/Training')); // internal training: learn / authoring / progress
const AdminShifts = lazy(() => import('./pages/admin/Shifts')); // team calendar: shifts, leave, handovers
const AdminCheckIns = lazy(() => import('./pages/admin/CheckIns')); // post-arrival check-ins + retention
const AdminAgents = lazy(() => import('./pages/admin/Agents'));
const AdminTranslations = lazy(() => import('./pages/admin/Translations'));
const AdminPrivacyRequests = lazy(() => import('./pages/admin/PrivacyRequests'));
const AccountTranslations = lazy(() => import('./pages/account/Translations'));
const AccountPrivacyCenter = lazy(() => import('./pages/account/PrivacyCenter'));
const Booking = lazy(() => import('./pages/booking/Booking'));
const BookingManage = lazy(() => import('./pages/booking/BookingManage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const AdminSecurity = lazy(() => import('./pages/admin/Security'));
const AdminCompanies = lazy(() => import('./pages/admin/Companies'));
const AdminVacancies = lazy(() => import('./pages/admin/Vacancies'));
const AdminCandidates = lazy(() => import('./pages/admin/Candidates'));
const AdminBookings = lazy(() => import('./pages/admin/Bookings'));
const AdminClientTasks = lazy(() => import('./pages/admin/ClientTasks')); // client tasks across cases (client process)
const AdminInvoices = lazy(() => import('./pages/admin/Invoices'));
const AdminQuotes = lazy(() => import('./pages/admin/Quotes'));
const AdminReviews = lazy(() => import('./pages/admin/Reviews'));
const AdminMessaging = lazy(() => import('./pages/admin/Messaging'));
const AdminKanban = lazy(() => import('./pages/admin/Kanban'));
const AdminKnowledgeBase = lazy(() => import('./pages/admin/KnowledgeBase'));
const AdminIntegrations = lazy(() => import('./pages/admin/Integrations'));
const AdminAutomation = lazy(() => import('./pages/admin/Automation')); // automation rules + automatic assignment
const AdminInterviews = lazy(() => import('./pages/admin/Interviews'));
const AdminEmploymentContracts = lazy(() => import('./pages/admin/EmploymentContracts')); // Arbeitsvertrag tracker: warnings, probation ending
const AdminJourney = lazy(() => import('./pages/admin/Journey'));
const AdminGermanExamDates = lazy(() => import('./pages/admin/GermanExamDates'));
const AdminRequirements = lazy(() => import('./pages/admin/Requirements'));
const AdminCaseForms = lazy(() => import('./pages/admin/CaseForms')); // smart questionnaire builder
const AdminDocGuides = lazy(() => import('./pages/admin/DocGuides')); // "Necə almalı?" document guides
const AccountCaseForm = lazy(() => import('./pages/account/CaseForm'));
const AccountConfirmData = lazy(() => import('./pages/account/ConfirmData'));
const AccountOnboarding = lazy(() => import('./pages/account/Onboarding'));
const AccountGerman = lazy(() => import('./pages/account/German'));
const AccountInterviews = lazy(() => import('./pages/account/Interviews'));
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'));

/**
 * Warm the route chunks once the first page is interactive, so later navigations render
 * instantly instead of waiting on a network round-trip. Admin chunks are only fetched by staff.
 */
const PREFETCH = [
  () => import('./pages/Home'),
  () => import('./pages/About'),
  () => import('./pages/Services'),
  () => import('./pages/ServiceDetail'),
  () => import('./pages/Eligibility'),
  () => import('./pages/Visas'),
  () => import('./pages/VisaDetail'),
  () => import('./pages/Partners'),
  () => import('./pages/Stories'),
  () => import('./pages/Ausbildung'),
  () => import('./pages/FaqPage'),
  () => import('./pages/News'),
  () => import('./pages/NewsDetail'),
  () => import('./pages/Contact'),
  () => import('./pages/Cooperation'),
  () => import('./pages/auth/Login'),
  () => import('./pages/auth/Register'),
  () => import('./pages/auth/ForgotPassword'),
  () => import('./pages/auth/ResetPassword'),
  () => import('./pages/NotFound'),
  () => import('./pages/account/AccountLayout'),
  () => import('./pages/account/AccountHome'),
  () => import('./pages/account/CaseView'),
  () => import('./pages/account/Notifications'),
  () => import('./pages/account/Profile'),
];
const prefetchRoutes = () => {
  // One chunk per idle period, starting a few seconds after load, so warming never competes with
  // scrolling or the first interactions. Skipped on metered / very slow connections (Save-Data, 2G):
  // those visitors only download the pages they open (hover/focus intent still warms the next one).
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return;
  const queue = [...PREFETCH];
  const next = () => {
    const load = queue.shift();
    if (!load) return;
    void load()
      .catch(() => undefined)
      .finally(() => whenIdle(next, 3000));
  };
  window.setTimeout(() => whenIdle(next, 3000), 5000);
};

/** Route prefix → page chunk, used to start loading a page as soon as the user points at its link. */
const INTENT: [string, () => Promise<unknown>][] = [
  ['/about', () => import('./pages/About')],
  ['/services/', () => import('./pages/ServiceDetail')],
  ['/services', () => import('./pages/Services')],
  ['/visas/', () => import('./pages/VisaDetail')],
  ['/visas', () => import('./pages/Visas')],
  ['/partners', () => import('./pages/Partners')],
  ['/stories', () => import('./pages/Stories')],
  ['/ausbildung', () => import('./pages/Ausbildung')],
  ['/eligibility', () => import('./pages/Eligibility')],
  ['/uygunluq-testi', () => import('./pages/EligibilityQuiz')],
  ['/faq', () => import('./pages/FaqPage')],
  ['/news/', () => import('./pages/NewsDetail')],
  ['/news', () => import('./pages/News')],
  ['/contact', () => import('./pages/Contact')],
  ['/cooperation', () => import('./pages/Cooperation')],
  ['/login', () => import('./pages/auth/Login')],
  ['/register', () => import('./pages/auth/Register')],
  ['/account', () => import('./pages/account/AccountLayout')],
];
const warmed = new Set<string>();
const prefetchIntent = (e: Event) => {
  const a = (e.target as HTMLElement | null)?.closest?.('a[href^="/"]');
  // Language-prefixed links (/de/visas) warm the same chunk as /visas.
  const raw = a?.getAttribute('href');
  const href = raw ? splitLocalePath(raw.split(/[?#]/)[0]).rest : null;
  if (!href) return;
  const hit = INTENT.find(([prefix]) => href === prefix || href.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`) || href.startsWith(prefix + '?'));
  if (!hit || warmed.has(hit[0])) return;
  warmed.add(hit[0]);
  void hit[1]().catch(() => warmed.delete(hit[0]));
};

export default function App() {
  const location = useLocation();
  useEffect(prefetchRoutes, []);
  useEffect(() => {
    document.addEventListener('pointerover', prefetchIntent, { passive: true });
    document.addEventListener('touchstart', prefetchIntent, { passive: true });
    document.addEventListener('focusin', prefetchIntent);
    return () => {
      document.removeEventListener('pointerover', prefetchIntent);
      document.removeEventListener('touchstart', prefetchIntent);
      document.removeEventListener('focusin', prefetchIntent);
    };
  }, []);
  // The site layout animates its own page transitions; only switching between site and admin remounts the shell.
  const area = location.pathname.startsWith('/admin') ? 'admin' : 'site';

  return (
    <>
    {/* "View as client": persistent read-only bar (renders nothing otherwise). */}
    <ImpersonationGate />
    {/* Updated AGB / privacy policy to re-accept (signed-in users only; renders nothing otherwise). */}
    <LegalGateHost />
    <Suspense fallback={<PageLoader />}>
      <Routes location={location} key={area}>
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path="about" element={<About />} />
            <Route path="services" element={<Services />} />
            <Route path="services/:slug" element={<ServiceDetail />} />
            <Route path="eligibility" element={<Eligibility />} />
            <Route path="uygunluq-testi" element={<EligibilityQuiz />} />
            <Route path="visas" element={<Visas />} />
            <Route path="visas/:slug" element={<VisaDetail />} />
            <Route path="partners" element={<Partners />} />
            <Route path="stories" element={<Stories />} />
            <Route path="ausbildung" element={<Ausbildung />} />
            <Route path="faq" element={<FaqPage />} />
            <Route path="news" element={<News />} />
            <Route path="salary-calculator" element={<SalaryCalculator />} />
            <Route path="anerkennung" element={<AnerkennungGuide />} />
            <Route path="cities" element={<CitiesGuide />} />
            <Route path="guides" element={<Guides />} />
            <Route path="guides/:slug" element={<GuideDetail />} />
            <Route path="chancenkarte-calculator" element={<ChancenkarteCalculator />} />
            <Route path="blue-card-check" element={<BlueCardCheck />} />
            <Route path="calculator" element={<StartCalculator />} />
            <Route path="map" element={<PlacementMapPage />} />
            <Route path="events" element={<InfoEvents />} />
            <Route path="events/:slug" element={<InfoEventDetail />} />
            <Route path="cost-calculator" element={<CostCalculatorPage />} />
            <Route path="l/:slug" element={<LandingPageView />} />
            <Route path="survey/:token" element={<SurveyAnswer />} />
            <Route path="check-in/:key" element={<CheckInAnswer />} />
            <Route path="unsubscribe" element={<Unsubscribe />} />
            <Route path="news/:slug" element={<NewsDetail />} />
            <Route path="contact" element={<Contact />} />
            <Route path="cooperation" element={<Cooperation />} />
            <Route path="accessibility" element={<AccessibilityPage />} />
            <Route path="status" element={<StatusPage />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="verify-email" element={<VerifyEmail />} />
            <Route path="login/2fa" element={<TwoFactor />} />
            <Route path="impressum" element={<Impressum />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="agb" element={<TermsPage />} />
            <Route path="terms" element={<TermsPage />} />
            <Route path="cookies" element={<CookiesPage />} />
            <Route path="legal/:kind/:version" element={<LegalArchivedVersion />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="jobs/:slug" element={<JobDetail />} />
            <Route path="employers/register" element={<EmployerRegister />} />
            <Route
              path="company/*"
              element={
                <RequireAuth roles={['COMPANY']}>
                  <CompanyApp />
                </RequireAuth>
              }
            />
            <Route
              path="agent/*"
              element={
                <RequireAuth roles={['AGENT']}>
                  <AgentApp />
                </RequireAuth>
              }
            />
            <Route
              path="partner/*"
              element={
                <RequireAuth roles={['AGENT']}>
                  <PartnerApp />
                </RequireAuth>
              }
            />
            <Route path="booking" element={<Booking />} />
            <Route path="booking/manage" element={<BookingManage />} />
            <Route path="review" element={<ReviewPage />} />
            <Route path="sign/:token" element={<SignPage />} />
            <Route path="angebot/:token" element={<QuotePage />} />
            <Route path="share/:token" element={<SharePage />} />
            <Route path="kandidat/:token" element={<CandidateSharePage />} />
            <Route path="q/:caseId" element={<QrRedirect />} />
            <Route
              path="account"
              element={
                <RequireAuth roles={['CLIENT']}>
                  <AccountLayout />
                </RequireAuth>
              }
            >
              <Route index element={<AccountHome />} />
              <Route path="cases/:id" element={<CaseView />} />
              <Route path="cases/:id/forms/:formId" element={<AccountCaseForm />} />
              <Route path="cases/:id/confirm" element={<AccountConfirmData />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="profile" element={<Profile />} />
              <Route path="applications" element={<AccountApplications />} />
              <Route path="onboarding" element={<AccountOnboarding />} />
              <Route path="german" element={<AccountGerman />} />
              <Route path="interviews" element={<AccountInterviews />} />
              <Route path="translations/*" element={<AccountTranslations />} />
              <Route path="privacy" element={<AccountPrivacyCenter />} />
              <Route path="waiting-room" element={<AccountWaitingRoom />} />
              <Route path="cv" element={<AccountCv />} />
              <Route path="letters/*" element={<AccountLetters />} />
              <Route path="letters-explain" element={<AccountLetterExplain />} />
              <Route path="vault" element={<AccountVault />} />
              <Route path="referral" element={<AccountReferral />} />
              <Route path="arrival" element={<AccountArrival />} />
              <Route path="interview-prep" element={<AccountInterviewPrep />} />
              <Route path="signatures" element={<AccountSignatures />} />
              <Route path="signatures/:signerId" element={<AccountSignatures />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>

          {/* Team workspace: full-screen documents + tasks for staff (outside the site and admin layouts). */}
          <Route
            path="workspace"
            element={
              <RequireAuth roles={['STAFF', 'ADMIN', 'SUPER_ADMIN']}>
                <WorkspaceLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="home" replace />} />
            <Route path="home" element={<WorkspaceHome />} />
            <Route path="sheet/:id" element={<SheetEditor />} />
            <Route path="pdf/:nodeId" element={<PdfEditor />} />
            <Route path="drive/*" element={<WorkspaceDrive />} />
            <Route path="tasks/*" element={<WorkspaceTasks />} />
            <Route path="mail/*" element={<WorkspaceMail />} />
            <Route path="chat/*" element={<WorkspaceChat />} />
            <Route path="calendar/*" element={<WorkspaceCalendar />} />
            <Route path="contacts/*" element={<WorkspaceContacts />} />
            <Route path="team/*" element={<WorkspaceTeam />} />
            <Route path="live-chats" element={<WorkspaceLiveChats />} />
            <Route path="settlements/*" element={<AdminSettlements />} />
          </Route>

          <Route
            path="admin"
            element={
              <RequireAuth roles={['STAFF', 'ADMIN', 'SUPER_ADMIN']}>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<AdminIndex />} />
            <Route path="today" element={<AdminToday />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route
              path="oversight"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminOversight />
                </RequireAuth>
              }
            />
            <Route
              path="oversight/staff/:id"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminStaffDetail />
                </RequireAuth>
              }
            />
            <Route
              path="ai"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminAi />
                </RequireAuth>
              }
            />
            <Route
              path="ai/settings"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminAiSettings />
                </RequireAuth>
              }
            />
            <Route
              path="weekly-reports"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminWeeklyReports />
                </RequireAuth>
              }
            />
            <Route
              path="security-alerts"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminSecurityAlerts />
                </RequireAuth>
              }
            />
            <Route
              path="sensitive-access"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminSensitiveAccess />
                </RequireAuth>
              }
            />
            <Route
              path="ai/mail-triage"
              element={
                <RequireAuth roles={['SUPER_ADMIN']}>
                  <AdminAiMailTriage />
                </RequireAuth>
              }
            />
            <Route path="cases" element={<AdminCases />} />
            <Route path="cases/:id" element={<AdminCase />} />
            <Route path="inquiries" element={<AdminInquiries />} />
            <Route path="calls" element={<AdminCalls />} />
            <Route path="users" element={<AdminUsers />} />
            <Route
              path="mailboxes"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminMailboxes />
                </RequireAuth>
              }
            />
            <Route path="docs" element={<Navigate to="/workspace/drive" replace />} />
            <Route path="docs/audit" element={<AdminDocsAudit />} />
            <Route path="content/:resource" element={<AdminContent />} />
            <Route path="guides" element={<AdminGuides />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="security" element={<AdminSecurity />} />
            <Route path="companies" element={<AdminCompanies />} />
            <Route path="vacancies" element={<AdminVacancies />} />
            <Route path="candidates" element={<AdminCandidates />} />
            <Route path="bookings" element={<AdminBookings />} />
            <Route path="client-tasks" element={<AdminClientTasks />} />
            <Route
              path="invoices"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminInvoices />
                </RequireAuth>
              }
            />
            <Route
              path="quotes"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminQuotes />
                </RequireAuth>
              }
            />
            <Route path="reviews" element={<AdminReviews />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="messaging" element={<AdminMessaging />} />
            <Route path="kanban" element={<AdminKanban />} />
            <Route path="kb" element={<AdminKnowledgeBase />} />
            <Route path="help" element={<AdminHelp />} />
            <Route path="tasks/*" element={<WorkspaceTasks />} />
            <Route path="announcements" element={<AdminAnnouncements />} />
            <Route path="arrivals/*" element={<AdminArrivals />} />
            <Route path="expiring" element={<AdminExpiring />} />
            <Route path="originals" element={<AdminOriginals />} />
            <Route
              path="duplicates"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminDuplicates />
                </RequireAuth>
              }
            />
            <Route
              path="history"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminHistory />
                </RequireAuth>
              }
            />
            <Route path="q/:caseId" element={<QrRedirect />} />
            <Route
              path="storage"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminStorageReport />
                </RequireAuth>
              }
            />
            {/* Admins + the staff member chosen in its settings (the API decides; others see "no access"). */}
            <Route path="problems" element={<AdminProblemReports />} />
            <Route path="partners/*" element={<AdminPartners />} />
            <Route path="register" element={<AdminClientRegister />} />
            <Route path="settlements/*" element={<AdminSettlements />} />
            <Route path="interview-prep" element={<AdminInterviewPrep />} />
            <Route path="finance/*" element={<AdminFinance />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="profitability" element={<AdminProfitability />} />
            <Route path="surveys/*" element={<AdminSurveys />} />
            <Route path="time" element={<AdminTimeTracking />} />
            <Route
              path="kpi"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminKpi />
                </RequireAuth>
              }
            />
            <Route path="training" element={<AdminTraining />} />
            <Route path="shifts" element={<AdminShifts />} />
            <Route path="check-ins" element={<AdminCheckIns />} />
            <Route
              path="campaigns/*"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminCampaigns />
                </RequireAuth>
              }
            />
            <Route path="events" element={<AdminGrowthEvents />} />
            <Route path="site-tools" element={<AdminGrowthTools />} />
            <Route path="landing-pages/*" element={<AdminLandingPages />} />
            <Route path="contract-templates/*" element={<AdminContractTemplates />} />
            <Route path="candidate-requests/*" element={<AdminCandidateRequests />} />
            <Route path="agents/*" element={<AdminAgents />} />
            <Route path="translations/*" element={<AdminTranslations />} />
            <Route path="privacy-requests/*" element={<AdminPrivacyRequests />} />
            <Route path="waiting-room" element={<AdminWaitingRoom />} />
            <Route
              path="legal/*"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminLegal />
                </RequireAuth>
              }
            />
            <Route path="integrations" element={<AdminIntegrations />} />
            <Route
              path="automation"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminAutomation />
                </RequireAuth>
              }
            />
            <Route path="interviews" element={<AdminInterviews />} />
            <Route path="employment-contracts" element={<AdminEmploymentContracts />} />
            <Route path="journey" element={<AdminJourney />} />
            <Route path="exam-dates" element={<AdminGermanExamDates />} />
            <Route path="requirements" element={<AdminRequirements />} />
            <Route path="case-forms" element={<AdminCaseForms />} />
            <Route path="doc-guides" element={<AdminDocGuides />} />
            <Route path="signatures" element={<AdminSignatures />} />
            <Route path="signatures/sign/:signerId" element={<AdminSignatures />} />
          </Route>
        </Routes>
    </Suspense>
    </>
  );
}
