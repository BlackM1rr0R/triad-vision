import { prisma } from '../../db.js';
import { cached } from '../cache.js';
import { guidePath } from '../guides/service.js';
import { collapse, getSeoData, guidesInLanguage, indexable, liveJobs, localizedPath, pick, pickList, type SeoData } from '../seo.js';
import { SEO_LOCALES, STATIC_PAGES, textIn, type SeoLocale } from '../seoCatalogue.js';
import { GLOSSARY_TERMS, glossaryPath, longIn } from '../glossary/index.js';
import { PROFESSION_HUB_PATHS } from '../professionHubs.js';
import { programmeTitle } from '../study/seo.js';
import { toolSlugs } from '../toolLeads/tools.js';
import { conceptsIn, editDistance, fold, parseQuery, phrasesOf, stripMarkdown, trigrams, typoBudget } from './text.js';

/**
 * Public site search (GET /api/search): guides, visa categories, services, FAQ, news, open jobs, events,
 * tools / games / work scenes, glossary terms, profession hubs, study programmes and the static pages, in the visitor's language (CMS text falls back like the pages: tr / uk → en,
 * the others → az; guides missing in a language → their English version).
 *
 * The content is small (a few hundred documents per language), so instead of MySQL full-text indexes (none
 * exist on these tables, and they cannot fold ə/ı/ş or match across languages) every language has an
 * in-memory index built from the cached SEO collections. It is rebuilt at most every 5 minutes and right
 * after any CMS write (the admin router clears the shared cache, lib/cache.ts).
 *
 * Matching: folded words (diacritic-insensitive), prefixes (instant search), typos (edit distance 1 from 5
 * letters, 2 from 9) and synonym concepts (Chancenkarte = Fırsat Kartı = imkan kartı = opportunity card …).
 * Every query part must match (AND); when nothing matches all of them, documents matching most parts are shown.
 */

