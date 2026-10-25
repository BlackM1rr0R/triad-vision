import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PowerOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { EmptyState } from '@/components/ui/EmptyState';
import type { StaffNavItem } from '@/components/command/navRegistry';

/** Shown instead of a page whose module a SUPER_ADMIN switched off (old links / bookmarks still land here). */
export const ModuleDisabled = ({ item }: { item: StaffNavItem }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const page = item.module ? t(`anav.modules.${item.module}.title`) : t(item.labelKey);
  const title = t('anav.disabled.title', { page });
  usePageTitle(title);
  const superAdmin = hasMinRole(user?.role, 'SUPER_ADMIN');
  return (
    <section className="rounded-xl border border-line bg-card" aria-labelledby="module-disabled-title">
      <EmptyState
        icon={PowerOff}
        size="lg"
        title={<span id="module-disabled-title">{title}</span>}
        text={
          <>
            {t('anav.disabled.body')}
            {superAdmin && <span className="mt-2 block">{t('anav.disabled.superHint')}</span>}
          </>
        }
        action={
          <>
            {superAdmin && (
              <Link to="/admin/system/modules" className="btn-primary btn-sm">
                {t('anav.disabled.toModules')}
              </Link>
            )}
            <Link to="/admin/today" className="btn-secondary btn-sm">
              {t('anav.disabled.back')}
            </Link>
          </>
        }
      />
    </section>
  );
};
