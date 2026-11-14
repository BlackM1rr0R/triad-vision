import { canonicalProfession } from './matching.js';
import { professionLabel } from './jobAlerts/texts.js';
import { SITE_NAME, type SeoLocale } from './seoCatalogue.js';

/**
 * Profession × city landing pages: /jobs/in/<city>/<profession> (e.g. /de/jobs/in/hamburg/lkw-fahrer).
 *
 * Generated from the live vacancies only: a page exists while at least one open, published vacancy of that
 * profession is in that city — otherwise the URL answers 404 (no thin or empty pages) and leaves the sitemap.
 * The profession is the vacancy's canonical profession (lib/matching.ts: Vacancy.profession, else its title);
 * vacancies whose profession is not recognised or that have no city get no landing page.
 *
 * Every page has its own title, description, H1 and intro in the six site languages, built from its facts
 * (profession, city, federal state, number of vacancies, salary range, employment types) — the same path in
 * every language, so the hreflang set is all six languages (like the static pages). Structured data: an
 * ItemList of the vacancy URLs (each vacancy page carries its JobPosting; Google wants JobPosting only on the
 * page of the single job). Used by lib/seo.ts (head, status, sitemap), lib/seoBody.ts (crawler HTML) and
 * GET /api/vacancies/landing/:city/:profession (the page itself).
 */

/** URL segment of each canonical profession (German job titles, ASCII). */
export const PROFESSION_SLUGS: Record<string, string> = {
  truck_driver: 'lkw-fahrer',
  bus_driver: 'busfahrer',
  courier: 'kurierfahrer',
  nurse: 'pflegekraft',
  cook: 'koch',
  waiter: 'servicekraft',
  hotel: 'hotelfachkraft',
  baker: 'baecker',
  butcher: 'fleischer',
  welder: 'schweisser',
  construction_worker: 'bauarbeiter',
  electrician: 'elektriker',
  plumber: 'anlagenmechaniker-shk',
  mechanic: 'kfz-mechatroniker',
  carpenter: 'tischler',
  painter: 'maler',
  warehouse: 'lagerarbeiter',
  it: 'it-fachkraft',
  agriculture: 'erntehelfer',
  cleaner: 'reinigungskraft',
};
const PROFESSION_BY_SLUG = new Map(Object.entries(PROFESSION_SLUGS).map(([k, s]) => [s, k]));

/** Minimal vacancy shape (SeoData['jobs'] items satisfy it). */
export interface LandingJob {
  slug: string;
  title: unknown;
  city: string | null;
  profession?: string | null;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  publishedAt: Date | null;
  updatedAt: Date;
}

export interface JobLanding<J extends LandingJob = LandingJob> {
  /** City as written on the vacancies (most frequent spelling). */
  city: string;
  citySlug: string;
  /** Canonical profession key (lib/matching.ts). */
  profession: string;
  professionSlug: string;
  /** Path without language prefix. */
  path: string;
  /** Newest first. */
  jobs: J[];
  updatedAt: Date;
}

