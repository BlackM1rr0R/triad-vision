import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BadgeEuro, HandCoins, RotateCcw } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { registerCopy } from '@/i18n';
import { pagesTaxClass } from '@/i18n/pagesTaxClass';
import { usePageTitle } from '@/lib/usePageTitle';
import { FEDERAL_STATES, STATE_NAMES, type FederalState } from '@/lib/salary';
import { compareTaxClasses, DEFAULT_TAX_CLASS, TAX_CLASS_CHECKED, type Combo, type TaxClassInput } from '@/lib/publicCalc/taxClass';
import { decimal, Disclaimer, EstimateBadge, GlossaryLinks, Manat, NumField, Sources, Toggle, ToolFaq, useFaq, useLng, useMoney } from '@/components/tools/calc/CalcShared';

registerCopy(pagesTaxClass);

const SOURCES = [
  { label: '§ 38b EStG – Lohnsteuerklassen', url: 'https://www.gesetze-im-internet.de/estg/__38b.html' },
  { label: '§ 39f EStG – Faktorverfahren', url: 'https://www.gesetze-im-internet.de/estg/__39f.html' },
  { label: '§ 46 EStG – Pflichtveranlagung (Abs. 2 Nr. 3a)', url: 'https://www.gesetze-im-internet.de/estg/__46.html' },
  { label: '§ 2c BEEG – Elterngeld: Abzugsmerkmale (Steuerklasse) im Bemessungszeitraum', url: 'https://www.gesetze-im-internet.de/beeg/__2c.html' },
  { label: '§ 153 SGB III – Arbeitslosengeld: Steuerklassenwechsel', url: 'https://www.gesetze-im-internet.de/sgb_3/__153.html' },
  { label: 'BMF Steuerrechner (Lohnsteuer 2026, mit Faktor)', url: 'https://www.bmf-steuerrechner.de/' },
  { label: 'steuertipps.de – Steuerklassen III und V vor dem Aus? (Stand der Reformpläne)', url: 'https://www.steuertipps.de/finanzamt-formalitaeten/steuerklassen-iii-und-v-vor-dem-aus' },
];

const ROMAN: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' };

/**
 * /tax-class-chooser — Steuerklassenwahl for married couples: III/V vs IV/IV vs IV/IV with Faktor (monthly net per
 * partner, combined, and the refund / back payment after the return). Maths in lib/publicCalc/taxClass.ts.
 */
