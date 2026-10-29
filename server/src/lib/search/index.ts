import { prisma } from '../../db.js';
import { cached } from '../cache.js';
import { guidePath } from '../guides/service.js';
import { collapse, getSeoData, guidesInLanguage, indexable, liveJobs, localizedPath, pick, pickList, type SeoData } from '../seo.js';
import { STATIC_PAGES, textIn, type SeoLocale } from '../seoCatalogue.js';
import { conceptsIn, editDistance, fold, parseQuery, phrasesOf, stripMarkdown, typoBudget } from './text.js';

/**
 * Public site search (GET /api/search): guides, visa categories, services, FAQ, news, open jobs, events,
 * tools and the static pages, in the visitor's language (CMS text falls back like the pages: tr / uk → en,
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

export const SEARCH_TYPES = ['tool', 'guide', 'visa', 'job', 'service', 'faq', 'news', 'event', 'page'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

const TYPE_BOOST: Record<SearchType, number> = { tool: 1.6, guide: 1.6, visa: 1.3, job: 1, service: 1, faq: 0.8, news: 0.5, event: 0.8, page: 0.7 };

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
  '/anerkennung',
  '/cities',
  '/map',
]);

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
  '/anerkennung': 'recognition diploma zab anabin',
  '/cities': 'city stadt şəhər şehir город місто rent miete kirayə kira аренда оренда cost of living',
  '/map': 'map karte xəritə harita карта',
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

interface Index {
  docs: SearchDoc[];
  /** folded word → indexes of the documents containing it */
  vocab: Map<string, number[]>;
}

const words = (folded: string) => folded.split(' ').filter(Boolean);

const makeDoc = (d: { id: string; type: SearchType; title: string; body: string; url: string; meta?: string; keywords?: string }): SearchDoc => {
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
    const tool = TOOL_PATHS.has(path);
    docs.push(
      makeDoc({
        id: `page:${path}`,
        type: tool ? 'tool' : 'page',
        title: textIn(page.name, lng),
        body: joinText(textIn(page.title, lng), textIn(page.description, lng)),
        url: url(path),
        keywords: TOOL_KEYWORDS[path],
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
  docs.forEach((d, i) => {
    for (const w of new Set([...d.titleWords, ...d.bodyWords])) {
      const list = vocab.get(w);
      if (list) list.push(i);
      else vocab.set(w, [i]);
    }
  });
  return { docs, vocab };
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

/** Vocabulary words a query word matches, with a quality factor (exact 1, prefix 0.75, typo 0.55). */
const matchWord = (vocab: Map<string, number[]>, word: string, allowPrefix: boolean) => {
  const out = new Map<string, number>();
  if (vocab.has(word)) out.set(word, 1);
  const budget = typoBudget(word);
  for (const v of vocab.keys()) {
    if (v === word) continue;
    if (allowPrefix && word.length >= 2 && v.startsWith(word)) out.set(v, Math.max(out.get(v) ?? 0, 0.75));
    else if (budget && Math.abs(v.length - word.length) <= budget && v.length >= 4 && editDistance(word, v, budget) <= budget) out.set(v, Math.max(out.get(v) ?? 0, 0.55));
  }
  return out;
};

const WORD_RE = /[\p{L}\p{N}]+/gu;

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
  const wordMatches = qWords.map((w, i) => matchWord(index.vocab, w, i === qWords.length - 1 || w.length >= 4));

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
    if (d.fTitle.includes(folded)) score += d.fTitle.startsWith(folded) ? 5 : 3;
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

/** Search in a language (index cached per language). */
export const siteSearch = async (query: string, lng: SeoLocale, opts: SearchOptions = {}) => searchIndex(await loadIndex(lng), query, opts);

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
