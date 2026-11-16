import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Check, Globe2, ThumbsDown, ThumbsUp } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { registerCopy } from '@/i18n';
import { pagesCountryCompare } from '@/i18n/pagesCountryCompare';
import { usePageTitle } from '@/lib/usePageTitle';
import { formatEuro } from '@/lib/seoContent/types';
import {
  CELLS,
  COUNTRIES,
  COUNTRY_AS_OF,
  COUNTRY_FLAG,
  COUNTRY_SOURCES,
  CRITERIA,
  netOf,
  PAYMENTS,
  PRICE_LEVEL_YEAR,
  PROFESSIONS,
  SALARY,
  STRONG,
  UK_ELIGIBLE,
  yearlyOf,
  type Country,
  type Profession,
} from '@/lib/countryCompare/data';
import { Disclaimer, EstimateBadge, GlossaryLinks, Sources, ToolFaq, useFaq, useLng } from '@/components/tools/calc/CalcShared';

registerCopy(pagesCountryCompare);

const isProfession = (v: string | null): v is Profession => !!v && (PROFESSIONS as readonly string[]).includes(v);

/**
 * /germany-vs-other-countries — Germany vs Poland, Czechia, the UK and Austria for a worker from Azerbaijan:
 * a comparison table (countries can be switched off), salaries per profession (estimates) and an honest
 * strengths / weaknesses box. All facts and sources: lib/countryCompare/data.ts.
 */