export const SEARCH_TYPES = ['tool', 'guide', 'visa', 'job', 'service', 'faq', 'news', 'event', 'page', 'glossary', 'profession', 'study'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

const TYPE_BOOST: Record<SearchType, number> = {
  tool: 1.6,
  guide: 1.6,
  visa: 1.3,
  job: 1,
  service: 1,
  faq: 0.8,
  news: 0.5,
  event: 0.8,
  page: 0.7,
  glossary: 1.1,
  profession: 1.4,
  study: 0.9,
};

/** Interactive tools (the rest of the static pages count as plain pages). */
export const TOOL_PATHS = new Set([
  '/tools',
  '/compare-visas',
  '/eligibility',
  '/uygunluq-testi',
  '/chancenkarte-calculator',
  '/blue-card-check',
  '/salary-calculator',
  '/calculator',
  '/cost-calculator',
  '/budget',
  '/life-in-germany',
  '/when-in-germany',
  '/payslip-explained',
  '/tax-refund-calculator',
  '/shift-pay-calculator',
  '/rent-check',
  '/health-insurance-comparison',
  '/germany-vs-other-countries',
  '/visa-refusal',
  '/visa-document-checklist',
  '/emergency-wallpaper',
  '/holiday-planner',
  '/grade-converter',
  '/weekend-trips',
  '/anerkennung',
  '/cities',
  '/map',
  '/german-simulator',
  '/pronunciation',
  '/price-game',
  '/traffic-signs',
  '/waste-sorting',
  '/german-mock-exam',
  '/german-mock-exam/a1',
  '/german-mock-exam/b1',
  '/german-level-test-self',
  '/work-scenes',
  '/work-scenes/restaurant-kitchen',
  '/work-scenes/truck-cab',
  '/work-scenes/hospital-ward',
  '/work-scenes/construction-site',
  '/work-scenes/electrical-panel',
  // Every tool of the tools hub (seoCatalogue TOOL_GROUPS) and its extra tool pages, so a new tool is searchable
  // as a tool without another list.
  ...toolSlugs().map((s) => `/${s}`),
]);

const PROFESSION_PATHS = new Set<string>(PROFESSION_HUB_PATHS);

/** Extra search words of the tools (not shown, any language: the synonyms cover the common terms). */
const TOOL_KEYWORDS: Record<string, string> = {
  '/compare-visas': 'compare comparison vergleich müqayisə karşılaştırma сравнение порівняння which visa welches visum hansı viza hangi vize какая виза яка віза 18a 18b 18g 20a 16a',
  '/eligibility': 'test quiz check eligibility uyğunluq uygunluk проверка перевірка',
  '/uygunluq-testi': 'test quiz eligibility uyğunluq uygunluk тест',
  '/chancenkarte-calculator': 'points punkte xal puan баллы бали calculator rechner',
  '/blue-card-check': 'threshold gehaltsgrenze hədd sınır порог поріг salary',
  '/salary-calculator': 'net brutto netto xalis net gross tax steuer vergi налог податок',
  '/calculator': 'start date startdatum başlama tarixi başlama tarihi срок термін when wann',
  '/cost-calculator': 'cost kosten xərc maliyet расходы витрати price',
  '/budget': 'budget first month erster monat ilk ay büdcə bütçe kaution deposit depozit sperrkonto blocked account rent miete kirayə бюджет залог аренда застава оренда',
  '/when-in-germany': 'when wann nə vaxt ne zaman когда коли arrival ankunft gəliş varış приезд приїзд timeline zeitstrahl duration dauer müddət süre срок строк visa viza виза віза',
  '/payslip-explained': 'payslip lohnabrechnung gehaltsabrechnung maaş vərəqəsi bordro расчётный лист розрахунковий lohnsteuer netto brutto sozialversicherung',
  '/tax-refund-calculator': 'tax refund steuererstattung steuererklärung vergi qaytarılması bəyannamə vergi iadesi beyanname возврат налога декларация повернення податку декларація werbungskosten entfernungspauschale pendlerpauschale homeoffice elster',
  '/shift-pay-calculator': 'zuschlag zuschläge nachtzuschlag sonntagszuschlag feiertagszuschlag shift night sunday holiday gecə bayram əlavə vardiya gece zammı надбавка ночные праздничные нічні святкові 3b steuerfrei',
  '/health-insurance-comparison': 'krankenkasse krankenversicherung gkv zusatzbeitrag vergleich günstigste kasse aok tk barmer tibbi sığorta xəstəlik kassası медицинская страховка больничная касса sağlık sigortası медичне страхування health insurance compare',
  '/germany-vs-other-countries': 'poland polen polşa polonya польша польща czech tschechien çexiya çekya чехия чехія uk britain england britaniya ingiltere великобритания британія austria österreich avstriya avusturya австрия австрія compare vergleich müqayisə karşılaştırma сравнение порівняння country land ölkə ülke страна країна',
  '/visa-refusal': 'refusal ablehnung abgelehnt imtina ret red отказ відмова remonstration remonstrasiya ремонстрация klage lawsuit iddia dava иск позов verwaltungsgericht',
  '/visa-document-checklist': 'checklist checkliste unterlagen documents sənədlər belgeler документы документи siyahı liste список список embassy botschaft səfirlik büyükelçilik посольство',
  '/emergency-wallpaper': 'notfall notruf 112 110 116117 sperrbildschirm wallpaper hintergrund handy emergency lock screen təcili yardım ekran şəkli экстренный обои блокировки acil durum duvar kağıdı екстрений шпалери',
  '/rent-check': 'rent miete mietcheck kaltmiete warmmiete nebenkosten mietpreisbremse mietspiegel kirayə kira аренда оренда квартира fair angemessen',
  '/holiday-planner': 'holiday feiertag feiertage brückentag brückentage bayram tatil köprü праздник мостик свято місток ics kalender calendar urlaub vacation',
  '/grade-converter': 'grade note noten notenumrechnung bayerische formel bavarian formula qiymət attestat not dönüştürme оценка аттестат перерахунок оцінка uni-assist studium study',
  '/life-in-germany': 'life leben həyat yaşam жизнь життя simulator simulyator simülatör симулятор cost of living lebenshaltungskosten manat azn savings sparen qənaət birikim сбережения заощадження baku bakı',
  '/anerkennung': 'recognition diploma zab anabin',
  '/cities': 'city stadt şəhər şehir город місто rent miete kirayə kira аренда оренда cost of living',
  '/map': 'map karte xəritə harita карта',
  '/weekend-trips': 'deutschlandticket d-ticket 49 58 63 ausflug ausflüge wochenende weekend trip day trip tagesausflug regionalzug regional train həftəsonu səyahət gəzinti hafta sonu gezi поездка выходные поїздка вихідні bahn',
  '/employer-guide-azerbaijan': 'employer arbeitgeber işəgötürən işveren работодатель роботодавець hiring einstellen azerbaijan aserbaidschan azərbaycan azerbaycan азербайджан fachkräfte bildungssystem education anabin dqr eqf novruz feiertage 81a',
  '/azerbaijan-in-germany': 'botschaft embassy səfirlik büyükelçilik посольство konsulat consulate kulturzentrum cultural centre verein community diaspora restaurant cafe azerbaijan aserbaidschan azərbaycan азербайджан',
  '/phrase-of-the-day': 'phrase satz ifadə ifade фраза german deutsch alman almanca немецкий німецька learn lernen öyrən öğren учить вчити',
  '/glossary': 'glossary glossar lüğət lugat sözlük словарь словник term begriff termin wörterbuch dictionary bürokratie bürokratiya bürokrasi бюрократия бюрократія anmeldung aufenthaltstitel steuer-id krankenkasse kaution',
  '/german-simulator': 'simulator simulyator simülatör симулятор bürgeramt dialog dialogue diyalog диалог діалог german deutsch alman almanca немецкий німецька anmeldung bank arzt doctor həkim doktor врач лікар',
  '/pronunciation': 'pronunciation aussprache tələffüz telaffuz произношение вимова speak sprechen danış konuş говорить microphone mikrofon микрофон german deutsch alman almanca',
  '/price-game': 'price preis qiymət fiyat цена ціна game spiel oyun игра гра guess raten cost kosten xərc maliyet стоимость döner brot bread manat azn',
  '/traffic-signs': 'traffic signs verkehrszeichen yol nişanları trafik işaretleri дорожные знаки stvo führerschein driving licence sürücülük ehliyet права test exam prüfung imtahan sınav экзамен',
  '/waste-sorting': 'waste müll mülltrennung zibil çöp atık мусор сміття recycling pfand gelber sack bio papier glas sorting sortieren çeşidlə ayrıştırma сортировка сортування',
  '/german-mock-exam': 'mock exam probeprüfung übungsprüfung modelltest sınaq imtahanı deneme sınavı пробный экзамен пробний іспит goethe zertifikat start deutsch a1 b1 test prüfung imtahan sınav экзамен іспит german deutsch alman almanca',
  '/german-level-test-self': 'level niveau səviyyə seviye уровень рівень test einstufungstest self-assessment selbsteinschätzung özünüqiymətləndirmə öz değerlendirme самооценка самооцінка cefr ger a1 a2 b1 b2 study plan lernplan german deutsch alman almanca',
  '/work-scenes': 'work scenes arbeitsszenen arbeitsplatz workplace iş yeri işyeri рабочее место робоче місце vocabulary wortschatz vokabeln sözlər kelimeler слова berufsdeutsch fachwörter quiz',
  '/work-scenes/restaurant-kitchen': 'küche kitchen mətbəx mutfak кухня koch cook aşpaz aşçı повар кухар haccp allergene allergen fritteuse kombidämpfer kühlhaus gastronomie',
  '/work-scenes/truck-cab': 'lkw truck tır yük maşını грузовик вантажівка fahrer driver sürücü şoför водитель водій tachograf tachograph fahrerkarte maut toll retarder adblue ladungssicherung',
  '/work-scenes/hospital-ward': 'krankenhaus hospital xəstəxana hastane больница лікарня pflege nurse tibb bacısı hemşire медсестра медсестра perfusor infusion händehygiene dekubitus',
  '/work-scenes/construction-site': 'baustelle construction tikinti inşaat şantiye стройка будова bau helm gerüst scaffold iskele леса absturz kran crane ffp2 leiter',
  '/work-scenes/electrical-panel': 'elektriker electrician elektrik elektrikçi электрик електрик sicherungskasten fuse box fi rcd ls aderfarben sicherheitsregeln vde schutzklasse ip',
  '/booking': 'consultation termin beratung konsultasiya danışmanlık randevu консультация консультація appointment',
};

export interface SearchDoc {
  id: string;
  type: SearchType;
  title: string;
  /** Plain text for snippets. */
  body: string;
  url: string;
  meta?: string;
  fTitle: string;
  titleWords: Set<string>;
  bodyWords: Set<string>;
  titleConcepts: Set<number>;
  concepts: Set<number>;
}

export interface Index {
  docs: SearchDoc[];
  /** folded word → indexes of the documents containing it */
  vocab: Map<string, number[]>;
  /** The vocabulary as a list (scanned for prefixes and typos). */
  words: string[];
  /** trigram → indexes into `words` (last-resort fuzzy matching and "did you mean"). */
  grams: Map<string, number[]>;
  /** folded word → how it is written in a title ("gehaltsrechner" → "Gehaltsrechner"), for suggestions. */
  surface: Map<string, string>;
}

const words = (folded: string) => folded.split(' ').filter(Boolean);

const WORD_RE = /[\p{L}\p{N}]+/gu;

export const makeDoc = (d: { id: string; type: SearchType; title: string; body: string; url: string; meta?: string; keywords?: string }): SearchDoc => {
  const title = collapse(d.title);
  const body = collapse(d.body);
  const fTitle = fold(title);
  const fBody = fold(`${body} ${d.keywords ?? ''} ${d.meta ?? ''}`);
  const titleConcepts = conceptsIn(fTitle);
  return {
    id: d.id,
    type: d.type,
    title,
    body,
    url: d.url,
    ...(d.meta ? { meta: d.meta } : {}),
    fTitle,
    titleWords: new Set(words(fTitle)),
    bodyWords: new Set(words(fBody)),
    titleConcepts,
    concepts: new Set([...titleConcepts, ...conceptsIn(fBody)]),
  };
};

const joinText = (...parts: (string | string[] | null | undefined)[]) =>
  parts
    .flat()
    .filter((p): p is string => typeof p === 'string' && !!p.trim())
    .join('\n');

/** The documents of one language (pure; unit tested with fixtures). */
export const buildDocs = (data: SeoData, lng: SeoLocale, extra: { leadMagnets?: { slug: string; title: unknown; description: unknown }[] } = {}): SearchDoc[] => {
  const docs: SearchDoc[] = [];
  const url = (p: string, l: SeoLocale = lng) => localizedPath(p, l);

  for (const [path, page] of Object.entries(STATIC_PAGES)) {
    if (page.index === false || path === '/') continue;
    const profession = PROFESSION_PATHS.has(path);
    docs.push(
      makeDoc({
        id: `page:${path}`,
        type: profession ? 'profession' : TOOL_PATHS.has(path) ? 'tool' : 'page',
        title: textIn(page.name, lng),
        body: joinText(textIn(page.title, lng), textIn(page.description, lng)),
        url: url(path),
        // Profession hubs: their name in every language ("nurse" finds the hub on the Azerbaijani site too).
        keywords: profession ? SEO_LOCALES.map((l) => textIn(page.name, l)).join(' ') : TOOL_KEYWORDS[path],
      }),
    );
  }

  // Glossary (static, lib/glossary): the German term is the title; aliases, the localized one-line definition
  // and the explanation are searchable. The article ("die") is the badge.
  for (const g of GLOSSARY_TERMS) {
    docs.push(
      makeDoc({
        id: `glossary:${g.slug}`,
        type: 'glossary',
        title: g.term,
        body: joinText(g.short[lng], longIn(g, lng).text),
        url: url(glossaryPath(g.slug)),
        ...(g.article ? { meta: g.article } : {}),
        keywords: joinText(g.aliases ?? [], g.slug.replace(/-/g, ' ')),
      }),
    );
  }

  // Study programmes (/study/:slug): published catalogue rows.
  for (const p of data.study ?? []) {
    docs.push(
      makeDoc({
        id: `study:${p.slug}`,
        type: 'study',
        title: programmeTitle(p),
        body: joinText(p.name, p.university, p.city, p.subjectArea, p.degree, pick(p.description, lng)),
        url: url(`/study/${p.slug}`),
        meta: p.city,
        keywords: joinText(p.degree, p.teachingLanguage, p.federalState),
      }),
    );
  }

  for (const g of guidesInLanguage(data, lng)) {
    const faq = Array.isArray(g.faq) ? (g.faq as { q?: unknown; a?: unknown }[]).flatMap((f) => [String(f?.q ?? ''), String(f?.a ?? '')]) : [];
    docs.push(
      makeDoc({ id: `guide:${g.key}`, type: 'guide', title: g.title, body: joinText(g.description, stripMarkdown(g.body), faq), url: url(guidePath(g.slug), g.locale as SeoLocale) }),
    );
  }

  for (const v of indexable(data.visas)) {
    docs.push(
      makeDoc({
        id: `visa:${v.slug}`,
        type: 'visa',
        title: pick(v.title, lng),
        body: joinText(pick(v.summary, lng), pickList(v.items, lng), pick(v.body, lng), pickList(v.requirements, lng)),
        url: url(`/visas/${v.slug}`),
        meta: v.visaLabel,
      }),
    );
  }

  for (const s of indexable(data.services)) {
    docs.push(
      makeDoc({ id: `service:${s.slug}`, type: 'service', title: pick(s.title, lng), body: joinText(pick(s.summary, lng), pick(s.body, lng), pickList(s.features, lng)), url: url(`/services/${s.slug}`) }),
    );
  }

  data.faqs.forEach((f, i) => {
    const q = pick(f.question, lng);
    if (q) docs.push(makeDoc({ id: `faq:${i}`, type: 'faq', title: q, body: pick(f.answer, lng), url: url('/faq') }));
  });

  for (const p of indexable(data.posts)) {
    docs.push(
      makeDoc({
        id: `news:${p.slug}`,
        type: 'news',
        title: pick(p.title, lng),
        body: joinText(pick(p.excerpt, lng), pick(p.body, lng)),
        url: url(`/news/${p.slug}`),
        meta: p.publishedAt.toISOString().slice(0, 10),
      }),
    );
  }

  for (const j of liveJobs(data)) {
    docs.push(
      makeDoc({
        id: `job:${j.slug}`,
        type: 'job',
        title: pick(j.title, lng),
        body: joinText(pick(j.description, lng), pickList(j.requirements, lng)),
        url: url(`/jobs/${j.slug}`),
        ...(j.city ? { meta: j.city } : {}),
      }),
    );
  }

  for (const e of data.events ?? []) {
    docs.push(
      makeDoc({
        id: `event:${e.slug}`,
        type: 'event',
        title: pick(e.title, lng),
        body: pick(e.description, lng),
        url: url(`/events/${e.slug}`),
        meta: e.startsAt.toISOString().slice(0, 10),
      }),
    );
  }

  for (const m of extra.leadMagnets ?? []) {
    docs.push(makeDoc({ id: `ebook:${m.slug}`, type: 'page', title: pick(m.title, lng), body: pick(m.description, lng), url: url(`/ebook/${m.slug}`), keywords: 'ebook pdf' }));
  }

  return docs.filter((d) => d.title);
};

export const buildIndex = (docs: SearchDoc[]): Index => {
  const vocab = new Map<string, number[]>();
  const surface = new Map<string, string>();
  docs.forEach((d, i) => {
    for (const w of new Set([...d.titleWords, ...d.bodyWords])) {
      const list = vocab.get(w);
      if (list) list.push(i);
      else vocab.set(w, [i]);
    }
    for (const m of d.title.matchAll(WORD_RE)) {
      const f = fold(m[0]);
      if (f && !f.includes(' ') && !surface.has(f)) surface.set(f, m[0]);
    }
  });
  const words = [...vocab.keys()];
  const grams = new Map<string, number[]>();
  words.forEach((w, i) => {
    if (w.length < 3) return;
    for (const g of trigrams(w)) {
      const list = grams.get(g);
      if (list) list.push(i);
      else grams.set(g, [i]);
    }
  });
  return { docs, vocab, words, grams, surface };
};

const loadIndex = (lng: SeoLocale) =>
  cached(`search:index:${lng}`, async () => {
    const [data, leadMagnets] = await Promise.all([
      getSeoData(),
      prisma.leadMagnet.findMany({ where: { published: true }, select: { slug: true, title: true, description: true } }).catch(() => []),
    ]);
    return buildIndex(buildDocs(data, lng, { leadMagnets }));
  });

// ─── querying ─────────────────────────────────────────────────────────

export interface SearchHit {
  id: string;
  type: SearchType;
  title: string;
  url: string;
  meta?: string;
  snippet: string;
  /** [start, end) character ranges to highlight in the title / snippet. */
  titleHighlights: [number, number][];
  highlights: [number, number][];
  score: number;
}

/** Vocabulary words sharing at least `min` trigram similarity (Dice) with `word`, best first. */
const similarWords = (index: Index, word: string, min: number, limit = 8) => {
  const q = trigrams(word);
  const shared = new Map<number, number>();
  for (const g of q) for (const i of index.grams.get(g) ?? []) shared.set(i, (shared.get(i) ?? 0) + 1);
  const out: { word: string; sim: number }[] = [];
  for (const [i, n] of shared) {
    const w = index.words[i];
    // Padded trigrams of a word of length L: L + 2 (minus repeats, rare enough to ignore here).
    const sim = (2 * n) / (q.length + w.length + 2);
    if (sim >= min && w !== word) out.push({ word: w, sim });
  }
  return out.sort((a, b) => b.sim - a.sim || a.word.localeCompare(b.word)).slice(0, limit);
};

/**
 * Vocabulary words a query word matches, with a quality factor. Tiers: exact 1, prefix 0.75 (instant search),
 * typo 0.55 (Damerau-Levenshtein within the typo budget; 0.45 for 4–5 letter words, which only fall back to typos
 * when nothing matched exactly or as a prefix), trigram look-alike 0.4 (only when nothing else matched).
 */
export const matchWord = (index: Index, word: string, allowPrefix: boolean) => {
  const out = new Map<string, number>();
  if (index.vocab.has(word)) out.set(word, 1);
  const budget = typoBudget(word);
  const typos: string[] = [];
  for (const v of index.words) {
    if (v === word) continue;
    if (allowPrefix && word.length >= 2 && v.startsWith(word)) out.set(v, 0.75);
    else if (budget && v.length >= 4 && Math.abs(v.length - word.length) <= budget && editDistance(word, v, budget) <= budget) typos.push(v);
  }
  const long = word.length >= 6;
  if (long || !out.size) for (const v of typos) if (!out.has(v)) out.set(v, long ? 0.55 : 0.45);
  if (!out.size && word.length >= 3 && !/^\d+$/.test(word)) for (const s of similarWords(index, word, 0.5, 5)) out.set(s.word, 0.4);
  return out;
};

/** Ranges of the words of `text` whose folded form is in `terms`. */
export const highlightRanges = (text: string, terms: Set<string>): [number, number][] => {
  const out: [number, number][] = [];
  if (!terms.size) return out;
  for (const m of text.matchAll(WORD_RE)) {
    const f = fold(m[0]);
    if (f && f.split(' ').some((w) => terms.has(w))) out.push([m.index!, m.index! + m[0].length]);
  }
  return out;
};

/** ~`size` characters of `text` around its first highlighted word (word boundaries, ellipses). */
export const makeSnippet = (text: string, terms: Set<string>, size = 180) => {
  if (!text) return { snippet: '', highlights: [] as [number, number][] };
  const first = highlightRanges(text, terms)[0];
  let start = 0;
  if (first && first[0] > size * 0.35) {
    start = first[0] - Math.round(size * 0.3);
    const space = text.lastIndexOf(' ', start);
    start = space > 0 ? space + 1 : start;
  }
  let end = Math.min(text.length, start + size);
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > start + size * 0.6) end = space;
  }
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const snippet = `${prefix}${text.slice(start, end)}${suffix}`;
  return { snippet, highlights: highlightRanges(snippet, terms) };
};

