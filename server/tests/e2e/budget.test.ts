import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createVisaCategory, uniq } from '../helpers/factories';
import { cvPdfText as pdfText } from '../unit/cvPdfText';
import { DEFAULT_CITY_COSTS } from '../../src/lib/budget/cities.js';

const binary = (res: import('superagent').Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const rowBody = (over: Record<string, unknown> = {}) => {
  const { checkedAt, ...d } = DEFAULT_CITY_COSTS.find((x) => x.slug === 'berlin')!;
  return { ...d, slug: uniq('city-'), name: 'Teststadt', checkedAt: checkedAt.toISOString().slice(0, 10), ...over };
};

describe('public budget API', () => {
  it('config seeds the city table once and lists cities, visas and parameters', async () => {
    await createVisaCategory({ slug: 'ausbildung-test', visaLabel: '§16a' });
    const res = await anon().get('/api/budget/config').expect(200);
    expect(res.headers['cache-control']).toContain('public');
    expect(res.body.year).toBe(2026);
    expect(res.body.cities.length).toBe(DEFAULT_CITY_COSTS.length);
    expect(res.body.cities[0]).toMatchObject({ slug: 'berlin', state: 'BE', checkedAt: '2026-10-26' });
    expect(res.body.visas).toEqual([expect.objectContaining({ slug: 'ausbildung-test', blockedAccount: 11_904 })]);
    expect(res.body.params).toMatchObject({ deutschlandticket: 63, kindergeld: 259, blockedAccountYear: 11_904 });
    expect(await prisma.setting.findUnique({ where: { key: 'cityCostsSeeded' } })).not.toBeNull();
  });

  it('estimate: net salary, one-off costs, monthly budget and a share query', async () => {
    const res = await anon().get('/api/budget/estimate?city=berlin&gross=3000&start=2026-12-01').expect(200);
    const b = res.body;
    expect(b.city.slug).toBe('berlin');
    expect(b.net.gross).toBe(3_000);
    expect(b.net.net).toBeGreaterThan(1_950);
    expect(b.net.net).toBeLessThan(2_100);
    expect(b.timeline).toMatchObject({ start: '2026-12-01', firstPay: '2027-01-31', arrival: '2026-11-24' });
    expect(b.oneOff.items.map((l: { key: string }) => l.key)).toEqual(['deposit', 'rent', 'furniture', 'transport', 'phone', 'rundfunk', 'liability', 'healthGap', 'food', 'living']);
    expect(b.bring.recommended).toBeGreaterThan(b.oneOff.total[1]);
    expect(b.bring.blockedAccount).toBeNull();
    expect(b.input).toMatchObject({ household: 'single', housingUsed: 'wg', taxClass: 1 });
    const share = new URLSearchParams(b.share);
    expect(Object.fromEntries(share)).toMatchObject({ city: 'berlin', gross: '3000', household: 'single', housing: 'wg', start: '2026-12-01' });
    // the share query reproduces the same result
    const again = await anon().get(`/api/budget/estimate?${b.share}`).expect(200);
    expect(again.body.bring.recommended).toBe(b.bring.recommended);
  });

  it('matches a vacancy place, uses the visa blocked account and validates input', async () => {
    await createVisaCategory({ slug: 'chancenkarte-test', visaLabel: '§20a Chancenkarte' });
    const r = await anon().get('/api/budget/estimate?place=Langenhagen&gross=2800&visa=chancenkarte-test&household=couple').expect(200);
    expect(r.body.city.slug).toBe('hannover');
    expect(r.body.input.taxClass).toBe(3);
    expect(r.body.input.housingUsed).toBe('flat');
    expect(r.body.visa).toMatchObject({ slug: 'chancenkarte-test', blockedAccount: 11_904 });
    expect(r.body.bring.blockedAccount).toMatchObject({ monthly: 992 });

    const generic = await anon().get('/api/budget/estimate?place=Irgendwo&gross=2500').expect(200);
    expect(generic.body.city.kind).toBe('GENERIC');
    expect(generic.body.warnings).toEqual(expect.arrayContaining(['PLACE_NOT_FOUND', 'STATE_ASSUMED']));

    await anon().get('/api/budget/estimate?city=atlantis').expect(404);
    await anon().get('/api/budget/estimate?gross=-5').expect(400);
    await anon().get('/api/budget/estimate?start=2026-02-30').expect(400);
    await anon().get('/api/budget/estimate?housing=castle').expect(400);
  });

  it('PDF in the requested language with the disclaimer', async () => {
    const res = await anon().get('/api/budget/pdf?city=muenchen&gross=3500&lang=de').buffer(true).parse(binary).expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('budget-muenchen');
    const text = await pdfText(res.body as Buffer);
    expect(text).toContain('Budget für den ersten Monat');
    expect(text).toContain('Unverbindliche');
    expect(text).toContain('München');
    const az = await anon().get('/api/budget/pdf?city=muenchen&gross=3500&lang=az').buffer(true).parse(binary).expect(200);
    expect(await pdfText(az.body as Buffer)).toContain('ilk ayın büdcəsi');
  });
});

describe('portal prefill', () => {
  it('needs a client session', async () => {
    await anon().get('/api/budget/me').expect(401);
    const staff = await asStaff();
    await staff.agent.get('/api/budget/me').expect(403);
  });

  it('prefills from contract, vacancy, visa, arrival plan and family members', async () => {
    const empty = await asClient();
    expect((await empty.agent.get('/api/budget/me').expect(200)).body).toEqual({ hasCase: false, prefill: {}, sources: {} });

    const c = await asClient();
    const visa = await createVisaCategory({ slug: 'pflege-test', visaLabel: '§18a', salaryMin: 2600, salaryMax: 3200 });
    const vacancy = await prisma.vacancy.create({ data: { slug: uniq('job-'), title: { az: 'x', de: 'x', en: 'x', ru: 'x' }, description: { az: 'x', de: 'x', en: 'x', ru: 'x' }, city: 'Mörfelden-Walldorf', salaryMin: 3000, salaryMax: 3400, status: 'OPEN' } });
    const kase = await prisma.case.create({ data: { clientId: c.user.id, number: `TV-B-${crypto.randomBytes(3).toString('hex')}`, profession: 'Fahrer', visaCategoryId: visa.id, vacancyId: vacancy.id } });
    const res1 = await c.agent.get('/api/budget/me').expect(200);
    expect(res1.body.prefill).toMatchObject({ gross: 3_200, city: 'frankfurt', visa: 'pflege-test' });
    expect(res1.body.sources).toMatchObject({ gross: 'vacancy', city: 'vacancy' });

    const start = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 2, 1));
    await prisma.employmentContract.create({ data: { caseId: kase.id, grossMonthly: 3150, startDate: start } });
    await prisma.case.create({ data: { clientId: c.user.id, number: `TV-C-${crypto.randomBytes(3).toString('hex')}`, profession: 'Fahrer', parentCaseId: kase.id, relation: 'child' } });
    const res2 = await c.agent.get('/api/budget/me').expect(200);
    expect(res2.body.prefill).toMatchObject({ gross: 3_150, start: start.toISOString().slice(0, 10), household: 'family', children: 1 });
    expect(res2.body.sources.gross).toBe('contract');
  });
});

