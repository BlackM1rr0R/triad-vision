import { describe, expect, it } from 'vitest';
import { editDistance, fold, parseQuery, trigramSimilarity, trigrams, typoBudget } from '../../src/lib/search/text.js';
import { buildDocs, buildIndex, makeDoc, searchIndex, suggestQueries, TOOL_PATHS } from '../../src/lib/search/index.js';
import type { SeoData } from '../../src/lib/seo.js';
import type { StudySeoRow } from '../../src/lib/study/seo.js';
import { GLOSSARY_TERMS } from '../../src/lib/glossary/index.js';
import { cleanFeatured, DEFAULT_FEATURED_TOOLS, FEATURED_MAX, featurableToolPaths } from '../../src/lib/featuredTools.js';
import { TOOL_GROUPS } from '../../src/lib/seoCatalogue.js';

const D = new Date('2026-10-01T00:00:00Z');

const study: StudySeoRow = {
  slug: 'informatik-tu-muenchen',
  name: 'Informatik',
  university: 'Technische Universität München (TUM)',
  city: 'München',
  federalState: 'BY',
  degree: 'MASTER',
  subjectArea: 'Computer science',
  teachingLanguage: 'EN',
  languageRequirement: null,
  durationSemesters: 4,
  tuitionPerSemester: 0,
  semesterContribution: 150,
  deadlines: [],
  applicationRoute: 'DIRECT',
  officialUrl: 'https://www.tum.de',
  description: { en: 'Master in computer science, taught in English.', az: 'İngilis dilində kompüter elmləri magistraturası.' },
  requirements: null,
  featured: false,
  updatedAt: D,
};

const data: SeoData = {
  visas: [],
  services: [],
  posts: [],
  faqs: [],
  jobs: [],
  settings: {},
  rating: null,
  guides: [],
  study: [study],
};

const index = (lng: 'az' | 'de' | 'en' | 'ru') => buildIndex(buildDocs(data, lng));

describe('normalisation (folding)', () => {
  it('folds Azerbaijani and German letters, keeps Cyrillic', () => {
    expect(fold('Maaş')).toBe('maas');
    expect(fold('Əmək haqqı ŞÇĞ ıöü')).toBe('emek haqqi scg iou');
    expect(fold('Übersetzung Größe Straße')).toBe('ubersetzung grosse strasse');
    expect(fold('Зарплата')).toBe('зарплата');
  });
});

describe('fuzzy matching', () => {
  it('counts a swap of two neighbouring letters as one typo (Damerau)', () => {
    expect(editDistance('gehlat', 'gehalt', 2)).toBe(1);
    expect(editDistance('vias', 'visa', 1)).toBe(1);
    expect(editDistance('anmeldugn', 'anmeldung', 2)).toBe(1);
    // Plain Levenshtein would need 2 for a swap.
    expect(editDistance('ab', 'ba', 1)).toBe(1);
    expect(editDistance('abcdef', 'uvwxyz', 1)).toBe(2);
  });

  it('allows typos from 4 letters, two from 8', () => {
    expect(typoBudget('abc')).toBe(0);
    expect(typoBudget('visa')).toBe(1);
    expect(typoBudget('kaution')).toBe(1);
    expect(typoBudget('anmeldung')).toBe(2);
  });

  it('measures trigram similarity', () => {
    expect(trigrams('visa')).toEqual([' vi', 'vis', 'isa', 'sa ']);
    expect(trigramSimilarity(trigrams('krankenkasse'), trigrams('krankenkasse'))).toBe(1);
    expect(trigramSimilarity(trigrams('krankenkase'), trigrams('krankenkasse'))).toBeGreaterThan(0.7);
    expect(trigramSimilarity(trigrams('qqqq'), trigrams('visa'))).toBe(0);
  });
});

describe('synonyms', () => {
  const concept = (q: string) => parseQuery(fold(q)).concepts[0]?.id;

  it('maps salary / visa in every language to one concept', () => {
    const salary = concept('salary');
    for (const q of ['maaş', 'Gehalt', 'зарплата', 'maas']) expect(concept(q)).toBe(salary);
    const visa = concept('visa');
    for (const q of ['viza', 'Visum', 'vize', 'виза', 'віза']) expect(concept(q)).toBe(visa);
  });

  it('maps profession names in six languages', () => {
    const cook = concept('cook');
    for (const q of ['Koch', 'aşpaz', 'aşçı', 'повар', 'кухар']) expect(concept(q)).toBe(cook);
    const welder = concept('welder');
    for (const q of ['Schweißer', 'qaynaqçı', 'kaynakçı', 'сварщик', 'зварник']) expect(concept(q)).toBe(welder);
    expect(concept('Elektriker')).toBe(concept('электрик'));
    expect(concept('LKW')).toBe(concept('tır'));
  });
});

