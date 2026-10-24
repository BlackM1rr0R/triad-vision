import { motionAllowed } from '@/lib/viewTransition';

/*
 * A light confetti burst for success moments (contract signed, payment recorded, visa approved…).
 * ~1 KB, no dependency: one short-lived full-screen <canvas> (pointer-events: none, aria-hidden), ~70 pieces,
 * gone after ~1.6 s. Colours come from the theme tokens, so the burst follows the design (and a later redesign).
 * Does nothing for reduced-motion users ("Stop animations" in the accessibility widget or the OS setting).
 */

type Piece = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; w: number; h: number; color: string; shape: 0 | 1 };

const TOKENS = ['--color-brand-500', '--color-success', '--color-de-gold', '--color-az-blue', '--color-accent', '--color-brand-400'];
const FALLBACK = ['#2f7bff', '#12a150', '#ffce00', '#00b5e2', '#8b5cf6', '#5c9bff'];

const palette = () => {
  const css = getComputedStyle(document.documentElement);
  return TOKENS.map((v, i) => css.getPropertyValue(v).trim() || FALLBACK[i]);
};

let active = 0;

export type CelebrateOptions = {
  /** Where the burst starts: an element (its centre) or viewport coordinates. Default: upper middle of the screen. */
  origin?: HTMLElement | { x: number; y: number } | null;
  /** Number of pieces (default 70, max 160). */
  count?: number;
};

/** Fires a confetti burst. Returns true when it ran (false: reduced motion, no canvas, or too many at once). */
export const celebrate = (opts: CelebrateOptions = {}): boolean => {
  if (typeof window === 'undefined' || !motionAllowed() || active >= 2) return false;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '10001' });
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);
  active += 1;

  let ox = W / 2;
  let oy = H * 0.35;
  const o = opts.origin;
  if (o instanceof HTMLElement) {
    const r = o.getBoundingClientRect();
    ox = r.left + r.width / 2;
    oy = r.top + r.height / 2;
  } else if (o) {
    ox = o.x;
    oy = o.y;
  }

  const colors = palette();
  const n = Math.min(160, Math.max(10, opts.count ?? 70));
  const pieces: Piece[] = Array.from({ length: n }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 7 + Math.random() * 7;
    return {
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      w: 5 + Math.random() * 5,
      h: 7 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.random() < 0.3 ? 1 : 0,
    };
  });

  const DURATION = 1600;
  const start = performance.now();
  let last = start;
  const frame = (now: number) => {
    const dt = Math.min(2, (now - last) / 16.67);
    last = now;
    const t = (now - start) / DURATION;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1;
    for (const p of pieces) {
      p.vy += 0.32 * dt; // gravity
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // flat rectangle that "flips" as it spins
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
      }
      ctx.restore();
    }
    if (t < 1) requestAnimationFrame(frame);
    else {
      canvas.remove();
      active -= 1;
    }
  };
  requestAnimationFrame(frame);
  return true;
};

/** Remembers that a one-time celebration (e.g. "visa approved" for a case) was shown on this device. */
export const celebrateOnce = (key: string, opts?: CelebrateOptions): boolean => {
  const k = `tv_celebrated:${key}`;
  try {
    if (localStorage.getItem(k)) return false;
    localStorage.setItem(k, '1');
  } catch {
    // storage unavailable: celebrate anyway (at worst once per page view)
  }
  return celebrate(opts);
};
