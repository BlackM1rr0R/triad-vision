import { useEffect, useId, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { DataTable, TableToggle } from '@/components/charts/parts';
import { VIZ, VIZ_TRACK } from '@/components/charts/format';
import { motionAllowed } from '@/lib/viewTransition';

export interface DonutPart {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Pre-formatted amounts for legend / table (EUR, AZN). */
  eur: string;
  azn: string | null;
}

/** Category colours: categorical viz tokens; the savings part takes the success colour so it reads as "yours". */
export const DONUT_COLORS = [VIZ[0], VIZ[1], VIZ[2], VIZ[3], VIZ[4], VIZ[5], VIZ[6]];
export const SAVINGS_COLOR = 'var(--color-success)';

const SIZE = 220;
const STROKE = 30;
const GAP = 2; // px surface gap between parts (chart convention)

/**
 * Donut of the net income: one part per cost category plus what is left. Parts grow in once (stroke-dasharray
 * transition) when motion is allowed; with reduced motion they are drawn at once. Hover / focus a legend row to
 * highlight its part; the table toggle lists every value (EUR and AZN) for screen readers and keyboard users.
 */
export const CostDonut = ({ parts, ariaLabel, center, sub }: { parts: DonutPart[]; ariaLabel: string; center: string; sub: string }) => {
  const { t } = useTranslation();
  const id = useId();
  const [drawn, setDrawn] = useState(() => !motionAllowed());
  const [active, setActive] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  useEffect(() => {
    if (drawn) return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
    return () => cancelAnimationFrame(raf);
  }, [drawn]);

  const shown = parts.filter((p) => p.value > 0);
  const total = shown.reduce((s, p) => s + p.value, 0);
  const r = (SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = shown.map((p) => {
    const len = total ? (p.value / total) * c : 0;
    const a = { ...p, len: Math.max(0, len - GAP), offset };
    offset += len;
    return a;
  });
  const share = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  const summary = shown.map((p) => `${p.label} ${p.eur} (${share(p.value)} %)`).join(', ');

  return (
    <div>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }} role="img" aria-label={`${ariaLabel}: ${summary}`}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden className="-rotate-90">
            <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke={VIZ_TRACK} strokeWidth={STROKE} />
            {arcs.map((a) => (
              <circle
                key={a.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={r}
                fill="none"
                stroke={a.color}
                strokeWidth={active === a.key ? STROKE + 4 : STROKE}
                strokeDasharray={`${(drawn ? a.len : 0).toFixed(2)} ${c.toFixed(2)}`}
                strokeDashoffset={(-(drawn ? a.offset : 0)).toFixed(2)}
                className={clsx('motion-safe:transition-[stroke-dasharray,stroke-dashoffset,stroke-width] motion-safe:duration-700 motion-safe:ease-out', active && active !== a.key && 'opacity-50')}
              />
            ))}
          </svg>
          <span className="pointer-events-none absolute inset-0 grid place-content-center px-8 text-center" aria-hidden>
            <span className="font-display text-xl leading-tight font-semibold text-ink tabular-nums">{center}</span>
            <span className="mt-0.5 text-xs leading-tight text-muted">{sub}</span>
          </span>
        </div>
        <ul className="w-full min-w-0 flex-1 space-y-1">
          {shown.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                onMouseEnter={() => setActive(p.key)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(p.key)}
                onBlur={() => setActive(null)}
                className={clsx('flex w-full min-h-9 items-center gap-2 rounded-lg px-2 py-1 text-left text-sm transition-colors hover:bg-sunken', active === p.key && 'bg-sunken')}
              >
                <span className="size-3 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ink">{p.label}</span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="font-semibold text-ink">{p.eur}</span>
                  {p.azn && <span className="block text-[11px] leading-tight text-muted">{p.azn}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3 flex justify-end">
        <TableToggle open={table} onToggle={() => setTable((v) => !v)} controls={`${id}-table`} />
      </div>
      {table && (
        <DataTable
          id={`${id}-table`}
          className="mt-2"
          head={[t('life.result.item'), t('life.result.eur'), t('life.result.azn'), '%']}
          rows={shown.map((p) => [p.label, p.eur, p.azn ?? '—', `${share(p.value)} %`])}
        />
      )}
    </div>
  );
};
