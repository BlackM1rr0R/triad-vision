import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BadgeEuro, ReceiptText, RotateCcw } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { EmailResult } from '@/components/tools/EmailResult';
import { registerCopy } from '@/i18n';
import { pagesTaxRefund } from '@/i18n/pagesTaxRefund';
import { usePageTitle } from '@/lib/usePageTitle';
import { FEDERAL_STATES, STATE_NAMES, type FederalState } from '@/lib/salary';
import { DEFAULT_TAX_REFUND, estimateTaxRefund, TAX_REFUND_RULES, type TaxRefundInput } from '@/lib/publicCalc/taxRefund';
import { Disclaimer, EstimateBadge, GlossaryLinks, Manat, NumField, Sources, Toggle, ToolFaq, useFaq, useMoney } from '@/components/tools/calc/CalcShared';

registerCopy(pagesTaxRefund);

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

const SOURCES = [
  { label: '§ 9 EStG – Werbungskosten (Entfernungspauschale, doppelte Haushaltsführung)', url: 'https://www.gesetze-im-internet.de/estg/__9.html' },
  { label: '§ 9a EStG – Arbeitnehmer-Pauschbetrag', url: 'https://www.gesetze-im-internet.de/estg/__9a.html' },
  { label: '§ 4 Abs. 5 Nr. 6c EStG – Homeoffice-Pauschale', url: 'https://www.gesetze-im-internet.de/estg/__4.html' },
  { label: '§ 32a EStG – Einkommensteuertarif', url: 'https://www.gesetze-im-internet.de/estg/__32a.html' },
  { label: '§ 32b EStG – Progressionsvorbehalt', url: 'https://www.gesetze-im-internet.de/estg/__32b.html' },
  { label: 'BMF Steuerrechner (Lohnsteuer 2026)', url: 'https://www.bmf-steuerrechner.de/' },
  { label: 'ELSTER – Steuererklärung online', url: 'https://www.elster.de/' },
];

/**
 * /tax-refund-calculator — "How much tax will I get back?" for employees. All maths in lib/publicCalc/taxRefund.ts
 * (wage tax and tariff from the site's payroll engine). Runs in the browser; nothing is sent or stored.
 */
