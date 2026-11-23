import { describe, expect, it } from 'vitest';
import { buildFaq, buildService, buildSummary, renderAiTxt, renderLlms } from '../../src/lib/geo.js';
import { renderHead, type SeoData } from '../../src/lib/seo.js';

const l10n = (base: string) => ({ az: `${base} az`, de: `${base} de`, en: `${base} en`, ru: `${base} ru` });
const data = (over: Partial<SeoData> = {}): SeoData => ({
  visas: [{ slug: 'blue-card', title: l10n('Blue Card'), summary: l10n('Visa for graduates'), image: '/x.jpg', updatedAt: new Date('2026-10-05T00:00:00Z') }],
  services: [],
  posts: [{ slug: 'news-1', title: l10n('News'), excerpt: l10n('Excerpt'), cover: '/c.jpg', publishedAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-10T00:00:00Z') }],
  faqs: [
    { question: l10n('Q1'), answer: l10n('A1') },
    { question: l10n('Q2'), answer: l10n('A2') },
  ],
  jobs: [
    {
      slug: 'lkw-hamburg', title: l10n('Driver'), description: l10n('x'), requirements: null, benefits: null, city: 'Hamburg', employmentType: 'FULL_TIME',
      salaryMin: null, salaryMax: null, positions: 2, showCompany: false, publishedAt: new Date('2026-10-01T00:00:00Z'), closesAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-12T00:00:00Z'), company: { name: 'Hidden GmbH', website: null },
    },
  ],
  settings: { contact: { phone: '+994 51 414 14 01', email: 'info@example.test' } },
  rating: null,
  ...over,
});

describe('GEO files', () => {
  it('llms.txt links the key pages, categories and vacancies without the company name', () => {
    const txt = renderLlms(data(), false);
    expect(txt.startsWith('# Triad Vision')).toBe(true);
    expect(txt).toContain('/visas/blue-card');
    expect(txt).toContain('/jobs/lkw-hamburg');
    expect(txt).toContain('/news/news-1');
    expect(txt).toContain('+994 51 414 14 01');
    expect(txt).toContain('We do not offer apostille');
    expect(txt).not.toContain('Hidden GmbH');
  });

  it('llms-full.txt adds the FAQ', () => {
    const txt = renderLlms(data(), true);
    expect(txt).toContain('### Q1 en');
    expect(renderLlms(data(), false)).not.toContain('### Q1');
  });

  it('ai.txt allows the public site and keeps the private areas out', () => {
    const txt = renderAiTxt();
    expect(txt).toContain('Allow: /');
    expect(txt).toContain('Disallow: /admin$');
    expect(txt).toContain('/llms.txt');
  });

  it('summary, service and faq JSON carry real data only', () => {
    expect(buildSummary(data()).contact.phone).toBe('+994 51 414 14 01');
    expect(buildSummary(data()).languages).toHaveLength(6);
    const svc = buildService(data());
    expect(svc.visaCategories[0].name).toBe('Blue Card en');
    expect(JSON.stringify(svc)).not.toContain('Hidden GmbH');
    expect(buildFaq(data(), 'de').items.map((f) => f.question)).toEqual(['Q1 de', 'Q2 de']);
  });
});

describe('home page GEO signals', () => {
  const ld = (html: string) => [...html.matchAll(/<script data-seo type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  it('has FAQPage, WebSite SearchAction, WebPage dateModified and article:modified_time', () => {
    const html = renderHead('/', null, data());
    const blocks = ld(html);
    expect(blocks.find((b) => b['@type'] === 'FAQPage')?.mainEntity).toHaveLength(2);
    expect(blocks.find((b) => b['@type'] === 'WebSite')?.potentialAction['@type']).toBe('SearchAction');
    expect(blocks.find((b) => b['@type'] === 'WebPage')?.dateModified).toBe('2026-10-12T00:00:00.000Z');
    expect(html).toContain('property="article:modified_time" content="2026-10-12T00:00:00.000Z"');
  });
});
