import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, CalendarCheck, CalendarClock, Compass, Info, Link2, Plane, UserPlus } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Germany } from '@/components/illustrations';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { EmailResult } from '@/components/tools/EmailResult';
import { registerCopy } from '@/i18n';
import { pagesWhenInGermany } from '@/i18n/pagesWhenInGermany';
import { localePath } from '@/lib/localeRouter';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  WHEN_DOCS,
  WHEN_EDUCATIONS,
  WHEN_GERMAN,
  WHEN_PROFESSIONS,
  WHEN_RECOGNITION,
  WHEN_ROUTES,
  durationUnit,
  useWhenEstimate,
  whenFromParams,
  whenToQuery,
  type WhenEstimate,
  type WhenForm,
  type WhenStageResult,
} from '@/components/whenInGermany/api';

registerCopy(pagesWhenInGermany);

const Chips = <T extends string>({ legend, name, value, options, onChange, cols = 'grid-cols-3', hint }: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
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

const useFormat = () => {
  const { t, i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  return useMemo(() => {
    const months = t('when.months', { returnObjects: true }) as unknown as string[];
    /** "2027-04" → "2027 aprel" (az) / "April 2027". Deterministic: no Intl (server and browser render the same). */
    const monthYear = (ym: string) => {
      const [y, m] = ym.split('-').map(Number);
      const name = Array.isArray(months) ? (months[m - 1] ?? '') : '';
      return lng === 'az' ? `${y} ${name}` : `${name} ${y}`;
    };
    const duration = (days: number) => {
      const u = durationUnit(days);
      return u ? t(`when.unit.${u.unit}`, { count: u.count }) : t('when.unit.lessWeek');
    };
    return { monthYear, duration };
  }, [t, lng]);
};

const BasisBadge = ({ s, minSample }: { s: WhenStageResult; minSample: number }) => {
  const { t } = useTranslation();
  if (s.basis === 'history')
    return (
      <span className="rounded-full border border-success-border bg-success-bg px-2 py-0.5 text-[11px] font-semibold text-success-fg" title={t(`when.basis.${s.level ?? 'all'}`)}>
        {t('when.basis.history', { n: s.sample ?? minSample })} · {t(`when.basis.${s.level ?? 'all'}`)}
      </span>
    );
  if (s.basis === 'estimate') return <span className="rounded-full border border-warning-border bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning-fg">{t('when.basis.estimate')}</span>;
  if (s.basis === 'cefr') return <span className="rounded-full border border-line bg-sunken px-2 py-0.5 text-[11px] font-semibold text-muted">{t('when.basis.cefr')}</span>;
  return null;
};

const pct = (n: number, scale: number) => `${Math.max(0, Math.min(100, (n / scale) * 100)).toFixed(2)}%`;

/** Horizontal timeline: per stage the possible range (earliest start → latest end) and the typical bar. */
const Timeline = ({ r }: { r: WhenEstimate }) => {
  const { t } = useTranslation();
  const { duration } = useFormat();
  const scale = Math.max(1, r.totalDays.max);
  return (
    <section aria-labelledby="when-tl-h" className="rounded-3xl border border-line bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="when-tl-h" className="font-display text-lg font-semibold text-ink">
          {t('when.timeline.title')}
        </h3>
        <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-full bg-primary" /> {t('when.timeline.legendTypical')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-full bg-primary/20" /> {t('when.timeline.legendRange')}
          </span>
        </div>
      </div>
      <ol className="mt-4 space-y-3" aria-label={t('when.timeline.aria')}>
        {r.stages.map((s) => {
          const skipped = s.basis === 'skipped';
          return (
            <li key={s.key} className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:items-center sm:gap-4">
              <div className="min-w-0">
                <p className={clsx('text-sm font-semibold', skipped ? 'text-muted line-through' : 'text-ink')}>{t(`when.stages.${s.key}.name`)}</p>
                <p className="text-xs text-muted tabular-nums">
                  {skipped ? (
                    t('when.timeline.skipped')
                  ) : (
                    <>
                      {t('when.timeline.typical', { value: duration(s.days.typical) })} · {t('when.timeline.range', { min: duration(s.days.min), max: duration(s.days.max) })}
                    </>
                  )}
                </p>
              </div>
              <div className="relative h-5 rounded-full bg-sunken" aria-hidden>
                {!skipped && (
                  <>
                    <span className="absolute inset-y-0 rounded-full bg-primary/20" style={{ left: pct(s.start.min, scale), width: pct(s.end.max - s.start.min, scale) }} />
                    <span className="absolute inset-y-1 rounded-full bg-primary" style={{ left: pct(s.start.typical, scale), width: pct(Math.max(s.end.typical - s.start.typical, scale * 0.006), scale) }} />
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex justify-between text-xs font-semibold text-muted sm:ml-[15rem]" aria-hidden>
        <span>{t('when.timeline.today')}</span>
        <span className="flex items-center gap-1">
          <Plane className="size-3.5" /> {t('when.timeline.arrival')}
        </span>
      </div>
    </section>
  );
};

const Result = ({ r, form }: { r: WhenEstimate; form: WhenForm }) => {
  const { t } = useTranslation();
  const { monthYear, duration } = useFormat();
  const [y, m] = r.arrival.typical.split('-').map(Number);
  const months = t('when.months', { returnObjects: true }) as unknown as string[];
  const when = t('when.result.when', { year: y, month: Array.isArray(months) ? months[m - 1] : '' });
  const routeName = t(`when.form.routes.${r.route}`);
  const note = t('when.bookingNote', {
    profession: t(`when.form.professions.${form.profession}`),
    german: t(`when.form.germanLevels.${form.german}`),
    documents: t(`when.form.docs.${form.documents}`),
    route: routeName,
    when,
  });
  const share = async () => {
    const q = whenToQuery(form);
    const url = `${window.location.origin}${localePath('/when-in-germany')}${q ? `?${q}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('when.actions.copied'));
    } catch {
      toast.error(t('when.actions.copyFailed'));
    }
  };
  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-primary/30 bg-card p-5 shadow-[var(--tv-shadow-raised)] sm:p-7" aria-live="polite">
        <p className="text-sm font-semibold text-muted">{t('when.result.lead')}</p>
        <p className="mt-1 flex items-center gap-3 font-display text-3xl font-semibold text-ink sm:text-4xl">
          <CalendarClock className="size-8 shrink-0 text-primary" aria-hidden /> {when}
        </p>
        <p className="mt-2 text-sm text-ink tabular-nums">{t('when.result.range', { min: monthYear(r.arrival.min), max: monthYear(r.arrival.max) })}</p>
        <p className="text-sm text-muted tabular-nums">{t('when.result.total', { typical: duration(r.totalDays.typical), min: duration(r.totalDays.min), max: duration(r.totalDays.max) })}</p>
        <ul className="mt-4 grid gap-1.5 text-sm text-ink sm:grid-cols-2">
          <li>
            {t('when.result.route', { route: routeName })}
            {r.routeAuto && <span className="text-muted"> ({t('when.result.routeAuto')})</span>}
          </li>
          <li>{t('when.result.level', { level: r.targetLevel })}</li>
          <li>
            {r.recognition.needed ? t('when.result.recognitionNeeded') : t('when.result.recognitionNot')}
            {r.recognition.inferred && <span className="text-muted"> ({t('when.result.inferred')})</span>}
          </li>
        </ul>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link to={r.visa ? `/register?visa=${encodeURIComponent(r.visa.slug)}` : '/register'} className={buttonClass({ size: 'lg' })}>
            <UserPlus className="size-4" aria-hidden /> {t('when.actions.start')}
          </Link>
          <Link to={`/booking?topic=candidate&note=${encodeURIComponent(note)}`} className={buttonClass({ variant: 'outline', size: 'lg' })}>
            <CalendarCheck className="size-4" aria-hidden /> {t('when.actions.booking')}
          </Link>
          <button type="button" className={buttonClass({ variant: 'ghost', size: 'lg' })} onClick={() => void share()}>
            <Link2 className="size-4" aria-hidden /> {t('when.actions.share')}
          </button>
        </div>
      </section>

      <EmailResult
        tool="when-in-germany"
        summary={[
          { label: t('when.timeline.arrival'), value: `${when} (${t('when.result.range', { min: monthYear(r.arrival.min), max: monthYear(r.arrival.max) })})` },
          { label: t('when.timeline.title'), value: t('when.result.total', { typical: duration(r.totalDays.typical), min: duration(r.totalDays.min), max: duration(r.totalDays.max) }) },
          { label: t('when.form.profession'), value: t(`when.form.professions.${form.profession}`) },
          { label: t('when.form.german'), value: t(`when.form.germanLevels.${form.german}`) },
          { label: t('when.form.documents'), value: t(`when.form.docs.${form.documents}`) },
          { label: t('when.form.route'), value: routeName },
          { label: t('when.form.recognition'), value: t(r.recognition.needed ? 'when.form.recognitions.yes' : 'when.form.recognitions.no') },
        ]}
      />

      <Timeline r={r} />

      <ul className="grid gap-2 sm:grid-cols-2">
        {r.stages.map((s) => (
          <li key={s.key} className={clsx('rounded-2xl border border-line p-3', s.basis === 'skipped' ? 'bg-sunken' : 'bg-card')}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink">{t(`when.stages.${s.key}.name`)}</p>
              <BasisBadge s={s} minSample={r.minSample} />
              {s.basis === 'skipped' && <span className="text-[11px] font-semibold text-muted">{t('when.basis.skipped')}</span>}
            </div>
            <p className="mt-1 text-xs leading-snug text-muted">{t(`when.stages.${s.key}.desc`)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * /when-in-germany — "When could I be in Germany?": the answers live in the URL (shareable; the bare URL shows the
 * default example), the estimate comes from GET /api/when-in-germany/estimate (case-history percentiles, server-side,
 * daily cache) and is server-rendered; every text and date is formatted without Intl so hydration matches.
 */
export default function WhenInGermanyPage() {
  const { t } = useTranslation();
  usePageTitle(t('when.heroTitle'));
  const [params, setParams] = useSearchParams();
  const form = useMemo(() => whenFromParams(params), [params]);
  const query = whenToQuery(form);
  const est = useWhenEstimate(query);
  const set = <K extends keyof WhenForm>(k: K, v: WhenForm[K]) => {
    const next = whenToQuery({ ...form, [k]: v });
    setParams(new URLSearchParams(next), { replace: true, preventScrollReset: true });
  };
  const opts = <T extends string>(list: readonly T[], prefix: string) => list.map((v) => ({ value: v, label: t(`${prefix}.${v}`) }));

  return (
    <>
      <PageHero title={t('when.heroTitle')} subtitle={t('when.heroSubtitle')} illustration={<Germany />} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
          <form className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5 lg:sticky lg:top-24" onSubmit={(e) => e.preventDefault()} aria-labelledby="when-form-h">
            <h2 id="when-form-h" className="font-display text-lg font-semibold text-ink">
              {t('when.form.title')}
            </h2>
            <div>
              <label htmlFor="when-profession" className="label">
                {t('when.form.profession')}
              </label>
              <select id="when-profession" className="input" value={form.profession} onChange={(e) => set('profession', e.target.value as WhenForm['profession'])}>
                {WHEN_PROFESSIONS.map((p) => (
                  <option key={p} value={p}>
                    {t(`when.form.professions.${p}`)}
                  </option>
                ))}
              </select>
            </div>
            <Chips legend={t('when.form.education')} name="when-education" value={form.education} options={opts(WHEN_EDUCATIONS, 'when.form.educations')} onChange={(v) => set('education', v)} />
            <Chips legend={t('when.form.german')} name="when-german" value={form.german} options={opts(WHEN_GERMAN, 'when.form.germanLevels')} onChange={(v) => set('german', v)} cols="grid-cols-5" />
            <Chips legend={t('when.form.documents')} name="when-docs" value={form.documents} options={opts(WHEN_DOCS, 'when.form.docs')} onChange={(v) => set('documents', v)} />
            <Chips
              legend={t('when.form.recognition')}
              name="when-recognition"
              value={form.recognition}
              options={opts(WHEN_RECOGNITION, 'when.form.recognitions')}
              onChange={(v) => set('recognition', v)}
              hint={t('when.form.recognitionHint')}
            />
            <div>
              <label htmlFor="when-route" className="label">
                {t('when.form.route')}
              </label>
              <select id="when-route" className="input" value={form.route} onChange={(e) => set('route', e.target.value as WhenForm['route'])}>
                {WHEN_ROUTES.map((r) => (
                  <option key={r} value={r}>
                    {t(`when.form.routes.${r}`)}
                  </option>
                ))}
              </select>
            </div>
            <Link to="/path-finder" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link hover:underline">
              <Compass className="size-4" aria-hidden /> {t('when.actions.pathFinder')} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </form>

          <div className="min-w-0">
            {est.data ? (
              <Result r={est.data} form={form} />
            ) : est.isError ? (
              <div className="rounded-2xl border border-danger-border bg-danger-bg p-4 text-sm text-danger-fg" role="alert">
                {t('when.result.error')}{' '}
                <button type="button" className="font-semibold underline" onClick={() => void est.refetch()}>
                  {t('when.result.retry')}
                </button>
              </div>
            ) : (
              <p className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted" role="status">
                <Spinner className="size-6 text-primary" /> {t('when.result.loading')}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="pb-12" aria-labelledby="when-method-h">
        <div className="container-x max-w-3xl space-y-3 text-sm leading-relaxed text-ink">
          <h2 id="when-method-h" className="font-display text-xl font-semibold">
            {t('when.method.title')}
          </h2>
          <p>{t('when.method.data', { n: est.data?.minSample ?? 10 })}</p>
          <p>
            {t('when.method.language')}{' '}
            <a href="https://www.goethe.de/ins/gb/en/sta/lon/kur/faq.html" className="font-semibold text-link hover:underline" target="_blank" rel="noopener noreferrer">
              {t('when.method.source')}
            </a>
          </p>
          {est.data && <p className="text-xs text-muted">{t('when.method.updated', { date: est.data.computedAt.slice(0, 10).split('-').reverse().join('.') })}</p>}
          <p className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-warning-fg" role="note">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('when.disclaimer')}
          </p>
        </div>
      </section>
      <RelatedGuides tool="/when-in-germany" />
    </>
  );
}