export default function CountryComparePage() {
  const { t } = useTranslation();
  const lng = useLng();
  usePageTitle(t('countryCompare.heroTitle'));
  const faq = useFaq('countryCompare.faq');
  const [shown, setShown] = useState<Country[]>([...COUNTRIES]);
  const [params] = useSearchParams();
  const [profession, setProfession] = useState<Profession>(() => {
    const p = params.get('profession');
    return isProfession(p) ? p : 'driver';
  });
  const cols = useMemo(() => COUNTRIES.filter((c) => shown.includes(c)), [shown]);
  const toggle = (c: Country) => setShown((s) => (s.includes(c) ? (s.length > 2 ? s.filter((x) => x !== c) : s) : [...s, c]));
  const eur = (n: number) => formatEuro(n, lng);
  const strengths = t('countryCompare.strengths', { returnObjects: true }) as unknown;
  const weaknesses = t('countryCompare.weaknesses', { returnObjects: true }) as unknown;
  const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

  return (
    <>
      <PageHero title={t('countryCompare.heroTitle')} subtitle={t('countryCompare.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-6">
          <p className="max-w-3xl text-ink">{t('countryCompare.intro')}</p>

          <form className="grid gap-4 rounded-3xl border border-line bg-card p-4 sm:grid-cols-2 sm:p-5" onSubmit={(e) => e.preventDefault()}>
            <fieldset>
              <legend className="label">{t('countryCompare.pickCountries')}</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {COUNTRIES.map((c) => {
                  const on = shown.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(c)}
                      className={clsx(
                        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold',
                        on ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken',
                      )}
                    >
                      <span aria-hidden>{COUNTRY_FLAG[c]}</span> {t(`countryCompare.countries.${c}`)}
                      {on && <Check className="size-4" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div>
              <label htmlFor="cc-prof" className="label">
                {t('countryCompare.profession')}
              </label>
              <select id="cc-prof" className="input" value={profession} onChange={(e) => setProfession(e.target.value as Profession)}>
                {PROFESSIONS.map((p) => (
                  <option key={p} value={p}>
                    {t(`countryCompare.professions.${p}`)}
                  </option>
                ))}
              </select>
            </div>
          </form>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl font-semibold text-ink">{t('countryCompare.salaryTitle', { profession: t(`countryCompare.professions.${profession}`) })}</h2>
              <EstimateBadge />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {cols.map((c) => {
                const [lo, hi] = SALARY[profession][c];
                return (
                  <div key={c} className={clsx('rounded-2xl border bg-card p-4', c === 'de' ? 'border-primary' : 'border-line')}>
                    <p className="font-semibold text-ink">
                      <span aria-hidden>{COUNTRY_FLAG[c]}</span> {t(`countryCompare.countries.${c}`)}
                    </p>
                    <dl className="mt-2 space-y-1 text-sm">
                      <div>
                        <dt className="text-muted">{t('countryCompare.gross')}</dt>
                        <dd className="font-display text-lg font-semibold tabular-nums text-ink">
                          {eur(lo)} – {eur(hi)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">{t('countryCompare.net')}</dt>
                        <dd className="tabular-nums text-ink">
                          ≈ {eur(netOf(lo, c))} – {eur(netOf(hi, c))}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">{t('countryCompare.yearly')}</dt>
                        <dd className="tabular-nums text-ink">
                          {eur(yearlyOf(lo, c))} – {eur(yearlyOf(hi, c))}
                          {PAYMENTS[c] === 14 && <span className="block text-xs text-muted">{t('countryCompare.payments14')}</span>}
                        </dd>
                      </div>
                      {c === 'uk' && (
                        <div>
                          <dt className="text-muted">{t('countryCompare.ukEligibility')}</dt>
                          <dd className={clsx('font-semibold', UK_ELIGIBLE[profession] === 'yes' ? 'text-success-fg' : 'text-warning-fg')}>
                            {t(`countryCompare.eligible.${UK_ELIGIBLE[profession]}`)}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                );
              })}
            </div>
            <p className="text-xs leading-snug text-muted">{t('countryCompare.salaryNote')}</p>
          </div>

          <div className="space-y-2">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
              <Globe2 className="size-5 text-primary" aria-hidden /> {t('countryCompare.criterion')}
            </h2>
            <p className="text-xs text-muted">{t('countryCompare.strongLegend')}</p>
            <div className="overflow-x-auto rounded-3xl border border-line bg-card" tabIndex={0} role="region" aria-label={t('countryCompare.heroTitle')}>
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-sunken">
                    <th scope="col" className="sticky left-0 z-10 w-40 bg-sunken p-3 font-semibold text-ink">
                      {t('countryCompare.criterion')}
                    </th>
                    {cols.map((c) => (
                      <th key={c} scope="col" className="p-3 font-semibold text-ink">
                        <span aria-hidden>{COUNTRY_FLAG[c]}</span> {t(`countryCompare.countries.${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CRITERIA.map((k) => (
                    <tr key={k} className="border-b border-line align-top last:border-0">
                      <th scope="row" className="sticky left-0 z-10 bg-card p-3 font-semibold text-ink">
                        {t(`countryCompare.criteria.${k}`)}
                        {k === 'priceLevel' && <span className="block text-xs font-normal text-muted">Eurostat {PRICE_LEVEL_YEAR}</span>}
                      </th>
                      {cols.map((c) => {
                        const strong = STRONG[k]?.includes(c);
                        return (
                          <td key={c} className="p-2">
                            <div className={clsx('h-full rounded-xl p-2 leading-snug text-ink', strong && 'border-2 border-success-border bg-success-bg')}>{CELLS[k][c][lng]}</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs leading-snug text-muted">{t('countryCompare.schengenNote')}</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-success-border bg-success-bg p-4 sm:p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <ThumbsUp className="size-5 text-success-fg" aria-hidden /> {t('countryCompare.strengthsTitle')}
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                {list(strengths).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <ThumbsDown className="size-5 text-muted" aria-hidden /> {t('countryCompare.weaknessTitle')}
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                {list(weaknesses).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-3xl border border-primary bg-card p-5">
            <h2 className="font-display text-xl font-semibold text-ink">{t('countryCompare.ctaTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{t('countryCompare.ctaText')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/register" className={buttonClass({})}>
                {t('countryCompare.ctaRegister')}
              </Link>
              <Link to="/eligibility" className={buttonClass({ variant: 'outline' })}>
                {t('countryCompare.ctaEligibility')}
              </Link>
              <Link to="/salary-calculator" className={buttonClass({ variant: 'ghost' })}>
                {t('nav.salary')}
              </Link>
            </div>
          </div>

          <GlossaryLinks
            terms={[
              { slug: 'blaue-karte-eu', label: 'Blaue Karte EU' },
              { slug: 'niederlassungserlaubnis', label: 'Niederlassungserlaubnis' },
              { slug: 'einbuergerung', label: 'Einbürgerung' },
              { slug: 'anerkennung', label: 'Anerkennung' },
              { slug: 'familiennachzug', label: 'Familiennachzug' },
            ]}
          />
          <Disclaimer>{t('countryCompare.disclaimer')}</Disclaimer>
          <Sources checked={COUNTRY_AS_OF} items={COUNTRY_SOURCES} />
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/germany-vs-other-countries" />
    </>
  );
}
