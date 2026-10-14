import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
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

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminOversight = lazy(() => import('./pages/admin/Oversight'));
const AdminStaffDetail = lazy(() => import('./pages/admin/StaffDetail'));
const AdminCases = lazy(() => import('./pages/admin/CasesList'));
const AdminCase = lazy(() => import('./pages/admin/CaseAdmin'));
const AdminInquiries = lazy(() => import('./pages/admin/Inquiries'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminDocs = lazy(() => import('./pages/admin/Docs'));
const AdminDocsAudit = lazy(() => import('./pages/admin/DocsAudit'));
const AdminContent = lazy(() => import('./pages/admin/ContentManager'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));

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
            </Route>
            <Route path="*" element={<NotFound />} />
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
            <Route path="docs" element={<AdminDocs />} />
            <Route path="docs/audit" element={<AdminDocsAudit />} />
            <Route path="content/:resource" element={<AdminContent />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
        </Routes>
      </AnimatePresence>
    </Suspense>
  );
}
