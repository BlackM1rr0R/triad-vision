import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Check, ChevronLeft, ChevronRight, Lightbulb, RefreshCw, RotateCcw, Square, Volume2 } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesPrepFlip } from '@/i18n/pagesPrepFlip';
import { Modal } from '@/components/ui/Modal';
import { btnSecondary } from './ui';
import type { PrepQuestion } from './types';
import type { useGermanSpeech } from './useSpeech';
import { countMarks, deckOf, stepIndex, useFlipMarks, type FlipMark } from './flipMarks';

registerCopy(pagesPrepFlip);

const SWIPE_PX = 50;

/** Model answer with [placeholders] highlighted. */
const Answer = ({ text }: { text: string }) => (
  <p className="text-[15px] leading-relaxed text-ink" lang="de">
    {text.split(/(\[[^\]]+\])/g).map((part, i) =>
      part.startsWith('[') ? (
        <mark key={i} className="rounded bg-highlight-bg px-1 text-ink">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    )}
  </p>
);

/**
 * Flip-card mode of the interview preparation: front = the question (client language + German), back = the German
 * model answer. A 3D flip (instant with prefers-reduced-motion), ← / → / swipe between cards, space / Enter flips,
 * "I knew it" / "practise again" marks in localStorage, optionally only the cards still to practise.
 */
