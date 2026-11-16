import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { asAdmin, asClient, asStaff, sessionAgent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser, uniq } from '../helpers/factories';
import { makePdf, PDF } from '../helpers/files';

beforeEach(() => {
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'private'), { recursive: true });
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'public'), { recursive: true });
});

type Category = 'AGENCY' | 'SCHOOL' | 'LANGUAGE_SCHOOL';

/** A referral partner with a portal login (AGENT user linked as ReferralPartner.userId) and a category. */
const asPartner = async (category: Category, name = uniq('School ')) => {
  const u = await createUser({ role: 'AGENT', firstName: 'Leyla', lastName: 'Həsənova', locale: 'en' });
  const partner = await prisma.referralPartner.create({ data: { name, userId: u.user.id, category } });
  return { ...u, partner, agent: sessionAgent(u.token) };
};

/** A client owned by the partner (sign-up link), optionally with the PARTNER_SHARING consent and a case. */
const student = async (partnerId: string, opts: { consent?: boolean; withCase?: boolean; germanLevel?: string | null } = {}) => {
  const c = await asClient({ firstName: 'Nərmin', lastName: uniq('Əliyeva') });
  await prisma.user.update({ where: { id: c.user.id }, data: { ownerPartnerId: partnerId, ownerPartnerAt: new Date(), germanLevel: opts.germanLevel ?? null } });
  if (opts.consent) await prisma.consentRecord.create({ data: { userId: c.user.id, type: 'PARTNER_SHARING', granted: true, version: '1', source: 'PROFILE' } });
  if (opts.withCase) await prisma.case.create({ data: { number: uniq('TV-'), clientId: c.user.id, profession: 'Pflegefachkraft', partnerId, status: 'CONTRACT_SENT' } });
  return c;
};

const examRecord = (agent: ReturnType<typeof sessionAgent>, clientId: string, level = 'B1', withFile = false) => {
  const req = agent
    .post(`/api/partner/students/${clientId}/records`)
    .field('kind', 'EXAM')
    .field('level', level)
    .field('examDate', '2026-10-15')
    .field('provider', 'GOETHE')
    .field('passed', 'true');
  return withFile ? makePdf('Goethe-Zertifikat B1').then((pdf) => req.attach('certificate', pdf, { filename: 'zertifikat.pdf', ...PDF })) : req;
};

describe('partner schools: isolation and consent', () => {
  it('shows a school only its own students, the stage only with consent', async () => {
    const school = await asPartner('SCHOOL');
    const other = await asPartner('LANGUAGE_SCHOOL');
    const consenting = await student(school.partner.id, { consent: true, withCase: true });
    const silent = await student(school.partner.id, { withCase: true });
    const foreign = await student(other.partner.id, { consent: true, withCase: true });

    const me = await school.agent.get('/api/partner/me');
    expect(me.status).toBe(200);
    expect(me.body.partner.category).toBe('SCHOOL');

    const res = await school.agent.get('/api/partner/students');
    expect(res.status).toBe(200);
    const items = res.body.items as { id: string; consent: boolean; stage: { status: string } | null }[];
    expect(items.map((i) => i.id).sort()).toEqual([consenting.user.id, silent.user.id].sort());
    expect(items.find((i) => i.id === consenting.user.id)).toMatchObject({ consent: true, stage: { status: 'CONTRACT_SENT' } });
    expect(items.find((i) => i.id === silent.user.id)).toMatchObject({ consent: false, stage: null, germanLevel: null });

    expect((await school.agent.get(`/api/partner/students/${foreign.user.id}`)).status).toBe(404);
    const silentDetail = await school.agent.get(`/api/partner/students/${silent.user.id}`);
    expect(silentDetail.status).toBe(200);
    expect(silentDetail.body.student).toMatchObject({ consent: false, stage: null, records: [] });

    // The other school cannot see this school's students either.
    expect((await other.agent.get(`/api/partner/students/${consenting.user.id}`)).status).toBe(404);
    expect(((await other.agent.get('/api/partner/students')).body.items as { id: string }[]).map((i) => i.id)).toEqual([foreign.user.id]);
  });

  it('keeps the students view and records closed to agency partners, and records to colleges', async () => {
    const agency = await asPartner('AGENCY');
    const college = await asPartner('SCHOOL');
    const s = await student(agency.partner.id, { consent: true });
    const res = await agency.agent.get('/api/partner/students');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_A_SCHOOL');
    expect((await examRecord(agency.agent, s.user.id)).status).toBe(403);

    const cs = await student(college.partner.id, { consent: true });
    const r = await examRecord(college.agent, cs.user.id);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('NOT_A_LANGUAGE_SCHOOL');
    expect(await prisma.partnerStudentRecord.count({ where: { clientId: { in: [s.user.id, cs.user.id] } } })).toBe(0);
  });

  it('lets a language school record only for own consenting students', async () => {
    const school = await asPartner('LANGUAGE_SCHOOL');
    const other = await asPartner('LANGUAGE_SCHOOL');
    const silent = await student(school.partner.id);
    const foreign = await student(other.partner.id, { consent: true });

    const noConsent = await examRecord(school.agent, silent.user.id);
    expect(noConsent.status).toBe(403);
    expect(noConsent.body.error).toBe('CONSENT_REQUIRED');
    expect((await examRecord(school.agent, foreign.user.id)).status).toBe(404);
    expect(await prisma.partnerStudentRecord.count({ where: { clientId: { in: [silent.user.id, foreign.user.id] } } })).toBe(0);
  });
});

