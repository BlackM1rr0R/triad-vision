import { describe, expect, it } from 'vitest';
import { markdownToText, renderGuideMarkdown, slugifyHeading } from '../../src/lib/guides/markdown.js';
import { GUIDES } from '../../prisma/seed/guides/index.js';
import { GUIDE_LOCALES } from '../../prisma/seed/guides/types.js';
import { ogCardSvg } from '../../src/lib/ogImage.js';

const opts = {
  localize: (p: string) => `/de${p}`,
  guideHref: (key: string) => (key === 'blue-card' ? '/de/guides/blaue-karte-eu' : null),
};

describe('guide markdown renderer', () => {
  it('renders headings with ids and a TOC, lists, tables, notes and inline formatting', () => {
    const md = [
      '## Erste Schritte',
      'Text mit **fett**, *kursiv* und `code`.',
      '',
      '- eins',
      '- zwei',
      '',
      '1. a',
      '2. b',
      '',
      '| Kriterium | Punkte |',
      '|---|---:|',
      '| Deutsch B1 | 2 |',
      '',
      '> Hinweis: [Rechner](/chancenkarte-calculator)',
      '',
      '### Unterpunkt',
      '## Erste Schritte',
    ].join('\n');
    const { html, toc } = renderGuideMarkdown(md, opts);
    expect(toc).toEqual([
      { id: 'erste-schritte', text: 'Erste Schritte' },
      { id: 'erste-schritte-2', text: 'Erste Schritte' },
    ]);
    expect(html).toContain('<h2 id="erste-schritte">Erste Schritte</h2>');
    expect(html).toContain('<strong>fett</strong>');
    expect(html).toContain('<em>kursiv</em>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul><li>eins</li><li>zwei</li></ul>');
    expect(html).toContain('<ol><li>a</li><li>b</li></ol>');
    expect(html).toContain('<th>Kriterium</th>');
    expect(html).toContain('<td>Deutsch B1</td>');
    expect(html).toContain('<blockquote><p>Hinweis: <a href="/de/chancenkarte-calculator">Rechner</a></p></blockquote>');
    expect(html).toContain('<h3 id="unterpunkt">Unterpunkt</h3>');
  });

  it('escapes raw HTML and only allows safe links', () => {
    const md = '<script>alert(1)</script> [x](javascript:alert(1)) [y](https://a.example/p_q_r?a=1&b=2) [z](guide:blue-card) [w](guide:nope) [m](mailto:a@b.de)';
    const { html } = renderGuideMarkdown(md, opts);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('javascript:alert(1)"');
    expect(html).toContain('<a href="https://a.example/p_q_r?a=1&amp;b=2" target="_blank" rel="noopener">y</a>');
    expect(html).toContain('<a href="/de/guides/blaue-karte-eu">z</a>');
    expect(html).toContain(' w ');
    expect(html).toContain('<a href="mailto:a@b.de">m</a>');
  });

  it('slugifies headings in every script', () => {
    expect(slugifyHeading('Şərtlər və xallar')).toBe('sertler-ve-xallar');
    expect(slugifyHeading('Як подати заяву?')).toBe('як-подати-заяву');
    expect(slugifyHeading('Über die Anerkennung')).toBe('uber-die-anerkennung');
  });
});

describe('seeded topic guides', () => {
  it('has the six guide keys in all six languages', () => {
    expect(GUIDES.map((g) => g.key).sort()).toEqual(['anerkennung', 'ausbildung', 'blue-card', 'chancenkarte', 'familiennachzug', 'pflege']);
    for (const g of GUIDES) for (const l of GUIDE_LOCALES) expect(g.pages[l], `${g.key} ${l}`).toBeDefined();
  });

  it('has valid, unique slugs, SEO-sized titles and descriptions, real content and FAQs', () => {
    for (const l of GUIDE_LOCALES) {
      const slugs = GUIDES.map((g) => g.pages[l].slug);
      expect(new Set(slugs).size, l).toBe(slugs.length);
    }
    for (const g of GUIDES) {
      for (const l of GUIDE_LOCALES) {
        const p = g.pages[l];
        const where = `${g.key} ${l}`;
        expect(p.slug, where).toMatch(/^[a-z0-9][a-z0-9-]{2,159}$/);
        expect(p.title.length, where).toBeLessThanOrEqual(60);
        expect(p.description.length, where).toBeGreaterThanOrEqual(100);
        expect(p.description.length, where).toBeLessThanOrEqual(160);
        expect(markdownToText(p.body).split(' ').length, where).toBeGreaterThan(750);
        expect(p.body, where).not.toMatch(/^# /m);
        expect(p.faq.length, where).toBeGreaterThanOrEqual(4);
        for (const f of p.faq) expect(f.q.trim() && f.a.trim(), where).toBeTruthy();
        // Links to other guides point to existing keys.
        for (const m of p.body.matchAll(/\]\(guide:([a-z0-9-]+)\)/g)) expect(GUIDES.map((x) => x.key), `${where} → ${m[1]}`).toContain(m[1]);
        const { toc } = renderGuideMarkdown(p.body, opts);
        expect(toc.length, where).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('mentions the 2026 Blue Card thresholds that the salary check uses', () => {
    for (const l of GUIDE_LOCALES) {
      const body = GUIDES.find((g) => g.key === 'blue-card')!.pages[l].body.replace(/[\s.,  ]/g, '');
      expect(body, l).toContain('50700');
      expect(body, l).toMatch(/45934/);
    }
  });
});

describe('Open Graph card', () => {
  it('draws the title as vector outlines (no system fonts needed), in any script', async () => {
    const svg = await ogCardSvg('Ölkə Їжак Ğş — Blaue Karte EU 2026: Gehaltsgrenzen und Voraussetzungen im Überblick', 'Ratgeber');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).not.toContain('<text');
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThan(40);
  });
});
