import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Test } from 'supertest';
import { anon, app, asAdmin, asClient, asStaff, asSuperAdmin, ORIGIN, type Actor } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { binaryParser } from '../helpers/files';
import { cvPdfText } from '../unit/cvPdfText';
import { POOL_CONSENT_VERSION } from '../../src/lib/pool/constants.js';
import { CHALLENGE_KEYS, challengeForWeek } from '../../src/lib/readyProgress/logic.js';
import { DAILY_RESULT_CAP } from '../../src/lib/readyProgress/service.js';
import { runFutureLetterDeliveries } from '../../src/lib/futureLetter/service.js';
import { asCandidate, asCompany, cleanJobs } from './vacancies.fixtures';

/**
 * Germany Ready (synced practice results, points, certificate + public check + staff revoke, weekly challenge),
 * the letter to my future self (sealed, owner-only, delivered on arrival) and the consent-gated employer readiness card.
 */

beforeEach(cleanJobs);

const bin = async (req: Test) => {
  const res = await req.buffer(true).parse(binaryParser);
  return res as typeof res & { body: Buffer };
};

const post = (c: Actor | { agent: Actor['agent'] }, results: Record<string, unknown>[]) => c.agent.post('/api/account/ready/results').send({ results });

/** Practice results worth 65 points / 7 completed activities (bronze needs 60 / 5). */
const BRONZE_RUN = [
  { activityId: 'traffic-signs', score: 28, max: 30 },
  { activityId: 'waste-sorting', score: 16, max: 20 },
  { activityId: 'price-game', score: 700, max: 1000 },
  { activityId: 'work-scenes', item: 'truck-cab', score: 9, max: 10 },
  { activityId: 'mock-a1', item: 'lesen', score: 20, max: 25 },
  { activityId: 'mock-a1', item: 'hoeren', score: 18, max: 25 },
  ...['anmeldung', 'bank', 'doctor'].map((item) => ({ activityId: 'german-simulator', item, score: 80, max: 100 })),
  ...Array.from({ length: 10 }, (_, i) => ({ activityId: 'pronunciation', item: `p-test-${i}`, score: 90, max: 100 })),
];

describe('practice result sync', () => {
  it('validates against the registry, clamps, is idempotent per completion, own data only', async () => {
    const client = await asClient();
    const at = new Date(Date.now() - 60_000).toISOString();
    const first = await post(client, [{ activityId: 'traffic-signs', score: 999, max: 30, completedAt: at }]);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ received: 1, stored: 1, duplicates: 0 });
    const again = await post(client, [{ activityId: 'traffic-signs', score: 999, max: 30, completedAt: at }]);
    expect(again.body).toMatchObject({ stored: 0, duplicates: 1 });
    const rows = await prisma.readyActivityResult.findMany({ where: { userId: client.user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ score: 30, max: 30, percent: 100 });

    expect((await post(client, [{ activityId: 'casino', score: 1, max: 1 }])).body.error).toBe('UNKNOWN_ACTIVITY');
    expect((await post(client, [{ activityId: 'vocabulary', score: 1, max: 1 }])).body.error).toBe('SERVER_ACTIVITY');
    expect((await post(client, [{ activityId: 'german-simulator', item: 'nope', score: 1, max: 1 }])).body.error).toBe('BAD_ITEM');
    expect((await post(client, [])).status).toBe(400);
    expect((await post(client, Array.from({ length: 51 }, () => ({ activityId: 'price-game', score: 1, max: 10 })))).status).toBe(400);
    // One bad row rejects the whole batch.
    expect((await post(client, [{ activityId: 'price-game', score: 1, max: 10 }, { activityId: 'x', score: 1, max: 1 }])).status).toBe(400);
    expect(await prisma.readyActivityResult.count({ where: { userId: client.user.id } })).toBe(1);

    const overview = (await client.agent.get('/api/account/ready')).body;
    expect(overview.activities.find((a: { id: string }) => a.id === 'traffic-signs')).toMatchObject({ done: true, earned: 10 });
    expect(overview.points).toBe(10);
    expect(overview.certificate).toBeNull();

    const other = await asClient();
    expect((await other.agent.get('/api/account/ready')).body.points).toBe(0);
    expect((await (await asStaff()).agent.get('/api/account/ready')).status).toBe(403);
    expect((await anon().post('/api/account/ready/results').set('Origin', ORIGIN).send({ results: [] })).status).toBe(401);
  });

  it('daily cap per client', async () => {
    const client = await asClient();
    const now = Date.now();
    await prisma.readyActivityResult.createMany({
      data: Array.from({ length: DAILY_RESULT_CAP }, (_, i) => ({ userId: client.user.id, activityId: 'price-game', score: 1, max: 10, percent: 10, completedAt: new Date(now - (i + 5) * 1000) })),
    });
    const r = await post(client, [{ activityId: 'price-game', score: 1, max: 10 }]);
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('READY_DAILY_LIMIT');
  });
});

