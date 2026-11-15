import type { SeoLocale } from '../seoCatalogue.js';
import { SITE_NAME } from '../seoCatalogue.js';
import { collapse, escapeHtml as e, pageTitle, pageUrl, pick, pickList, truncate } from '../seo.js';
import { berlinToday, upcomingDeadlines, type DeadlineOccurrence, type Intake, type Ymd } from './deadlines.js';
import { STATES, type StateCode } from './catalogue.js';

/**
 * SEO of the programme catalogue (/study, /study/:slug): our own curated content, indexable in all six languages
 * (titles, descriptions and the fact labels are generated per language; the free-text description falls back
 * like other CMS text). Head data for lib/seo.ts resolvePage, the crawler body for lib/seoBody.ts and the sitemap
 * rows. Deadlines are computed for today's German date when the page is rendered (cached ≤ 5 minutes).
 */

/** The published programme fields the SEO output needs (SeoData.study, loaded by lib/seo.ts). */
export interface StudySeoRow {
  slug: string;
  name: string;
  university: string;
  city: string;
  federalState: string;
  degree: string;
  subjectArea: string;
  teachingLanguage: string;
  languageRequirement: string | null;
  durationSemesters: number;
  tuitionPerSemester: number;
  semesterContribution: number | null;
  deadlines: unknown;
  applicationRoute: string;
  officialUrl: string;
  description: unknown;
  requirements: unknown;
  featured: boolean;
  updatedAt: Date;
}

export const STUDY_PATH = '/study';
export const studyDetailSlug = (path: string) => /^\/study\/([^/]+)$/.exec(path)?.[1] ?? null;

interface Labels {
  degree: Record<string, string>;
  /** "taught in English" */
  lang: Record<string, string>;
  route: Record<string, string>;
  intake: (i: Intake, year: number) => string;
  semesters: (n: number) => string;
  free: string;
  tuition: (eur: string) => string;
  contribution: (eur: string) => string;
  description: (x: { degree: string; lang: string; university: string; city: string; duration: string; fees: string; deadline: string | null }) => string;
  nextDeadline: string;
  facts: { university: string; city: string; degree: string; language: string; languageReq: string; duration: string; tuition: string; route: string; deadlines: string; requirements: string; official: string; apply: string; others: string; empty: string; fees: string };
  window: (from: string, to: string) => string;
  until: (to: string) => string;
}

const intl: Record<SeoLocale, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU', tr: 'tr-TR', uk: 'uk-UA' };
const eur = (n: number) => `${n.toLocaleString('de-DE')} €`;
const ws = (y: number) => `${y}/${String(y + 1).slice(2)}`;