export const FlipCards = ({ items, onClose, speech, onKnew }: { items: PrepQuestion[]; onClose: () => void; speech: ReturnType<typeof useGermanSpeech>; onKnew: (id: string) => void }) => {
  const { t } = useTranslation();
  const { tr, locale } = useL10n();
  const { marks, mark, reset } = useFlipMarks();
  const [onlyAgain, setOnlyAgain] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // The deck is fixed when the filter changes, so marking a card "knew" does not pull it out from under the reader.
  const [deck, setDeck] = useState(() => deckOf(items, marks, false));
  const start = useRef<{ x: number; y: number } | null>(null);
  const { stop } = speech;

  useEffect(() => stop, [stop]);

  const card = deck[Math.min(index, deck.length - 1)] ?? null;
  const counts = countMarks(
    items.map((q) => q.id),
    marks,
  );

  const go = useCallback(
    (delta: number) => {
      stop();
      setFlipped(false);
      setIndex((i) => stepIndex(i, delta, deck.length));
    },
    [deck.length, stop],
  );

  const choose = (m: FlipMark) => {
    if (!card) return;
    mark(card.id, marks[card.id] === m ? null : m);
    if (m === 'knew' && marks[card.id] !== 'knew') onKnew(card.id);
    if (deck.length > 1) go(1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, button')) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const onPointerDown = (e: ReactPointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) setFlipped((f) => !f);
  };

  const toggleOnlyAgain = (on: boolean) => {
    setOnlyAgain(on);
    setDeck(deckOf(items, marks, on));
    setIndex(0);
    setFlipped(false);
  };

  const current = card ? marks[card.id] : undefined;
  const speakText = card ? (flipped ? card.answerDe : card.question.de) : '';
  const speaking = card && speech.speaking === `flip-${card.id}`;
  const tip = card ? tr(card.tips) : '';

  return (
    <Modal
      open
      onClose={onClose}
      title={t('prep.flip.title')}
      description={t('prep.flip.intro')}
      size="lg"
      footer={
        <button type="button" className={btnSecondary} onClick={onClose}>
          {t('prep.flip.close')}
        </button>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-medium text-ink/85 select-none sm:min-h-9">
          <input type="checkbox" className="size-4 accent-primary" checked={onlyAgain} onChange={(e) => toggleOnlyAgain(e.target.checked)} />
          {t('prep.flip.onlyAgain')}
        </label>
        <span className="flex items-center gap-2 text-muted">
          {t('prep.flip.counts', counts)}
          {(counts.knew > 0 || counts.again > 0) && (
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-1 font-semibold text-link hover:underline"
              onClick={() => {
                reset(items.map((q) => q.id));
                if (onlyAgain) setDeck(items);
              }}
            >
              <RotateCcw className="size-3.5" aria-hidden /> {t('prep.flip.resetMarks')}
            </button>
          )}
        </span>
      </div>

      {!card ? (
        <p className="py-12 text-center text-sm text-muted">{t('prep.flip.empty')}</p>
      ) : (
        <>
          <p className="mt-3 text-center text-xs font-semibold text-muted tabular-nums" aria-live="polite">
            {t('prep.flip.position', { n: Math.min(index, deck.length - 1) + 1, total: deck.length })}
          </p>

          {/* The card: a 3D flip (rotateY) with both faces in one grid cell; reduced motion flips without animating. */}
          <div className="mt-2 [perspective:1400px]">
            <div
              role="button"
              tabIndex={0}
              aria-pressed={flipped}
              aria-label={`${flipped ? t('prep.flip.back') : t('prep.flip.front')} — ${t('prep.flip.flipHint')}`}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (start.current = null)}
              className={clsx(
                'relative grid min-h-64 cursor-pointer touch-pan-y [transform-style:preserve-3d] select-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary',
                'motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out',
                flipped && '[transform:rotateY(180deg)]',
              )}
            >
              <div className={clsx('col-start-1 row-start-1 flex flex-col rounded-2xl border border-line bg-card p-5 shadow-sm [backface-visibility:hidden] sm:p-6', current === 'knew' && 'border-success/40', current === 'again' && 'border-warning-border')} aria-hidden={flipped}>
                <span className="text-[11px] font-semibold text-muted uppercase">{t('prep.flip.front')}</span>
                <p className="mt-3 text-lg font-bold text-ink sm:text-xl">{tr(card.question)}</p>
                {locale !== 'de' && (
                  <p className="mt-2 text-base text-muted italic" lang="de">
                    {card.question.de}
                  </p>
                )}
                <span className="mt-auto pt-4 text-xs text-muted">{t('prep.flip.flipHint')}</span>
              </div>
              <div className="col-start-1 row-start-1 flex flex-col overflow-y-auto rounded-2xl border border-line bg-sunken p-5 shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-6" aria-hidden={!flipped}>
                <span className="text-[11px] font-semibold text-muted uppercase">{t('prep.flip.back')}</span>
                <div className="mt-3">
                  <Answer text={card.answerDe} />
                </div>
                {tip && (
                  <p className="mt-3 flex gap-2 text-sm text-muted">
                    <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden /> {tip}
                  </p>
                )}
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">
            <span className="hidden sm:inline">{t('prep.flip.keys')}</span>
            <span className="sm:hidden">{t('prep.flip.swipe')}</span>
          </p>

          <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <button type="button" className={clsx(btnSecondary, 'min-h-11')} onClick={() => go(-1)} disabled={deck.length < 2} aria-label={t('prep.flip.prev')}>
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className={clsx(btnSecondary, 'min-h-11')} onClick={() => setFlipped((f) => !f)}>
                <RefreshCw className="size-3.5" aria-hidden /> {t('prep.flip.flip')}
              </button>
              {speech.available && (
                <button type="button" className={clsx(btnSecondary, 'min-h-11')} aria-pressed={!!speaking} onClick={() => (speaking ? speech.stop() : speech.speak(`flip-${card.id}`, speakText))}>
                  {speaking ? <Square className="size-3.5" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />}
                  {speaking ? t('prep.page.stop') : t('prep.page.readAloud')}
                </button>
              )}
            </div>
            <button type="button" className={clsx(btnSecondary, 'min-h-11')} onClick={() => go(1)} disabled={deck.length < 2} aria-label={t('prep.flip.next')}>
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={current === 'again'}
              onClick={() => choose('again')}
              className={clsx('inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors', current === 'again' ? 'border-warning-border bg-warning-bg text-warning-fg' : 'border-line bg-card text-ink hover:border-warning-border')}
            >
              <RotateCcw className="size-4" aria-hidden /> {t('prep.flip.again')}
            </button>
            <button
              type="button"
              aria-pressed={current === 'knew'}
              onClick={() => choose('knew')}
              className={clsx('inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors', current === 'knew' ? 'border-success/40 bg-success-bg text-success-fg' : 'border-line bg-card text-ink hover:border-success/40')}
            >
              <Check className="size-4" aria-hidden /> {t('prep.flip.knew')}
            </button>
          </div>
          {current && <p className="mt-2 text-center text-xs text-muted">{current === 'knew' ? t('prep.flip.markedKnew') : t('prep.flip.markedAgain')}</p>}
        </>
      )}
    </Modal>
  );
};

export default FlipCards;