describe('Germany Ready certificate', () => {
  it('issued at the threshold, PDF + public check without personal data, staff revoke / restore', async () => {
    const client = await asClient({ firstName: 'Aynur', lastName: 'Qasımova', locale: 'de' });
    expect((await client.agent.get('/api/account/ready/certificate.pdf')).status).toBe(404);
    expect((await post(client, BRONZE_RUN)).status).toBe(200);
    const o = (await client.agent.get('/api/account/ready')).body;
    expect(o.level).toBe('BRONZE');
    expect(o.points).toBeGreaterThanOrEqual(60);
    expect(o.certificate).toMatchObject({ level: 'BRONZE', revoked: false });
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'READY_CERTIFICATE' } })).toBe(1);
    // A second visit does not re-issue or re-notify.
    await client.agent.get('/api/account/ready');
    expect(await prisma.readyCertificate.count({ where: { userId: client.user.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'READY_CERTIFICATE' } })).toBe(1);

    const pdf = await bin(client.agent.get('/api/account/ready/certificate.pdf?lang=de'));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const text = await cvPdfText(pdf.body);
    expect(text).toContain('Aynur');
    expect(text).toContain('Praxis-Erfolge');
    expect(text).toContain('keine Prüfung');

    const code = (o.certificate.verifyUrl as string).split('/').pop()!;
    const pub = await anon().get(`/api/ready-certificates/${code}`);
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({ valid: true, holder: 'A. Q.', level: 'BRONZE', activities: o.done });
    expect(JSON.stringify(pub.body)).not.toMatch(/Aynur|Qasımova|@/);
    expect((await anon().get('/api/ready-certificates/AAAAAAAAAAAA')).status).toBe(404);
    expect((await anon().get('/api/ready-certificates/bad')).status).toBe(404);

    const staff = await asStaff();
    const found = (await staff.agent.get(`/api/admin/ready/certificates?userId=${client.user.id}`)).body.certificate;
    expect(found).toMatchObject({ level: 'BRONZE', revokedAt: null });
    expect((await client.agent.post(`/api/admin/ready/certificates/${found.id}/revoke`).send({})).status).toBe(403);
    expect((await staff.agent.post(`/api/admin/ready/certificates/${found.id}/revoke`).send({ reason: 'Test' })).status).toBe(200);
    expect((await anon().get(`/api/ready-certificates/${code}`)).status).toBe(410);
    expect((await client.agent.get('/api/account/ready/certificate.pdf')).status).toBe(410);
    expect((await client.agent.get('/api/account/ready')).body.certificate).toMatchObject({ revoked: true, verifyUrl: null });
    expect((await staff.agent.post(`/api/admin/ready/certificates/${found.id}/restore`)).status).toBe(200);
    expect((await anon().get(`/api/ready-certificates/${code}`)).status).toBe(200);

    // Privacy export + erasure with the account.
    const exp = (await client.agent.get('/api/account/export')).body;
    expect(exp.germanyReady.certificate).toMatchObject({ level: 'BRONZE' });
    expect(exp.germanyReady.results.length).toBe(BRONZE_RUN.length);
    const sa = await asSuperAdmin();
    expect((await sa.agent.delete(`/api/admin/users/${client.user.id}`).send({ confirmEmail: client.user.email })).status).toBe(200);
    expect(await prisma.readyActivityResult.count({ where: { userId: client.user.id } })).toBe(0);
    expect(await prisma.readyCertificate.count({ where: { userId: client.user.id } })).toBe(0);
  });
});

describe('weekly challenge', () => {
  it('admin order decides the week\'s challenge; completion is recorded once and earns a badge', async () => {
    const now = new Date();
    const current = challengeForWeek(now).key;
    const idx = CHALLENGE_KEYS.indexOf(current);
    const order = [...CHALLENGE_KEYS];
    const t = order.indexOf('TRAFFIC_30');
    [order[idx], order[t]] = [order[t], order[idx]];

    expect((await (await asStaff()).agent.put('/api/admin/ready/challenges').send({ order })).status).toBe(403);
    const admin = await asAdmin();
    const saved = await admin.agent.put('/api/admin/ready/challenges').send({ order });
    expect(saved.status).toBe(200);
    expect(saved.body.upcoming[0].key).toBe('TRAFFIC_30');
    expect((await admin.agent.put('/api/admin/ready/challenges').send({ order: ['NOPE'] })).status).toBe(400);

    const client = await asClient();
    let o = (await client.agent.get('/api/account/ready')).body;
    expect(o.challenge).toMatchObject({ key: 'TRAFFIC_30', goal: 30, value: 0, done: false });
    await post(client, [
      { activityId: 'traffic-signs', score: 18, max: 30, completedAt: new Date(Date.now() - 5000).toISOString() },
      { activityId: 'traffic-signs', score: 14, max: 30, completedAt: new Date(Date.now() - 2000).toISOString() },
    ]);
    o = (await client.agent.get('/api/account/ready/summary')).body;
    expect(o.challenge).toMatchObject({ key: 'TRAFFIC_30', done: true, value: 30, completedTotal: 1 });
    await client.agent.get('/api/account/ready');
    expect(await prisma.readyChallengeCompletion.count({ where: { userId: client.user.id } })).toBe(1);
    const badges = (await client.agent.get('/api/account/germany/badges')).body.badges as { key: string; earned: boolean }[];
    expect(badges.find((b) => b.key === 'CHALLENGE_1')?.earned).toBe(true);
    expect(badges.find((b) => b.key === 'CHALLENGE_5')?.earned).toBe(false);
  });
});

