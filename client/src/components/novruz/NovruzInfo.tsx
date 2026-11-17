import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarDays, Flower2, Sparkles, X } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesNovruzCard } from '@/i18n/pagesNovruzCard';
import { localIsoDay, nextNovruz, novruzBannerVisible, type NovruzDates } from '@/lib/novruzCard/data';
import { holidayRange } from '@/lib/employerGuideAz/holidays';
import { loadProgress, saveProgress } from '@/lib/games/common';

registerCopy(pagesNovruzCard);

/** "Novruz 2027: usually around 20–21 March …" or the official days off from the Cabinet decree (client date). */
export const NovruzDatesNote = () => {
  const { t } = useTranslation();
  const [d, setD] = useState<NovruzDates | null>(null);
  useEffect(() => setD(nextNovruz(localIsoDay())), []); // after mount: the visitor's date, no SSR mismatch
  if (!d) return null;
  return (
    <div className="rounded-2xl border border-line bg-card p-4 text-sm leading-relaxed text-ink">
      <p className="flex items-start gap-2 font-semibold">
        <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        {d.official ? t('novruz.dates.official', { year: d.year, range: holidayRange(d.official) }) : t('novruz.dates.usual', { year: d.year })}
      </p>
      <p className="mt-1 text-muted">{t('novruz.dates.tip')}</p>
    </div>
  );
};

const DISMISS_KEY = 'novruz.bannerDismissed';

/**
 * Company portal reminder from 1 to 21 March: "Novruz is coming – greet your Azerbaijani team" with a link to the
 * card generator. Dismissable per year (localStorage). Renders nothing outside the window (client date only).
 */
export const NovruzBanner = () => {
  const { t } = useTranslation();
  const [year, setYear] = useState<number | null>(null);
  useEffect(() => {
    const today = localIsoDay();
    const y = Number(today.slice(0, 4));
    if (novruzBannerVisible(today) && loadProgress<number | null>(DISMISS_KEY, null) !== y) setYear(y);
  }, []);
  if (!year) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-success-border bg-success-bg p-4 sm:p-5" role="status">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card text-success-fg">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-success-fg">{t('novruz.banner.title')}</p>
        <p className="mt-0.5 text-sm text-success-fg">{t('novruz.banner.text')}</p>
        <Link to="/company/novruz-card" className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link underline hover:text-link-hover">
          {t('novruz.banner.cta')} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <button
        type="button"
        className="grid size-10 shrink-0 place-items-center rounded-full text-success-fg hover:bg-card"
        aria-label={t('novruz.banner.dismiss')}
        onClick={() => {
          saveProgress(DISMISS_KEY, year);
          setYear(null);
        }}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
};

/** Teaser card for the employer guide (and similar pages). */
export const NovruzTeaser = () => {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-line bg-sunken p-4 text-sm">
      <p className="font-semibold text-ink">{t('novruz.teaser.title')}</p>
      <p className="mt-0.5 text-muted">{t('novruz.teaser.text')}</p>
      <Link to="/novruz-card" className="mt-2 inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
        {t('novruz.teaser.cta')} <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
};

/** Company portal: "Novruz card" button for one worker (worker drawer) → /company/novruz-card?worker=<caseId>. */
export const NovruzCardLink = ({ caseId }: { caseId?: string }) => {
  const { t } = useTranslation();
  return (
    <Link to={caseId ? `/company/novruz-card?worker=${encodeURIComponent(caseId)}` : '/company/novruz-card'} className="btn-secondary btn-sm">
      <Flower2 className="size-4" aria-hidden /> {t('novruz.portal.open')}
    </Link>
  );
};
