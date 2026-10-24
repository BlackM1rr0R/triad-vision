import { describe, expect, it } from 'vitest';
import { conceptsIn, editDistance, fold, parseQuery, stripMarkdown } from '../../src/lib/search/text.js';
import { buildDocs, buildIndex, highlightRanges, loggableTerm, makeSnippet, searchIndex } from '../../src/lib/search/index.js';
import type { SeoData } from '../../src/lib/seo.js';
import { COMPARE_CRITERIA, COMPARE_ROUTES, compareContent, currentThresholds, formatAmount } from '../../src/lib/compare/visaCompare.js';
import { SEO_LOCALES } from '../../src/lib/seoCatalogue.js';
import { parseBlocks } from '../../src/lib/leadMagnets/starterEbook.js';
import { downloadToken, fileLocaleFor, filesOf, verifyDownloadToken } from '../../src/lib/leadMagnets/service.js';
import { alertMatches, kindOf, maskEmail, vacancyProfession } from '../../src/lib/jobAlerts/service.js';
import { storyVideo, youtubeId } from '../../src/lib/seo.js';

const D = new Date('2026-10-01T00:00:00Z');
const l = (s: string) => ({ az: `${s}`, de: `${s}`, en: `${s}`, ru: `${s}` });

const guide = (key: string, locale: string, title: string, body: string) => ({
  id: `${key}-${locale}`,
  key,
  locale,
  slug: `${key}-${locale}`,
  title,
  description: `${title} description`,
  body,
  faq: [],
  published: true,
  createdAt: D,
  updatedAt: D,
});

const data: SeoData = {
  visas: [
    {
      slug: 'blue-card',
      title: { az: 'AB Mavi Kartı', de: 'Blaue Karte EU', en: 'EU Blue Card', ru: 'Голубая карта ЕС' },
      summary: { az: 'Ali təhsilli mütəxəssislər üçün', de: 'Für Akademiker', en: 'For university graduates', ru: 'Для специалистов с высшим образованием' },
      image: '',
      updatedAt: D,
      visaLabel: '§18g',
    },
  ],
  services: [{ slug: 'translation', title: l('Translation of documents'), summary: l('Sworn translators'), image: '', updatedAt: D }],
  posts: [],
  faqs: [{ question: l('How long does the visa take?'), answer: l('Usually 2 to 4 months after the embassy appointment.') }],
  jobs: [
    {
      slug: 'lkw-fahrer-hamburg',
      title: { az: 'Yük maşını sürücüsü', de: 'LKW-Fahrer (CE)', en: 'Truck driver (CE)', ru: 'Водитель грузовика' },
      description: l('Long distance tours from Hamburg'),
      requirements: null,
      benefits: null,
      city: 'Hamburg',
      employmentType: 'FULL_TIME',
      salaryMin: 2800,
      salaryMax: 3400,
      positions: 2,
      showCompany: false,
      publishedAt: D,
      closesAt: null,
      createdAt: D,
      updatedAt: D,
      company: null,
    },
  ],
  settings: {},
  rating: null,
  guides: [
    guide('chancenkarte', 'de', 'Chancenkarte 2026: Punkte und Ablauf', 'Die **Chancenkarte** (§ 20a) erlaubt die Jobsuche. Siehe [Rechner](/chancenkarte-calculator).'),
    guide('chancenkarte', 'en', 'Opportunity Card 2026: points and rules', 'The Opportunity Card lets you look for a job for up to one year.'),
    guide('ausbildung', 'en', 'Ausbildung in Germany 2026', 'Vocational training with a monthly allowance.'),
  ],
};

