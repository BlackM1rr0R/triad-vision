import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Building2, Dumbbell, Eye, EyeOff, Landmark, Lightbulb, RotateCcw, Shuffle, Square, Timer, Volume2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesPrep } from '@/i18n/pagesPrep';
import { btnSecondary } from '@/components/prep/ui';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { CalendarSubscribe } from '@/components/prep/CalendarSubscribe';
import { categoryLabel, PREP_KINDS, type PrepKind, type PrepQuestion, type VisaType } from '@/components/prep/types';
import { useGermanSpeech } from '@/components/prep/useSpeech';
import { usePractised } from '@/components/prep/usePractised';

registerCopy(pagesPrep);

type PrepResponse = { visaType: VisaType | null; caseVisaType: VisaType | null; items: PrepQuestion[] };
const PRACTICE_SECONDS = 60;
const KIND_ICON = { EMBASSY: Landmark, EMPLOYER: Building2 } as const;

/** German text spoken / shown for a question: the German question, then the model answer. */
const speechText = (q: PrepQuestion, withAnswer: boolean) => (withAnswer ? `${q.question.de}. ${q.answerDe}` : q.question.de);

/** Highlights [placeholders] in the model answer. */
const AnswerText = ({ text }: { text: string }) => (
  <p className="text-[15px] leading-relaxed text-ink" lang="de">
    {text.split(/(\[[^\]]+\])/g).map((part, i) =>
      part.startsWith('[') ? (
        <mark key={i} className="rounded bg-brand-100 px-1 text-brand-800">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    )}
  </p>
);

