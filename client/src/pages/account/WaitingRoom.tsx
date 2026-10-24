import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Clock,
  ExternalLink,
  Flame,
  GraduationCap,
  Hourglass,
  ListChecks,
  MessageCircleQuestion,
  PlayCircle,
  RotateCw,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { api } from '@/lib/api';
import { optimistic } from '@/lib/optimistic';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesWaitingRoom } from '@/i18n/pagesWaitingRoom';
import { Markdown, renderInline } from '@/components/ops/Markdown';
import { ProgressRing } from '@/components/portal/ProgressRing';
import { useApiError } from '@/components/portal/useApiError';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { checklistOf, useWaitingRoom, videoEmbed, WR_KEY, type WrGraded, type WrItem, type WrProgress, type WrResponse, type WrStats, type WrTopic } from '@/components/waitingRoom/api';

registerCopy(pagesWaitingRoom);

const KIND_ICON: Record<WrItem['kind'], LucideIcon> = { LESSON: BookOpen, VIDEO: PlayCircle, EXERCISE: Sparkles, CHECKLIST: ListChecks };

/** Updates one item's progress and the stats in the cached list (no refetch flash). */
const usePatchCache = () => {
  const qc = useQueryClient();
  return (id: string, progress: WrProgress, stats: WrStats) =>
    qc.setQueryData<WrResponse>(WR_KEY, (old) => {
      if (!old) return old;
      const items = old.items.map((i) => (i.id === id ? { ...i, progress } : i));
      return { ...old, items, stats, nextId: items.find((i) => !i.progress?.completedAt)?.id ?? null };
    });
};

/** Click-to-load video: nothing is requested from YouTube / Vimeo before the user taps play (DSGVO). */
const VideoEmbed = ({ url, title }: { url: string; title: string }) => {
  const { t } = useTranslation();
  const [play, setPlay] = useState(false);
  const embed = videoEmbed(url);
  if (!embed)
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
        <ExternalLink className="size-4" aria-hidden /> {url}
      </a>
    );
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-navy-950">
      {play ? (
        <iframe
          src={`${embed.src}${embed.src.includes('?') ? '&' : '?'}autoplay=1`}
          title={title}
          className="size-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-3 p-4 text-center text-white">
          <Button icon={PlayCircle} onClick={() => setPlay(true)}>
            {t('waitingRoom.video.play')}
          </Button>
          <p className="max-w-md text-xs text-white/70">{t('waitingRoom.video.consent', { host: embed.host })}</p>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-white/80 underline">
            {t('waitingRoom.video.openExternal', { host: embed.host })}
          </a>
        </div>
      )}
    </div>
  );
};

const CHECK_KEY = (id: string) => `tv.wr.check.${id}`;

