import { describe, expect, it } from 'vitest';
import { SERVICE_SHELL_FIELDS, VISA_SHELL_FIELDS, toContentShell } from '../../src/lib/contentShell';

const l = (s: string) => ({ az: s, de: s, en: s, ru: s });

describe('toContentShell', () => {
  const content = {
    stats: [{ id: 's1' }],
    visaCategories: [
      {
        id: 'v1', slug: 'lkw', icon: 'truck', image: 'x', visaLabel: '§18a', title: l('t'), summary: l('s'), items: { az: ['a'] },
        body: l('long'), requirements: { az: ['r'] }, documents: { az: ['d'] }, faq: [{ q: l('q'), a: l('a') }], forecast: {},
        germanLevel: 'A2', salaryMin: 1, salaryMax: 2, processingMin: 3, processingMax: 4, familyReunion: true, sortOrder: 0, published: true,
        seoTitle: l('seo'), seoDescription: null, ogImage: null, noindex: false, createdAt: 'c', updatedAt: 'u',
      },
    ],
    services: [
      { id: 'x1', slug: 'rec', icon: 'i', image: 'x', audience: 'all', title: l('t'), summary: l('s'), body: l('long'), features: { az: ['f'] }, steps: null, duration: l('2 w'), sortOrder: 0, published: true, seoTitle: null },
    ],
    settings: { contact: { phone: '+994514141401' } },
  };

  it('keeps only the card / list fields of visas and services', () => {
    const shell = toContentShell(content);
    expect(Object.keys(shell.visaCategories[0]).sort()).toEqual([...VISA_SHELL_FIELDS].sort());
    expect(Object.keys(shell.services[0]).sort()).toEqual([...SERVICE_SHELL_FIELDS].sort());
    expect(shell.visaCategories[0]).not.toHaveProperty('body');
    expect(shell.services[0]).not.toHaveProperty('steps');
  });

  it('leaves the other collections untouched and does not change the input', () => {
    const shell = toContentShell(content);
    expect(shell.stats).toBe(content.stats);
    expect(shell.settings).toBe(content.settings);
    expect(content.visaCategories[0]).toHaveProperty('body');
  });

  it('skips fields a row does not have instead of adding undefined', () => {
    const shell = toContentShell({ visaCategories: [{ id: 'v', slug: 's' }], services: [] });
    expect(shell.visaCategories[0]).toEqual({ id: 'v', slug: 's' });
  });
});
