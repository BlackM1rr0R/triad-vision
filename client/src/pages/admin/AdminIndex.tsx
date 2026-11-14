import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { lazyRoute } from '@/lib/lazyRoute';
import { STAFF_LANDING_PATH, useStaffNav } from '@/components/command/navPrefs';

const AdminDashboard = lazyRoute('AdminDashboard', () => import('./Dashboard'));

/**
 * /admin: the own start page when one is chosen ("Bu günüm" → "Başlanğıc səhifəm", kept by GET/PUT /admin/me/nav;
 * the last answer is cached, so the redirect is instant on reload). Without a choice STAFF land on their
 * "my work today" queue and ADMIN / SUPER_ADMIN on the dashboard (also at /admin/dashboard).
 */
export default function AdminIndex() {
  const { user } = useAuth();
  const { landing } = useStaffNav();
  if (landing === 'dashboard') return <AdminDashboard />;
  if (landing) return <Navigate to={STAFF_LANDING_PATH[landing]} replace />;
  return user?.role === 'STAFF' ? <Navigate to="/admin/today" replace /> : <AdminDashboard />;
}
