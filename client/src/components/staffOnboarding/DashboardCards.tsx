import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, GraduationCap, Rocket, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesStaffOnboarding } from '@/i18n/pagesStaffOnboarding';
import { ProgressBar } from './ProgressBar';
import { setupChecklistKey, trainingChecklistKey, type SetupChecklist, type TrainingChecklist } from './api';

registerCopy(pagesStaffOnboarding);

const dismissKey = (userId: string) => `tv-setup-card-dismissed:${userId}`;
const readDismissed = (userId: string | undefined) => {
  if (!userId) return false;
  try {
    return localStorage.getItem(dismissKey(userId)) === '1';
  } catch {
    return false;
  }
};

/**
 * Dashboard cards: the new staff training checklist until it is complete (every staff role), and the owner setup
 * checklist for ADMIN+ until 100 % (dismissible per browser). Nothing while loading or on errors.
 */
export const OnboardingCards = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const [dismissed, setDismissed] = useState(() => readDismissed(user?.id));
  const training = useQuery({
    queryKey: trainingChecklistKey,
    queryFn: async () => (await api.get<TrainingChecklist>('/admin/training-checklist/me')).data,
    enabled: !!user,
    retry: false,
    staleTime: 60_000,
  });
  const setup = useQuery({
    queryKey: setupChecklistKey,
    queryFn: async () => (await api.get<SetupChecklist>('/admin/setup-checklist')).data,
    enabled: !!user && isAdmin && !dismissed,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const showTraining = !!training.data && !training.data.complete;
  const showSetup = isAdmin && !dismissed && !!setup.data && !setup.data.complete;
  if (!showTraining && !showSetup) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {showTraining && training.data && (
        <section aria-labelledby="sob-training-card" className="flex items-start gap-3 rounded-xl border border-line bg-card p-4">
          <GraduationCap className="mt-0.5 size-5 shrink-0 text-link" aria-hidden />
          <div className="min-w-0 flex-1 space-y-2">
            <h2 id="sob-training-card" className="text-sm font-semibold text-ink">
              {t('sob.training.card.title')}
            </h2>
            <p className="text-sm text-muted">{t('sob.training.card.text', { done: training.data.done, total: training.data.total })}</p>
            <ProgressBar percent={training.data.percent} label={t('sob.training.progress', { done: training.data.done, total: training.data.total })} />
            <Link to="/admin/training-checklist" className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline">
              {t('sob.training.card.cta')} <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </section>
      )}
      {showSetup && setup.data && (
        <section aria-labelledby="sob-setup-card" className="relative flex items-start gap-3 rounded-xl border border-line bg-card p-4">
          <Rocket className="mt-0.5 size-5 shrink-0 text-link" aria-hidden />
          <div className="min-w-0 flex-1 space-y-2 pr-8">
            <h2 id="sob-setup-card" className="text-sm font-semibold text-ink">
              {t('sob.setup.card.title', { percent: setup.data.percent })}
            </h2>
            <p className="text-sm text-muted">{t('sob.setup.card.text')}</p>
            <ProgressBar percent={setup.data.percent} label={t('sob.setup.progress', { percent: setup.data.percent, resolved: setup.data.resolved, total: setup.data.total })} />
            <Link to="/admin/setup-checklist" className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline">
              {t('sob.setup.card.cta')} <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          <button
            type="button"
            className="absolute top-2 right-2 grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
            aria-label={t('sob.setup.card.dismiss')}
            title={t('sob.setup.card.dismiss')}
            onClick={() => {
              try {
                if (user) localStorage.setItem(dismissKey(user.id), '1');
              } catch {
                /* ignore */
              }
              setDismissed(true);
            }}
          >
            <X className="size-4" aria-hidden />
          </button>
        </section>
      )}
    </div>
  );
};
