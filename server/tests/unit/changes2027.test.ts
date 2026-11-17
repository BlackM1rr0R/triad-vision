import { describe, expect, it } from 'vitest';
import { FRESHNESS_ITEMS } from '../../src/lib/dataFreshness/registry.js';
import { CHANGE_GLOSSARY, CHANGE_TOOLS, CHANGES_DATE, CHANGES_LOCALES, changeRegistryItems, changesPage, localizeFigures } from '../../src/lib/changes2027/content.js';
import { CHANGES_TEXTS } from '../../src/lib/changes2027/texts.js';
import { changes2027Body, changes2027Ld } from '../../src/lib/changes2027/seo.js';
import { STATIC_PAGES } from '../../src/lib/seoCatalogue.js';
import { glossaryTerm } from '../../src/lib/glossary/index.js';

/** /changes-2027: one source of truth (the data freshness registry), translated texts, crawlable body. */

describe('changes 2027 page', () => {
  const ids = changeRegistryItems().map((i) => i.id);

  it('every page item is a registry entry with a 1 January 2027 change, and every such entry is on the page', () => {
    expect(ids.length).toBeGreaterThanOrEqual(8);
    for (const id of ids) {
      const r = FRESHNESS_ITEMS.find((i) => i.id === id);
      expect(r?.upcoming?.from, id).toBe(CHANGES_DATE);
      expect(r?.upcoming?.change?.affects.length, id).toBeGreaterThan(0);
      for (const l of CHANGES_LOCALES) expect(r?.upcoming?.change?.statusLabel[l]?.length, `${id} ${l}`).toBeGreaterThan(10);
    }
    const all2027 = FRESHNESS_ITEMS.filter((i) => i.upcoming?.from === CHANGES_DATE && i.upcoming.change).map((i) => i.id);
    expect(ids).toEqual(all2027);
  });

  it('texts, tools and glossary links exist for exactly the registry items, in all six languages', () => {
    for (const l of CHANGES_LOCALES) {
      expect(Object.keys(CHANGES_TEXTS[l].items).sort(), l).toEqual([...ids].sort());
      for (const id of ids) {
        expect(CHANGES_TEXTS[l].items[id].title.length, `${l} ${id}`).toBeGreaterThan(5);
        expect(CHANGES_TEXTS[l].items[id].text.length, `${l} ${id}`).toBeGreaterThan(30);
      }
      expect(CHANGES_TEXTS[l].faq.length).toBe(CHANGES_TEXTS.en.faq.length);
    }
    expect(Object.keys(CHANGE_TOOLS).sort()).toEqual([...ids].sort());
    for (const paths of Object.values(CHANGE_TOOLS)) for (const p of paths) expect(STATIC_PAGES[p], p).toBeTruthy();
    for (const slugs of Object.values(CHANGE_GLOSSARY)) for (const s of slugs) expect(glossaryTerm(s), s).toBeTruthy();
  });

  it('shows the registry values (old → new, status) without copying them', () => {
    const en = changesPage('en');
    const mw = en.items.find((i) => i.id === 'minimum-wage')!;
    const reg = FRESHNESS_ITEMS.find((i) => i.id === 'minimum-wage')!;
    expect(mw.after).toBe(reg.upcoming!.value);
    expect(mw.before).toBe(reg.upcoming!.change!.before);
    expect(mw.before).toBe('13.90 €');
    expect(mw.after).toBe('14.60 €');
    expect(mw.status).toBe('enacted');
    expect(en.items.find((i) => i.id === 'blue-card-thresholds')!.status).toBe('expected');
    expect(en.items.find((i) => i.id === 'kindergeld')!.statusName).toBe('Proposal');
    expect(changesPage('xx').lng).toBe('en');
  });

  it('formats registry figures for the reader', () => {
    expect(localizeFigures('BBG RV/ALV 106,200 €, Zusatzbeitrag Ø 2.9 %', 'de')).toBe('BBG RV/ALV 106.200 €, Zusatzbeitrag Ø 2,9 %');
    expect(localizeFigures('633 € (633.01–2,000 €)', 'de')).toBe('633 € (633,01–2.000 €)');
    expect(localizeFigures('§ 19c(2): 47,790 €, 45+: 58,410 € since 2026-01-01, cabinet 2.9.2026', 'ru')).toBe('§ 19c(2): 47 790 €, 45+: 58 410 € since 2026-01-01, cabinet 2.9.2026');
    expect(localizeFigures('14.60 €', 'en')).toBe('14.60 €');
  });

  it('server-rendered body and JSON-LD carry every change and the FAQ', () => {
    const link = (p: string, label: string) => `<a href="${p}">${label}</a>`;
    const html = changes2027Body('de', link).join('');
    for (const i of changesPage('de').items) expect(html).toContain(i.title);
    expect(html).toContain('/salary-calculator');
    expect(html).toContain('/glossary/mindestlohn');
    expect(html).not.toMatch(/<script/i);
    const ld = changes2027Ld('en', 'https://x/changes-2027', 'https://x/og.png', { '@id': 'https://x/#organization' }, 'https://x/about');
    expect(ld.map((x) => x['@type'])).toEqual(['Article', 'FAQPage']);
  });
});