describe('partner schools: records and staff review', () => {
  it('records attendance and an exam; the level changes only after staff confirm', async () => {
    const school = await asPartner('LANGUAGE_SCHOOL');
    const other = await asPartner('LANGUAGE_SCHOOL');
    const s = await student(school.partner.id, { consent: true, germanLevel: 'A2' });

    const att = await school.agent.post(`/api/partner/students/${s.user.id}/records`).send({ kind: 'ATTENDANCE', attendancePct: 92, courseName: 'B1 intensive', periodFrom: '2026-09-01', periodTo: '2026-10-31' });
    expect(att.status).toBe(201);
    expect(att.body.record).toMatchObject({ kind: 'ATTENDANCE', attendancePct: 92, status: 'PENDING' });
    expect((await school.agent.post(`/api/partner/students/${s.user.id}/records`).send({ kind: 'ATTENDANCE', attendancePct: 140 })).status).toBe(400);

    const exam = await examRecord(school.agent, s.user.id, 'B1', true);
    expect(exam.status).toBe(201);
    expect(exam.body.record).toMatchObject({ kind: 'EXAM', level: 'B1', passed: true, status: 'PENDING' });
    expect(exam.body.record.certificate).toMatchObject({ name: 'zertifikat.pdf' });
    const recordId = exam.body.record.id as string;

    // Not confirmed yet: the profile keeps the old level.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.user.id } })).germanLevel).toBe('A2');

    // Certificate: the own school and staff only.
    expect((await school.agent.get(`/api/partner/student-records/${recordId}/certificate`)).status).toBe(200);
    expect((await other.agent.get(`/api/partner/student-records/${recordId}/certificate`)).status).toBe(404);
    expect((await other.agent.delete(`/api/partner/student-records/${recordId}`)).status).toBe(404);
    expect((await s.agent.get(`/api/admin/partner-schools/records/${recordId}/certificate`)).status).toBe(403);

    const staff = await asStaff();
    const queue = await staff.agent.get('/api/admin/partner-schools/records?status=PENDING');
    expect(queue.status).toBe(200);
    expect((queue.body.items as { id: string }[]).map((i) => i.id)).toEqual(expect.arrayContaining([recordId, att.body.record.id]));
    expect((await staff.agent.get(`/api/admin/partner-schools/records/${recordId}/certificate`)).status).toBe(200);

    const ok = await staff.agent.post(`/api/admin/partner-schools/records/${recordId}/confirm`).send({ note: 'Zertifikat geprüft' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ levelBefore: 'A2', levelApplied: 'B1', record: { status: 'CONFIRMED' } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.user.id } })).germanLevel).toBe('B1');
    expect((await staff.agent.post(`/api/admin/partner-schools/records/${recordId}/confirm`).send({})).status).toBe(409);
    // A reviewed record cannot be withdrawn by the school.
    expect((await school.agent.delete(`/api/partner/student-records/${recordId}`)).status).toBe(409);

    // Rejecting the attendance record needs a note and does not touch the level.
    expect((await staff.agent.post(`/api/admin/partner-schools/records/${att.body.record.id}/reject`).send({})).status).toBe(400);
    const rej = await staff.agent.post(`/api/admin/partner-schools/records/${att.body.record.id}/reject`).send({ note: 'Zeitraum unklar' });
    expect(rej.status).toBe(200);
    expect(rej.body.record).toMatchObject({ status: 'REJECTED', reviewNote: 'Zeitraum unklar' });

    // The school sees the review outcome on the student.
    const detail = await school.agent.get(`/api/partner/students/${s.user.id}`);
    expect(detail.body.student.germanLevel).toBe('B1');
    expect((detail.body.student.records as { id: string; status: string }[]).find((r) => r.id === recordId)?.status).toBe('CONFIRMED');
  });

  it('does not lower the level when a lower exam is confirmed', async () => {
    const school = await asPartner('LANGUAGE_SCHOOL');
    const s = await student(school.partner.id, { consent: true, germanLevel: 'B2' });
    const exam = await examRecord(school.agent, s.user.id, 'A2');
    expect(exam.status).toBe(201);
    const staff = await asStaff();
    const ok = await staff.agent.post(`/api/admin/partner-schools/records/${exam.body.record.id}/confirm`).send({});
    expect(ok.body).toMatchObject({ levelApplied: null });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.user.id } })).germanLevel).toBe('B2');
  });

  it('lets only ADMIN+ change a partner category', async () => {
    const p = await asPartner('AGENCY');
    const staff = await asStaff();
    expect((await staff.agent.patch(`/api/admin/partner-schools/partners/${p.partner.id}/category`).send({ category: 'SCHOOL' })).status).toBe(403);
    const admin = await asAdmin();
    expect((await admin.agent.patch(`/api/admin/partner-schools/partners/${p.partner.id}/category`).send({ category: 'OTHER' })).status).toBe(400);
    const res = await admin.agent.patch(`/api/admin/partner-schools/partners/${p.partner.id}/category`).send({ category: 'LANGUAGE_SCHOOL' });
    expect(res.status).toBe(200);
    expect(res.body.partner.category).toBe('LANGUAGE_SCHOOL');
    expect((await p.agent.get('/api/partner/me')).body.partner.category).toBe('LANGUAGE_SCHOOL');
    const list = await staff.agent.get('/api/admin/partner-schools/partners');
    expect((list.body.items as { id: string; category: string }[]).find((i) => i.id === p.partner.id)?.category).toBe('LANGUAGE_SCHOOL');
    const filtered = await staff.agent.get('/api/admin/partners?category=LANGUAGE_SCHOOL');
    expect((filtered.body.items as { id: string }[]).some((i) => i.id === p.partner.id)).toBe(true);
  });
});
