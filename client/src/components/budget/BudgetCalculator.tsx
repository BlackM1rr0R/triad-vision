import { lazy, Suspense, useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, CalendarClock, Download, Info, Link2, PhoneCall, PiggyBank, RotateCcw, ShieldCheck, Wallet } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Button, buttonClass } from '@/components/ui/Button';
import { useMoney } from '@/components/tools/format';
import { registerCopy } from '@/i18n';
import { pagesBudget } from '@/i18n/pagesBudget';
import { useL10n } from '@/lib/l10n';
import { localePath } from '@/lib/localeRouter';
import {
  FEDERAL_STATES,
  QUERY_KEYS,
  STATE_NAMES,
  useBudgetConfig,
  useBudgetEstimate,
  type BudgetForm,
  type BudgetResult,
  type Household,
  type Housing,
  type Range,
} from './api';

registerCopy(pagesBudget);

const CallbackForm = lazy(() => import('@/components/calls/CallbackForm').then((m) => ({ default: m.CallbackForm })));

/** Chart series colours (categorical tokens) for the one-off cost bar. */
/** One-off lines with an explanation under the label (budget.result.oneOffHint.*). */
const HINT_KEYS = ['deposit', 'rent', 'transport', 'phone', 'rundfunk', 'healthGap', 'food'];
const SERIES = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5', 'bg-chart-6', 'bg-chart-7', 'bg-chart-8'];