export const STUDY_L: Record<SeoLocale, Labels> = {
  az: {
    degree: { BACHELOR: 'Bakalavr', MASTER: 'Magistratura', STUDIENKOLLEG: 'Studienkolleg (hazırlıq)', AUSBILDUNG_DUAL: 'Dual təhsil / Ausbildung' },
    lang: { EN: 'ingilis dilində', DE: 'alman dilində', EN_DE: 'ingilis və alman dillərində' },
    route: { UNI_ASSIST: 'uni-assist vasitəsilə', DIRECT: 'birbaşa universitetə', VPD: 'uni-assist VPD, sonra universitetə', HOCHSCHULSTART: 'Hochschulstart vasitəsilə' },
    intake: (i, y) => (i === 'WINTER' ? `Qış semestri ${ws(y)}` : `Yay semestri ${y}`),
    semesters: (n) => `${n} semestr`,
    free: 'təhsil haqqı yoxdur',
    tuition: (x) => `təhsil haqqı semestrdə ${x}`,
    contribution: (x) => `semestr töhfəsi ${x}`,
    description: (x) => `${x.university}, ${x.city}: ${x.degree} ${x.lang}, ${x.duration}, ${x.fees}.${x.deadline ? ` Növbəti son tarix: ${x.deadline}.` : ''} Triad Vision ilə müraciət edin.`,
    nextDeadline: 'Növbəti son tarix',
    facts: { university: 'Universitet', city: 'Şəhər', degree: 'Dərəcə', language: 'Tədris dili', languageReq: 'Dil tələbi', duration: 'Müddət', tuition: 'Təhsil haqqı', route: 'Müraciət yolu', deadlines: 'Müraciət müddətləri', requirements: 'Qəbul tələbləri', official: 'Universitetin rəsmi səhifəsi', apply: 'Triad Vision ilə müraciət et', others: 'Digər proqramlar', empty: 'Kataloq hazırlanır — komandamız proqramları yoxlayıb əlavə edir.', fees: 'Haqlar' },
    window: (f, t) => `${f} – ${t}`,
    until: (t) => `${t} tarixinədək`,
  },
  de: {
    degree: { BACHELOR: 'Bachelor', MASTER: 'Master', STUDIENKOLLEG: 'Studienkolleg', AUSBILDUNG_DUAL: 'Duales Studium / Ausbildung' },
    lang: { EN: 'auf Englisch', DE: 'auf Deutsch', EN_DE: 'auf Englisch und Deutsch' },
    route: { UNI_ASSIST: 'über uni-assist', DIRECT: 'direkt bei der Hochschule', VPD: 'uni-assist-VPD, dann direkt', HOCHSCHULSTART: 'über Hochschulstart' },
    intake: (i, y) => (i === 'WINTER' ? `Wintersemester ${ws(y)}` : `Sommersemester ${y}`),
    semesters: (n) => `${n} Semester`,
    free: 'keine Studiengebühren',
    tuition: (x) => `Studiengebühr ${x} pro Semester`,
    contribution: (x) => `Semesterbeitrag ${x}`,
    description: (x) => `${x.degree} ${x.lang} an der ${x.university}, ${x.city}: ${x.duration}, ${x.fees}.${x.deadline ? ` Nächste Bewerbungsfrist: ${x.deadline}.` : ''} Über Triad Vision bewerben.`,
    nextDeadline: 'Nächste Frist',
    facts: { university: 'Hochschule', city: 'Stadt', degree: 'Abschluss', language: 'Unterrichtssprache', languageReq: 'Sprachnachweis', duration: 'Regelstudienzeit', tuition: 'Studiengebühren', route: 'Bewerbungsweg', deadlines: 'Bewerbungsfristen', requirements: 'Zulassungsvoraussetzungen', official: 'Offizielle Seite der Hochschule', apply: 'Über Triad Vision bewerben', others: 'Weitere Studiengänge', empty: 'Der Katalog entsteht gerade — unser Team prüft die Studiengänge und trägt sie ein.', fees: 'Kosten' },
    window: (f, t) => `${f} – ${t}`,
    until: (t) => `bis ${t}`,
  },
  en: {
    degree: { BACHELOR: "Bachelor's", MASTER: "Master's", STUDIENKOLLEG: 'Studienkolleg (foundation)', AUSBILDUNG_DUAL: 'Dual study / Ausbildung' },
    lang: { EN: 'taught in English', DE: 'taught in German', EN_DE: 'taught in English and German' },
    route: { UNI_ASSIST: 'via uni-assist', DIRECT: 'directly to the university', VPD: 'uni-assist VPD, then directly', HOCHSCHULSTART: 'via Hochschulstart' },
    intake: (i, y) => (i === 'WINTER' ? `Winter semester ${ws(y)}` : `Summer semester ${y}`),
    semesters: (n) => `${n} semesters`,
    free: 'no tuition fees',
    tuition: (x) => `tuition ${x} per semester`,
    contribution: (x) => `semester contribution ${x}`,
    description: (x) => `${x.degree} ${x.lang} at ${x.university}, ${x.city}: ${x.duration}, ${x.fees}.${x.deadline ? ` Next deadline: ${x.deadline}.` : ''} Apply via Triad Vision.`,
    nextDeadline: 'Next deadline',
    facts: { university: 'University', city: 'City', degree: 'Degree', language: 'Teaching language', languageReq: 'Language requirement', duration: 'Duration', tuition: 'Tuition', route: 'How to apply', deadlines: 'Application deadlines', requirements: 'Admission requirements', official: "University's official page", apply: 'Apply via Triad Vision', others: 'More programmes', empty: 'The catalogue is being prepared — our team checks each programme before adding it.', fees: 'Fees' },
    window: (f, t) => `${f} – ${t}`,
    until: (t) => `until ${t}`,
  },
  ru: {
    degree: { BACHELOR: 'Бакалавриат', MASTER: 'Магистратура', STUDIENKOLLEG: 'Штудиенколлег', AUSBILDUNG_DUAL: 'Дуальное обучение / Ausbildung' },
    lang: { EN: 'на английском', DE: 'на немецком', EN_DE: 'на английском и немецком' },
    route: { UNI_ASSIST: 'через uni-assist', DIRECT: 'напрямую в университет', VPD: 'VPD uni-assist, затем напрямую', HOCHSCHULSTART: 'через Hochschulstart' },
    intake: (i, y) => (i === 'WINTER' ? `Зимний семестр ${ws(y)}` : `Летний семестр ${y}`),
    semesters: (n) => `${n} семестра(ов)`,
    free: 'без платы за обучение',
    tuition: (x) => `обучение ${x} за семестр`,
    contribution: (x) => `семестровый взнос ${x}`,
    description: (x) => `${x.degree} ${x.lang}, ${x.university}, ${x.city}: ${x.duration}, ${x.fees}.${x.deadline ? ` Ближайший срок: ${x.deadline}.` : ''} Подайте заявку через Triad Vision.`,
    nextDeadline: 'Ближайший срок',
    facts: { university: 'Университет', city: 'Город', degree: 'Степень', language: 'Язык обучения', languageReq: 'Языковые требования', duration: 'Срок обучения', tuition: 'Плата за обучение', route: 'Как подать', deadlines: 'Сроки подачи', requirements: 'Требования к поступлению', official: 'Официальная страница университета', apply: 'Подать заявку через Triad Vision', others: 'Другие программы', empty: 'Каталог готовится — наша команда проверяет каждую программу перед добавлением.', fees: 'Расходы' },
    window: (f, t) => `${f} – ${t}`,
    until: (t) => `до ${t}`,
  },
  tr: {
    degree: { BACHELOR: 'Lisans', MASTER: 'Yüksek lisans', STUDIENKOLLEG: 'Studienkolleg (hazırlık)', AUSBILDUNG_DUAL: 'Dual eğitim / Ausbildung' },
    lang: { EN: 'İngilizce', DE: 'Almanca', EN_DE: 'İngilizce ve Almanca' },
    route: { UNI_ASSIST: 'uni-assist üzerinden', DIRECT: 'doğrudan üniversiteye', VPD: 'uni-assist VPD, ardından doğrudan', HOCHSCHULSTART: 'Hochschulstart üzerinden' },
    intake: (i, y) => (i === 'WINTER' ? `Kış dönemi ${ws(y)}` : `Yaz dönemi ${y}`),
    semesters: (n) => `${n} dönem`,
    free: 'öğrenim ücreti yok',
    tuition: (x) => `dönem başına ${x} öğrenim ücreti`,
    contribution: (x) => `dönem katkı payı ${x}`,
    description: (x) => `${x.university}, ${x.city}: ${x.lang} ${x.degree}, ${x.duration}, ${x.fees}.${x.deadline ? ` Sonraki son tarih: ${x.deadline}.` : ''} Triad Vision ile başvurun.`,
    nextDeadline: 'Sonraki son tarih',
    facts: { university: 'Üniversite', city: 'Şehir', degree: 'Derece', language: 'Eğitim dili', languageReq: 'Dil şartı', duration: 'Süre', tuition: 'Öğrenim ücreti', route: 'Başvuru yolu', deadlines: 'Başvuru tarihleri', requirements: 'Kabul şartları', official: 'Üniversitenin resmi sayfası', apply: 'Triad Vision ile başvur', others: 'Diğer programlar', empty: 'Katalog hazırlanıyor — ekibimiz her programı eklemeden önce kontrol ediyor.', fees: 'Ücretler' },
    window: (f, t) => `${f} – ${t}`,
    until: (t) => `${t} tarihine kadar`,
  },
  uk: {
    degree: { BACHELOR: 'Бакалаврат', MASTER: 'Магістратура', STUDIENKOLLEG: 'Штудієнколег', AUSBILDUNG_DUAL: 'Дуальне навчання / Ausbildung' },
    lang: { EN: 'англійською', DE: 'німецькою', EN_DE: 'англійською та німецькою' },
    route: { UNI_ASSIST: 'через uni-assist', DIRECT: 'безпосередньо до університету', VPD: 'VPD uni-assist, потім безпосередньо', HOCHSCHULSTART: 'через Hochschulstart' },
    intake: (i, y) => (i === 'WINTER' ? `Зимовий семестр ${ws(y)}` : `Літній семестр ${y}`),
    semesters: (n) => `${n} семестри(ів)`,
    free: 'без плати за навчання',
    tuition: (x) => `навчання ${x} за семестр`,
    contribution: (x) => `семестровий внесок ${x}`,
    description: (x) => `${x.degree} ${x.lang}, ${x.university}, ${x.city}: ${x.duration}, ${x.fees}.${x.deadline ? ` Найближчий строк: ${x.deadline}.` : ''} Подайте заявку через Triad Vision.`,
    nextDeadline: 'Найближчий строк',
    facts: { university: 'Університет', city: 'Місто', degree: 'Ступінь', language: 'Мова навчання', languageReq: 'Мовні вимоги', duration: 'Тривалість', tuition: 'Плата за навчання', route: 'Як подати', deadlines: 'Строки подання', requirements: 'Вимоги до вступу', official: 'Офіційна сторінка університету', apply: 'Подати заявку через Triad Vision', others: 'Інші програми', empty: 'Каталог готується — наша команда перевіряє кожну програму перед додаванням.', fees: 'Витрати' },
    window: (f, t) => `${f} – ${t}`,
    until: (t) => `до ${t}`,
  },
};

