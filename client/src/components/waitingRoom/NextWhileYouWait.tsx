import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BookOpen, Flame, Hourglass, ListChecks, PlayCircle, Sparkles } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesWaitingRoom } from '@/i18n/pagesWaitingRoom';
import { useWaitingRoom, type WrItem } from './api';

registerCopy(pagesWaitingRoom);

const KIND_ICON = { LESSON: BookOpen, VIDEO: PlayCircle, EXERCISE: Sparkles, CHECKLIST: ListChecks } as const;

/**
 * Dashboard card "Next while you wait": the first waiting-room item not done yet, with the progress.
 * Hidden when the waiting room has no content for this client.
 */
export function NextWhileYouWait() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { data } = useWaitingRoom();
  if (!data?.items.length) return null;
  const next: WrItem | undefined = data.items.find((i) => i.id === data.nextId);
  const Icon = next ? KIND_ICON[next.kind] : Hourglass;
  const pct = Math.max(0, Math.min(100, data.stats.percent));
  return (
    <section className="card card-body flex flex-col">
      <h2 className="type-card-title flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-sky">
          <Hourglass className="size-5" aria-hidden />
        </span>
        {t('waitingRoom.next.title')}
      </h2>
      {next ? (
        <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-ink">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0">
            {tr(next.title)}
            <span className="block text-xs font-normal text-muted">
              {t(`waitingRoom.kinds.${next.kind}`)}
              {next.minutes ? ` · ${t('waitingRoom.minutes', { count: next.minutes })}` : ''}
            </span>
          </span>
        </p>
      ) : (
        <p className="type-small mt-3">{t('waitingRoom.next.allDone')}</p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('waitingRoom.stats.progress')}>
          <span className="block h-full rounded-full bg-highlight" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-semibold text-muted tabular-nums">{t('waitingRoom.stats.done', { done: data.stats.completed, total: data.stats.total })}</span>
        {data.stats.streak > 1 && (
          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-warning-fg" title={t('waitingRoom.stats.streak')}>
            <Flame className="size-3.5" aria-hidden />
            {data.stats.streak}
          </span>
        )}
      </div>
      <Link
        to={next ? `/account/waiting-room?item=${next.id}` : '/account/waiting-room'}
        className="mt-auto inline-flex min-h-11 items-center gap-1 pt-3 text-sm font-semibold text-link hover:text-link"
      >
        {next ? t('waitingRoom.next.open') : t('waitingRoom.next.all')}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  );
}
