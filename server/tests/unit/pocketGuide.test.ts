import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cvPdfText as pdfText, pdfPageCount } from './cvPdfText';
import { POCKET_LOCALES } from '../../src/lib/pocketGuide/content.js';
import { POCKET_PHRASES } from '../../src/lib/pocketGuide/phrases.js';
import { buergeramtFor, FEDERAL_ANMELDUNG_URL } from '../../src/lib/pocketGuide/cities.js';
import { POCKET_PAGES, bookletOrder, buildPocketGuide, genericPocketGuide, pocketFacts } from '../../src/lib/pocketGuide/pdf.js';

/**
 * Germany pocket guide PDF (lib/pocketGuide): 16 A5 pages in every language with Azerbaijani / Cyrillic glyphs,
 * the A4 booklet imposition (8 sides), date-based figures, the personalised version and the phrase copy.
 */

const ON = new Date('2026-11-22T10:00:00Z');

describe('pocket guide PDF', () => {
  it.each(POCKET_LOCALES)('builds 16 A5 pages in %s', async (lng) => {
    const pdf = await buildPocketGuide(lng, 'a5', null, ON);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(await pdfPageCount(pdf)).toBe(POCKET_PAGES);
    const text = await pdfText(pdf);
    expect(text).toContain('112');
    expect(text).toContain('116 116');
    expect(text).toContain('Guten Tag!');
    if (lng === 'az') expect(text).toMatch(/[əşğ]/);
    if (lng === 'ru') expect(text).toMatch(/[а-яё]/i);
  }, 30_000);

  it('Azerbaijani and Cyrillic glyphs are in the text layer (not replaced)', async () => {
    const text = await pdfText(await buildPocketGuide('az', 'a5', null, ON));
    expect(text).toContain('bələdçisi'); // cover title (wrapped over two lines)
    expect(text).toContain('Təcili nömrələr');
    expect(text).toContain('Qutən tak'); // pronunciation aid
    const ru = await pdfText(await buildPocketGuide('ru', 'a5', null, ON));
    expect(ru).toContain('Экстренные номера');
    expect(ru).toContain('Гутен таг');
  }, 30_000);

  it('prints the figures of the day and the as-of date', async () => {
    const t2026 = await pdfText(await buildPocketGuide('de', 'a5', null, ON));
    expect(t2026).toContain('13,90 €');
    expect(t2026).toContain('14,60 € (01.01.2027)');
    expect(t2026).toContain('63,00 €');
    expect(t2026).toContain('Stand: 22.11.2026');
    const t2027 = await pdfText(await buildPocketGuide('de', 'a5', null, new Date('2027-02-01T10:00:00Z')));
    expect(t2027).toContain('14,60 €');
    expect(t2027).toContain('66,80 €');
    expect(t2027).not.toContain('13,90 €');
    expect(pocketFacts('en', ON).minWage).toBe('€13.90');
  }, 30_000);

  it('imposes the booklet on 8 A4 landscape sides in saddle-stitch order', async () => {
    expect(bookletOrder(16)).toEqual([
      [16, 1],
      [2, 15],
      [14, 3],
      [4, 13],
      [12, 5],
      [6, 11],
      [10, 7],
      [8, 9],
    ]);
    expect(() => bookletOrder(10)).toThrow();
    const pdf = await buildPocketGuide('en', 'booklet', null, ON);
    expect(await pdfPageCount(pdf)).toBe(8);
  }, 30_000);

  it('caches the generic PDFs', async () => {
    const a = await genericPocketGuide('en', 'a5', ON);
    const b = await genericPocketGuide('en', 'a5', ON);
    expect(b).toBe(a);
  }, 30_000);

  it('personalised: name, employer and the city Bürgeramt link', async () => {
    const pdf = await buildPocketGuide(
      'ru',
      'a5',
      { name: 'Əli Məmmədov', employer: { name: 'Muster Pflege GmbH', address: 'Hauptstr. 1, 10115 Berlin', phone: '+49 30 123' }, city: 'Berlin' },
      ON,
    );
    expect(await pdfPageCount(pdf)).toBe(16);
    const text = await pdfText(pdf);
    expect(text).toContain('Əli Məmmədov');
    expect(text).toContain('Muster Pflege GmbH');
    expect(text).toContain('service.berlin.de/dienstleistung/120686/');
  }, 30_000);

  it('Bürgeramt links: listed cities, aliases, federal fallback', () => {
    expect(buergeramtFor('München').official).toBe('city');
    expect(buergeramtFor('Munich').city).toBe('München');
    expect(buergeramtFor('Kempten')).toMatchObject({ url: FEDERAL_ANMELDUNG_URL, official: 'federal', city: 'Kempten' });
    expect(buergeramtFor(null).url).toBe(FEDERAL_ANMELDUNG_URL);
  });
});

describe('pocket guide phrases', () => {
  it('are 40 verbatim rows of the site phrase list', async () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/components/world');
    const mod = (await import(/* @vite-ignore */ pathToFileURL(path.join(dir, 'phrases.ts')).href)) as {
      PHRASES: { id: string; de: string; az: string; ru: string; en: string; pron: { az: string; ru: string } }[];
    };
    expect(POCKET_PHRASES).toHaveLength(40);
    expect(new Set(POCKET_PHRASES.map((p) => p[0])).size).toBe(40);
    for (const [id, de, az, ru, en, pAz, pRu] of POCKET_PHRASES) {
      const src = mod.PHRASES.find((p) => p.id === id);
      expect(src, id).toBeTruthy();
      expect([de, az, ru, en, pAz, pRu]).toEqual([src!.de, src!.az, src!.ru, src!.en, src!.pron.az, src!.pron.ru]);
    }
  });
});
