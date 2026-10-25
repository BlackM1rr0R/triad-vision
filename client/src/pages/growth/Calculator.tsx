import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarCheck, Info, Lightbulb } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';
import { CalendarDay } from '@/components/illustrations';
import { registerCopy } from '@/i18n';
import { pagesGrowthPlus } from '@/i18n/pagesGrowthPlus';
import { api } from '@/lib/api';
import { trackLead } from '@/lib/leadVisitor';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { monthRange, useCalcConfig, type DocState, type Estimate, type InputLevel, type Stage } from '@/components/growth/api';

registerCopy(pagesGrowthPlus);


const Chips = <T extends string>({
  legend,
  value,
  options,
  onChange,
  name,
  cols = 'grid-cols-2 sm:grid-cols-3',
}: {
  legend: string;
  value: T | null;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  name: string;
  cols?: string;
}) => (
  <fieldset>
    <legend className="label">{legend}</legend>
    <div className={clsx('grid gap-2', cols)}>
      {options.map((o) => (
        <label
          key={o.value}
          className={clsx(
            'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
            value === o.value ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
          )}
        >
          <input type="radio" className="sr-only" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  </fieldset>
);

const Timeline = ({ stages, total }: { stages: Stage[]; total: [number, number] }) => {
  const { t } = useTranslation();
  const span = Math.max(1, total[1]);
  const pct = (w: number) => `${(w / span) * 100}%`;
  return (
    <ol className="space-y-4">
      {stages.map((s) => {
        const weeks = s.weeks[0] === s.weeks[1] ? t('gp.common.weeksOne', { n: s.weeks[0] }) : t('gp.common.weeks', { min: s.weeks[0], max: s.weeks[1] });
        return (
          <li key={s.key} className={clsx(s.skipped && 'opacity-55')}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-ink">
                {t(`gp.calc.stages.${s.key}.name`)}
                {s.parallel && !s.skipped && <span className="ml-2 rounded-full chip-sky px-2 py-0.5 text-xs font-semibold">{t('gp.calc.parallel')}</span>}
              </span>
              <span className="text-xs font-semibold text-muted tabular-nums">{s.skipped ? t('gp.calc.skipped') : weeks}</span>
            </div>
            <div className="relative mt-1.5 h-3 overflow-hidden rounded-full bg-sunken" aria-hidden>
              {!s.skipped && (
                <>
                  {/* certain part (min scenario) */}
                  <span className="absolute inset-y-0 rounded-full bg-primary" style={{ left: pct(s.start[0]), width: pct(Math.max(0.4, s.end[0] - s.start[0])) }} />
                  {/* possible extension up to the max scenario */}
                  <span className="absolute inset-y-0 rounded-full bg-primary/25" style={{ left: pct(s.start[0]), width: pct(Math.max(0.4, s.end[1] - s.start[0])) }} />
                </>
              )}
            </div>
            {!s.skipped && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-snug text-muted">
                <Lightbulb className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
                <span>
                  <span className="sr-only">{t('gp.calc.speedUp')}: </span>
                  {t(`gp.calc.stages.${s.key}.tip`)}
                </span>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
};

export default function Calculator() {
  const { t } = useTranslation();
  const { tr, locale, date } = useL10n();
  usePageTitle(t('gp.calc.heroTitle'));
  const id = useId();
  const [params] = useSearchParams();
  const { data: config, isLoading } = useCalcConfig();
  const [visaId, setVisaId] = useState<string | null>(null);
  const [level, setLevel] = useState<InputLevel>('A0');
  const [docs, setDocs] = useState<DocState>('none');
  const [recognition, setRecognition] = useState<boolean | null>(null); // null = category default
  const [offer, setOffer] = useState(false);

  const categories = config?.categories ?? [];
  // ?visa=<slug> preselects (links from visa pages)
  useEffect(() => {
    if (visaId || !categories.length) return;
    const wanted = params.get('visa');
    const match = categories.find((c) => c.slug === wanted) ?? null;
    if (match) setVisaId(match.id);
  }, [categories, params, visaId]);

  const category = categories.find((c) => c.id === visaId) ?? null;
  const recognitionValue = recognition ?? category?.recognitionDefault ?? false;

  const query = useMemo(() => {
    if (!category) return null;
    const p = new URLSearchParams({ category: category.id, level, documents: docs, offer: offer ? '1' : '0' });
    if (recognition !== null) p.set('recognition', recognition ? '1' : '0');
    return p.toString();
  }, [category, level, docs, offer, recognition]);

  const { data: result, isFetching } = useQuery({
    queryKey: ['growth', 'estimate', query],
    queryFn: async () => (await api.get<Estimate>(`/growth/calculator/estimate?${query}`)).data,
    enabled: !!query,
    placeholderData: (prev) => prev,
    staleTime: 5 * 60 * 1000,
  });

  // lead scoring (analytics consent only): one event per visa the visitor calculates
  useEffect(() => {
    if (category) trackLead('start_calc');
  }, [category]);

  const yesNo = [
    { value: 'yes' as const, label: t('gp.common.yes') },
    { value: 'no' as const, label: t('gp.common.no') },
  ];

  return (
    <>
      <PageHero title={t('gp.calc.heroTitle')} subtitle={t('gp.calc.heroSubtitle')} illustration={<CalendarDay className="w-full" />} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x">
          {isLoading ? (
            <Spinner />
          ) : !config?.enabled ? (
            <p className="card card-pad rounded-3xl text-center text-muted">{t('gp.calc.disabled')}</p>
          ) : (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
              <form className="card card-pad space-y-6 rounded-3xl" onSubmit={(e) => e.preventDefault()} aria-labelledby={`${id}-form`}>
                <h2 id={`${id}-form`} className="font-display text-lg font-semibold text-ink">
                  {t('gp.calc.formTitle')}
                </h2>
                <Chips
                  name={`${id}-visa`}
                  legend={t('gp.calc.visa')}
                  value={visaId}
                  cols="grid-cols-1 sm:grid-cols-2"
                  onChange={(v) => {
                    setVisaId(v);
                    setRecognition(null);
                  }}
                  options={categories.map((c) => ({
                    value: c.id,
                    label: (
                      <span>
                        {tr(c.title)} <span className="font-normal opacity-75">· {c.visaLabel}</span>
                      </span>
                    ),
                  }))}
                />
                {category && (
                  <p className="-mt-3 text-xs text-muted">
                    {category.targetLevel ? t('gp.calc.target', { level: category.targetLevel }) : t('gp.calc.targetNone')}
                  </p>
                )}
                <Chips
                  name={`${id}-level`}
                  legend={t('gp.calc.level')}
                  value={level}
                  cols="grid-cols-3 sm:grid-cols-5"
                  onChange={setLevel}
                  options={(config.levels ?? []).map((l) => ({ value: l, label: t(`gp.calc.levelNames.${l}`) }))}
                />
                <Chips
                  name={`${id}-docs`}
                  legend={t('gp.calc.documents')}
                  value={docs}
                  cols="grid-cols-1 sm:grid-cols-3"
                  onChange={setDocs}
                  options={(config.documents ?? []).map((d) => ({ value: d, label: t(`gp.calc.docNames.${d}`) }))}
                />
                <div>
                  <Chips
                    name={`${id}-rec`}
                    legend={t('gp.calc.recognition')}
                    value={recognitionValue ? 'yes' : 'no'}
                    cols="grid-cols-2"
                    onChange={(v) => setRecognition(v === 'yes')}
                    options={yesNo}
                  />
                  {category && recognition === null && <p className="mt-1 text-xs text-muted">{t('gp.calc.recognitionAuto')}</p>}
                </div>
                <Chips name={`${id}-offer`} legend={t('gp.calc.offer')} value={offer ? 'yes' : 'no'} cols="grid-cols-2" onChange={(v) => setOffer(v === 'yes')} options={yesNo} />
              </form>

              <div className="space-y-5 lg:sticky lg:top-28" aria-live="polite">
                <div className="card card-pad rounded-3xl">
                  {!result || !category ? (
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <Info className="size-4 shrink-0" aria-hidden /> {t('gp.calc.pickVisa')}
                    </p>
                  ) : (
                    <div className={clsx('transition-opacity', isFetching && 'opacity-60')}>
                      <p className="eyebrow">{t('gp.calc.resultTitle')}</p>
                      <p className="mt-2 flex items-center gap-3 font-display text-3xl font-semibold text-ink sm:text-4xl">
                        <span className="grid size-12 shrink-0 place-items-center rounded-2xl chip-sage"><CalendarCheck className="size-6" aria-hidden /></span>
                        {monthRange(result.earliest, result.latest, locale)}
                      </p>
                      <p className="mt-1 text-sm text-muted">{t('gp.calc.total', { min: result.totalWeeks[0], max: result.totalWeeks[1] })}</p>
                      <h3 className="mt-6 mb-3 type-overline">{t('gp.calc.timeline')}</h3>
                      <Timeline stages={result.stages} total={result.totalWeeks} />
                    </div>
                  )}
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Link to="/booking" className={buttonClass({ size: 'lg', className: 'flex-1' })}>
                      {t('gp.calc.ctaBooking')} <ArrowRight className="size-4" aria-hidden />
                    </Link>
                    <Link to={category ? `/register?visa=${encodeURIComponent(category.slug)}` : '/register'} className={buttonClass({ variant: 'outline', size: 'lg', className: 'flex-1' })}>
                      {t('gp.calc.ctaApply')}
                    </Link>
                  </div>
                </div>
                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    {t('gp.calc.disclaimer')}
                    {config.verifiedAt && <> {t('gp.calc.verified', { date: date(config.verifiedAt) })}</>}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
