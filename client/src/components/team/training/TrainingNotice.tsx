import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { GraduationCap } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesTeam } from '@/i18n/pagesTeam';
import { TONE_CLASS } from '@/components/ui/status';
import { usePendingTraining } from '../api';

registerCopy(pagesTeam);

/** Count of required courses the staff member has not finished, on the "Təlim" nav item. */
export const TrainingNavBadge = ({ collapsed }: { collapsed: boolean }) => {
  const { t } = useTranslation();
  const { data } = usePendingTraining();
  const n = data?.count ?? 0;
  if (!n) return null;
  const label = t('team.training.navBadge', { count: n });
  return (
    <span
      title={label}
      aria-label={label}
      className={clsx(
        'grid min-w-5 place-items-center rounded-full border border-warning-border bg-warning-bg px-1.5 code-id text-[11px] leading-4 font-medium text-warning-fg tabular-nums',
        collapsed ? 'absolute top-0.5 right-0.5 min-w-4 text-[10px] leading-4' : 'ml-auto',
      )}
    >
      {n}
    </span>
  );
};

/** Banner (Today page) while required courses are unfinished. */
export const RequiredTrainingBanner = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const { data } = usePendingTraining();
  if (!data?.count) return null;
  return (
    <div className={clsx('flex flex-wrap items-center gap-3 rounded-xl px-4 py-3', TONE_CLASS.warning, className)} role="status">
      <GraduationCap className="size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{t('team.training.bannerTitle', { count: data.count })}</p>
        <p className="truncate opacity-90">{data.courses.map((c) => `${c.title} (${c.percent}%)`).join(' · ')}</p>
      </div>
      <Link to="/admin/training" className="btn-secondary btn-sm">
        {t('team.training.bannerCta')}
      </Link>
    </div>
  );
};
