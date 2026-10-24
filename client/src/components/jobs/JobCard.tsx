import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowUpRight, Building2, CalendarClock, Clock, Euro, Languages, MapPin, Users } from 'lucide-react';
import { fmtDate } from '@/components/admin/labels';
import { useJobLabels } from './labels';
import type { PublicVacancy } from './types';
import { useMorphSource } from '@/lib/viewTransition';

/** Vacancy card on the public board. */
export const JobCard = ({ v, className }: { v: PublicVacancy; className?: string }) => {
  const { t } = useTranslation();
  const L = useJobLabels();
  const salary = L.salary(v.salaryMin, v.salaryMax);
  // The card grows into the vacancy page's hero and its title moves into the hero title (lib/viewTransition.ts).
  const morph = useMorphSource('job', v.slug);
  return (
    <Link
      ref={morph.ref}
      onClick={morph.onClick}
      {...morph.part('card')}
      to={`/jobs/${v.slug}`}
      className={clsx(
        'group card flex h-full flex-col p-5 transition duration-300 hover:-translate-y-0.5 hover:border-brand-400/60 hover:shadow-[0_20px_40px_-20px_rgba(11,31,68,0.35)] sm:p-6',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {v.sector && <span className="badge bg-brand-50 text-brand-700">{L.sector(v.sector)}</span>}
            <span className="badge bg-surface text-ink/70">{L.employmentType(v.employmentType)}</span>
          </div>
          <h3 {...morph.part('title')} className="mt-3 w-fit font-display text-lg leading-snug font-bold break-words text-navy-900 group-hover:text-brand-700">
            {L.title(v.title)}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <Building2 className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{v.companyName ?? t('jobsArea.common.confidentialEmployer')}</span>
          </p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-navy-900 transition group-hover:bg-brand-600 group-hover:text-white" aria-hidden>
          <ArrowUpRight className="size-4" />
        </span>
      </div>

      <ul className="mt-4 mb-4 grid grid-cols-1 gap-2 text-sm text-ink/80 min-[400px]:grid-cols-2">
        {v.city && (
          <li className="flex min-w-0 items-center gap-2">
            <MapPin className="size-4 shrink-0 text-brand-600" aria-hidden /> <span className="truncate">{v.city}</span>
          </li>
        )}
        <li className="flex min-w-0 items-center gap-2">
          <Languages className="size-4 shrink-0 text-brand-600" aria-hidden />
          <span className="truncate">{v.germanLevel && v.germanLevel !== 'none' ? t('jobsArea.common.germanMin', { level: v.germanLevel }) : t('jobsArea.german.none')}</span>
        </li>
        {v.minExperience ? (
          <li className="flex min-w-0 items-center gap-2">
            <Clock className="size-4 shrink-0 text-brand-600" aria-hidden /> <span className="truncate">{t('jobsArea.common.minExperience', { count: v.minExperience })}</span>
          </li>
        ) : null}
        {v.positions > 1 && (
          <li className="flex min-w-0 items-center gap-2">
            <Users className="size-4 shrink-0 text-brand-600" aria-hidden /> <span className="truncate">{t('jobsArea.common.positions', { count: v.positions })}</span>
          </li>
        )}
      </ul>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-2 border-t border-line pt-4">
        {salary ? (
          <p className="flex items-center gap-1.5 font-display text-base font-bold text-navy-900">
            <Euro className="size-4 text-emerald-600" aria-hidden /> {salary}
            <span className="text-xs font-medium text-muted">{t('jobsArea.common.perMonth')}</span>
          </p>
        ) : (
          <span />
        )}
        {v.validThrough ? (
          <p className="flex items-center gap-1 text-xs text-muted">
            <CalendarClock className="size-3.5" aria-hidden /> {t('jobsArea.common.closesOn', { date: fmtDate(v.validThrough) })}
          </p>
        ) : v.datePosted ? (
          <p className="text-xs text-muted">{t('jobsArea.common.postedOn', { date: fmtDate(v.datePosted) })}</p>
        ) : null}
      </div>
    </Link>
  );
};
