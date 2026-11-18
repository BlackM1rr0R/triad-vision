import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMoney } from '@/components/tools/format';
import { registerLazyCopy } from '@/i18n';
import pagesTools from '@/i18n/pagesTools?lazy-copy';
import { calculateSalary, DEFAULT_INPUT, FEDERAL_STATES, sanitizeInput, STATE_NAMES, type FederalState, type TaxClass } from '@/lib/salary';
import { trackToolUse } from '@/lib/toolAnalytics';
import { EmbedLayout } from './EmbedLayout';

registerLazyCopy(pagesTools); // only the copy of the language in use, awaited before the page renders (vite/lazyCopy.ts)

const SLUG = 'salary-calculator';
const num = (s: string) => Number(s.replace(',', '.'));

/** Compact gross → net calculator (same engine and copy as /salary-calculator; age and Zusatzbeitrag at defaults). */
export default function SalaryEmbed() {
  const { t } = useTranslation();
  const id = useId();
  const { euro, euroCents, percent } = useMoney();
  const [gross, setGross] = useState(String(DEFAULT_INPUT.gross));
  const [period, setPeriod] = useState<'month' | 'year'>(DEFAULT_INPUT.period);
  const [taxClass, setTaxClass] = useState<TaxClass>(DEFAULT_INPUT.taxClass);
  const [state, setState] = useState<FederalState>(DEFAULT_INPUT.state);
  const [church, setChurch] = useState(false);
  const [children, setChildren] = useState('0');

  const input = useMemo(
    () => sanitizeInput({ ...DEFAULT_INPUT, gross: num(gross) || 0, period, taxClass, state, church, children: num(children) || 0 }),
    [gross, period, taxClass, state, church, children],
  );
  const result = useMemo(() => calculateSalary(input), [input]);
  const touch = <T,>(fn: (v: T) => void) => (v: T) => {
    trackToolUse(SLUG);
    fn(v);
  };
  const fullQuery = `gross=${Math.round(input.gross)}&period=${input.period}&class=${input.taxClass}&state=${input.state}${input.church ? '&church=1' : ''}&children=${input.children}`;

  return (
    <EmbedLayout widget={SLUG} fullQuery={fullQuery}>
      <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <div>
            <label htmlFor={`${id}-gross`} className="label">
              {t('salaryPage.form.gross')}
            </label>
            <input id={`${id}-gross`} className="input font-semibold tabular-nums" type="number" inputMode="decimal" min={0} step={50} value={gross} onChange={(e) => touch(setGross)(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-period`} className="label">
              {t('salaryPage.form.period')}
            </label>
            <select id={`${id}-period`} className="input" value={period} onChange={(e) => touch(setPeriod)(e.target.value === 'year' ? 'year' : 'month')}>
              <option value="month">{t('salaryPage.form.month')}</option>
              <option value="year">{t('salaryPage.form.year')}</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-class`} className="label">
            {t('salaryPage.form.taxClass')}
          </label>
          <select id={`${id}-class`} className="input" value={taxClass} onChange={(e) => touch(setTaxClass)(Number(e.target.value) as TaxClass)}>
            {([1, 2, 3, 4, 5, 6] as const).map((c) => (
              <option key={c} value={c}>
                {t(`salaryPage.form.classes.${c}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-state`} className="label">
            {t('salaryPage.form.state')}
          </label>
          <select id={`${id}-state`} className="input" value={state} onChange={(e) => touch(setState)(e.target.value as FederalState)}>
            {FEDERAL_STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_NAMES[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`${id}-church`} className="label">
              {t('salaryPage.form.church')}
            </label>
            <select id={`${id}-church`} className="input" value={church ? 'yes' : 'no'} onChange={(e) => touch(setChurch)(e.target.value === 'yes')}>
              <option value="no">{t('salaryPage.form.no')}</option>
              <option value="yes">{t('salaryPage.form.yes')}</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-children`} className="label">
              {t('salaryPage.form.children')}
            </label>
            <input id={`${id}-children`} className="input tabular-nums" type="number" inputMode="numeric" min={0} max={15} value={children} onChange={(e) => touch(setChildren)(e.target.value)} />
          </div>
        </div>
      </form>
      <div className="mt-3 grid grid-cols-2 gap-2" aria-live="polite">
        <div className="rounded-xl bg-success-bg p-3">
          <p className="text-xs font-semibold text-success-fg">{t('salaryPage.result.netMonth')}</p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-ink tabular-nums">{euroCents(result.monthly.net)}</p>
        </div>
        <div className="rounded-xl bg-sunken p-3">
          <p className="text-xs font-semibold text-muted">{t('salaryPage.result.netYear')}</p>
          <p className="mt-0.5 font-display text-xl font-semibold text-ink tabular-nums">{euro(result.yearly.net)}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">{t('salaryPage.result.deductions', { pct: percent(result.deductionRate) })}</p>
    </EmbedLayout>
  );
}