describe('letter to my future self', () => {
  const TEXT = 'Salam, gələcək mən! Bu gün Bakıda vizanı gözləyirəm. Unutma: hər şey yaxşı olacaq.';

  it('sealed at rest, readable only by its author; staff, admins and other clients never see it', async () => {
    const client = await asClient();
    expect((await client.agent.get('/api/account/future-letter')).body).toMatchObject({ letter: null, arrived: false });
    const put = await client.agent.put('/api/account/future-letter').send({ body: TEXT, deliverOn: '2030-01-15' });
    expect(put.status).toBe(200);
    expect(put.body.letter).toMatchObject({ body: TEXT, deliverOn: '2030-01-15', delivered: false });
    const row = await prisma.futureLetter.findUniqueOrThrow({ where: { userId: client.user.id } });
    expect(row.sealed).not.toContain('Salam');
    expect(row.sealed.startsWith('v1:')).toBe(true);

    // Other client: own (empty) letter only.
    const other = await asClient();
    expect((await other.agent.get('/api/account/future-letter')).body.letter).toBeNull();
    // Staff / admins: no account access, no admin endpoint.
    const staff = await asStaff();
    const admin = await asAdmin();
    expect((await staff.agent.get('/api/account/future-letter')).status).toBe(403);
    expect((await admin.agent.get('/api/account/future-letter')).status).toBe(403);
    for (const url of ['/api/admin/future-letters', `/api/admin/future-letters/${client.user.id}`, `/api/admin/users/${client.user.id}/future-letter`]) {
      const r = await admin.agent.get(url);
      expect(r.status, url).toBe(404);
      expect(JSON.stringify(r.body)).not.toContain('Salam');
    }
    // "View as client": existence only, never the text.
    const imp = await admin.agent.post(`/api/admin/impersonate/${client.user.id}`).send({ reason: 'SUPPORT_REQUEST' });
    expect(imp.status).toBe(201);
    const impCookie = ([] as string[]).concat(imp.headers['set-cookie'] ?? []).find((c) => c.startsWith('tv_imp='))!.split(';')[0];
    const viewed = await request(app).get('/api/account/future-letter').set('Cookie', `tv_session=${admin.token}; ${impCookie}`).set('Origin', ORIGIN);
    expect(viewed.status).toBe(200);
    expect(viewed.body.letter).toMatchObject({ body: null, hidden: true });
    expect(JSON.stringify(viewed.body)).not.toContain('Salam');

    // Validation.
    expect((await client.agent.put('/api/account/future-letter').send({ body: '   ' })).body.error).toBe('LETTER_EMPTY');
    expect((await client.agent.put('/api/account/future-letter').send({ body: 'x'.repeat(5001) })).body.error).toBe('LETTER_TOO_LONG');
    expect((await client.agent.put('/api/account/future-letter').send({ body: 'ok', deliverOn: '2020-01-01' })).body.error).toBe('LETTER_BAD_DATE');

    // Privacy export: decrypted for the owner.
    expect((await client.agent.get('/api/account/export')).body.futureLetter).toMatchObject({ text: TEXT });
  });

  it('delivered once when the arrival is recorded (e-mail + portal), then read-only; delete any time', async () => {
    const client = await asClient({ locale: 'en' });
    await client.agent.put('/api/account/future-letter').send({ body: TEXT });
    expect((await runFutureLetterDeliveries()).delivered).toBe(0);

    const company = await prisma.company.create({ data: { name: `Firma ${uniq('c')}`, status: 'ACTIVE' } });
    const kase = await prisma.case.create({ data: { clientId: client.user.id, number: uniq('TV-'), profession: 'Koch', visaType: 'WORK', status: 'APPROVED', companyId: company.id } });
    await prisma.arrivalFollowUp.create({ data: { caseId: kase.id, clientId: client.user.id, companyId: company.id, arrivedAt: new Date() } });

    expect((await runFutureLetterDeliveries()).delivered).toBe(1);
    expect((await runFutureLetterDeliveries()).delivered).toBe(0);
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: client.user.email, subject: 'Triad Vision · A letter from your past self' } }));
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'FUTURE_LETTER' } });
    expect(n.body).not.toContain('Salam'); // the notification never carries the text

    const view = (await client.agent.get('/api/account/future-letter')).body;
    expect(view).toMatchObject({ arrived: true, letter: { body: TEXT, delivered: true, deliveredVia: 'ARRIVAL' } });
    expect((await client.agent.put('/api/account/future-letter').send({ body: 'new' })).body.error).toBe('LETTER_DELIVERED');
    expect((await client.agent.delete('/api/account/future-letter')).body.deleted).toBe(1);
    // A new letter after the arrival is not possible.
    expect((await client.agent.put('/api/account/future-letter').send({ body: 'late' })).body.error).toBe('ALREADY_ARRIVED');
  });
});

