import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlarmClock, ArrowRight, CalendarClock, Clock, Euro, Languages, MapPin, Star } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import { euro, intakeLabel, type DeadlineOccurrence, type PublicStudyProgramme } from '@/lib/study';

/** "15 January 2027" in the page language; German calendar date, fixed zone (same on server and in the browser). */
export const useStudyDate = () => {
  const { date } = useL10n();
  return (iso: string) => date(`${iso}T12:00:00.000Z`, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/** "in 12 days" / "closes today" (days computed by the server for today's German date). */
export const useDaysLeft = () => {
  const { t } = useTranslation();
  return (d: DeadlineOccurrence) => (d.daysLeft === 0 ? t('study.card.today') : d.daysLeft === 1 ? t('study.card.tomorrow') : t('study.card.daysLeft', { n: d.daysLeft }));
};

/** Next deadline: date, countdown, "soon" / "open" marker. */
export const DeadlineLine = ({ d, soon, className }: { d: DeadlineOccurrence | null; soon?: boolean; className?: string }) => {
  const { t } = useTranslation();
  const fmt = useStudyDate();
  const left = useDaysLeft();
  if (!d) return <p className={clsx('text-sm text-muted', className)}>{t('study.card.noDeadline')}</p>;
  return (
    <div className={clsx('flex flex-wrap items-center gap-x-2 gap-y-1 text-sm', className)}>
      <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
        <CalendarClock className="size-4 text-muted" aria-hidden />
        <time dateTime={d.closes}>{fmt(d.closes)}</time>
      </span>
      <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold', soon ? 'bg-warning-bg text-warning-fg' : 'bg-sunken text-muted')}>
        {soon && <AlarmClock className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />}
        {left(d)}
      </span>
      <span className="text-xs text-muted">{intakeLabel(t, d.intake, d.intakeYear)}</span>
    </div>
  );
};

export const StudyCard = ({ p }: { p: PublicStudyProgramme }) => {
  const { t } = useTranslation();
  return (
    <article className={clsx('card flex h-full flex-col rounded-3xl p-5', p.featured && 'ring-2 ring-highlight/60')}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-link">{t(`study.degree.${p.degree}`)}</span>
        <span className="rounded-full bg-sunken px-2.5 py-1 text-muted">{t(`study.subject.${p.subjectArea}`)}</span>
        {p.featured && (
          <span className="inline-flex items-center gap-1 rounded-full bg-highlight/20 px-2.5 py-1 text-ink">
            <Star className="size-3.5" aria-hidden /> {t('study.card.featured')}
          </span>
        )}
        {p.soon && <span className="rounded-full bg-warning-bg px-2.5 py-1 text-warning-fg">{t('study.card.soon')}</span>}
      </div>
      <h2 className="mt-3 font-display text-lg leading-snug font-semibold text-ink">
        <Link to={`/study/${p.slug}`} className="hover:underline">
          {p.name}
        </Link>
      </h2>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
        <MapPin className="size-4 shrink-0" aria-hidden /> {p.university} · {p.city}
      </p>
      <ul className="mt-4 grid gap-1.5 text-sm text-ink">
        <li className="flex items-center gap-2">
          <Languages className="size-4 shrink-0 text-muted" aria-hidden /> {t(`study.lang.${p.teachingLanguage}`)}
          {p.languageRequirement && <span className="truncate text-muted">· {p.languageRequirement}</span>}
        </li>
        <li className="flex items-center gap-2">
          <Clock className="size-4 shrink-0 text-muted" aria-hidden /> {t('study.card.semesters', { n: p.durationSemesters })}
        </li>
        <li className="flex items-center gap-2">
          <Euro className="size-4 shrink-0 text-muted" aria-hidden />
          {p.tuitionPerSemester > 0 ? t('study.card.tuition', { amount: euro(p.tuitionPerSemester) }) : <span className="font-semibold text-success-fg">{t('study.card.free')}</span>}
        </li>
      </ul>
      <div className="mt-4 border-t border-line pt-3">
        <p className="text-xs text-muted">{t('study.card.nextDeadline')}</p>
        <DeadlineLine d={p.nextDeadline} soon={p.soon} className="mt-1" />
      </div>
      <Link to={`/study/${p.slug}`} className="mt-auto inline-flex min-h-11 items-center gap-1.5 pt-3 text-sm font-semibold text-link hover:underline">
        {t('study.card.details')} <ArrowRight className="size-4" aria-hidden />
        <span className="sr-only">: {p.name}</span>
      </Link>
    </article>
  );
};
