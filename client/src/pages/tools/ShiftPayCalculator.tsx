import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BadgeEuro, HeartPulse, ChefHat, Truck, RotateCcw } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { registerCopy } from '@/i18n';
import { pagesShiftPay } from '@/i18n/pagesShiftPay';
import { usePageTitle } from '@/lib/usePageTitle';
import { FEDERAL_STATES, STATE_NAMES, type FederalState } from '@/lib/salary';
import { calculateShift, DEFAULT_SHIFT, PRESETS, SHIFT_CHECKED, SHIFT_KINDS, TAX_FREE_RATE, type ShiftInput, type ShiftKind } from '@/lib/publicCalc/shiftPay';
import { Disclaimer, EstimateBadge, GlossaryLinks, Manat, NumField, Sources, Toggle, ToolFaq, useFaq, useLng, useMoney } from '@/components/tools/calc/CalcShared';

registerCopy(pagesShiftPay);

const SOURCES = [
  { label: '§ 3b EStG – Steuerfreiheit von Sonntags-, Feiertags- und Nachtzuschlägen', url: 'https://www.gesetze-im-internet.de/estg/__3b.html' },
  { label: '§ 1 SvEV – beitragsfreie Zuwendungen (25-€-Grenze)', url: 'https://www.gesetze-im-internet.de/svev/__1.html' },
  { label: 'BMF Steuerrechner (Lohnsteuer 2026)', url: 'https://www.bmf-steuerrechner.de/' },
];

const PRESET_ICONS = { nurse: HeartPulse, cook: ChefHat, driver: Truck } as const;
const pct = (f: number) => Math.round(f * 100);