export const formatStudyDate = (iso: string, lng: SeoLocale) =>
  new Date(`${iso}T12:00:00.000Z`).toLocaleDateString(intl[lng], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "Data Engineering and Analytics, Master of Science (M.Sc.)" → "Data Engineering and Analytics". */
export const shortProgrammeName = (name: string) =>
  collapse(
    name
      .replace(/,?\s*\((?:Master|Bachelor)[^)]*\)/gi, '')
      .replace(/,?\s*(?:Master|Bachelor) of (?:Science|Arts|Engineering|Laws|Education)\b/gi, '')
      .replace(/,?\s*\(?\b(?:M|B)\.\s?(?:Sc|A|Eng|Ed)\.?\)?/g, '')
      .replace(/\s*\((?:Master|Bachelor)(?:\/[^)]*)?\)/gi, ''),
  ).replace(/[,\s]+$/, '') || name;

/** "Technical University of Munich (TUM)" → "TUM"; otherwise the full name. */
export const shortUniversity = (u: string) => /\(([A-Za-zÄÖÜäöü]{2,10})\)/.exec(u)?.[1] ?? u.replace(/\s*\([^)]*\)/, '');

const TITLE_MAX = 60;
export const programmeTitle = (p: Pick<StudySeoRow, 'name' | 'university' | 'city'>) => {
  const short = shortProgrammeName(p.name);
  for (const c of [`${short} — ${shortUniversity(p.university)}`, `${short}, ${p.city}`, short]) {
    const t = pageTitle(c);
    if (t.length <= TITLE_MAX) return t;
  }
  return truncate(`${short} | ${SITE_NAME}`, TITLE_MAX);
};

