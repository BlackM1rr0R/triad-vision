import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Rocket } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesOnboarding } from '@/i18n/pagesOnboarding';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';

registerCopy(pagesOnboarding);

/**
 * Onboarding notice above every admin page of a SUPER_ADMIN on a customer (white-label) instance until the
 * setup wizard (System → Onboarding, server lib/saas/onboarding.ts) is completed. Nothing on the owner's instance.
 */
export const OnboardingBanner = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const superAdmin = hasMinRole(user?.role, 'SUPER_ADMIN');
  const { data } = useQuery({
    queryKey: ['admin-onboarding-status'],
    queryFn: async () => (await api.get<{ applicable: boolean; completed: boolean; percent: number }>('/admin/onboarding/status')).data,
    enabled: superAdmin,
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!superAdmin || !data?.applicable || data.completed || pathname.startsWith('/admin/system/onboarding')) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-primary/5 px-4 py-3 text-sm text-ink">
      <Rocket className="size-4 shrink-0 text-link" aria-hidden />
      <p className="min-w-0 flex-1">{t('onb.banner.text', { percent: data.percent })}</p>
      <Link to="/admin/system/onboarding" className="shrink-0 font-semibold text-link underline underline-offset-2">
        {t('onb.banner.cta')}
      </Link>
    </div>
  );
};