export interface SearchOptions {
  limit?: number;
  types?: SearchType[];
}

/** Ranked hits of a query in an index (pure; unit tested). */
export const searchIndex = (index: Index, query: string, opts: SearchOptions = {}): SearchHit[] => {
  const folded = fold(query).slice(0, 200);
  if (!folded) return [];
  const { concepts, words: qWords } = parseQuery(folded);
  const units = concepts.length + qWords.length;
  if (!units) return [];

  // Per query word: which vocabulary words it matches (the last word may be unfinished → prefixes).
  const wordMatches = qWords.map((w, i) => matchWord(index, w, i === qWords.length - 1 || w.length >= 4));

  const scored: { i: number; score: number; matched: number; terms: Set<string> }[] = [];
  index.docs.forEach((d, i) => {
    if (opts.types && !opts.types.includes(d.type)) return;
    let score = 0;
    let matched = 0;
    const terms = new Set<string>();
    for (const c of concepts) {
      const s = d.titleConcepts.has(c.id) ? 3 : d.concepts.has(c.id) ? 1.2 : 0;
      if (s) {
        matched++;
        score += s;
        for (const p of phrasesOf(c.id)) for (const w of p.split(' ')) if (d.titleWords.has(w) || d.bodyWords.has(w)) terms.add(w);
      }
    }
    for (const m of wordMatches) {
      let best = 0;
      for (const [term, q] of m) {
        const s = d.titleWords.has(term) ? 3 * q : d.bodyWords.has(term) ? q : 0;
        if (s) terms.add(term);
        if (s > best) best = s;
      }
      if (best) {
        matched++;
        score += best;
      }
    }
    if (!matched) return;
    // Ranking tiers: the whole query as the exact title > title starting with it > title containing it > the rest.
    if (d.fTitle === folded) score += 8;
    else if (d.fTitle.includes(folded)) score += d.fTitle.startsWith(folded) ? 5 : 3;
    scored.push({ i, score: score + TYPE_BOOST[d.type], matched, terms });
  });

  let hits = scored.filter((s) => s.matched === units);
  // Nothing matches every part: fall back to documents matching most of them.
  if (!hits.length && units > 1) {
    const need = Math.ceil(units / 2);
    hits = scored.filter((s) => s.matched >= need).map((s) => ({ ...s, score: (s.score * s.matched) / units }));
  }
  hits.sort((a, b) => b.score - a.score || a.i - b.i);

  return hits.slice(0, opts.limit ?? 40).map(({ i, score, terms }) => {
    const d = index.docs[i];
    const { snippet, highlights } = makeSnippet(d.body, terms);
    return {
      id: d.id,
      type: d.type,
      title: d.title,
      url: d.url,
      ...(d.meta ? { meta: d.meta } : {}),
      snippet,
      titleHighlights: highlightRanges(d.title, terms),
      highlights,
      score: Math.round(score * 100) / 100,
    };
  });
};