export const feesText = (p: Pick<StudySeoRow, 'tuitionPerSemester' | 'semesterContribution'>, lng: SeoLocale) => {
  const L = STUDY_L[lng];
  return [p.tuitionPerSemester > 0 ? L.tuition(eur(p.tuitionPerSemester)) : L.free, p.semesterContribution ? L.contribution(eur(p.semesterContribution)) : ''].filter(Boolean).join(', ');
};

export const programmeDescription = (p: StudySeoRow, lng: SeoLocale, next: DeadlineOccurrence | null) => {
  const L = STUDY_L[lng];
  const text = L.description({
    degree: L.degree[p.degree] ?? p.degree,
    lang: L.lang[p.teachingLanguage] ?? '',
    university: p.university,
    city: p.city,
    duration: L.semesters(p.durationSemesters),
    fees: p.tuitionPerSemester > 0 ? L.tuition(eur(p.tuitionPerSemester)) : L.free,
    deadline: next ? formatStudyDate(next.closes, lng) : null,
  });
  return truncate(collapse(text), 155);
};

/** JSON-LD EducationalOccupationalProgram of a programme page (schema.org; offers = tuition per semester). */
export const programmeLd = (p: StudySeoRow, lng: SeoLocale, url: string, today: Ymd) => {
  const next = upcomingDeadlines(p.deadlines, today);
  const description = collapse(pick(p.description, lng)) || programmeDescription(p, lng, next[0] ?? null);
  const L = STUDY_L[lng];
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOccupationalProgram',
    '@id': `${url}#programme`,
    name: p.name,
    description: truncate(description, 500),
    url,
    sameAs: p.officialUrl,
    provider: {
      '@type': 'CollegeOrUniversity',
      name: p.university,
      address: { '@type': 'PostalAddress', addressLocality: p.city, addressRegion: STATES[p.federalState as StateCode] ?? p.federalState, addressCountry: 'DE' },
    },
    educationalCredentialAwarded: L.degree[p.degree] ?? p.degree,
    educationalProgramMode: 'full-time',
    timeToComplete: `P${p.durationSemesters * 6}M`,
    termDuration: 'P6M',
    termsPerYear: 2,
    ...(next.length ? { applicationDeadline: next[0].closes } : {}),
    ...(next[0]?.opens ? { applicationStartDate: next[0].opens } : {}),
    ...(p.languageRequirement ? { programPrerequisites: p.languageRequirement } : {}),
    offers: {
      '@type': 'Offer',
      category: 'Tuition',
      price: p.tuitionPerSemester,
      priceCurrency: 'EUR',
      url: p.officialUrl,
    },
  };
};

