import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowLeftRight, BadgeEuro, HeartPulse, ReceiptText, Scale } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { registerCopy } from '@/i18n';
import { pagesHealthInsurance } from '@/i18n/pagesHealthInsurance';
import { usePageTitle } from '@/lib/usePageTitle';
import { FEDERAL_STATES, STATE_NAMES, type FederalState } from '@/lib/salary';
import { KASSEN_CHECKED, KASSE_SOURCES } from '@/lib/healthInsurance/data';
import { AVERAGE_ZB, BBG_MONTH, GENERAL_RATE, GROSS_MAX, compareKassen, type ScopeFilter } from '@/lib/healthInsurance/compare';
import { decimal, Disclaimer, dmy, EstimateBadge, GlossaryLinks, Manat, NumField, Sources, ToolFaq, useFaq, useLng, useMoney } from '@/components/tools/calc/CalcShared';

registerCopy(pagesHealthInsurance);

const SCOPES: ScopeFilter[] = ['all', 'nationwide', 'regional'];

/**
 * /health-insurance-comparison — statutory health insurance funds (every fund open nationwide + the regional AOKs)
 * sorted by the employee's share for a gross salary and state (lib/healthInsurance). Price only, no ranking by
 * benefits; how to switch (§ 175 SGB V). Everything is computed in the browser (and in SSR), nothing is sent.
 */