const SpeakButton = ({ id, text, speech }: { id: string; text: string; speech: ReturnType<typeof useGermanSpeech> }) => {
  const { t } = useTranslation();
  if (!speech.available) return null;
  const active = speech.speaking === id;
  return (
    <button
      type="button"
      onClick={() => (active ? speech.stop() : speech.speak(id, text))}
      aria-pressed={active}
      className={clsx('inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors', active ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-ink/80 hover:border-brand-400')}
    >
      {active ? <Square className="size-3.5" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />}
      {active ? t('prep.page.stop') : t('prep.page.readAloud')}
    </button>
  );
};

// ─── Question card ────────────────────────────────────────────────────────

const QuestionCard = ({
  q,
  index,
  done,
  onDone,
  speech,
}: {
  q: PrepQuestion;
  index: number;
  done: boolean;
  onDone: (on: boolean) => void;
  speech: ReturnType<typeof useGermanSpeech>;
}) => {
  const { t, i18n } = useTranslation();
  const { tr, locale } = useL10n();
  const [open, setOpen] = useState(false);
  const tip = tr(q.tips);
  return (
    <li className={clsx('card p-4 transition-colors sm:p-5', done && 'border-success/40')}>
      <div className="flex items-start gap-3">
        <span className={clsx('grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums', done ? 'bg-success/15 text-success' : 'bg-surface text-muted')}>{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-brand-700">{categoryLabel(t, (k) => i18n.exists(k), q.category)}</p>
          <h3 className="mt-0.5 text-base font-bold text-ink">{tr(q.question)}</h3>
          {locale !== 'de' && (
            <p className="mt-1 text-sm text-muted italic" lang="de">
              {q.question.de}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 sm:pl-11">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
        >
          {open ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
          {open ? t('prep.page.hideAnswer') : t('prep.page.showAnswer')}
        </button>
        <SpeakButton id={q.id} text={speechText(q, open)} speech={speech} />
        <label className="ml-auto inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-medium text-ink/85 select-none">
          <input type="checkbox" className="size-4 accent-brand-600" checked={done} onChange={(e) => onDone(e.target.checked)} />
          {t('prep.page.practised')}
        </label>
      </div>

      <div className={clsx('grid transition-[grid-template-rows,opacity] duration-300 sm:pl-11', open ? 'mt-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')} aria-hidden={!open}>
        <div className="overflow-hidden">
          <div className="rounded-xl border border-line bg-surface p-4">
            <AnswerText text={q.answerDe} />
            <p className="mt-2 text-xs text-muted">{t('prep.page.answerHint')}</p>
          </div>
        </div>
      </div>

      {tip && (
        <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:ml-11">
          <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">{t('prep.page.tips')}:</span> {tip}
          </span>
        </p>
      )}
    </li>
  );
};

// ─── Practice mode ────────────────────────────────────────────────────────

const pickRandom = (items: PrepQuestion[], exclude?: string) => {
  const pool = items.length > 1 ? items.filter((q) => q.id !== exclude) : items;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
};

/** Mounted only while open, so every session starts with a fresh random question and a full timer. */
const PracticeMode = ({ items, onClose, speech, onDone }: { items: PrepQuestion[]; onClose: () => void; speech: ReturnType<typeof useGermanSpeech>; onDone: (id: string) => void }) => {
  const { t } = useTranslation();
  const { tr, locale } = useL10n();
  const [current, setCurrent] = useState<PrepQuestion | null>(() => pickRandom(items));
  const [left, setLeft] = useState(PRACTICE_SECONDS);
  const [revealed, setRevealed] = useState(false);
  const { stop } = speech;

  useEffect(() => stop, [stop]);

  const next = useCallback(() => {
    stop();
    setCurrent((cur) => pickRandom(items, cur?.id));
    setLeft(PRACTICE_SECONDS);
    setRevealed(false);
  }, [items, stop]);

  useEffect(() => {
    if (revealed || left <= 0) return;
    const id = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [revealed, left]);

  const reveal = () => {
    setRevealed(true);
    if (current) onDone(current.id);
  };
  const pct = (left / PRACTICE_SECONDS) * 100;

  return (
    <Modal
      open
      onClose={onClose}
      title={t('prep.page.practice.title')}
      description={t('prep.page.practice.intro')}
      size="lg"
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose}>
            {t('prep.page.practice.exit')}
          </button>
          {!revealed && (
            <button type="button" className={clsx(btnSecondary, 'border-brand-600 text-brand-700')} onClick={reveal}>
              <Eye className="size-3.5" aria-hidden /> {t('prep.page.practice.reveal')}
            </button>
          )}
          <button type="button" className="btn-primary btn-sm" onClick={next}>
            <Shuffle className="size-3.5" aria-hidden /> {t('prep.page.practice.next')}
          </button>
        </>
      }
    >
      {current && (
        <div key={current.id}>
          <div className="flex items-center justify-between gap-3">
            <span className={clsx('inline-flex items-center gap-1.5 text-sm font-bold tabular-nums', left <= 10 ? 'text-danger' : 'text-ink')} role="timer" aria-live="off">
              <Timer className="size-4" aria-hidden />
              {left > 0 ? t('prep.page.practice.timeLeft', { s: left }) : t('prep.page.practice.timeUp')}
            </span>
            {left <= 0 && !revealed && (
              <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline" onClick={() => setLeft(PRACTICE_SECONDS)}>
                <RotateCcw className="size-3.5" aria-hidden /> {t('prep.page.practice.restart')}
              </button>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
            <div className={clsx('h-full rounded-full transition-[width] duration-1000 ease-linear', left <= 10 ? 'bg-danger' : 'bg-brand-600')} style={{ width: `${pct}%` }} />
          </div>

          <p className="mt-6 text-lg font-bold text-ink sm:text-xl">{tr(current.question)}</p>
          {locale !== 'de' && (
            <p className="mt-1 text-sm text-muted italic" lang="de">
              {current.question.de}
            </p>
          )}
          <div className="mt-4">
            <SpeakButton id={`practice-${current.id}`} text={speechText(current, revealed)} speech={speech} />
          </div>
          {revealed && (
            <div className="mt-5 rounded-xl border border-line bg-surface p-4 transition-opacity">
              <AnswerText text={current.answerDe} />
              {tr(current.tips) && (
                <p className="mt-3 flex gap-2 text-sm text-muted">
                  <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden /> {tr(current.tips)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────

export default function AccountInterviewPrep() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('prep.page.title'));
  const [kind, setKind] = useState<PrepKind>('EMBASSY');
  const [category, setCategory] = useState<string | null>(null);
  const [allTypes, setAllTypes] = useState(false);
  const [practice, setPractice] = useState(false);
  const speech = useGermanSpeech();
  const { practised, toggle, reset } = usePractised();

  const query = useQuery({
    queryKey: ['interview-prep', allTypes],
    queryFn: async () => (await api.get<PrepResponse>('/interview-prep', { params: allTypes ? { visaType: 'ALL' } : {} })).data,
  });

  const ofKind = useMemo(() => (query.data?.items ?? []).filter((q) => q.kind === kind), [query.data, kind]);
  const categories = useMemo(() => Array.from(new Set(ofKind.map((q) => q.category))), [ofKind]);
  const visible = category ? ofKind.filter((q) => q.category === category) : ofKind;
  const doneCount = ofKind.filter((q) => practised.has(q.id)).length;
  const pct = ofKind.length ? Math.round((doneCount / ofKind.length) * 100) : 0;
  const caseType = query.data?.caseVisaType ?? null;

  useEffect(() => {
    if (category && !categories.includes(category)) setCategory(null);
  }, [categories, category]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-ink sm:text-2xl">{t('prep.page.title')}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('prep.page.subtitle')}</p>
      </div>

      <CalendarSubscribe />

      {/* TODO(ui): <Tabs> once it has a "segmented grid" layout (2 equal columns on phones, 44px targets) */}
      <div role="tablist" aria-label={t('prep.page.title')} className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-card p-1.5 sm:inline-grid sm:w-auto">
        {PREP_KINDS.map((k) => {
          const Icon = KIND_ICON[k];
          const active = k === kind;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                speech.stop();
                setKind(k);
                setCategory(null);
              }}
              className={clsx('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors', active ? 'bg-brand-600 text-white shadow' : 'text-ink/75 hover:bg-surface')}
            >
              <Icon className="size-4" aria-hidden /> {t(`prep.page.tabs.${k}`)}
            </button>
          );
        })}
      </div>

      {query.isLoading ? (
        <div className="grid min-h-[30vh] place-items-center text-brand-600">
          <Spinner className="size-8" />
        </div>
      ) : query.isError ? (
        <div className="card p-6 text-center text-sm text-muted">
          {t('prep.page.error')}{' '}
          <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => void query.refetch()}>
            {t('prep.page.retry')}
          </button>
        </div>
      ) : (
        <>
          <div className="card space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t('prep.page.progress', { done: doneCount, total: ofKind.length })}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {doneCount > 0 && (
                  <button type="button" className={btnSecondary} onClick={() => reset(ofKind.map((q) => q.id))}>
                    <RotateCcw className="size-3.5" aria-hidden /> {t('prep.page.resetProgress')}
                  </button>
                )}
                <button type="button" className="btn-primary btn-sm" disabled={!visible.length} onClick={() => setPractice(true)}>
                  <Dumbbell className="size-3.5" aria-hidden /> {t('prep.page.practice.start')}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {caseType && !allTypes && <span>{t('prep.page.visaFor', { type: t(`prep.visa.${caseType}`) })}</span>}
              {caseType && (
                <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => setAllTypes((v) => !v)}>
                  {allTypes ? t('prep.page.showMine') : t('prep.page.showAllTypes')}
                </button>
              )}
            </div>

            {categories.length > 1 && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
                {[null, ...categories].map((c) => {
                  const active = c === category;
                  return (
                    <button
                      key={c ?? 'all'}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCategory(c)}
                      className={clsx('inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition-colors', active ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-card text-ink/75 hover:border-brand-400')}
                    >
                      {c ? categoryLabel(t, (k) => i18n.exists(k), c) : t('prep.page.allCategories')}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="card flex flex-col items-center px-6 py-12 text-center">
              {/* TODO(ui): large portal empty state (size-14 icon, display title) -> <EmptyState size="lg" tone="brand"> (portal rework) */}
              {(() => {
                const Icon = KIND_ICON[kind];
                return <Icon className="size-6 text-muted" aria-hidden />;
              })()}
              <p className="mt-2 text-sm text-muted">{t('prep.page.empty')}</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map((q, i) => (
                <QuestionCard key={q.id} q={q} index={i} done={practised.has(q.id)} onDone={(on) => toggle(q.id, on)} speech={speech} />
              ))}
            </ul>
          )}
          {!speech.available && <p className="text-xs text-muted">{t('prep.page.noVoice')}</p>}
        </>
      )}

      {practice && visible.length > 0 && <PracticeMode items={visible} onClose={() => setPractice(false)} speech={speech} onDone={(id) => toggle(id, true)} />}
    </div>
  );
}
