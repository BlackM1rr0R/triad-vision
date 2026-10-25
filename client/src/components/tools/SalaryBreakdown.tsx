import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { SalaryAmounts } from '@/lib/salary/calc';
import { useMoney } from './format';

const ROWS: (keyof SalaryAmounts)[] = ['gross', 'incomeTax', 'soli', 'churchTax', 'pension', 'unemployment', 'health', 'care', 'net'];
const TAX_KEYS: (keyof SalaryAmounts)[] = ['incomeTax', 'soli', 'churchTax'];
const SOCIAL_KEYS: (keyof SalaryAmounts)[] = ['pension', 'unemployment', 'health', 'care'];

const GROUPS = [
  { key: 'taxes', swatch: 'bg-danger' },
  { key: 'social', swatch: 'bg-primary' },
  { key: 'net', swatch: 'bg-success' },
] as const;

/** Stacked bar (taxes / social insurance / net) + itemised table for one period. */
export const SalaryBreakdown = ({ amounts }: { amounts: SalaryAmounts }) => {
  const { t } = useTranslation();
  const { euro, euroCents, percent } = useMoney();
  const sum = (keys: (keyof SalaryAmounts)[]) => keys.reduce((s, k) => s + amounts[k], 0);
  const values = { taxes: sum(TAX_KEYS), social: sum(SOCIAL_KEYS), net: Math.max(0, amounts.net) };
  const total = amounts.gross > 0 ? amounts.gross : 1;
  const summary = GROUPS.map((g) => `${t(`salaryPage.groups.${g.key}`)} ${percent(values[g.key] / total)}`).join(', ');

  return (
    <div>
      <div
        role="img"
        aria-label={t('salaryPage.result.barAria', { summary })}
        className="flex h-4 w-full overflow-hidden rounded-full bg-sunken ring-1 ring-line"
      >
        {amounts.gross > 0 &&
          GROUPS.map((g) => (
            <span
              key={g.key}
              className={clsx('h-full transition-[width] duration-300', g.swatch)}
              style={{ width: `${(values[g.key] / total) * 100}%` }}
            />
          ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        {GROUPS.map((g) => (
          <li key={g.key} className="inline-flex items-center gap-1.5 text-muted">
            <span className={clsx('size-2.5 rounded-sm', g.swatch)} aria-hidden />
            {t(`salaryPage.groups.${g.key}`)}
            <span className="font-semibold text-ink tabular-nums">
              {euro(values[g.key])} · {percent(amounts.gross > 0 ? values[g.key] / total : 0)}
            </span>
          </li>
        ))}
      </ul>

      <table className="mt-5 w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col">{t('salaryPage.result.item')}</th>
            <th scope="col">{t('salaryPage.result.amount')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {ROWS.map((k) => {
            const strong = k === 'gross' || k === 'net';
            const deduction = !strong;
            return (
              <tr key={k} className={clsx(k === 'net' && 'border-t-2 border-line')}>
                <th scope="row" className={clsx('py-2 pr-3 text-left font-medium', strong ? 'font-bold text-ink' : 'text-muted')}>
                  <span className="inline-flex items-center gap-2">
                    {deduction && (
                      <span className={clsx('size-2 rounded-full', TAX_KEYS.includes(k) ? 'bg-danger' : 'bg-primary')} aria-hidden />
                    )}
                    {t(`salaryPage.rows.${k}`)}
                  </span>
                </th>
                <td className={clsx('py-2 text-right tabular-nums', strong ? 'font-bold text-ink' : 'text-ink/80', k === 'net' && 'text-success-fg')}>
                  {deduction && amounts[k] > 0 ? '− ' : ''}
                  {euroCents(amounts[k])}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
