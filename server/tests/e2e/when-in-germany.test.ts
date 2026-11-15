import { beforeEach, describe, expect, it } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { anon } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, createVisaCategory, uniq } from '../helpers/factories';
import { clearWhenCache } from '../../src/lib/whenInGermany/service.js';

/**
 * GET /api/when-in-germany/estimate: public, no login; durations from the case history only as percentiles of
 * groups with ≥ 10 cases (daily cache), documented estimates otherwise — no case number, name, id or single
 * duration in the answer.
 */

const DAY = 24 * 60 * 60 * 1000;

/** n approved driver cases with status history: documents 14 d, contract 6 d, embassy 40 d, decision 20 + i days. */
const seedCases = async (n: number, profession = 'LKW-Fahrer') => {
  const ids: { id: string; number: string; firstName: string }[] = [];
  for (let i = 0; i < n; i++) {
    const firstName = `Kandidat${i}x`;
    const client = await createClient({ firstName });
    const start = new Date(Date.now() - 200 * DAY);
    const number = uniq('TV-');
    const c = await prisma.case.create({ data: { number, clientId: client.user.id, profession, visaType: 'WORK', status: 'APPROVED', createdAt: start, decisionAt: new Date(start.getTime() + (80 + i) * DAY) } });
    const steps: [CaseStatus, CaseStatus, number][] = [
      ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 10],
      ['DOCUMENTS_REVIEW', 'CONTRACT_SENT', 4],
      ['CONTRACT_SENT', 'EMBASSY_DOCUMENTS', 6],
      ['EMBASSY_DOCUMENTS', 'DECISION_PENDING', 40],
      ['DECISION_PENDING', 'APPROVED', 20 + i],
    ];
    let at = start.getTime();
    for (const [fromStatus, toStatus, d] of steps) {
      at += d * DAY;
      await prisma.caseEvent.create({ data: { caseId: c.id, type: 'STATUS_CHANGED', fromStatus, toStatus, createdAt: new Date(at) } });
    }
    ids.push({ id: c.id, number, firstName });
  }
  return ids;
};

beforeEach(() => clearWhenCache());

describe('when-in-germany estimate', () => {
  it('answers the default example without any data, every history stage marked as an estimate', async () => {
    const r = await anon().get('/api/when-in-germany/estimate').expect(200);
    expect(r.body.input).toMatchObject({ profession: 'driver', german: 'none', documents: 'none', route: 'auto' });
    expect(r.body.route).toBe('drivers_19c');
    expect(r.body.stages.map((s: { key: string }) => s.key)).toEqual(['documents', 'language', 'recognition', 'contract', 'embassy', 'decision', 'travel']);
    for (const s of r.body.stages) expect(['estimate', 'cefr', 'skipped']).toContain(s.basis);
    expect(r.body.arrival.typical).toMatch(/^\d{4}-\d{2}$/);
    expect(r.body.minSample).toBe(10);
    expect(r.headers['cache-control']).toContain('public');
  });

  it('uses case-history percentiles once a group has ≥ 10 cases and leaks no individual case', async () => {
    const visa = await createVisaCategory({ slug: uniq('lkw-'), visaLabel: '§ 19c AufenthG', published: true });
    const cases = await seedCases(11);
    const r = await anon().get('/api/when-in-germany/estimate?profession=driver&german=A2&documents=none&recognition=no').expect(200);
    const decision = r.body.stages.find((s: { key: string }) => s.key === 'decision');
    expect(decision).toMatchObject({ basis: 'history', level: 'route_profession', sample: 11 });
    // decision 20 … 30 days: p25 22.5, median 25, p75 27.5
    expect(decision.days).toEqual({ min: 23, typical: 25, max: 28 });
    const docs = r.body.stages.find((s: { key: string }) => s.key === 'documents');
    expect(docs).toMatchObject({ basis: 'history', days: { min: 14, typical: 14, max: 14 } });
    expect(r.body.visa).toEqual({ slug: visa.slug, label: '§ 19c AufenthG' });

    // Nothing that identifies a case: no ids, numbers, names, dates of a case.
    const body = JSON.stringify(r.body);
    for (const c of cases) {
      expect(body).not.toContain(c.id);
      expect(body).not.toContain(c.number);
      expect(body).not.toContain(c.firstName);
    }
    expect(body).not.toMatch(/clientId|caseId|createdAt|decisionAt|events/);
    // Exactly the documented keys per stage.
    for (const s of r.body.stages) expect(Object.keys(s).sort()).toEqual(['basis', 'days', 'end', 'key', 'level', 'sample', 'start']);
  });

  it('never uses a group below 10 cases and caches the statistics for the day', async () => {
    await seedCases(9);
    const r = await anon().get('/api/when-in-germany/estimate?profession=driver').expect(200);
    expect(r.body.stages.find((s: { key: string }) => s.key === 'decision').basis).toBe('estimate');
    // a 10th case arrives: the day's cache still answers (recomputed tomorrow / after a restart)
    await seedCases(1);
    const again = await anon().get('/api/when-in-germany/estimate?profession=driver').expect(200);
    expect(again.body.computedAt).toBe(r.body.computedAt);
    expect(again.body.stages.find((s: { key: string }) => s.key === 'decision').basis).toBe('estimate');
    clearWhenCache();
    const fresh = await anon().get('/api/when-in-germany/estimate?profession=driver').expect(200);
    expect(fresh.body.stages.find((s: { key: string }) => s.key === 'decision')).toMatchObject({ basis: 'history', sample: 10 });
  });

  it('ignores unknown values (defaults) and honours a chosen route', async () => {
    const r = await anon().get('/api/when-in-germany/estimate?profession=astronaut&route=study_16b&german=B1').expect(200);
    expect(r.body.input.profession).toBe('driver');
    expect(r.body).toMatchObject({ route: 'study_16b', routeAuto: false, visaType: 'STUDY', targetLevel: 'B2' });
  });
});