export default function TaxRefundCalculatorPage() {
  const { t } = useTranslation();
  usePageTitle(t('taxRefund.heroTitle'));
  const money = useMoney();
  const faq = useFaq('taxRefund.faq');
  const [input, setInput] = useState<TaxRefundInput>(DEFAULT_TAX_REFUND);
  const r = useMemo(() => estimateTaxRefund(input), [input]);
  const set = (patch: Partial<TaxRefundInput>) => setInput((i) => ({ ...i, ...patch }));
  const married = [3, 4, 5].includes(input.taxClass);
  const wk = r.werbungskosten;
  const refund = r.refund >= 0;

  const wkRows: [string, number][] = [
    [t('taxRefund.wk.commute'), wk.commute],
    [t('taxRefund.wk.homeOffice'), wk.homeOffice],
    [t('taxRefund.wk.equipment'), wk.equipment],
    [t('taxRefund.wk.union'), wk.union],
    [t('taxRefund.wk.secondHome'), wk.secondHome],
    [t('taxRefund.wk.homeTrips'), wk.homeTrips],
    [t('taxRefund.wk.moving'), wk.moving],
  ];

  return (
    <>
      <PageHero title={t('taxRefund.heroTitle')} subtitle={t('taxRefund.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[24rem_1fr] lg:items-start">
          <form className="space-y-5 rounded-3xl border border-line bg-card p-4 sm:p-5" onSubmit={(e) => e.preventDefault()} aria-labelledby="tr-form-h">
            <h2 id="tr-form-h" className="font-display text-lg font-semibold text-ink">
              {t('taxRefund.form.title')}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <NumField className="col-span-2" label={t('taxRefund.form.gross')} value={input.grossMonthly} max={30_000} suffix="€" onChange={(v) => set({ grossMonthly: v })} />
              <NumField label={t('taxRefund.form.months')} value={input.months} min={1} max={12} hint={t('taxRefund.form.monthsHint')} onChange={(v) => set({ months: v })} />
              <div>
                <label htmlFor="tr-class" className="label">
                  {t('taxRefund.form.taxClass')}
                </label>
                <select id="tr-class" className="input" value={input.taxClass} onChange={(e) => set({ taxClass: Number(e.target.value) as TaxRefundInput['taxClass'] })}>
                  {[1, 2, 3, 4, 5].map((c) => (
                    <option key={c} value={c}>
                      {ROMAN[c - 1]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="-mt-2 text-[11px] leading-snug text-muted">{t('taxRefund.form.taxClassHint')}</p>
            {married && <NumField label={t('taxRefund.form.partnerGross')} value={input.partnerGrossYear} max={500_000} suffix="€" hint={t('taxRefund.form.partnerHint')} onChange={(v) => set({ partnerGrossYear: v })} />}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="tr-state" className="label">
                  {t('taxRefund.form.state')}
                </label>
                <select id="tr-state" className="input" value={input.state} onChange={(e) => set({ state: e.target.value as FederalState })}>
                  {FEDERAL_STATES.map((s) => (
                    <option key={s} value={s}>
                      {STATE_NAMES[s]}
                    </option>
                  ))}
                </select>
              </div>
              <Toggle legend={t('taxRefund.form.church')} value={input.church} onChange={(v) => set({ church: v })} />
            </div>

            <fieldset className="space-y-3 border-t border-line pt-4">
              <legend className="font-display text-base font-semibold text-ink">{t('taxRefund.form.sectionWork')}</legend>
              <div className="grid grid-cols-2 gap-3">
                <NumField label={t('taxRefund.form.commuteKm')} value={input.commuteKm} max={500} suffix="km" onChange={(v) => set({ commuteKm: v })} />
                <NumField label={t('taxRefund.form.commuteDays')} value={input.commuteDays} max={260} onChange={(v) => set({ commuteDays: v })} />
              </div>
              <p className="text-[11px] leading-snug text-muted">{t('taxRefund.form.commuteHint', { rate: TAX_REFUND_RULES.perKm.toFixed(2) })}</p>
              <Toggle legend={t('taxRefund.form.car')} value={input.car} onChange={(v) => set({ car: v })} />
              <NumField label={t('taxRefund.form.homeOfficeDays')} value={input.homeOfficeDays} max={260} hint={t('taxRefund.form.homeOfficeHint')} onChange={(v) => set({ homeOfficeDays: v })} />
              <div className="grid grid-cols-2 gap-3">
                <NumField label={t('taxRefund.form.equipment')} value={input.equipment} max={50_000} suffix="€" onChange={(v) => set({ equipment: v })} />
                <NumField label={t('taxRefund.form.union')} value={input.unionFees} max={10_000} suffix="€" onChange={(v) => set({ unionFees: v })} />
              </div>
              <p className="text-[11px] leading-snug text-muted">{t('taxRefund.form.equipmentHint')}</p>
            </fieldset>

            <fieldset className="space-y-3 border-t border-line pt-4">
              <legend className="font-display text-base font-semibold text-ink">{t('taxRefund.form.sectionDouble')}</legend>
              <p className="text-[11px] leading-snug text-muted">{t('taxRefund.form.doubleHint')}</p>
              <div className="grid grid-cols-2 gap-3">
                <NumField label={t('taxRefund.form.secondHomeRent')} value={input.secondHomeRent} max={10_000} suffix="€" onChange={(v) => set({ secondHomeRent: v })} />
                <NumField label={t('taxRefund.form.secondHomeMonths')} value={input.secondHomeMonths} max={12} onChange={(v) => set({ secondHomeMonths: v })} />
                <NumField label={t('taxRefund.form.homeTripKm')} value={input.homeTripKm} max={5_000} suffix="km" onChange={(v) => set({ homeTripKm: v })} />
                <NumField label={t('taxRefund.form.homeTrips')} value={input.homeTrips} max={53} onChange={(v) => set({ homeTrips: v })} />
              </div>
            </fieldset>

            <fieldset className="space-y-3 border-t border-line pt-4">
              <legend className="font-display text-base font-semibold text-ink">{t('taxRefund.form.sectionOther')}</legend>
              <NumField label={t('taxRefund.form.moving')} value={input.movingCosts} max={100_000} suffix="€" hint={t('taxRefund.form.movingHint')} onChange={(v) => set({ movingCosts: v })} />
              <NumField label={t('taxRefund.form.foreign')} value={input.foreignIncome} max={1_000_000} suffix="€" hint={t('taxRefund.form.foreignHint')} onChange={(v) => set({ foreignIncome: v })} />
            </fieldset>
            <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={() => setInput(DEFAULT_TAX_REFUND)}>
              <RotateCcw className="size-4" aria-hidden /> {t('calcCommon.reset')}
            </button>
          </form>

          <div className="min-w-0 space-y-4" aria-live="polite">
            <div className={clsx('rounded-3xl border p-5', refund ? 'border-success-border bg-success-bg' : 'border-warning-border bg-warning-bg')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{refund ? t('taxRefund.result.refund') : t('taxRefund.result.backPayment')}</p>
                <EstimateBadge />
              </div>
              <p className="mt-1 font-display text-4xl font-bold text-ink tabular-nums">{money(Math.abs(r.refund))}</p>
              <Manat eur={Math.abs(r.refund)} className="mt-1" />
              {input.months < 12 && refund && <p className="mt-2 text-sm text-ink">{t('taxRefund.result.midYear', { months: input.months })}</p>}
            </div>
            <EmailResult
              tool="tax-refund-calculator"
              summary={[
                { label: refund ? t('taxRefund.result.refund') : t('taxRefund.result.backPayment'), value: money(Math.abs(r.refund)) },
                { label: `${t('taxRefund.result.total')} · ${t('taxRefund.result.withheld')}`, value: money(r.withheld.total, true) },
                { label: `${t('taxRefund.result.total')} · ${t('taxRefund.result.due')}`, value: money(r.due.total, true) },
                { label: t('taxRefund.wk.total'), value: money(wk.total, true) },
                { label: t('taxRefund.result.taxable'), value: money(r.taxableIncome) },
                { label: t('taxRefund.result.married'), value: r.married ? t('calcCommon.yes') : t('calcCommon.no') },
              ]}
            />

            <div className="overflow-x-auto rounded-3xl border border-line bg-card">
              <table className="w-full min-w-[22rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-sunken text-left">
                    <th scope="col" className="px-4 py-2.5 font-semibold text-ink" />
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold text-ink">
                      {t('taxRefund.result.withheld')}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold text-ink">
                      {t('taxRefund.result.due')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(
                    [
                      ['incomeTax', r.withheld.incomeTax, r.due.incomeTax],
                      ['soli', r.withheld.soli, r.due.soli],
                      ['church', r.withheld.church, r.due.church],
                      ['total', r.withheld.total, r.due.total],
                    ] as const
                  ).map(([k, a, b]) => (
                    <tr key={k} className={k === 'total' ? 'font-semibold' : undefined}>
                      <th scope="row" className="px-4 py-2 text-left font-medium text-ink">
                        {t(`taxRefund.result.${k}`)}
                      </th>
                      <td className="px-4 py-2 text-right tabular-nums">{money(a, true)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(b, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold text-ink">{t('taxRefund.wk.title')}</h2>
              <dl className="mt-2 divide-y divide-line text-sm">
                {wkRows
                  .filter(([, v]) => v > 0)
                  .map(([label, v]) => (
                    <div key={label} className="flex justify-between gap-3 py-1.5">
                      <dt className="text-muted">{label}</dt>
                      <dd className="tabular-nums text-ink">{money(v, true)}</dd>
                    </div>
                  ))}
                <div className="flex justify-between gap-3 py-1.5 font-semibold">
                  <dt className="text-ink">{t('taxRefund.wk.total')}</dt>
                  <dd className="tabular-nums text-ink">{money(wk.total, true)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-sm text-muted">
                {wk.pauschbetragWins ? t('taxRefund.wk.pauschbetrag', { amount: money(TAX_REFUND_RULES.werbungskostenPauschbetrag) }) : t('taxRefund.wk.above', { amount: money(wk.total - TAX_REFUND_RULES.werbungskostenPauschbetrag, true) })}
              </p>
              {wk.commuteCapped && <p className="mt-1 text-sm text-warning-fg">{t('taxRefund.wk.capped')}</p>}
              <dl className="mt-3 grid gap-2 border-t border-line pt-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted">{t('taxRefund.result.vorsorge')}</dt>
                  <dd className="font-semibold tabular-nums text-ink">{money(r.vorsorge)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('taxRefund.result.taxable')}</dt>
                  <dd className="font-semibold tabular-nums text-ink">{money(r.taxableIncome)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('taxRefund.result.married')}</dt>
                  <dd className="font-semibold text-ink">{r.married ? t('calcCommon.yes') : t('calcCommon.no')}</dd>
                </div>
              </dl>
              {r.progression && <p className="mt-2 text-sm text-warning-fg">{t('taxRefund.result.progression')}</p>}
            </div>

            <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold text-ink">{t('taxRefund.howTo.title')}</h2>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted marker:font-semibold marker:text-ink">
                {(['s1', 's2', 's3', 's4'] as const).map((k) => (
                  <li key={k}>{t(`taxRefund.howTo.${k}`)}</li>
                ))}
              </ol>
            </div>

            <GlossaryLinks
              terms={[
                { slug: 'steuererklaerung', label: 'Steuererklärung' },
                { slug: 'werbungskosten', label: 'Werbungskosten' },
                { slug: 'steuerklasse', label: 'Steuerklasse' },
                { slug: 'lohnsteuerbescheinigung', label: 'Lohnsteuerbescheinigung' },
                { slug: 'elster', label: 'ELSTER' },
                { slug: 'steuerbescheid', label: 'Steuerbescheid' },
                { slug: 'lohnsteuerhilfeverein', label: 'Lohnsteuerhilfeverein' },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Link to="/salary-calculator" className={buttonClass({ variant: 'outline' })}>
                <BadgeEuro className="size-4" aria-hidden /> {t('taxRefund.actions.salary')}
              </Link>
              <Link to="/payslip-explained" className={buttonClass({ variant: 'ghost' })}>
                <ReceiptText className="size-4" aria-hidden /> {t('taxRefund.actions.payslip')}
              </Link>
            </div>
            <Disclaimer>{t('taxRefund.disclaimer')}</Disclaimer>
            <Sources checked={TAX_REFUND_RULES.checked} items={SOURCES} />
          </div>
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/tax-refund-calculator" />
    </>
  );
}
