import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart3, Briefcase, Calculator, ExternalLink, IdCard, Lock, ShieldCheck } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { registerCopy } from '@/i18n';
import { pagesRealSalaries } from '@/i18n/pagesRealSalaries';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { Disclaimer, dmy, GlossaryLinks, Sources, ToolFaq, useFaq, useMoney } from '@/components/tools/calc/CalcShared';

registerCopy(pagesRealSalaries);

/** Shapes of GET /api/real-salaries (server/src/lib/realSalaries). */
type Band = '3-5' | '6-9' | '10+';
interface SalaryGroup {
  profession: string;
  city: string | null;
  state: string | null;
  p25: number;
  median: number;
  p75: number;
  band: Band;
}
export interface RealSalaryData {
  groups: SalaryGroup[];
  professionsCollecting: string[];
  hiddenGroups: number;
  workersBand: Band | null;
  month: string;
  computedAt: string;
  kMin: number;
}

/** Sources checked on this date (Entgeltatlas help page, MiLoG / Mindestlohnanpassungsverordnung). */
const CHECKED = '2026-11-16';
const ENTGELTATLAS = 'https://web.arbeitsagentur.de/entgeltatlas/';
const SOURCES = [
  { label: 'Bundesagentur für Arbeit – Entgeltatlas', url: ENTGELTATLAS },
  { label: 'Bundesagentur für Arbeit – Hilfe zum Entgeltatlas (Median, Vollzeit, Stichtag 31.12.)', url: 'https://www.arbeitsagentur.de/hilfe-entgeltatlas' },
  { label: 'Mindestlohngesetz (MiLoG)', url: 'https://www.gesetze-im-internet.de/milog/' },
];
/** Statutory minimum wage 2026 (€/h) × 40 h × 52 weeks / 12 months. */
const MIN_WAGE_MONTHLY = Math.round((13.9 * 40 * 52) / 12);

const STATES: Record<string, string> = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
};

export const useRealSalaries = () =>
  useQuery({ queryKey: ['real-salaries'], queryFn: async () => (await api.get<RealSalaryData>('/real-salaries')).data, staleTime: 10 * 60 * 1000 });

/**
 * /real-salaries — real salary database: P25 – P75 and median of the gross monthly salaries in the contracts of
 * workers we placed, by profession × city and profession nationwide. Only groups with ≥ 3 distinct workers and
 * no dominant value come from the server (monthly snapshot); empty state with the official statistics.
 */
