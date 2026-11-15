import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { emailsTo, prisma } from '../helpers/db';
import { ADMIN_INBOX } from '../helpers/testEnv';
import { auditsSettled } from '../../src/lib/audit.js';
import { POOL_CONSENT_VERSION, POOL_DAILY_DETAIL_LIMIT } from '../../src/lib/pool/constants.js';
import { POOL_CARD_KEYS } from '../../src/lib/pool/anonymous.js';
import { asCandidate, asCompany, cleanJobs } from './vacancies.fixtures';

beforeEach(cleanJobs);

const SECRET_ABOUT = 'Mənim adım Rəşad, telefonum 0501234567';

/** A candidate with a full (identifying) profile, opted in to the pool. */
const poolCandidate = async (profile: Record<string, unknown> = {}, pool: Record<string, unknown> = {}) => {
  const c = await asCandidate({
    firstName: 'Rəşad',
    lastName: 'Əliyev',
    phone: '+994509998877',
    passportNumber: 'C01234567',
    about: SECRET_ABOUT,
    profession: 'LKW-Fahrer',
    germanLevel: 'B1',
    drivingLicence: 'B, C, CE',
    experienceYears: 6,
    recognitionStatus: 'IN_PROGRESS',
    ...profile,
  });
  const res = await c.agent.put('/api/account/candidate-pool').send({
    consent: true,
    version: POOL_CONSENT_VERSION,
    regions: ['HH', 'NI'],
    availability: 'IMMEDIATE',
    skills: ['Gabelstapler', 'ADR'],
    languages: [{ lang: 'ru', level: 'C1' }],
    track: 'JOB',
    ...pool,
  });
  expect(res.status).toBe(200);
  return { ...c, code: res.body.profile.code as string };
};

describe('candidate pool: client consent', () => {
  it('is off by default and only an explicit opt-in with the current text version shows the profile', async () => {
    const c = await asCandidate({ profession: 'LKW-Fahrer' });
    const { agent: employer } = await asCompany();

    const initial = await c.agent.get('/api/account/candidate-pool');
    expect(initial.status).toBe(200);
    expect(initial.body.profile).toMatchObject({ consent: false, visible: false });
    expect(initial.body.profile.code).toMatch(/^TV-K-\d{4,5}$/);
    expect(initial.body.currentVersion).toBe(POOL_CONSENT_VERSION);
    expect((await employer.get('/api/company/pool')).body.total).toBe(0);

    // Pool details alone never publish the profile.
    await c.agent.put('/api/account/candidate-pool').send({ regions: ['BY'], skills: ['Schweißen'] });
    expect((await employer.get('/api/company/pool')).body.total).toBe(0);

    // Outdated / missing text version → refused.
    expect((await c.agent.put('/api/account/candidate-pool').send({ consent: true })).body.error).toBe('CONSENT_VERSION_OUTDATED');
    expect((await c.agent.put('/api/account/candidate-pool').send({ consent: true, version: 'old' })).status).toBe(409);

    const on = await c.agent.put('/api/account/candidate-pool').send({ consent: true, version: POOL_CONSENT_VERSION });
    expect(on.status).toBe(200);
    expect(on.body.profile).toMatchObject({ consent: true, visible: true, consentVersion: POOL_CONSENT_VERSION });
    const code = on.body.profile.code;
    const consent = await prisma.consentRecord.findFirst({ where: { userId: c.user.id, type: 'CANDIDATE_POOL' } });
    expect(consent).toMatchObject({ granted: true, version: POOL_CONSENT_VERSION, source: 'PROFILE' });

    const list = await employer.get('/api/company/pool');
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].code).toBe(code);
    expect((await employer.put(`/api/company/pool/${code}/saved`)).status).toBe(200);

    // Withdrawal: gone at once (search, detail, shortlist), logged as a withdrawn consent.
    const off = await c.agent.put('/api/account/candidate-pool').send({ consent: false });
    expect(off.body.profile).toMatchObject({ consent: false, visible: false });
    expect((await employer.get('/api/company/pool')).body.total).toBe(0);
    expect((await employer.get(`/api/company/pool/${code}`)).status).toBe(404);
    expect((await employer.get('/api/company/pool/saved')).body.items).toHaveLength(0);
    expect(await prisma.candidatePoolSaved.count()).toBe(0);
    const log = await prisma.consentRecord.findMany({ where: { userId: c.user.id, type: 'CANDIDATE_POOL' }, orderBy: { createdAt: 'asc' } });
    expect(log.map((r) => r.granted)).toEqual([true, false]);
    await auditsSettled();
    expect(await prisma.auditLog.count({ where: { action: { in: ['CANDIDATE_POOL_OPT_IN', 'CANDIDATE_POOL_OPT_OUT'] } } })).toBe(2);
  });

  it('needs a profession before the opt-in, and is for clients only', async () => {
    const c = await asCandidate({ profession: null });
    expect((await c.agent.put('/api/account/candidate-pool').send({ consent: true, version: POOL_CONSENT_VERSION })).body.error).toBe('PROFILE_INCOMPLETE');
    const { agent: employer } = await asCompany();
    expect((await employer.get('/api/account/candidate-pool')).status).toBe(403);
    expect((await anon().get('/api/account/candidate-pool')).status).toBe(401);
  });

  it('staff can recommend and hide, but never make a candidate visible without consent', async () => {
    const staff = await asStaff();
    const { agent: employer } = await asCompany();
    const c = await asCandidate({ profession: 'Pflegefachkraft' });
    const ready = await staff.agent.put(`/api/admin/candidate-pool/${c.user.id}`).send({ staffReady: true, summary: 'Erfahrene Pflegekraft' });
    expect(ready.status).toBe(200);
    expect(ready.body.profile).toMatchObject({ staffReady: true, visible: false });
    expect((await employer.get('/api/company/pool')).body.total).toBe(0);
    // The client hears about the recommendation.
    expect(await prisma.notification.findFirst({ where: { userId: c.user.id, type: 'CANDIDATE_POOL_READY' } })).toBeTruthy();
    expect((await staff.agent.get('/api/admin/candidate-pool?state=awaiting')).body.items.map((i: { userId: string }) => i.userId)).toEqual([c.user.id]);

    await c.agent.put('/api/account/candidate-pool').send({ consent: true, version: POOL_CONSENT_VERSION });
    expect((await employer.get('/api/company/pool')).body.total).toBe(1);

    const hidden = await staff.agent.put(`/api/admin/candidate-pool/${c.user.id}`).send({ hidden: true, hiddenReason: 'Placed' });
    expect(hidden.body.profile).toMatchObject({ hidden: true, visible: false });
    expect((await employer.get('/api/company/pool')).body.total).toBe(0);
    expect((await c.agent.get('/api/account/candidate-pool')).body.profile).toMatchObject({ consent: true, pausedByTeam: true, visible: false });

    // Staff cannot switch consent (unknown field).
    expect((await staff.agent.put(`/api/admin/candidate-pool/${c.user.id}`).send({ consentAt: new Date().toISOString() })).status).toBe(400);
  });
});

