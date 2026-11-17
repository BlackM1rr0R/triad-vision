import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, BookA, CheckCircle2, Download, ExternalLink, Flame, Info, Link2, Play, RotateCcw, Timer, Trophy, XCircle } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { GameLinks } from '@/components/games/GameLinks';
import { copyLink, downloadResultCard } from '@/components/games/shareCard';
import { registerCopy } from '@/i18n';
import { pagesGames } from '@/i18n/pagesGames';
import { pagesWasteSorting } from '@/i18n/pagesWasteSorting';
import { useBrand } from '@/lib/brand';
import { localePath } from '@/lib/localeRouter';
import { usePageTitle } from '@/lib/usePageTitle';
import { loadProgress, mmss, pickTx, saveProgress } from '@/lib/games/common';
import { useReadyReport } from '@/lib/readyProgress/sync'; // Germany Ready: results of signed-in clients
import { BINS, WASTE_AS_OF, WASTE_BINS, WASTE_ITEMS, WASTE_SOURCES, binInfo, wasteItem, type BinInfo, type WasteBin, type WasteItem } from '@/lib/games/waste/items';
import { ROUND_SECONDS, ROUND_SIZE, multiplierFor, newSeed, parseSeed, pickRound, scoreAnswer, summarize, timeBonus, type Answer, type RoundSummary } from '@/lib/games/waste/game';

registerCopy(pagesGames);
registerCopy(pagesWasteSorting);

const BEST_KEY = 'waste.best';
const PATH = '/waste-sorting';

