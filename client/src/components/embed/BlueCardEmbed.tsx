import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesSeo } from '@/i18n/pagesSeo';
import { BLUE_CARD_GROUPS, checkBlueCard, euroFormat, useBlueCardThresholds, type BlueCardGroup } from '@/lib/calculators/blueCard';
import { trackToolUse } from '@/lib/toolAnalytics';
import { EmbedLayout } from './EmbedLayout';

registerCopy(pagesSeo);

const SLUG = 'blue-card-check';

/** Compact EU Blue Card salary check (same thresholds API, check and copy as /blue-card-check). */
export default function BlueCardEmbed() {
  const { t } = useTranslation();
  const id = useId();
  const { data } = useBlueCardThresholds();
  const [salary, setSalary] = useState('52000');
  const [period, setPeriod] = useState<'year' | 'month'>('year');
  const [group, setGroup] = useState<BlueCardGroup>('standard');
  const [degree, setDegree] = useState(true);
  const [contract, setContract] = useState(true);
  const year = data?.year ?? '';

  const fmt = useMemo(() => euroFormat(currentSiteLocale()), [t]);
  const { yearly, threshold, salaryOk, degreeOk, ok, diff } = checkBlueCard({ salary, period, group, degree, contract }, data?.thresholds, year);
  const touch = <T,>(fn: (v: T) => void) => (v: T) => {
    trackToolUse(SLUG);
    fn(v);
  };

  return (
    <EmbedLayout widget={SLUG}>
      <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <div>
            <label htmlFor={`${id}-salary`} className="label">
              {t('bcCheck.salary')}
            </label>
            <input id={`${id}-salary`} className="input font-semibold tabular-nums" type="number" inputMode="decimal" min={0} step={period === 'month' ? 50 : 500} value={salary} onChange={(e) => touch(setSalary)(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-period`} className="label">
              {t('bcCheck.period')}
            </label>
            <select id={`${id}-period`} className="input" value={period} onChange={(e) => touch(setPeriod)(e.target.value === 'month' ? 'month' : 'year')}>
              <option value="year">{t('bcCheck.year')}</option>
              <option value="month">{t('bcCheck.month')}</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-group`} className="label">
            {t('bcCheck.group')}
          </label>
          <select id={`${id}-group`} className="input" value={group} onChange={(e) => touch(setGroup)(e.target.value as BlueCardGroup)}>
            {BLUE_CARD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {t(`bcCheck.groups.${g}`)}
              </option>
            ))}
          </select>
        </div>
        {group !== 'it' && (
          <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={degree} onChange={(e) => touch(setDegree)(e.target.checked)} />
            <span>{t('bcCheck.degree')}</span>
          </label>
        )}
        <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
          <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={contract} onChange={(e) => touch(setContract)(e.target.checked)} />
          <span>{t('bcCheck.contract')}</span>
        </label>
      </form>
      <div className="mt-3" aria-live="polite">
        {threshold == null ? (
          <div className="h-24 animate-pulse rounded-xl bg-sunken" />
        ) : (
          <>
            <p className="font-display text-xl font-semibold text-ink tabular-nums">{t('bcCheck.yourSalary', { amount: fmt.format(yearly) })}</p>
            <p className="text-sm text-muted">{t('bcCheck.threshold', { year, amount: fmt.format(threshold) })}</p>
            <div className={clsx('mt-2 flex gap-2.5 rounded-xl p-3', ok ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg')}>
              {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden />}
              <div className="space-y-1 text-sm leading-relaxed">
                <p className="font-semibold">{salaryOk ? t('bcCheck.ok') : t('bcCheck.below')}</p>
                <p>{salaryOk ? t('bcCheck.okText', { diff: fmt.format(diff) }) : t('bcCheck.belowText', { diff: fmt.format(diff) })}</p>
                {!degreeOk && <p>{t('bcCheck.missDegree')}</p>}
                {!contract && <p>{t('bcCheck.missContract')}</p>}
              </div>
            </div>
          </>
        )}
      </div>
    </EmbedLayout>
  );
}
