import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowUpRight, Building2, CalendarClock, Clock, Euro, Languages, MapPin, Users } from 'lucide-react';
import { fmtDate } from '@/components/admin/labels';
import { useJobLabels } from './labels';
import type { PublicVacancy } from './types';
import { useMorphSource } from '@/lib/viewTransition';
import { vacancyImageSrcSet, vacancyImages } from './images';

/** Vacancy card on the public board. */
export const JobCard = ({ v, className }: { v: PublicVacancy; className?: string }) => {
  const { t } = useTranslation();
  const L = useJobLabels();
  const salary = L.salary(v.salaryMin, v.salaryMax);
  // The card grows into the vacancy page's hero and its title moves into the hero title (lib/viewTransition.ts).
  const morph = useMorphSource('job', v.slug);
  const cover = vacancyImages(v)[0];
  return (
    <Link
      ref={morph.ref}
      onClick={morph.onClick}
      {...morph.part('card')}
      to={`/jobs/${v.slug}`}
      className={clsx(
        'group card card-interactive flex h-full flex-col rounded-3xl p-5 sm:p-6',
        className,
      )}
    >
      {cover && (
        // Cover photo (lazy; the server's -480 / -960 WebP variants via srcset). Decorative next to the title
        // unless the employer gave it an alt text.
        <div className="-mx-5 -mt-5 mb-4 aspect-[16/9] overflow-hidden rounded-t-3xl bg-sunken sm:-mx-6 sm:-mt-6">
          <img
            src={cover.url}
            srcSet={vacancyImageSrcSet(cover)}
            sizes="(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw"
            width={cover.w ?? 1600}
            height={cover.h ?? 900}
            alt={cover.alt ?? ''}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {v.sector && <span className="badge chip-sky">{L.sector(v.sector)}</span>}
            <span className="badge bg-sunken text-muted">{L.employmentType(v.employmentType)}</span>
          </div>
          <h3 {...morph.part('title')} className="mt-3 w-fit font-display text-lg leading-snug font-semibold break-words text-ink group-hover:text-link">
            {L.title(v.title)}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <Building2 className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{v.companyName ?? t('jobsArea.common.confidentialEmployer')}</span>
          </p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-ink transition-colors group-hover:bg-primary group-hover:text-primary-contrast" aria-hidden>
          <ArrowUpRight className="size-4" />
        </span>
      </div>

      <ul className="mt-4 mb-4 grid grid-cols-1 gap-2 text-sm text-muted min-[400px]:grid-cols-2">
        {v.city && (
          <li className="flex min-w-0 items-center gap-2">
            <MapPin className="size-4 shrink-0 text-subtle" aria-hidden /> <span className="truncate">{v.city}</span>
          </li>
        )}
        <li className="flex min-w-0 items-center gap-2">
          <Languages className="size-4 shrink-0 text-subtle" aria-hidden />
          <span className="truncate">{v.germanLevel && v.germanLevel !== 'none' ? t('jobsArea.common.germanMin', { level: v.germanLevel }) : t('jobsArea.german.none')}</span>
        </li>
        {v.minExperience ? (
          <li className="flex min-w-0 items-center gap-2">
            <Clock className="size-4 shrink-0 text-subtle" aria-hidden /> <span className="truncate">{t('jobsArea.common.minExperience', { count: v.minExperience })}</span>
          </li>
        ) : null}
        {v.positions > 1 && (
          <li className="flex min-w-0 items-center gap-2">
            <Users className="size-4 shrink-0 text-subtle" aria-hidden /> <span className="truncate">{t('jobsArea.common.positions', { count: v.positions })}</span>
          </li>
        )}
      </ul>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-2 border-t border-line pt-4">
        {salary ? (
          <p className="flex items-center gap-1.5 font-display text-base font-semibold text-ink">
            <Euro className="size-4 text-muted" aria-hidden /> {salary}
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
