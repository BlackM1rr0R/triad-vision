import { DEFAULT_CITY_COSTS, matchCity, type CityCostData } from '../budget/cities.js';
import type { FederalState } from '../budget/params.js';
import type { CareerLocale } from './types.js';

/**
 * City pages (/cities/<slug>, e.g. /ru/cities/hamburg): "work and living costs in <city>" — the orientation cost
 * figures of the budget data plus our live vacancies in and around that city (matched by name and aliases, like the
 * budget prefill). The figures are the active CityCost rows of the database (Admin → Sayt → Şəhər xərcləri: the
 * same rows the budget calculator /budget reads, lib/budget/cities.ts activeCityCosts), loaded with the cached SEO
 * data (SeoData.cities, lib/seo.ts); while the table is empty or cannot be read, the seed defaults
 * (DEFAULT_CITY_COSTS, 2026). Either way they are shown as estimates ("Təxmini").
 *
 * A page exists only for a real city (kind CITY) that is a metropolis (METRO size class: Berlin, Hamburg, München,
 * Köln, Frankfurt) or has at least one live vacancy right now — no thin pages for places without anything of ours.
 * Texts are generated from the facts in the six career languages (az, ru, tr, en, de, uk).
 */

/** The seed rows of kind CITY: the fallback, and the default `rows` of the functions below. */
export const CITY_ROWS: readonly CityCostData[] = DEFAULT_CITY_COSTS.filter((r) => r.kind === 'CITY');

/**
 * City rows of the pages from the active CityCost rows (a table row also carries id and timestamps): their CITY rows
 * when the table gave any row, else the seed defaults (empty table, failed read, older fixtures without `cities`).
 */
export const cityRowsOf = (rows: readonly CityCostData[] | null | undefined): readonly CityCostData[] =>
  rows?.length ? rows.filter((r) => r.kind === 'CITY') : CITY_ROWS;

export const cityPagePath = (slug: string) => `/cities/${slug}`;

/** "/cities/hamburg" → "hamburg" (any slug shape; existence is checked against the data). */
export const cityPageSlug = (path: string) => /^\/cities\/([a-z0-9-]{2,60})$/.exec(path)?.[1] ?? null;

export const cityRow = (slug: string, rows: readonly CityCostData[] = CITY_ROWS) => rows.find((r) => r.slug === slug) ?? null;

/** City row of a vacancy place (name / alias), or null. */
export const cityOfPlace = (place: string | null | undefined, rows: readonly CityCostData[] = CITY_ROWS) => matchCity(rows, place)?.slug ?? null;

/** The given jobs located in (or around) the city. */
export const jobsInCity = <J extends { city: string | null }>(jobs: J[], slug: string, rows: readonly CityCostData[] = CITY_ROWS) =>
  jobs.filter((j) => cityOfPlace(j.city, rows) === slug);

/** Whether the city has a page: metropolis, or at least one live vacancy. */
export const hasCityPage = (slug: string, liveJobs: { city: string | null }[], rows: readonly CityCostData[] = CITY_ROWS) => {
  const row = cityRow(slug, rows);
  return !!row && (row.sizeClass === 'METRO' || jobsInCity(liveJobs, slug, rows).length > 0);
};

/** Every city with a page, metropolises first, then by number of vacancies. */
export const cityPages = (liveJobs: { city: string | null }[], rows: readonly CityCostData[] = CITY_ROWS) =>
  rows
    .map((r) => ({ row: r, jobs: jobsInCity(liveJobs, r.slug, rows).length }))
    .filter((c) => c.row.sizeClass === 'METRO' || c.jobs > 0)
    .sort((a, b) => Number(b.row.sizeClass === 'METRO') - Number(a.row.sizeClass === 'METRO') || b.jobs - a.jobs || a.row.sortOrder - b.row.sortOrder);

const STATE: Record<FederalState, string> = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
};
export const stateName = (code: string | null) => (code ? (STATE[code as FederalState] ?? null) : null);

const r = (a: number, b: number, lng: CareerLocale) => {
  const f = (n: number) => n.toLocaleString(lng === 'az' ? 'az-Latn-AZ' : lng, { maximumFractionDigits: 0 });
  return `${f(a)}–${f(b)} €`;
};

/** The first variant of 120–155 characters, else the longest one that fits 155 (no "…" in the snippet). */
const fitDescription = (variants: string[]) =>
  variants.find((v) => v.length >= 120 && v.length <= 155) ?? [...variants].filter((v) => v.length <= 155).sort((a, b) => b.length - a.length)[0] ?? variants[variants.length - 1];

