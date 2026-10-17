import { useId, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Calculator, Clock, Info, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal } from '@/components/motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { PageCta } from '@/components/visa/PageCta';
import { SalaryBreakdown } from '@/components/tools/SalaryBreakdown';
import { useMoney } from '@/components/tools/format';
import { registerCopy } from '@/i18n';
import { pagesTools } from '@/i18n/pagesTools';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  calculateSalary,
  DEFAULT_INPUT,
  FEDERAL_STATES,
  sanitizeInput,
  SOCIAL,
  TAX,
  type FederalState,
  type SalaryInput,
  type TaxClass,
} from '@/lib/salary';

registerCopy(pagesTools);

const HERO = 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=2000&q=70';

/** Proper names, identical in every language. */
const STATE_NAMES: Record<FederalState, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

/** Form state keeps raw strings for the number fields so users can clear and retype freely. */
type Form = {
  gross: string;
  period: SalaryInput['period'];
  taxClass: TaxClass;
  state: FederalState;
  church: boolean;
  children: string;
  age: string;
  zusatz: string;
};

const toForm = (i: SalaryInput): Form => ({
  gross: String(i.gross),
  period: i.period,
  taxClass: i.taxClass,
  state: i.state,
  church: i.church,
  children: String(i.children),
  age: String(i.age),
  zusatz: String(Math.round(i.zusatzbeitrag * 1000) / 10),
});

const num = (s: string) => Number(s.replace(',', '.'));

/** Reads ?gross=&period=&class=&state=&church=&children=&age=&zb= (all optional). */
const fromParams = (p: URLSearchParams): SalaryInput => {
  const state = (p.get('state') ?? '').toUpperCase();
  const zb = p.get('zb');
  return sanitizeInput({
    gross: p.has('gross') ? num(p.get('gross')!) : DEFAULT_INPUT.gross,
    period: p.get('period') === 'year' ? 'year' : 'month',
    taxClass: (Number(p.get('class')) || DEFAULT_INPUT.taxClass) as TaxClass,
    state: (FEDERAL_STATES as readonly string[]).includes(state) ? (state as FederalState) : DEFAULT_INPUT.state,
    church: p.get('church') === '1',
    children: Number(p.get('children') ?? 0),
    age: p.has('age') ? Number(p.get('age')) : DEFAULT_INPUT.age,
    zusatzbeitrag: zb !== null && zb !== '' ? num(zb) / 100 : DEFAULT_INPUT.zusatzbeitrag,
  });
};

const Field = ({ id, label, help, children }: { id: string; label: string; help?: string; children: ReactNode }) => (
  <div>
    <label htmlFor={id} className="label">
      {label}
    </label>
    {children}
    {help && (
      <p id={`${id}-help`} className="mt-1 text-[11px] leading-snug text-muted">
        {help}
      </p>
    )}
  </div>
);