export default function HealthInsuranceComparisonPage() {
  const { t } = useTranslation();
  usePageTitle(t('hic.heroTitle'));
  const money = useMoney();
  const lng = useLng();
  const faq = useFaq('hic.faq');
  const [gross, setGross] = useState(3200);
  const [state, setState] = useState<FederalState>('BY');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const r = useMemo(() => compareKassen({ gross, state, scope }), [gross, state, scope]);
  const pct = (n: number, digits = 2) => (lng === 'tr' ? `%${decimal(n, lng, digits)}` : `${decimal(n, lng, digits)} %`);
  /** 8.645 → "8,645 %", 8.6 → "8,6 %" (no trailing zeros). */
  const pctTrim = (n: number) => {
    const v = String(Math.round(n * 1000) / 1000);
    const num = lng === 'en' ? v : v.replace('.', ',');
    return lng === 'tr' ? `%${num}` : `${num} %`;
  };
  const bbg = money(BBG_MONTH, true);
  const steps = t('hic.switch.steps', { returnObjects: true }) as unknown;

  return (
    <>
      <PageHero title={t('hic.heroTitle')} subtitle={t('hic.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
          <form className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5 lg:sticky lg:top-24" onSubmit={(e) => e.preventDefault()} aria-labelledby="hic-form-h">
            <h2 id="hic-form-h" className="font-display text-lg font-semibold text-ink">
              {t('hic.form.title')}
            </h2>
            <NumField label={t('hic.form.gross')} value={gross} max={GROSS_MAX} suffix="€" onChange={setGross} hint={t('hic.form.grossHint', { bbg })} />
            <div>
              <label htmlFor="hic-state" className="label">
                {t('hic.form.state')}
              </label>
              <select id="hic-state" className="input" value={state} onChange={(e) => setState(e.target.value as FederalState)} aria-describedby="hic-state-hint">
                {FEDERAL_STATES.map((s) => (
                  <option key={s} value={s}>
                    {STATE_NAMES[s]}
                  </option>
                ))}
              </select>
              <p id="hic-state-hint" className="mt-1 text-[11px] leading-snug text-muted">
                {t('hic.form.stateHint')}
              </p>
            </div>
            <fieldset>
              <legend className="label">{t('hic.form.scope')}</legend>
              <div className="grid grid-cols-3 gap-2">
                {SCOPES.map((s) => (
                  <label
                    key={s}
                    className={clsx(
                      'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-xs font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                      scope === s ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken',
                    )}
                  >
                    <input type="radio" className="sr-only" name="hic-scope" checked={scope === s} onChange={() => setScope(s)} />
                    {t(`hic.form.scopes.${s}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          </form>

          <div className="min-w-0 space-y-4" aria-live="polite">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryTile label={t('hic.summary.cheapest')} name={r.cheapest?.kasse.name} value={r.cheapest ? t('hic.summary.perMonth', { amount: money(r.cheapest.monthly, true) }) : '—'} tone="good" />
              <SummaryTile label={t('hic.summary.average', { avg: pct(AVERAGE_ZB, 1) })} value={t('hic.summary.perMonth', { amount: money(r.average.monthly, true) })} />
              <SummaryTile label={t('hic.summary.priciest')} name={r.priciest?.kasse.name} value={r.priciest ? t('hic.summary.perMonth', { amount: money(r.priciest.monthly, true) }) : '—'} tone="bad" />
            </div>
            {r.cheapest && r.priciest && r.cheapest !== r.priciest && (
              <div className="rounded-3xl border border-success-border bg-success-bg p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display text-lg font-semibold text-ink">{t('hic.summary.savings', { name: r.cheapest.kasse.name, amount: money(r.cheapest.vsMaxYear, true) })}</p>
                  <EstimateBadge />
                </div>
                <p className="mt-1 text-sm text-ink">{t('hic.summary.savingsAvg', { amount: money(r.cheapest.vsAverageYear, true) })}</p>
                <Manat eur={r.cheapest.vsMaxYear} className="mt-1" />
              </div>
            )}
            {r.capped && <p className="rounded-2xl border border-line bg-card p-3 text-sm text-muted">{t('hic.summary.capped', { bbg })}</p>}

            <div className="overflow-hidden rounded-3xl border border-line bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                  <HeartPulse className="size-5 text-primary" aria-hidden /> {t('hic.table.caption')}
                </h2>
                <span className="shrink-0 text-xs text-muted">{t('hic.summary.count', { count: r.rows.length })}</span>
              </div>
              {r.rows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-sm">
                    <caption className="sr-only">{t('hic.table.caption')}</caption>
                    <thead className="bg-sunken text-left text-xs text-muted">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          {t('hic.table.rank')}
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          {t('hic.table.fund')}
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">
                          {t('hic.table.zb')}
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">
                          {t('hic.table.monthly')}
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">
                          {t('hic.table.yearly')}
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">
                          {t('hic.table.vsAvg')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.rows.map((row, i) => (
                        <tr key={row.kasse.id} className={clsx('border-t border-line/70', i === 0 && 'bg-success-bg/60')}>
                          <td className="px-3 py-2 text-muted tabular-nums">{i + 1}</td>
                          <td className="px-3 py-2">
                            <span className="font-semibold text-ink" translate="no">
                              {row.kasse.name}
                            </span>
                            <span className="block text-[11px] text-muted">
                              {row.kasse.scope === 'nationwide' ? t('hic.table.nationwide') : t('hic.table.regional', { states: (row.kasse.states ?? []).map((s) => STATE_NAMES[s]).join(', ') })}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {pct(row.kasse.zb)}
                            <span className="block text-[11px] text-muted">
                              {t('hic.table.rate')}: {pctTrim(row.employeeRate)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-ink tabular-nums">{money(row.monthly, true)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(row.yearly, true)}</td>
                          <td className={clsx('px-3 py-2 text-right text-xs tabular-nums', row.vsAverageYear > 0.004 ? 'text-success-fg' : row.vsAverageYear < -0.004 ? 'text-danger-fg' : 'text-muted')}>
                            {row.vsAverageYear > 0.004
                              ? t('hic.table.cheaper', { amount: money(row.vsAverageYear, true) })
                              : row.vsAverageYear < -0.004
                                ? t('hic.table.dearer', { amount: money(-row.vsAverageYear, true) })
                                : t('hic.table.same')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="p-4 text-sm text-muted">{t('hic.table.empty')}</p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                  <BadgeEuro className="size-5 text-primary" aria-hidden /> {t('hic.how.title')}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">{t('hic.how.text', { rate: pct(GENERAL_RATE, 1) })}</p>
              </div>
              <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                  <Scale className="size-5 text-primary" aria-hidden /> {t('hic.neutral.title')}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">{t('hic.neutral.text')}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <ArrowLeftRight className="size-5 text-primary" aria-hidden /> {t('hic.switch.title')}
              </h2>
              <ol className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
                {(Array.isArray(steps) ? (steps as string[]) : []).map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-contrast">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 rounded-2xl bg-sunken p-3 text-sm text-ink">{t('hic.switch.first')}</p>
            </div>

            <GlossaryLinks
              terms={[
                { slug: 'krankenkasse', label: 'Krankenkasse' },
                { slug: 'gesetzliche-krankenversicherung', label: 'GKV' },
                { slug: 'zusatzbeitrag', label: 'Zusatzbeitrag' },
                { slug: 'private-krankenversicherung', label: 'PKV' },
                { slug: 'pflegeversicherung', label: 'Pflegeversicherung' },
                { slug: 'elektronische-gesundheitskarte', label: 'eGK' },
                { slug: 'bruttolohn', label: 'Bruttolohn' },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Link to="/salary-calculator" className={buttonClass({ variant: 'outline' })}>
                <BadgeEuro className="size-4" aria-hidden /> {t('hic.actions.salary')}
              </Link>
              <Link to="/payslip-explained" className={buttonClass({ variant: 'ghost' })}>
                <ReceiptText className="size-4" aria-hidden /> {t('hic.actions.payslip')}
              </Link>
            </div>
            <p className="text-xs text-muted">{t('hic.dataNote', { date: dmy(KASSEN_CHECKED) })}</p>
            <Disclaimer>{t('hic.disclaimer')}</Disclaimer>
            <Sources checked={KASSEN_CHECKED} items={KASSE_SOURCES} />
          </div>
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/health-insurance-comparison" />
    </>
  );
}

const SummaryTile = ({ label, name, value, tone }: { label: string; name?: string; value: string; tone?: 'good' | 'bad' }) => (
  <div className={clsx('rounded-2xl border p-3', tone === 'good' ? 'border-success-border bg-success-bg' : 'border-line bg-card')}>
    <p className="text-xs text-muted">{label}</p>
    {name && (
      <p className="truncate text-sm font-semibold text-ink" translate="no" title={name}>
        {name}
      </p>
    )}
    <p className={clsx('font-display text-xl font-semibold tabular-nums', tone === 'bad' ? 'text-ink' : 'text-ink')}>{value}</p>
  </div>
);