export interface CityTexts {
  title: string;
  description: string;
  h1: string;
  intro: string;
  labels: {
    costs: string;
    flat1: string;
    flat2: string;
    wg: string;
    food: string;
    transport: string;
    estimate: string;
    source: string;
    jobs: string;
    jobsNone: string;
    landings: string;
    professions: string;
    tools: string;
    others: string;
  };
}

/** Title, description, H1, intro and labels of a city page, from its facts. */
export const cityTexts = (row: CityCostData, jobCount: number, lng: CareerLocale): CityTexts => {
  const n = row.name;
  const state = stateName(row.state) ?? '';
  const rent1 = r(row.flat1ColdMin, row.flat1ColdMax, lng);
  const wg = r(row.wgMin, row.wgMax, lng);
  const food = r(row.foodMin, row.foodMax, lng);
  switch (lng) {
    case 'az':
      return {
        title: `${n}: iş və həyat xərcləri 2026`,
        description: fitDescription([`${n} (${state}) şəhərində iş: ${jobCount ? `açıq vakansiya: ${jobCount}, ` : ''}1 otaqlı mənzil təxminən ${rent1} soyuq kirayə, WG otağı ${wg}, ərzaq ${food} ayda. Təxmini xərclər və iş imkanları.`, `${n} (${state}) şəhərində iş: ${jobCount ? `açıq vakansiya: ${jobCount}, ` : ''}1 otaqlı mənzil təxminən ${rent1} soyuq kirayə, WG otağı ${wg}, ərzaq ${food} ayda.`, `${n} (${state}) şəhərində iş: ${jobCount ? `açıq vakansiya: ${jobCount}, ` : ''}1 otaqlı mənzil təxminən ${rent1} soyuq kirayə, ərzaq ${food} ayda. Təxmini xərclər və iş imkanları.`, `${n} (${state}) şəhərində iş: ${jobCount ? `açıq vakansiya: ${jobCount}, ` : ''}1 otaqlı mənzil təxminən ${rent1} soyuq kirayə, ərzaq ${food} ayda.`]),
        h1: `${n}: Almaniyada iş və aylıq xərclər`,
        intro: `${n} ${state} əyalətindədir. Bu səhifədə şəhərdə kirayə, ərzaq və nəqliyyat üzrə təxmini aylıq xərcləri və Triad Vision vasitəsilə hazırda açıq olan vakansiyaları görürsünüz.`,
        labels: { costs: 'Təxmini aylıq xərclər', flat1: '1 otaqlı mənzil (35 m², soyuq kirayə)', flat2: '2 otaqlı mənzil (55 m², soyuq kirayə)', wg: 'WG otağı (hər şey daxil)', food: 'Ərzaq (1 nəfər)', transport: 'Deutschlandticket', estimate: 'Təxmini', source: 'Orientir dəyərlər (2026): kirayə indeksləri (Mietspiegel) və elan saytları, WG-Gesucht/MLP, Destatis qiymətləri. Təklif deyil.', jobs: `${n} və ətrafında açıq vakansiyalar`, jobsNone: 'Hazırda bu şəhərdə açıq vakansiyamız yoxdur. Bütün vakansiyalara baxın və ya bildiriş üçün yazılın.', landings: 'Peşələr üzrə vakansiyalar', professions: 'Peşələr üzrə bələdçilər', tools: 'Faydalı alətlər', others: 'Digər şəhərlər' },
      };
    case 'ru':
      return {
        title: `${n}: работа и стоимость жизни 2026`,
        description: fitDescription([`Работа в городе ${n} (${state}): ${jobCount ? `вакансий: ${jobCount}, ` : ''}аренда 1-комнатной квартиры около ${rent1}, комната в WG ${wg}, продукты ${food} в месяц. Ориентировочные расходы и вакансии.`, `Работа в городе ${n} (${state}): ${jobCount ? `вакансий: ${jobCount}, ` : ''}аренда 1-комнатной квартиры около ${rent1}, комната в WG ${wg}, продукты ${food} в месяц.`, `Работа в городе ${n} (${state}): ${jobCount ? `вакансий: ${jobCount}, ` : ''}аренда 1-комнатной квартиры около ${rent1}, продукты ${food} в месяц. Ориентировочные расходы и вакансии.`, `Работа в городе ${n} (${state}): ${jobCount ? `вакансий: ${jobCount}, ` : ''}аренда 1-комнатной квартиры около ${rent1}, продукты ${food} в месяц.`]),
        h1: `${n}: работа в Германии и расходы на жизнь`,
        intro: `${n} находится в земле ${state}. Здесь — ориентировочные ежемесячные расходы на аренду, продукты и транспорт и открытые сейчас вакансии через Triad Vision.`,
        labels: { costs: 'Ориентировочные расходы в месяц', flat1: '1-комнатная квартира (35 м², холодная аренда)', flat2: '2-комнатная квартира (55 м², холодная аренда)', wg: 'Комната в WG (всё включено)', food: 'Продукты (1 человек)', transport: 'Deutschlandticket', estimate: 'Ориентировочно', source: 'Ориентировочные значения 2026: индексы аренды (Mietspiegel) и порталы объявлений, WG-Gesucht/MLP, цены Destatis. Не оферта.', jobs: `Открытые вакансии: ${n} и окрестности`, jobsNone: 'Сейчас в этом городе нет открытых вакансий. Посмотрите все вакансии или подпишитесь на уведомления.', landings: 'Вакансии по профессиям', professions: 'Гиды по профессиям', tools: 'Полезные инструменты', others: 'Другие города' },
      };
    case 'tr':
      return {
        title: `${n}: iş ve yaşam maliyeti 2026`,
        description: fitDescription([`${n} (${state}) şehrinde iş: ${jobCount ? `açık ilan: ${jobCount}, ` : ''}1 odalı daire yaklaşık ${rent1} soğuk kira, WG odası ${wg}, market ${food} aylık. Yaklaşık giderler ve iş ilanları.`, `${n} (${state}) şehrinde iş: ${jobCount ? `açık ilan: ${jobCount}, ` : ''}1 odalı daire yaklaşık ${rent1} soğuk kira, WG odası ${wg}, market ${food} aylık.`, `${n} (${state}) şehrinde iş: ${jobCount ? `açık ilan: ${jobCount}, ` : ''}1 odalı daire yaklaşık ${rent1} soğuk kira, market ${food} aylık. Yaklaşık giderler ve iş ilanları.`, `${n} (${state}) şehrinde iş: ${jobCount ? `açık ilan: ${jobCount}, ` : ''}1 odalı daire yaklaşık ${rent1} soğuk kira, market ${food} aylık.`]),
        h1: `${n}: Almanya'da iş ve aylık giderler`,
        intro: `${n}, ${state} eyaletindedir. Bu sayfada şehirdeki kira, market ve ulaşım için yaklaşık aylık giderleri ve Triad Vision üzerinden şu an açık olan iş ilanlarını görürsünüz.`,
        labels: { costs: 'Yaklaşık aylık giderler', flat1: '1 odalı daire (35 m², soğuk kira)', flat2: '2 odalı daire (55 m², soğuk kira)', wg: 'WG odası (her şey dahil)', food: 'Market (1 kişi)', transport: 'Deutschlandticket', estimate: 'Yaklaşık', source: 'Referans değerler (2026): kira endeksleri (Mietspiegel) ve ilan portalları, WG-Gesucht/MLP, Destatis fiyatları. Teklif değildir.', jobs: `${n} ve çevresinde açık ilanlar`, jobsNone: 'Şu an bu şehirde açık ilanımız yok. Tüm ilanlara bakın veya bildirim için kaydolun.', landings: 'Mesleğe göre ilanlar', professions: 'Mesleğe göre rehberler', tools: 'Faydalı araçlar', others: 'Diğer şehirler' },
      };
    case 'en':
      return {
        title: `${n}: jobs and cost of living 2026`,
        description: fitDescription([`Working in ${n} (${state}): ${jobCount ? `open jobs: ${jobCount}, ` : ''}a 1-room flat costs about ${rent1} cold rent, a WG room ${wg}, groceries ${food} a month. Estimated costs and open jobs.`, `Working in ${n} (${state}): ${jobCount ? `open jobs: ${jobCount}, ` : ''}a 1-room flat costs about ${rent1} cold rent, a WG room ${wg}, groceries ${food} a month.`, `Working in ${n} (${state}): ${jobCount ? `open jobs: ${jobCount}, ` : ''}a 1-room flat costs about ${rent1} cold rent, groceries ${food} a month. Estimated costs and open jobs.`, `Working in ${n} (${state}): ${jobCount ? `open jobs: ${jobCount}, ` : ''}a 1-room flat costs about ${rent1} cold rent, groceries ${food} a month.`]),
        h1: `${n}: jobs in Germany and monthly costs`,
        intro: `${n} is in ${state}. This page shows estimated monthly costs for rent, groceries and transport, and the jobs currently open through Triad Vision.`,
        labels: { costs: 'Estimated monthly costs', flat1: '1-room flat (35 m², cold rent)', flat2: '2-room flat (55 m², cold rent)', wg: 'WG room (all-in)', food: 'Groceries (1 person)', transport: 'Deutschlandticket', estimate: 'Estimate', source: 'Orientation values 2026: rent indices (Mietspiegel) and listing portals, WG-Gesucht/MLP, Destatis prices. Not a quote.', jobs: `Open jobs in and around ${n}`, jobsNone: 'We have no open job in this city right now. See all jobs or sign up for alerts.', landings: 'Jobs by profession', professions: 'Guides by profession', tools: 'Useful tools', others: 'Other cities' },
      };
    case 'uk':
      return {
        title: `${n}: робота та вартість життя 2026`,
        description: fitDescription([`Робота в місті ${n} (${state}): ${jobCount ? `вакансій: ${jobCount}, ` : ''}оренда 1-кімнатної квартири близько ${rent1}, кімната в WG ${wg}, продукти ${food} на місяць. Орієнтовні витрати та вакансії.`, `Робота в місті ${n} (${state}): ${jobCount ? `вакансій: ${jobCount}, ` : ''}оренда 1-кімнатної квартири близько ${rent1}, кімната в WG ${wg}, продукти ${food} на місяць.`, `Робота в місті ${n} (${state}): ${jobCount ? `вакансій: ${jobCount}, ` : ''}оренда 1-кімнатної квартири близько ${rent1}, продукти ${food} на місяць. Орієнтовні витрати та вакансії.`, `Робота в місті ${n} (${state}): ${jobCount ? `вакансій: ${jobCount}, ` : ''}оренда 1-кімнатної квартири близько ${rent1}, продукти ${food} на місяць.`]),
        h1: `${n}: робота в Німеччині та витрати на життя`,
        intro: `${n} розташований у землі ${state}. Тут ви побачите орієнтовні щомісячні витрати на оренду, продукти й транспорт та вакансії, відкриті зараз через Triad Vision.`,
        labels: { costs: 'Орієнтовні витрати на місяць', flat1: '1-кімнатна квартира (35 м², холодна оренда)', flat2: '2-кімнатна квартира (55 м², холодна оренда)', wg: 'Кімната в WG (все включено)', food: 'Продукти (1 особа)', transport: 'Deutschlandticket', estimate: 'Орієнтовно', source: 'Орієнтовні значення 2026: індекси оренди (Mietspiegel) і портали оголошень, WG-Gesucht/MLP, ціни Destatis. Не є пропозицією.', jobs: `Відкриті вакансії в ${n} та околицях`, jobsNone: 'Наразі в цьому місті немає відкритих вакансій. Перегляньте всі вакансії або підпишіться на сповіщення.', landings: 'Вакансії за професіями', professions: 'Посібники за професіями', tools: 'Корисні інструменти', others: 'Інші міста' },
      };
    case 'de':
      return {
        title: `${n}: Arbeit und Lebenshaltungskosten 2026`,
        description: fitDescription([`Arbeiten in ${n} (${state}): ${jobCount ? `offene Stellen: ${jobCount}, ` : ''}1-Zimmer-Wohnung ca. ${rent1} kalt, WG-Zimmer ${wg}, Lebensmittel ${food} im Monat. Geschätzte Kosten und Stellen.`, `Arbeiten in ${n} (${state}): ${jobCount ? `offene Stellen: ${jobCount}, ` : ''}1-Zimmer-Wohnung ca. ${rent1} kalt, WG-Zimmer ${wg}, Lebensmittel ${food} im Monat.`, `Arbeiten in ${n} (${state}): ${jobCount ? `offene Stellen: ${jobCount}, ` : ''}1-Zimmer-Wohnung ca. ${rent1} kalt, Lebensmittel ${food} im Monat. Geschätzte Kosten und Stellen.`, `Arbeiten in ${n} (${state}): ${jobCount ? `offene Stellen: ${jobCount}, ` : ''}1-Zimmer-Wohnung ca. ${rent1} kalt, Lebensmittel ${food} im Monat.`]),
        h1: `${n}: Arbeit in Deutschland und Kosten`,
        intro: `${n} liegt in ${state}. Hier finden Sie geschätzte monatliche Kosten für Miete, Lebensmittel und Nahverkehr sowie die aktuell offenen Stellen über Triad Vision.`,
        labels: { costs: 'Geschätzte Kosten pro Monat', flat1: '1-Zimmer-Wohnung (35 m², Kaltmiete)', flat2: '2-Zimmer-Wohnung (55 m², Kaltmiete)', wg: 'WG-Zimmer (warm)', food: 'Lebensmittel (1 Person)', transport: 'Deutschlandticket', estimate: 'Schätzung', source: 'Orientierungswerte 2026: Mietspiegel und Immobilienportale, WG-Gesucht/MLP, Destatis-Preise. Kein Angebot.', jobs: `Offene Stellen in und um ${n}`, jobsNone: 'Aktuell keine offene Stelle in dieser Stadt. Alle Stellen ansehen oder Job-Alarm abonnieren.', landings: 'Stellen nach Beruf', professions: 'Ratgeber nach Beruf', tools: 'Nützliche Tools', others: 'Weitere Städte' },
      };
  }
};
