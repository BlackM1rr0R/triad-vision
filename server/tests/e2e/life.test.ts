import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { CBAR_SETTING_KEY, bakuDay, setCbarFetch } from '../../src/lib/life/cbar.js';
import { clearLiveNumbersCache } from '../../src/lib/life/liveNumbers.js';
import { clearLifeSalaryCache } from '../../src/lib/life/service.js';
import { deutschlandticketAt } from '../../src/lib/budget/params.js';

/**
 * "Life in Germany": CBAR EUR→AZN rate (server-side fetch at most daily, stored in Setting, last known rate as
 * fallback), the simulator estimate, the live numbers board (thresholds, admin toggle) and the admin settings.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
// The stored bulletin is dated 13.11.2026; re-date it to today (Baku) so the rate is never "stale" just because
// the test runs later (stale after 5 days). Rates stay the same.
const todayBaku = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baku', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date()).replace(/\//g, '.');
const todayIso = todayBaku.split('.').reverse().join('-');
const BULLETIN = fs.readFileSync(path.join(here, '..', 'unit', 'fixtures', 'cbar-2026-11-13.xml'), 'utf8').replace(/13\.11\.2026/g, todayBaku);

let calls: string[] = [];
const fakeCbar = (xml: string | Error = BULLETIN) =>
  setCbarFetch(async (url) => {
    calls.push(url);
    if (xml instanceof Error) throw xml;
    return xml;
  });

beforeEach(() => {
  calls = [];
  fakeCbar(new Error('OFFLINE'));
  clearLiveNumbersCache();
  clearLifeSalaryCache();
});
afterAll(() => setCbarFetch(null));

describe('CBAR rate', () => {
  it('fetches once per Baku day, stores the rate with its bulletin date and reuses it', async () => {
    fakeCbar();
    const a = await anon().get('/api/life/rate').expect(200);
    expect(a.body.rate).toMatchObject({ rate: 1.8805, date: todayIso, source: 'CBAR' });
    expect(calls).toEqual([`https://www.cbar.az/currencies/${bakuDay().cbar}.xml`]);
    const row = await prisma.setting.findUnique({ where: { key: CBAR_SETTING_KEY } });
    expect(row?.value).toMatchObject({ rate: 1.8805, date: todayIso });

    // a new process (memo cleared) the same day: the stored rate, no second request
    fakeCbar();
    await anon().get('/api/life/rate').expect(200);
    expect(calls.length).toBe(1);
  });

  it('falls back to the last known rate (stale, with its date) when CBAR is down; null when never fetched', async () => {
    expect((await anon().get('/api/life/rate').expect(200)).body.rate).toBeNull();
    const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    await prisma.setting.create({ data: { key: CBAR_SETTING_KEY, value: { rate: 1.9, date: '2026-11-10', fetchedAt: yesterday } } });
    fakeCbar(new Error('HTTP_503'));
    calls = [];
    const r = await anon().get('/api/life/rate').expect(200);
    expect(r.body.rate).toMatchObject({ rate: 1.9, date: '2026-11-10', stale: true });
    expect(calls.length).toBe(1);
    // the failure is remembered: no retry storm within the hour
    await anon().get('/api/life/config').expect(200);
    expect(calls.length).toBe(1);
    // an unparsable answer keeps the old rate too
    fakeCbar('<html>maintenance</html>');
    expect((await anon().get('/api/life/rate').expect(200)).body.rate).toMatchObject({ rate: 1.9, stale: true });
    expect((await prisma.setting.findUnique({ where: { key: CBAR_SETTING_KEY } }))?.value).toMatchObject({ rate: 1.9 });
  });

  it('admin refresh asks CBAR now; staff cannot', async () => {
    const staff = await asStaff();
    await staff.agent.get('/api/admin/life/settings').expect(403);
    const admin = await asAdmin();
    fakeCbar();
    const r = await admin.agent.post('/api/admin/life/rate/refresh').expect(200);
    expect(r.body.rate).toMatchObject({ rate: 1.8805, stale: false });
    fakeCbar();
    await admin.agent.post('/api/admin/life/rate/refresh').expect(200);
    expect(calls.length).toBe(2); // forced: fetched again although today's rate is stored
  });
});

describe('simulator', () => {
  it('config: professions with salary ranges, cities, parameters and the rate', async () => {
    fakeCbar();
    const c = (await anon().get('/api/life/config').expect(200)).body;
    expect(c.professions.map((p: { key: string }) => p.key)).toEqual(['driver', 'care', 'construction', 'technical', 'hospitality', 'it', 'logistics']);
    expect(c.professions[0]).toMatchObject({ key: 'driver', grossMin: 2800, grossMax: 3600, gross: 3200, source: 'reference' });
    expect(c.cities.some((x: { slug: string }) => x.slug === 'berlin')).toBe(true);
    expect(c.params).toMatchObject({ deutschlandticket: deutschlandticketAt(), kindergeld: 259 });
    expect(c.baku).toMatchObject({ enabled: true, nationalAverage: { grossAzn: 1102.9, year: 2025 } });
    expect(c.rate).toMatchObject({ rate: 1.8805 });
  });

  it('estimate: net, categories, savings, AZN, Baku comparison and a reproducible share query', async () => {
    fakeCbar();
    const r = (await anon().get('/api/life/estimate?profession=driver&city=berlin').expect(200)).body;
    expect(r.input).toMatchObject({ profession: 'driver', city: 'berlin', household: 'single', taxClass: 1, housing: 'flat', gross: 3200, grossIsDefault: true });
    expect(r.sim.net).toBeGreaterThan(2_000);
    expect(r.sim.lines.map((l: { key: string }) => l.key)).toContain('rent');
    expect(r.sim.savingsMid).toBe(Math.round(r.sim.income - r.sim.costsMid));
    expect(r.sim.azn.gross).toBe(Math.round(3200 * 1.8805));
    expect(r.baku).toMatchObject({ kind: 'national', grossAzn: 1103, year: 2025 });
    const again = (await anon().get(`/api/life/estimate?${r.share}`).expect(200)).body;
    expect(again.sim.savingsMid).toBe(r.sim.savingsMid);

    const fam = (await anon().get('/api/life/estimate?profession=care&city=leipzig&household=family&children=2&gross=3500').expect(200)).body;
    expect(fam.input).toMatchObject({ household: 'family', children: 2, taxClass: 3, gross: 3500, grossIsDefault: false });
    expect(fam.sim.kindergeld).toBe(518);
    expect(new URLSearchParams(fam.share).get('gross')).toBe('3500');

    await anon().get('/api/life/estimate?profession=pilot').expect(400);
    await anon().get('/api/life/estimate?profession=driver&city=atlantis').expect(404);
  });

  it('without a rate there are no AZN figures and no Baku block', async () => {
    const r = (await anon().get('/api/life/estimate?profession=it&city=muenchen').expect(200)).body;
    expect(r.rate).toBeNull();
    expect(r.sim.azn.gross).toBeNull();
    expect(r.baku).toBeNull();
  });

  it('admin: a staff estimate per profession is used and labelled; the block can be switched off', async () => {
    fakeCbar();
    const admin = await asAdmin();
    const cur = (await admin.agent.get('/api/admin/life/settings').expect(200)).body.settings;
    await admin.agent.put('/api/admin/life/settings').send({ ...cur, baku: { ...cur.baku, professions: { driver: { grossAzn: 1500, note: 'job ads Nov 2026' } } } }).expect(200);
    const r = (await anon().get('/api/life/estimate?profession=driver&city=berlin').expect(200)).body;
    expect(r.baku).toMatchObject({ kind: 'profession', grossAzn: 1500, source: 'job ads Nov 2026' });
    await admin.agent.put('/api/admin/life/settings').send({ ...cur, baku: { ...cur.baku, enabled: false } }).expect(200);
    expect((await anon().get('/api/life/estimate?profession=driver&city=berlin').expect(200)).body.baku).toBeNull();
    await admin.agent.put('/api/admin/life/settings').send({ baku: { professions: { pilot: { grossAzn: 1 } } } }).expect(400);
  });
});

// ─── Live numbers board ──────────────────────────────────────────────────

const user = () => prisma.user.create({ data: { email: `${uniq('l')}@test.local`, passwordHash: 'x', firstName: 'A', lastName: 'B' } });

const approved = async (opts: { city?: string; profession?: string; decisionAt?: Date; parentCaseId?: string } = {}) => {
  const u = await user();
  const company = await prisma.company.create({ data: { name: 'Firma', city: opts.city ?? 'Hamburg' } });
  return prisma.case.create({
    data: { number: uniq('TV-'), clientId: u.id, profession: opts.profession ?? 'LKW-Fahrer', status: 'APPROVED', decisionAt: opts.decisionAt ?? new Date(), companyId: company.id, parentCaseId: opts.parentCaseId ?? null },
  });
};

const arrival = async (caseId: string, clientId: string, travellers: number, status: 'COMPLETED' | 'CONFIRMED' | 'SUBMITTED' = 'COMPLETED') =>
  prisma.arrivalPlan.create({ data: { caseId, clientId, status, flightDate: new Date(Date.now() - 60 * 60 * 1000), travellers, housingCity: 'Bremen' } });

describe('live numbers board', () => {
  it('shows only figures of at least 3 and never names; top professions and cities', async () => {
    const now = new Date();
    if (now.getUTCDate() === 1 && now.getUTCHours() < 2) return; // flight "an hour ago" would be last month
    const a = await approved();
    await approved();
    await approved({ city: 'Berlin', profession: 'Koch' });
    await approved({ parentCaseId: a.id, profession: 'Familie' }); // family member: a visa, not a profession / city
    // only 2 truck drivers in Hamburg so far + 1 cook in Berlin → no profession / city reaches 3
    let body = (await anon().get('/api/life/live-numbers').expect(200)).body;
    expect(body).toMatchObject({ enabled: true, showOnHome: true, showOnAbout: true });
    expect(body.data).toMatchObject({ period: 'current', visas: 4, arrivals: null, professions: [], cities: [], minCount: 3 });
    expect(JSON.stringify(body)).not.toMatch(/TV-|@test\.local/);

    const third = await approved();
    // arrivals: two plans with 1 + 1 travellers (= 2, hidden), a SUBMITTED one does not count
    await arrival(third.id, third.clientId, 1);
    const b = await approved({ city: 'München' });
    await arrival(b.id, b.clientId, 1, 'SUBMITTED');
    clearLiveNumbersCache();
    body = (await anon().get('/api/life/live-numbers').expect(200)).body;
    expect(body.data.visas).toBe(6);
    expect(body.data.arrivals).toBeNull();
    expect(body.data.professions).toEqual([expect.objectContaining({ key: 'truck_driver', count: 4, labels: expect.objectContaining({ de: 'LKW-Fahrer/in', az: 'Yük maşını sürücüsü' }) })]);
    // Hamburg 2, Bremen 2 (arrival plans' housing city), Berlin 1: no city reaches 3
    expect(body.data.cities).toEqual([]);

    const c = await approved();
    await arrival(c.id, c.clientId, 3); // a family of three arrived
    clearLiveNumbersCache();
    body = (await anon().get('/api/life/live-numbers').expect(200)).body;
    expect(body.data.arrivals).toBe(4);
    expect(body.data.cities).toEqual([{ city: 'Bremen', count: 3 }]); // arrival housing city wins over the employer city
  });

  it('cached for an hour: new cases appear only after the cache expires (or an admin save)', async () => {
    for (let i = 0; i < 3; i++) await approved();
    expect((await anon().get('/api/life/live-numbers').expect(200)).body.data.visas).toBe(3);
    await approved();
    expect((await anon().get('/api/life/live-numbers').expect(200)).body.data.visas).toBe(3);
    const admin = await asAdmin();
    const cur = (await admin.agent.get('/api/admin/life/settings').expect(200)).body;
    expect(cur.board.visas).toBe(3); // the admin preview reads the same hourly cache
    await admin.agent.put('/api/admin/life/settings').send(cur.settings).expect(200);
    expect((await anon().get('/api/life/live-numbers').expect(200)).body.data.visas).toBe(4);
  });

  it('falls back to last month while this month has nothing to show; null with nothing at all', async () => {
    expect((await anon().get('/api/life/live-numbers').expect(200)).body.data).toBeNull();
    const now = new Date();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    for (let i = 0; i < 3; i++) await approved({ decisionAt: lastMonth });
    clearLiveNumbersCache();
    const d = (await anon().get('/api/life/live-numbers').expect(200)).body.data;
    expect(d).toMatchObject({ period: 'previous', month: lastMonth.toISOString().slice(0, 7), visas: 3 });
  });

  it('staff toggle hides the board everywhere or per place', async () => {
    for (let i = 0; i < 3; i++) await approved();
    const admin = await asAdmin();
    const cur = (await admin.agent.get('/api/admin/life/settings').expect(200)).body.settings;
    await admin.agent.put('/api/admin/life/settings').send({ ...cur, board: { enabled: true, showOnHome: false, showOnAbout: true } }).expect(200);
    expect((await anon().get('/api/life/live-numbers').expect(200)).body).toMatchObject({ enabled: true, showOnHome: false, showOnAbout: true });
    await admin.agent.put('/api/admin/life/settings').send({ ...cur, board: { ...cur.board, enabled: false } }).expect(200);
    expect((await anon().get('/api/life/live-numbers').expect(200)).body).toEqual({ enabled: false, showOnHome: false, showOnAbout: false, data: null });
    expect(await prisma.auditLog.count({ where: { action: 'LIFE_SETTINGS_UPDATED' } })).toBe(2);
  });
});
