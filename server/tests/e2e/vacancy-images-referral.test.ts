import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { anon, asAdmin, sessionAgent, ORIGIN } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser, uniq } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';
import { asCompany, cleanJobs, createVacancy } from './vacancies.fixtures';

beforeEach(async () => {
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'public'), { recursive: true });
  await cleanJobs();
});

const photo = (width = 1200, height = 800, format: 'png' | 'jpeg' = 'jpeg') =>
  sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 200 } } })
    .withMetadata({ exif: { IFD0: { Copyright: 'secret-gps' } } })
    [format]()
    .toBuffer();

const ld = (html: string) =>
  [...html.matchAll(/<script data-seo type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

describe('vacancy images', () => {
  it('admin upload re-encodes to WebP with width variants and strips metadata', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.post('/api/admin/vacancies/images').attach('file', await photo(2400, 1600), 'foto.jpg');
    expectStatus(res, 201);
    expect(res.body.url).toMatch(/^\/uploads\/vacancies\/[a-f0-9]{32}\.webp$/);
    expect(res.body).toMatchObject({ w: 1600, h: 1067 });
    const file = path.join(TEST_UPLOADS_DIR, 'public', res.body.url.replace('/uploads/', ''));
    const meta = await sharp(file).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    for (const w of [480, 960]) {
      const v = await sharp(file.replace(/\.webp$/, `-${w}.webp`)).metadata();
      expect(v.width).toBe(w);
    }
  });

  it('refuses SVG, non-images, tiny images and anonymous / candidate uploads', async () => {
    const admin = await asAdmin();
    const svg = await admin.agent.post('/api/admin/vacancies/images').attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg');
    expect(svg.status).toBe(400);
    const fake = await admin.agent.post('/api/admin/vacancies/images').attach('file', Buffer.from('not really a png'), 'x.png');
    expect(fake.status).toBe(400);
    expect(fake.body.error).toBe('INVALID_IMAGE');
    const tiny = await admin.agent.post('/api/admin/vacancies/images').attach('file', await photo(100, 60, 'png'), 'x.png');
    expect(tiny.body.error).toBe('IMAGE_TOO_SMALL');
    expect((await anon().post('/api/company/vacancies/images').set('Origin', ORIGIN).attach('file', await photo(), 'a.jpg')).status).toBe(401);
  });

  it('employer images are saved with the vacancy, go back to review on a live vacancy and show on the public board', async () => {
    const co = await asCompany();
    const up1 = await co.agent.post('/api/company/vacancies/images').attach('file', await photo(), 'a.jpg');
    const up2 = await co.agent.post('/api/company/vacancies/images').attach('file', await photo(800, 1000, 'png'), 'b.png');
    expectStatus(up1, 201);
    expectStatus(up2, 201);
    const v = await createVacancy({ companyId: co.company.id, status: 'OPEN', publishedAt: new Date() });

    // Only stored vacancy photos are accepted, at most 8, no duplicates.
    const bad = await co.agent.patch(`/api/company/vacancies/${v.id}`).send({ images: [{ url: 'https://evil.example/x.png' }] });
    expect(bad.status).toBe(400);
    const dup = await co.agent.patch(`/api/company/vacancies/${v.id}`).send({ images: [{ url: up1.body.url }, { url: up1.body.url }] });
    expect(dup.status).toBe(400);
    const nine = Array.from({ length: 9 }, (_, i) => ({ url: `/uploads/vacancies/${String(i).padStart(32, 'a')}.webp` }));
    expect((await co.agent.patch(`/api/company/vacancies/${v.id}`).send({ images: nine })).status).toBe(400);

    const images = [
      { url: up2.body.url, alt: '  Lager  ', w: up2.body.w, h: up2.body.h },
      { url: up1.body.url, w: up1.body.w, h: up1.body.h },
    ];
    const ok = await co.agent.patch(`/api/company/vacancies/${v.id}`).send({ images });
    expectStatus(ok, 200);
    expect(ok.body.vacancy.status).toBe('PENDING'); // live vacancy → back to review
    expect(ok.body.vacancy.images).toEqual([{ url: up2.body.url, alt: 'Lager', w: 800, h: 1000 }, { url: up1.body.url, w: 1200, h: 800 }]);
    expect((await anon().get(`/api/vacancies/${v.slug}`)).status).toBe(404);

    // Staff approve → public, cover first.
    const admin = await asAdmin();
    expectStatus(await admin.agent.post(`/api/admin/vacancies/${v.id}/approve`), 200);
    const pub = await anon().get(`/api/vacancies/${v.slug}`);
    expect(pub.body.vacancy.images[0]).toEqual({ url: up2.body.url, alt: 'Lager', w: 800, h: 1000 });
    const list = await anon().get('/api/vacancies');
    expect(list.body.items.find((x: { id: string }) => x.id === v.id).images).toHaveLength(2);

    // Clearing.
    const cleared = await admin.agent.patch(`/api/admin/vacancies/${v.id}`).send({ images: [] });
    expectStatus(cleared, 200);
    expect(cleared.body.vacancy.images).toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { action: 'VACANCY_UPDATED', target: `vacancy:${v.id}` }, orderBy: { createdAt: 'desc' } });
    expect(JSON.stringify(audit?.details)).toContain('images');
  });

  it('job page: the cover is the OG image and the JobPosting gets image', async () => {
    const co = await asCompany();
    const up = await co.agent.post('/api/company/vacancies/images').attach('file', await photo(), 'a.jpg');
    const v = await createVacancy({
      companyId: co.company.id,
      status: 'OPEN',
      publishedAt: new Date(Date.now() - 60_000),
      images: [{ url: up.body.url, alt: 'Truck' }],
    });
    const plain = await createVacancy({ companyId: co.company.id, status: 'OPEN', publishedAt: new Date(Date.now() - 60_000) });

    const head = (await anon().get('/api/seo/head').query({ path: `/jobs/${v.slug}`, lng: 'de' })).text;
    expect(head).toContain(`property="og:image" content="${ORIGIN}${up.body.url}"`);
    expect(ld(head).find((b) => b['@type'] === 'JobPosting').image).toEqual([`${ORIGIN}${up.body.url}`]);

    const other = (await anon().get('/api/seo/head').query({ path: `/jobs/${plain.slug}`, lng: 'de' })).text;
    expect(other).toContain(`/og/jobs/de/${plain.slug}.png`);
    expect(ld(other).find((b) => b['@type'] === 'JobPosting').image).toBeUndefined();
  });
});