const Checklist = ({ item, body }: { item: WrItem; body: string }) => {
  const { t } = useTranslation();
  const { items, intro } = useMemo(() => checklistOf(body), [body]);
  const [ticked, setTicked] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CHECK_KEY(item.id)) ?? '[]') as number[];
    } catch {
      return [];
    }
  });
  const toggle = (i: number) => {
    const next = ticked.includes(i) ? ticked.filter((x) => x !== i) : [...ticked, i];
    setTicked(next);
    try {
      localStorage.setItem(CHECK_KEY(item.id), JSON.stringify(next));
    } catch {
      // storage blocked: ticks last for this visit only
    }
  };
  return (
    <div className="space-y-3">
      {intro && <Markdown source={intro} />}
      <p className="text-xs font-semibold text-muted">{t('waitingRoom.checklistProgress', { done: ticked.filter((i) => i < items.length).length, total: items.length })}</p>
      <ul className="space-y-1.5">
        {items.map((text, i) => (
          <li key={i}>
            <label className={clsx('flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors', ticked.includes(i) ? 'border-success-border bg-success-bg/60 text-ink/70' : 'border-line bg-card text-ink')}>
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-600" checked={ticked.includes(i)} onChange={() => toggle(i)} />
              <span className={clsx(ticked.includes(i) && 'line-through decoration-ink/30')}>{renderInline(text, `c${i}`)}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted">{t('waitingRoom.checklistHint')}</p>
    </div>
  );
};

/** Exercise: choices are sent to the server, which grades them and returns the right answers (instant feedback). */
const Exercise = ({ item, onGraded }: { item: WrItem; onGraded: (g: WrGraded) => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const onError = useApiError();
  const questions = item.exercise ?? [];
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [graded, setGraded] = useState<WrGraded | null>(null);
  const check = useMutation({
    mutationFn: async () => (await api.post<WrGraded>(`/waiting-room/${item.id}/answer`, { answers })).data,
    onSuccess: (g) => {
      setGraded(g);
      onGraded(g);
    },
    onError,
  });
  const complete = answers.every((a) => a !== null);
  const reset = () => {
    setAnswers(questions.map(() => null));
    setGraded(null);
  };

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {questions.map((q, qi) => {
          const result = graded?.results[qi];
          return (
            <li key={qi} className="rounded-xl border border-line bg-card p-4">
              <fieldset disabled={!!graded}>
                <legend className="mb-2 text-sm font-semibold text-ink">
                  <span className="mr-1.5 text-xs font-bold text-muted">{t('waitingRoom.question', { n: qi + 1 })}</span>
                  {tr(q.q)}
                </legend>
                <div className="grid gap-2">
                  {q.options.map((o, oi) => {
                    const chosen = answers[qi] === oi;
                    const isRight = result && result.answer === oi;
                    const isWrongChoice = result && chosen && !result.correct;
                    return (
                      <label
                        key={oi}
                        className={clsx(
                          'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors',
                          isRight ? 'border-success-border bg-success-bg text-success-fg' : isWrongChoice ? 'border-danger-border bg-danger-bg text-danger-fg' : chosen ? 'border-brand-500 bg-brand-50' : 'border-line hover:bg-surface',
                        )}
                      >
                        <input type="radio" name={`${item.id}-${qi}`} className="size-4 shrink-0 accent-brand-600" checked={chosen} onChange={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))} />
                        <span className="flex-1">{tr(o)}</span>
                        {isRight && <CircleCheck className="size-4 shrink-0" aria-label={t('waitingRoom.correct')} />}
                        {isWrongChoice && <CircleX className="size-4 shrink-0" aria-label={t('waitingRoom.wrong')} />}
                      </label>
                    );
                  })}
                </div>
                {result && (
                  <p className={clsx('mt-2 text-xs font-semibold', result.correct ? 'text-success-fg' : 'text-danger-fg')} role="status">
                    {result.correct ? t('waitingRoom.correct') : `${t('waitingRoom.wrong')} · ${t('waitingRoom.rightAnswer', { answer: tr(q.options[result.answer]) })}`}
                  </p>
                )}
              </fieldset>
            </li>
          );
        })}
      </ol>
      {graded ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-2 text-sm font-bold text-ink" role="status" aria-live="polite">
            <Trophy className="size-4 text-brand-600" aria-hidden />
            {t('waitingRoom.score', { right: graded.right, total: graded.total, score: graded.score })}
          </p>
          {graded.best > graded.score && <span className="text-xs text-muted">{t('waitingRoom.best', { score: graded.best })}</span>}
          <Button size="sm" variant="secondary" icon={RotateCw} onClick={reset}>
            {t('waitingRoom.tryAgain')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" icon={ClipboardCheck} onClick={() => check.mutate()} disabled={!complete} loading={check.isPending}>
            {t('waitingRoom.check')}
          </Button>
          {!complete && <span className="text-xs text-muted">{t('waitingRoom.chooseAll')}</span>}
          {item.progress?.score != null && <span className="text-xs text-muted">{t('waitingRoom.best', { score: item.progress.score })}</span>}
        </div>
      )}
    </div>
  );
};