/** /study list: ItemList of the programme pages, soonest deadline first. */
export const studyListLd = (rows: StudySeoRow[], lng: SeoLocale, name: string, today: Ymd) =>
  rows.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name,
        numberOfItems: rows.length,
        itemListElement: sortedRows(rows, today).map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, url: pageUrl(`/study/${p.slug}`, lng) })),
      }
    : null;

export const sortedRows = (rows: StudySeoRow[], today: Ymd) =>
  rows
    .map((p) => ({ p, d: upcomingDeadlines(p.deadlines, today)[0]?.daysLeft ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.d - b.d || Number(b.p.featured) - Number(a.p.featured) || a.p.name.localeCompare(b.p.name))
    .map((x) => x.p);

// ─── crawler HTML ─────────────────────────────────────────────────────

const deadlineLine = (o: DeadlineOccurrence, lng: SeoLocale) => {
  const L = STUDY_L[lng];
  const to = `<time datetime="${o.closes}">${e(formatStudyDate(o.closes, lng))}</time>`;
  const when = o.opens ? L.window(`<time datetime="${o.opens}">${e(formatStudyDate(o.opens, lng))}</time>`, to) : L.until(to);
  return `<li>${e(L.intake(o.intake, o.intakeYear))}: ${when}${o.note ? ` (${e(o.note)})` : ''}</li>`;
};

const factLine = (p: StudySeoRow, lng: SeoLocale) => {
  const L = STUDY_L[lng];
  return [p.university, p.city, L.degree[p.degree], L.lang[p.teachingLanguage], L.semesters(p.durationSemesters), p.tuitionPerSemester > 0 ? L.tuition(eur(p.tuitionPerSemester)) : L.free].filter(Boolean).join(' · ');
};

/** Body of /study/:slug (inside <main>, after the breadcrumbs). */
export const studyDetailBody = (p: StudySeoRow, rows: StudySeoRow[], lng: SeoLocale, link: (path: string, label: string) => string, today = berlinToday()) => {
  const L = STUDY_L[lng];
  const deadlines = upcomingDeadlines(p.deadlines, today);
  const reqs = pickList(p.requirements, lng);
  const desc = pick(p.description, lng);
  const facts: [string, string][] = [
    [L.facts.university, p.university],
    [L.facts.city, `${p.city}, ${STATES[p.federalState as StateCode] ?? p.federalState}`],
    [L.facts.degree, L.degree[p.degree] ?? p.degree],
    [L.facts.language, L.lang[p.teachingLanguage] ?? p.teachingLanguage],
    ...(p.languageRequirement ? ([[L.facts.languageReq, p.languageRequirement]] as [string, string][]) : []),
    [L.facts.duration, L.semesters(p.durationSemesters)],
    [L.facts.fees, feesText(p, lng)],
    [L.facts.route, L.route[p.applicationRoute] ?? p.applicationRoute],
  ];
  const others = sortedRows(
    rows.filter((x) => x.slug !== p.slug),
    today,
  ).slice(0, 6);
  return [
    `<article><h1>${e(p.name)}</h1>`,
    `<p>${e(factLine(p, lng))}</p>`,
    `<dl>${facts.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join('')}</dl>`,
    deadlines.length ? `<section><h2>${e(L.facts.deadlines)}</h2><ul>${deadlines.map((o) => deadlineLine(o, lng)).join('')}</ul></section>` : '',
    desc ? desc.split(/\n\s*\n/).map((x) => collapse(x)).filter(Boolean).map((x) => `<p>${e(x)}</p>`).join('') : '',
    reqs.length ? `<section><h2>${e(L.facts.requirements)}</h2><ul>${reqs.map((x) => `<li>${e(x)}</li>`).join('')}</ul></section>` : '',
    `<p><a href="${e(p.officialUrl)}" rel="nofollow noopener" target="_blank">${e(L.facts.official)}</a> · ${link(`/study/${p.slug}#apply`, L.facts.apply)}</p>`,
    '</article>',
    others.length ? `<section><h2>${e(L.facts.others)}</h2><ul>${others.map((x) => `<li>${link(`/study/${x.slug}`, x.name)} — ${e(factLine(x, lng))}</li>`).join('')}</ul></section>` : '',
  ];
};

/** Body of /study: the programmes, soonest deadline first, with their key facts. */
export const studyListBody = (rows: StudySeoRow[], lng: SeoLocale, link: (path: string, label: string) => string, today = berlinToday()) => {
  const L = STUDY_L[lng];
  if (!rows.length) return [`<p>${e(L.facts.empty)}</p>`];
  return [
    `<ul>${sortedRows(rows, today)
      .map((p) => {
        const next = upcomingDeadlines(p.deadlines, today)[0];
        return `<li>${link(`/study/${p.slug}`, p.name)} — ${e(factLine(p, lng))}${next ? ` · ${e(L.nextDeadline)}: <time datetime="${next.closes}">${e(formatStudyDate(next.closes, lng))}</time>` : ''}</li>`;
      })
      .join('')}</ul>`,
  ];
};
