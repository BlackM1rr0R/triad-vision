import { describe, expect, it } from 'vitest';
import { isPubliclyVisible, publicStateOf, toggleRefusal } from '../../src/lib/vacancyActive.js';
import { pageStatus, renderHead, renderSitemapGroup, type SeoData } from '../../src/lib/seo.js';

/** Per-vacancy activation (lib/vacancyActive.ts) and how deactivated vacancies reach crawlers (lib/seo.ts). */

const now = new Date('2026-11-19T12:00:00Z');
const past = new Date('2026-11-01T00:00:00Z');
const future = new Date('2026-12-31T00:00:00Z');
const v = (status: 'DRAFT' | 'PENDING' | 'OPEN' | 'CLOSED', o: { closesAt?: Date | null; publishedAt?: Date | null } = {}) => ({
  status,
  closesAt: o.closesAt ?? null,
  publishedAt: o.publishedAt === undefined ? past : o.publishedAt,
});

describe('publicStateOf', () => {
  it('open, deactivated (closed after publication or expired) and hidden', () => {
    expect(publicStateOf(v('OPEN'), now)).toBe('OPEN');
    expect(publicStateOf(v('OPEN', { closesAt: future }), now)).toBe('OPEN');
    expect(publicStateOf(v('OPEN', { closesAt: past }), now)).toBe('DEACTIVATED');
    expect(publicStateOf(v('CLOSED'), now)).toBe('DEACTIVATED');
    expect(publicStateOf(v('CLOSED', { publishedAt: null }), now)).toBe('HIDDEN'); // closed before it was ever public
  });

  it('never shows drafts or submissions under review', () => {
    for (const s of ['DRAFT', 'PENDING'] as const) {
      expect(isPubliclyVisible(v(s), now)).toBe(false);
      expect(isPubliclyVisible(v(s, { publishedAt: null }), now)).toBe(false);
    }
  });
});

describe('toggleRefusal', () => {
  it('activates closed vacancies and deactivates open ones', () => {
    expect(toggleRefusal(v('CLOSED'), true, { now })).toBeNull();
    expect(toggleRefusal(v('OPEN'), false, { now })).toBeNull();
    expect(toggleRefusal(v('OPEN', { closesAt: past }), false, { now })).toBeNull(); // expired → closed
  });

  it('refuses no-op switches, drafts, passed closing dates and inactive employers', () => {
    expect(toggleRefusal(v('OPEN'), true, { now })).toBe('ALREADY_ACTIVE');
    expect(toggleRefusal(v('CLOSED'), false, { now })).toBe('ALREADY_INACTIVE');
    expect(toggleRefusal(v('DRAFT'), true, { now })).toBe('NOT_PUBLISHED');
    expect(toggleRefusal(v('PENDING'), false, { now })).toBe('NOT_PUBLISHED');
    expect(toggleRefusal(v('CLOSED', { closesAt: past }), true, { now })).toBe('CLOSING_DATE_PASSED');
    expect(toggleRefusal(v('OPEN', { closesAt: past }), true, { now })).toBe('CLOSING_DATE_PASSED');
    expect(toggleRefusal(v('CLOSED'), true, { now, companyActive: false })).toBe('COMPANY_NOT_ACTIVE');
    expect(toggleRefusal(v('CLOSED'), true, { now, companyActive: false, superAdmin: true })).toBeNull();
  });
});

describe('deactivated vacancy pages for crawlers', () => {
  const l10n = (s: string) => ({ az: s, de: s, en: s, ru: s, tr: s, uk: s });
  const job = (slug: string, closesAt: Date | null): SeoData['jobs'][number] => ({
    slug,
    title: l10n(`Fahrer ${slug}`),
    description: l10n('Beschreibung'),
    requirements: null,
    benefits: null,
    city: 'Hamburg',
    employmentType: 'FULL_TIME',
    salaryMin: 2800,
    salaryMax: 3400,
    positions: 1,
    showCompany: false,
    publishedAt: new Date('2026-10-01T00:00:00Z'),
    closesAt,
    createdAt: new Date('2026-09-30T00:00:00Z'),
    updatedAt: new Date('2026-10-02T00:00:00Z'),
    company: null,
  });
  const data: SeoData = {
    visas: [],
    services: [],
    posts: [],
    faqs: [],
    jobs: [job('live', null), job('expired', new Date(Date.now() - 1000))],
    closedJobs: [{ slug: 'closed', title: l10n('Kurier'), description: l10n('Text'), city: 'Berlin' }],
    settings: {},
    rating: null,
  };

  it('keeps their pages (200) and answers 404 for unknown slugs', () => {
    for (const p of ['/jobs/live', '/jobs/expired', '/jobs/closed', '/de/jobs/closed']) expect(pageStatus(p, data), p).toBe(200);
    expect(pageStatus('/jobs/draft-never-public', data)).toBe(404);
  });

  it('marks them noindex without JobPosting, the live one keeps both', () => {
    const live = renderHead('/de/jobs/live', null, data);
    expect(live).toContain('"JobPosting"');
    expect(live).toContain('index, follow');
    for (const p of ['/de/jobs/closed', '/de/jobs/expired']) {
      const html = renderHead(p, null, data);
      expect(html, p).toContain('noindex');
      expect(html, p).not.toContain('"JobPosting"');
    }
    expect(renderHead('/de/jobs/closed', null, data)).toContain('Kurier');
  });

  it('leaves them out of the jobs sitemap', () => {
    const xml = renderSitemapGroup(data, 'jobs');
    expect(xml).toContain('/jobs/live');
    expect(xml).not.toContain('/jobs/closed');
    expect(xml).not.toContain('/jobs/expired');
  });
});
