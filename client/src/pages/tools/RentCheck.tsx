import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Building, Home, Scale } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { registerCopy } from '@/i18n';
import { pagesRentCheck } from '@/i18n/pagesRentCheck';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import type { BudgetConfig } from '@/components/budget/api';
import { checkRent, RENT_CHECKED, type Condition, type RentInput } from '@/lib/publicCalc/rentCheck';
import { decimal, Disclaimer, dmy, EstimateBadge, GlossaryLinks, Manat, NumField, Sources, ToolFaq, useFaq, useLng, useMoney } from '@/components/tools/calc/CalcShared';

registerCopy(pagesRentCheck);

const SOURCES = [
  { label: '§ 556d BGB – Mietpreisbremse (zulässige Miete bei Mietbeginn)', url: 'https://www.gesetze-im-internet.de/bgb/__556d.html' },
  { label: '§ 556f BGB – Ausnahmen (Neubau, umfassende Modernisierung)', url: 'https://www.gesetze-im-internet.de/bgb/__556f.html' },
  { label: '§ 551 BGB – Mietkaution (max. 3 Nettokaltmieten)', url: 'https://www.gesetze-im-internet.de/bgb/__551.html' },
  { label: 'Deutscher Mieterbund – Mietpreisbremse bis 31.12.2029 verlängert', url: 'https://mieterbund.de/aktuelles/meldungen/verlaengerung-der-mietpreisbremse-beschlossen/' },
];

const CONDITIONS: Condition[] = ['newBuild', 'modernised', 'standard', 'basic'];
const VERDICT_STYLE = {
  cheap: 'border-success-border bg-success-bg',
  normal: 'border-success-border bg-success-bg',
  expensive: 'border-warning-border bg-warning-bg',
  veryExpensive: 'border-danger-border bg-danger-bg',
} as const;

/**
 * /rent-check — "Is this rent fair?": cold rent per m² against the typical new-contract range of the city
 * (CityCost table, GET /api/budget/config, admin-editable), Nebenkosten per m², Mietpreisbremse note.
 */
