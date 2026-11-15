import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { CaseStatus } from '@prisma/client';
import type { Test } from 'supertest';
import { anon, asClient, asStaff, asSuperAdmin, type Actor } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { binaryParser } from '../helpers/files';
import { cvPdfText } from '../unit/cvPdfText';
import { config } from '../../src/config.js';
import { cachedCardFiles } from '../../src/lib/successShare/privateCard.js';
import { POOL_CONSENT_VERSION, POOL_DAILY_DETAIL_LIMIT } from '../../src/lib/pool/constants.js';
import { asCandidate, asCompany, cleanJobs } from './vacancies.fixtures';

/**
 * Milestone documents: the private Instagram success card, the "Welcome to Germany" arrival certificate with
 * its public check, and the candidate one-pager PDF for employers.
 */

beforeEach(cleanJobs);

const bin = async (req: Test) => {
  const res = await req.buffer(true).parse(binaryParser);
  return res as typeof res & { body: Buffer };
};

const makeCase = async (client: Actor, status: CaseStatus = 'APPROVED', over: Record<string, unknown> = {}) => {
  const company = await prisma.company.create({ data: { name: `Spedition ${uniq('c')} GmbH`, city: 'Hamburg, Altona', status: 'ACTIVE' } });
  const c = await prisma.case.create({
    data: { clientId: client.user.id, number: `TV-2026-${uniq('n')}`, profession: 'LKW-Fahrer', visaType: 'WORK', status, decisionAt: new Date(), companyId: company.id, ...over },
  });
  return { case: c, company };
};

describe('private Instagram success card', () => {
  it('own approved case only: story 1080×1920 and square 1080×1080, cached per case + variant, nothing public', async () => {
    const client = await asClient({ firstName: 'Aynur', lastName: 'Qasımova', locale: 'de' });
    const other = await asClient();
    const { case: c } = await makeCase(client);
    const url = (fmt: string, q = '') => `/api/account/success-share/card/${c.id}/${fmt}.png${q}`;

    const story = await bin(client.agent.get(url('story', '?name=first')));
    expect(story.status).toBe(200);
    expect(story.headers['content-type']).toContain('image/png');
    expect(story.headers['cache-control']).toContain('no-store');
    expect(await sharp(story.body).metadata()).toMatchObject({ width: 1080, height: 1920, format: 'png' });
    const square = await bin(client.agent.get(url('square', '?name=anonymous&lang=ru')));
    expect(await sharp(square.body).metadata()).toMatchObject({ width: 1080, height: 1080 });

    // Deterministic + cached: the same variant gives the same bytes, one file per variant on disk.
    const again = await bin(client.agent.get(url('story', '?name=first')));
    expect(Buffer.compare(again.body, story.body)).toBe(0);
    const files = await cachedCardFiles(c.id);
    expect(files.filter((f) => f.startsWith('story.first.de.'))).toHaveLength(1);
    expect(files.filter((f) => f.startsWith('square.anonymous.ru.'))).toHaveLength(1);
    const dl = await bin(client.agent.get(url('story', '?download=1')));
    expect(dl.headers['content-disposition']).toContain('attachment');

    // Nothing public: no share link was created, other users and anonymous visitors get nothing.
    expect(await prisma.setting.count({ where: { key: { startsWith: 'successShare:' } } })).toBe(0);
    expect((await other.agent.get(url('story'))).status).toBe(404);
    expect((await anon().get(url('story'))).status).toBe(401);
    expect((await client.agent.get(url('huge'))).status).toBe(404);
    expect((await client.agent.get(url('story', '?name=surname'))).status).toBe(400);

    // Reopened case: 404 and the cached cards are removed.
    await prisma.case.update({ where: { id: c.id }, data: { status: 'EMBASSY_REVIEW' } });
    expect((await client.agent.get(url('story'))).status).toBe(404);
    expect(await cachedCardFiles(c.id)).toHaveLength(0);
  });

  it('the public share also offers the square card', async () => {
    const client = await asClient({ firstName: 'Rauf', lastName: 'Məmmədov' });
    const { case: c } = await makeCase(client);
    const res = await client.agent.post('/api/account/success-share').send({ caseId: c.id, consent: true, nameStyle: 'anonymous' });
    expect(res.status).toBe(201);
    expect(res.body.share.cards.square).toMatch(/card-square\.png$/);
    const pub = await anon().get(`/api/success/${res.body.share.token}`);
    expect(pub.body.displayName).toBe('Triad Vision müştərisi');
    expect(JSON.stringify(pub.body)).not.toContain('Rauf');
    const png = await bin(anon().get(res.body.share.cards.square));
    expect(await sharp(png.body).metadata()).toMatchObject({ width: 1080, height: 1080 });
  });
});

