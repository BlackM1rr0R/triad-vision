import { describe, expect, it } from 'vitest';
import { markdownToText, renderGuideMarkdown } from '../../src/lib/guides/markdown.js';
import { CALCULATOR_SHORTCODE_RE, CALCULATOR_TYPES, GUIDE_CALCULATORS, calculatorShortcode, insertCalculatorShortcode } from '../../src/lib/guides/calculators.js';
import { GUIDES } from '../../prisma/seed/guides/index.js';
import { GUIDE_LOCALES } from '../../prisma/seed/guides/types.js';

const opts = (locale?: string) => ({ localize: (p: string) => (locale && locale !== 'az' ? `/${locale}${p}` : p), guideHref: () => null, locale });

describe('guide calculator shortcode', () => {
  it('renders a whitelisted shortcode as a static, localised teaser with a link to the full tool', () => {
    const { html } = renderGuideMarkdown('Intro.\n\n::calculator{type="chancenkarte"}\n\nMore.', opts('de'));
    expect(html).toContain('<p>Intro.</p>');
    expect(html).toContain('<div class="guide-calculator" data-calculator="chancenkarte">');
    expect(html).toContain('Chancenkarte-Punkterechner');
    expect(html).toContain('<a href="/de/chancenkarte-calculator">Rechner öffnen</a>');
    expect(html).toContain('<p>More.</p>');
  });

  it('links every type to its tool and falls back to English copy', () => {
    const tools: Record<string, string> = { chancenkarte: '/chancenkarte-calculator', 'blue-card': '/blue-card-check', cost: '/cost-calculator', salary: '/salary-calculator' };
    for (const type of CALCULATOR_TYPES) {
      const { html } = renderGuideMarkdown(calculatorShortcode(type), opts('xx'));
      expect(html).toContain(`data-calculator="${type}"`);
      expect(html).toContain(`href="/xx${tools[type]}"`);
    }
    expect(renderGuideMarkdown('::calculator{type="salary"}', opts()).html).toContain('Salary calculator');
  });

  it('ignores unknown types and never copies other attributes into the HTML', () => {
    const { html } = renderGuideMarkdown('::calculator{type="evil"}\n\n::calculator{type="cost" onclick="x"}\n\n::calculator{type="<script>"}', opts('en'));
    expect(html).not.toContain('guide-calculator');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onclick="');
  });

  it('only matches a shortcode on its own line', () => {
    const { html } = renderGuideMarkdown('Text ::calculator{type="cost"} inline', opts('en'));
    expect(html).not.toContain('guide-calculator');
    expect(CALCULATOR_SHORTCODE_RE.test('  ::calculator{ type = "cost" }  '.trim())).toBe(true);
  });

  it('is left out of the plain text (word counts, descriptions)', () => {
    expect(markdownToText('A\n::calculator{type="cost"}\nB')).toBe('A B');
  });
});

describe('insertCalculatorShortcode', () => {
  const body = '## One\nText one.\n\n## Two\nText two.\n\n## Three\nText three.';

  it('inserts after the first section', () => {
    const out = insertCalculatorShortcode(body, 'cost');
    expect(out).toBe('## One\nText one.\n\n::calculator{type="cost"}\n\n## Two\nText two.\n\n## Three\nText three.');
  });

  it('is idempotent and keeps a body that already has the calculator', () => {
    const once = insertCalculatorShortcode(body, 'cost');
    expect(insertCalculatorShortcode(once, 'cost')).toBe(once);
  });

  it('appends when there are fewer than two sections', () => {
    expect(insertCalculatorShortcode('Just text.\n', 'salary')).toBe('Just text.\n\n::calculator{type="salary"}\n');
  });
});

describe('seeded guides with calculators', () => {
  it('embed exactly one calculator in chancenkarte, blue-card, ausbildung and pflege in every language', () => {
    expect(GUIDE_CALCULATORS).toEqual({ chancenkarte: 'chancenkarte', 'blue-card': 'blue-card', ausbildung: 'cost', pflege: 'salary' });
    for (const g of GUIDES) {
      for (const l of GUIDE_LOCALES) {
        const count = (g.pages[l].body.match(/^::calculator\{type="[a-z-]+"\}$/gm) ?? []).length;
        const type = GUIDE_CALCULATORS[g.key];
        expect(count, `${g.key} ${l}`).toBe(type ? 1 : 0);
        if (type) {
          const { html } = renderGuideMarkdown(g.pages[l].body, opts(l));
          expect(html, `${g.key} ${l}`).toContain(`data-calculator="${type}"`);
        }
      }
    }
  });
});
