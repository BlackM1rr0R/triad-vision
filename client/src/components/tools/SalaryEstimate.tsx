import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import clsx from 'clsx';
import { useL10n } from '@/lib/l10n';
import { quickNetMonthly } from '@/lib/salary/calc';
import { useMoney } from './format';

/*
 * Compact "≈ net per month" hint for a monthly gross salary (or range), e.g. on the vacancy page.
 * Its four-language copy is inline so pages embedding it do not pull in the whole tools bundle.
 */
const COPY = {
  az: { label: '≈ aylıq xalis (I vergi sinfi)', link: 'Dəqiq hesabla' },
  de: { label: '≈ netto pro Monat (Steuerklasse I)', link: 'Genau berechnen' },
  en: { label: '≈ net per month (tax class I)', link: 'Calculate exactly' },
  ru: { label: '≈ нетто в месяц (налоговый класс I)', link: 'Рассчитать точно' },
} as const;

export const SalaryEstimate = ({ min, max, className }: { min?: number | null; max?: number | null; className?: string }) => {
  const { locale } = useL10n();
  const { euro } = useMoney();
  const copy = COPY[locale] ?? COPY.en;

  const est = useMemo(() => {
    const lo = min && min > 0 ? min : max && max > 0 ? max : null;
    if (!lo) return null;
    const hi = max && max > lo ? max : null;
    const prefill = Math.round(hi ? (lo + hi) / 2 : lo);
    return { lo: quickNetMonthly(lo), hi: hi ? quickNetMonthly(hi) : null, prefill };
  }, [min, max]);

  if (!est) return null;
  const value = est.hi ? `${euro(est.lo)} – ${euro(est.hi)}` : euro(est.lo);

  return (
    <div className={clsx('flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs', className)}>
      <span className="text-muted">{copy.label}:</span>
      <span className="font-semibold text-success-fg tabular-nums">{value}</span>
      <Link
        to={`/salary-calculator?gross=${est.prefill}`}
        className="inline-flex items-center gap-1 font-semibold text-link hover:underline focus-visible:underline"
      >
        <Calculator className="size-3" aria-hidden /> {copy.link}
      </Link>
    </div>
  );
};

export default SalaryEstimate;
