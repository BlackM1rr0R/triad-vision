import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { RequireAuth } from './lib/auth';
import { whenIdle } from './lib/idle';
import { PageLoader } from './components/ui/Spinner';
import { SiteLayout } from './components/layout/SiteLayout';

const Home = lazy(() => import('./pages/Home'));
const About = lazy(() => import('./pages/About'));
const Services = lazy(() => import('./pages/Services'));
const ServiceDetail = lazy(() => import('./pages/ServiceDetail'));
const Eligibility = lazy(() => import('./pages/Eligibility'));
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
const WorkspaceLayout = lazy(() => import('./pages/workspace/WorkspaceLayout'));
const WorkspaceDrive = lazy(() => import('./pages/workspace/Drive'));
const WorkspaceTasks = lazy(() => import('./pages/workspace/Tasks'));
const AdminDocsAudit = lazy(() => import('./pages/admin/DocsAudit'));
const AdminContent = lazy(() => import('./pages/admin/ContentManager'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));
const Impressum = lazy(() => import('./pages/legal/Impressum'));
const Privacy = lazy(() => import('./pages/legal/Privacy'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'));
const TwoFactor = lazy(() => import('./pages/auth/TwoFactor'));
const Jobs = lazy(() => import('./pages/jobs/Jobs'));
const JobDetail = lazy(() => import('./pages/jobs/JobDetail'));
const EmployerRegister = lazy(() => import('./pages/company/EmployerRegister'));
const CompanyApp = lazy(() => import('./pages/company/CompanyApp'));
const Booking = lazy(() => import('./pages/booking/Booking'));
const BookingManage = lazy(() => import('./pages/booking/BookingManage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const AdminSecurity = lazy(() => import('./pages/admin/Security'));
const AdminCompanies = lazy(() => import('./pages/admin/Companies'));
const AdminVacancies = lazy(() => import('./pages/admin/Vacancies'));
const AdminCandidates = lazy(() => import('./pages/admin/Candidates'));
const AdminBookings = lazy(() => import('./pages/admin/Bookings'));
const AdminInvoices = lazy(() => import('./pages/admin/Invoices'));
const AdminReviews = lazy(() => import('./pages/admin/Reviews'));
const AdminMessaging = lazy(() => import('./pages/admin/Messaging'));
const AdminKanban = lazy(() => import('./pages/admin/Kanban'));
const AdminKnowledgeBase = lazy(() => import('./pages/admin/KnowledgeBase'));
const AdminIntegrations = lazy(() => import('./pages/admin/Integrations'));
const AdminInterviews = lazy(() => import('./pages/admin/Interviews'));
const AdminJourney = lazy(() => import('./pages/admin/Journey'));
const AdminRequirements = lazy(() => import('./pages/admin/Requirements'));
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
  // scrolling or the first interactions.
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
  const href = a?.getAttribute('href');
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
    <Suspense fallback={<PageLoader />}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={area}>
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path="about" element={<About />} />
            <Route path="services" element={<Services />} />
            <Route path="services/:slug" element={<ServiceDetail />} />
            <Route path="eligibility" element={<Eligibility />} />
            <Route path="visas" element={<Visas />} />
            <Route path="visas/:slug" element={<VisaDetail />} />
            <Route path="partners" element={<Partners />} />
            <Route path="stories" element={<Stories />} />
            <Route path="ausbildung" element={<Ausbildung />} />
            <Route path="faq" element={<FaqPage />} />
            <Route path="news" element={<News />} />
            <Route path="news/:slug" element={<NewsDetail />} />
            <Route path="contact" element={<Contact />} />
            <Route path="cooperation" element={<Cooperation />} />
            <Route path="accessibility" element={<AccessibilityPage />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="verify-email" element={<VerifyEmail />} />
            <Route path="login/2fa" element={<TwoFactor />} />
            <Route path="impressum" element={<Impressum />} />
            <Route path="privacy" element={<Privacy />} />
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
            <Route path="booking" element={<Booking />} />
            <Route path="booking/manage" element={<BookingManage />} />
            <Route path="review" element={<ReviewPage />} />
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
              <Route path="notifications" element={<Notifications />} />
              <Route path="profile" element={<Profile />} />
              <Route path="applications" element={<AccountApplications />} />
              <Route path="onboarding" element={<AccountOnboarding />} />
              <Route path="german" element={<AccountGerman />} />
              <Route path="interviews" element={<AccountInterviews />} />
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
            <Route index element={<Navigate to="drive" replace />} />
            <Route path="drive/*" element={<WorkspaceDrive />} />
            <Route path="tasks/*" element={<WorkspaceTasks />} />
          </Route>

          <Route
            path="admin"
            element={
              <RequireAuth roles={['STAFF', 'ADMIN', 'SUPER_ADMIN']}>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<AdminDashboard />} />
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
            <Route path="cases" element={<AdminCases />} />
            <Route path="cases/:id" element={<AdminCase />} />
            <Route path="inquiries" element={<AdminInquiries />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="docs" element={<Navigate to="/workspace/drive" replace />} />
            <Route path="docs/audit" element={<AdminDocsAudit />} />
            <Route path="content/:resource" element={<AdminContent />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="security" element={<AdminSecurity />} />
            <Route path="companies" element={<AdminCompanies />} />
            <Route path="vacancies" element={<AdminVacancies />} />
            <Route path="candidates" element={<AdminCandidates />} />
            <Route path="bookings" element={<AdminBookings />} />
            <Route
              path="invoices"
              element={
                <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminInvoices />
                </RequireAuth>
              }
            />
            <Route path="reviews" element={<AdminReviews />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="messaging" element={<AdminMessaging />} />
            <Route path="kanban" element={<AdminKanban />} />
            <Route path="kb" element={<AdminKnowledgeBase />} />
            <Route path="integrations" element={<AdminIntegrations />} />
            <Route path="interviews" element={<AdminInterviews />} />
            <Route path="journey" element={<AdminJourney />} />
            <Route path="requirements" element={<AdminRequirements />} />
          </Route>
        </Routes>
      </AnimatePresence>
    </Suspense>
  );
}
