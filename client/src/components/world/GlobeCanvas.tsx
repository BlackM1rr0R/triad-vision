import { useEffect, useRef, useState } from 'react';
import createGlobe from 'cobe';
import { Pause, Play } from 'lucide-react';
import { BAKU, HOME_VIEW, project } from './globeMath';
import { labelText, pillWidth, placeLabels, type GlobeCity } from './globeShared';

/**
 * The WebGL globe (own lazy chunk with cobe 2.0.1, MIT, ~6 kB gzip). Mounted by GlobeSection only after
 * hydration, once the section is near the viewport, with motion allowed and WebGL available. It renders over
 * the static SVG globe and tells the section when its first frame is drawn.
 *
 * Rotates slowly; drag (mouse or finger, horizontal — vertical swipes still scroll the page) turns it; hovering
 * pauses the rotation, a tap or the button toggles it. Frames are drawn only while the globe is on screen and the
 * tab is visible (IntersectionObserver + visibilitychange), and only when something moved.
 *
 * The canvas is created here, outside React's tree: cobe wraps it in a div of its own, which React must not own.
 */
const ROTATE_PER_MS = 0.00009; // ≈ one turn in 70 s
const THETA_MIN = -0.2;
const THETA_MAX = 0.9;

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export default function GlobeCanvas({
  cities,
  bakuLabel,
  pauseLabel,
  playLabel,
  onReady,
}: {
  cities: GlobeCity[];
  bakuLabel: string;
  pauseLabel: string;
  playLabel: string;
  onReady: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const bakuRef = useRef<HTMLSpanElement>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const kick = useRef<() => void>(() => undefined);

  useEffect(() => {
    pausedRef.current = paused;
    kick.current();
  }, [paused]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:grab;touch-action:pan-y;outline:none';
    canvas.setAttribute('aria-hidden', 'true');
    el.append(canvas);

    let size = Math.max(1, Math.round(el.clientWidth));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const max = Math.max(1, ...cities.map((c) => c.workers));
    const marker = hexRgb('#f2b52e');
    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size,
      height: size,
      phi: HOME_VIEW.phi,
      theta: HOME_VIEW.theta,
      dark: 1,
      diffuse: 1.25,
      mapSamples: 14000,
      mapBrightness: 5.5,
      baseColor: [0.22, 0.32, 0.56],
      markerColor: marker,
      glowColor: [0.28, 0.42, 0.8],
      arcColor: marker,
      arcWidth: 0.7,
      arcHeight: 0.22,
      markerElevation: 0.01,
      markers: [
        { location: BAKU, size: 0.05, color: [1, 1, 1] },
        ...cities.map((c) => ({ location: c.ll, size: 0.025 + 0.04 * Math.sqrt(c.workers / max) })),
      ],
      arcs: cities.map((c) => ({ from: BAKU, to: c.ll })),
    });

    let phi = HOME_VIEW.phi;
    let theta = HOME_VIEW.theta;
    let dirty = true;
    let hover = false;
    let drag: { id: number; x: number; y: number; phi: number; theta: number; moved: boolean } | null = null;
    let onScreen = false;
    let raf = 0;
    let last = 0;
    let first = true;

    const placeOverlay = () => {
      const items = cities.map((c, i) => {
        const p = project(c.ll, phi, theta, 0.01);
        const text = labelText(c);
        return { i, x: p.x * size + 6, y: p.y * size - 22, w: pillWidth(text), h: 18, front: p.z > 0.05 };
      });
      const shown = new Set(placeLabels(items.filter((it) => it.front)).map((it) => it.i));
      items.forEach((it) => {
        const node = labels.current[it.i];
        if (!node) return;
        node.style.transform = `translate3d(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px, 0)`;
        node.style.opacity = shown.has(it.i) ? '1' : '0';
      });
      const b = project(BAKU, phi, theta, 0.01);
      if (bakuRef.current) {
        bakuRef.current.style.transform = `translate3d(${(b.x * size).toFixed(1)}px, ${(b.y * size + 8).toFixed(1)}px, 0) translateX(-50%)`;
        bakuRef.current.style.opacity = b.z > 0.05 ? '1' : '0';
      }
    };

    const frame = (ts: number) => {
      raf = 0;
      if (!onScreen || document.hidden) return;
      const dt = last ? Math.min(64, ts - last) : 16;
      last = ts;
      const spinning = !pausedRef.current && !hover && !drag;
      if (spinning) {
        phi += dt * ROTATE_PER_MS;
        dirty = true;
      }
      if (dirty) {
        globe.update({ phi, theta });
        placeOverlay();
        dirty = false;
        if (first) {
          first = false;
          onReady();
        }
      }
      // Keep the loop alive only while something can still move.
      if (spinning || drag) raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!raf && onScreen && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    kick.current = () => {
      dirty = true;
      start();
    };

    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (onScreen) start();
    });
    io.observe(el);
    const onVisibility = () => {
      if (!document.hidden) start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const ro = new ResizeObserver(() => {
      const next = Math.max(1, Math.round(el.clientWidth));
      if (next === size) return;
      size = next;
      globe.update({ width: size, height: size });
      kick.current();
    });
    ro.observe(el);

    const onDown = (e: PointerEvent) => {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, phi, theta, moved: false };
      canvas.style.cursor = 'grabbing';
      kick.current();
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 4) {
        drag.moved = true;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
      }
      if (!drag.moved) return;
      phi = drag.phi + (dx / size) * Math.PI;
      theta = Math.min(THETA_MAX, Math.max(THETA_MIN, drag.theta + (dy / size) * Math.PI * 0.6));
      dirty = true;
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const tap = !drag.moved;
      drag = null;
      canvas.style.cursor = 'grab';
      // A tap on a touch screen toggles the rotation (there is no hover there).
      if (tap && e.pointerType !== 'mouse') setPaused((p) => !p);
      kick.current();
    };
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      hover = true;
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      hover = false;
      kick.current();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerenter', onEnter);
    canvas.addEventListener('pointerleave', onLeave);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      kick.current = () => undefined;
      globe.destroy();
      el.replaceChildren();
    };
    // cities is stable for the lifetime of the canvas (the section remounts it when the data changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {cities.map((c, i) => (
          <span
            key={c.city}
            ref={(n) => {
              labels.current[i] = n;
            }}
            className="absolute top-0 left-0 rounded-full bg-white/95 px-1.5 text-[10.5px] leading-[18px] font-bold whitespace-nowrap text-[#0b1f44] opacity-0 shadow-sm transition-opacity duration-200"
          >
            {labelText(c)}
          </span>
        ))}
        <span ref={bakuRef} className="absolute top-0 left-0 text-[11px] font-bold text-white opacity-0 transition-opacity duration-200">
          {bakuLabel}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        className="absolute right-3 bottom-3 inline-flex size-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        aria-label={paused ? playLabel : pauseLabel}
        aria-pressed={paused}
      >
        {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
      </button>
    </>
  );
}