describe('candidate pool: anonymous payload', () => {
  it('never sends personal data to employers (search, detail, shortlist, interests)', async () => {
    const staff = await asStaff();
    const c = await poolCandidate();
    await staff.agent.put(`/api/admin/candidate-pool/${c.user.id}`).send({ summary: 'Zuverlässiger LKW-Fahrer mit ADR-Schein.' });
    const { agent: employer } = await asCompany();

    const search = await employer.get('/api/company/pool');
    const detail = await employer.get(`/api/company/pool/${c.code}`);
    await employer.put(`/api/company/pool/${c.code}/saved`);
    const saved = await employer.get('/api/company/pool/saved');
    await employer.post(`/api/company/pool/${c.code}/interest`).send({ positions: 2, message: 'Bitte melden' });
    const interests = await employer.get('/api/company/pool/interests');
    for (const r of [search, detail, saved, interests]) expect(r.status).toBe(200);

    const allowed = new Set<string>([...POOL_CARD_KEYS, 'saved', 'savedAt']);
    for (const card of [...search.body.items, detail.body.candidate, ...saved.body.items]) {
      for (const k of Object.keys(card)) expect(allowed.has(k), `unexpected key ${k}`).toBe(true);
    }
    expect(detail.body.candidate).toMatchObject({
      code: c.code,
      professions: ['LKW-Fahrer'],
      experienceYears: 6,
      germanLevel: 'B1',
      drivingLicences: ['B', 'C', 'CE'],
      recognitionStatus: 'IN_PROGRESS',
      regions: ['HH', 'NI'],
      languages: [{ lang: 'ru', level: 'C1' }],
      skills: ['Gabelstapler', 'ADR'],
      summary: 'Zuverlässiger LKW-Fahrer mit ADR-Schein.',
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: c.user.id } });
    const leaks = [user.id, user.firstName, user.lastName, user.email, user.phone!, user.passportNumber!, 'Nizami', 'Gəncə', '1990-05-01', SECRET_ABOUT];
    for (const r of [search, detail, saved, interests]) {
      const json = JSON.stringify(r.body);
      for (const s of leaks) expect(json.includes(s), `leaked ${s}`).toBe(false);
      expect(json).not.toMatch(/"(email|phone|firstName|lastName|birthDate|address|passportNumber|about|userId|photo|documents?)"/);
    }
  });
});

