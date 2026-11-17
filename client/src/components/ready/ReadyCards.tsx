import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, CheckCircle2, Medal, PenLine, Trophy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesGermanyReady } from '@/i18n/pagesGermanyReady';
import { READY_ACTIVITIES } from '@/lib/readyProgress/activities';
import { challengeHref, useReadySummary, type ReadyChallenge, type ReadyLevel } from '@/lib/readyProgress/api';

registerCopy(pagesGermanyReady);

const PATHS: Record<string, string> = Object.fromEntries(READY_ACTIVITIES.map((a) => [a.id, a.path]));

export const LEVEL_TONE: Record<ReadyLevel, string> = {
  BRONZE: 'bg-[#b8733a] text-white',
  SILVER: 'bg-[#8c949e] text-white',
  GOLD: 'bg-[#e8a317] text-[#2a1b00]',
};

/** Progress bar with an accessible name. */
export const Bar = ({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) => (
  <div className={clsx('h-2 overflow-hidden rounded-full bg-sunken', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
    <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${max ? Math.min(100, Math.round((value / max) * 100)) : 0}%` }} />
  </div>
);

/** The challenge of the ISO week: what to do, progress, link to the game; "done" earns a badge. */
export const WeeklyChallengeCard = ({ challenge, className }: { challenge: ReadyChallenge; className?: string }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const g = (k: string, o?: Record<string, unknown>) => String(t(`gready.challenge.${k}`, o));
  const ends = new Date(new Date(challenge.endsAt).getTime() - 1000);
  return (
    <section className={clsx('card p-5', className)} aria-labelledby="weekly-challenge-h">
      <div className="flex items-start gap-3">
        <span className={clsx('grid size-11 shrink-0 place-items-center rounded-full', challenge.done ? 'bg-success text-white' : 'bg-highlight-bg text-ink')}>
          {challenge.done ? <CheckCircle2 className="size-5" aria-hidden /> : <Trophy className="size-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="weekly-challenge-h" className="text-xs font-semibold tracking-wide text-muted uppercase">
            {g('title')} · {g('ends', { date: date(ends, { day: 'numeric', month: 'short' }) })}
          </h2>
          <p className="mt-0.5 font-display text-base font-semibold text-ink">{t(`gready.challenge.k.${challenge.key}`)}</p>
          <Bar className="mt-2" value={challenge.value} max={challenge.goal} label={g('title')} />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span className="tabular-nums">{g('progress', { value: challenge.value, goal: challenge.goal })}</span>
            {challenge.completedTotal > 0 && <span>{g('total', { count: challenge.completedTotal })}</span>}
          </div>
          {challenge.done ? (
            <p className="mt-2 text-sm font-semibold text-success-fg" role="status">
              {g('done')}
            </p>
          ) : (
            <Link to={challengeHref(challenge, PATHS)} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link hover:underline">
              {g('go')} <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
};

/** Portal dashboard: points / level of "Germany Ready" with the weekly challenge. */
export const ReadyHomeCard = () => {
  const { t } = useTranslation();
  const q = useReadySummary();
  if (!q.data) return null;
  const s = q.data;
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 [&>*]:min-w-0">
      <section className="card p-5" aria-labelledby="ready-home-h">
        <div className="flex items-start gap-3">
          <span className={clsx('grid size-11 shrink-0 place-items-center rounded-full', s.level ? LEVEL_TONE[s.level] : 'bg-primary/10 text-primary')}>
            <Medal className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="ready-home-h" className="font-display text-base font-semibold text-ink">
              {t('gready.card.title')}
              {s.level && <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold text-ink">{t(`gready.level.${s.level}`)}</span>}
            </h2>
            <Bar className="mt-2" value={s.points} max={s.maxPoints} label={t('gready.title')} />
            <p className="mt-1 text-xs text-muted tabular-nums">
              {t('gready.points', { points: s.points, max: s.maxPoints })} · {t('gready.doneCount', { done: s.done })}
            </p>
            <Link to="/account/germany-ready" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link hover:underline">
              {t('gready.card.open')} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
      <WeeklyChallengeCard challenge={s.challenge} />
    </div>
  );
};

/** "Letter to my future self" invitation (portal home before the arrival; registration success screen). */
export const FutureLetterCta = ({ className, hideWhenWritten = true }: { className?: string; hideWhenWritten?: boolean }) => {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['future-letter'],
    queryFn: async () => (await api.get<{ letter: { delivered: boolean } | null; arrived: boolean }>('/account/future-letter')).data,
    staleTime: 60_000,
    retry: false,
  });
  if (!q.data || q.data.arrived || (hideWhenWritten && q.data.letter)) return null;
  return (
    <Link to="/account/future-letter" className={clsx('card flex items-center gap-3 p-4 hover:bg-sunken/60', className)}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-highlight-bg text-ink">
        <PenLine className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{t('futureLetter.cta')}</span>
        <span className="block text-sm text-muted">{t('futureLetter.ctaText')}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
    </Link>
  );
};
