import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CityCost } from '@prisma/client';
import { computeBudget, type BudgetInput } from '../../src/lib/budget/budget.js';
import { DEFAULT_CITY_COSTS, publicCity } from '../../src/lib/budget/cities.js';
import { bakuDay, cbarUrl, parseCbarXml, toAzn } from '../../src/lib/life/cbar.js';
import { CATEGORY_OF, CONTENTS_INSURANCE, LIFE_CATEGORIES, bakuComparison, simulateLife } from '../../src/lib/life/simulate.js';
import { LIFE_DEFAULTS, NATIONAL_AVERAGE_DEFAULT, lifeSettingsSchema } from '../../src/lib/life/settings.js';
import { MONTHLY_KEYS } from '../../src/lib/budget/budget.js';

/**
 * "Life in Germany" simulator: the monthly maths on top of the first-month budget engine, the AZN conversion,
 * the Baku comparison, the CBAR XML bulletin parser (real bulletin layout, fixture) and the article content.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const rows: CityCost[] = DEFAULT_CITY_COSTS.map((d, i) => ({ ...d, id: `c${i}`, createdAt: new Date(), updatedAt: new Date() }));
const city = (slug: string) => publicCity(rows.find((r) => r.slug === slug)!);

const base: BudgetInput = {
  gross: 3_000,
  taxClass: 1,
  church: false,
  age: 30,
  state: 'BE',
  household: 'single',
  children: 0,
  housing: 'flat',
  companyRent: null,
  start: '2026-12-01',
  arrival: null,
  blockedAccountYear: 0,
};

describe('simulateLife', () => {
  it('maps every budget line to a category', () => {
    for (const k of MONTHLY_KEYS) expect(LIFE_CATEGORIES).toContain(CATEGORY_OF[k]);
  });

  it('single in a Berlin flat: categories add up, savings = income − costs, contents insurance included', () => {
    const b = computeBudget(base, city('berlin'));
    const s = simulateLife(b, null);
    const monthlyLow = b.monthly.items.reduce((a, l) => a + l.amount[0], 0);
    const monthlyHigh = b.monthly.items.reduce((a, l) => a + l.amount[1], 0);
    expect(s.costs[0]).toBe(Math.round(monthlyLow) + CONTENTS_INSURANCE[0]);
    expect(s.costs[1]).toBe(Math.round(monthlyHigh) + CONTENTS_INSURANCE[1]);
    expect(s.lines.map((l) => l.key)).toEqual(['rent', 'utilities', 'food', 'transport', 'phoneInternet', 'insurance', 'personal']);
    expect(s.lines.find((l) => l.key === 'transport')!.amount).toEqual([63, 63]); // one Deutschlandticket
    expect(s.net).toBe(b.net.net);
    expect(s.deductions).toBeCloseTo(3_000 - b.net.net, 2);
    expect(s.savings).toEqual([Math.round(s.income - s.costs[1]), Math.round(s.income - s.costs[0])]);
    expect(s.savingsMid).toBe(Math.round(s.income - s.lines.reduce((a, l) => a + l.mid, 0)));
    expect(s.savingsRate).toBeCloseTo(s.savingsMid / s.income, 2);
    // no rate → no AZN figures
    expect(s.azn).toMatchObject({ rate: null, gross: null, net: null, savings: null, lines: {} });
  });

  it('a WG room has no separate utilities, internet or contents insurance', () => {
    const s = simulateLife(computeBudget({ ...base, housing: 'wg' }, city('berlin')), null);
    expect(s.lines.find((l) => l.key === 'utilities')!.amount[0]).toBe(0); // Rundfunk may be shared: [0, 18]
    expect(s.lines.find((l) => l.key === 'insurance')!.amount[1]).toBeLessThan(10);
  });

  it('a family: two adults, children, Kindergeld counted as income, more rent than a single', () => {
    const single = simulateLife(computeBudget(base, city('leipzig')), null);
    const fam = simulateLife(computeBudget({ ...base, household: 'family', children: 2, taxClass: 3, state: 'SN' }, city('leipzig')), null);
    expect(fam.kindergeld).toBe(2 * 259);
    expect(fam.income).toBeCloseTo(fam.net + fam.kindergeld, 2);
    expect(fam.lines.find((l) => l.key === 'rent')!.mid).toBeGreaterThan(single.lines.find((l) => l.key === 'rent')!.mid);
    expect(fam.lines.find((l) => l.key === 'transport')!.amount).toEqual([126, 126]); // two tickets
  });

  it('converts to AZN with the CBAR rate (whole manat)', () => {
    const s = simulateLife(computeBudget(base, city('berlin')), 1.8805);
    expect(s.azn.rate).toBe(1.8805);
    expect(s.azn.gross).toBe(Math.round(3_000 * 1.8805));
    expect(s.azn.net).toBe(Math.round(s.net * 1.8805));
    expect(s.azn.savings).toBe(Math.round(s.savingsMid * 1.8805));
    expect(s.azn.lines.rent).toBe(Math.round(s.lines[0].mid * 1.8805));
    expect(toAzn(100, 1.8805)).toBe(188);
    expect(toAzn(100, null)).toBeNull();
  });

  it('a low salary in Munich can leave a deficit (negative savings)', () => {
    const s = simulateLife(computeBudget({ ...base, gross: 2_100, household: 'family', children: 3, taxClass: 3, state: 'BY' }, city('muenchen')), null);
    expect(s.savings[0]).toBeLessThan(0);
  });
});

describe('bakuComparison', () => {
  const sim = simulateLife(computeBudget(base, city('berlin')), 1.88);
  const national = NATIONAL_AVERAGE_DEFAULT;

  it('falls back to the national average (labelled) when no profession figure is set', () => {
    const c = bakuComparison(sim, { enabled: true, profession: null, national })!;
    expect(c).toMatchObject({ kind: 'national', year: 2025, grossAzn: 1_103 });
    expect(c.grossRatio).toBeCloseTo(sim.azn.gross! / 1_102.9, 1);
    expect(c.savingsInBakuSalaries).toBeCloseTo(sim.azn.savings! / 1_102.9, 1);
  });

  it('uses the staff figure for the profession', () => {
    const c = bakuComparison(sim, { enabled: true, profession: { grossAzn: 1_500, note: 'job ads Nov 2026' }, national })!;
    expect(c).toMatchObject({ kind: 'profession', grossAzn: 1_500, source: 'job ads Nov 2026', year: null });
  });

  it('is null when switched off, without a rate or without any figure', () => {
    expect(bakuComparison(sim, { enabled: false, national })).toBeNull();
    expect(bakuComparison(simulateLife(computeBudget(base, city('berlin')), null), { enabled: true, national })).toBeNull();
    expect(bakuComparison(sim, { enabled: true, profession: { grossAzn: null, note: '' }, national: { ...national, grossAzn: null } })).toBeNull();
  });

  it('settings defaults: board on everywhere, Baku block on with the national average', () => {
    expect(LIFE_DEFAULTS.board).toEqual({ enabled: true, showOnHome: true, showOnAbout: true });
    expect(LIFE_DEFAULTS.baku.nationalAverage).toEqual(NATIONAL_AVERAGE_DEFAULT);
    expect(lifeSettingsSchema.safeParse({ baku: { professions: { pilot: { grossAzn: 1 } } } }).success).toBe(false);
  });
});

describe('CBAR bulletin', () => {
  const xml = fs.readFileSync(path.join(here, 'fixtures', 'cbar-2026-11-13.xml'), 'utf8');

  it('reads the EUR rate and the bulletin date (not the requested date)', () => {
    expect(parseCbarXml(xml)).toEqual({ rate: 1.8805, date: '2026-11-13' });
    expect(parseCbarXml(xml, 'USD')).toEqual({ rate: 1.7, date: '2026-11-13' });
  });

  it('divides by the nominal (100 JPY) and ignores metal blocks', () => {
    expect(parseCbarXml(xml, 'JPY')!.rate).toBeCloseTo(0.011012, 6);
    expect(parseCbarXml(xml.replace(/<ValType Type="Xarici valyutalar">[\s\S]*<\/ValType>/, ''))).toBeNull(); // only metals left
  });

  it('rejects error pages, missing EUR, broken dates and absurd values', () => {
    expect(parseCbarXml('<html><body>503</body></html>')).toBeNull();
    expect(parseCbarXml(xml.replace('Code="EUR"', 'Code="XXX"'))).toBeNull();
    expect(parseCbarXml(xml.replace('Date="13.11.2026"', 'Date="2026-11-13"'))).toBeNull();
    expect(parseCbarXml(xml.replace('<Value>1.8805</Value>', '<Value>0</Value>'))).toBeNull();
    expect(parseCbarXml(xml.replace('<Value>1.8805</Value>', '<Value>188.05</Value>'))).toBeNull();
    expect(parseCbarXml(xml.replace('<Value>1.8805</Value>', '<Value>1,8805</Value>'))).toEqual({ rate: 1.8805, date: '2026-11-13' });
  });

  it('builds the bulletin URL for the Baku calendar day (UTC+4)', () => {
    expect(cbarUrl(new Date('2026-11-14T21:30:00Z'))).toBe('https://www.cbar.az/currencies/15.11.2026.xml');
    expect(bakuDay(new Date('2026-11-14T19:59:00Z')).iso).toBe('2026-11-14');
  });
});

// ─── Article under the simulator (client/src/lib/seoContent/life.ts) ──────────────

type Block = string | { h3: string } | { ul: string[] } | { ol: string[] } | { table: { head: string[]; rows: string[][] } } | { note: string } | { slot: string };
type Page = { eyebrow: string; sections: { id: string; h2: string; blocks: Block[] }[]; faqTitle: string; faq: { q: string; a: string }[]; sources: string; labels?: Record<string, string> };

describe('life article content', () => {
  it('has the same structure in all six languages and only known placeholders', async () => {
    const lib = (rel: string) => pathToFileURL(path.resolve(here, '../../../client/src/lib', rel)).href;
    const types = (await import(/* @vite-ignore */ lib('seoContent/types.ts'))) as { CONTENT_LOCALES: readonly string[]; allStrings: (p: Page) => string[]; placeholdersOf: (s: string) => string[] };
    const { lifeContent, LIFE_VARS } = (await import(/* @vite-ignore */ lib('seoContent/life.ts'))) as { lifeContent: Record<string, Page>; LIFE_VARS: readonly string[] };
    expect(Object.keys(lifeContent).sort()).toEqual([...types.CONTENT_LOCALES].sort());
    const shape = (p: Page) => ({ sections: p.sections.map((s) => [s.id, s.blocks.map((b) => (typeof b === 'string' ? 'p' : Object.keys(b)[0]))]), faq: p.faq.length });
    const az = shape(lifeContent.az);
    for (const lng of types.CONTENT_LOCALES) {
      const page = lifeContent[lng];
      expect(shape(page), lng).toEqual(az);
      expect(page.faq.length).toBeGreaterThanOrEqual(4);
      for (const s of types.allStrings(page)) for (const v of types.placeholdersOf(s)) expect(LIFE_VARS, `${lng}: {{${v}}}`).toContain(v);
    }
  });
});
