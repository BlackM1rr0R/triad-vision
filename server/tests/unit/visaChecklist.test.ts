import { describe, expect, it } from 'vitest';
import { caseAiSettingsSchema, DEFAULT_CHECKLISTS } from '../../src/lib/ai/features/caseAi/config.js';
import { BASE_TYPE, buildChecklist, CHANNEL, CHECKLIST_PROFESSIONS, LANGS, OFFICIAL_LINKS, parseProfession, parseType, PUBLIC_VISA_TYPES } from '../../src/lib/visaChecklist/index.js';
import { STATIC_PAGES, TOOL_GROUPS } from '../../src/lib/seoCatalogue.js';
import { TOOL_PAGES } from '../../src/lib/seo.js';
import { GUIDE_TOOLS, TOOL_GUIDES } from '../../src/lib/seoLinks.js';

/*
 * Public document checklist (/visa-document-checklist): built on the portal's embassy checklists, plus
 * Baku-specific items, in all six languages; and the three new public content pages are registered for SEO.
 */
const defaults = caseAiSettingsSchema.parse({});

describe('public visa checklist', () => {
  it('starts with the portal list of the visa type and adds type, profession and general items', () => {
    for (const type of PUBLIC_VISA_TYPES) {
      for (const lng of LANGS) {
        const list = buildChecklist(defaults, type, 'construction', lng);
        const portal = list.filter((i) => i.source === 'portal');
        expect(portal.map((i) => i.key)).toEqual(DEFAULT_CHECKLISTS[BASE_TYPE[type]].map((i) => `base.${i.key}`));
        expect(list.every((i) => i.label.trim().length > 3), `${type} ${lng}`).toBe(true);
        expect(new Set(list.map((i) => i.key)).size).toBe(list.length);
        expect(list.some((i) => i.key === 'note.apostille')).toBe(true);
        // Family members get no profession items.
        expect(list.some((i) => i.source === 'profession')).toBe(type !== 'family');
      }
      expect(OFFICIAL_LINKS[type].length, type).toBeGreaterThan(0);
      for (const l of OFFICIAL_LINKS[type]) expect(l.url).toMatch(/^https:\/\/(baku|digital)\.diplo\.de\//);
      expect(['portal', 'tls', 'embassy']).toContain(CHANNEL[type]);
    }
  });

  it('uses the list an admin saved for the portal and falls back to English for tr / uk base items', () => {
    const custom = caseAiSettingsSchema.parse({ checklists: { WORK: [{ key: 'only', requirementKey: null, label: { az: 'A', de: 'D', en: 'E', ru: 'R' } }] } });
    const list = buildChecklist(custom, 'skilled', 'other', 'tr');
    expect(list[0]).toEqual({ key: 'base.only', label: 'E', source: 'portal' });
    expect(buildChecklist(custom, 'skilled', 'other', 'de')[0].label).toBe('D');
  });

  it('parses only known types and professions', () => {
    expect(parseType('blueCard')).toBe('blueCard');
    expect(parseType('WORK')).toBeNull();
    expect(parseProfession('driver')).toBe('driver');
    expect(parseProfession(['driver'])).toBeNull();
    expect(CHECKLIST_PROFESSIONS).toContain('other');
  });
});

describe('public content pages are registered', () => {
  const pages = ['/germany-vs-other-countries', '/visa-refusal', '/visa-document-checklist'];
  it('has catalogue entries, tool pages, the tools hub and related guides', () => {
    const eligibility = TOOL_GROUPS.find((g) => g.key === 'eligibility')!.paths;
    for (const p of pages) {
      expect(STATIC_PAGES[p], p).toBeDefined();
      expect(TOOL_PAGES.has(p), p).toBe(true);
      expect(eligibility, p).toContain(p);
      expect(TOOL_GUIDES[p]?.length, p).toBeGreaterThan(0);
    }
  });

  it('links the construction guide from the construction work scene', () => {
    expect(TOOL_GUIDES['/work-scenes/construction-site'][0]).toBe('anerkennung-bau');
    expect(GUIDE_TOOLS['anerkennung-bau']).toContain('/anerkennung');
  });
});