const ItemCard = ({ item, open, onToggle }: { item: WrItem; open: boolean; onToggle: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const onError = useApiError();
  const patch = usePatchCache();
  const qc = useQueryClient();
  const done = !!item.progress?.completedAt;
  const Icon = KIND_ICON[item.kind];
  const body = tr(item.body);

  // Optimistic: the item shows as done (and the stats move) at once; the server's numbers replace the
  // estimate on success, a failure restores the previous state and shows the error.
  const complete = useMutation({
    mutationFn: async () => (await api.post<{ progress: WrProgress; stats: WrStats }>(`/waiting-room/${item.id}/complete`)).data,
    ...optimistic<WrResponse, void>(qc, {
      key: WR_KEY,
      update: (old) => {
        if (!old || done) return old;
        const completed = Math.min(old.stats.total, old.stats.completed + 1);
        const stats = { ...old.stats, completed, points: old.stats.points + 10, percent: old.stats.total ? Math.round((completed / old.stats.total) * 100) : old.stats.percent };
        const items = old.items.map((i) => (i.id === item.id ? { ...i, progress: { completedAt: new Date().toISOString(), score: i.progress?.score ?? null } } : i));
        return { ...old, items, stats, nextId: items.find((i) => !i.progress?.completedAt)?.id ?? null };
      },
      onError,
      keepOnSuccess: true,
    }),
    onSuccess: (r) => {
      toast.success(t('waitingRoom.completedToast', { points: 10 }));
      patch(item.id, r.progress, r.stats);
    },
  });

  return (
    <li id={`wr-${item.id}`} className={clsx('scroll-mt-28 overflow-hidden rounded-2xl border bg-card transition-shadow', open ? 'border-brand-200 shadow-md' : 'border-line')}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`wr-body-${item.id}`} className="flex w-full items-center gap-3 p-4 text-left sm:p-5">
        <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', done ? 'bg-success-bg text-success-fg' : 'bg-brand-50 text-brand-600')}>
          {done ? <CheckCircle2 className="size-5" aria-hidden /> : <Icon className="size-5" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold break-words text-ink">{tr(item.title)}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span>{t(`waitingRoom.kinds.${item.kind}`)}</span>
            <span aria-hidden>·</span>
            <span>{t(`waitingRoom.topics.${item.topic}`)}</span>
            {item.minutes ? (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" aria-hidden />
                  {t('waitingRoom.minutes', { count: item.minutes })}
                </span>
              </>
            ) : null}
            {done && (
              <>
                <span aria-hidden>·</span>
                <span className="font-semibold text-success-fg">
                  {t('waitingRoom.done')}
                  {item.progress?.score != null ? ` · ${item.progress.score}%` : ''}
                </span>
              </>
            )}
          </span>
        </span>
        <ChevronDown className={clsx('size-5 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div id={`wr-body-${item.id}`} className="space-y-4 border-t border-line px-4 pt-4 pb-5 sm:px-5">
          {item.kind === 'VIDEO' && item.videoUrl && <VideoEmbed url={item.videoUrl} title={tr(item.title)} />}
          {item.kind === 'CHECKLIST' ? <Checklist item={item} body={body} /> : body ? <Markdown source={body} /> : null}
          {item.kind === 'EXERCISE' ? (
            <Exercise item={item} onGraded={(g) => patch(item.id, g.progress, g.stats)} />
          ) : (
            <Button size="sm" variant={done ? 'secondary' : 'primary'} icon={CheckCircle2} onClick={() => complete.mutate()} disabled={done || complete.isPending}>
              {done ? t('waitingRoom.done') : t('waitingRoom.markDone')}
            </Button>
          )}
        </div>
      )}
    </li>
  );
};

const Stat = ({ icon: Icon, label, value, children }: { icon: LucideIcon; label: string; value: string | number; children?: ReactNode }) => (
  <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4">
    {children ?? (
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="size-5" aria-hidden />
      </span>
    )}
    <span className="min-w-0">
      <span className="block text-xl leading-tight font-extrabold text-ink tabular-nums">{value}</span>
      <span className="block truncate text-xs font-medium text-muted">{label}</span>
    </span>
  </div>
);

export default function AccountWaitingRoom() {
  const { t } = useTranslation();
  usePageTitle(t('waitingRoom.title'));
  const [params, setParams] = useSearchParams();
  const { data, isLoading, isError, refetch, isFetching } = useWaitingRoom();
  const [topic, setTopic] = useState<WrTopic | ''>('');
  const [openId, setOpenId] = useState<string | null>(params.get('item'));

  // Deep link (?item=… from the dashboard card): open and scroll to it once.
  useEffect(() => {
    const id = params.get('item');
    if (!id || !data) return;
    setOpenId(id);
    const timer = window.setTimeout(() => document.getElementById(`wr-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    return () => window.clearTimeout(timer);
  }, [params, data]);

  const topics = useMemo(() => Array.from(new Set((data?.items ?? []).map((i) => i.topic))), [data]);
  const items = (data?.items ?? []).filter((i) => !topic || i.topic === topic);

  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-busy="true">
        <Skeleton className="h-24 w-full" rounded="xl" />
        <Skeleton className="h-16 w-full" rounded="xl" />
        <Skeleton className="h-16 w-full" rounded="xl" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-warning" aria-hidden />
        <p className="mt-4 font-semibold text-ink">{t('waitingRoom.error')}</p>
        <Button className="mt-6" icon={RotateCw} onClick={() => void refetch()} loading={isFetching}>
          {t('accountPage.dash.retry', { defaultValue: 'Retry' })}
        </Button>
      </div>
    );
  }

  const { stats } = data;
  return (
    <div className="space-y-6">
      <header>
        <h2 className="type-page-title flex items-center gap-2">
          <Hourglass className="size-6 text-brand-600" aria-hidden />
          {t('waitingRoom.title')}
        </h2>
        <p className="type-small mt-1 max-w-2xl">{t('waitingRoom.subtitle')}</p>
        {data.case && <p className="mt-1 text-xs text-muted">{t('waitingRoom.caseNote')}</p>}
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={Trophy} label={t('waitingRoom.stats.done', { done: stats.completed, total: stats.total })} value={`${stats.percent}%`}>
          <ProgressRing percent={stats.percent} size={44} stroke={5} label={t('waitingRoom.stats.progress')} />
        </Stat>
        <Stat icon={Sparkles} label={t('waitingRoom.stats.points')} value={stats.points} />
        <Stat icon={Flame} label={t('waitingRoom.stats.streak')} value={stats.streak} />
      </div>

      <section aria-label={t('waitingRoom.links.title')} className="flex flex-wrap gap-2">
        <Link to="/account/german" className="btn-secondary btn-sm min-h-10">
          <GraduationCap className="size-4" aria-hidden /> {t('waitingRoom.links.german')}
        </Link>
        <Link to="/account/interview-prep" className="btn-secondary btn-sm min-h-10">
          <MessageCircleQuestion className="size-4" aria-hidden /> {t('waitingRoom.links.prep')}
        </Link>
      </section>

      {topics.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label={t('waitingRoom.filterAll')}>
          {(['', ...topics] as const).map((k) => (
            <button
              key={k || 'all'}
              type="button"
              aria-pressed={topic === k}
              onClick={() => setTopic(k)}
              className={clsx('min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors', topic === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-ink/80 hover:bg-surface')}
            >
              {k ? t(`waitingRoom.topics.${k}`) : t('waitingRoom.filterAll')}
            </button>
          ))}
        </div>
      )}

      {!data.items.length ? (
        <div className="card p-8 text-center">
          <Hourglass className="mx-auto size-10 text-brand-600" aria-hidden />
          <p className="mt-3 font-semibold text-ink">{t('waitingRoom.empty')}</p>
          <p className="type-small mt-1">{t('waitingRoom.emptyText')}</p>
        </div>
      ) : (
        <>
          {stats.total > 0 && stats.completed === stats.total && (
            <p className="flex items-center gap-2 rounded-xl border border-success-border bg-success-bg px-4 py-3 text-sm font-semibold text-success-fg">
              <Trophy className="size-4 shrink-0" aria-hidden />
              {t('waitingRoom.allDone')}
            </p>
          )}
          <ul className="space-y-3">
            {items.map((i) => (
              <ItemCard
                key={i.id}
                item={i}
                open={openId === i.id}
                onToggle={() => {
                  const next = openId === i.id ? null : i.id;
                  setOpenId(next);
                  if (params.get('item')) setParams({}, { replace: true });
                }}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
