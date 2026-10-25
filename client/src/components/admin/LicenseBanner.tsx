import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesWhitelabel } from '@/i18n/pagesWhitelabel';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { useStaffNav } from '@/components/command/navPrefs';

registerCopy(pagesWhitelabel);

const DAY = 86_400_000;

/**
 * White-label licence notice above every admin page (server lib/license, status from GET /admin/me/nav):
 * the grace period is shown to admins; read-only mode (expired beyond the grace period, invalid or missing key)
 * to all staff, because their changes are refused then. Nothing on the owner's instance or with a valid licence.
 */
export const LicenseBanner = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { license } = useStaffNav();
  if (!license || license.status === 'owner' || license.status === 'valid') return null;
  const admin = hasMinRole(user?.role, 'ADMIN');
  if (license.status === 'grace' && !admin) return null;
  const graceDays = license.graceEndsAt ? Math.max(0, Math.ceil((new Date(license.graceEndsAt).getTime() - Date.now()) / DAY)) : 0;
  const text =
    license.status === 'grace'
      ? t('wl.banner.grace', { days: graceDays })
      : license.status === 'invalid'
        ? t('wl.banner.invalid')
        : license.status === 'missing'
          ? t('wl.banner.missing')
          : t('wl.banner.readonly');
  const danger = license.mode === 'readonly';
  return (
    <div role="status" className={`mb-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${danger ? 'border-danger-fg/30 bg-danger-bg text-danger-fg' : 'border-warning-fg/30 bg-warning-bg text-warning-fg'}`}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{text}</p>
      {hasMinRole(user?.role, 'SUPER_ADMIN') && (
        <Link to="/admin/system/license" className="shrink-0 font-semibold underline underline-offset-2">
          {t('wl.banner.details')}
        </Link>
      )}
    </div>
  );
};
