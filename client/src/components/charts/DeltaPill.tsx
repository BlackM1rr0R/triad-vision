import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useVizFormat } from './format';
import './parts';

/**
 * Signed change vs. a named period as a small pill: arrow + value. The tone is direction × whether up is good
 * (status tokens, always with the arrow icon, never colour alone). `null` renders a muted dash.
 */
export const DeltaPill = ({
  value,
  better = 'up',
  unit = '%',
  title,
  className,
}: {
  /** Percent change (or points / days when `unit` says so). */
  value: number | null | undefined;
  better?: 'up' | 'down' | 'none';
  unit?: '%' | 'pp' | '' | string;
  /** Tooltip, e.g. "vs. last month". */
  title?: string;
  className?: string;
}) => {
  const { t } = useTranslation();
  const f = useVizFormat();
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={clsx('inline-flex h-5 items-center rounded-full bg-neutral-bg px-1.5 text-[11px] font-semibold text-muted', className)}>—</span>;
  }
  const dir = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const good = better === 'none' || dir === 'flat' ? null : (dir === 'up') === (better === 'up');
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
  const text = `${value > 0 ? '+' : value < 0 ? '−' : ''}${f.num1(Math.abs(value))}${unit === 'pp' ? ' pp' : unit}`;
  const spoken = dir === 'flat' ? t('viz.deltaFlat') : t(dir === 'up' ? 'viz.deltaUp' : 'viz.deltaDown', { value: `${f.num1(Math.abs(value))}${unit === 'pp' ? ' pp' : unit}` });
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-semibold whitespace-nowrap tabular-nums',
        good === null ? 'bg-neutral-bg text-neutral-fg' : good ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg',
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span aria-hidden>{text}</span>
      <span className="sr-only">
        {spoken}
        {title ? `, ${title}` : ''}
      </span>
    </span>
  );
};

/** Percent change between two counts (null when there is no base). */
export const pctDelta = (cur: number | null | undefined, prev: number | null | undefined) =>
  cur == null || prev == null || prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10;