const arrive = async (client: Actor, over: Record<string, unknown> = {}) => {
  const made = await makeCase(client);
  await prisma.arrivalPlan.create({ data: { caseId: made.case.id, clientId: client.user.id, status: 'CONFIRMED', arrivalTime: new Date('2026-11-02T09:30:00Z'), ...over } });
  return made;
};

describe('"Welcome to Germany" arrival certificate', () => {
  it('is issued once the arrival is COMPLETED; the PDF is the client\'s own (full name) in the chosen language', async () => {
    const client = await asClient({ firstName: 'Aynur', lastName: 'Qasımova', locale: 'az' });
    const other = await asClient();
    const { case: c, company } = await arrive(client);

    expect((await client.agent.get('/api/account/arrival-certificate')).body.items).toHaveLength(0);
    expect((await client.agent.get(`/api/account/arrival-certificate/${c.id}/certificate.pdf`)).status).toBe(404);

    await prisma.arrivalPlan.update({ where: { caseId: c.id }, data: { status: 'COMPLETED' } });
    const list = await client.agent.get('/api/account/arrival-certificate');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    const item = list.body.items[0];
    expect(item).toMatchObject({ caseId: c.id, city: 'Hamburg', profession: 'LKW-Fahrer', employer: company.name, revoked: false });
    expect(item.number).toMatch(/^ARR-\d{4}-[A-Z2-9]{6}$/);
    expect(item.verifyUrl).toMatch(/\/arrival-certificate\/[A-Z2-9]{12}$/);
    // Idempotent.
    expect((await client.agent.get('/api/account/arrival-certificate')).body.items[0].number).toBe(item.number);
    expect(await prisma.arrivalCertificate.count()).toBe(1);

    const pdf = await bin(client.agent.get(`/api/account/arrival-certificate/${c.id}/certificate.pdf?lang=de`));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const text = await cvPdfText(pdf.body);
    expect(text).toContain('Willkommen in Deutschland!');
    expect(text).toContain('Aynur Qasımova');
    expect(text).toContain('Hamburg');
    expect(text).toContain(item.number);
    expect(text).toContain(company.name);
    const noEmployer = await cvPdfText((await bin(client.agent.get(`/api/account/arrival-certificate/${c.id}/certificate.pdf?lang=ru&employer=0`))).body);
    expect(noEmployer).toContain('Добро пожаловать в Германию!');
    expect(noEmployer).not.toContain(company.name);

    // Own data only; clients only.
    expect((await other.agent.get(`/api/account/arrival-certificate/${c.id}/certificate.pdf`)).status).toBe(404);
    expect((await other.agent.get('/api/account/arrival-certificate')).body.items).toHaveLength(0);
    const staff = await asStaff();
    expect((await staff.agent.get('/api/account/arrival-certificate')).status).toBe(403);
  });

  it('public check shows only number, first name + initial and the date; staff can revoke and restore', async () => {
    const client = await asClient({ firstName: 'Kamran Vüqar', lastName: 'Əliyev', email: `${uniq('kamran')}@test.local` });
    const { case: c } = await arrive(client, { status: 'COMPLETED' });
    const item = (await client.agent.get('/api/account/arrival-certificate')).body.items[0];
    const code = item.verifyUrl.split('/').pop();

    const pub = await anon().get(`/api/arrival-certificates/${code}`);
    expect(pub.status).toBe(200);
    expect(pub.headers['x-robots-tag']).toBe('noindex');
    expect(pub.body).toEqual({ valid: true, number: item.number, holder: 'Kamran Ə.', arrivedAt: '2026-11-02' });
    const raw = JSON.stringify(pub.body);
    for (const secret of ['Əliyev', 'Vüqar', client.user.email, client.user.id, c.id, 'Hamburg', 'LKW', 'Spedition']) expect(raw).not.toContain(secret);
    expect((await anon().get(`/api/arrival-certificates/${code.toLowerCase()}`)).status).toBe(200); // QR scanners may lower-case
    expect((await anon().get('/api/arrival-certificates/AAAAAAAAAAAA')).status).toBe(404);
    expect((await anon().get('/api/arrival-certificates/bad')).status).toBe(404);

    // Only staff can revoke.
    const cert = await prisma.arrivalCertificate.findUniqueOrThrow({ where: { caseId: c.id } });
    expect((await client.agent.post(`/api/admin/arrival-certificates/${cert.id}/revoke`).send({})).status).toBe(403);
    const staff = await asStaff();
    const view = await staff.agent.get(`/api/admin/arrival-certificates?caseId=${c.id}`);
    expect(view.body.certificate).toMatchObject({ id: cert.id, number: item.number, revokedAt: null });
    const rev = await staff.agent.post(`/api/admin/arrival-certificates/${cert.id}/revoke`).send({ reason: 'Wrong arrival date' });
    expect(rev.status).toBe(200);
    expect(rev.body.certificate.revokedAt).not.toBeNull();

    const gone = await anon().get(`/api/arrival-certificates/${code}`);
    expect(gone.status).toBe(410);
    expect(gone.body.error).toBe('CERTIFICATE_REVOKED');
    expect(JSON.stringify(gone.body)).not.toContain('Kamran');
    expect((await client.agent.get(`/api/account/arrival-certificate/${c.id}/certificate.pdf`)).status).toBe(410);
    expect((await client.agent.get('/api/account/arrival-certificate')).body.items[0]).toMatchObject({ revoked: true, verifyUrl: null });
    expect(await prisma.auditLog.count({ where: { action: 'ARRIVAL_CERTIFICATE_REVOKED', target: cert.id } })).toBe(1);

    expect((await staff.agent.post(`/api/admin/arrival-certificates/${cert.id}/restore`)).status).toBe(200);
    expect((await anon().get(`/api/arrival-certificates/${code}`)).status).toBe(200);
  });

  it('DSGVO erasure removes certificates, share links and cached cards', async () => {
    const client = await asClient({ firstName: 'Leyla', lastName: 'Həsənova' });
    const { case: c } = await arrive(client, { status: 'COMPLETED' });
    const item = (await client.agent.get('/api/account/arrival-certificate')).body.items[0];
    const code = item.verifyUrl.split('/').pop();
    await bin(client.agent.get(`/api/account/success-share/card/${c.id}/story.png`));
    await client.agent.post('/api/account/success-share').send({ caseId: c.id, consent: true });
    expect(await cachedCardFiles(c.id)).toHaveLength(1);

    const sa = await asSuperAdmin();
    expect((await sa.agent.delete(`/api/admin/users/${client.user.id}`).send({ confirmEmail: client.user.email })).status).toBe(200);
    expect(await prisma.arrivalCertificate.count({ where: { userId: client.user.id } })).toBe(0);
    expect(await prisma.setting.count({ where: { key: { startsWith: 'successShare:' } } })).toBe(0);
    expect(await cachedCardFiles(c.id)).toHaveLength(0);
    await expect(fs.stat(path.join(config.uploads.cacheDir, 'success-cards', c.id))).rejects.toThrow();
    expect((await anon().get(`/api/arrival-certificates/${code}`)).status).toBe(404);
  });
});