export default function RealSalariesPage() {
  const { t } = useTranslation();
  usePageTitle(t('realSalaries.heroTitle'));
  const money = useMoney();
  const faq = useFaq('realSalaries.faq');
  const q = useRealSalaries();
  const [profession, setProfession] = useState('');
  const [city, setCity] = useState('');
  const data = q.data;
  const groups = data?.groups ?? [];
  const professions = useMemo(() => [...new Set(groups.map((g) => g.profession))], [groups]);
  const label = (p: string) => t(`realSalaries.profession.${p}`, { defaultValue: p });
  const shown = useMemo(() => {
    const c = city.trim().toLowerCase();
    return groups.filter((g) => (!profession || g.profession === profession) && (!c || (g.city ?? '').toLowerCase().includes(c)));
  }, [groups, profession, city]);
  // Common scale for the range bars of the visible rows.
  const [lo, hi] = useMemo(() => {
    if (!shown.length) return [0, 1];
    const min = Math.min(...shown.map((g) => g.p25));
    const max = Math.max(...shown.map((g) => g.p75));
    return [Math.max(0, min - 300), max + 300];
  }, [shown]);
  const pos = (n: number) => `${((n - lo) / (hi - lo)) * 100}%`;
  const place = (g: SalaryGroup) => g.city ?? t('realSalaries.table.germany');

  const official = (
    <div className="rounded-3xl border border-line bg-card p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <BarChart3 className="size-5 text-primary" aria-hidden /> {t('realSalaries.official.title')}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{t('realSalaries.official.entgeltatlas')}</p>
      <a href={ENTGELTATLAS} target="_blank" rel="noopener noreferrer" className={`${buttonClass({ variant: 'outline' })} mt-3`}>
        {t('realSalaries.official.entgeltatlasLink')} <ExternalLink className="size-4" aria-hidden />
      </a>
      <p className="mt-3 text-sm leading-relaxed text-muted">{t('realSalaries.official.minWage', { monthly: money(MIN_WAGE_MONTHLY) })}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{t('realSalaries.official.difference')}</p>
    </div>
  );

  return (
    <>
      <PageHero title={t('realSalaries.heroTitle')} subtitle={t('realSalaries.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-6">
          {q.isLoading && <div className="h-48 animate-pulse rounded-3xl bg-sunken" aria-hidden />}
          {data && !groups.length && (
            <div className="rounded-3xl border border-line bg-card p-6">
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <Lock className="size-5 text-primary" aria-hidden /> {t('realSalaries.empty.title')}
              </h2>
              <p className="mt-2 max-w-3xl leading-relaxed text-muted">{t('realSalaries.empty.text')}</p>
              {data.professionsCollecting.length > 0 && (
                <p className="mt-2 text-sm text-muted">{t('realSalaries.empty.collecting', { list: data.professionsCollecting.map(label).join(', ') })}</p>
              )}
              <p className="mt-4 text-sm font-semibold text-ink">{t('realSalaries.empty.compare')}</p>
            </div>
          )}
          {groups.length > 0 && (
            <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="label">{t('realSalaries.filters.profession')}</span>
                  <select className="input" value={profession} onChange={(e) => setProfession(e.target.value)}>
                    <option value="">{t('realSalaries.filters.all')}</option>
                    {professions.map((p) => (
                      <option key={p} value={p}>
                        {label(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">{t('realSalaries.filters.city')}</span>
                  <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder={t('realSalaries.filters.cityPlaceholder')} />
                </label>
              </div>
              {shown.length === 0 ? (
                <p className="mt-4 text-sm text-muted">{t('realSalaries.noMatch')}</p>
              ) : (
                <ul className="mt-4 divide-y divide-line">
                  {shown.map((g) => (
                    <li key={`${g.profession}|${g.city ?? ''}`} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-center sm:gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{label(g.profession)}</p>
                        <p className="text-sm text-muted">
                          {place(g)}
                          {g.state && STATES[g.state] && g.city !== STATES[g.state] ? ` · ${STATES[g.state]}` : ''}
                        </p>
                      </div>
                      <div
                        role="img"
                        aria-label={t('realSalaries.table.rangeLabel', { profession: label(g.profession), place: place(g), p25: money(g.p25), p75: money(g.p75), median: money(g.median) })}
                      >
                        <div className="relative h-3 rounded-full bg-sunken">
                          <div className="absolute inset-y-0 rounded-full bg-primary/30 ring-1 ring-primary/50" style={{ left: pos(g.p25), right: `calc(100% - ${pos(g.p75)})` }} />
                          <div className="absolute -top-1 h-5 w-1 -translate-x-1/2 rounded-full bg-primary" style={{ left: pos(g.median) }} />
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {money(g.p25)} – {money(g.p75)} · {t('realSalaries.table.median')} <span className="font-semibold text-ink">{money(g.median)}</span>
                        </p>
                      </div>
                      <p className="text-sm text-muted sm:text-right">
                        {t('realSalaries.table.sample')}: <span className="font-semibold text-ink">{t(`realSalaries.bands.${g.band}`)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted">{t('realSalaries.table.range')}</p>
              {data && data.hiddenGroups > 0 && <p className="mt-1 text-xs text-muted">{t('realSalaries.hidden')}</p>}
              {data?.workersBand && <p className="mt-1 text-xs text-muted">{t('realSalaries.workers', { band: t(`realSalaries.bands.${data.workersBand}`) })}</p>}
            </div>
          )}
          {data && <p className="text-xs text-muted">{t('realSalaries.asOf', { month: data.month, date: dmy(data.computedAt) })}</p>}

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            {official}
            <div className="rounded-3xl border border-line bg-card p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <ShieldCheck className="size-5 text-primary" aria-hidden /> {t('realSalaries.method.title')}
              </h2>
              <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-muted">
                {(t('realSalaries.method.items', { returnObjects: true }) as unknown as string[]).map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <GlossaryLinks
            terms={[
              { slug: 'bruttolohn', label: 'Bruttolohn' },
              { slug: 'nettolohn', label: 'Nettolohn' },
              { slug: 'mindestlohn', label: 'Mindestlohn' },
              { slug: 'tarifvertrag', label: 'Tarifvertrag' },
              { slug: 'arbeitsvertrag', label: 'Arbeitsvertrag' },
              { slug: 'blaue-karte-eu', label: 'Blaue Karte EU' },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Link to="/salary-calculator" className={buttonClass({ variant: 'outline' })}>
              <Calculator className="size-4" aria-hidden /> {t('realSalaries.actions.salaryCalc')}
            </Link>
            <Link to="/jobs" className={buttonClass({ variant: 'ghost' })}>
              <Briefcase className="size-4" aria-hidden /> {t('realSalaries.actions.jobs')}
            </Link>
            <Link to="/blue-card-check" className={buttonClass({ variant: 'ghost' })}>
              <IdCard className="size-4" aria-hidden /> {t('realSalaries.actions.blueCard')}
            </Link>
          </div>
          <Disclaimer>{t('realSalaries.disclaimer')}</Disclaimer>
          <Sources checked={CHECKED} items={SOURCES} />
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/real-salaries" />
    </>
  );
}
