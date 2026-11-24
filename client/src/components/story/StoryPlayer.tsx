import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { useMotionOK } from '@/components/motion';
import { registerCopy } from '@/i18n';
import { pagesVisaStory } from '@/i18n/pagesVisaStory';
import { lockScroll } from '@/components/ui/overlay'; // page scroll lock that keeps the position

registerCopy(pagesVisaStory);

export interface StorySlide {
  key: string;
  /** Background classes (gradient), e.g. 'from-indigo-700 via-violet-700 to-fuchsia-600'. */
  bg: string;
  content: ReactNode;
  /** Slide with its own buttons / inputs (share card): no tap-to-advance over it, no auto-advance. */
  interactive?: boolean;
}

/**
 * Full-screen "story" player (Instagram-style): progress bars, tap left / right, swipe, arrow keys, Space pauses,
 * Escape closes, auto-advance after `durationMs`. With reduced motion (OS setting or the accessibility widget) it
 * never auto-advances and slides switch without animation. Rendered in a portal over the page as a modal dialog
 * (focus moves in and comes back on close). Used by the client "Your visa story" and the staff "Year in review".
 */
export function StoryPlayer({ slides, label, onClose, durationMs = 6500 }: { slides: StorySlide[]; label: string; onClose: () => void; durationMs?: number }) {
  const { t } = useTranslation();
  const motionOK = useMotionOK();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(!motionOK);
  const [progress, setProgress] = useState(0);
  const holdRef = useRef(false);
  const startX = useRef<number | null>(null);
  const swiped = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const last = slides.length - 1;
  const slide = slides[Math.min(index, last)];
  const autoplay = motionOK && !paused && !slide?.interactive && index < last;

  const go = useCallback(
    (to: number) => {
      setIndex(Math.max(0, Math.min(last, to)));
      setProgress(0);
    },
    [last],
  );
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  // Auto-advance (requestAnimationFrame clock; holding a finger / the mouse pauses it).
  useEffect(() => {
    if (!autoplay) return;
    let raf = 0;
    let lastTs = performance.now();
    let p = progress;
    const tick = (ts: number) => {
      if (!holdRef.current) p += (ts - lastTs) / durationMs;
      lastTs = ts;
      if (p >= 1) {
        go(index + 1);
        return;
      }
      setProgress(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restarts per slide / pause state only
  }, [autoplay, index, durationMs, go]);

  // Focus in, lock page scroll, restore focus on close.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    const unlock = lockScroll();
    return () => {
      unlock();
      before?.focus?.();
    };
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (!typing && e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (!typing && e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    } else if (!typing && e.key === ' ' && target === rootRef.current) {
      e.preventDefault();
      setPaused((p) => !p);
    } else if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      const items = rootRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), a[href], select, input, [tabindex]:not([tabindex="-1"])');
      if (!items?.length) return;
      const first = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (typeof document === 'undefined' || !slide) return null;

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      aria-roledescription={t('vstory.player.roledescription')}
      tabIndex={-1}
      onKeyDown={onKey}
      className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/90 outline-none"
    >
      <div
        className={clsx('relative flex h-full w-full max-w-[min(100vw,30rem)] flex-col overflow-hidden bg-gradient-to-br text-white sm:my-4 sm:h-[calc(100%-2rem)] sm:rounded-3xl', slide.bg, motionOK && 'transition-colors duration-500')}
        onPointerDown={(e) => {
          startX.current = e.clientX;
          holdRef.current = true;
        }}
        onPointerUp={(e) => {
          holdRef.current = false;
          const dx = startX.current === null ? 0 : e.clientX - startX.current;
          startX.current = null;
          swiped.current = Math.abs(dx) > 50;
          if (swiped.current && !slide.interactive) {
            if (dx < 0) next();
            else prev();
          }
        }}
        onPointerCancel={() => {
          holdRef.current = false;
          startX.current = null;
        }}
      >
        {/* Progress bars */}
        <div className="relative z-20 flex gap-1 px-3 pt-3" aria-hidden>
          {slides.map((s, i) => (
            <span key={s.key} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
              <span className="block h-full rounded-full bg-white" style={{ width: `${i < index ? 100 : i === index ? (autoplay ? progress * 100 : index === last || !motionOK || paused ? 100 : 0) : 0}%` }} />
            </span>
          ))}
        </div>
        <div className="relative z-20 flex items-center justify-between gap-2 px-3 pt-2">
          <p className="text-xs font-semibold text-white/80" aria-live="polite">
            {t('vstory.player.position', { n: index + 1, total: slides.length })}
          </p>
          <div className="flex items-center gap-1">
            {motionOK && (
              <button type="button" onClick={() => setPaused((p) => !p)} className="grid size-11 place-items-center rounded-full hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" aria-label={paused ? t('vstory.player.play') : t('vstory.player.pause')}>
                {paused ? <Play className="size-5" aria-hidden /> : <Pause className="size-5" aria-hidden />}
              </button>
            )}
            <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" aria-label={t('vstory.player.close')}>
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>

        {/* Tap zones (behind interactive slides) */}
        {!slide.interactive && (
          <>
            <button type="button" tabIndex={-1} aria-hidden className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-w-resize" onClick={() => !swiped.current && prev()} />
            <button type="button" tabIndex={-1} aria-hidden className="absolute inset-y-0 right-0 z-10 w-2/3 cursor-e-resize" onClick={() => !swiped.current && next()} />
          </>
        )}

        <div className={clsx('relative flex min-h-0 flex-1 flex-col', slide.interactive ? 'z-20 overflow-y-auto' : 'pointer-events-none z-0')}>
          <motion.div
            key={slide.key}
            initial={motionOK ? { opacity: 0, y: 24, scale: 0.98 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex min-h-full flex-1 flex-col justify-center px-6 py-6 sm:px-8"
          >
            {slide.content}
          </motion.div>
        </div>

        {/* Visible previous / next for keyboard and pointer users */}
        <div className="relative z-20 flex items-center justify-between px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={prev} disabled={index === 0} className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" aria-label={t('vstory.player.prev')}>
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button type="button" onClick={index === last ? onClose : next} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-white/15 px-4 text-sm font-semibold hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            {index === last ? t('vstory.player.done') : t('vstory.player.next')}
            {index < last && <ChevronRight className="size-4" aria-hidden />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Big headline number of a slide (counts up unless motion is reduced; the final value for screen readers). */
export { AnimatedNumber as StoryNumber } from '@/components/ui/AnimatedNumber';
