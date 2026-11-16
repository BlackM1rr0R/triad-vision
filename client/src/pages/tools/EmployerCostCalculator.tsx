import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BookOpen, Building2, RotateCcw } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { EmailResult } from '@/components/tools/EmailResult';
import { registerCopy } from '@/i18n';
import { pagesEmployerCost } from '@/i18n/pagesEmployerCost';
import { usePageTitle } from '@/lib/usePageTitle';
import { calculateEmployerCost, DEFAULT_EMPLOYER_COST, EMPLOYER_COST_CHECKED, EMPLOYER_RATES, type EmployerCostInput } from '@/lib/publicCalc/employerCost';
import { decimal, Disclaimer, EstimateBadge, GlossaryLinks, NumField, Sources, Toggle, ToolFaq, useFaq, useLng, useMoney } from '@/components/tools/calc/CalcShared';

registerCopy(pagesEmployerCost);

const SOURCES = [
  { label: 'TK – Sozialversicherungs-Rechengrößen 2026 (BBG 8.450 € / 5.812,50 €)', url: 'https://www.tk.de/firmenkunden/service/fachthemen/fachthema-beitraege/sozialversicherungs-rechengroessen-2026-2203234' },
  { label: 'TK – Insolvenzgeldumlage 2026 (0,15 %)', url: 'https://www.tk.de/firmenkunden/service/fachthemen/fachthema-beitraege/insolvenzgeldumlage-2047584' },
  { label: 'Aufwendungsausgleichsgesetz (U1/U2)', url: 'https://www.gesetze-im-internet.de/aag/' },
  { label: '§ 46, § 47 AufenthV – Visumgebühr 75 €, beschleunigtes Fachkräfteverfahren 411 €', url: 'https://www.gesetze-im-internet.de/aufenthv/__47.html' },
  { label: 'Make it in Germany – beschleunigtes Fachkräfteverfahren', url: 'https://www.make-it-in-germany.com/de/fachkraefteeinwanderung-mit-dem-beschleunigten-fachkraefteverfahren-wie-funktioniert-es' },
  { label: 'Anerkennung in Deutschland – Anerkennungszuschuss (Kosten 100–600 €)', url: 'https://www.anerkennung-in-deutschland.de/html/de/anerkennungszuschuss.php' },
];

const pct = (f: number) => Math.round(f * 10_000) / 100;

/**
 * /employer-cost-calculator (B2B, German first) — gross → employer social contributions 2026, monthly / yearly
 * cost, one-off costs of hiring from abroad and the cost of the vacancy. Maths in lib/publicCalc/employerCost.ts.
 * No manat amounts: the page is for employers.
 */
