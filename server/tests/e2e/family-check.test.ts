import { describe, expect, it } from 'vitest';
import { anon } from '../helpers/api';

/**
 * GET /api/family-check: the public family reunification self-check (no login, nothing stored). Same rules as
 * the case readiness check; answers codes and numbers only.
 */
describe('family reunification self-check', () => {
  it('answers the default (skilled worker, spouse) without login and asks for the missing answers', async () => {
    const r = await anon().get('/api/family-check').expect(200);
    expect(r.body.title).toMatchObject({ code: 'SKILLED', reunion: 'yes' });
    expect(r.body.spouse.verdict).toBe('check');
    expect(r.body.documents).toContain('marriageCert');
    expect(r.headers['cache-control']).toContain('public');
  });

  it('says "now" for a Blue Card holder with enough income and lists the documents', async () => {
    const r = await anon().get('/api/family-check?title=BLUE_CARD&net=4200&rent=1100&spouse=1&spouseAge=30&children=5').expect(200);
    expect(r.body.spouse.verdict).toBe('now');
    expect(r.body.children[0]).toMatchObject({ age: 5, verdict: 'now' });
    expect(r.body.documents).toEqual(expect.arrayContaining(['birthCert', 'sponsorPayslips']));
  });

  it('rejects malformed answers with 400', async () => {
    await anon().get('/api/family-check?children=a,b').expect(400);
    await anon().get('/api/family-check?title=NOPE').expect(400);
  });
});
