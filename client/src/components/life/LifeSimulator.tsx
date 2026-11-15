import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, Info, Link2, Plane, RotateCcw } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button, buttonClass } from '@/components/ui/Button';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { useMoney } from '@/components/tools/format';
import { localePath } from '@/lib/localeRouter';
import { budgetHref } from '@/components/budget/api';
import { CostDonut, DONUT_COLORS, SAVINGS_COLOR, type DonutPart } from './CostDonut';
import { LIFE_PROFESSIONS, LIFE_QUERY_KEYS, formatAzn, useLifeConfig, useLifeEstimate, type Household, type LifeConfig, type LifeEstimate, type LifeForm, type LifeProfession } from './api';

const Chips = <T extends string>({ legend, value, options, onChange, name, cols = 'grid-cols-3', hint }: {
  legend: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  name: string;
  cols?: string;
  hint?: ReactNode;
}) => (
  <fieldset>
    <legend className="label">{legend}</legend>
    <div className={clsx('grid gap-2', cols)}>
      {options.map((o) => (
        <label
          key={o.value}
          className={clsx(
            'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
            value === o.value ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
          )}
        >
          <input type="radio" className="sr-only" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
    {hint && <p className="mt-1 text-xs leading-snug text-muted">{hint}</p>}
  </fieldset>
);

const useDebounced = <T,>(value: T, ms: number) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
};

const fromParams = (p: URLSearchParams): LifeForm => {
  const f: LifeForm = {};
  for (const k of LIFE_QUERY_KEYS) {
    const v = p.get(k);
    if (v) f[k] = v;
  }
  return f;
};
const toQuery = (f: LifeForm) => {
  const p = new URLSearchParams();
  for (const k of LIFE_QUERY_KEYS) {
    const v = f[k]?.trim();
    if (v) p.set(k, v);
  }
  return p.toString();
};

/** "1 € = 1,8805 ₼ · CBAR, 13.11.2026" or the fallback / missing notes. */
export const RateLine = ({ rate, className }: { rate: LifeConfig['rate']; className?: string }) => {
  const { t, i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  if (!rate) return <p className={clsx('text-xs text-muted', className)}>{t('life.rate.none')}</p>;
  const [y, m, d] = rate.date.split('-');
  const date = `${d}.${m}.${y}`;
  const value = lng === 'en' ? rate.rate.toFixed(4) : rate.rate.toFixed(4).replace('.', ',');
  return (
    <p className={clsx('flex items-start gap-1.5 text-xs leading-snug', rate.stale ? 'text-warning-fg' : 'text-muted', className)}>
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        {t('life.rate.label', { rate: value, date })}
        {rate.stale && <> — {t('life.rate.stale', { date })}</>}
      </span>
    </p>
  );
};

const Stat = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) => (
  <div className="min-w-0 rounded-2xl border border-line bg-card p-3 sm:p-4">
    <p className="text-xs leading-snug text-muted">{label}</p>
    <p className={clsx('mt-1 font-display text-xl font-semibold tabular-nums sm:text-2xl', tone === 'good' ? 'text-success-fg' : tone === 'bad' ? 'text-danger-fg' : 'text-ink')}>{value}</p>
    {sub && <p className="mt-0.5 text-xs text-muted tabular-nums">{sub}</p>}
  </div>
);

const BakuBlock = ({ r }: { r: LifeEstimate }) => {
  const { t, i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const b = r.baku;
  if (!b || r.sim.azn.gross == null) return null;
  const dec = (n: number) => (lng === 'en' ? n.toFixed(1) : n.toFixed(1).replace('.', ','));
  return (
    <section className="rounded-3xl border border-line bg-sunken p-4 sm:p-5" aria-labelledby="life-baku-h">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="life-baku-h" className="font-display text-lg font-semibold text-ink">
          {t('life.baku.title')}
        </h3>
        <span className="rounded-full border border-warning-border bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning-fg">{t('life.baku.estimate')}</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Stat label={t('life.baku.bakuGross')} value={formatAzn(b.grossAzn, lng)} />
        <Stat label={t('life.baku.germanyGross')} value={formatAzn(r.sim.azn.gross, lng)} sub={b.grossRatio != null ? t('life.baku.ratio', { ratio: dec(b.grossRatio) }) : undefined} />
        <Stat
          label={t('life.baku.germanySavings')}
          value={r.sim.azn.savings != null ? formatAzn(r.sim.azn.savings, lng) : '—'}
          tone={r.sim.savingsMid >= 0 ? 'good' : 'bad'}
          sub={b.savingsInBakuSalaries != null && b.savingsInBakuSalaries > 0 ? t('life.baku.savingsIn', { n: dec(b.savingsInBakuSalaries) }) : undefined}
        />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        {b.kind === 'national' ? t('life.baku.national', { year: b.year }) : t('life.baku.profession', { source: b.source || '—' })} {t('life.baku.disclaimer')}
      </p>
    </section>
  );
};

/**
 * "Life in Germany" simulator: profession, city, household and tax class on the left; the month on the right
 * (gross → net, costs by category as a donut, what is left, everything also in AZN), plus the Baku comparison.
 * The maths runs on the server (GET /api/life/estimate, the same engine as the first-month budget). Choices live
 * in the URL (share link). Rendered after hydration only (the page shows a placeholder of the same height).
 */
export const LifeSimulator = () => {
  const { t, i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const { euro, percent } = useMoney();
  const id = useId();
  const [params, setParams] = useSearchParams();
  const config = useLifeConfig();
  const [form, setForm] = useState<LifeForm>(() => fromParams(params));
  const change = (patch: LifeForm) => setForm((f) => ({ ...f, ...patch }));

  const query = useDebounced(toQuery(form), 300);
  const estimate = useLifeEstimate(config.data ? query : null);
  const r = estimate.data;

  useEffect(() => {
    if (query !== toQuery(fromParams(params))) setParams(new URLSearchParams(query), { replace: true, preventScrollReset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const cfg = config.data;
  const profession = (form.profession as LifeProfession) ?? cfg?.defaults.profession ?? 'driver';
  const prof = cfg?.professions.find((p) => p.key === profession);
  const household = (form.household as Household) ?? 'single';
  const taxClass = form.taxClass ?? (household === 'single' ? '1' : '3');
  const housing = form.housing ?? 'flat';
  const citySlug = form.city ?? r?.city.slug ?? cfg?.defaults.city ?? '';

  const parts = useMemo<DonutPart[]>(() => {
    if (!r) return [];
    const azn = (n: number | null | undefined) => (n == null ? null : formatAzn(n, lng));
    const list: DonutPart[] = r.sim.lines.map((l, i) => ({
      key: l.key,
      label: t(`life.result.categories.${l.key}`),
      value: l.mid,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
      eur: euro(l.mid),
      azn: azn(r.sim.azn.lines[l.key]),
    }));
    if (r.sim.savingsMid > 0) list.push({ key: 'savings', label: t('life.result.categories.savings'), value: r.sim.savingsMid, color: SAVINGS_COLOR, eur: euro(r.sim.savingsMid), azn: azn(r.sim.azn.savings) });
    return list;
  }, [r, t, euro, lng]);

  if (config.isLoading) return <Spinner className="mx-auto my-16 size-8" label={t('life.result.loading')} />;
  if (!cfg) return <p className="card card-pad rounded-3xl text-center text-muted">{t('life.result.error')}</p>;

  const shareUrl = r ? `${window.location.origin}${localePath('/life-in-germany')}?${r.share}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t('life.actions.copied'));
    } catch {
      toast.error(t('life.actions.copyFailed'));
    }
  };
  const range = (a: [number, number]) => (a[0] === a[1] ? euro(a[0]) : `${euro(a[0])} – ${euro(a[1])}`);
  const aznOf = (n: number | null | undefined) => (n == null ? undefined : formatAzn(n, lng));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-10">
      <form className="card card-pad space-y-5 rounded-3xl" onSubmit={(e) => e.preventDefault()} aria-labelledby={`${id}-form`}>
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${id}-form`} className="font-display text-lg font-semibold text-ink">
            {t('life.form.title')}
          </h2>
          <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-muted hover:text-ink" onClick={() => setForm({})}>
            <RotateCcw className="size-4" aria-hidden /> {t('life.form.reset')}
          </button>
        </div>

        <div>
          <label htmlFor={`${id}-prof`} className="label">
            {t('life.form.profession')}
          </label>
          <select id={`${id}-prof`} className="input" value={profession} onChange={(e) => change({ profession: e.target.value, gross: undefined })}>
            {LIFE_PROFESSIONS.map((p) => (
              <option key={p} value={p}>
                {t(`life.form.professions.${p}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-city`} className="label">
            {t('life.form.city')}
          </label>
          <select id={`${id}-city`} className="input" value={citySlug} onChange={(e) => change({ city: e.target.value })}>
            {cfg.cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <Chips<Household>
          legend={t('life.form.household')}
          name={`${id}-household`}
          value={household}
          options={(['single', 'couple', 'family'] as const).map((h) => ({ value: h, label: t(`life.form.households.${h}`) }))}
          onChange={(v) => change({ household: v, taxClass: undefined, children: v === 'family' ? (form.children ?? '1') : undefined, housing: v === 'single' ? form.housing : undefined })}
        />
        {household === 'family' && (
          <div>
            <label htmlFor={`${id}-kids`} className="label">
              {t('life.form.children')}
            </label>
            <select id={`${id}-kids`} className="input" value={form.children ?? '1'} onChange={(e) => change({ children: e.target.value })}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
        {household === 'single' && (
          <Chips
            legend={t('life.form.housing')}
            name={`${id}-housing`}
            cols="grid-cols-2"
            value={housing}
            options={(['flat', 'wg'] as const).map((h) => ({ value: h, label: t(`life.form.housings.${h}`) }))}
            onChange={(v) => change({ housing: v === 'flat' ? undefined : v })}
          />
        )}
        <Chips
          legend={t('life.form.taxClass')}
          name={`${id}-tax`}
          value={taxClass}
          options={['1', '3', '4'].map((c) => ({ value: c, label: ['I', '', '', 'III', 'IV'][Number(c)] || c }))}
          onChange={(v) => change({ taxClass: v })}
          hint={t('life.form.taxClassHint')}
        />

        <div>
          <label htmlFor={`${id}-gross`} className="label">
            {t('life.form.gross')}
          </label>
          <input
            id={`${id}-gross`}
            className="input tabular-nums"
            inputMode="numeric"
            autoComplete="off"
            value={form.gross ?? String(prof?.gross ?? '')}
            onChange={(e) => change({ gross: e.target.value.replace(/\D/g, '').slice(0, 5) || undefined })}
            aria-describedby={`${id}-gross-hint`}
          />
          {prof && (
            <p id={`${id}-gross-hint`} className="mt-1 text-xs leading-snug text-muted">
              {prof.source === 'vacancies'
                ? t('life.form.grossVacancies', { count: prof.vacancies, min: euro(prof.grossMin), max: euro(prof.grossMax) })
                : t('life.form.grossReference', { min: euro(prof.grossMin), max: euro(prof.grossMax) })}
              {form.gross && (
                <>
                  {' '}
                  <button type="button" className="font-semibold text-link hover:underline" onClick={() => change({ gross: undefined })}>
                    {t('life.form.grossTypical')}
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      </form>

      <div className="min-w-0 space-y-5" aria-live="polite" aria-busy={estimate.isFetching}>
        {!r ? (
          estimate.isError ? (
            <p className="card card-pad rounded-3xl text-center text-muted">{t('life.result.error')}</p>
          ) : (
            <Spinner className="mx-auto my-16 size-8" label={t('life.result.loading')} />
          )
        ) : (
          <>
            <section className="card card-pad space-y-5 rounded-3xl" aria-labelledby={`${id}-res`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`${id}-res`} className="font-display text-lg font-semibold text-ink">
                  {t('life.result.title')}
                </h2>
                <span className="text-sm text-muted">
                  {t(`life.form.professions.${r.input.profession}`)} · {r.city.name}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label={t('life.result.gross')} value={<AnimatedNumber value={r.sim.gross} format={(n) => euro(Math.round(n))} />} sub={aznOf(r.sim.azn.gross)} />
                <Stat label={t('life.result.net')} value={<AnimatedNumber value={Math.round(r.sim.net)} format={(n) => euro(Math.round(n))} />} sub={aznOf(r.sim.azn.net)} />
                <div className="col-span-2 sm:col-span-1">
                  <Stat
                    label={r.sim.savingsMid >= 0 ? t('life.result.savings') : t('life.result.deficit')}
                    tone={r.sim.savingsMid >= 0 ? 'good' : 'bad'}
                    value={<AnimatedNumber value={r.sim.savingsMid} format={(n) => euro(Math.round(n))} />}
                    sub={aznOf(r.sim.azn.savings)}
                  />
                </div>
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">{t('life.result.deductions')}</dt>
                <dd className="text-right text-ink tabular-nums">−{euro(r.sim.deductions)}</dd>
                {r.sim.kindergeld > 0 && (
                  <>
                    <dt className="text-muted">{t('life.result.kindergeld')}</dt>
                    <dd className="text-right text-ink tabular-nums">+{euro(r.sim.kindergeld)}</dd>
                  </>
                )}
                <dt className="text-muted">{t('life.result.costs')}</dt>
                <dd className="text-right text-ink tabular-nums">−{range(r.sim.costs)}</dd>
                <dt className="font-semibold text-ink">{r.sim.savingsMid >= 0 ? t('life.result.savings') : t('life.result.deficit')}</dt>
                <dd className="text-right font-semibold text-ink tabular-nums">
                  {range(r.sim.savings)}
                  {r.sim.savingsRate > 0 && <span className="block text-xs font-normal text-muted">{t('life.result.savingsRate', { pct: percent(r.sim.savingsRate) })}</span>}
                </dd>
              </dl>

              <CostDonut
                key={r.share}
                parts={parts}
                ariaLabel={t('life.result.chartAria')}
                center={euro(Math.round(r.sim.income))}
                sub={`${t('life.result.chartCenter')}${r.sim.azn.income != null ? ` · ${formatAzn(r.sim.azn.income, lng)}` : ''}`}
              />
              <p className="text-xs leading-relaxed text-muted">{t('life.result.note')}</p>
              <RateLine rate={r.rate} />

              {r.warnings
                .filter((w) => ['MONTHLY_DEFICIT', 'CLASS3_SINGLE', 'MIDIJOB'].includes(w))
                .map((w) => (
                  <p key={w} className="flex items-start gap-2 rounded-xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {t(`life.result.warnings.${w}`)}
                  </p>
                ))}
            </section>

            <BakuBlock r={r} />

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={copy}>
                <Link2 className="size-4" aria-hidden /> {t('life.actions.share')}
              </Button>
              <Link to={budgetHref({ gross: r.input.gross, place: r.city.name })} className={buttonClass({ variant: 'outline' })}>
                <Plane className="size-4" aria-hidden /> {t('life.actions.budget')}
              </Link>
              <Link to={`/salary-calculator?gross=${r.input.gross}`} className={buttonClass({ variant: 'ghost' })}>
                {t('life.actions.salary')} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