/** Two-option toggle rendered as a radio group (keyboard: arrows via native radios). */
const Segmented = <T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) => (
  <fieldset>
    <legend className="label">{legend}</legend>
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface p-1">
      {options.map((o) => (
        <label
          key={o.value}
          className={clsx(
            'cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500',
            value === o.value ? 'bg-brand-600 text-white shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          <input type="radio" className="sr-only" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  </fieldset>
);

export default function SalaryCalculator() {
  const { t } = useTranslation();
  usePageTitle(t('salaryPage.heroTitle'));
  const id = useId();
  const [params] = useSearchParams();
  const [form, setForm] = useState<Form>(() => toForm(fromParams(params)));
  const [view, setView] = useState<'month' | 'year'>('month');
  const { euro, euroCents, percent } = useMoney();

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const input = useMemo(
    () =>
      sanitizeInput({
        gross: num(form.gross) || 0,
        period: form.period,
        taxClass: form.taxClass,
        state: form.state,
        church: form.church,
        children: num(form.children) || 0,
        age: num(form.age) || DEFAULT_INPUT.age,
        zusatzbeitrag: form.zusatz.trim() === '' ? SOCIAL.defaultZusatzbeitrag : num(form.zusatz) / 100,
      }),
    [form],
  );
  const result = useMemo(() => calculateSalary(input), [input]);
  const monthlyGross = result.monthly.gross;
  const notes = t('salaryPage.notes.items', { returnObjects: true }) as string[];

  return (
    <>
      <PageHero title={t('salaryPage.heroTitle')} subtitle={t('salaryPage.heroSubtitle')} image={HERO} />

      <section className="section">
        <div className="container-x grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
          {/* Inputs */}
          <form className="card card-pad space-y-5" onSubmit={(e) => e.preventDefault()} aria-labelledby={`${id}-form`}>
            <div className="flex items-center justify-between gap-3">
              <h2 id={`${id}-form`} className="flex items-center gap-2 font-display text-lg font-bold text-ink">
                <Calculator className="size-5 text-brand-600" aria-hidden /> {t('salaryPage.form.title')}
              </h2>
              <button type="button" onClick={() => setForm(toForm(DEFAULT_INPUT))} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-muted hover:text-brand-600">
                <RotateCcw className="size-3.5" aria-hidden /> {t('salaryPage.form.reset')}
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`${id}-gross`} label={t('salaryPage.form.gross')}>
                <input
                  id={`${id}-gross`}
                  className="input text-base font-semibold tabular-nums"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={50}
                  value={form.gross}
                  onChange={(e) => set('gross', e.target.value)}
                />
              </Field>
              <Segmented
                name={`${id}-period`}
                legend={t('salaryPage.form.period')}
                value={form.period}
                onChange={(v) => set('period', v)}
                options={[
                  { value: 'month', label: t('salaryPage.form.month') },
                  { value: 'year', label: t('salaryPage.form.year') },
                ]}
              />
            </div>

            <Field id={`${id}-class`} label={t('salaryPage.form.taxClass')} help={t('salaryPage.form.taxClassHelp')}>
              <select
                id={`${id}-class`}
                aria-describedby={`${id}-class-help`}
                className="input"
                value={form.taxClass}
                onChange={(e) => set('taxClass', Number(e.target.value) as TaxClass)}
              >
                {([1, 2, 3, 4, 5, 6] as const).map((c) => (
                  <option key={c} value={c}>
                    {t(`salaryPage.form.classes.${c}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field id={`${id}-state`} label={t('salaryPage.form.state')} help={t('salaryPage.form.stateHelp')}>
              <select id={`${id}-state`} aria-describedby={`${id}-state-help`} className="input" value={form.state} onChange={(e) => set('state', e.target.value as FederalState)}>
                {FEDERAL_STATES.map((s) => (
                  <option key={s} value={s}>
                    {STATE_NAMES[s]}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Segmented
                name={`${id}-church`}
                legend={t('salaryPage.form.church')}
                value={form.church ? 'yes' : 'no'}
                onChange={(v) => set('church', v === 'yes')}
                options={[
                  { value: 'no', label: t('salaryPage.form.no') },
                  { value: 'yes', label: t('salaryPage.form.yes') },
                ]}
              />
              <Field id={`${id}-children`} label={t('salaryPage.form.children')} help={t('salaryPage.form.childrenHelp')}>
                <input
                  id={`${id}-children`}
                  aria-describedby={`${id}-children-help`}
                  className="input tabular-nums"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={15}
                  step={1}
                  value={form.children}
                  onChange={(e) => set('children', e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`${id}-age`} label={t('salaryPage.form.age')} help={t('salaryPage.form.ageHelp')}>
                <input
                  id={`${id}-age`}
                  aria-describedby={`${id}-age-help`}
                  className="input tabular-nums"
                  type="number"
                  inputMode="numeric"
                  min={14}
                  max={100}
                  value={form.age}
                  onChange={(e) => set('age', e.target.value)}
                />
              </Field>
              <Field id={`${id}-zb`} label={t('salaryPage.form.zusatz')} help={t('salaryPage.form.zusatzHelp')}>
                <input
                  id={`${id}-zb`}
                  aria-describedby={`${id}-zb-help`}
                  className="input tabular-nums"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={10}
                  step={0.1}
                  value={form.zusatz}
                  onChange={(e) => set('zusatz', e.target.value)}
                />
              </Field>
            </div>

            {monthlyGross > 0 && monthlyGross < 2_000 && (
              <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {t('salaryPage.midijob')}
              </p>
            )}
          </form>

          {/* Result */}
          <div className="space-y-4 lg:sticky lg:top-28">
            <div className="card card-pad" aria-live="polite">
              <h2 className="sr-only">{t('salaryPage.result.title')}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-emerald-50 p-4">
                  <p className="text-xs font-semibold text-emerald-700">{t('salaryPage.result.netMonth')}</p>
                  <p className="mt-1 font-display text-3xl font-extrabold text-ink tabular-nums sm:text-4xl">{euroCents(result.monthly.net)}</p>
                </div>
                <div className="rounded-xl bg-surface p-4">
                  <p className="text-xs font-semibold text-muted">{t('salaryPage.result.netYear')}</p>
                  <p className="mt-1 font-display text-2xl font-extrabold text-ink tabular-nums sm:text-3xl">{euro(result.yearly.net)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" aria-hidden /> {t('salaryPage.result.hourly', { value: euroCents(result.hourlyNet) })}
                </span>
                <span>{t('salaryPage.result.deductions', { pct: percent(result.deductionRate) })}</span>
              </div>

              <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5">
                <span className="text-xs font-semibold text-muted" id={`${id}-view`}>
                  {t('salaryPage.result.view')}
                </span>
                <div role="group" aria-labelledby={`${id}-view`} className="inline-flex rounded-lg border border-line bg-surface p-0.5">
                  {(['month', 'year'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={view === v}
                      onClick={() => setView(v)}
                      className={clsx('rounded-md px-3 py-1 text-xs font-semibold transition-colors', view === v ? 'bg-card text-brand-600 shadow-sm' : 'text-muted hover:text-ink')}
                    >
                      {t(v === 'month' ? 'salaryPage.result.monthly' : 'salaryPage.result.yearly')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <SalaryBreakdown amounts={view === 'month' ? result.monthly : result.yearly} />
              </div>
            </div>

            <div role="note" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
              <div>
                <p className="font-display text-sm font-bold text-amber-900">{t('salaryPage.disclaimer.title')}</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800">{t('salaryPage.disclaimer.text')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Method + values */}
      <section className="section bg-surface">
        <div className="container-x grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
          <div>
            <SectionHeading eyebrow={t('salaryPage.notes.eyebrow')} title={t('salaryPage.notes.title')} />
            <Reveal>
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.slice(0, 32)} className="flex gap-3 text-sm leading-relaxed text-muted">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                    {n}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <div className="card card-pad">
              <h3 className="font-display text-lg font-bold text-ink">{t('salaryPage.values.title')}</h3>
              <dl className="mt-4 divide-y divide-line text-sm">
                {[
                  [t('salaryPage.values.gfb'), `${euro(TAX.grundfreibetrag)} ${t('salaryPage.values.perYear')}`],
                  [t('salaryPage.values.bbgPension'), `${euro(SOCIAL.bbgPension)} ${t('salaryPage.values.perYear')}`],
                  [t('salaryPage.values.bbgHealth'), `${euro(SOCIAL.bbgHealth)} ${t('salaryPage.values.perYear')}`],
                  [t('salaryPage.values.rates'), t('salaryPage.values.ratesValue')],
                  [t('salaryPage.values.church'), t('salaryPage.values.churchValue')],
                ].map(([k, v]) => (
                  <div key={k} className="py-2.5">
                    <dt className="text-xs font-semibold text-muted">{k}</dt>
                    <dd className="mt-0.5 font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="pt-16 sm:pt-20 lg:pt-28">
        <PageCta
          icon={<Calculator className="size-7" />}
          title={t('salaryPage.cta.title')}
          text={t('salaryPage.cta.text')}
          primary={{ to: '/jobs', label: t('salaryPage.cta.primary') }}
          secondary={{ to: '/booking', label: t('salaryPage.cta.secondary') }}
        />
      </div>
    </>
  );
}