describe('search text helpers', () => {
  it('folds Azerbaijani / Turkish / German letters and keeps Cyrillic', () => {
    expect(fold('Fırsat Kartı')).toBe('firsat karti');
    expect(fold('Ölkə ŞƏHƏR çörək ğ')).toBe('olke seher corek g');
    expect(fold('Größe')).toBe('grosse');
    expect(fold('Голубая Карта')).toBe('голубая карта');
  });

  it('edit distance stops early and allows typos only for longer words', () => {
    expect(editDistance('chancenkarte', 'chancekarte', 2)).toBe(1);
    expect(editDistance('blue', 'glue', 0)).toBe(1);
    expect(editDistance('abcdef', 'uvwxyz', 1)).toBe(2);
  });

  it('maps synonyms in every language to one concept', () => {
    const a = parseQuery(fold('imkan kartı almaniya'));
    const b = parseQuery(fold('Opportunity Card'));
    const c = parseQuery(fold('карта возможностей'));
    expect(a.concepts[0].id).toBe(b.concepts[0].id);
    expect(c.concepts[0].id).toBe(b.concepts[0].id);
    expect(a.words).toEqual(['almaniya']);
    expect(conceptsIn(fold('Blaue Karte EU'))).toEqual(conceptsIn(fold('Mavi Kart')));
  });

  it('strips the guide markdown subset', () => {
    expect(stripMarkdown('## Title\n\nSee **bold** and [link](/x).\n\n| a | b |\n|---|---|\n| 1 | 2 |')).not.toMatch(/[#*[\]|]/);
  });
});

describe('site search index', () => {
  const index = (lng: 'en' | 'de' | 'tr' | 'az') => buildIndex(buildDocs(data, lng));

  it('finds a German guide through a Turkish / Azerbaijani synonym and localises URLs', () => {
    const hits = searchIndex(index('de'), 'fırsat kartı');
    expect(hits.slice(0, 2).map((h) => h.id).sort()).toEqual(['guide:chancenkarte', 'page:/chancenkarte-calculator']);
    expect(hits.find((h) => h.type === 'guide')).toMatchObject({ url: '/de/guides/chancenkarte-de' });
    expect(searchIndex(index('az'), 'imkan karti').some((h) => h.id === 'guide:chancenkarte')).toBe(true);
  });

  it('tr falls back to English CMS text and English guides', () => {
    const hits = searchIndex(index('tr'), 'opportunity');
    expect(hits[0]).toMatchObject({ id: 'guide:chancenkarte', url: '/en/guides/chancenkarte-en' });
    expect(searchIndex(index('tr'), 'truck')[0]).toMatchObject({ type: 'job', url: '/tr/jobs/lkw-fahrer-hamburg' });
  });

  it('tolerates typos, prefixes and accents', () => {
    expect(searchIndex(index('en'), 'Ausbildng')[0].id).toBe('guide:ausbildung');
    expect(searchIndex(index('en'), 'transl')[0].id).toBe('service:translation');
    expect(searchIndex(index('az'), 'mavi karti').some((h) => h.id === 'visa:blue-card')).toBe(true);
  });

  it('ranks title matches first, includes tools and highlights the matched words', () => {
    const hits = searchIndex(index('en'), 'salary calculator');
    expect(hits[0].type).toBe('tool');
    const visa = searchIndex(index('en'), 'blue card').find((h) => h.id === 'visa:blue-card')!;
    expect(visa.titleHighlights.length).toBeGreaterThan(0);
    expect(visa.meta).toBe('§18g');
  });

  it('returns nothing for gibberish and empty queries', () => {
    expect(searchIndex(index('en'), 'qqqqzzzz')).toEqual([]);
    expect(searchIndex(index('en'), '   ')).toEqual([]);
  });

  it('builds snippets around the first match', () => {
    const text = `${'lorem ipsum '.repeat(40)}the visa decision ${'dolor '.repeat(40)}`;
    const { snippet, highlights } = makeSnippet(text, new Set(['visa']));
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.slice(highlights[0][0], highlights[0][1])).toBe('visa');
    expect(highlightRanges('Fırsat Kartı', new Set(['firsat']))).toEqual([[0, 6]]);
  });

  it('never logs terms that could be personal data', () => {
    expect(loggableTerm('ali@example.com')).toBeNull();
    expect(loggableTerm('+994 50 123 45 67')).toBeNull();
    expect(loggableTerm('AB1234567')).toBeNull();
    expect(loggableTerm('x')).toBeNull();
    expect(loggableTerm('  Fırsat Kartı ')).toBe('firsat karti');
  });
});

describe('visa comparison content', () => {
  const t = currentThresholds({ blueCard: { '2026': { standard: 50_700, shortage: 45_934.2 } }, olderWorker: { '2026': 55_770 } }, new Date('2026-05-01'));

  it('is complete in all six languages, with the thresholds filled in', () => {
    for (const lng of SEO_LOCALES) {
      const c = compareContent(lng, t);
      expect(c.routes.map((r) => r.key)).toEqual([...COMPARE_ROUTES]);
      for (const r of c.routes) for (const k of COMPARE_CRITERIA) expect(r.cells[k].length).toBeGreaterThan(1);
      expect(c.faq.length).toBe(5);
      expect(JSON.stringify(c)).not.toMatch(/\{(bcStandard|bcShortage|olderWorker)\}/);
    }
    expect(compareContent('de', t).routes[1].cells.salary).toContain('50.700');
    expect(compareContent('en', t).faq[1].a).toContain('45,934.20');
    expect(formatAmount(50_700, 'az')).toMatch(/^50[\s.  ]?700$/);
  });

  it('uses the latest configured year when the current one is missing', () => {
    expect(currentThresholds({ blueCard: { '2025': { standard: 1, shortage: 2 } }, olderWorker: {} }, new Date('2027-01-02')).year).toBe('2025');
  });
});

describe('starter e-book markdown blocks', () => {
  it('parses headings, lists, notes and tables', () => {
    const blocks = parseBlocks('## A\n\nText **b** [x](/y).\n\n- one\n- two\n\n1. first\n2. second\n\n> note\n\n| h1 | h2 |\n|---|---|\n| c1 | c2 |');
    expect(blocks.map((b) => b.kind)).toEqual(['h2', 'p', 'ul', 'ol', 'note', 'table']);
    expect(blocks[1]).toEqual({ kind: 'p', text: 'Text b x.' });
    expect(blocks[5]).toEqual({ kind: 'table', rows: [['h1', 'h2'], ['c1', 'c2']] });
  });
});

describe('lead magnet download tokens', () => {
  it('verifies signature, language and expiry', () => {
    const token = downloadToken('magnet1', 'tr', 1_000);
    expect(verifyDownloadToken(token, 2_000)).toEqual({ magnetId: 'magnet1', lng: 'tr' });
    expect(verifyDownloadToken(token, 1_000 + 8 * 24 * 3600 * 1000)).toBeNull();
    expect(verifyDownloadToken(token.replace('.tr.', '.de.'), 2_000)).toBeNull();
    expect(verifyDownloadToken('nonsense', 2_000)).toBeNull();
  });

  it('falls back to English, Azerbaijani, then any PDF', () => {
    const files = filesOf({ az: 'a.pdf', en: 'e.pdf', xx: 'bad.pdf', de: '../evil' });
    expect(files).toEqual({ az: 'a.pdf', en: 'e.pdf' });
    expect(fileLocaleFor(files, 'uk')).toBe('en');
    expect(fileLocaleFor({ ru: 'r.pdf' }, 'de')).toBe('ru');
    expect(fileLocaleFor({}, 'de')).toBeNull();
  });
});

describe('job alert matching', () => {
  const v = (over: Record<string, unknown> = {}) => ({ profession: 'LKW-Fahrer', title: l('x'), germanLevel: 'A2', employmentType: 'FULL_TIME', ...over }) as never;

  it('matches the same profession or family, the German level and the job kind', () => {
    expect(alertMatches({ professions: ['truck_driver'], germanLevel: 'B1', visaTypes: null }, v())).toBe(true);
    expect(alertMatches({ professions: ['bus_driver'], germanLevel: null, visaTypes: null }, v())).toBe(true); // same family
    expect(alertMatches({ professions: ['nurse'], germanLevel: null, visaTypes: null }, v())).toBe(false);
    expect(alertMatches({ professions: ['truck_driver'], germanLevel: 'A1', visaTypes: null }, v())).toBe(false);
    expect(alertMatches({ professions: ['truck_driver'], germanLevel: null, visaTypes: ['ausbildung'] }, v())).toBe(false);
    expect(alertMatches({ professions: ['nurse'], germanLevel: null, visaTypes: ['ausbildung'] }, v({ profession: null, title: { de: 'Ausbildung Pflegefachfrau' }, employmentType: 'AUSBILDUNG' }))).toBe(true);
  });

  it('helpers', () => {
    expect(vacancyProfession({ profession: null, title: { de: 'Koch (m/w/d)' } } as never)).toBe('cook');
    expect(kindOf('SEASONAL')).toBe('seasonal');
    expect(maskEmail('ali@example.com')).toBe('a**@example.com');
  });
});

describe('story videos', () => {
  it('accepts YouTube / Vimeo links and uploaded MP4s only', () => {
    expect(storyVideo('https://youtu.be/dQw4w9WgXcQ')?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(storyVideo('https://vimeo.com/123456')?.embedUrl).toContain('player.vimeo.com/video/123456');
    expect(storyVideo('/uploads/1-abc.mp4')).toEqual({ embedUrl: null, contentUrl: '/uploads/1-abc.mp4' });
    expect(storyVideo('https://evil.example/video.mp4')).toBeNull();
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('dQw4w9WgXcQ');
  });
});