describe('candidate pool: employer access', () => {
  it('is for COMPANY users of an active company only', async () => {
    await poolCandidate();
    const suspended = await asCompany('SUSPENDED');
    const r1 = await suspended.agent.get('/api/company/pool');
    expect(r1.status).toBe(403);
    expect(r1.body.error).toBe('COMPANY_SUSPENDED');
    const pending = await asCompany('PENDING');
    expect((await pending.agent.get('/api/company/pool')).body.error).toBe('COMPANY_NOT_APPROVED');

    const client = await asClient();
    expect((await client.agent.get('/api/company/pool')).status).toBe(403);
    const staff = await asStaff();
    expect((await staff.agent.get('/api/company/pool')).status).toBe(403);
    const admin = await asAdmin();
    expect((await admin.agent.get('/api/company/pool')).status).toBe(403);
    expect((await anon().get('/api/company/pool')).status).toBe(401);

    // Employers cannot reach the staff side.
    const active = await asCompany();
    expect((await active.agent.get('/api/admin/candidate-pool')).status).toBe(403);
    expect((await active.agent.get('/api/admin/candidate-pool/interests')).status).toBe(403);
  });

  it('filters deterministically', async () => {
    const truck = await poolCandidate({ profession: 'LKW-Fahrer', germanLevel: 'B1', drivingLicence: 'CE', experienceYears: 6, recognitionStatus: 'RECOGNISED' }, { regions: ['HH'], track: 'JOB' });
    const nurse = await poolCandidate({ profession: 'Pflegefachkraft', germanLevel: 'B2', drivingLicence: 'B', experienceYears: 2, recognitionStatus: 'PARTIAL' }, { regions: [], track: 'BOTH', availability: 'LATER', earliestStart: '2027-06-01' });
    const trainee = await poolCandidate({ profession: 'Koch', germanLevel: 'A2', drivingLicence: null, experienceYears: 0, recognitionStatus: null }, { regions: ['BY'], track: 'AUSBILDUNG' });
    const { agent } = await asCompany();
    const codes = async (qs: string) => ((await agent.get(`/api/company/pool?${qs}`)).body.items as { code: string }[]).map((i) => i.code).sort();

    expect(await codes('profession=Berufskraftfahrer')).toEqual([truck.code]);
    expect(await codes('germanLevel=B2')).toEqual([nurse.code]);
    expect(await codes('minExperience=2')).toEqual([truck.code, nurse.code].sort());
    expect(await codes('licence=C')).toEqual([truck.code]);
    expect(await codes('recognition=PARTIAL')).toEqual([nurse.code]);
    expect(await codes('recognition=NONE')).toEqual([trainee.code]);
    expect(await codes('region=BY')).toEqual([nurse.code, trainee.code].sort()); // no regions = anywhere
    expect(await codes('track=AUSBILDUNG')).toEqual([nurse.code, trainee.code].sort());
    expect(await codes('startBy=2027-01-01')).toEqual([truck.code, trainee.code].sort()); // both available immediately
    expect((await agent.get('/api/company/pool?germanLevel=Z9')).status).toBe(400);
  });

  it('logs views and blocks a company above the daily cap (staff are told)', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const c = await poolCandidate();
    const { agent, company } = await asCompany();
    await agent.get('/api/company/pool');
    await agent.get(`/api/company/pool/${c.code}`);
    expect(await prisma.candidatePoolView.count({ where: { companyId: company.id, kind: 'SEARCH' } })).toBe(1);
    expect(await prisma.candidatePoolView.count({ where: { companyId: company.id, kind: 'DETAIL' } })).toBe(1);

    const views = await staff.agent.get('/api/admin/candidate-pool/views');
    expect(views.status).toBe(200);
    expect(views.body.items[0]).toMatchObject({ company: { id: company.id }, details: { d1: 1 }, searches: { d1: 1 } });

    const profile = await prisma.candidatePoolProfile.findUniqueOrThrow({ where: { userId: c.user.id } });
    await prisma.candidatePoolView.createMany({
      data: Array.from({ length: POOL_DAILY_DETAIL_LIMIT - 1 }, () => ({ companyId: company.id, userId: 'x', kind: 'DETAIL', profileId: profile.id })),
    });
    const blocked = await agent.get(`/api/company/pool/${c.code}`);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('POOL_DAILY_LIMIT');
    expect((await agent.get(`/api/company/pool/${c.code}`)).status).toBe(429);
    const n = await prisma.notification.findMany({ where: { userId: admin.user.id, title: { contains: 'limit' } } });
    expect(n).toHaveLength(1);
  });
});