describe('candidate one-pager PDF for employers', () => {
  const SECRETS = { firstName: 'Rəşad', lastName: 'Əliyev', phone: '+994509998877', passportNumber: 'C01234567', about: 'Mənim adım Rəşad, telefonum 0501234567' };

  const poolCandidate = async () => {
    const c = await asCandidate({ ...SECRETS, profession: 'LKW-Fahrer', germanLevel: 'B1', drivingLicence: 'B, C, CE', experienceYears: 6, recognitionStatus: 'IN_PROGRESS' });
    const res = await c.agent.put('/api/account/candidate-pool').send({ consent: true, version: POOL_CONSENT_VERSION, regions: ['HH', 'NI'], availability: 'IMMEDIATE', skills: ['Gabelstapler'], track: 'JOB' });
    expect(res.status).toBe(200);
    await prisma.candidatePoolProfile.update({ where: { code: res.body.profile.code }, data: { summary: 'Zuverlässiger Fahrer aus Gəncə, Nizami küç.' } });
    return { ...c, code: res.body.profile.code as string };
  };

  it('pool profile: only the anonymous fields (text layer has no PII), counts as a profile view', async () => {
    const cand = await poolCandidate();
    const employer = await asCompany();
    const res = await bin(employer.agent.get(`/api/company/pool/${cand.code}/one-pager.pdf?lang=de`));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    const text = await cvPdfText(res.body);
    expect(text).toContain(cand.code);
    expect(text).toContain('LKW-Fahrer');
    expect(text).toContain('6 Jahre');
    expect(text).toContain('B1');
    expect(text).toContain('CE');
    expect(text).toContain('Im Verfahren');
    expect(text).toContain('Hamburg');
    expect(text).toContain('Niedersachsen');
    expect(text).toContain(`Erstellt für ${employer.company.name}`);
    const lower = text.toLowerCase();
    for (const secret of [SECRETS.firstName, SECRETS.lastName, SECRETS.phone, SECRETS.passportNumber, '0501234567', 'Gəncə', 'Nizami', cand.user.email, 'Gabelstapler', 'Zuverlässiger']) {
      expect(lower).not.toContain(secret.toLowerCase());
    }
    expect(await prisma.candidatePoolView.count({ where: { companyId: employer.company.id, kind: 'DETAIL' } })).toBe(1);

    const plain = await cvPdfText((await bin(employer.agent.get(`/api/company/pool/${cand.code}/one-pager.pdf?branding=0`))).body);
    expect(plain).not.toContain(employer.company.name);

    // Daily cap: a PDF is a profile view like any other.
    const since = new Date();
    await prisma.candidatePoolView.createMany({ data: Array.from({ length: POOL_DAILY_DETAIL_LIMIT }, () => ({ companyId: employer.company.id, userId: employer.user.id, kind: 'DETAIL' as const, results: 0, createdAt: since })) });
    const capped = await employer.agent.get(`/api/company/pool/${cand.code}/one-pager.pdf`);
    expect(capped.status).toBe(429);
    expect(capped.body.error).toBe('POOL_DAILY_LIMIT');
  });

  it('suspended / pending companies and other roles are blocked; unknown or withdrawn codes 404', async () => {
    const cand = await poolCandidate();
    expect((await (await asCompany('SUSPENDED')).agent.get(`/api/company/pool/${cand.code}/one-pager.pdf`)).body.error).toBe('COMPANY_SUSPENDED');
    expect((await (await asCompany('PENDING')).agent.get(`/api/company/pool/${cand.code}/one-pager.pdf`)).status).toBe(403);
    expect((await cand.agent.get(`/api/company/pool/${cand.code}/one-pager.pdf`)).status).toBe(403);
    const employer = await asCompany();
    expect((await employer.agent.get('/api/company/pool/TV-K-0000/one-pager.pdf')).status).toBe(404);
    await cand.agent.put('/api/account/candidate-pool').send({ consent: false });
    expect((await employer.agent.get(`/api/company/pool/${cand.code}/one-pager.pdf`)).status).toBe(404);
  });

  it('own worker: only what the workers panel shows; another company\'s worker 404; suspended blocked', async () => {
    const employer = await asCompany();
    const other = await asCompany();
    const worker = await asCandidate({ ...SECRETS, firstName: 'Cavid', lastName: 'Quliyev' });
    const kase = await prisma.case.create({ data: { number: uniq('TV-'), clientId: worker.user.id, profession: 'Pflegekraft', companyId: employer.company.id, status: 'APPROVED', decisionAt: new Date() } });
    await prisma.arrivalPlan.create({ data: { caseId: kase.id, clientId: worker.user.id, status: 'CONFIRMED', flightDate: new Date(Date.now() + 10 * 86400000), flightNumber: 'J2 777', pickupDetails: 'Fahrer Herr Schmidt +4917612345' } });

    const res = await bin(employer.agent.get(`/api/company/workers/${kase.id}/one-pager.pdf?lang=de`));
    expect(res.status).toBe(200);
    const text = await cvPdfText(res.body);
    const panel = (await employer.agent.get('/api/company/workers')).body.items.find((r: { id: string }) => r.id === kase.id);
    expect(text).toContain(panel.name); // anonymised "Cavid Q."
    expect(text).toContain('Pflegekraft');
    expect(text).toContain('Visum erteilt');
    for (const secret of ['Quliyev', SECRETS.phone, SECRETS.passportNumber, 'J2 777', 'Schmidt', worker.user.email, 'Gəncə']) expect(text).not.toContain(secret);

    expect((await other.agent.get(`/api/company/workers/${kase.id}/one-pager.pdf`)).status).toBe(404);
    expect((await worker.agent.get(`/api/company/workers/${kase.id}/one-pager.pdf`)).status).toBe(403);
    await prisma.company.update({ where: { id: employer.company.id }, data: { status: 'SUSPENDED' } });
    expect((await employer.agent.get(`/api/company/workers/${kase.id}/one-pager.pdf`)).status).toBe(403);
  });
});