const Chips = <T extends string>({
  legend,
  value,
  options,
  onChange,
  name,
  cols = 'grid-cols-3',
  hint,
}: {
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

const Labeled = ({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) => (
  <div>
    <label htmlFor={id} className="label">
      {label}
    </label>
    {children}
    {hint && (
      <p id={`${id}-hint`} className="mt-1 text-xs leading-snug text-muted">
        {hint}
      </p>
    )}
  </div>
);

/** Form values → API query (only filled values, so defaults stay server-side). */
const toQuery = (f: BudgetForm) => {
  const p = new URLSearchParams();
  for (const k of QUERY_KEYS) {
    const v = f[k]?.trim();
    if (v) p.set(k, v);
  }
  return p.toString();
};

const fromParams = (p: URLSearchParams): BudgetForm => {
  const f: BudgetForm = {};
  for (const k of QUERY_KEYS) {
    const v = p.get(k);
    if (v) f[k] = v;
  }
  return f;
};

const useDebounced = <T,>(value: T, ms: number) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
};

export interface BudgetCalculatorProps {
  /** Starting values when the URL has none (portal prefill). */
  initial?: BudgetForm;
  /** Callback request source of the "ask a consultant" form. */
  callbackSource: 'contact' | 'portal';
  /** Shown above the form (e.g. "prefilled from your application"). */
  intro?: ReactNode;
}

/**
 * First-month budget calculator: inputs on the left, results on the right. The maths runs on the server
 * (GET /api/budget/estimate) so the page and the PDF always agree. Inputs live in the URL (share link).
 */
export const BudgetCalculator = ({ initial, callbackSource, intro }: BudgetCalculatorProps) => {
  const { t } = useTranslation();
  const { locale, tr, date } = useL10n();
  const { euro } = useMoney();
  const id = useId();
  const [params, setParams] = useSearchParams();
  const config = useBudgetConfig();
  const [form, setForm] = useState<BudgetForm>(() => {
    const fromUrl = fromParams(params);
    return Object.keys(fromUrl).length ? fromUrl : { ...(initial ?? {}) };
  });
  const [consultant, setConsultant] = useState(false);
  const set = (patch: BudgetForm) => setForm((f) => ({ ...f, ...patch }));

  // Prefill arriving after the first render (portal): apply once while the visitor has not typed anything.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched && initial && Object.keys(initial).length && !Object.keys(fromParams(params)).length) setForm({ ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  const change = (patch: BudgetForm) => {
    setTouched(true);
    set(patch);
  };

  const query = useDebounced(toQuery(form), 350);
  const estimate = useBudgetEstimate(config.data ? query : null);
  const r = estimate.data;

  // Keep the URL in sync (replace: no history entry per keystroke).
  useEffect(() => {
    if (query !== toQuery(fromParams(params))) setParams(new URLSearchParams(query), { replace: true, preventScrollReset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // A free-text place (from a vacancy link) becomes the matched row, so the select shows it.
  useEffect(() => {
    if (r && form.place && !form.city) set({ city: r.city.slug, place: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.city.slug]);

  const cfg = config.data;
  const cities = cfg?.cities ?? [];
  const citySlug = form.city ?? r?.city.slug ?? cfg?.defaults.city ?? '';
  const city = cities.find((c) => c.slug === citySlug);
  const household = (form.household as Household) ?? 'single';
  const housing = (form.housing as Housing) ?? (household === 'single' ? 'wg' : 'flat');
  const taxClass = form.taxClass ?? (household === 'single' ? '1' : '3');
  const range = (x: Range) => (x[0] === x[1] ? euro(x[0]) : `${euro(x[0])} – ${euro(x[1])}`);

  const shareUrl = r ? `${window.location.origin}${localePath('/budget')}?${r.share}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t('budget.actions.copied'));
    } catch {
      toast.error(t('budget.actions.copyFailed'));
    }
  };

  if (config.isLoading) return <Spinner className="mx-auto my-16 size-8" label={t('budget.result.loading')} />;
  if (!cfg) return <p className="card card-pad rounded-3xl text-center text-muted">{t('budget.result.error')}</p>;

  const cityGroups = [
    { label: t('budget.form.cities'), items: cities.filter((c) => c.kind === 'CITY') },
    { label: t('budget.form.other'), items: cities.filter((c) => c.kind === 'GENERIC') },
  ];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-10">
      {/* ─── Inputs ─── */}
      <form className="card card-pad space-y-5 rounded-3xl" onSubmit={(e) => e.preventDefault()} aria-labelledby={`${id}-form`}>
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${id}-form`} className="font-display text-lg font-semibold text-ink">
            {t('budget.form.title')}
          </h2>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-muted hover:text-ink"
            onClick={() => {
              setTouched(true);
              setForm({ ...(initial ?? {}) });
            }}
          >
            <RotateCcw className="size-4" aria-hidden /> {t('budget.form.reset')}
          </button>
        </div>
        {intro}

        <Labeled id={`${id}-city`} label={t('budget.form.city')}>
          <select id={`${id}-city`} className="input" value={citySlug} onChange={(e) => change({ city: e.target.value, place: undefined })}>
            {cityGroups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                    {c.state ? ` (${STATE_NAMES[c.state]})` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Labeled>
        {city?.kind === 'GENERIC' && (
          <Labeled id={`${id}-state`} label={t('budget.form.state')} hint={t('budget.form.stateHint')}>
            <select id={`${id}-state`} className="input" value={form.state ?? 'NW'} onChange={(e) => change({ state: e.target.value })} aria-describedby={`${id}-state-hint`}>
              {FEDERAL_STATES.map((s) => (
                <option key={s} value={s}>
                  {STATE_NAMES[s]}
                </option>
              ))}
            </select>
          </Labeled>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled id={`${id}-gross`} label={t('budget.form.gross')} hint={t('budget.form.grossHint')}>
            <input
              id={`${id}-gross`}
              className="input tabular-nums"
              inputMode="decimal"
              autoComplete="off"
              value={form.gross ?? String(cfg.defaults.gross)}
              onChange={(e) => change({ gross: e.target.value.replace(/[^\d.,]/g, '').replace(',', '.') })}
              aria-describedby={`${id}-gross-hint`}
            />
          </Labeled>
          <Labeled id={`${id}-visa`} label={t('budget.form.visa')} hint={t('budget.form.visaHint')}>
            <select id={`${id}-visa`} className="input" value={form.visa ?? ''} onChange={(e) => change({ visa: e.target.value || undefined, blocked: undefined })} aria-describedby={`${id}-visa-hint`}>
              <option value="">{t('budget.form.visaNone')}</option>
              {cfg.visas.map((v) => (
                <option key={v.slug} value={v.slug}>
                  {tr(v.title)} · {v.visaLabel}
                </option>
              ))}
            </select>
          </Labeled>
        </div>

        <Chips
          name={`${id}-household`}
          legend={t('budget.form.household')}
          value={household}
          onChange={(v) => change({ household: v, taxClass: undefined, housing: v !== 'single' && housing === 'wg' ? 'flat' : form.housing, children: v === 'family' ? (form.children ?? '1') : undefined })}
          options={(['single', 'couple', 'family'] as const).map((v) => ({ value: v, label: t(`budget.form.households.${v}`) }))}
        />
        {household === 'family' && (
          <Labeled id={`${id}-children`} label={t('budget.form.children')}>
            <select id={`${id}-children`} className="input" value={form.children ?? '1'} onChange={(e) => change({ children: e.target.value })}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Labeled>
        )}

        <Chips
          name={`${id}-housing`}
          legend={t('budget.form.housing')}
          value={housing}
          onChange={(v) => change({ housing: v })}
          hint={t(`budget.form.housingHint.${housing}`)}
          options={(['wg', 'flat', 'company'] as const).map((v) => ({ value: v, label: t(`budget.form.housings.${v}`) }))}
        />
        {housing === 'company' && (
          <Labeled id={`${id}-crent`} label={t('budget.form.companyRent')} hint={t('budget.form.companyRentHint')}>
            <input
              id={`${id}-crent`}
              className="input tabular-nums"
              inputMode="numeric"
              value={form.companyRent ?? ''}
              onChange={(e) => change({ companyRent: e.target.value.replace(/\D/g, '') || undefined })}
              aria-describedby={`${id}-crent-hint`}
            />
          </Labeled>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled id={`${id}-start`} label={t('budget.form.start')}>
            <input id={`${id}-start`} type="date" className="input" value={form.start ?? cfg.defaults.start} onChange={(e) => change({ start: e.target.value || undefined })} />
          </Labeled>
          <Labeled id={`${id}-arrival`} label={t('budget.form.arrival')} hint={t('budget.form.arrivalHint')}>
            <input id={`${id}-arrival`} type="date" className="input" value={form.arrival ?? ''} max={form.start ?? cfg.defaults.start} onChange={(e) => change({ arrival: e.target.value || undefined })} aria-describedby={`${id}-arrival-hint`} />
          </Labeled>
        </div>

        <details className="group rounded-2xl border border-line bg-sunken/60 p-4 open:bg-card">
          <summary className="flex min-h-8 cursor-pointer items-center text-sm font-semibold text-ink">{t('budget.form.more')}</summary>
          <div className="mt-4 space-y-4">
            <Chips
              name={`${id}-tax`}
              legend={t('budget.form.taxClass')}
              value={taxClass}
              onChange={(v) => change({ taxClass: v })}
              hint={t('budget.form.taxClassHint')}
              options={[
                { value: '1', label: 'I' },
                { value: '3', label: 'III' },
                { value: '4', label: 'IV' },
              ]}
            />
            <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
              <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={form.church === '1'} onChange={(e) => change({ church: e.target.checked ? '1' : undefined })} />
              <span>
                <span className="font-semibold">{t('budget.form.church')}</span>
                <span className="block text-xs text-muted">{t('budget.form.churchHint')}</span>
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Labeled id={`${id}-age`} label={t('budget.form.age')}>
                <input id={`${id}-age`} className="input tabular-nums" inputMode="numeric" value={form.age ?? '30'} onChange={(e) => change({ age: e.target.value.replace(/\D/g, '').slice(0, 2) || undefined })} />
              </Labeled>
              <Labeled id={`${id}-zusatz`} label={t('budget.form.zusatz')} hint={t('budget.form.zusatzHint', { value: (cfg.params.averageZusatzbeitrag * 100).toLocaleString(locale) })}>
                <input
                  id={`${id}-zusatz`}
                  className="input tabular-nums"
                  inputMode="decimal"
                  placeholder={(cfg.params.averageZusatzbeitrag * 100).toLocaleString(locale)}
                  value={form.zusatz ?? ''}
                  onChange={(e) => change({ zusatz: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') || undefined })}
                  aria-describedby={`${id}-zusatz-hint`}
                />
              </Labeled>
            </div>
          </div>
        </details>
      </form>

      {/* ─── Results ─── */}
      <div className="space-y-5" aria-live="polite" aria-busy={estimate.isFetching}>
        {estimate.isError && !r ? (
          <p className="card card-pad rounded-3xl text-center text-muted" role="alert">
            {t('budget.result.error')}
          </p>
        ) : !r ? (
          <Spinner className="mx-auto my-16 size-8" label={t('budget.result.loading')} />
        ) : (
          <div className={clsx('space-y-5 transition-opacity', estimate.isFetching && 'opacity-60')}>
            <Summary r={r} range={range} />
            <Warnings r={r} />
            <NetCard r={r} />
            <OneOffCard r={r} range={range} />
            <MonthlyCard r={r} range={range} />

            <div className="card card-pad flex flex-col gap-3 rounded-3xl sm:flex-row sm:flex-wrap">
              <a href={`/api/budget/pdf?${r.share}&lang=${locale}`} className={buttonClass({ className: 'flex-1' })} download>
                <Download className="size-4" aria-hidden /> {t('budget.actions.pdf')}
              </a>
              <Button variant="secondary" className="flex-1" icon={Link2} onClick={copy}>
                {t('budget.actions.share')}
              </Button>
              <Button variant="outline" className="flex-1" icon={PhoneCall} onClick={() => setConsultant(true)}>
                {t('budget.actions.consultant')}
              </Button>
            </div>
            <Disclaimer r={r} date={date} />
          </div>
        )}
      </div>

      <Modal open={consultant} onClose={() => setConsultant(false)} title={t('budget.actions.consultantTitle')} description={t('budget.actions.consultantText')}>
        <Suspense fallback={<Spinner className="mx-auto my-8 size-6" />}>
          {consultant && r && (
            <CallbackForm
              source={callbackSource}
              compact
              initialMessage={t('budget.actions.message', { city: r.city.name, gross: euro(r.input.gross), bring: euro(r.bring.recommended), link: shareUrl }).slice(0, 600)}
            />
          )}
        </Suspense>
        <p className="mt-4 text-center text-sm">
          <Link to="/booking" className="font-semibold text-link hover:underline">
            {t('budget.actions.booking')}
          </Link>
        </p>
      </Modal>
    </div>
  );
};

const Summary = ({ r, range }: { r: BudgetResult; range: (x: Range) => string }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const { euro, euroCents } = useMoney();
  const b = r.bring.blockedAccount;
  return (
    <div className="card card-pad rounded-3xl">
      <p className="eyebrow">{t('budget.result.bring')}</p>
      <p className="mt-2 flex items-center gap-3 font-display text-3xl font-semibold text-ink tabular-nums sm:text-4xl">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl chip-sage">
          <PiggyBank className="size-6" aria-hidden />
        </span>
        {euro(r.bring.recommended)}
      </p>
      <p className="mt-2 flex items-start gap-2 text-sm text-muted">
        <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {t('budget.result.bringSub', { date: date(r.timeline.firstPay), weeks: Math.round(r.timeline.weeksUntilPay) })} {t('budget.result.buffer', { amount: euro(r.bring.buffer) })}
        </span>
      </p>
      <div className="mt-4 rounded-2xl bg-sunken p-4 text-sm">
        {b ? (
          <>
            <p className="flex items-center gap-2 font-semibold text-ink">
              <ShieldCheck className="size-4 text-info" aria-hidden /> {t('budget.result.blockedTitle')}
            </p>
            <p className="mt-1 leading-relaxed text-muted">
              {t('budget.result.blockedText', { year: euro(b.year), monthly: euroCents(b.monthly), count: b.releasesBeforePay, released: euro(b.releasedBeforePay) })}
            </p>
            <p className="mt-2 font-semibold text-ink">{t('budget.result.blockedBesides', { amount: euro(b.cashBesides) })}</p>
          </>
        ) : (
          <p className="text-muted">{t('budget.result.noBlocked')}</p>
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-line p-3">
          <dt className="text-xs text-muted">{t('budget.result.net')}</dt>
          <dd className="mt-0.5 font-semibold text-ink tabular-nums">{euroCents(r.net.net)}</dd>
        </div>
        <div className="rounded-2xl border border-line p-3">
          <dt className="text-xs text-muted">{t('budget.result.remaining')}</dt>
          <dd className={clsx('mt-0.5 font-semibold tabular-nums', r.monthly.remaining[0] < 0 ? 'text-danger-fg' : 'text-ink')}>{range(r.monthly.remaining)}</dd>
        </div>
      </dl>
    </div>
  );
};

const Warnings = ({ r }: { r: BudgetResult }) => {
  const { t } = useTranslation();
  if (!r.warnings.length) return null;
  return (
    <ul className="space-y-2">
      {r.warnings.map((w) => (
        <li key={w} className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{t(`budget.result.warnings.${w}`, { defaultValue: w })}</span>
        </li>
      ))}
    </ul>
  );
};

const Row = ({ label, value, hint, strong, tone }: { label: ReactNode; value: string; hint?: string; strong?: boolean; tone?: 'danger' }) => (
  <div className={clsx('flex items-baseline justify-between gap-4 py-2', strong && 'font-semibold text-ink')}>
    <span className="min-w-0">
      <span className={strong ? 'text-ink' : 'text-ink/90'}>{label}</span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </span>
    <span className={clsx('shrink-0 text-right tabular-nums', tone === 'danger' ? 'text-danger-fg' : 'text-ink')}>{value}</span>
  </div>
);

const NetCard = ({ r }: { r: BudgetResult }) => {
  const { t, i18n } = useTranslation();
  const { euroCents } = useMoney();
  const n = r.net;
  const pct = (x: number) => (Math.round(x * 1000) / 10).toLocaleString(i18n.language);
  return (
    <section className="card card-pad rounded-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-ink">{t('budget.result.net')}</h3>
        <p className="font-display text-2xl font-semibold text-success-fg tabular-nums">
          {euroCents(n.net)} <span className="text-sm font-medium text-muted">{t('budget.result.perMonth')}</span>
        </p>
      </div>
      <details className="mt-3">
        <summary className="flex min-h-8 cursor-pointer items-center text-sm font-semibold text-link">{t('budget.result.netDetails')}</summary>
        <div className="mt-2 divide-y divide-line text-sm">
          <Row label={t('budget.result.gross')} value={euroCents(n.gross)} />
          <Row label={t('budget.result.incomeTax')} value={`− ${euroCents(n.incomeTax)}`} />
          {n.soli > 0 && <Row label={t('budget.result.soli')} value={`− ${euroCents(n.soli)}`} />}
          {n.churchTax > 0 && <Row label={t('budget.result.churchTax')} value={`− ${euroCents(n.churchTax)}`} />}
          <Row label={t('budget.result.pension')} value={`− ${euroCents(n.pension)}`} />
          <Row label={t('budget.result.unemployment')} value={`− ${euroCents(n.unemployment)}`} />
          <Row label={t('budget.result.health', { rate: pct(0.073 + n.zusatzbeitrag / 2) })} value={`− ${euroCents(n.health)}`} />
          <Row label={t('budget.result.care', { rate: pct(n.careRate) })} value={`− ${euroCents(n.care)}`} />
          <Row label={t('budget.result.net')} value={euroCents(n.net)} strong />
        </div>
      </details>
    </section>
  );
};

const OneOffCard = ({ r, range }: { r: BudgetResult; range: (x: Range) => string }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const items = r.oneOff.items.filter((l) => l.amount[1] > 0);
  const high = Math.max(1, r.oneOff.total[1]);
  const hint = (key: string, meta?: Record<string, number | string>) => (meta && HINT_KEYS.includes(key) ? t(`budget.result.oneOffHint.${key}`, meta) : undefined);
  return (
    <section className="card card-pad rounded-3xl">
      <h3 className="font-display text-lg font-semibold text-ink">{t('budget.result.oneOffTitle')}</h3>
      <p className="mt-1 text-sm text-muted">{t('budget.result.oneOffSub', { arrival: date(r.timeline.arrival), pay: date(r.timeline.firstPay), days: r.timeline.daysUntilPay })}</p>
      {/* Light CSS bar: share of each item in the high estimate. */}
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-sunken" role="img" aria-label={t('budget.result.chart')}>
        {items.map((l, i) => (
          <span key={l.key} className={SERIES[i % SERIES.length]} style={{ width: `${(l.amount[1] / high) * 100}%` }} title={t(`budget.result.oneOff.${l.key}`)} />
        ))}
      </div>
      <div className="mt-3 divide-y divide-line text-sm">
        {items.map((l, i) => (
          <Row
            key={l.key}
            label={
              <span className="inline-flex items-center gap-2">
                <span className={clsx('size-2.5 shrink-0 rounded-full', SERIES[i % SERIES.length])} aria-hidden />
                {t(`budget.result.oneOff.${l.key}`)}
              </span>
            }
            hint={hint(l.key, l.meta)}
            value={range(l.amount)}
          />
        ))}
        <Row label={t('budget.result.total')} value={range(r.oneOff.total)} strong />
      </div>
    </section>
  );
};

const MonthlyCard = ({ r, range }: { r: BudgetResult; range: (x: Range) => string }) => {
  const { t } = useTranslation();
  const { euroCents } = useMoney();
  const m = r.monthly;
  return (
    <section className="card card-pad rounded-3xl">
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <Wallet className="size-5 text-muted" aria-hidden /> {t('budget.result.monthlyTitle')}
      </h3>
      <div className="mt-3 divide-y divide-line text-sm">
        {m.items.map((l) => (
          <Row key={l.key} label={t(`budget.result.monthly.${l.key}`)} value={range(l.amount)} />
        ))}
        <Row label={t('budget.result.costs')} value={range(m.total)} strong />
        <Row label={t('budget.result.income', { kg: m.income.kindergeld ? t('budget.result.kindergeld') : '' })} value={euroCents(m.income.total)} strong />
        <Row label={t('budget.result.remaining')} value={range(m.remaining)} strong tone={m.remaining[0] < 0 ? 'danger' : undefined} />
      </div>
    </section>
  );
};

const Disclaimer = ({ r, date }: { r: BudgetResult; date: (iso: string) => string }) => {
  const { t } = useTranslation();
  const cfg = useBudgetConfig().data;
  const p = cfg?.params;
  const vars = {
    year: r.year,
    zusatz: p ? (p.averageZusatzbeitrag * 100).toFixed(1) : '2.9',
    arrivalDays: p?.arrivalDaysBeforeStart ?? 7,
    ticket: p?.deutschlandticket ?? 63,
    rundfunk: p?.rundfunk ?? 18.36,
    kindergeld: p?.kindergeld ?? 259,
  };
  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-2xl border border-line bg-sunken p-4 text-xs leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {t('budget.disclaimer', { year: r.year })} {t('budget.asOf', { date: date(r.city.checkedAt) })}
          {r.city.sourceNote ? ` · ${r.city.sourceNote}` : ''}
        </span>
      </p>
      <details className="rounded-2xl border border-line p-4 text-sm">
        <summary className="flex min-h-8 cursor-pointer items-center font-semibold text-ink">{t('budget.assumptions.title')}</summary>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i}>{t(`budget.assumptions.items.${i}`, vars)}</li>
          ))}
        </ul>
      </details>
    </div>
  );
};

export default BudgetCalculator;
