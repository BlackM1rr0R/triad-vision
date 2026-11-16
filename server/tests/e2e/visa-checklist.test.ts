import { describe, expect, it } from 'vitest';
import { anon } from '../helpers/api';

/**
 * GET /api/visa-checklist: the public document checklist (/visa-document-checklist). No login, nothing stored,
 * the portal's embassy checklist + Baku items in the requested language, cacheable.
 */
describe('public visa document checklist', () => {
  it('answers the default (skilled worker) without login', async () => {
    const r = await anon().get('/api/visa-checklist').expect(200);
    expect(r.body.type).toBe('skilled');
    expect(r.body.channel).toBe('portal');
    expect(r.body.fee).toEqual({ adult: 75, minor: 37.5 });
    expect(r.body.items.length).toBeGreaterThan(5);
    expect(r.body.items[0].source).toBe('portal');
    expect(r.body.links.length).toBeGreaterThan(0);
    expect(r.headers['cache-control']).toContain('public');
  });

  it('adds profession items, uses the language and leaves them out for family members', async () => {
    const driver = await anon().get('/api/visa-checklist?type=blueCard&profession=driver&lng=de').expect(200);
    expect(driver.body.items.some((i: { key: string }) => i.key === 'prof.licence')).toBe(true);
    expect(driver.body.items.some((i: { label: string }) => /Hochschulabschluss/.test(i.label))).toBe(true);
    const family = await anon().get('/api/visa-checklist?type=family&profession=driver&lng=uk').expect(200);
    expect(family.body.channel).toBe('embassy');
    expect(family.body.items.some((i: { source: string }) => i.source === 'profession')).toBe(false);
  });

  it('rejects unknown types and professions with 400', async () => {
    await anon().get('/api/visa-checklist?type=WORK').expect(400);
    await anon().get('/api/visa-checklist?profession=pilot').expect(400);
  });
});
