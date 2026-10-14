import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { ticks } from './utils';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Bar that grows from its left edge once it scrolls into view (transform only — cheap to animate). */
const GrowBar = ({ left, width, delay = 0, className }: { left: number; width: number; delay?: number; className?: string }) => (
  <motion.span
    className={clsx('absolute top-1/2 -translate-y-1/2 rounded-full', className)}
    style={{ left: `${left}%`, width: `${Math.max(width, 1.2)}%`, originX: 0 }}
    initial={{ scaleX: 0 }}
    whileInView={{ scaleX: 1 }}
    viewport={{ once: true, margin: '-40px' }}
    transition={{ duration: 0.9, delay, ease: EASE }}
  />
);

const Gridlines = ({ values, top }: { values: number[]; top: number }) => (
  <>
    {values.map((v) => (
      <span key={v} className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${(v / top) * 100}%` }} />
    ))}
  </>
);

const Axis = ({ values, top, format, className }: { values: number[]; top: number; format: (n: number) => string; className?: string }) => (
  <div className={clsx('relative h-5 text-[11px] font-medium text-muted tabular-nums', className)}>
    {values.map((v, i) => (
      <span
        key={v}
        className={clsx(
          'absolute top-0 whitespace-nowrap',
          i === 0 ? '' : i === values.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
          i % 2 === 1 && values.length > 5 && 'max-sm:hidden',
        )}
        style={{ left: `${(v / top) * 100}%` }}
      >
        {format(v)}
      </span>
    ))}
  </div>
);

export interface RangeRow {
  key: string;
  label: string;
  min: number;
  max: number;
  href?: string;
  /** Rows marked muted are drawn in grey (e.g. trainee pay that isn't comparable with wages). */
  muted?: boolean;
  suffix?: string;
}

/**
 * Horizontal range bars (min → max per row) with an optional dashed reference line.
 * The visual is aria-hidden; a visually hidden table carries the same values for screen readers.
 */
export const RangeBars = ({
  rows,
  format,
  rangeText,
  reference,
  tone = 'brand',
  title,
}: {
  rows: RangeRow[];
  format: (n: number) => string;
  rangeText: (min: number, max: number) => string;
  reference?: { value: number; label: string };
  tone?: 'brand' | 'navy';
  title: string;
}) => {
  const maxVal = Math.max(...rows.map((r) => r.max), reference?.value ?? 0);
  const { top, values } = ticks(maxVal * 1.04, 5);
  const pct = (n: number) => (n / top) * 100;
  const bar = tone === 'brand' ? 'h-3 bg-gradient-to-r from-brand-500 to-brand-700' : 'h-3 bg-gradient-to-r from-navy-700 to-navy-900';

  return (
    <figure>
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td>{rangeText(r.min, r.max)}</td>
              </tr>
            ))}
            {reference && (
              <tr>
                <th scope="row">{reference.label}</th>
                <td>{format(reference.value)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div aria-hidden className="space-y-3 sm:space-y-2">
        {rows.map((r, i) => {
          const label = (
            <span className="truncate font-semibold text-navy-900">
              {r.label}
              {r.suffix}
            </span>
          );
          return (
            <div key={r.key} className="grid gap-1 sm:grid-cols-[minmax(9rem,13rem)_1fr] sm:items-center sm:gap-4">
              <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm sm:flex-col sm:items-start sm:gap-0">
                {r.href ? (
                  <Link to={r.href} tabIndex={-1} className="min-w-0 truncate hover:text-brand-600">
                    {label}
                  </Link>
                ) : (
                  label
                )}
                <span className="shrink-0 text-xs text-muted tabular-nums">{rangeText(r.min, r.max)}</span>
              </div>
              <div className="relative h-7">
                <Gridlines values={values} top={top} />
                {reference && <span className="absolute inset-y-[-4px] z-10 border-l-2 border-dashed border-warning" style={{ left: `${pct(reference.value)}%` }} />}
                <GrowBar left={pct(r.min)} width={pct(r.max - r.min)} delay={i * 0.05} className={r.muted ? 'h-3 bg-slate-300' : bar} />
              </div>
            </div>
          );
        })}
        <div className="grid sm:grid-cols-[minmax(9rem,13rem)_1fr] sm:gap-4">
          <span className="max-sm:hidden" />
          <Axis values={values} top={top} format={format} />
        </div>
      </div>
      {reference && (
        <figcaption className="mt-3 flex items-center gap-2 text-xs text-muted" aria-hidden>
          <span className="h-3.5 border-l-2 border-dashed border-warning" />
          {reference.label}: <strong className="font-semibold text-navy-900 tabular-nums">≈ {format(reference.value)}</strong>
        </figcaption>
      )}
    </figure>
  );
};

/** One salary range on a scale, with a labelled reference (minimum wage) marker. */
export const SalaryScale = ({
  min,
  max,
  format,
  rangeLabel,
  reference,
  ariaLabel,
}: {
  min: number;
  max: number;
  format: (n: number) => string;
  rangeLabel: string;
  reference?: { value: number; label: string };
  ariaLabel: string;
}) => {
  const { top, values } = ticks(Math.max(max, reference?.value ?? 0) * 1.12, 5);
  const pct = (n: number) => (n / top) * 100;
  return (
    <div role="img" aria-label={ariaLabel}>
      <div aria-hidden>
        {reference && (
          <div className="relative mb-2 h-9">
            <span
              className={clsx(
                'absolute bottom-0 rounded-md bg-amber-50 px-2 py-1 text-[11px] leading-tight font-semibold whitespace-nowrap text-amber-800 ring-1 ring-amber-200',
                pct(reference.value) > 60 ? '-translate-x-full' : pct(reference.value) > 25 ? '-translate-x-1/2' : '',
              )}
              style={{ left: `${pct(reference.value)}%` }}
            >
              {reference.label} ≈ {format(reference.value)}
            </span>
          </div>
        )}
        <div className="relative h-12 rounded-xl bg-surface">
          <Gridlines values={values} top={top} />
          {reference && <span className="absolute inset-y-[-10px] z-10 border-l-2 border-dashed border-warning" style={{ left: `${pct(reference.value)}%` }} />}
          <GrowBar left={pct(min)} width={pct(max - min)} className="h-6 bg-gradient-to-r from-brand-500 to-brand-700 shadow-lg shadow-brand-600/30" />
        </div>
        <div className="relative mt-2 h-10">
          <span className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${pct(min)}%` }}>
            <span className="mx-auto block h-2 w-px bg-brand-600" />
            <span className="block text-xs font-bold whitespace-nowrap text-navy-900 tabular-nums">{format(min)}</span>
          </span>
          <span className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${pct(max)}%` }}>
            <span className="mx-auto block h-2 w-px bg-brand-600" />
            <span className="block text-xs font-bold whitespace-nowrap text-navy-900 tabular-nums">{format(max)}</span>
          </span>
        </div>
        <Axis values={values} top={top} format={format} className="mt-1 border-t border-line pt-1.5" />
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-6 rounded-full bg-gradient-to-r from-brand-500 to-brand-700" /> {rangeLabel}
          </span>
          {reference && (
            <span className="inline-flex items-center gap-2">
              <span className="h-3.5 border-l-2 border-dashed border-warning" /> {reference.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export interface GanttPhase {
  key: string;
  title: string;
  text: string;
  min: number;
  max: number;
}

/**
 * Sequential phases on a week axis. Each phase starts at the earliest possible week (sum of previous minimums);
 * the solid part is its minimum length, the hatched part runs to the latest finish (sum of maximums).
 */
export const Gantt = ({
  phases,
  axisLabel,
  weeksText,
  ariaLabel,
}: {
  phases: GanttPhase[];
  axisLabel: string;
  weeksText: (min: number, max: number) => string;
  ariaLabel: string;
}) => {
  let accMin = 0;
  let accMax = 0;
  const rows = phases.map((p) => {
    const start = accMin;
    accMin += p.min;
    accMax += p.max;
    return { ...p, start, solidEnd: start + p.min, end: accMax };
  });
  const { top, values } = ticks(accMax, 6);
  const pct = (n: number) => (n / top) * 100;

  return (
    <figure>
      <div className="sr-only">
        <table>
          <caption>{ariaLabel}</caption>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.title}</th>
                <td>{weeksText(r.min, r.max)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol aria-hidden className="space-y-4 sm:space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className="grid gap-1.5 sm:grid-cols-[minmax(10rem,15rem)_1fr] sm:items-center sm:gap-5">
            <div className="flex min-w-0 gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-navy-900 font-display text-xs font-bold text-white">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-sm leading-tight font-bold text-navy-900">{r.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  <span className="font-semibold text-brand-700 tabular-nums">{weeksText(r.min, r.max)}</span> · {r.text}
                </p>
              </div>
            </div>
            <div className="relative h-8 max-sm:ml-10">
              <Gridlines values={values} top={top} />
              <GrowBar
                left={pct(r.start)}
                width={pct(r.end - r.start)}
                delay={i * 0.12}
                className="h-4 bg-brand-100 [background-image:repeating-linear-gradient(135deg,rgba(21,101,232,0.22)_0_4px,transparent_4px_8px)]"
              />
              <GrowBar left={pct(r.start)} width={pct(r.solidEnd - r.start)} delay={i * 0.12} className="h-4 bg-gradient-to-r from-brand-500 to-brand-700" />
            </div>
          </li>
        ))}
        <li className="grid sm:grid-cols-[minmax(10rem,15rem)_1fr] sm:gap-5">
          <span className="self-end text-right text-[11px] font-semibold tracking-wide text-muted uppercase max-sm:hidden">{axisLabel}</span>
          <Axis values={values} top={top} format={(n) => String(n)} className="max-sm:ml-10" />
        </li>
      </ol>
    </figure>
  );
};

/** Grouped vertical bars (e.g. trainee pay per training year). */
export const GroupedBars = ({
  groups,
  series,
  format,
  ariaLabel,
}: {
  groups: { key: string; label: string; values: number[] }[];
  series: string[];
  format: (n: number) => string;
  ariaLabel: string;
}) => {
  const maxVal = Math.max(...groups.flatMap((g) => g.values));
  const { top } = ticks(maxVal * 1.05, 4);
  const shades = ['bg-brand-400', 'bg-brand-600', 'bg-navy-900'];
  return (
    <figure>
      <div className="sr-only">
        <table>
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col" />
              {series.map((s) => (
                <th key={s} scope="col">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key}>
                <th scope="row">{g.label}</th>
                {g.values.map((v, i) => (
                  <td key={series[i]}>{format(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div aria-hidden>
        <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-navy-900">
          {series.map((s, i) => (
            <span key={s} className="inline-flex items-center gap-2">
              <span className={clsx('size-3 rounded-sm', shades[i])} /> {s}
            </span>
          ))}
        </div>
        <div className="grid gap-x-12 gap-y-6 md:grid-cols-2">
          {groups.map((g, gi) => (
            <div key={g.key}>
              <p className="mb-2 text-sm font-bold text-navy-900">{g.label}</p>
              <div className="space-y-1.5">
                {g.values.map((v, i) => (
                  <div key={series[i]} className="flex items-center gap-3">
                    <div className="relative h-5 flex-1 rounded-md bg-surface">
                      <GrowBar left={0} width={(v / top) * 100} delay={gi * 0.05 + i * 0.07} className={clsx('h-5 rounded-md', shades[i])} />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs font-semibold text-navy-900 tabular-nums">{format(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
};
