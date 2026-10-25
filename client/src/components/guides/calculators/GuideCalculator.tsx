import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, Calculator, CheckCircle2, Euro, Wallet, XCircle, type LucideIcon } from 'lucide-react';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesSeo } from '@/i18n/pagesSeo';
import { pagesGuideCalc } from '@/i18n/pagesGuideCalc';
import { MIN_POINTS, scoreChancenkarte, type AgeBand, type ChancenkarteInput, type EnglishLevel, type Experience, type GermanLevel, type Qualification } from '@/lib/chancenkarte';
import { BLUE_CARD_GROUPS, checkBlueCard, euroFormat, useBlueCardThresholds, type BlueCardGroup } from '@/lib/calculators/blueCard';
import { costInput, DEFAULT_COST_CHOICES, useCostEstimate } from '@/lib/calculators/cost';
import { calculateSalary, FEDERAL_STATES, STATE_NAMES, type FederalState, type TaxClass } from '@/lib/salary';
import { fmtMoney, useCostConfig, type Money } from '@/components/marketing/api';
import { useL10n } from '@/lib/l10n';
import { buttonClass } from '@/components/ui/Button';
import type { GuideCalculatorType } from './types';

registerCopy(pagesSeo);
registerCopy(pagesGuideCalc);

/**
 * Compact live calculators embedded in guide bodies (`::calculator{type="…"}`). Lazy-loaded chunk: the guide
 * page shows the server's static teaser until this renders. Each widget reuses the pure logic of its full tool
 * (lib/chancenkarte.ts, lib/calculators/*, lib/salary) and links to it for the detailed version.
 */

const TOOL_PATH: Record<GuideCalculatorType, string> = {
  chancenkarte: '/chancenkarte-calculator',
  'blue-card': '/blue-card-check',
  cost: '/cost-calculator',
  salary: '/salary-calculator',
};