export default function EmployerCostCalculatorPage() {
  const { t } = useTranslation();
  usePageTitle(t('employerCost.heroTitle'));
  const money = useMoney();
  const lng = useLng();
  const faq = useFaq('employerCost.faq');
  const [input, setInput] = useState<EmployerCostInput>(DEFAULT_EMPLOYER_COST);
  const r = useMemo(() => calculateEmployerCost(input), [input]);
  const set = (patch: Partial<EmployerCostInput>) => setInput((i) => ({ ...i, ...patch }));
  const pctText = (f: number) => (lng === 'tr' ? `%${decimal(pct(f), lng, 2)}` : `${decimal(pct(f), lng, 2)} %`);

  const lines: [string, number, string][] = [
    ['pension', r.lines.pension, pctText(EMPLOYER_RATES.pension)],
    ['unemployment', r.lines.unemployment, pctText(EMPLOYER_RATES.unemployment)],
    ['health', r.lines.health, pctText(EMPLOYER_RATES.health + input.zusatzbeitrag / 2)],
    ['care', r.lines.care, pctText(input.saxony ? EMPLOYER_RATES.careSaxony : EMPLOYER_RATES.care)],
    ['u1', r.lines.u1, pctText(input.u1)],
    ['u2', r.lines.u2, pctText(input.u2)],
    ['u3', r.lines.u3, pctText(EMPLOYER_RATES.u3)],
    ['accident', r.lines.accident, pctText(input.accident)],
  ];
  const oneOff: [string, number][] = [
    ['visa', r.oneOff.visa],
    ['accelerated', r.oneOff.accelerated],
    ['recognition', r.oneOff.recognition],
    ['relocation', r.oneOff.relocation],
    ['housing', r.oneOff.housing],
    ['agency', r.oneOff.agency],
  ];

  return (
    <>
      <PageHero title={t('employerCost.heroTitle')} subtitle={t('employerCost.heroSubtitle')} crumb={{ to: '/for-employers', label: t('employerCost.crumb') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[24rem_1fr] lg:items-start">
          <form className="space-y-5 rounded-3xl border border-line bg-card p-4 sm:p-5" onSubmit={(e) => e.preventDefault()} aria-labelledby="ec-form-h">
            <h2 id="ec-form-h" className="font-display text-lg font-semibold text-ink">
              {t('employerCost.form.title')}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <NumField className="col-span-2" label={t('employerCost.form.gross')} value={input.grossMonthly} max={50_000} suffix="€" onChange={(v) => set({ grossMonthly: v })} />
              <NumField label={t('employerCost.form.salaries')} value={input.salariesPerYear} min={12} max={14} hint={t('employerCost.form.salariesHint')} onChange={(v) => set({ salariesPerYear: v })} />
              <NumField label={t('employerCost.form.zusatz')} value={pct(input.zusatzbeitrag)} max={10} suffix="%" hint={t('employerCost.form.zusatzHint', { avg: decimal(pct(EMPLOYER_RATES.averageZusatzbeitrag), lng, 1) })} onChange={(v) => set({ zusatzbeitrag: v / 100 })} />
            </div>
            <Toggle legend={t('employerCost.form.saxony')} value={input.saxony} onChange={(v) => set({ saxony: v })} />

            <fieldset className="space-y-3 border-t border-line pt-4">
              <legend className="font-display text-base font-semibold text-ink">{t('employerCost.form.sectionUmlagen')}</legend>
              <div className="grid grid-cols-3 gap-3">
                <NumField label="U1" value={pct(input.u1)} max={10} suffix="%" onChange={(v) => set({ u1: v / 100 })} />
                <NumField label="U2" value={pct(input.u2)} max={5} suffix="%" onChange={(v) => set({ u2: v / 100 })} />
                <NumField label={t('employerCost.form.bg')} value={pct(input.accident)} max={15} suffix="%" onChange={(v) => set({ accident: v / 100 })} />
              </div>
              <p className="text-[11px] leading-snug text-muted">{t('employerCost.form.umlagenHint')}</p>
            </fieldset>

            <fieldset className="space-y-3 border-t border-line pt-4">
              <legend className="font-display text-base font-semibold text-ink">{t('employerCost.form.sectionAbroad')}</legend>
              <NumField label={t('employerCost.form.hires')} value={input.hires} min={1} max={500} onChange={(v) => set({ hires: Math.round(v) })} />
              <div className="grid grid-cols-2 gap-3">
                <Toggle legend={t('employerCost.form.visa', { fee: money(EMPLOYER_RATES.visaFee) })} value={input.visa} onChange={(v) => set({ visa: v })} />
                <Toggle legend={t('employerCost.form.accelerated', { fee: money(EMPLOYER_RATES.acceleratedFee) })} value={input.accelerated} onChange={(v) => set({ accelerated: v })} />
              </div>
              <NumField
                label={t('employerCost.form.recognition')}
                value={input.recognition}
                max={10_000}
                suffix="€"
                hint={t('employerCost.form.recognitionHint', { min: money(EMPLOYER_RATES.recognitionRange[0]), max: money(EMPLOYER_RATES.recognitionRange[1]) })}
                onChange={(v) => set({ recognition: v })}
              />
              <NumField label={t('employerCost.form.relocation')} value={input.relocation} max={100_000} suffix="€" hint={t('employerCost.form.relocationHint')} onChange={(v) => set({ relocation: v })} />
              <div className="grid grid-cols-2 gap-3">
                <NumField label={t('employerCost.form.housing')} value={input.housingMonthly} max={10_000} suffix="€" onChange={(v) => set({ housingMonthly: v })} />
                <NumField label={t('employerCost.form.housingMonths')} value={input.housingMonths} max={36} onChange={(v) => set({ housingMonths: Math.round(v) })} />
              </div>
              <NumField label={t('employerCost.form.agency')} value={input.agencyFee} max={100_000} suffix="€" hint={t('employerCost.form.agencyHint')} onChange={(v) => set({ agencyFee: v })} />
            </fieldset>

            <fieldset className="space-y-3 border-t border-line pt-4">
              <legend className="font-display text-base font-semibold text-ink">{t('employerCost.form.sectionVacancy')}</legend>
              <div className="grid grid-cols-2 gap-3">
                <NumField label={t('employerCost.form.dailyLoss')} value={input.vacancyDailyLoss} max={1_000_000} suffix="€" onChange={(v) => set({ vacancyDailyLoss: v })} />
                <NumField label={t('employerCost.form.vacancyDays')} value={input.vacancyDays} max={1_000} onChange={(v) => set({ vacancyDays: Math.round(v) })} />
              </div>
              <p className="text-[11px] leading-snug text-muted">{t('employerCost.form.vacancyHint')}</p>
            </fieldset>
            <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={() => setInput(DEFAULT_EMPLOYER_COST)}>
              <RotateCcw className="size-4" aria-hidden /> {t('calcCommon.reset')}
            </button>
          </form>

          <div className="min-w-0 space-y-4" aria-live="polite">
            <div className="rounded-3xl border border-primary/30 bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{t('employerCost.result.monthly')}</p>
                <EstimateBadge />
              </div>
              <p className="mt-1 font-display text-4xl font-bold text-ink tabular-nums">{money(r.monthly, true)}</p>
              <p className="mt-1 text-sm text-muted">{t('employerCost.result.surcharge', { amount: money(r.social, true), pct: decimal(r.surchargePct, lng, 1) })}</p>
              <dl className="mt-3 grid gap-2 border-t border-line pt-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted">{t('employerCost.result.yearly')}</dt>
                  <dd className="font-semibold tabular-nums text-ink">{money(r.yearly)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('employerCost.result.firstYear', { n: input.hires })}</dt>
                  <dd className="font-semibold tabular-nums text-ink">{money(r.firstYear)}</dd>
                </div>
              </dl>
              {r.lowWage && <p className="mt-2 text-sm text-warning-fg">{t(`employerCost.result.${r.lowWage}`)}</p>}
            </div>
            <EmailResult
              tool="employer-cost-calculator"
              summary={[
                { label: t('employerCost.lines.gross'), value: money(r.gross, true) },
                { label: t('employerCost.result.monthly'), value: money(r.monthly, true) },
                { label: t('employerCost.result.linesTitle'), value: t('employerCost.result.surcharge', { amount: money(r.social, true), pct: decimal(r.surchargePct, lng, 1) }) },
                { label: t('employerCost.result.yearly'), value: money(r.yearly) },
                { label: t('employerCost.result.firstYear', { n: input.hires }), value: money(r.firstYear) },
              ]}
            />

            <div className="overflow-x-auto rounded-3xl border border-line bg-card">
              <table className="w-full min-w-[20rem] border-collapse text-sm">
                <caption className="px-4 pt-3 text-left font-display text-base font-semibold text-ink">{t('employerCost.result.linesTitle')}</caption>
                <tbody className="divide-y divide-line">
                  <tr>
                    <th scope="row" className="px-4 py-2 text-left font-medium text-ink">
                      {t('employerCost.lines.gross')}
                    </th>
                    <td className="px-4 py-2 text-right text-xs text-muted" />
                    <td className="px-4 py-2 text-right tabular-nums">{money(r.gross, true)}</td>
                  </tr>
                  {lines.map(([k, v, rate]) => (
                    <tr key={k}>
                      <th scope="row" className="px-4 py-2 text-left font-medium text-ink">
                        {t(`employerCost.lines.${k}`)}
                      </th>
                      <td className="px-4 py-2 text-right text-xs tabular-nums text-muted">{rate}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(v, true)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <th scope="row" className="px-4 py-2 text-left text-ink">
                      {t('employerCost.lines.total')}
                    </th>
                    <td />
                    <td className="px-4 py-2 text-right tabular-nums">{money(r.monthly, true)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="border-t border-line px-4 py-2 text-[11px] leading-snug text-muted">{t('employerCost.result.ceilings', { rv: money(EMPLOYER_RATES.bbgRvMonth, true), kv: money(EMPLOYER_RATES.bbgKvMonth, true) })}</p>
            </div>

            <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold text-ink">{t('employerCost.result.oneOffTitle')}</h2>
              <dl className="mt-2 divide-y divide-line text-sm">
                {oneOff
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 py-1.5">
                      <dt className="text-muted">{t(`employerCost.oneOff.${k}`)}</dt>
                      <dd className="tabular-nums text-ink">{money(v, true)}</dd>
                    </div>
                  ))}
                <div className="flex justify-between gap-3 py-1.5 font-semibold">
                  <dt className="text-ink">{t('employerCost.oneOff.total')}</dt>
                  <dd className="tabular-nums text-ink">{money(r.oneOff.total, true)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted">{t('employerCost.result.oneOffNote')}</p>
            </div>

            <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold text-ink">{t('employerCost.result.vacancyTitle')}</h2>
              {r.vacancy > 0 ? (
                <p className="mt-2 text-sm text-ink">
                  {t('employerCost.result.vacancy', { amount: money(r.vacancy), months: decimal(r.vacancyMonths ?? 0, lng, 1), oneOff: money(r.oneOff.total * input.hires) })}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">{t('employerCost.result.vacancyEmpty')}</p>
              )}
            </div>

            <div className="rounded-3xl border border-primary/30 bg-sunken p-4 sm:p-5">
              <h2 className="font-display text-lg font-semibold text-ink">{t('employerCost.cta.title')}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t('employerCost.cta.text')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/cooperation#form" className={buttonClass({ variant: 'primary' })}>
                  <Building2 className="size-4" aria-hidden /> {t('employerCost.cta.form')} <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link to="/employer-guide-azerbaijan" className={buttonClass({ variant: 'outline' })}>
                  <BookOpen className="size-4" aria-hidden /> {t('employerCost.cta.guide')}
                </Link>
              </div>
            </div>

            <GlossaryLinks
              terms={[
                { slug: 'sozialabgaben', label: 'Sozialabgaben' },
                { slug: 'bruttolohn', label: 'Bruttolohn' },
                { slug: 'zusatzbeitrag', label: 'Zusatzbeitrag' },
                { slug: 'berufsgenossenschaft', label: 'Berufsgenossenschaft' },
                { slug: 'entgeltfortzahlung', label: 'Entgeltfortzahlung' },
                { slug: 'beschleunigtes-fachkraefteverfahren', label: 'Beschleunigtes Fachkräfteverfahren' },
                { slug: 'anerkennung', label: 'Anerkennung' },
              ]}
            />
            <Disclaimer>{t('employerCost.disclaimer')}</Disclaimer>
            <Sources checked={EMPLOYER_COST_CHECKED} items={SOURCES} />
          </div>
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/employer-cost-calculator" />
    </>
  );
}
