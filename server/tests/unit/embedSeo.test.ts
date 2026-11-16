import { describe, expect, it } from 'vitest';
import { pageStatus, renderHead, resolvePage, type SeoData } from '../../src/lib/seo.js';
import { SITEMAP_STATIC, STATIC_PAGES } from '../../src/lib/seoCatalogue.js';

/** Embeddable widgets (/embed/*): noindex, canonical to the full tool, never in the sitemap; /widgets is indexable. */
const ORIGIN = 'http://localhost:5173';
const data: SeoData = { visas: [], services: [], posts: [], faqs: [], jobs: [], settings: {}, rating: null };

const EMBEDS = {
  '/embed/salary-calculator': '/salary-calculator',
  '/embed/blue-card-check': '/blue-card-check',
  '/embed/which-city': '/which-city',
} as const;

describe('embeddable widget pages', () => {
  it('are noindex with a canonical to the full tool, in every language', () => {
    for (const [embed, tool] of Object.entries(EMBEDS)) {
      expect(STATIC_PAGES[tool], tool).toBeTruthy();
      const az = renderHead(embed, null, data);
      expect(az).toContain('<meta data-seo name="robots" content="noindex, nofollow">');
      expect(az).toContain(`<link data-seo rel="canonical" href="${ORIGIN}${tool}">`);
      expect(az).not.toContain('hreflang');
      const de = renderHead(`/de${embed}`, null, data);
      expect(de).toContain(`<link data-seo rel="canonical" href="${ORIGIN}/de${tool}">`);
      expect(resolvePage(embed, 'en', data)).toMatchObject({ index: false, canonicalPath: tool });
    }
  });

  it('answer 200 but stay out of the sitemap', () => {
    for (const embed of Object.keys(EMBEDS)) {
      expect(pageStatus(embed, data)).toBe(200);
      expect(pageStatus(`/uk${embed}`, data)).toBe(200);
      expect(SITEMAP_STATIC).not.toContain(embed);
    }
    expect(pageStatus('/embed/unknown-widget', data)).toBe(404);
  });

  it('keeps the self-referencing canonical of normal pages and lists /widgets', () => {
    const tool = renderHead('/salary-calculator', null, data);
    expect(tool).toContain(`<link data-seo rel="canonical" href="${ORIGIN}/salary-calculator">`);
    expect(tool).toContain('index, follow');
    expect(SITEMAP_STATIC).toContain('/widgets');
    expect(renderHead('/de/widgets', null, data)).toContain(`<link data-seo rel="canonical" href="${ORIGIN}/de/widgets">`);
  });

  it('gives other noindex pages no canonical', () => {
    expect(renderHead('/login', null, data)).not.toContain('rel="canonical"');
  });
});
