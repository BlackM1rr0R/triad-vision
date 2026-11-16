import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Minus, Plus, RotateCcw } from 'lucide-react';

export interface MapSpot {
  id: string;
  /** Position in the illustration's viewBox. */
  x: number;
  y: number;
  /** Text on the marker (the point number, "?" in a quiz). */
  content: ReactNode;
  /** Accessible name of the button. */
  label: string;
  /** Tooltip (defaults to none). */
  title?: string;
  active?: boolean;
  /** Filtered out: faded, not focusable, not clickable. */
  hidden?: boolean;
  /** Emphasised marker (quiz target): pulses and uses the highlight colour. */
  target?: boolean;
}

const ZOOMS = [1, 1.5, 2, 2.5] as const;

/**
 * Zoomable illustration with numbered hotspot buttons on top — the engine of the interactive explainers
 * (/german-apartment, /work-scenes/*). The illustration (`children`, an aria-hidden SVG with the given viewBox
 * size) is decorative; the markers are real buttons (keyboard: Tab / Enter). Zoom buttons + native scrolling for
 * panning on phones; the active spot is kept in view when zoomed in.
 */
export function HotspotMap({
  width,
  height,
  spots,
  onSelect,
  mapLabel,
  children,
  disabled = false,
  zoomLabels,
}: {
  width: number;
  height: number;
  spots: MapSpot[];
  onSelect: (id: string) => void;
  mapLabel: string;
  children: ReactNode;
  /** All markers inert (e.g. while a quiz answer is shown). */
  disabled?: boolean;
  zoomLabels: { in: string; out: string; reset: string };
}) {
  const [zoom, setZoom] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const focus = spots.find((s) => s.target) ?? spots.find((s) => s.active) ?? null;

  // Keep the selected hotspot in view when zoomed in.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || !focus || zoom === 0) return;
    const x = (focus.x / width) * box.scrollWidth - box.clientWidth / 2;
    const y = (focus.y / height) * box.scrollHeight - box.clientHeight / 2;
    box.scrollTo({ left: x, top: y, behavior: 'smooth' });
  }, [focus?.id, zoom, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  const scale = ZOOMS[zoom];

  return (
    <div className="relative rounded-3xl border border-line bg-card p-2 sm:p-3">
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1 rounded-xl border border-line bg-card/95 p-1 shadow-sm">
        <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-sunken disabled:opacity-40" onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1} aria-label={zoomLabels.in}>
          <Plus className="size-4" aria-hidden />
        </button>
        <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-sunken disabled:opacity-40" onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} aria-label={zoomLabels.out}>
          <Minus className="size-4" aria-hidden />
        </button>
        <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-sunken disabled:opacity-40" onClick={() => setZoom(0)} disabled={zoom === 0} aria-label={zoomLabels.reset}>
          <RotateCcw className="size-4" aria-hidden />
        </button>
      </div>
      <div ref={scrollRef} className="overflow-auto rounded-2xl overscroll-contain" style={{ touchAction: 'pan-x pan-y' }}>
        <div className="relative" style={{ width: `${scale * 100}%` }} role="group" aria-label={mapLabel}>
          {children}
          {spots.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => onSelect(h.id)}
              aria-pressed={!!h.active}
              aria-label={h.label}
              title={h.title}
              tabIndex={h.hidden || disabled ? -1 : 0}
              disabled={disabled && !h.target ? true : undefined}
              className={clsx(
                'absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-xs font-bold shadow-md transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none sm:size-8 sm:text-sm',
                h.active || h.target ? 'scale-125 border-white bg-highlight text-highlight-contrast' : 'border-white bg-primary text-primary-contrast hover:scale-110',
                h.target && 'animate-pulse motion-reduce:animate-none',
                h.hidden && 'pointer-events-none opacity-25',
              )}
              style={{ left: `${(h.x / width) * 100}%`, top: `${(h.y / height) * 100}%` }}
            >
              {h.content}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