/** Self-drawn bin: body in the bin colour, with a small mark per kind (glass dots, deposit arrow, battery). */
const BinIcon = ({ bin, className }: { bin: BinInfo; className?: string }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
    <rect x="8" y="9" width="32" height="6" rx="2" fill={bin.colour} />
    <rect x="20" y="5" width="8" height="5" rx="1.5" fill={bin.colour} />
    <path d="M11 17h26l-2.4 25a3 3 0 0 1-3 2.7H16.4a3 3 0 0 1-3-2.7Z" fill={bin.colour} />
    {bin.key === 'glas' && (
      <g stroke="#fff" strokeWidth="1.2">
        <circle cx="17.5" cy="29" r="3.6" fill="#f4f4f4" />
        <circle cx="24" cy="29" r="3.6" fill="#2e7d32" />
        <circle cx="30.5" cy="29" r="3.6" fill="#7a4a1f" />
      </g>
    )}
    {bin.key === 'pfand' && <path d="M18 31a6 6 0 1 0 2-4.5M18 24v3.5h3.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
    {bin.key === 'sonder' && (
      <g fill="#fff">
        <rect x="18" y="24" width="12" height="15" rx="1.5" />
        <rect x="21.5" y="22" width="5" height="2.5" rx="0.8" />
        <path d="M25.5 27l-4 6h3l-1 4 4-6h-3z" fill={bin.colour} />
      </g>
    )}
    {bin.key === 'papier' && <path d="M18 25h12M18 30h12M18 35h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />}
    {bin.key === 'bio' && <path d="M24 38c0-7 3-11 8-13-1 6-4 10-8 13Zm0 0c0-5-2-8-6-10 0 5 2 8 6 10Z" fill="#9fd36a" />}
    {bin.key === 'gelb' && <path d="M19 24h10l-1.5 14h-7Z" fill="none" stroke="#5a4a00" strokeWidth="1.8" strokeLinejoin="round" />}
  </svg>
);

type Phase = 'intro' | 'play' | 'end';

interface Feedback {
  item: WasteItem;
  answer: Answer;
}

export default function WasteSortingPage() {
  const { t, i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const tx = useCallback((v: Parameters<typeof pickTx>[0]) => pickTx(v, lng), [lng]);
  usePageTitle(t('wasteSorting.heroTitle'));
  const brand = useBrand();
  const [params, setParams] = useSearchParams();
  const sharedSeed = parseSeed(params.get('seed'));

  const [phase, setPhase] = useState<Phase>('intro');
  const [seed, setSeed] = useState<number | null>(sharedSeed);
  const [items, setItems] = useState<WasteItem[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [combo, setCombo] = useState(0);
  const [remaining, setRemaining] = useState(ROUND_SECONDS);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [summary, setSummary] = useState<(RoundSummary & { bonus: number; timeUp: boolean; newBest: boolean }) | null>(null);
  const [best, setBest] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number; over: WasteBin | null } | null>(null);

  const itemStart = useRef(0);
  const dragStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const binRefs = useRef<Partial<Record<WasteBin, HTMLButtonElement | null>>>({});
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const playRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setBest(loadProgress<number | null>(BEST_KEY, null));
  }, []);
  const report = useReadyReport();

  const current = phase === 'play' ? items[index] : undefined;

  const finish = useCallback(
    (all: Answer[], left: number, finished: boolean) => {
      const bonus = timeBonus(left, finished);
      const s = summarize(all, bonus);
      const prev = loadProgress<number | null>(BEST_KEY, null);
      const newBest = s.points > 0 && (prev === null || s.points > prev);
      if (newBest) {
        saveProgress(BEST_KEY, s.points);
        setBest(s.points);
      }
      setSummary({ ...s, total: items.length || ROUND_SIZE, bonus, timeUp: !finished, newBest });
      report({ activityId: 'waste-sorting', score: s.correct, max: items.length || ROUND_SIZE }); // Germany Ready sync (signed-in clients)
      setFeedback(null);
      setPhase('end');
    },
    [items.length, report],
  );

  const start = (useSeed?: number) => {
    const s = useSeed ?? newSeed();
    setSeed(s);
    setItems(pickRound(s));
    setIndex(0);
    setAnswers([]);
    setCombo(0);
    setRemaining(ROUND_SECONDS);
    setFeedback(null);
    setSummary(null);
    setPhase('play');
    itemStart.current = performance.now();
    setParams(new URLSearchParams({ seed: String(s) }), { replace: true, preventScrollReset: true });
    requestAnimationFrame(() => playRef.current?.focus());
  };

  // The clock runs while an item waits for an answer; it pauses during the explanation.
  useEffect(() => {
    if (phase !== 'play' || feedback) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const d = (now - last) / 1000;
      last = now;
      setRemaining((r) => Math.max(0, r - d));
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, feedback]);

  useEffect(() => {
    if (phase === 'play' && !feedback && remaining <= 0) finish(answers, 0, false);
  }, [remaining, phase, feedback, answers, finish]);

  const answer = useCallback(
    (bin: WasteBin) => {
      if (phase !== 'play' || feedback || !current) return;
      const seconds = (performance.now() - itemStart.current) / 1000;
      const r = scoreAnswer(bin === current.bin, combo, seconds);
      const a: Answer = { itemId: current.id, chosen: bin, correct: r.correct, points: r.points };
      setAnswers((list) => [...list, a]);
      setCombo(r.combo);
      setFeedback({ item: current, answer: a });
    },
    [phase, feedback, current, combo],
  );

  const next = useCallback(() => {
    if (!feedback) return;
    const all = answers;
    if (index + 1 >= items.length) {
      finish(all, remaining, true);
      return;
    }
    setIndex((i) => i + 1);
    setFeedback(null);
    itemStart.current = performance.now();
  }, [feedback, answers, index, items.length, remaining, finish]);

  useEffect(() => {
    if (feedback) nextRef.current?.focus();
  }, [feedback]);

  // Number keys 1–7 pick a bin.
  useEffect(() => {
    if (phase !== 'play') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      if (!feedback && Number.isInteger(n) && n >= 1 && n <= WASTE_BINS.length) {
        e.preventDefault();
        answer(WASTE_BINS[n - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, feedback, answer]);

  // Drag the item card onto a bin (pointer events: mouse, touch and pen).
  const binAt = (x: number, y: number): WasteBin | null => {
    for (const b of WASTE_BINS) {
      const r = binRefs.current[b]?.getBoundingClientRect();
      if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return b;
    }
    return null;
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (feedback || e.button > 0) return;
    dragStart.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = dragStart.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!drag && Math.hypot(dx, dy) < 8) return;
    setDrag({ dx, dy, over: binAt(e.clientX, e.clientY) });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = dragStart.current;
    dragStart.current = null;
    if (!s || s.id !== e.pointerId) return;
    const target = drag ? binAt(e.clientX, e.clientY) : null;
    setDrag(null);
    if (target) answer(target);
  };

  const binName = (key: WasteBin) => tx(binInfo(key).name);
  const glassText = (item: WasteItem) => (item.glass ? t('wasteSorting.feedback.glass', { colour: t(`wasteSorting.glass.${item.glass}`) }) : '');

  const shareUrl = () => `${window.location.origin}${localePath(PATH)}${seed ? `?seed=${seed}` : ''}`;
  const share = async () => {
    if (await copyLink(shareUrl())) toast.success(t('games.common.copied'));
    else toast.error(t('games.common.copyFailed'));
  };
  const card = async () => {
    if (!summary) return;
    try {
      await downloadResultCard({
        lead: t('wasteSorting.end.cardLead'),
        big: t('wasteSorting.end.points', { n: summary.points }),
        sub: t('wasteSorting.end.cardSub', { correct: summary.correct, answered: summary.answered, combo: summary.maxCombo }),
        lines: summary.mistakes
          .slice(0, 4)
          .map((m) => {
            const it = wasteItem(m.itemId);
            return it ? `${it.name.de} → ${binInfo(it.bin).de}` : '';
          })
          .filter(Boolean),
        footer: t('games.common.playAt', { domain: brand.domain, path: PATH }),
        filename: `muelltrennung-${summary.points}`,
      });
    } catch {
      toast.error(t('games.common.cardFailed'));
    }
  };

  const byBin = useMemo(() => BINS.map((b) => ({ bin: b, items: WASTE_ITEMS.filter((i) => i.bin === b.key) })), []);
  const asOf = WASTE_AS_OF.split('-').reverse().join('.');

  return (
    <>
      <PageHero title={t('wasteSorting.heroTitle')} subtitle={t('wasteSorting.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />

      <section className="section">
        <div className="container-x max-w-4xl space-y-6">
          {phase === 'intro' && (
            <div className="rounded-3xl border border-line bg-card p-5 sm:p-7">
              <h2 className="font-display text-xl font-semibold text-ink">{t('wasteSorting.intro.title')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink">{t('wasteSorting.intro.text', { n: ROUND_SIZE, sec: ROUND_SECONDS })}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t('wasteSorting.intro.controls')}</p>
              {sharedSeed && <p className="mt-3 rounded-xl border border-line bg-sunken p-2.5 text-sm text-ink">{t('wasteSorting.intro.shared')}</p>}
              <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t('wasteSorting.play.bins')}>
                {BINS.map((b) => (
                  <li key={b.key} className="flex items-center gap-2 rounded-xl border border-line bg-sunken/50 p-2">
                    <BinIcon bin={b} className="size-9 shrink-0" />
                    <span className="text-xs font-semibold leading-tight text-ink">{tx(b.name)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" className={buttonClass({ size: 'lg' })} onClick={() => start(sharedSeed ?? undefined)}>
                  <Play className="size-5" aria-hidden /> {t('wasteSorting.intro.start')}
                </button>
                {best !== null && (
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    <Trophy className="size-4 text-warning-fg" aria-hidden /> {t('games.common.best', { value: best })}
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs text-muted">{t('games.common.progressNote')}</p>
            </div>
          )}

          {phase === 'play' && current && (
            <div ref={playRef} tabIndex={-1} className="space-y-4 outline-none" aria-labelledby="waste-prompt">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-ink tabular-nums">
                <span>{t('wasteSorting.hud.items', { n: index + 1, total: items.length })}</span>
                <span className={clsx('flex items-center gap-1', remaining <= 15 ? 'text-danger-fg' : 'text-ink')} role="timer" aria-label={t('games.common.time')}>
                  <Timer className="size-4" aria-hidden /> {mmss(Math.ceil(remaining))}
                </span>
                <span>
                  {t('games.common.score')}: {answers.reduce((s, a) => s + a.points, 0)}
                </span>
                <span className={clsx('flex items-center gap-1', combo >= 3 ? 'text-warning-fg' : 'text-muted')}>
                  <Flame className="size-4" aria-hidden /> {t('wasteSorting.hud.combo', { m: multiplierFor(combo) })}
                  {combo > 1 && <span className="font-normal"> · {t('wasteSorting.hud.streak', { n: combo })}</span>}
                </span>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                <div className="h-full rounded-full bg-primary motion-safe:transition-[width]" style={{ width: `${(index / items.length) * 100}%` }} />
              </div>

              <div
                className={clsx(
                  'relative mx-auto max-w-md select-none rounded-3xl border bg-card p-5 text-center shadow-[var(--tv-shadow-raised)]',
                  feedback ? 'border-line' : 'cursor-grab touch-none border-primary/40 active:cursor-grabbing',
                  !drag && 'motion-safe:transition-transform',
                )}
                style={drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${Math.max(-8, Math.min(8, drag.dx / 20))}deg)`, zIndex: 20 } : undefined}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                  dragStart.current = null;
                  setDrag(null);
                }}
              >
                <p id="waste-prompt" className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t('wasteSorting.play.prompt')}
                </p>
                <p className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl" lang="de">
                  {current.name.de}
                </p>
                {lng !== 'de' && <p className="mt-1 text-sm text-muted">{tx(current.name)}</p>}
                {!feedback && <p className="mt-3 text-xs text-muted">{t('wasteSorting.play.drag')}</p>}
              </div>

              <div role="status" aria-live="polite" className="min-h-0">
                {feedback && (
                  <div className={clsx('mx-auto max-w-2xl rounded-2xl border p-4', feedback.answer.correct ? 'border-success-border bg-success-bg' : 'border-danger-border bg-danger-bg')}>
                    <p className={clsx('flex items-center gap-2 font-semibold', feedback.answer.correct ? 'text-success-fg' : 'text-danger-fg')}>
                      {feedback.answer.correct ? <CheckCircle2 className="size-5 shrink-0" aria-hidden /> : <XCircle className="size-5 shrink-0" aria-hidden />}
                      {feedback.answer.correct ? t('wasteSorting.feedback.right', { points: feedback.answer.points }) : t('wasteSorting.feedback.wrongBin', { bin: binName(feedback.item.bin) })}
                    </p>
                    {feedback.item.glass && <p className="mt-1 text-sm font-semibold text-ink">{glassText(feedback.item)}</p>}
                    <p className="mt-1 text-sm leading-relaxed text-ink">{tx(feedback.item.why)}</p>
                    <button ref={nextRef} type="button" className={buttonClass({ className: 'mt-3' })} onClick={next}>
                      {t('games.common.next')} <ArrowRight className="size-4" aria-hidden />
                    </button>
                  </div>
                )}
              </div>

              <div role="group" aria-label={t('wasteSorting.play.bins')} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {BINS.map((b, i) => {
                  const isAnswer = feedback && feedback.item.bin === b.key;
                  const isWrongPick = feedback && !feedback.answer.correct && feedback.answer.chosen === b.key;
                  return (
                    <button
                      key={b.key}
                      ref={(el) => {
                        binRefs.current[b.key] = el;
                      }}
                      type="button"
                      disabled={!!feedback}
                      onClick={() => answer(b.key)}
                      aria-keyshortcuts={String(i + 1)}
                      className={clsx(
                        'flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 bg-card p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 disabled:cursor-default',
                        isAnswer ? 'border-success-border bg-success-bg' : isWrongPick ? 'border-danger-border bg-danger-bg' : drag?.over === b.key ? 'border-primary bg-sunken' : 'border-line hover:border-line-strong hover:bg-sunken',
                        feedback && !isAnswer && !isWrongPick && 'opacity-60',
                      )}
                    >
                      <BinIcon bin={b} className="size-10" />
                      <span className="text-xs font-semibold leading-tight text-ink">{tx(b.name)}</span>
                      <span className="text-[10px] font-semibold text-muted" aria-hidden>
                        {i + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {phase === 'end' && summary && (
            <div className="space-y-4">
              <section className="rounded-3xl border border-primary/30 bg-card p-5 shadow-[var(--tv-shadow-raised)] sm:p-7" aria-live="polite">
                <p className="text-sm font-semibold text-muted">{summary.timeUp ? t('wasteSorting.end.timeUp') : t('wasteSorting.end.allDone')}</p>
                <p className="mt-1 flex items-center gap-3 font-display text-4xl font-semibold text-ink tabular-nums">
                  <Trophy className="size-8 text-warning-fg" aria-hidden /> {t('wasteSorting.end.points', { n: summary.points })}
                </p>
                <p className="mt-2 text-sm text-ink tabular-nums">{t('wasteSorting.end.stats', { correct: summary.correct, answered: summary.answered, accuracy: summary.accuracy, combo: summary.maxCombo })}</p>
                {summary.bonus > 0 && <p className="text-sm text-muted">{t('wasteSorting.end.bonus', { n: summary.bonus })}</p>}
                {summary.newBest ? (
                  <p className="mt-2 inline-flex rounded-full border border-success-border bg-success-bg px-3 py-1 text-xs font-semibold text-success-fg">{t('wasteSorting.end.newBest')}</p>
                ) : (
                  best !== null && <p className="mt-2 text-xs text-muted">{t('games.common.best', { value: best })}</p>
                )}
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button type="button" className={buttonClass({ size: 'lg' })} onClick={() => start()}>
                    <RotateCcw className="size-4" aria-hidden /> {t('wasteSorting.end.again')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'outline', size: 'lg' })} onClick={() => void card()}>
                    <Download className="size-4" aria-hidden /> {t('games.common.card')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'ghost', size: 'lg' })} onClick={() => void share()}>
                    <Link2 className="size-4" aria-hidden /> {t('games.common.share')}
                  </button>
                </div>
              </section>

              <section aria-labelledby="waste-mistakes-h" className="rounded-3xl border border-line bg-card p-5 sm:p-6">
                <h2 id="waste-mistakes-h" className="font-display text-lg font-semibold text-ink">
                  {t('wasteSorting.end.mistakes')}
                </h2>
                {summary.mistakes.length === 0 ? (
                  <p className="mt-2 text-sm text-success-fg">{t('wasteSorting.end.noMistakes')}</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {summary.mistakes.map((m) => {
                      const it = wasteItem(m.itemId);
                      if (!it) return null;
                      return (
                        <li key={m.itemId} className="rounded-2xl border border-line p-3">
                          <p className="font-semibold text-ink">
                            <span lang="de">{it.name.de}</span>
                            {lng !== 'de' && <span className="font-normal text-muted"> · {tx(it.name)}</span>}
                          </p>
                          <p className="mt-1 text-sm text-danger-fg">{t('wasteSorting.end.yours', { bin: binName(m.chosen) })}</p>
                          <p className="text-sm font-semibold text-success-fg">
                            {binName(it.bin)}
                            {it.glass && ` · ${glassText(it)}`}
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-ink">{tx(it.why)}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          )}

          <aside className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-4 text-sm text-warning-fg" role="note">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="space-y-1">
              <p className="font-semibold">{t('wasteSorting.note.title')}</p>
              <p>{t('wasteSorting.note.text')}</p>
              <p>{t('wasteSorting.note.pfand')}</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="pb-12" aria-labelledby="waste-learn-h">
        <div className="container-x max-w-4xl space-y-4">
          <h2 id="waste-learn-h" className="font-display text-xl font-semibold text-ink">
            {t('wasteSorting.learn.title')}
          </h2>
          <p className="text-sm text-muted">{t('wasteSorting.learn.text', { n: WASTE_ITEMS.length })}</p>
          <div className="space-y-2">
            {byBin.map(({ bin, items: list }) => (
              <details key={bin.key} className="group rounded-2xl border border-line bg-card">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-2xl p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40">
                  <BinIcon bin={bin} className="size-9 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">
                      {tx(bin.name)} <span className="font-normal text-muted">({list.length})</span>
                    </span>
                    <span className="block text-xs text-muted">{tx(bin.hint)}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted motion-safe:transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <ul className="divide-y divide-line border-t border-line">
                  {list.map((it) => (
                    <li key={it.id} className="p-3">
                      <p className="text-sm font-semibold text-ink">
                        <span lang="de">{it.name.de}</span>
                        {lng !== 'de' && <span className="font-normal text-muted"> · {tx(it.name)}</span>}
                        {it.tricky && <span className="ml-2 rounded-full border border-warning-border bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning-fg">{t('wasteSorting.play.tricky')}</span>}
                      </p>
                      {it.glass && <p className="text-xs font-semibold text-ink">{glassText(it)}</p>}
                      <p className="mt-0.5 text-sm leading-relaxed text-muted">{tx(it.why)}</p>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link to="/glossary/muelltrennung" className={buttonClass({ variant: 'outline', size: 'sm' })}>
              <BookA className="size-4" aria-hidden /> {t('games.common.glossary')}: Mülltrennung
            </Link>
            <Link to="/glossary/pfand" className={buttonClass({ variant: 'outline', size: 'sm' })}>
              <BookA className="size-4" aria-hidden /> {t('games.common.glossary')}: Pfand
            </Link>
          </div>

          <div className="text-xs text-muted">
            <p className="font-semibold">
              {t('wasteSorting.note.sources')} · {t('games.common.asOf', { date: asOf })}
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {WASTE_SOURCES.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                    {s.label} <ExternalLink className="size-3" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <GameLinks current={PATH} />
        </div>
      </section>
      <RelatedGuides tool={PATH} />
    </>
  );
}
