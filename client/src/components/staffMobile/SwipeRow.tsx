import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { isHorizontal, swipeOffset, swipeOutcome, swipeThreshold, type SwipeSide } from './pure';

export type SwipeTone = 'success' | 'danger' | 'primary' | 'neutral';

export interface SwipeAction {
  label: string;
  icon: LucideIcon;
  tone: SwipeTone;
  onTrigger: () => void;
}

const TONE: Record<SwipeTone, { idle: string; armed: string }> = {
  success: { idle: 'bg-success-bg text-success-fg', armed: 'bg-success text-white' },
  danger: { idle: 'bg-danger-bg text-danger-fg', armed: 'bg-danger text-white' },
  primary: { idle: 'bg-info-bg text-info-fg', armed: 'bg-primary text-primary-contrast' },
  neutral: { idle: 'bg-sunken text-muted', armed: 'bg-line-strong text-ink' },
};

/**
 * A list row that can be swiped sideways on touch screens: finger to the right triggers `right` (its action sits on
 * the left edge), to the left triggers `left`. Pointer events with `touch-action: pan-y`, so vertical scrolling stays
 * native; the row follows the finger 1:1 up to the threshold, then rubber-bands, and the action "arms" (solid colour)
 * once releasing would trigger it. A swipe never also counts as a tap. Mouse drags are ignored (desktop clicks stay
 * clicks). Swiping is a shortcut only: every action must also be a visible button in the row (callers render them).
 */
export const SwipeRow = ({ children, left, right, disabled, className }: { children: ReactNode; left?: SwipeAction; right?: SwipeAction; disabled?: boolean; className?: string }) => {
  const box = useRef<HTMLDivElement>(null);
  const g = useRef<{ x: number; y: number; id: number; mode: 'pending' | 'swipe' | 'scroll'; lastX: number; lastT: number; v: number } | null>(null);
  const swallowClick = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const allowed = { left: !!left, right: !!right };
  const width = box.current?.clientWidth ?? 320;
  const threshold = swipeThreshold(width);

  const reset = () => {
    g.current = null;
    setDragging(false);
    setDx(0);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || e.pointerType === 'mouse' || (!left && !right)) return;
    g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, mode: 'pending', lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const rx = e.clientX - s.x;
    const ry = e.clientY - s.y;
    if (s.mode === 'pending') {
      if (isHorizontal(rx, ry)) {
        s.mode = 'swipe';
        setDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
      } else if (Math.abs(ry) > 10) {
        s.mode = 'scroll';
        return;
      } else return;
    }
    if (s.mode !== 'swipe') return;
    const dt = e.timeStamp - s.lastT;
    if (dt > 0) s.v = (e.clientX - s.lastX) / dt;
    s.lastX = e.clientX;
    s.lastT = e.timeStamp;
    setDx(swipeOffset(rx, threshold, allowed));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    if (s.mode === 'swipe') {
      swallowClick.current = true;
      window.setTimeout(() => (swallowClick.current = false), 400);
      const side = swipeOutcome(e.clientX - s.x, threshold, allowed, s.v);
      reset();
      if (side) (side === 'left' ? left : right)?.onTrigger();
      return;
    }
    g.current = null;
  };

  const showing: SwipeSide | null = dx > 0 ? 'right' : dx < 0 ? 'left' : null;
  const action = showing === 'right' ? right : showing === 'left' ? left : undefined;
  const armed = !!action && Math.abs(dx) >= threshold * 0.98;
  const Icon = action?.icon;

  return (
    <div ref={box} className={clsx('relative overflow-hidden rounded-xl', className)}>
      {action && Icon && (
        <div
          className={clsx(
            'absolute inset-0 flex items-center px-5 text-sm font-semibold transition-colors motion-reduce:transition-none',
            showing === 'right' ? 'justify-start' : 'justify-end',
            armed ? TONE[action.tone].armed : TONE[action.tone].idle,
          )}
          aria-hidden
        >
          <span className={clsx('flex items-center gap-2 transition-transform motion-reduce:transition-none', armed && 'scale-110')}>
            <Icon className="size-5" />
            {action.label}
          </span>
        </div>
      )}
      <div
        className={clsx('relative touch-pan-y', !dragging && 'transition-transform duration-200 ease-out motion-reduce:transition-none')}
        style={{ transform: dx ? `translate3d(${dx}px,0,0)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        onClickCapture={(e) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
};
