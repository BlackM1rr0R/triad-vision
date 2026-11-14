import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { CURRENT_PARAMS } from '../../src/lib/budget/params.js';

/**
 * client/src/lib/seoContent: the explanatory articles under the salary calculator, the Chancenkarte points
 * calculator, the Blue Card check and the city guide. Structure is the same in all six languages, every
 * {{placeholder}} is one the page fills, and the facts written out in the text agree with the code that
 * computes them (payroll parameters, Chancenkarte points, city data).
 */

type Block = string | { h3: string } | { ul: string[] } | { ol: string[] } | { table: { head: string[]; rows: string[][] } } | { note: string } | { slot: string };
type Page = { eyebrow: string; sections: { id: string; h2: string; blocks: Block[] }[]; faqTitle: string; faq: { q: string; a: string }[]; sources: string; labels?: Record<string, string> };
type Localized = Record<string, Page>;

const here = path.dirname(fileURLToPath(import.meta.url));
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ pathToFileURL(path.resolve(here, '../../../client/src/lib', rel)).href)) as T;

let types: { CONTENT_LOCALES: readonly string[]; allStrings: (p: Page) => string[]; placeholdersOf: (s: string) => string[]; formatEuro: (n: number, l: string, c?: boolean) => string; formatPercent: (n: number, l: string, d?: number) => string };
let salary: { salaryContent: Localized; SALARY_EXAMPLES: readonly { id: string }[] };
let ck: { chancenkarteContent: Localized; CK_EXAMPLES: { id: string; input: unknown }[] };
let ckLib: { scoreChancenkarte: (i: unknown) => { status: string; points: number }; POINTS: Record<string, unknown> };
let cities: { citiesContent: Localized };
let blue: { blueCardContent: Localized; BLUE_CARD_HISTORY: readonly { year: number; bbg: number }[] };
let cityData: { CITIES: { slug: string }[] };
let cityCalc: { keyFigures: (c: unknown) => { single: [number, number] } };

beforeAll(async () => {
  types = await load('seoContent/types.ts');
  salary = await load('seoContent/salary.ts');
  ck = await load('seoContent/chancenkarte.ts');
  ckLib = await load('chancenkarte.ts');
  cities = await load('seoContent/cities.ts');
  blue = await load('seoContent/blueCard.ts');
  cityData = await load('cities/data.ts');
  cityCalc = await load('cities/calc.ts');
});

/** Placeholders each page component fills (SalaryArticle, ChancenkarteArticle, BlueCardArticle, CitiesArticle). */
const VARS: Record<string, string[]> = {
  salary: ['gfb', 'anp', 'soliFree', 'bbgRv', 'bbgRvMonth', 'bbgKv', 'bbgKvMonth', 'jaeg', 'jaegMonth', 'minijob', 'midijob', 'zusatz', 'zusatzHalf', 'kindergeld', 'gross3000', 'net3000', 'net3000VI', 'diffVI', 'share3000', 'checked'],
  chancenkarte: ['checked'],
  blueCard: ['bbg', 'standard', 'shortage', 'older', 'standardMonth', 'shortageMonth', 'netStandard', 'checked'],
  cities: ['munich1', 'leipzig1', 'munichSingle', 'berlinSingle', 'leipzigSingle', 'ticket', 'gross', 'year', 'checked', 'net'],
};
const SLOTS: Record<string, string[]> = { salary: ['examples'], chancenkarte: ['examples'], blueCard: ['history'], cities: ['costs'] };

const shape = (p: Page) => ({
  sections: p.sections.map((s) => ({ id: s.id, blocks: s.blocks.map((b) => (typeof b === 'string' ? 'p' : 'slot' in b ? `slot:${b.slot}` : 'table' in b ? `table:${b.table.head.length}x${b.table.rows.length}` : 'ul' in b ? `ul:${b.ul.length}` : 'ol' in b ? `ol:${b.ol.length}` : Object.keys(b)[0])) })),
  faq: p.faq.length,
  labels: Object.keys(p.labels ?? {}).sort(),
});

describe('seoContent: structure in all six languages', () => {
  const pages = () => ({ salary: salary.salaryContent, chancenkarte: ck.chancenkarteContent, blueCard: blue.blueCardContent, cities: cities.citiesContent });

  it('has the same sections, blocks, FAQ count and labels in every language', () => {
    for (const [name, content] of Object.entries(pages())) {
      expect(Object.keys(content).sort(), name).toEqual([...types.CONTENT_LOCALES].sort());
      const ref = shape(content.de);
      for (const l of types.CONTENT_LOCALES) expect(shape(content[l]), `${name} ${l}`).toEqual(ref);
      expect(content.de.faq.length, name).toBeGreaterThanOrEqual(5);
      expect(content.de.sections.flatMap((s) => s.blocks).filter((b) => typeof b === 'object' && 'slot' in b).map((b) => (b as { slot: string }).slot), name).toEqual(SLOTS[name]);
    }
  });

  it('uses only placeholders the page fills and has no empty strings or broken inline markup', () => {
    for (const [name, content] of Object.entries(pages())) {
      for (const l of types.CONTENT_LOCALES) {
        for (const s of types.allStrings(content[l])) {
          expect(s.trim(), `${name} ${l}`).not.toBe('');
          for (const v of types.placeholdersOf(s)) expect(VARS[name], `${name} ${l}: {{${v}}} in "${s.slice(0, 60)}"`).toContain(v);
          expect((s.match(/\*\*/g) ?? []).length % 2, `${name} ${l} bold: ${s.slice(0, 60)}`).toBe(0);
          for (const m of s.matchAll(/\]\(([^)]*)\)/g)) expect(m[1], `${name} ${l} link`).toMatch(/^\/[a-z-]*$/);
        }
      }
    }
  });

  it('writes Azerbaijani with its own letters (not a transliteration)', () => {
    for (const content of Object.values(pages())) expect(types.allStrings(content.az).join(' ')).toMatch(/[əğıöüşç]/);
  });
});

