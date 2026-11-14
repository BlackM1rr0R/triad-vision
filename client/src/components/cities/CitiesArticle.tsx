import { useMemo } from 'react';
import { ContentArticle, ContentTable, useContentLocale } from '@/components/seo/ContentArticle';
import { CITIES, DATA_YEAR, DEUTSCHLANDTICKET, cityBySlug, type Range } from '@/lib/cities/data';
import { flatRent, keyFigures } from '@/lib/cities/calc';
import { calculateSalary, DEFAULT_INPUT, FEDERAL_STATES, STATE_NAMES, type FederalState } from '@/lib/salary';
import { citiesContent } from '@/lib/seoContent/cities';
import { CONTENT_CHECKED, fill, formatEuro, MONTH_YEAR, type ContentLocale } from '@/lib/seoContent/types';

/** Example gross salary of the "what is left" column (a truck driver's typical start, tax class I). */
export const CITY_EXAMPLE_GROSS = 3_000;

/** "Bayern" → "BY" (city data stores the German state name; "—" for the small-town profile → Berlin rules). */
const stateCode = (name: string): FederalState => FEDERAL_STATES.find((s) => STATE_NAMES[s] === name) ?? 'BE';

const range = ([lo, hi]: Range, lng: ContentLocale) => {
  const [a, b] = [formatEuro(lo, lng), formatEuro(hi, lng)];
  // "943–1.317 €" / "€943–€1,317"
  return lng === 'en' ? `${a}–${b}` : `${a.replace(/\s€$/, '')}–${b}`;
};

const netIn = (state: FederalState) => calculateSalary({ ...DEFAULT_INPUT, gross: CITY_EXAMPLE_GROSS, period: 'month', taxClass: 1, state }).monthly.net;

/** Intro, cost table, jobs by city and FAQ under the city guide; every figure comes from the page's city data. */
export const CitiesArticle = () => {
  const lng = useContentLocale();
  const vars = useMemo(() => {
    const single = (slug: string) => range(keyFigures(cityBySlug(slug)!).single, lng);
    return {
      munich1: range(flatRent(cityBySlug('muenchen')!, 'room1'), lng),
      leipzig1: range(flatRent(cityBySlug('leipzig')!, 'room1'), lng),
      munichSingle: single('muenchen'),
      berlinSingle: single('berlin'),
      leipzigSingle: single('leipzig'),
      ticket: formatEuro(DEUTSCHLANDTICKET, lng),
      gross: formatEuro(CITY_EXAMPLE_GROSS, lng),
      year: String(DATA_YEAR),
      checked: MONTH_YEAR[lng](CONTENT_CHECKED.month, CONTENT_CHECKED.year),
    };
  }, [lng]);
  const l = citiesContent[lng].labels!;
  const nameOf = (slug: string) => {
    if (slug === 'small-town') return l.smallTown;
    const c = cityBySlug(slug)!;
    return (c.name as Record<string, string>)[lng] ?? c.name.en;
  };
  const rows = CITIES.map((c) => {
    const k = keyFigures(c);
    const net = netIn(stateCode(c.state));
    return [
      nameOf(c.slug),
      c.state,
      range(k.wg, lng),
      range(k.oneRoom, lng),
      range(k.single, lng),
      range([Math.round(net - k.single[1]), Math.round(net - k.single[0])], lng),
    ];
  });
  const head = [l.city, l.state, l.wg, l.flat, l.single, fill(l.left, { net: formatEuro(Math.round(netIn('BE')), lng) })];
  return <ContentArticle content={citiesContent} vars={vars} slots={{ costs: <ContentTable head={head} rows={rows} /> }} className="section border-t border-line" />;
};
