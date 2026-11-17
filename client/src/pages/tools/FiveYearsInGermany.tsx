import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, Download, Flag, GraduationCap, HandCoins, Heart, Home, Landmark, Link2, Plane, RotateCcw, ShieldCheck, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { useEurAzn } from '@/components/tools/AznEquivalent';
import { copyLink, downloadResultCard } from '@/components/games/shareCard';
import { Disclaimer, dmy, EstimateBadge, GlossaryLinks, NumField, Sources, ToolFaq, useFaq, useLng, useMoney } from '@/components/tools/calc/CalcShared';
import { registerCopy, toContentLocale } from '@/i18n';
import { pagesFiveYears } from '@/i18n/pagesFiveYears';
import { useBrand } from '@/lib/brand';
import { localePath } from '@/lib/localeRouter';
import { usePageTitle } from '@/lib/usePageTitle';
import { CITIES } from '@/lib/cities/data';
import { quickNetMonthly } from '@/lib/salary';
import { aznText, LIFESTYLES } from '@/lib/moneyHome/calc';
import { AZ_SECTOR_SOURCE, AZ_SECTOR_WAGE_YEAR, MONEY_HOME_AS_OF } from '@/lib/moneyHome/data';
import { FY_DEFAULTS, FY_GERMAN, FY_PERMITS, FY_PROFESSIONS, fiveYears, fyFromParams, fyToQuery, type FyInput, type FyMilestoneKey } from '@/lib/fiveYears/calc';

registerCopy(pagesFiveYears);

const PATH = '/five-years-in-germany';
const todayYm = () => new Date().toISOString().slice(0, 7);

const MS_ICON: Record<FyMilestoneKey, LucideIcon> = {
  arrival: Plane,
  probation: ShieldCheck,
  family: Heart,
  a2: GraduationCap,
  b1: GraduationCap,
  b2: GraduationCap,
  settlement: Home,
  citizenship: Flag,
};

const SOURCES = [
  { label: 'Bundesagentur für Arbeit – Entgeltatlas', url: 'https://web.arbeitsagentur.de/entgeltatlas/' },
  { label: 'gesetze-im-internet.de – § 18c AufenthG (Niederlassungserlaubnis)', url: 'https://www.gesetze-im-internet.de/aufenthg_2004/__18c.html' },
  { label: 'gesetze-im-internet.de – § 10 StAG (Einbürgerung)', url: 'https://www.gesetze-im-internet.de/stag/__10.html' },
  { label: 'gesetze-im-internet.de – § 622 BGB (Probezeit, Kündigungsfrist)', url: 'https://www.gesetze-im-internet.de/bgb/__622.html' },
  { label: 'Destatis – Verbraucherpreisindex (Inflation)', url: 'https://www.destatis.de/DE/Themen/Wirtschaft/Preise/Verbraucherpreisindex/_inhalt.html' },
  AZ_SECTOR_SOURCE,
  { label: 'stat.gov.az – labour market (average wage 2026)', url: 'https://www.stat.gov.az/source/labour/?lang=en' },
];