export default function TaxClassChooserPage() {
  const { t } = useTranslation();
  usePageTitle(t('taxClass.heroTitle'));
  const money = useMoney();
  const lng = useLng();
  const faq = useFaq('taxClass.faq');
  const [input, setInput] = useState<TaxClassInput>(DEFAULT_TAX_CLASS);
  const r = useMemo(() => compareTaxClasses(input), [input]);
  const set = (patch: Partial<TaxClassInput>) => setInput((i) => ({ ...i, ...patch }));
  const comboLabel = (c: Combo) => (c === 'IV/IV+F' ? t('taxClass.combo.factor', { f: decimal(r.factor, lng, 3) }) : c);
  const best = r.combos.find((c) => c.combo === r.bestMonthly)!;

  return (
    <>
      <PageHero title={t('taxClass.heroTitle')} subtitle={t('taxClass.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
          <form className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5" onSubmit={(e) => e.preventDefault()} aria-labelledby="tc-form-h">
            <h2 id="tc-form-h" className="font-display text-lg font-semibold text-ink">
              {t('taxClass.form.title')}
            </h2>
            <NumField label={t('taxClass.form.grossA')} value={input.grossA} max={30_000} suffix="€" onChange={(v) => set({ grossA: v })} />
            <NumField label={t('taxClass.form.grossB')} value={input.grossB} max={30_000} suffix="€" hint={t('taxClass.form.grossHint')} onChange={(v) => set({ grossB: v })} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="tc-state" className="label">
                  {t('taxClass.form.state')}
                </label>
                <select id="tc-state" className="input" value={input.state} onChange={(e) => set({ state: e.target.value as FederalState })}>
                  {FEDERAL_STATES.map((s) => (
                    <option key={s} value={s}>
                      {STATE_NAMES[s]}
                    </option>
                  ))}
                </select>
              </div>
              <NumField label={t('taxClass.form.children')} value={input.children} max={10} onChange={(v) => set({ children: Math.round(v) })} />
            </div>
            <Toggle legend={t('taxClass.form.church')} value={input.church} onChange={(v) => set({ church: v })} />
            <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={() => setInput(DEFAULT_TAX_CLASS)}>
              <RotateCcw className="size-4" aria-hidden /> {t('calcCommon.reset')}
            </button>
          </form>

          <div className="min-w-0 space-y-4" aria-live="polite">
            <div className="rounded-3xl border border-success-border bg-success-bg p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{t('taxClass.result.bestMonthly', { combo: comboLabel(r.bestMonthly) })}</p>
                <EstimateBadge />
              </div>
              <p className="mt-1 font-display text-4xl font-bold text-ink tabular-nums">{money(best.netMonthly)}</p>
              <Manat eur={best.netMonthly} className="mt-1" />
              <p className="mt-2 text-sm text-ink">{t('taxClass.result.annualSame', { amount: money(r.annualTax) })}</p>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-line bg-card">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <caption className="sr-only">{t('taxClass.result.tableCaption')}</caption>
                <thead>
                  <tr className="border-b border-line bg-sunken text-left">
                    <th scope="col" className="px-3 py-2.5 font-semibold text-ink">
                      {t('taxClass.result.combo')}
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold text-ink">
                      {t('taxClass.result.netA')}
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold text-ink">
                      {t('taxClass.result.netB')}
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold text-ink">
                      {t('taxClass.result.netTotal')}
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold text-ink">
                      {t('taxClass.result.settlement')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.combos.map((c) => (
                    <tr key={c.combo} className={clsx(c.combo === r.bestMonthly && 'bg-success-bg/50')}>
                      <th scope="row" className="px-3 py-2 text-left font-medium text-ink">
                        <span translate="no">{comboLabel(c.combo)}</span>
                        <span className="block text-[11px] font-normal text-muted">
                          A: {ROMAN[c.a.taxClass]} · B: {ROMAN[c.b.taxClass]}
                          {c.mandatoryReturn ? ` · ${t('taxClass.result.mandatory')}` : ''}
                        </span>
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums">{money(c.a.net, true)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(c.b.net, true)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(c.netMonthly, true)}</td>
                      <td className={clsx('px-3 py-2 text-right tabular-nums', c.settlement < -50 ? 'text-danger-fg' : c.settlement > 50 ? 'text-success-fg' : 'text-ink')}>
                        {c.settlement >= 0 ? '+' : '−'}
                        {money(Math.abs(c.settlement))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-line px-3 py-2 text-[11px] leading-snug text-muted">{t('taxClass.result.settlementHint')}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {(['same', 'risk', 'factor', 'benefits'] as const).map((k) => (
                <div key={k} className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                  <h2 className="font-display text-base font-semibold text-ink">{t(`taxClass.explain.${k}.title`)}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(`taxClass.explain.${k}.text`)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-warning-border bg-warning-bg p-4 sm:p-5 text-sm text-warning-fg">
              <h2 className="font-display text-base font-semibold">{t('taxClass.reform.title')}</h2>
              <p className="mt-1.5 leading-relaxed">{t('taxClass.reform.text')}</p>
            </div>

            <GlossaryLinks
              terms={[
                { slug: 'steuerklasse', label: 'Steuerklasse' },
                { slug: 'ehegattensplitting', label: 'Ehegattensplitting' },
                { slug: 'elstam', label: 'ELStAM' },
                { slug: 'steuererklaerung', label: 'Steuererklärung' },
                { slug: 'elterngeld', label: 'Elterngeld' },
                { slug: 'arbeitslosengeld', label: 'Arbeitslosengeld' },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Link to="/salary-calculator" className={buttonClass({ variant: 'outline' })}>
                <BadgeEuro className="size-4" aria-hidden /> {t('taxClass.actions.salary')}
              </Link>
              <Link to="/tax-refund-calculator" className={buttonClass({ variant: 'ghost' })}>
                <HandCoins className="size-4" aria-hidden /> {t('taxClass.actions.refund')}
              </Link>
            </div>
            <Disclaimer>{t('taxClass.disclaimer')}</Disclaimer>
            <Sources checked={TAX_CLASS_CHECKED} items={SOURCES} />
          </div>
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/tax-class-chooser" />
    </>
  );
}
