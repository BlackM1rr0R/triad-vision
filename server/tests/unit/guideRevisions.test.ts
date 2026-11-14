import { describe, expect, it } from 'vitest';
import { GUIDES } from '../../prisma/seed/guides/index.js';
import { GUIDE_FIELDS, GUIDE_REVISIONS, guideFieldHash, guideRevisionHashes } from '../../prisma/seed/guides/revisions.js';
import { GUIDE_LOCALES } from '../../prisma/seed/guides/types.js';
import { CURRENT_PARAMS } from '../../src/lib/budget/params.js';
import { calculateSalary, DEFAULT_INPUT } from '../../src/lib/budget/salary.js';

const blueCard = GUIDES.find((g) => g.key === 'blue-card')!;

describe('guide revisions (updates of shipped guide texts)', () => {
  it('has unique ids, known keys and a previous hash per language and field that differs from the current text', () => {
    expect(new Set(GUIDE_REVISIONS.map((r) => r.id)).size).toBe(GUIDE_REVISIONS.length);
    for (const rev of GUIDE_REVISIONS) {
      const guide = GUIDES.find((g) => g.key === rev.key);
      expect(guide, rev.key).toBeDefined();
      const now = guideRevisionHashes(guide!);
      for (const l of GUIDE_LOCALES) {
        const prev = rev.previous[l];
        expect(prev, `${rev.id} ${l}`).toBeDefined();
        for (const f of GUIDE_FIELDS) {
          if (!prev![f]) continue;
          expect(prev![f], `${rev.id} ${l} ${f}`).toMatch(/^[0-9a-f]{64}$/);
          // A revision whose "previous" already equals the current text would never update anything.
          expect(prev![f], `${rev.id} ${l} ${f} unchanged`).not.toBe(now[l][f]);
        }
      }
    }
  });

  it('normalises line endings and whitespace, and compares the FAQ by question and answer only', () => {
    expect(guideFieldHash('body', 'a\r\nb\n')).toBe(guideFieldHash('body', 'a\nb'));
    expect(guideFieldHash('faq', [{ a: 'x', q: 'y' }])).toBe(guideFieldHash('faq', [{ q: 'y', a: 'x' }]));
    expect(guideFieldHash('faq', [{ q: 'y', a: 'x' }])).not.toBe(guideFieldHash('faq', [{ q: 'y', a: 'z' }]));
  });
});

describe('Blue Card guide 2026', () => {
  const bbg = CURRENT_PARAMS.payroll.social.bbgRvAlvYear;

  it('puts 2026 and the minimum salary into the titles (de: "Mindestgehalt") and keeps the slugs', () => {
    expect(blueCard.pages.de.title).toMatch(/2026/);
    expect(blueCard.pages.de.title).toMatch(/Mindestgehalt|Gehaltsgrenze/);
    expect(blueCard.pages.de.slug).toBe('blaue-karte-eu');
    for (const l of GUIDE_LOCALES) {
      expect(blueCard.pages[l].title).toMatch(/2026/);
      expect(blueCard.pages[l].title.length).toBeLessThanOrEqual(60);
      expect(blueCard.pages[l].description.length).toBeLessThanOrEqual(155);
      expect(blueCard.pages[l].description.length).toBeGreaterThanOrEqual(120);
      expect(blueCard.pages[l].faq.length).toBeLessThanOrEqual(6);
    }
  });

  it('derives the thresholds from the pension ceiling (§ 18g: 50 % / 45.3 %, BAnz AT 18.12.2025 B3)', () => {
    expect(bbg).toBe(101_400);
    expect(bbg * 0.5).toBe(50_700);
    expect(Math.round(bbg * 0.453 * 100) / 100).toBe(45_934.2);
    expect(blueCard.pages.de.body).toContain('| 2026 | 101.400 € | 50.700 € | 45.934,20 € |');
    expect(blueCard.pages.de.body).toContain('| 2025 | 96.600 € | 48.300 € | 43.759,80 € |');
    expect(blueCard.pages.de.body).toContain('| 2024 | 90.600 € | 45.300 € | 41.041,80 € |');
    for (const l of GUIDE_LOCALES) expect(blueCard.pages[l].body, l).toMatch(/101[ .,]400/);
  });

  it('quotes the net amounts the payroll engine computes (class I, Berlin, no church tax, age 30)', () => {
    const net = (gross: number) => Math.round(calculateSalary({ ...DEFAULT_INPUT, gross, period: 'year', taxClass: 1, state: 'BE' }).monthly.net);
    expect(net(50_700)).toBe(2_726);
    expect(net(45_934.2)).toBe(2_513);
    expect(blueCard.pages.de.body).toContain('etwa 2.726 € netto im Monat, bei 45.934,20 € etwa 2.513 €');
    expect(blueCard.pages.en.body).toContain('about €2,726 net a month');
  });
});
