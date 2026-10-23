import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { smoothScrollTo } from '@/lib/smoothScroll';
import { registerCopy } from '@/i18n';
import { pagesPortalUx } from '@/i18n/pagesPortalUx';
import { Button, IconButton } from '@/components/ui/Button';
import { useOverlay } from '@/components/ui/overlay';
import {
  findTarget,
  getTour,
  goToStep,
  markSkippedThisSession,
  stopTour,
  useAutoStartTour,
  useTourState,
  writeSeen,
  type TourDef,
  type TourPlacement,
} from './tour';
import './tours';

registerCopy(pagesPortalUx);

const PAD = 6; // highlight padding around the target
const GAP = 12; // distance between highlight and popover
const POP_W = 340;
const MOBILE = 640;

type Rect = { top: number; left: number; width: number; height: number };

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-nomotion'));

const rectOf = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect();
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
};

/** Fixed-position offset via transform, so moving between steps is not counted as layout shift. */
const at = (x: number, y: number): CSSProperties => ({ top: 0, left: 0, transform: `translate(${x}px, ${y}px)` });

/** Desktop popover position next to the highlight, flipped / clamped to stay on screen. */
const place = (r: Rect, w: number, h: number, pref: TourPlacement): CSSProperties => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fits = {
    bottom: r.top + r.height + GAP + h <= vh - 8,
    top: r.top - GAP - h >= 8,
    right: r.left + r.width + GAP + w <= vw - 8,
    left: r.left - GAP - w >= 8,
  };
  const order: Exclude<TourPlacement, 'auto'>[] =
    pref === 'auto' ? ['bottom', 'top', 'right', 'left'] : [pref, ...(['bottom', 'top', 'right', 'left'] as const).filter((p) => p !== pref)];
  const side = order.find((p) => fits[p]) ?? 'bottom';
  const clampX = (x: number) => Math.min(Math.max(8, x), vw - w - 8);
  const clampY = (y: number) => Math.min(Math.max(8, y), vh - h - 8);
  if (side === 'bottom') return at(clampX(r.left + r.width / 2 - w / 2), clampY(r.top + r.height + GAP));
  if (side === 'top') return at(clampX(r.left + r.width / 2 - w / 2), clampY(r.top - GAP - h));
  if (side === 'right') return at(clampX(r.left + r.width + GAP), clampY(r.top + r.height / 2 - h / 2));
  return at(clampX(r.left - GAP - w), clampY(r.top + r.height / 2 - h / 2));
};

/**
 * Renders the running tour (if any): a cut-out highlight around the step's target and a popover with
 * back / next / skip. Mount once per layout. `autoStart` starts that tour once after the first login
 * (when `ready`), e.g. `<TourHost autoStart="admin" />`.
 */
export function TourHost({ autoStart, ready = true }: { autoStart?: string; ready?: boolean }) {
  const { user } = useAuth();
  useAutoStartTour(autoStart, user?.id, ready);
  const { tourId, index } = useTourState();
  const def = getTour(tourId);
  if (!def || !user) return null;
  return <TourRunner key={def.id} def={def} index={index} userId={user.id} />;
}

