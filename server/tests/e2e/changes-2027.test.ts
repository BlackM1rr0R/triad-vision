import { describe, expect, it } from 'vitest';
import { anon } from '../helpers/api';

/**
 * GET /api/changes-2027: public, no login, no DB — the 1 January 2027 changes of the data freshness registry in
 * the requested language (unknown language → English).
 */
describe('GET /api/changes-2027', () => {
  it('returns the localized changes with old / new value, status and source', async () => {
    const res = await anon().get('/api/changes-2027?lng=de');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('public');
    expect(res.body.lng).toBe('de');
    expect(res.body.date).toBe('2027-01-01');
    const mw = res.body.items.find((i: { id: string }) => i.id === 'minimum-wage');
    expect(mw).toMatchObject({ before: '13,90 €', after: '14,60 €', status: 'enacted', statusName: 'Gesetz / in Kraft' });
    expect(mw.source.url).toMatch(/^https:\/\//);
    expect(mw.tools[0]).toMatchObject({ path: '/salary-calculator' });
    expect(res.body.texts.faq.length).toBeGreaterThan(2);
  });

  it('falls back to English for an unknown language', async () => {
    const res = await anon().get('/api/changes-2027?lng=xx');
    expect(res.status).toBe(200);
    expect(res.body.lng).toBe('en');
  });
});