/** "Frankfurt am Main" → "frankfurt-am-main", "München" → "muenchen", "Hamburg (Altona)" → "hamburg". */
export const citySlug = (city: string) =>
  city
    .split(/[,(/]/)[0]
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const cityName = (city: string) => city.split(/[,(/]/)[0].trim();

/** Canonical profession of a vacancy: its profession field, else its title in any language. */
export const jobProfession = (job: Pick<LandingJob, 'profession' | 'title'>): string | null => {
  const direct = canonicalProfession(job.profession);
  if (direct) return direct;
  const title = job.title;
  if (typeof title === 'string') return canonicalProfession(title);
  if (!title || typeof title !== 'object') return null;
  const t = title as Record<string, unknown>;
  // German first (the employers' own job titles), then the other languages.
  for (const s of [t.de, t.en, t.az, t.ru, t.tr, t.uk, ...Object.values(t)]) {
    const key = typeof s === 'string' ? canonicalProfession(s) : null;
    if (key) return key;
  }
  return null;
};

const time = (d: Date | null) => d?.getTime() ?? 0;

/** Every landing page the given (live) vacancies make, most vacancies first. */
export const jobLandings = <J extends LandingJob>(jobs: J[]): JobLanding<J>[] => {
  const groups = new Map<string, { jobs: J[]; spellings: Map<string, number>; citySlug: string; profession: string }>();
  for (const job of jobs) {
    if (!job.city?.trim()) continue;
    const profession = jobProfession(job);
    if (!profession || !PROFESSION_SLUGS[profession]) continue;
    const cs = citySlug(job.city);
    if (!cs) continue;
    const id = `${cs}/${PROFESSION_SLUGS[profession]}`;
    const g = groups.get(id) ?? { jobs: [] as J[], spellings: new Map<string, number>(), citySlug: cs, profession };
    g.jobs.push(job);
    const name = cityName(job.city);
    g.spellings.set(name, (g.spellings.get(name) ?? 0) + 1);
    groups.set(id, g);
  }
  return [...groups.values()]
    .map((g) => {
      const sorted = [...g.jobs].sort((a, b) => time(b.publishedAt) - time(a.publishedAt) || a.slug.localeCompare(b.slug));
      const city = [...g.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      const professionSlug = PROFESSION_SLUGS[g.profession];
      return {
        city,
        citySlug: g.citySlug,
        profession: g.profession,
        professionSlug,
        path: jobLandingPath(g.citySlug, professionSlug),
        jobs: sorted,
        updatedAt: new Date(Math.max(...sorted.map((j) => j.updatedAt.getTime()))),
      };
    })
    .sort((a, b) => b.jobs.length - a.jobs.length || a.path.localeCompare(b.path));
};

export const jobLandingPath = (citySlugValue: string, professionSlug: string) => `/jobs/in/${citySlugValue}/${professionSlug}`;

/** "/jobs/in/hamburg/lkw-fahrer" → its parts, or null. */
export const parseJobLandingPath = (path: string) => {
  const m = /^\/jobs\/in\/([a-z0-9-]{1,60})\/([a-z0-9-]{1,60})$/.exec(path);
  return m && PROFESSION_BY_SLUG.has(m[2]) ? { citySlug: m[1], professionSlug: m[2] } : null;
};

export const findJobLanding = <J extends LandingJob>(jobs: J[], citySlugValue: string, professionSlug: string) =>
  jobLandings(jobs).find((l) => l.citySlug === citySlugValue && l.professionSlug === professionSlug) ?? null;

/** The landing page a vacancy belongs to (for the link on the vacancy page), or null. */
export const landingOfJob = <J extends LandingJob>(jobs: J[], job: Pick<LandingJob, 'city' | 'profession' | 'title'>) => {
  const profession = jobProfession(job);
  if (!job.city || !profession || !PROFESSION_SLUGS[profession]) return null;
  return findJobLanding(jobs, citySlug(job.city), PROFESSION_SLUGS[profession]);
};

// ─── texts ────────────────────────────────────────────────────────────

/** City names in the languages that write them differently (else the German name is used). */
const CITY_NAMES: Record<string, Partial<Record<SeoLocale, string>>> = {
  berlin: { ru: 'Берлин', uk: 'Берлін' },
  hamburg: { ru: 'Гамбург', uk: 'Гамбург' },
  muenchen: { en: 'Munich', ru: 'Мюнхен', uk: 'Мюнхен', tr: 'Münih', az: 'Münhen' },
  koeln: { en: 'Cologne', ru: 'Кёльн', uk: 'Кельн' },
  'frankfurt-am-main': { ru: 'Франкфурт-на-Майне', uk: 'Франкфурт-на-Майні' },
  frankfurt: { ru: 'Франкфурт', uk: 'Франкфурт' },
  stuttgart: { ru: 'Штутгарт', uk: 'Штутгарт' },
  duesseldorf: { ru: 'Дюссельдорф', uk: 'Дюссельдорф' },
  leipzig: { ru: 'Лейпциг', uk: 'Лейпциг' },
  dortmund: { ru: 'Дортмунд', uk: 'Дортмунд' },
  essen: { ru: 'Эссен', uk: 'Ессен' },
  bremen: { ru: 'Бремен', uk: 'Бремен' },
  dresden: { ru: 'Дрезден', uk: 'Дрезден' },
  hannover: { en: 'Hanover', ru: 'Ганновер', uk: 'Ганновер' },
  nuernberg: { en: 'Nuremberg', ru: 'Нюрнберг', uk: 'Нюрнберг', tr: 'Nürnberg', az: 'Nürnberq' },
  duisburg: { ru: 'Дуйсбург', uk: 'Дуйсбург' },
  bochum: { ru: 'Бохум', uk: 'Бохум' },
  bielefeld: { ru: 'Билефельд', uk: 'Білефельд' },
  bonn: { ru: 'Бонн', uk: 'Бонн' },
  mannheim: { ru: 'Мангейм', uk: 'Мангайм' },
  karlsruhe: { ru: 'Карлсруэ', uk: 'Карлсруе' },
  augsburg: { ru: 'Аугсбург', uk: 'Аугсбург' },
  kassel: { ru: 'Кассель', uk: 'Кассель' },
  wiesbaden: { ru: 'Висбаден', uk: 'Вісбаден' },
  mainz: { ru: 'Майнц', uk: 'Майнц' },
  kiel: { ru: 'Киль', uk: 'Кіль' },
  magdeburg: { ru: 'Магдебург', uk: 'Магдебург' },
  erfurt: { ru: 'Эрфурт', uk: 'Ерфурт' },
  rostock: { ru: 'Росток', uk: 'Росток' },
  potsdam: { ru: 'Потсдам', uk: 'Потсдам' },
  freiburg: { ru: 'Фрайбург', uk: 'Фрайбург' },
};

export const localCityName = (l: Pick<JobLanding, 'city' | 'citySlug'>, lng: SeoLocale) => CITY_NAMES[l.citySlug]?.[lng] ?? l.city;

const LOCALE_TAG: Record<SeoLocale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU', tr: 'tr-TR', uk: 'uk-UA' };

const lowerFirst = (s: string, lng: SeoLocale) =>
  // German nouns stay capitalised; acronyms (IT-…, BT …) too.
  lng === 'de' || /^\p{Lu}{2}/u.test(s) ? s : s.charAt(0).toLocaleLowerCase(LOCALE_TAG[lng]) + s.slice(1);

const plural = (n: number, lng: SeoLocale, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }) =>
  forms[new Intl.PluralRules(LOCALE_TAG[lng]).select(n)] ?? forms.other;

const vacancyWord: Record<SeoLocale, (n: number) => string> = {
  az: () => 'açıq vakansiya',
  de: (n) => (n === 1 ? 'offene Stelle' : 'offene Stellen'),
  en: (n) => (n === 1 ? 'open job' : 'open jobs'),
  ru: (n) => plural(n, 'ru', { one: 'открытая вакансия', few: 'открытые вакансии', other: 'открытых вакансий' }),
  tr: () => 'açık ilan',
  uk: (n) => plural(n, 'uk', { one: 'відкрита вакансія', few: 'відкриті вакансії', other: 'відкритих вакансій' }),
};

const EMPLOYMENT: Record<SeoLocale, Record<string, string>> = {
  az: { FULL_TIME: 'tam ştat', PART_TIME: 'yarımştat', SEASONAL: 'mövsümi', AUSBILDUNG: 'Ausbildung (peşə təhsili)' },
  de: { FULL_TIME: 'Vollzeit', PART_TIME: 'Teilzeit', SEASONAL: 'Saisonarbeit', AUSBILDUNG: 'Ausbildung' },
  en: { FULL_TIME: 'full-time', PART_TIME: 'part-time', SEASONAL: 'seasonal', AUSBILDUNG: 'Ausbildung (vocational training)' },
  ru: { FULL_TIME: 'полная занятость', PART_TIME: 'частичная занятость', SEASONAL: 'сезонная работа', AUSBILDUNG: 'Ausbildung (профобучение)' },
  tr: { FULL_TIME: 'tam zamanlı', PART_TIME: 'yarı zamanlı', SEASONAL: 'sezonluk', AUSBILDUNG: 'Ausbildung (mesleki eğitim)' },
  uk: { FULL_TIME: 'повна зайнятість', PART_TIME: 'часткова зайнятість', SEASONAL: 'сезонна робота', AUSBILDUNG: 'Ausbildung (профнавчання)' },
};

export interface JobLandingTexts {
  h1: string;
  /** <title> (with the site name when it fits 60 characters). */
  title: string;
  /** Meta description, ≤ 155 characters. */
  description: string;
  /** Intro paragraphs (plain text). */
  intro: string[];
  /** Localised city name. */
  cityName: string;
  professionName: string;
  /** Short link text for this page from elsewhere ("LKW-Fahrer/in Jobs in Hamburg (3)"). */
  linkLabel: string;
  labels: { jobs: string; sameCity: string; sameProfession: string; allJobs: string; cta: string };
}

const fmt = (n: number, lng: SeoLocale) => n.toLocaleString(LOCALE_TAG[lng]);

const salaryRange = (jobs: LandingJob[]) => {
  const lows = jobs.map((j) => j.salaryMin ?? j.salaryMax).filter((x): x is number => x != null && x > 0);
  const highs = jobs.map((j) => j.salaryMax ?? j.salaryMin).filter((x): x is number => x != null && x > 0);
  if (!lows.length) return null;
  return { min: Math.min(...lows), max: Math.max(...highs) };
};

const fitTitle = (h1: string, withCount: string) => {
  const suffix = ` | ${SITE_NAME}`;
  if (`${withCount}${suffix}`.length <= 60) return `${withCount}${suffix}`;
  if (`${h1}${suffix}`.length <= 60) return `${h1}${suffix}`;
  return h1.length <= 60 ? h1 : `${h1.slice(0, 59).replace(/\s+\S*$/, '')}…`;
};

const fitDescription = (parts: string[]) => {
  let out = '';
  for (const p of parts) {
    if (!p) continue;
    const next = out ? `${out} ${p}` : p;
    if (next.length > 155) break;
    out = next;
  }
  return out;
};

/** Title, description, H1 and intro of a landing page in one language. */
export const jobLandingTexts = (l: JobLanding, lng: SeoLocale, region: string | null): JobLandingTexts => {
  const n = l.jobs.length;
  const prof = professionLabel(l.profession, lng);
  const p = lowerFirst(prof, lng);
  const city = localCityName(l, lng);
  const salary = salaryRange(l.jobs);
  const s = salary ? (salary.min === salary.max ? fmt(salary.min, lng) : `${fmt(salary.min, lng)}–${fmt(salary.max, lng)}`) : null;
  const types = [...new Set(l.jobs.map((j) => EMPLOYMENT[lng][j.employmentType]).filter(Boolean))];
  const count = `${n} ${vacancyWord[lng](n)}`;
  const inRegion = region && region !== l.city ? region : null;

  switch (lng) {
    case 'az': {
      const h1 = `${city} şəhərində ${p} işi`;
      return {
        h1,
        title: fitTitle(h1, `${h1}: ${count}`),
        description: fitDescription([
          `Almaniya, ${city}${inRegion ? ` (${inRegion})` : ''}: ${p} üçün ${count}.`,
          s ? `Maaş ayda ${s} € brutto.` : '',
          'İş vizası və köçmə üzrə Triad Vision dəstəyi — onlayn müraciət edin.',
        ]),
        intro: [
          `${city} şəhərində${inRegion ? ` (${inRegion} federal əyaləti)` : ''} hazırda ${p} üçün ${count} var${types.length ? ` (${types.join(', ')})` : ''}.${s ? ` Elanlarda göstərilən maaş ayda ${s} € brutto təşkil edir.` : ''} Bütün vakansiyalar Almaniya işəgötürənlərindəndir və Triad Vision vasitəsilə yerləşdirilir.`,
          `Uyğun vakansiyanı seçin və onlayn müraciət edin: sənədlərin hazırlanması, iş vizası (Federal Əmək Agentliyinin razılığı daxil), səfirliyin tələb etdiyi tam sənəd paketi və Almaniyada ilk addımlar üzrə sizi müşayiət edirik. Vakansiyalar bağlandıqda bu siyahı avtomatik yenilənir.`,
        ],
        cityName: city,
        professionName: prof,
        linkLabel: `${city}: ${p} işi (${n})`,
        labels: { jobs: 'Açıq vakansiyalar', sameCity: `${city} şəhərində digər peşələr`, sameProfession: `${prof}: digər şəhərlər`, allJobs: 'Bütün vakansiyalar', cta: 'Pulsuz məsləhət' },
      };
    }
    case 'de': {
      const h1 = `${prof} Jobs in ${city}`;
      return {
        h1,
        title: fitTitle(h1, `${h1}: ${count}`),
        description: fitDescription([
          `${count} als ${prof} in ${city}${inRegion ? ` (${inRegion})` : ''}.`,
          s ? `Gehalt ${s} € brutto im Monat.` : '',
          'Mit Visum und Begleitung durch Triad Vision — jetzt online bewerben.',
        ]),
        intro: [
          `In ${city}${inRegion ? ` (${inRegion})` : ''} sind derzeit ${count} als ${prof} ausgeschrieben${types.length ? ` (${types.join(', ')})` : ''}.${s ? ` Die Arbeitgeber zahlen laut Ausschreibung ${s} € brutto im Monat.` : ''} Alle Stellen sind bei Arbeitgebern in Deutschland, vermittelt von Triad Vision.`,
          'Wählen Sie eine passende Stelle und bewerben Sie sich online: Wir begleiten Sie bei den Unterlagen, beim Arbeitsvisum (einschließlich der Zustimmung der Bundesagentur für Arbeit), mit dem vollständigen Unterlagenpaket für die Botschaft und bei den ersten Schritten in Deutschland. Die Liste aktualisiert sich, sobald eine Stelle besetzt ist.',
        ],
        cityName: city,
        professionName: prof,
        linkLabel: `${prof} Jobs in ${city} (${n})`,
        labels: { jobs: 'Offene Stellen', sameCity: `Weitere Berufe in ${city}`, sameProfession: `${prof} in anderen Städten`, allJobs: 'Alle Stellen', cta: 'Kostenlose Beratung' },
      };
    }
    case 'en': {
      const h1 = `${prof} jobs in ${city}, Germany`;
      return {
        h1,
        title: fitTitle(h1, `${h1}: ${count}`),
        description: fitDescription([
          `${n} open ${p} ${n === 1 ? 'job' : 'jobs'} in ${city}${inRegion ? ` (${inRegion})` : ''}, Germany.`,
          s ? `Pay €${s} gross per month.` : '',
          'Work visa and relocation support by Triad Vision — apply online.',
        ]),
        intro: [
          `There ${n === 1 ? 'is' : 'are'} currently ${n} open ${p} ${n === 1 ? 'job' : 'jobs'} in ${city}${inRegion ? ` (${inRegion})` : ''}${types.length ? ` (${types.join(', ')})` : ''}.${s ? ` According to the job ads, employers pay €${s} gross per month.` : ''} All positions are with employers in Germany and are placed by Triad Vision.`,
          'Pick a job and apply online: we support you with the documents, the work visa (including the approval of the Federal Employment Agency), the complete document set for the embassy and your first steps in Germany. This list updates itself as soon as a position is filled.',
        ],
        cityName: city,
        professionName: prof,
        linkLabel: `${prof} jobs in ${city} (${n})`,
        labels: { jobs: 'Open jobs', sameCity: `Other professions in ${city}`, sameProfession: `${prof}: other cities`, allJobs: 'All jobs', cta: 'Free consultation' },
      };
    }
    case 'ru': {
      const h1 = `${prof}: работа в городе ${city}`;
      return {
        h1,
        title: fitTitle(h1, `${h1}, ${count}`),
        description: fitDescription([
          `Германия, ${city}${inRegion ? ` (${inRegion})` : ''}: ${count} — ${p}.`,
          s ? `Зарплата ${s} € брутто в месяц.` : '',
          'Рабочая виза и переезд с Triad Vision — откликнитесь онлайн.',
        ]),
        intro: [
          `Сейчас в городе ${city}${inRegion ? ` (федеральная земля ${inRegion})` : ''} ${count} по профессии «${p}»${types.length ? ` (${types.join(', ')})` : ''}.${s ? ` По данным вакансий, работодатели платят ${s} € брутто в месяц.` : ''} Все места — у работодателей в Германии, трудоустройство через Triad Vision.`,
          'Выберите вакансию и откликнитесь онлайн: мы помогаем с документами, рабочей визой (включая согласие Федерального агентства по труду), полным пакетом документов для посольства и первыми шагами в Германии. Список обновляется сам, как только место занято.',
        ],
        cityName: city,
        professionName: prof,
        linkLabel: `${prof} — ${city} (${n})`,
        labels: { jobs: 'Открытые вакансии', sameCity: `Другие профессии: ${city}`, sameProfession: `${prof}: другие города`, allJobs: 'Все вакансии', cta: 'Бесплатная консультация' },
      };
    }
    case 'tr': {
      const h1 = `${city} şehrinde ${p} iş ilanları`;
      return {
        h1,
        title: fitTitle(h1, `${h1}: ${count}`),
        description: fitDescription([
          `Almanya, ${city}${inRegion ? ` (${inRegion})` : ''}: ${p} için ${count}.`,
          s ? `Maaş aylık ${s} € brüt.` : '',
          'Triad Vision ile çalışma vizesi ve taşınma desteği — online başvurun.',
        ]),
        intro: [
          `${city} şehrinde${inRegion ? ` (${inRegion} eyaleti)` : ''} şu anda ${p} için ${count} bulunuyor${types.length ? ` (${types.join(', ')})` : ''}.${s ? ` İlanlara göre işverenler aylık ${s} € brüt maaş ödüyor.` : ''} Tüm pozisyonlar Almanya’daki işverenlere aittir ve Triad Vision aracılığıyla doldurulur.`,
          'Size uygun ilanı seçin ve online başvurun: belgeler, çalışma vizesi (Federal İş Ajansı onayı dahil), büyükelçiliğin istediği eksiksiz belge seti ve Almanya’daki ilk adımlarınızda yanınızdayız. Bir pozisyon dolduğunda bu liste kendiliğinden güncellenir.',
        ],
        cityName: city,
        professionName: prof,
        linkLabel: `${city}: ${p} (${n})`,
        labels: { jobs: 'Açık ilanlar', sameCity: `${city} şehrinde diğer meslekler`, sameProfession: `${prof}: diğer şehirler`, allJobs: 'Tüm ilanlar', cta: 'Ücretsiz danışmanlık' },
      };
    }
    case 'uk': {
      const h1 = `${prof}: робота в місті ${city}`;
      return {
        h1,
        title: fitTitle(h1, `${h1}, ${count}`),
        description: fitDescription([
          `Німеччина, ${city}${inRegion ? ` (${inRegion})` : ''}: ${count} — ${p}.`,
          s ? `Зарплата ${s} € брутто на місяць.` : '',
          'Робоча віза та переїзд із Triad Vision — подайте заявку онлайн.',
        ]),
        intro: [
          `Зараз у місті ${city}${inRegion ? ` (федеральна земля ${inRegion})` : ''} ${count} за професією «${p}»${types.length ? ` (${types.join(', ')})` : ''}.${s ? ` За даними вакансій, роботодавці платять ${s} € брутто на місяць.` : ''} Усі місця — у роботодавців у Німеччині, працевлаштування через Triad Vision.`,
          'Оберіть вакансію та подайте заявку онлайн: ми допомагаємо з документами, робочою візою (зокрема зі згодою Федерального агентства з праці), повним пакетом документів для посольства та першими кроками в Німеччині. Список оновлюється сам, щойно місце зайняте.',
        ],
        cityName: city,
        professionName: prof,
        linkLabel: `${prof} — ${city} (${n})`,
        labels: { jobs: 'Відкриті вакансії', sameCity: `Інші професії: ${city}`, sameProfession: `${prof}: інші міста`, allJobs: 'Усі вакансії', cta: 'Безкоштовна консультація' },
      };
    }
  }
};

/** Internal links of a landing page: other professions in the same city, the same profession elsewhere. */
export const relatedLandings = <J extends LandingJob>(all: JobLanding<J>[], l: JobLanding<J>, max = 8) => ({
  sameCity: all.filter((x) => x.citySlug === l.citySlug && x.path !== l.path).slice(0, max),
  sameProfession: all.filter((x) => x.profession === l.profession && x.path !== l.path).slice(0, max),
});