const Frame = ({ title, icon: Icon, to, children }: { title: string; icon: LucideIcon; to: string; children: ReactNode }) => {
  const { t } = useTranslation();
  const id = useId();
  return (
    <section aria-labelledby={id} className="card card-pad my-10 rounded-3xl">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-sage">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="eyebrow">{t('guideCalc.eyebrow')}</p>
          <h3 id={id} className="mt-0.5 font-display text-lg leading-snug font-semibold text-ink">
            {title}
          </h3>
        </div>
      </div>
      <div className="mt-5">{children}</div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-xs text-muted">{t('guideCalc.live')}</p>
        <Link to={to} className={buttonClass({ variant: 'outline' })}>
          {t('guideCalc.openFull')} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
};

const SelectField = ({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) => {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
};

const Tick = ({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) => (
  <label className="flex cursor-pointer items-start gap-2.5 min-h-11 rounded-xl border border-line p-2.5 text-sm leading-snug text-ink hover:border-line-strong has-[:checked]:border-primary has-[:checked]:bg-sunken">
    <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{children}</span>
  </label>
);

const Verdict = ({ ok, title, children }: { ok: boolean; title: string; children?: ReactNode }) => (
  <div className={clsx('mt-4 flex gap-3 rounded-xl p-3.5', ok ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg')}>
    {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden />}
    <div className="space-y-1 text-sm leading-relaxed">
      <p className="font-semibold">{title}</p>
      {children}
    </div>
  </div>
);

/** Result column (polite live region: screen readers hear the new result after a change). */
const Result = ({ children }: { children: ReactNode }) => (
  <div className="rounded-2xl bg-sunken p-4 sm:p-5" aria-live="polite">
    {children}
  </div>
);

// ─── Chancenkarte ─────────────────────────────────────────────────────

const CK_DEFAULTS: ChancenkarteInput = { qualification: 'foreign', shortage: false, german: 'A1', english: 'none', experience: 'two', age: 'u35', stay: false, partner: false, funds: true };

const ChancenkarteWidget = () => {
  const { t } = useTranslation();
  const [form, setForm] = useState(CK_DEFAULTS);
  const set = <K extends keyof ChancenkarteInput>(k: K, v: ChancenkarteInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const r = useMemo(() => scoreChancenkarte(form), [form]);
  const pct = Math.min(100, Math.round((r.points / 14) * 100));
  return (
    <Frame title={t('guideCalc.titles.chancenkarte')} icon={Calculator} to={TOOL_PATH.chancenkarte}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <SelectField label={t('ckCalc.qualification')} value={form.qualification} onChange={(v) => set('qualification', v as Qualification)}>
              {(['full', 'partial', 'foreign', 'none'] as Qualification[]).map((q) => (
                <option key={q} value={q}>
                  {t(`ckCalc.qual.${q}`)}
                </option>
              ))}
            </SelectField>
          </div>
          <SelectField label={t('ckCalc.german')} value={form.german} onChange={(v) => set('german', v as GermanLevel)}>
            <option value="none">{t('ckCalc.levelNone')}</option>
            <option value="A1">A1</option>
            <option value="A2">A2</option>
            <option value="B1">B1</option>
            <option value="B2">B2 / C1 / C2</option>
          </SelectField>
          <SelectField label={t('ckCalc.english')} value={form.english} onChange={(v) => set('english', v as EnglishLevel)}>
            <option value="none">{t('ckCalc.englishLow')}</option>
            <option value="B2">B2</option>
            <option value="C1">C1 / C2</option>
          </SelectField>
          <SelectField label={t('ckCalc.experience')} value={form.experience} onChange={(v) => set('experience', v as Experience)}>
            {(['none', 'two', 'five'] as Experience[]).map((x) => (
              <option key={x} value={x}>
                {t(`ckCalc.exp.${x}`)}
              </option>
            ))}
          </SelectField>
          <SelectField label={t('ckCalc.age')} value={form.age} onChange={(v) => set('age', v as AgeBand)}>
            {(['u35', 'u40', 'o40'] as AgeBand[]).map((x) => (
              <option key={x} value={x}>
                {t(`ckCalc.ages.${x}`)}
              </option>
            ))}
          </SelectField>
          <div className="grid gap-2 sm:col-span-2">
            <Tick checked={form.shortage} onChange={(v) => set('shortage', v)}>
              {t('ckCalc.shortage')}
            </Tick>
            <Tick checked={form.stay} onChange={(v) => set('stay', v)}>
              {t('ckCalc.stay')}
            </Tick>
            <Tick checked={form.partner} onChange={(v) => set('partner', v)}>
              {t('ckCalc.partner')}
            </Tick>
          </div>
        </div>
        <Result>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t('ckCalc.result')}</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="font-display text-3xl font-semibold text-ink tabular-nums">{t('ckCalc.points', { count: r.points })}</p>
            <p className="pb-1 text-xs text-muted">{t('ckCalc.of')}</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-card" aria-hidden>
            <div className={clsx('h-full origin-left rounded-full transition-[width] duration-300', r.points >= MIN_POINTS ? 'bg-success' : 'bg-warning')} style={{ width: `${pct}%` }} />
          </div>
          <Verdict ok={r.status !== 'notYet'} title={t(`ckCalc.${r.status}`)}>
            {r.missing.includes('points') && <p>{t('ckCalc.missPoints', { count: r.pointsShort })}</p>}
            {r.missing.includes('qualification') && <p>{t('ckCalc.missQualification')}</p>}
            {r.missing.includes('language') && <p>{t('ckCalc.missLanguage')}</p>}
          </Verdict>
          <p className="mt-3 text-xs text-muted">{t('guideCalc.ck.assumeFunds')}</p>
        </Result>
      </div>
    </Frame>
  );
};

// ─── Blue Card ────────────────────────────────────────────────────────

const BlueCardWidget = () => {
  const { t } = useTranslation();
  const id = useId();
  const { data, isError } = useBlueCardThresholds();
  const [salary, setSalary] = useState('52000');
  const [period, setPeriod] = useState<'year' | 'month'>('year');
  const [group, setGroup] = useState<BlueCardGroup>('standard');
  const [degree, setDegree] = useState(true);
  const year = data?.year ?? '';
  const fmt = useMemo(() => euroFormat(currentSiteLocale()), [t]); // t changes with the language
  const r = checkBlueCard({ salary, period, group, degree, contract: true }, data?.thresholds, year);
  return (
    <Frame title={t('guideCalc.titles.blueCard')} icon={Euro} to={TOOL_PATH['blue-card']}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <label htmlFor={`${id}-s`} className="label">
                {t('bcCheck.salary')}
              </label>
              <input id={`${id}-s`} className="input font-semibold tabular-nums" type="number" inputMode="decimal" min={0} step={period === 'month' ? 50 : 500} value={salary} onChange={(e) => setSalary(e.target.value)} />
            </div>
            <fieldset>
              <legend className="label">{t('bcCheck.period')}</legend>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-sunken p-1">
                {(['year', 'month'] as const).map((p) => (
                  <label
                    key={p}
                    className={clsx(
                      'cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                      period === p ? 'bg-primary text-primary-contrast shadow-sm' : 'text-muted hover:text-ink',
                    )}
                  >
                    <input type="radio" className="sr-only" name={`${id}-p`} checked={period === p} onChange={() => setPeriod(p)} />
                    {t(`bcCheck.${p}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <SelectField label={t('bcCheck.group')} value={group} onChange={(v) => setGroup(v as BlueCardGroup)}>
            {BLUE_CARD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {t(`bcCheck.groups.${g}`)}
              </option>
            ))}
          </SelectField>
          {group !== 'it' && (
            <Tick checked={degree} onChange={setDegree}>
              {t('bcCheck.degree')}
            </Tick>
          )}
        </div>
        <Result>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t('bcCheck.result')}</p>
          {isError ? (
            <p className="mt-2 text-sm text-muted">{t('guideCalc.error')}</p>
          ) : r.threshold == null ? (
            <div className="mt-3 space-y-2" aria-hidden>
              <div className="h-7 w-2/3 animate-pulse rounded-lg bg-neutral-bg" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-bg" />
              <div className="h-16 animate-pulse rounded-xl bg-neutral-bg" />
            </div>
          ) : (
            <>
              <p className="mt-2 font-display text-2xl font-semibold text-ink tabular-nums">{t('bcCheck.yourSalary', { amount: fmt.format(r.yearly) })}</p>
              <p className="mt-1 text-sm text-muted">{t('bcCheck.threshold', { year, amount: fmt.format(r.threshold) })}</p>
              <Verdict ok={r.ok} title={r.salaryOk ? t('bcCheck.ok') : t('bcCheck.below')}>
                <p>{r.salaryOk ? t('bcCheck.okText', { diff: fmt.format(r.diff) }) : t('bcCheck.belowText', { diff: fmt.format(r.diff) })}</p>
                {!r.degreeOk && <p>{t('bcCheck.missDegree')}</p>}
              </Verdict>
            </>
          )}
        </Result>
      </div>
    </Frame>
  );
};

// ─── Net salary ───────────────────────────────────────────────────────

const TAX_CLASSES: TaxClass[] = [1, 2, 3, 4, 5, 6];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

const SalaryWidget = () => {
  const { t } = useTranslation();
  const id = useId();
  const [gross, setGross] = useState('3200');
  const [taxClass, setTaxClass] = useState<TaxClass>(1);
  const [state, setState] = useState<FederalState>('BE');
  const fmt = useMemo(() => euroFormat(currentSiteLocale()), [t]);
  const grossNum = Number(gross.replace(',', '.')) || 0;
  const r = useMemo(() => calculateSalary({ gross: grossNum, period: 'month', taxClass, state, church: false, children: 0 }), [grossNum, taxClass, state]);
  const deductions = r.monthly.gross - r.monthly.net;
  const to = `${TOOL_PATH.salary}?${new URLSearchParams({ gross: String(grossNum), period: 'month', class: String(taxClass), state }).toString()}`;
  return (
    <Frame title={t('guideCalc.titles.salary')} icon={Wallet} to={to}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-g`} className="label">
              {t('guideCalc.salary.gross')}
            </label>
            <input id={`${id}-g`} className="input font-semibold tabular-nums" type="number" inputMode="decimal" min={0} step={50} value={gross} onChange={(e) => setGross(e.target.value)} />
          </div>
          <SelectField label={t('guideCalc.salary.taxClass')} value={String(taxClass)} onChange={(v) => setTaxClass(Number(v) as TaxClass)}>
            {TAX_CLASSES.map((c) => (
              <option key={c} value={c}>
                {ROMAN[c - 1]}
              </option>
            ))}
          </SelectField>
          <SelectField label={t('guideCalc.salary.state')} value={state} onChange={(v) => setState(v as FederalState)}>
            {FEDERAL_STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_NAMES[s]}
              </option>
            ))}
          </SelectField>
          <p className="text-xs text-muted sm:col-span-2">{t('guideCalc.salary.hint')}</p>
        </div>
        <Result>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t('guideCalc.salary.net')}</p>
          <p className="mt-2 font-display text-3xl font-semibold text-ink tabular-nums">{fmt.format(r.monthly.net)}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-card" aria-hidden>
            <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${Math.round((1 - r.deductionRate) * 100)}%` }} />
          </div>
          <p className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">{t('guideCalc.salary.deductions')}</span>
            <span className="font-semibold text-ink tabular-nums">
              {fmt.format(deductions)} · {Math.round(r.deductionRate * 100)} %
            </span>
          </p>
        </Result>
      </div>
    </Frame>
  );
};

// ─── Cost ─────────────────────────────────────────────────────────────

const CostWidget = () => {
  const { t } = useTranslation();
  const { tr, locale } = useL10n();
  const { data: config, isLoading, isError } = useCostConfig();
  const [slug, setSlug] = useState('');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const categories = config?.categories ?? [];
  // Ausbildung guide: preselect the Ausbildung category when it exists, otherwise the first one.
  useEffect(() => {
    if (slug || !categories.length) return;
    setSlug((categories.find((c) => /ausbildung/i.test(c.slug)) ?? categories[0]).slug);
  }, [categories, slug]);
  const category = categories.find((c) => c.slug === slug) ?? null;
  const input = useMemo(() => costInput(category, { ...DEFAULT_COST_CHOICES, adults, children }), [category, adults, children]);
  const { data: est, isFetching } = useCostEstimate(input);
  const eur = (m: Money) => (m[0] === m[1] ? `${fmtMoney(m[0], locale)} €` : `${fmtMoney(m[0], locale)}–${fmtMoney(m[1], locale)} €`);
  const to = slug ? `${TOOL_PATH.cost}?visa=${encodeURIComponent(slug)}` : TOOL_PATH.cost;
  const count = (v: string) => Math.max(0, Math.min(10, Math.round(Number(v) || 0)));

  return (
    <Frame title={t('guideCalc.titles.cost')} icon={Wallet} to={to}>
      {isError || (config && !config.enabled) ? (
        <p className="text-sm text-muted">{isError ? t('guideCalc.error') : t('guideCalc.cost.disabled')}</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <SelectField label={t('guideCalc.cost.visa')} value={slug} onChange={setSlug}>
                {isLoading && <option value="">…</option>}
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {tr(c.title)} · {c.visaLabel}
                  </option>
                ))}
              </SelectField>
            </div>
            <NumberField label={t('guideCalc.cost.adults')} value={adults} min={1} onChange={(v) => setAdults(Math.max(1, count(v)))} />
            <NumberField label={t('guideCalc.cost.children')} value={children} min={0} onChange={(v) => setChildren(count(v))} />
          </div>
          <Result>
            {!est || !category ? (
              isLoading || isFetching ? (
                <div className="space-y-2" aria-hidden>
                  <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-bg" />
                  <div className="h-8 w-2/3 animate-pulse rounded-lg bg-neutral-bg" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-bg" />
                </div>
              ) : (
                <p className="text-sm text-muted">{t('guideCalc.cost.pick')}</p>
              )
            ) : (
              <div className={clsx('transition-opacity', isFetching && 'opacity-60')}>
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t('guideCalc.cost.oneTime')}</p>
                <p className="mt-2 font-display text-2xl font-semibold text-ink tabular-nums">{eur(est.oneTime)}</p>
                {est.refundable[1] > 0 && (
                  <p className="mt-3 flex items-start justify-between gap-3 text-sm">
                    <span className="text-muted">{t('guideCalc.cost.refundable')}</span>
                    <span className="shrink-0 font-semibold text-ink tabular-nums">{eur(est.refundable)}</span>
                  </p>
                )}
              </div>
            )}
          </Result>
        </div>
      )}
    </Frame>
  );
};

const NumberField = ({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (v: string) => void }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} type="number" inputMode="numeric" className="input tabular-nums" min={min} max={10} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
};

/** The live calculator for a shortcode type. */
export default function GuideCalculator({ type }: { type: GuideCalculatorType }) {
  switch (type) {
    case 'chancenkarte':
      return <ChancenkarteWidget />;
    case 'blue-card':
      return <BlueCardWidget />;
    case 'salary':
      return <SalaryWidget />;
    case 'cost':
      return <CostWidget />;
  }
}