/**
 * "Did you mean": the query with every word the index does not know replaced by its closest known word (typo
 * distance first, then trigram look-alikes; frequent title words preferred), only when that query finds something.
 * Pure; used when a search has no results.
 */
export const suggestQueries = (index: Index, query: string, limit = 3): string[] => {
  const qWords = fold(query).slice(0, 200).split(' ').filter((w) => w.length >= 2);
  if (!qWords.length || qWords.length > 6) return [];
  const options = qWords.map((w) => {
    if (index.vocab.has(w) || /^\d+$/.test(w)) return [w];
    const max = Math.max(1, Math.min(3, Math.floor(w.length / 3)));
    return similarWords(index, w, 0.25, 30)
      .map((s) => {
        const dist = editDistance(w, s.word, max);
        const df = index.vocab.get(s.word)?.length ?? 0;
        const title = index.surface.has(s.word) ? 0.3 : 0;
        return { word: s.word, dist, score: (dist <= max ? 2 - dist * 0.6 : 0) + s.sim + title + Math.log10(1 + df) * 0.2 };
      })
      .filter((c) => c.dist <= max || c.score >= 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((c) => c.word);
  });
  if (options.some((o) => !o.length)) return [];
  const out: string[] = [];
  for (let k = 0; k < limit; k++) {
    const words = options.map((o) => o[Math.min(k, o.length - 1)]);
    const q = words.map((w) => index.surface.get(w) ?? w).join(' ');
    if (words.join(' ') === qWords.join(' ') || out.includes(q)) continue;
    if (searchIndex(index, q, { limit: 1 }).length) out.push(q);
  }
  return out;
};

/** Search in a language (index cached per language). */
export const siteSearch = async (query: string, lng: SeoLocale, opts: SearchOptions = {}) => searchIndex(await loadIndex(lng), query, opts);

/** Search plus "did you mean" suggestions when nothing was found (GET /api/search). */
export const siteSearchWithSuggestions = async (query: string, lng: SeoLocale, opts: SearchOptions = {}) => {
  const index = await loadIndex(lng);
  const items = searchIndex(index, query, opts);
  return { items, suggestions: items.length ? [] : suggestQueries(index, query) };
};

// ─── anonymous term statistics ────────────────────────────────────────

/**
 * The term as stored in the daily statistics (AnalyticsDaily, metric `search` / `search_noresult`, source =
 * term): folded, at most 60 characters. Terms that could be personal data (an e-mail address, a phone or
 * passport number, anything with 5+ digits in a row) and one-letter terms are never stored → null.
 */
export const loggableTerm = (q: string): string | null => {
  if (/@/.test(q) || /\d[\d\s-]{4,}\d|\d{5,}/.test(q)) return null;
  const t = fold(q).slice(0, 60).trim();
  return t.length >= 2 ? t : null;
};

const bump = async (day: Date, metric: string, source: string) => {
  await prisma.analyticsDaily.upsert({
    where: { day_metric_source: { day, metric, source } },
    create: { day, metric, source, count: 1 },
    update: { count: { increment: 1 } },
  });
};

/** Counts a finished search (and a zero-result one) for today. Best effort, never throws. */
export const logSearch = async (q: string, results: number, now = new Date()) => {
  const term = loggableTerm(q);
  if (!term) return false;
  try {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await bump(day, 'search', term);
    if (results === 0) await bump(day, 'search_noresult', term);
    return true;
  } catch (err) {
    console.error('[search] could not log the term', err);
    return false;
  }
};

/** Top searched and zero-result terms in a date range (admin analytics). */
export const searchStats = async (from: Date, to: Date, limit = 20) => {
  const day = { gte: from, lte: to };
  const top = async (metric: string) =>
    (await prisma.analyticsDaily.groupBy({ by: ['source'], where: { metric, day }, _sum: { count: true }, orderBy: { _sum: { count: 'desc' } }, take: limit })).map((r) => ({
      term: r.source,
      count: r._sum.count ?? 0,
    }));
  const [topTerms, zeroResults, totals] = await Promise.all([
    top('search'),
    top('search_noresult'),
    prisma.analyticsDaily.groupBy({ by: ['metric'], where: { metric: { in: ['search', 'search_noresult'] }, day }, _sum: { count: true } }),
  ]);
  const total = (m: string) => totals.find((t) => t.metric === m)?._sum.count ?? 0;
  return { top: topTerms, zeroResults, total: total('search'), zeroTotal: total('search_noresult') };
};