describe('admin city costs', () => {
  it('ADMIN+ only', async () => {
    const staff = await asStaff();
    await staff.agent.get('/api/admin/city-costs').expect(403);
    await anon().get('/api/admin/city-costs').expect(401);
  });

  it('create, update (audited with changes), delete, restore defaults — the public data follows at once', async () => {
    const admin = await asAdmin();
    const list = await admin.agent.get('/api/admin/city-costs').expect(200);
    expect(list.body.rows.length).toBe(DEFAULT_CITY_COSTS.length);

    const created = await admin.agent.post('/api/admin/city-costs').send(rowBody({ slug: 'teststadt', state: 'SN' })).expect(201);
    await admin.agent.post('/api/admin/city-costs').send(rowBody({ slug: 'teststadt', state: 'SN' })).expect(409);
    await admin.agent.post('/api/admin/city-costs').send(rowBody({ wgMin: 900, wgMax: 100 })).expect(400);
    expect((await anon().get('/api/budget/config').expect(200)).body.cities.some((x: { slug: string }) => x.slug === 'teststadt')).toBe(true);

    const id = created.body.row.id;
    await admin.agent.put(`/api/admin/city-costs/${id}`).send(rowBody({ slug: 'teststadt', state: 'SN', wgMin: 100, wgMax: 200 })).expect(200);
    const est = await anon().get('/api/budget/estimate?city=teststadt&gross=3000').expect(200);
    expect(est.body.monthly.items.find((l: { key: string }) => l.key === 'rent').amount).toEqual([100, 200]);
    expect(est.body.input.state).toBe('SN');
    const log = await prisma.auditLog.findFirst({ where: { action: 'CITY_COST_UPDATED', target: id } });
    expect(log?.details).toMatchObject({ slug: 'teststadt', changes: { wgMin: { from: 600, to: 100 }, wgMax: { from: 720, to: 200 } } });

    await admin.agent.put(`/api/admin/city-costs/${id}`).send(rowBody({ slug: 'teststadt', state: 'SN', active: false })).expect(200);
    await anon().get('/api/budget/estimate?city=teststadt').expect(404);

    await admin.agent.delete(`/api/admin/city-costs/${id}`).expect(200);
    const berlin = list.body.rows.find((r: { slug: string }) => r.slug === 'berlin');
    await admin.agent.delete(`/api/admin/city-costs/${berlin.id}`).expect(200);
    expect((await admin.agent.post('/api/admin/city-costs/restore-defaults').expect(200)).body.added).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: { in: ['CITY_COST_CREATED', 'CITY_COST_DELETED', 'CITY_COST_DEFAULTS_RESTORED'] } } })).toBe(4);
  });

  it('deleted rows do not come back by themselves', async () => {
    const admin = await asAdmin();
    await anon().get('/api/budget/config').expect(200); // seeds
    await prisma.cityCost.deleteMany();
    const { clearCache } = await import('../../src/lib/cache.js');
    clearCache();
    expect((await admin.agent.get('/api/admin/city-costs').expect(200)).body.rows).toEqual([]);
    await anon().get('/api/budget/estimate').expect(404);
  });
});