function TourRunner({ def, index, userId }: { def: TourDef; index: number; userId: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const ids = useId();
  const step = def.steps[Math.min(index, def.steps.length - 1)];
  const last = index >= def.steps.length - 1;
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [dontShow, setDontShow] = useState(false);
  const [vw, setVw] = useState(() => window.innerWidth);
  const [popH, setPopH] = useState(180);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const onRoute = !def.route || pathname.replace(/\/+$/, '') === def.route.replace(/\/+$/, '');

  const finish = useCallback(() => {
    writeSeen(userId, def.id, 'done');
    stopTour();
  }, [userId, def.id]);
  const skip = useCallback(() => {
    if (dontShow) writeSeen(userId, def.id, 'never');
    else markSkippedThisSession(userId, def.id);
    stopTour();
  }, [dontShow, userId, def.id]);
  const next = useCallback(() => (last ? finish() : goToStep(index + 1)), [last, finish, index]);
  const back = useCallback(() => index > 0 && goToStep(index - 1), [index]);

  // Start on the tour's page.
  useEffect(() => {
    if (!onRoute && def.route) navigate(def.route);
    // only when the tour starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Find the target (it may mount late: lazy chunks, queries). Missing for 3 s → skip the step.
  useEffect(() => {
    if (!onRoute) return;
    setTarget(null);
    let tries = 0;
    let timer = 0;
    const look = () => {
      const el = findTarget(step);
      if (el) {
        const r = el.getBoundingClientRect();
        const off = r.top < 72 || r.bottom > window.innerHeight - 80;
        if (off) smoothScrollTo(el, { immediate: reducedMotion(), offset: -Math.max(96, (window.innerHeight - r.height) / 2) });
        // Panes with their own scroll (workspace) are not moved by the window scroll above.
        if (off) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        setTarget(el);
        return;
      }
      if (++tries > 30) {
        if (last) finish();
        else goToStep(index + 1);
        return;
      }
      timer = window.setTimeout(look, 100);
    };
    look();
    return () => window.clearTimeout(timer);
  }, [step, onRoute, index, last, finish]);

  // Follow the target while scrolling / resizing.
  useEffect(() => {
    if (!target) {
      setRect(null);
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!target.isConnected) {
          setTarget(findTarget(step));
          return;
        }
        setRect(rectOf(target));
        setVw(window.innerWidth);
      });
    };
    update();
    // Smooth scrolling moves the target for about a second after the step starts.
    const settle = window.setInterval(update, 250);
    const stopSettle = window.setTimeout(() => window.clearInterval(settle), 1600);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(target);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(settle);
      window.clearTimeout(stopSettle);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      ro?.disconnect();
    };
  }, [target, step]);

  const open = !!rect;
  const panelRef = useOverlay<HTMLDivElement>(open, skip, { lockScroll: false, trapFocus: true, initialFocus: titleRef });

  // Each step: focus the popover title so screen readers read the step.
  useEffect(() => {
    if (open) titleRef.current?.focus({ preventScroll: true });
  }, [open, index]);

  useLayoutEffect(() => {
    const h = panelRef.current?.offsetHeight;
    if (h && Math.abs(h - popH) > 1) setPopH(h);
  });

  if (!open || !rect) return null;

  const mobile = vw < MOBILE;
  // Phones: bottom sheet, or a top sheet when the target sits in the lower half (e.g. the bottom bar).
  const sheetTop = mobile && rect.top + rect.height / 2 > window.innerHeight * 0.5;
  const popStyle: CSSProperties = mobile ? {} : { ...place(rect, POP_W, popH, step.placement ?? 'auto'), width: POP_W };
  const motion = !reducedMotion();

  return createPortal(
    <>
      {/* Cut-out: the huge spread shadow dims everything but the target (no backdrop-filter). */}
      <div
        aria-hidden
        className={clsx('pointer-events-none fixed z-[95] rounded-xl ring-2 ring-brand-500 ring-offset-2 ring-offset-transparent', motion && 'transition-[transform,width,height] duration-300 ease-out')}
        style={{ ...at(rect.left, rect.top), width: rect.width, height: rect.height, boxShadow: '0 0 0 9999px rgb(5 15 36 / 0.55)' }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-text`}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.target instanceof HTMLInputElement) return;
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            next();
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            back();
          }
        }}
        className={clsx(
          'fixed z-[96] flex flex-col gap-3 border border-line bg-card p-4 text-ink shadow-[0_24px_60px_-20px_rgba(5,15,36,0.6)] outline-none sm:p-5',
          mobile
            ? ['inset-x-2 rounded-2xl', sheetTop ? 'top-[max(0.5rem,env(safe-area-inset-top))]' : 'bottom-[max(0.5rem,env(safe-area-inset-bottom))]']
            : 'rounded-2xl',
          motion && !mobile && 'transition-transform duration-300 ease-out',
        )}
        style={popStyle}
        data-tour-popover
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted tabular-nums">
              {t('pux.tour.label')} · {t('pux.tour.stepOf', { n: index + 1, total: def.steps.length })}
            </p>
            <h2 id={`${ids}-title`} ref={titleRef} tabIndex={-1} className="mt-1 text-base font-bold text-ink outline-none">
              {t(step.titleKey)}
            </h2>
          </div>
          <IconButton icon={X} label={t('pux.tour.skip')} size="sm" onClick={skip} tooltip={false} />
        </div>
        <p id={`${ids}-text`} className="type-body text-muted">
          {t(step.textKey)}
        </p>
        <div className="flex items-center gap-1.5" aria-hidden>
          {def.steps.map((s, i) => (
            <span key={s.id} className={clsx('h-1.5 rounded-full', i === index ? 'w-5 bg-brand-600' : 'w-1.5 bg-line')} />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs text-muted">
            <input type="checkbox" className="size-4 rounded border-line accent-brand-600" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            {t('pux.tour.dontShow')}
          </label>
          <div className="ml-auto flex items-center gap-2">
            {index > 0 ? (
              <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={back}>
                {t('pux.tour.back')}
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={skip}>
                {t('pux.tour.skip')}
              </Button>
            )}
            <Button size="sm" iconRight={last ? Check : ArrowRight} onClick={next} data-autofocus>
              {last ? t('pux.tour.done') : t('pux.tour.next')}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
