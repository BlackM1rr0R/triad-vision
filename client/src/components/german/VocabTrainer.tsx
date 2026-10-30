import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BookOpenCheck, CheckCircle2, Flame, Layers, Play, RotateCcw, Volume2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesGermanVocab } from '@/i18n/pagesGermanVocab';
import { Spinner } from '@/components/ui/Spinner';
import { useApiError } from '@/components/portal/useApiError';
import { useGermanSpeech } from '@/components/prep/useSpeech';
import { useVocabSummary, VOCAB_KEY } from './api';
import { GRADES, VOCAB_FIELDS, VOCAB_LEVELS, type GradeKey, type VocabCard, type VocabGroup, type VocabSession, type VocabSummary } from './types';

registerCopy(pagesGermanVocab);

const EASE = [0.22, 1, 0.36, 1] as const;
const GRADE_TONE: Record<GradeKey, string> = {
  again: 'border-danger-border bg-danger-bg text-danger-fg',
  hard: 'border-warning-border bg-warning-bg text-warning-fg',
  good: 'border-success/30 bg-success-bg text-success-fg',
  easy: 'border-line bg-sunken text-link',
};

/** Which translation a card shows: az / ru as the interface, English otherwise (also for the German UI). */
export const translationLang = (lng: string): 'az' | 'ru' | 'en' => (lng.startsWith('az') ? 'az' : lng.startsWith('ru') ? 'ru' : 'en');

export const wordLabel = (c: Pick<VocabCard, 'article' | 'de'>) => (c.article ? `${c.article} ${c.de}` : c.de);

const Bar = ({ value, max, className }: { value: number; max: number; className?: string }) => (
  <span className="block h-1.5 overflow-hidden rounded-full bg-line">
    <span className={clsx('block h-full rounded-full', className ?? 'bg-highlight')} style={{ width: `${max ? Math.min(100, Math.round((value / max) * 100)) : 0}%` }} />
  </span>
);

const GroupList = ({ title, groups, label }: { title: string; groups: VocabGroup[]; label: (key: string) => string }) => {
  const { t } = useTranslation();
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted uppercase">{title}</h3>
      <ul className="mt-2 space-y-2">
        {groups
          .filter((g) => g.total > 0)
          .map((g) => (
            <li key={g.key} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-ink">{label(g.key)}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums" title={`${t('germanVocab.started')}: ${g.started}`}>
                  {g.learned}/{g.total}
                </span>
              </div>
              <Bar value={g.started} max={g.total} className="bg-primary/40" />
            </li>
          ))}
      </ul>
    </div>
  );
};