describe('employer referral', () => {
  const registration = (over: Record<string, unknown> = {}) => ({
    company: { name: 'Ref Logistik GmbH', sector: 'logistics', city: 'Bremen', phone: '+49 421 555 000' },
    user: { firstName: 'Jan', lastName: 'Ref', email: `${uniq('ref')}@ref-logistik.de`, password: 'Sicher123' },
    locale: 'de',
    acceptTerms: true,
    ...over,
  });

  const makeAgent = async (over: Partial<Prisma.AgentUncheckedCreateInput> = {}) => {
    const u = await createUser({ role: 'AGENT', firstName: 'Rauf', lastName: 'Agentov', locale: 'en' });
    const row = await prisma.agent.create({
      data: { userId: u.user.id, code: uniq('AG').toUpperCase().slice(0, 30), commissionType: 'FIXED', commissionValue: 20000, payoutEvents: ['EMPLOYER_APPROVED'], ...over },
    });
    return { ...u, row, agent: sessionAgent(u.token) };
  };

  it('stores the agent attribution, pays EMPLOYER_APPROVED once on approval and lists the employer for the agent and the admin', async () => {
    const a = await makeAgent();
    const res = await anon().post('/api/company/register').set('Origin', ORIGIN).send(registration({ ref: a.row.code.toLowerCase(), refEntered: true }));
    expectStatus(res, 201);
    const company = await prisma.company.findUniqueOrThrow({ where: { id: res.body.company.id } });
    expect(company).toMatchObject({ referralCode: a.row.code, referredByAgentId: a.row.id });
    expect(company.referredAt).toBeInstanceOf(Date);
    expect(res.body.company.referredByAgentId).toBeUndefined(); // not in the employer's own view

    const admin = await asAdmin();
    const detail = await admin.agent.get(`/api/admin/companies/${company.id}`);
    expect(detail.body.referral).toMatchObject({ code: a.row.code, agent: { id: a.row.id, code: a.row.code, name: 'Rauf Agentov' } });

    expectStatus(await admin.agent.post(`/api/admin/companies/${company.id}/status`).send({ status: 'ACTIVE' }), 200);
    expectStatus(await admin.agent.post(`/api/admin/companies/${company.id}/status`).send({ status: 'SUSPENDED' }), 200);
    expectStatus(await admin.agent.post(`/api/admin/companies/${company.id}/status`).send({ status: 'ACTIVE' }), 200);
    const rows = await prisma.agentCommission.findMany({ where: { agentId: a.row.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event: 'EMPLOYER_APPROVED', sourceRef: company.id, amountCents: 20000, clientId: null, status: 'PENDING' });

    const refs = await a.agent.get('/api/agent/referrals');
    expectStatus(refs, 200);
    expect(refs.body.employers).toEqual([
      expect.objectContaining({ name: 'Ref Logistik GmbH', city: 'Bremen', status: 'ACTIVE', earnedCents: 20000 }),
    ]);
    expect(JSON.stringify(refs.body.employers)).not.toContain('@'); // no contacts
    const dash = await a.agent.get('/api/agent/dashboard');
    expect(dash.body.counts.employers).toBe(1);
    const adminAgent = await admin.agent.get(`/api/admin/agents/${a.row.id}`);
    expect(adminAgent.status).toBe(200);
  });

  it('EMPLOYER_APPROVED is paid once even when approvals run at the same moment', async () => {
    const a = await makeAgent();
    const res = await anon().post('/api/company/register').set('Origin', ORIGIN).send(registration({ ref: a.row.code }));
    const companyId = res.body.company.id as string;
    const { awardEmployerCommission } = await import('../../src/lib/agents/commissions.js');
    await Promise.all(Array.from({ length: 5 }, () => awardEmployerCommission(companyId)));
    expect(await prisma.agentCommission.count({ where: { agentId: a.row.id, event: 'EMPLOYER_APPROVED' } })).toBe(1);
  });

  it('INVOICE_PAID of a referred employer goes to the agent it signed up with', async () => {
    const a = await makeAgent({ commissionType: 'PERCENT', commissionValue: 1000, payoutEvents: ['INVOICE_PAID'] });
    const res = await anon().post('/api/company/register').set('Origin', ORIGIN).send(registration({ ref: a.row.code }));
    const admin = await asAdmin();
    const companyId = res.body.company.id as string;
    expectStatus(await admin.agent.post(`/api/admin/companies/${companyId}/status`).send({ status: 'ACTIVE' }), 200);
    const inv = (
      await admin.agent.post('/api/admin/invoices').send({ companyId, issueDate: '2026-03-10', vatRate: 0, items: [{ description: 'Vermittlung', quantity: 1, unitPriceCents: 100000 }] })
    ).body.invoice;
    expectStatus(await admin.agent.post(`/api/admin/invoices/${inv.id}/send`), 200);
    expectStatus(await admin.agent.post(`/api/admin/invoices/${inv.id}/paid`).send({}), 200);
    const rows = await prisma.agentCommission.findMany({ where: { agentId: a.row.id, event: 'INVOICE_PAID' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceRef: inv.id, amountCents: 10000, clientId: null });
    const refs = await a.agent.get('/api/agent/referrals');
    expect(refs.body.employers[0].earnedCents).toBe(10000);
  });

  it('refuses an unknown typed code, ignores an unknown cookie code and keeps a non-agent code without attribution', async () => {
    const typed = await anon().post('/api/company/register').set('Origin', ORIGIN).send(registration({ ref: 'NOPE-123', refEntered: true }));
    expect(typed.status).toBe(400);
    expect(typed.body.error).toBe('REFERRAL_CODE_UNKNOWN');

    const cookie = await anon().post('/api/company/register').set('Origin', ORIGIN).set('Cookie', 'tv_ref=NOPE-123').send(registration());
    expectStatus(cookie, 201);
    const c1 = await prisma.company.findUniqueOrThrow({ where: { id: cookie.body.company.id } });
    expect(c1.referralCode).toBeNull();

    const paused = await makeAgent({ status: 'PAUSED' });
    const p = await anon().post('/api/company/register').set('Origin', ORIGIN).set('Cookie', `tv_ref=${paused.row.code}`).send(registration());
    expectStatus(p, 201);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: p.body.company.id } })).referredByAgentId).toBeNull();

    // A referral partner's code is valid: kept as the code, no agent.
    const partner = await prisma.referralPartner.create({ data: { name: uniq('Partner '), code: uniq('PT').toUpperCase().slice(0, 30) } });
    const pr = await anon().post('/api/company/register').set('Origin', ORIGIN).send(registration({ ref: partner.code, refEntered: true }));
    expectStatus(pr, 201);
    expect(await prisma.company.findUniqueOrThrow({ where: { id: pr.body.company.id } })).toMatchObject({ referralCode: partner.code, referredByAgentId: null });
    await prisma.referralPartner.delete({ where: { id: partner.id } });
  });
});