/** /shift-pay-calculator — night / Sunday / holiday supplements and how much of them is tax- and contribution-free. */
export default function ShiftPayCalculatorPage() {
  const { t } = useTranslation();
  usePageTitle(t('shiftPay.heroTitle'));
  const money = useMoney();
  const lng = useLng();
  const faq = useFaq('shiftPay.faq');
  const [input, setInput] = useState<ShiftInput>(DEFAULT_SHIFT);
  const [preset, setPreset] = useState<keyof typeof PRESETS | null>('nurse');
  const r = useMemo(() => calculateShift(input), [input]);
  const set = (patch: Partial<ShiftInput>) => {
    setPreset(null);
    setInput((i) => ({ ...i, ...patch }));
  };
  const setHours = (k: ShiftKind, v: number) => set({ hours: { ...input.hours, [k]: v } });
  const setRate = (k: ShiftKind, v: number) => set({ rates: { ...input.rates, [k]: v / 100 } });
  const pctText = (n: number) => (lng === 'tr' ? `%${n}` : `${n} %`);

  return (
    <>
      <PageHero title={t('shiftPay.heroTitle')} subtitle={t('shiftPay.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-6">
          <div role="radiogroup" aria-label={t('shiftPay.presets.title')} className="flex flex-wrap gap-2">
            <span className="self-center text-sm font-semibold text-ink">{t('shiftPay.presets.title')}:</span>
            {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => {
              const Icon = PRESET_ICONS[k];
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={preset === k}
                  className={clsx('inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold', preset === k ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken')}
                  onClick={() => {
                    setInput((i) => ({ ...i, ...PRESETS[k] }));
                    setPreset(k);
                  }}
                >
                  <Icon className="size-4" aria-hidden /> {t(`shiftPay.presets.${k}`)}
                </button>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-[26rem_1fr] lg:items-start">
            <form className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5" onSubmit={(e) => e.preventDefault()} aria-labelledby="sp-form-h">
              <h2 id="sp-form-h" className="font-display text-lg font-semibold text-ink">
                {t('shiftPay.form.title')}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <NumField label={t('shiftPay.form.hourly')} value={input.hourly} max={500} suffix="€" onChange={(v) => set({ hourly: v })} />
                <NumField label={t('shiftPay.form.monthlyHours')} value={input.monthlyHours} max={300} onChange={(v) => set({ monthlyHours: v })} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[20rem] border-collapse text-sm">
                  <caption className="pb-2 text-left text-[11px] leading-snug text-muted">{t('shiftPay.form.tableHint')}</caption>
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th scope="col" className="pb-1 font-semibold">
                        {t('shiftPay.form.kind')}
                      </th>
                      <th scope="col" className="pb-1 font-semibold">
                        {t('shiftPay.form.hours')}
                      </th>
                      <th scope="col" className="pb-1 font-semibold">
                        {t('shiftPay.form.rate')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {SHIFT_KINDS.map((k) => (
                      <tr key={k}>
                        <th scope="row" className="py-2 pr-2 text-left align-top font-medium text-ink">
                          {t(`shiftPay.kinds.${k}.label`)}
                          <span className="block text-[11px] font-normal text-muted">
                            {t(`shiftPay.kinds.${k}.when`)} · {t('shiftPay.form.legal', { pct: pctText(pct(TAX_FREE_RATE[k])) })}
                          </span>
                        </th>
                        <td className="w-20 py-2 pr-2 align-top">
                          <NumField label={`${t(`shiftPay.kinds.${k}.label`)} – ${t('shiftPay.form.hours')}`} value={input.hours[k]} max={300} onChange={(v) => setHours(k, v)} className="[&_label]:sr-only" />
                        </td>
                        <td className="w-24 py-2 align-top">
                          <NumField label={`${t(`shiftPay.kinds.${k}.label`)} – ${t('shiftPay.form.rate')}`} value={pct(input.rates[k])} max={300} suffix="%" onChange={(v) => setRate(k, v)} className="[&_label]:sr-only" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sp-class" className="label">
                    {t('shiftPay.form.taxClass')}
                  </label>
                  <select id="sp-class" className="input" value={input.taxClass} onChange={(e) => set({ taxClass: Number(e.target.value) as ShiftInput['taxClass'] })}>
                    {[1, 2, 3, 4, 5, 6].map((c) => (
                      <option key={c} value={c}>
                        {['I', 'II', 'III', 'IV', 'V', 'VI'][c - 1]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="sp-state" className="label">
                    {t('shiftPay.form.state')}
                  </label>
                  <select id="sp-state" className="input" value={input.state} onChange={(e) => set({ state: e.target.value as FederalState })}>
                    {FEDERAL_STATES.map((s) => (
                      <option key={s} value={s}>
                        {STATE_NAMES[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <Toggle legend={t('shiftPay.form.church')} value={input.church} onChange={(v) => set({ church: v })} />
                <Toggle legend={t('shiftPay.form.children')} value={!input.childless} onChange={(v) => set({ childless: !v })} />
              </div>
              <button
                type="button"
                className={buttonClass({ variant: 'ghost', size: 'sm' })}
                onClick={() => {
                  setInput(DEFAULT_SHIFT);
                  setPreset('nurse');
                }}
              >
                <RotateCcw className="size-4" aria-hidden /> {t('calcCommon.reset')}
              </button>
            </form>

            <div className="min-w-0 space-y-4" aria-live="polite">
              <div className="rounded-3xl border border-success-border bg-success-bg p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{t('shiftPay.result.advantage')}</p>
                  <EstimateBadge />
                </div>
                <p className="mt-1 font-display text-4xl font-bold text-ink tabular-nums">+ {money(r.advantage, true)}</p>
                <p className="text-sm text-ink">{t('shiftPay.result.perMonth')}</p>
                <Manat eur={r.advantage} className="mt-1" />
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['base', r.base],
                    ['supplements', r.supplements],
                    ['gross', r.gross],
                    ['taxFree', r.taxFree],
                    ['socialFree', r.socialFree],
                    ['net', r.net],
                    ['netFullyTaxed', r.netFullyTaxed],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className={clsx('rounded-2xl border border-line bg-card p-3', k === 'net' && 'border-primary')}>
                    <dt className="text-xs text-muted">{t(`shiftPay.result.${k}`)}</dt>
                    <dd className="font-display text-xl font-semibold text-ink tabular-nums">{money(v, true)}</dd>
                  </div>
                ))}
              </dl>
              <div className="overflow-x-auto rounded-3xl border border-line bg-card">
                <table className="w-full min-w-[30rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line bg-sunken text-left">
                      <th scope="col" className="px-4 py-2.5 font-semibold text-ink">
                        {t('shiftPay.form.kind')}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold text-ink">
                        {t('shiftPay.result.paid')}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold text-ink">
                        {t('shiftPay.result.taxFree')}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold text-ink">
                        {t('shiftPay.result.socialFree')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {r.lines
                      .filter((l) => l.hours > 0)
                      .map((l) => (
                        <tr key={l.kind}>
                          <th scope="row" className="px-4 py-2 text-left font-medium text-ink">
                            {t(`shiftPay.kinds.${l.kind}.label`)}
                          </th>
                          <td className="px-4 py-2 text-right tabular-nums">{money(l.amount, true)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{money(l.taxFree, true)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{money(l.socialFree, true)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-1.5 rounded-3xl border border-line bg-card p-4 text-sm leading-relaxed text-muted sm:p-5">
                {(['cap50', 'cap25', 'cumulate', 'night', 'holidays'] as const).map((k) => (
                  <li key={k} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span>{t(`shiftPay.notes.${k}`)}</span>
                  </li>
                ))}
              </ul>
              <GlossaryLinks
                terms={[
                  { slug: 'schichtarbeit', label: 'Schichtarbeit' },
                  { slug: 'tarifvertrag', label: 'Tarifvertrag' },
                  { slug: 'bruttolohn', label: 'Bruttolohn' },
                  { slug: 'nettolohn', label: 'Nettolohn' },
                  { slug: 'lohnabrechnung', label: 'Lohnabrechnung' },
                  { slug: 'arbeitszeit', label: 'Arbeitszeit' },
                ]}
              />
              <div className="flex flex-wrap gap-2">
                <Link to="/salary-calculator" className={buttonClass({ variant: 'outline' })}>
                  <BadgeEuro className="size-4" aria-hidden /> {t('shiftPay.actions.salary')}
                </Link>
                <Link to="/holiday-planner" className={buttonClass({ variant: 'ghost' })}>
                  {t('shiftPay.actions.holidays')}
                </Link>
              </div>
              <Disclaimer>{t('shiftPay.disclaimer')}</Disclaimer>
              <Sources checked={SHIFT_CHECKED} items={SOURCES} />
            </div>
          </div>
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/shift-pay-calculator" />
    </>
  );
}