const Chips = <T extends string>({ legend, value, options, onChange, cols }: { legend: string; value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; cols: string }) => (
  <fieldset>
    <legend className="label">{legend}</legend>
    <div className={clsx('grid gap-2', cols)}>
      {options.map((o) => (
        <label
          key={o.value}
          className={clsx(
            'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-1.5 py-2 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
            value === o.value ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
          )}
        >
          <input type="radio" className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  </fieldset>
);

/**
 * /five-years-in-germany — 5-year "time machine": profession (path-finder reference salaries), city, German path and
 * start month → year-by-year salary, costs and savings (lib/fiveYears/calc.ts), the residence milestones of the
 * permanent-residence calculator and the same sector's average wage in Azerbaijan. Every assumption is a visible
 * control and lives in the URL (shareable); deterministic so the server-rendered page hydrates unchanged.
 */
export default function FiveYearsInGermanyPage() {
  const { t } = useTranslation();
  usePageTitle(t('fiveYears.heroTitle'));
  const lng = useLng();
  const money = useMoney();
  const brand = useBrand();
  const faq = useFaq('fiveYears.faq');
  const today = todayYm();
  const [params, setParams] = useSearchParams();
  const input = useMemo(() => fyFromParams(params, today), [params, today]);
  const r = useMemo(() => fiveYears(input, (g) => quickNetMonthly(g)), [input]);
  const rate = useEurAzn().data ?? null;
  const set = (patch: Partial<FyInput>) => setParams(new URLSearchParams(fyToQuery({ ...input, ...patch })), { replace: true, preventScrollReset: true });
  const resetAssumptions = () => set({ raise: FY_DEFAULTS.raise, inflation: FY_DEFAULTS.inflation, azGrowth: FY_DEFAULTS.azGrowth });

  const months = t('fiveYears.months', { returnObjects: true }) as unknown as string[];
  const monthYear = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    const name = Array.isArray(months) ? (months[m - 1] ?? '') : '';
    return lng === 'az' || lng === 'tr' ? `${y} ${name}` : `${name} ${y}`;
  };
  const last = r.years[r.years.length - 1];
  const totalAzn = rate ? Math.round(last.total * rate.rate) : null;
  const toAzn = (eur: number) => (rate ? Math.round(eur * rate.rate) : null);
  const maxCompare = Math.max(...r.years.map((y) => Math.max(toAzn(y.gross) ?? 0, y.azGross)), 1);
  const city = CITIES.find((c) => c.slug === input.city) ?? CITIES[0];
  const cityName = city.name[toContentLocale(lng)];
  const profession = t(`fiveYears.professions.${input.profession}`);
  const prQuery = new URLSearchParams({ permit: input.permit, german: 'b1', start: input.start }).toString();

  const share = async () => {
    const ok = await copyLink(`${window.location.origin}${localePath(PATH)}?${fyToQuery(input)}`);
    if (ok) toast.success(t('fiveYears.actions.copied'));
    else toast.error(t('fiveYears.actions.copyFailed'));
  };
  const card = async () => {
    try {
      await downloadResultCard({
        lead: t('fiveYears.card.lead', { profession, city: cityName }),
        big: money(last.total),
        sub: t('fiveYears.card.sub'),
        lines: [
          t('fiveYears.card.salary', { from: money(r.years[0].net), to: money(last.net) }),
          t('fiveYears.card.settlement', { date: monthYear(r.settlement) }),
          t('fiveYears.card.citizenship', { date: monthYear(r.citizenship) }),
          t('fiveYears.card.german', { level: t(`fiveYears.levels.${r.germanAtEnd}`) }),
        ],
        footer: t('fiveYears.card.footer', { domain: brand.domain, path: PATH }),
        filename: `five-years-${input.profession}-${input.city}`,
      });
    } catch {
      toast.error(t('fiveYears.actions.cardFailed'));
    }
  };

  return (
    <>
      <PageHero title={t('fiveYears.heroTitle')} subtitle={t('fiveYears.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
          <form className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5 lg:sticky lg:top-24" onSubmit={(e) => e.preventDefault()} aria-labelledby="fy-form-h">
            <h2 id="fy-form-h" className="font-display text-lg font-semibold text-ink">
              {t('fiveYears.form.title')}
            </h2>
            <div>
              <label htmlFor="fy-prof" className="label">
                {t('fiveYears.form.profession')}
              </label>
              <select id="fy-prof" className="input" value={input.profession} onChange={(e) => set({ profession: e.target.value as FyInput['profession'], permit: e.target.value === 'it' ? 'blueCard' : 'skilled' })}>
                {FY_PROFESSIONS.map((p) => (
                  <option key={p} value={p}>
                    {t(`fiveYears.professions.${p}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fy-city" className="label">
                {t('fiveYears.form.city')}
              </label>
              <select id="fy-city" className="input" value={input.city} onChange={(e) => set({ city: e.target.value })}>
                {CITIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name[toContentLocale(lng)]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fy-start" className="label">
                {t('fiveYears.form.start')}
              </label>
              <input id="fy-start" type="month" className="input" value={input.start} min="2024-01" max="2032-12" onChange={(e) => /^\d{4}-\d{2}$/.test(e.target.value) && set({ start: e.target.value })} />
            </div>
            <Chips legend={t('fiveYears.form.german')} value={input.german} options={FY_GERMAN.map((g) => ({ value: g, label: t(`fiveYears.levels.${g}`) }))} onChange={(german) => set({ german })} cols="grid-cols-5" />
            <NumField label={t('fiveYears.form.pace')} value={input.pace} min={3} max={18} onChange={(pace) => set({ pace: Math.round(pace) })} suffix={t('fiveYears.form.monthsShort')} hint={t('fiveYears.form.paceHint')} />
            <Chips legend={t('fiveYears.form.permit')} value={input.permit} options={FY_PERMITS.map((p) => ({ value: p, label: t(`fiveYears.permits.${p}`) }))} onChange={(permit) => set({ permit })} cols="grid-cols-2" />
            <Chips legend={t('fiveYears.form.style')} value={input.style} options={LIFESTYLES.map((s) => ({ value: s, label: t(`fiveYears.styles.${s}`) }))} onChange={(style) => set({ style })} cols="grid-cols-3" />

            <fieldset className="space-y-3 rounded-2xl border border-dashed border-line-strong p-3">
              <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-ink">
                <SlidersHorizontal className="size-4" aria-hidden /> {t('fiveYears.assumptions.title')}
              </legend>
              <NumField label={t('fiveYears.assumptions.raise')} value={input.raise} max={15} onChange={(raise) => set({ raise })} suffix="%" hint={t('fiveYears.assumptions.raiseHint')} />
              <NumField label={t('fiveYears.assumptions.inflation')} value={input.inflation} max={15} onChange={(inflation) => set({ inflation })} suffix="%" hint={t('fiveYears.assumptions.inflationHint')} />
              <NumField label={t('fiveYears.assumptions.az')} value={input.azGrowth} max={30} onChange={(azGrowth) => set({ azGrowth })} suffix="%" hint={t('fiveYears.assumptions.azHint')} />
              <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={resetAssumptions}>
                <RotateCcw className="size-4" aria-hidden /> {t('fiveYears.assumptions.reset')}
              </button>
            </fieldset>
          </form>

          <div className="min-w-0 space-y-4">
            <section className="rounded-3xl border border-primary/30 bg-card p-5 shadow-[var(--tv-shadow-raised)] sm:p-7" aria-live="polite" aria-labelledby="fy-sum-h">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="fy-sum-h" className="text-sm font-semibold text-muted">
                  {t('fiveYears.summary.lead', { profession, city: cityName, date: monthYear(input.start) })}
                </h2>
                <EstimateBadge />
              </div>
              <p className="mt-1 flex items-center gap-3 font-display text-4xl font-semibold text-ink sm:text-5xl">
                <HandCoins className="size-9 shrink-0 text-primary" aria-hidden />
                <AnimatedNumber value={last.total} format={(n) => money(Math.round(n))} />
              </p>
              <p className="mt-1 text-sm text-muted tabular-nums">
                {t('fiveYears.summary.saved', { real: money(last.totalReal) })}
                {totalAzn != null && <> · ≈ {aznText(totalAzn, lng)}</>}
              </p>
              <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                <li className="rounded-2xl border border-line bg-sunken p-3">
                  <p className="text-xs text-muted">{t('fiveYears.summary.net')}</p>
                  <p className="font-semibold text-ink tabular-nums">
                    {money(r.years[0].net)} → {money(last.net)}
                  </p>
                </li>
                <li className="rounded-2xl border border-line bg-sunken p-3">
                  <p className="text-xs text-muted">{t('fiveYears.milestones.settlement.title')}</p>
                  <p className="font-semibold text-ink">{monthYear(r.settlement)}</p>
                </li>
                <li className="rounded-2xl border border-line bg-sunken p-3">
                  <p className="text-xs text-muted">{t('fiveYears.milestones.citizenship.title')}</p>
                  <p className="font-semibold text-ink">{monthYear(r.citizenship)}</p>
                </li>
              </ul>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button type="button" className={buttonClass()} onClick={() => void card()}>
                  <Download className="size-4" aria-hidden /> {t('fiveYears.actions.card')}
                </button>
                <button type="button" className={buttonClass({ variant: 'outline' })} onClick={() => void share()}>
                  <Link2 className="size-4" aria-hidden /> {t('fiveYears.actions.share')}
                </button>
                <Link to={`/send-money-home?net=${r.years[0].net}&city=${input.city}&style=${input.style}`} className={buttonClass({ variant: 'ghost' })}>
                  <HandCoins className="size-4" aria-hidden /> {t('fiveYears.actions.moneyHome')} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </section>

            <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="fy-years-h">
              <h2 id="fy-years-h" className="font-display text-lg font-semibold text-ink">
                {t('fiveYears.years.title')}
              </h2>
              <ol className="mt-4 space-y-3">
                {r.years.map((y, i) => (
                  <li key={y.year} className="motion-safe:animate-[page-in_0.6s_ease-out_both] rounded-2xl border border-line p-3 sm:p-4" style={{ animationDelay: `${i * 120}ms` }}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-display text-base font-semibold text-ink">
                        {t('fiveYears.years.year', { n: y.year })} <span className="text-sm font-normal text-muted">· {monthYear(y.from)}</span>
                      </p>
                      <p className={clsx('text-sm font-semibold tabular-nums', y.saveMonth >= 0 ? 'text-success-fg' : 'text-danger-fg')}>{t('fiveYears.years.total', { amount: money(y.total) })}</p>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                      {(
                        [
                          ['gross', y.gross],
                          ['net', y.net],
                          ['costs', y.costs],
                          ['save', y.saveMonth],
                        ] as const
                      ).map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-xs text-muted">{t(`fiveYears.years.${k}`)}</dt>
                          <dd className="font-semibold text-ink tabular-nums">{money(v)}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 space-y-1" aria-hidden>
                      <div className="flex items-center gap-2 text-[11px] text-muted">
                        <span className="w-10 shrink-0 font-semibold">DE</span>
                        <span className="h-2.5 rounded-full bg-primary transition-[width] duration-700" style={{ width: `${(((toAzn(y.gross) ?? 0) / maxCompare) * 100).toFixed(1)}%` }} />
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted">
                        <span className="w-10 shrink-0 font-semibold">AZ</span>
                        <span className="h-2.5 rounded-full bg-warning-fg/70 transition-[width] duration-700" style={{ width: `${((y.azGross / maxCompare) * 100).toFixed(1)}%` }} />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted tabular-nums">
                      {t('fiveYears.years.compare', { de: toAzn(y.gross) != null ? aznText(toAzn(y.gross)!, lng) : money(y.gross), az: aznText(y.azGross, lng) })}
                    </p>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted">{t('fiveYears.years.note', { sector: t(`fiveYears.sectors.${r.azSector}`), year: AZ_SECTOR_WAGE_YEAR, rate: rate ? `${rate.rate} (${dmy(rate.date)})` : '—' })}</p>
            </section>

            <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="fy-ms-h">
              <h2 id="fy-ms-h" className="font-display text-lg font-semibold text-ink">
                {t('fiveYears.milestones.title')}
              </h2>
              <div className="relative mt-6 h-2 rounded-full bg-sunken" aria-hidden>
                {[12, 24, 36, 48].map((m) => (
                  <span key={m} className="absolute inset-y-0 w-px bg-line-strong" style={{ left: `${(m / 60) * 100}%` }} />
                ))}
                {r.milestones
                  .filter((m) => m.inside)
                  .map((m) => (
                    <span key={m.key} className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary" style={{ left: `${Math.min(100, (m.month / 60) * 100)}%` }} title={t(`fiveYears.milestones.${m.key}.title`)} />
                  ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] font-semibold text-muted" aria-hidden>
                {[0, 1, 2, 3, 4, 5].map((y) => (
                  <span key={y}>{y === 0 ? t('fiveYears.milestones.start') : t('fiveYears.milestones.yearShort', { n: y })}</span>
                ))}
              </div>
              <ol className="mt-5 space-y-3">
                {r.milestones.map((m) => {
                  const Icon = MS_ICON[m.key];
                  const link = m.key === 'family' ? '/family-reunification-check' : m.key === 'settlement' || m.key === 'citizenship' ? `/permanent-residence?${prQuery}` : m.key === 'b1' || m.key === 'a2' || m.key === 'b2' ? '/german-mock-exam' : null;
                  return (
                    <li key={m.key} className={clsx('flex gap-3', !m.inside && 'opacity-70')}>
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          {t(`fiveYears.milestones.${m.key}.title`)} · <span className="tabular-nums">{monthYear(m.ym)}</span>
                          {!m.inside && <span className="ml-1 text-xs font-normal text-muted">({t('fiveYears.milestones.after')})</span>}
                        </p>
                        <p className="text-xs leading-snug text-muted">
                          {t(`fiveYears.milestones.${m.key}.text`, { by: m.key === 'settlement' ? t(`fiveYears.milestones.by.${r.settlementBy}`) : m.key === 'citizenship' ? t(`fiveYears.milestones.by.${r.citizenshipBy}`) : '' })}
                        </p>
                        {link && (
                          <Link to={link} className="mt-0.5 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-link hover:underline">
                            {t(`fiveYears.milestones.link.${m.key === 'family' ? 'family' : m.key === 'settlement' || m.key === 'citizenship' ? 'pr' : 'german'}`)} <ArrowRight className="size-3.5" aria-hidden />
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <GlossaryLinks
              terms={[
                { slug: 'bruttolohn', label: 'Bruttolohn' },
                { slug: 'nettolohn', label: 'Nettolohn' },
                { slug: 'tarifvertrag', label: 'Tarifvertrag' },
                { slug: 'probezeit', label: 'Probezeit' },
                { slug: 'niederlassungserlaubnis', label: 'Niederlassungserlaubnis' },
                { slug: 'einbuergerung', label: 'Einbürgerung' },
                { slug: 'familiennachzug', label: 'Familiennachzug' },
                { slug: 'blaue-karte-eu', label: 'Blaue Karte EU' },
              ]}
            />
            <Sources checked={MONEY_HOME_AS_OF} items={SOURCES} />
            <Disclaimer>{t('fiveYears.disclaimer')}</Disclaimer>
            <p className="flex items-center gap-2 text-sm">
              <Landmark className="size-4 text-primary" aria-hidden />
              <Link to="/path-finder" className="font-semibold text-link hover:underline">
                {t('fiveYears.actions.pathFinder')}
              </Link>
            </p>
          </div>
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool={PATH} />
    </>
  );
}