describe('seoContent: facts agree with the code', () => {
  const P = CURRENT_PARAMS.payroll;

  it('salary article: the written-out 2026 rates are the payroll parameters', () => {
    expect(P.year).toBe(2026);
    expect(P.social.pensionEmployee).toBe(0.093);
    expect(P.social.unemploymentEmployee).toBe(0.013);
    expect(P.social.healthEmployee).toBe(0.073);
    expect(P.social.careEmployee).toBe(0.018);
    expect(P.social.careEmployeeSaxony).toBe(0.023);
    expect(P.social.careChildlessSurcharge).toBe(0.006);
    expect(P.social.careChildlessFromAge).toBe(23);
    expect(P.social.careReductionPerChild).toBe(0.0025);
    expect(P.social.averageZusatzbeitrag).toBe(0.029);
    expect(P.social.bbgRvAlvYear).toBe(101_400);
    expect(P.social.bbgKvPvYear).toBe(69_750);
    expect(P.social.jaegYear).toBe(77_400);
    expect(P.church).toMatchObject({ low: 0.08, default: 0.09 });
    // childless employee total: 9.3 + 1.3 + 7.3 + 1.45 + 2.4 = 21.75 %
    const total = P.social.pensionEmployee + P.social.unemploymentEmployee + P.social.healthEmployee + P.social.averageZusatzbeitrag / 2 + P.social.careEmployee + P.social.careChildlessSurcharge;
    expect(Math.round(total * 10_000) / 100).toBe(21.75);
    const de = types.allStrings(salary.salaryContent.de).join('\n');
    for (const s of ['18,6 %', '9,3 %', '2,6 %', '1,3 %', '14,6 %', '7,3 %', '3,6 %', '1,8 %', '2,3 %', '2,4 %', '0,6', '0,25', '21,75 %', '8 %', '9 %']) expect(de).toContain(s);
  });

  it('salary article: every worked example has a label in every language', () => {
    for (const l of types.CONTENT_LOCALES) for (const ex of salary.SALARY_EXAMPLES) expect(salary.salaryContent[l].labels![ex.id], `${l} ${ex.id}`).toBeTruthy();
  });

  it('Chancenkarte article: the points table matches the calculator and the examples score as described', () => {
    const rows = (ck.chancenkarteContent.de.sections.find((s) => s.id === 'punkte')!.blocks[0] as { table: { rows: string[][] } }).table.rows.map((r) => Number(r[1]));
    expect(rows).toEqual([4, 3, 2, 1, 1, 3, 2, 1, 2, 1, 1, 1]);
    expect(ckLib.POINTS).toMatchObject({ partialRecognition: 4, shortage: 1, stay: 1, partner: 1, german: { A2: 1, B1: 2, B2: 3 }, english: { C1: 1 }, experience: { two: 2, five: 3 }, age: { u35: 2, u40: 1 } });
    const scored = Object.fromEntries(ck.CK_EXAMPLES.map((e) => [e.id, ckLib.scoreChancenkarte(e.input)]));
    expect(scored.driver).toMatchObject({ status: 'eligible', points: 6 });
    expect(scored.nurse).toMatchObject({ status: 'eligible', points: 10 });
    expect(scored.it).toMatchObject({ status: 'eligible', points: 6 });
    expect(scored.electrician).toMatchObject({ status: 'notYet', points: 2 });
  });

  it('Blue Card article: thresholds derived from the ceiling equal the BMI notice for 2026', () => {
    const bbg = P.social.bbgRvAlvYear;
    expect(bbg * 0.5).toBe(50_700);
    expect(Math.round(bbg * 0.453 * 100) / 100).toBe(45_934.2);
    expect(Math.round(bbg * 0.55)).toBe(55_770);
    expect(blue.BLUE_CARD_HISTORY.map((h) => [h.year, h.bbg * 0.5, Math.round(h.bbg * 0.453 * 100) / 100])).toEqual([
      [2024, 45_300, 41_041.8],
      [2025, 48_300, 43_759.8],
    ]);
  });

  it('city article: the cities it names as cheapest and most expensive are so in the city data', () => {
    const ranked = cityData.CITIES.filter((c) => c.slug !== 'small-town')
      .map((c) => ({ slug: c.slug, mid: cityCalc.keyFigures(c).single[0] }))
      .sort((a, b) => a.mid - b.mid);
    expect(ranked.slice(0, 4).map((c) => c.slug).sort()).toEqual(['dortmund', 'dresden', 'essen', 'leipzig']);
    expect(ranked.at(-1)!.slug).toBe('muenchen');
    expect(cityData.CITIES).toHaveLength(15); // "15 places compared"
  });

  it('formats euros and percents identically on server and browser (no Intl)', () => {
    expect(types.formatEuro(101_400, 'de')).toBe('101.400 €');
    expect(types.formatEuro(5_812.5, 'en', true)).toBe('€5,812.50');
    expect(types.formatEuro(45_934.2, 'az', true)).toBe('45 934,20 €');
    expect(types.formatPercent(0.029, 'tr')).toBe('%2,9');
    expect(types.formatPercent(0.0145, 'de', 2)).toBe('1,45 %');
  });
});