/** 14 small bars: reviews per day (the last one is today). */
export const ActivityBars = ({ activity }: { activity: VocabSummary['activity'] }) => {
  const { t } = useTranslation();
  const max = Math.max(1, ...activity.map((d) => d.reviews));
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted uppercase">{t('germanVocab.activity')}</h3>
      <ol className="mt-2 flex h-14 items-end gap-1" aria-label={t('germanVocab.activity')}>
        {activity.map((d) => (
          <li key={d.day} className="flex h-full flex-1 items-end" title={t('germanVocab.reviewsOn', { day: d.day, count: d.reviews })}>
            <span className={clsx('block w-full rounded-sm', d.reviews ? 'bg-highlight' : 'bg-line')} style={{ height: `${Math.max(8, Math.round((d.reviews / max) * 100))}%` }} />
            <span className="sr-only">{t('germanVocab.reviewsOn', { day: d.day, count: d.reviews })}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

// ─── Session ───────────────────────────────────────────────────────────

const Flashcard = ({ card, index, total, onGrade, busy }: { card: VocabCard; index: number; total: number; onGrade: (g: GradeKey) => void; busy: boolean }) => {
  const { t, i18n } = useTranslation();
  const [shown, setShown] = useState(false);
  const speech = useGermanSpeech();
  const lang = translationLang(i18n.language);

  useEffect(() => {
    // Space / Enter reveals, 1–4 answers.
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setShown(true);
      } else if (shown && !busy && ['1', '2', '3', '4'].includes(e.key)) {
        onGrade((['again', 'hard', 'good', 'easy'] as const)[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, busy, onGrade]);

  const when = (g: GradeKey) => (card.preview[g] === 0 ? t('germanVocab.inMinutes') : t('germanVocab.inDays', { count: card.preview[g] }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex flex-wrap gap-1.5">
          <span className={clsx('badge', card.state === 'new' ? 'bg-accent-bg text-accent-fg' : 'bg-info-bg text-info-fg')}>{t(`germanVocab.card.${card.state}`)}</span>
          <span className="badge bg-sunken text-muted">{card.level}</span>
          <span className="badge bg-sunken text-muted">{t(`germanVocab.fields.${card.field}`)}</span>
        </span>
        <span className="font-semibold text-muted tabular-nums">{t('germanVocab.card.progress', { n: index + 1, total })}</span>
      </div>
      <div className="mt-2">
        <Bar value={index} max={total} />
      </div>

      <div className="mt-6 text-center">
        <p className="text-sm text-muted">{t('germanVocab.card.question')}</p>
        <p className="mt-2 font-display text-3xl font-semibold break-words text-ink sm:text-4xl" lang="de">
          {wordLabel(card)}
        </p>
        {card.plural && (
          <p className="mt-1 text-sm text-muted" lang="de">
            {t('germanVocab.card.plural')}: die {card.plural}
          </p>
        )}
        {speech.available && (
          <button type="button" className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-link" onClick={() => speech.speak(card.id, wordLabel(card))}>
            <Volume2 className="size-4" aria-hidden /> {t('germanVocab.card.listen')}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {!shown ? (
          <motion.div key="hidden" className="mt-6 flex justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" className="btn-primary" onClick={() => setShown(true)}>
              {t('germanVocab.card.show')}
            </button>
          </motion.div>
        ) : (
          <motion.div key="shown" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
            <div className="mt-5 rounded-2xl border border-line bg-sunken px-4 py-4 text-center">
              <p className="text-xl font-semibold text-ink">{card.translations[lang] || card.translations.en}</p>
              {card.example && (
                <p className="mt-2 text-sm text-muted italic" lang="de">
                  „{card.example}“
                </p>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(GRADES) as GradeKey[]).map((g, i) => (
                <button key={g} type="button" disabled={busy} onClick={() => onGrade(g)} className={clsx('flex min-h-14 flex-col items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition hover:brightness-95 disabled:opacity-60', GRADE_TONE[g])}>
                  <span>
                    {t(`germanVocab.grades.${g}`)} <kbd className="ml-1 hidden text-[10px] opacity-60 sm:inline">{i + 1}</kbd>
                  </span>
                  <span className="text-[11px] font-normal opacity-80">{when(g)}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * Portal vocabulary trainer: streak and today's goal, level / job-field filter, flashcard session with
 * SM-2 answers (the server schedules the next review), progress per level and field.
 */
export const VocabTrainer = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const apiError = useApiError();
  const { data: s } = useVocabSummary();
  const [level, setLevel] = useState('');
  const [field, setField] = useState('');
  const [queue, setQueue] = useState<VocabCard[] | null>(null);
  const [pos, setPos] = useState(0);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!s) return null;

  const load = async () => {
    setLoading(true);
    try {
      const params = { ...(level ? { level } : {}), ...(field ? { field } : {}), limit: 20 };
      const res = (await api.get<VocabSession>('/german/vocab/session', { params })).data;
      setQueue(res.cards);
      setPos(0);
      setStats({ correct: 0, total: 0 });
    } catch (err) {
      apiError(err);
    } finally {
      setLoading(false);
    }
  };

  const grade = async (g: GradeKey) => {
    if (!queue || busy) return;
    const card = queue[pos];
    setBusy(true);
    try {
      const res = (await api.post<{ correct: boolean; summary: VocabSummary }>('/german/vocab/review', { wordId: card.id, grade: GRADES[g] })).data;
      qc.setQueryData(VOCAB_KEY, res.summary);
      // A forgotten word comes back once more at the end of this session.
      const relearn = !res.correct && queue.slice(pos + 1).every((c) => c.id !== card.id);
      setQueue(relearn ? [...queue, { ...card, state: 'review', preview: { again: 0, hard: 1, good: 1, easy: 1 } }] : queue);
      setStats((x) => ({ correct: x.correct + (res.correct ? 1 : 0), total: x.total + 1 }));
      setPos((p) => p + 1);
    } catch (err) {
      apiError(err);
    } finally {
      setBusy(false);
    }
  };

  const levelOptions = VOCAB_LEVELS.filter((l) => (s.levels.find((g) => g.key === l)?.total ?? 0) > 0);
  const fieldOptions = VOCAB_FIELDS.filter((f) => (s.fields.find((g) => g.key === f)?.total ?? 0) > 0);
  const inSession = queue !== null;
  const finished = inSession && pos >= queue.length;

  return (
    <section className="card overflow-hidden" aria-labelledby="vocab-title">
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="vocab-title" className="flex items-center gap-2.5 text-base font-semibold text-ink">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
                <Layers className="size-4" aria-hidden />
              </span>
              {t('germanVocab.title')}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">{t('germanVocab.subtitle')}</p>
          </div>
          {inSession && (
            <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken" onClick={() => setQueue(null)} aria-label={t('germanVocab.close')}>
              <X className="size-4" />
            </button>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-2xl border border-line bg-sunken px-4 py-3">
            <dt className="text-[11px] font-semibold text-muted uppercase">{t('germanVocab.streak')}</dt>
            <dd className="mt-1 flex items-center gap-1.5 font-display text-xl font-semibold">
              <Flame className={clsx('size-5', s.streak.practisedToday ? 'text-warning-fg' : 'text-muted')} aria-hidden /> {s.streak.current}
            </dd>
            <dd className="text-[11px] text-muted">{t('germanVocab.best', { count: s.streak.best })}</dd>
          </div>
          <div className="rounded-2xl border border-line bg-sunken px-4 py-3">
            <dt className="text-[11px] font-semibold text-muted uppercase">{t('germanVocab.today')}</dt>
            <dd className="mt-1 font-display text-xl font-semibold">{t('germanVocab.goal', { done: s.today.reviews, goal: s.today.goal })}</dd>
            <dd className="mt-1.5">
              <Bar value={s.today.reviews} max={s.today.goal} className="bg-success" />
            </dd>
          </div>
          <div className="rounded-2xl border border-line bg-sunken px-4 py-3">
            <dt className="text-[11px] font-semibold text-muted uppercase">{t('germanVocab.due')}</dt>
            <dd className="mt-1 font-display text-xl font-semibold">{s.due}</dd>
            <dd className="text-[11px] text-muted">{t('germanVocab.newLeft', { count: Math.max(0, s.today.newLimit - s.today.newWords) })}</dd>
          </div>
          <div className="rounded-2xl border border-line bg-sunken px-4 py-3">
            <dt className="text-[11px] font-semibold text-muted uppercase">{t('germanVocab.learned')}</dt>
            <dd className="mt-1 font-display text-xl font-semibold">{s.learned}</dd>
            <dd className="text-[11px] text-muted">{t('germanVocab.of', { total: s.total })}</dd>
          </div>
        </dl>
      </div>

      <div className="p-5 sm:p-6">
        {!inSession ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-w-0">
              <p className={clsx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold', s.streak.practisedToday ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg')}>
                {s.streak.practisedToday ? <CheckCircle2 className="size-3.5" aria-hidden /> : <Flame className="size-3.5" aria-hidden />}
                {s.streak.practisedToday ? t('germanVocab.practisedToday') : t('germanVocab.notToday')}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="vocab-level" className="label">
                    {t('germanVocab.level')}
                  </label>
                  <select id="vocab-level" className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
                    <option value="">{t('germanVocab.auto', { level: s.recommendedLevel })}</option>
                    {levelOptions.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="vocab-field" className="label">
                    {t('germanVocab.field')}
                  </label>
                  <select id="vocab-field" className="input" value={field} onChange={(e) => setField(e.target.value)}>
                    <option value="">{t('germanVocab.all')}</option>
                    {fieldOptions.map((f) => (
                      <option key={f} value={f}>
                        {t(`germanVocab.fields.${f}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button type="button" className="btn-primary mt-5" disabled={loading} onClick={() => void load()}>
                {loading ? <Spinner className="size-4" /> : <Play className="size-4" aria-hidden />}
                {t('germanVocab.start')}
              </button>
              <div className="mt-6">
                <ActivityBars activity={s.activity} />
              </div>
            </div>
            <div className="space-y-5">
              <GroupList title={t('germanVocab.byLevel')} groups={s.levels} label={(k) => k} />
              <GroupList title={t('germanVocab.byField')} groups={s.fields} label={(k) => t(`germanVocab.fields.${k}`)} />
            </div>
          </div>
        ) : queue.length === 0 ? (
          <div className="py-6 text-center">
            <BookOpenCheck className="mx-auto size-10 text-success" aria-hidden />
            <p className="mt-3 text-ink">{t('germanVocab.allDone')}</p>
            <button type="button" className="btn-secondary mt-4" onClick={() => setQueue(null)}>
              {t('germanVocab.close')}
            </button>
          </div>
        ) : finished ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
            <p className="mt-3 text-lg font-semibold text-ink">{t('germanVocab.finished')}</p>
            <p className="text-sm text-muted">{t('germanVocab.finishedBody', { correct: stats.correct, total: stats.total })}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-primary" disabled={loading} onClick={() => void load()}>
                {loading ? <Spinner className="size-4" /> : <RotateCcw className="size-4" aria-hidden />}
                {t('germanVocab.more')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setQueue(null)}>
                {t('germanVocab.close')}
              </button>
            </div>
          </div>
        ) : (
          <Flashcard key={`${pos}-${queue[pos].id}`} card={queue[pos]} index={pos} total={queue.length} busy={busy} onGrade={(g) => void grade(g)} />
        )}
      </div>
    </section>
  );
};

export default VocabTrainer;