export default function RentCheckPage() {
  const { t } = useTranslation();
  usePageTitle(t('rentCheck.heroTitle'));
  const money = useMoney();
  const lng = useLng();
  const faq = useFaq('rentCheck.faq');
  const q = useQuery({ queryKey: ['rent-check-cities'], queryFn: async () => (await api.get<BudgetConfig>('/budget/config')).data, staleTime: 5 * 60 * 1000 });
  const cities = q.data?.cities ?? [];
  const [slug, setSlug] = useState('berlin');
  const [input, setInput] = useState<RentInput>({ sizeM2: 45, cold: 650, warm: 830, condition: 'standard' });
  const set = (patch: Partial<RentInput>) => setInput((i) => ({ ...i, ...patch }));
  const city = cities.find((c) => c.slug === slug) ?? cities[0];
  const r = useMemo(
    () => (city ? checkRent({ flat1Cold: city.flat1.cold, flat2Cold: city.flat2.cold, flat1Util: city.flat1.utilities, flat2Util: city.flat2.utilities }, input) : null),
    [city, input],
  );
  const perM2 = (n: number) => `${decimal(n, lng, 2)} €/m²`;

  return (
    <>
      <PageHero title={t('rentCheck.heroTitle')} subtitle={t('rentCheck.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
          <form className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5" onSubmit={(e) => e.preventDefault()} aria-labelledby="rc-form-h">
            <h2 id="rc-form-h" className="font-display text-lg font-semibold text-ink">
              {t('rentCheck.form.title')}
            </h2>
            <div>
              <label htmlFor="rc-city" className="label">
                {t('rentCheck.form.city')}
              </label>
              <select id="rc-city" className="input" value={city?.slug ?? slug} disabled={!cities.length} onChange={(e) => setSlug(e.target.value)}>
                {cities.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] leading-snug text-muted">{t('rentCheck.form.cityHint')}</p>
            </div>
            <NumField label={t('rentCheck.form.size')} value={input.sizeM2} min={8} max={400} suffix="m²" onChange={(v) => set({ sizeM2: v })} />
            <div className="grid grid-cols-2 gap-3">
              <NumField label={t('rentCheck.form.cold')} value={input.cold} max={20_000} suffix="€" onChange={(v) => set({ cold: v })} />
              <NumField label={t('rentCheck.form.warm')} value={input.warm} max={25_000} suffix="€" onChange={(v) => set({ warm: v })} />
            </div>
            <p className="-mt-2 text-[11px] leading-snug text-muted">{t('rentCheck.form.warmHint')}</p>
            <fieldset>
              <legend className="label">{t('rentCheck.form.condition')}</legend>
              <div className="grid gap-2">
                {CONDITIONS.map((c) => (
                  <label
                    key={c}
                    className={clsx(
                      'flex min-h-11 cursor-pointer items-center rounded-xl border px-3 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                      input.condition === c ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken',
                    )}
                  >
                    <input type="radio" className="sr-only" name="rc-condition" checked={input.condition === c} onChange={() => set({ condition: c })} />
                    {t(`rentCheck.conditions.${c}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          </form>

          <div className="min-w-0 space-y-4" aria-live="polite">
            {q.isError && <p className="rounded-2xl border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg">{t('rentCheck.loadError')}</p>}
            {r && city ? (
              <>
                <div className={clsx('rounded-3xl border p-5', VERDICT_STYLE[r.verdict])}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{t('rentCheck.result.title', { city: city.name })}</p>
                    <EstimateBadge />
                  </div>
                  <p className="mt-1 font-display text-3xl font-bold text-ink">{t(`rentCheck.verdict.${r.verdict}`)}</p>
                  <p className="mt-1 text-sm text-ink">{t(`rentCheck.verdictText.${r.verdict}`, { over: money(r.overTop) })}</p>
                </div>
                <dl className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-line bg-card p-3">
                    <dt className="text-xs text-muted">{t('rentCheck.result.yours')}</dt>
                    <dd className="font-display text-xl font-semibold text-ink tabular-nums">{perM2(r.coldPerM2)}</dd>
                  </div>
                  <div className="rounded-2xl border border-line bg-card p-3">
                    <dt className="text-xs text-muted">{t('rentCheck.result.typical')}</dt>
                    <dd className="font-display text-xl font-semibold text-ink tabular-nums">
                      {decimal(r.expectedPerM2[0], lng, 2)}–{perM2(r.expectedPerM2[1])}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-line bg-card p-3">
                    <dt className="text-xs text-muted">{t('rentCheck.result.typicalCold', { size: input.sizeM2 })}</dt>
                    <dd className="font-display text-xl font-semibold text-ink tabular-nums">
                      {money(r.expectedCold[0])} – {money(r.expectedCold[1])}
                    </dd>
                  </div>
                </dl>
                <RangeBar value={r.coldPerM2} range={r.expectedPerM2} label={t('rentCheck.result.bar')} />
                <Manat eur={input.warm > 0 ? input.warm : input.cold} />

                <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                  <h2 className="font-display text-lg font-semibold text-ink">{t('rentCheck.utilities.title')}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {t('rentCheck.utilities.typical', { from: decimal(r.utilitiesExpectedPerM2[0], lng, 2), to: decimal(r.utilitiesExpectedPerM2[1], lng, 2) })}
                  </p>
                  {r.utilitiesPerM2 != null && r.utilitiesVerdict ? (
                    <p className="mt-1 text-sm font-semibold text-ink">{t(`rentCheck.utilities.${r.utilitiesVerdict}`, { value: perM2(r.utilitiesPerM2) })}</p>
                  ) : (
                    <p className="mt-1 text-sm text-muted">{t('rentCheck.utilities.missing')}</p>
                  )}
                </div>

                <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                    <Scale className="size-5 text-primary" aria-hidden /> {t('rentCheck.bremse.title')}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{t('rentCheck.bremse.text')}</p>
                  {r.bremseException && <p className="mt-2 text-sm font-semibold text-warning-fg">{t('rentCheck.bremse.exception')}</p>}
                  <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-muted">
                    {(['mietspiegel', 'deposit', 'statement', 'index'] as const).map((k) => (
                      <li key={k} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                        <span>{t(`rentCheck.tips.${k}`)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-muted">{t('rentCheck.dataNote', { date: dmy(city.checkedAt) })}</p>
              </>
            ) : (
              !q.isError && <div className="h-48 animate-pulse rounded-3xl bg-sunken" aria-hidden />
            )}
            <GlossaryLinks
              terms={[
                { slug: 'kaltmiete', label: 'Kaltmiete' },
                { slug: 'warmmiete', label: 'Warmmiete' },
                { slug: 'nebenkosten', label: 'Nebenkosten' },
                { slug: 'mietspiegel', label: 'Mietspiegel' },
                { slug: 'mietpreisbremse', label: 'Mietpreisbremse' },
                { slug: 'kaution', label: 'Kaution' },
                { slug: 'indexmiete', label: 'Indexmiete' },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Link to="/cities" className={buttonClass({ variant: 'outline' })}>
                <Building className="size-4" aria-hidden /> {t('rentCheck.actions.cities')}
              </Link>
              <Link to="/budget" className={buttonClass({ variant: 'ghost' })}>
                <Home className="size-4" aria-hidden /> {t('rentCheck.actions.budget')}
              </Link>
            </div>
            <Disclaimer>{t('rentCheck.disclaimer')}</Disclaimer>
            <Sources checked={RENT_CHECKED} items={SOURCES} />
          </div>
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/rent-check" />
    </>
  );
}

/** Horizontal bar: the typical range (shaded) and the visitor's value (marker). */
const RangeBar = ({ value, range, label }: { value: number; range: readonly [number, number]; label: string }) => {
  const lo = range[0] * 0.6;
  const hi = range[1] * 1.4;
  const pos = (n: number) => `${Math.min(100, Math.max(0, ((n - lo) / (hi - lo)) * 100))}%`;
  return (
    <div className="rounded-2xl border border-line bg-card p-4" role="img" aria-label={label}>
      <div className="relative h-3 rounded-full bg-sunken">
        <div className="absolute inset-y-0 rounded-full bg-success-bg ring-1 ring-success-border" style={{ left: pos(range[0]), right: `calc(100% - ${pos(range[1])})` }} />
        <div className="absolute -top-1.5 h-6 w-1.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: pos(value) }} />
      </div>
    </div>
  );
};