describe('employer readiness profile (consent-gated)', () => {
  it('own worker: nothing without consent; the card and one-pager rows with it; other company 404', async () => {
    const employer = await asCompany();
    const other = await asCompany();
    const worker = await asCandidate({ firstName: 'Cavid', lastName: 'Quliyev', profession: 'LKW-Fahrer', germanLevel: 'A2' });
    const kase = await prisma.case.create({ data: { number: uniq('TV-'), clientId: worker.user.id, profession: 'LKW-Fahrer', companyId: employer.company.id, status: 'APPROVED', decisionAt: new Date() } });
    await post(worker, [
      { activityId: 'work-scenes', item: 'truck-cab', score: 9, max: 10 },
      { activityId: 'mock-a1', item: 'lesen', score: 20, max: 25 },
      { activityId: 'interview-prep', item: 'EMBASSY', score: 12, max: 20 },
    ]);
    const url = `/api/company/readiness-profile/workers/${kase.id}`;

    expect((await employer.agent.get(url)).body).toEqual({ profile: null });
    const plain = await cvPdfText((await bin(employer.agent.get(`/api/company/workers/${kase.id}/one-pager.pdf?lang=de`))).body);
    expect(plain).not.toContain('Vorbereitungs-Score');

    expect((await worker.agent.put('/api/privacy/consents').send({ READINESS_PROFILE: true })).status).toBe(200);
    const card = (await employer.agent.get(url)).body.profile;
    expect(card).toMatchObject({ germanLevel: 'A2', mockExam: { level: 'A1', module: 'lesen', percent: 80 }, workScene: { id: 'truck-cab', percent: 90, passed: true }, interviewPractised: true, germanyReady: null });
    expect(typeof card.readinessScore).toBe('number');
    const withRows = await cvPdfText((await bin(employer.agent.get(`/api/company/workers/${kase.id}/one-pager.pdf?lang=de`))).body);
    expect(withRows).toContain('Vorbereitungs-Score');
    expect(withRows).toContain('Übungstest');

    expect((await other.agent.get(url)).status).toBe(404);
    expect((await worker.agent.get(url)).status).toBe(403);

    // Withdrawn → gone again.
    await worker.agent.put('/api/privacy/consents').send({ READINESS_PROFILE: false });
    expect((await employer.agent.get(url)).body.profile).toBeNull();
  });

  it('anonymous pool: aggregated bands only, and only with consent', async () => {
    const cand = await asCandidate({ profession: 'Koch', germanLevel: 'B1' });
    const pool = await cand.agent.put('/api/account/candidate-pool').send({ consent: true, version: POOL_CONSENT_VERSION, regions: ['HH'], availability: 'IMMEDIATE', skills: ['Kochen'], track: 'JOB' });
    expect(pool.status).toBe(200);
    const code = pool.body.profile.code as string;
    const employer = await asCompany();
    expect((await employer.agent.get(`/api/company/readiness-profile/pool/${code}`)).body).toEqual({ bands: null });
    await cand.agent.put('/api/privacy/consents').send({ READINESS_PROFILE: true });
    await post(cand, [{ activityId: 'traffic-signs', score: 29, max: 30 }]);
    const bands = (await employer.agent.get(`/api/company/readiness-profile/pool/${code}`)).body.bands;
    expect(bands).toMatchObject({ practiceBand: '1-4', germanyReady: false });
    expect(bands.readinessBand).toMatch(/^\d+-\d+$/);
    expect(Object.keys(bands).sort()).toEqual(['germanyReady', 'practiceBand', 'readinessBand']);
    expect((await employer.agent.get('/api/company/readiness-profile/pool/TV-K-0000')).status).toBe(404);
    expect((await (await asCompany('PENDING')).agent.get(`/api/company/readiness-profile/pool/${code}`)).status).toBe(403);
  });
});