describe('index coverage', () => {
  it('indexes every glossary term with a localised URL and its article as the badge', () => {
    const de = index('de');
    expect(de.docs.filter((d) => d.type === 'glossary')).toHaveLength(GLOSSARY_TERMS.length);
    const hit = searchIndex(de, 'Anmeldung')[0];
    expect(hit).toMatchObject({ id: 'glossary:anmeldung', type: 'glossary', url: '/de/glossary/anmeldung', meta: 'die' });
  });

  it('finds glossary terms by alias and with typos', () => {
    expect(searchIndex(index('en'), 'Wohnsitzanmeldung').some((h) => h.id === 'glossary:anmeldung')).toBe(true);
    expect(searchIndex(index('en'), 'Anmeldugn')[0].id).toBe('glossary:anmeldung');
  });

  it('types profession hubs and finds them in another language', () => {
    const hits = searchIndex(index('az'), 'медсестра');
    expect(hits.find((h) => h.id === 'page:/for/nurse')).toMatchObject({ type: 'profession', url: '/for/nurse' });
  });

  it('indexes study programmes', () => {
    const hits = searchIndex(index('en'), 'informatik münchen');
    expect(hits[0]).toMatchObject({ id: 'study:informatik-tu-muenchen', type: 'study', url: '/en/study/informatik-tu-muenchen', meta: 'München' });
  });

  it('treats every hub tool, game and work scene as a tool', () => {
    for (const p of TOOL_GROUPS.find((g) => g.key === 'learn')!.paths) expect(TOOL_PATHS.has(p)).toBe(true);
    expect(TOOL_PATHS.has('/german-mock-exam/a1')).toBe(true);
    const de = index('de');
    expect(de.docs.find((d) => d.id === 'page:/health-insurance-comparison')?.type).toBe('tool');
  });
});

describe('ranking', () => {
  const doc = (id: string, title: string, body = '') => makeDoc({ id, type: 'faq', title, body, url: `/${id}` });

  it('orders exact title > title prefix > title typo > body', () => {
    const idx = buildIndex([
      doc('body', 'Mietvertrag', 'Die Kaution beträgt drei Kaltmieten.'),
      doc('fuzzy', 'Kaucion'),
      doc('prefix', 'Kautionskonto'),
      doc('exact', 'Kaution'),
    ]);
    expect(searchIndex(idx, 'kaution').map((h) => h.id)).toEqual(['exact', 'prefix', 'fuzzy', 'body']);
  });

  it('typo-matches short words only when nothing matches exactly', () => {
    const idx = buildIndex([doc('a', 'Visa types'), doc('b', 'Vise and tools')]);
    expect(searchIndex(idx, 'visa').map((h) => h.id)).toEqual(['a']);
    expect(searchIndex(buildIndex([doc('a', 'Visa types')]), 'vias').map((h) => h.id)).toEqual(['a']);
  });

  it('falls back to trigram look-alikes and finds nothing for gibberish', () => {
    const idx = buildIndex([doc('a', 'Krankenversicherung')]);
    expect(searchIndex(idx, 'krankenversichrung').map((h) => h.id)).toEqual(['a']);
    expect(searchIndex(idx, 'qqqqzzzz')).toEqual([]);
  });
});

describe('did you mean', () => {
  const idx = buildIndex([makeDoc({ id: 'tool', type: 'tool', title: 'Gehaltsrechner', body: 'Brutto Netto', url: '/salary-calculator' })]);

  it('suggests the closest known word (as written in a title) when nothing matched', () => {
    expect(searchIndex(idx, 'gahaltsrachnar')).toEqual([]);
    expect(suggestQueries(idx, 'gahaltsrachnar')).toEqual(['Gehaltsrechner']);
  });

  it('suggests nothing for known words or gibberish', () => {
    expect(suggestQueries(idx, 'gehaltsrechner')).toEqual([]);
    expect(suggestQueries(idx, 'qqqqzzzz')).toEqual([]);
  });
});

describe('speed', () => {
  it('answers well under 50 ms on a site-sized index', () => {
    // ~1 500 documents (all six glossary languages, synthetic guides) — larger than the live site per language.
    const rnd = (n: number) => Array.from({ length: n }, (_, i) => `wort${(i * 7919) % 9973}x${i % 13}`).join(' ');
    const docs = [...buildDocs(data, 'de'), ...Array.from({ length: 1200 }, (_, i) => makeDoc({ id: `g${i}`, type: 'guide', title: `Ratgeber ${i}`, body: rnd(120 + (i % 40)), url: `/g${i}` }))];
    const idx = buildIndex(docs);
    const queries = ['anmeldung', 'Kranknkasse', 'gehalt rechner', 'vias', 'qqqqzzzz', 'blaue karte', 'wort12x5', 'aufenthaltstitel'];
    searchIndex(idx, 'warm up');
    const t0 = performance.now();
    for (const q of queries) searchIndex(idx, q);
    const avg = (performance.now() - t0) / queries.length;
    // Typically a few ms; the bound leaves room for slow CI machines.
    expect(avg).toBeLessThan(50);
  });
});

describe('featured tools', () => {
  it('keeps known tool paths in order, without duplicates, at most FEATURED_MAX', () => {
    expect(cleanFeatured(['/salary-calculator', '/nope', '/salary-calculator', 7, '/budget'])).toEqual(['/salary-calculator', '/budget']);
    const many = featurableToolPaths().slice(0, FEATURED_MAX + 3);
    expect(cleanFeatured(many)).toHaveLength(FEATURED_MAX);
  });

  it('defaults are all featurable tools', () => {
    expect(cleanFeatured(DEFAULT_FEATURED_TOOLS)).toEqual(DEFAULT_FEATURED_TOOLS);
    expect(DEFAULT_FEATURED_TOOLS).toEqual(['/salary-calculator', '/when-in-germany', '/blue-card-check', '/visa-document-checklist', '/health-insurance-comparison', '/german-mock-exam/a1']);
  });
});