describe('candidate pool: interest requests', () => {
  it('creates a request for staff with notification + e-mail + audit; staff move it, the employer sees the status', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const c = await poolCandidate();
    const { agent, company, user: employer } = await asCompany();
    const other = await asCompany();

    expect((await agent.post(`/api/company/pool/${c.code}/interest`).send({ positions: 0 })).status).toBe(400);
    const created = await agent.post(`/api/company/pool/${c.code.toLowerCase()}/interest`).send({ positions: 3, message: 'Start im März möglich?' });
    expect(created.status).toBe(201);
    const id = created.body.interest.id;
    expect(created.body.interest).toMatchObject({ status: 'NEW', positions: 3 });
    expect((await agent.post(`/api/company/pool/${c.code}/interest`).send({ positions: 1 })).body.error).toBe('INTEREST_ALREADY_OPEN');

    const n = await prisma.notification.findFirst({ where: { userId: admin.user.id, link: `/admin/candidate-pool?tab=interests&id=${id}` } });
    expect(n?.title).toContain(company.name);
    expect(n?.title).toContain(c.code);
    const mails = await emailsTo(ADMIN_INBOX);
    expect(mails.some((m) => m.subject.includes(c.code))).toBe(true);
    await auditsSettled();
    expect(await prisma.auditLog.findFirst({ where: { action: 'CANDIDATE_POOL_INTEREST_CREATED', target: `candidatePoolInterest:${id}` } })).toBeTruthy();

    // Staff see it linked to the client (360 page) and move it on.
    const list = await staff.agent.get('/api/admin/candidate-pool/interests');
    expect(list.status).toBe(200);
    expect(list.body.items[0]).toMatchObject({ id, company: { id: company.id }, candidate: { userId: c.user.id, code: c.code }, createdBy: { id: employer.id } });
    expect((await staff.agent.patch(`/api/admin/candidate-pool/interests/${id}`).send({ status: 'DONE' })).status).toBe(400);
    const moved = await staff.agent.patch(`/api/admin/candidate-pool/interests/${id}`).send({ status: 'CONTACTED', staffNote: 'Kandidat angerufen' });
    expect(moved.status).toBe(200);
    expect(moved.body.interest).toMatchObject({ status: 'CONTACTED', handledById: staff.user.id });
    const employerNote = await prisma.notification.findFirst({ where: { userId: employer.id, type: 'CANDIDATE_POOL_INTEREST' } });
    expect(employerNote?.title).toContain(c.code);
    expect(employerNote?.body).toContain('Kandidat kontaktiert');

    const mine = await agent.get('/api/company/pool/interests');
    expect(mine.body.items).toEqual([expect.objectContaining({ id, code: c.code, status: 'CONTACTED', available: true, positions: 3 })]);
    expect(JSON.stringify(mine.body)).not.toContain('Kandidat angerufen'); // staff note stays internal
    expect((await other.agent.get('/api/company/pool/interests')).body.items).toHaveLength(0);

    // Staff detail page of the client: consent log, interests, card preview.
    const detail = await staff.agent.get(`/api/admin/candidate-pool/${c.user.id}`);
    expect(detail.body.consentLog[0]).toMatchObject({ granted: true, version: POOL_CONSENT_VERSION });
    expect(detail.body.interests).toHaveLength(1);
    expect(detail.body.card.code).toBe(c.code);

    // After the candidate withdraws, the employer's history keeps only the code.
    await c.agent.put('/api/account/candidate-pool').send({ consent: false });
    const after = await agent.get('/api/company/pool/interests');
    expect(after.body.items[0]).toMatchObject({ code: c.code, available: false, profession: null });
    // A closed request allows a new one later (when visible again).
    await staff.agent.patch(`/api/admin/candidate-pool/interests/${id}`).send({ status: 'CLOSED' });
    expect((await agent.post(`/api/company/pool/${c.code}/interest`).send({ positions: 1 })).status).toBe(404);
  });

  it('includes the pool entry in the GDPR export and removes it with the account', async () => {
    const c = await poolCandidate();
    const { agent } = await asCompany();
    await agent.post(`/api/company/pool/${c.code}/interest`).send({ positions: 1 });
    const exp = await c.agent.get('/api/privacy/export');
    expect(exp.status).toBe(200);
    const body = typeof exp.body === 'object' && Object.keys(exp.body).length ? exp.body : JSON.parse(exp.text);
    expect(body.candidatePool).toMatchObject({ code: c.code, consentVersion: POOL_CONSENT_VERSION, employerInterests: [expect.objectContaining({ status: 'NEW' })] });
    expect(body.consents.some((r: { type: string }) => r.type === 'CANDIDATE_POOL')).toBe(true);

    await prisma.user.delete({ where: { id: c.user.id } });
    expect(await prisma.candidatePoolProfile.count()).toBe(0);
    expect(await prisma.candidatePoolInterest.count()).toBe(0);
  });
});
