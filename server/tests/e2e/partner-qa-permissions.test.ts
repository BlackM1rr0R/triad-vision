import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { asAdmin, asClient, sessionAgent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser, uniq } from '../helpers/factories';
import { makePdf, PDF } from '../helpers/files';
import { clientCase, createCaseVia, expectStatus } from '../helpers/workflow';

/**
 * QA fixes of the partner portal permission matrix (PE-01 language-school records under DEFAULT / REFERRER,
 * PE-08 upload refused before the file is spooled).
 */

beforeEach(() => {
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'private'), { recursive: true });
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'public'), { recursive: true });
});

type Category = 'AGENCY' | 'SCHOOL' | 'LANGUAGE_SCHOOL';

const asPartner = async (category: Category, template: 'DEFAULT' | 'REFERRER') => {
  const u = await createUser({ role: 'AGENT', firstName: 'Leyla', lastName: 'Həsənova', locale: 'en' });
  const partner = await prisma.referralPartner.create({ data: { name: uniq('Partner '), userId: u.user.id, category } });
  await prisma.partnerAccess.create({ data: { partnerId: partner.id, template } });
  return { ...u, partner, agent: sessionAgent(u.token) };
};

const consentingStudent = async (partnerId: string) => {
  const c = await asClient({ firstName: 'Nərmin', lastName: uniq('Əliyeva') });
  await prisma.user.update({ where: { id: c.user.id }, data: { ownerPartnerId: partnerId, ownerPartnerAt: new Date() } });
  await prisma.consentRecord.create({ data: { userId: c.user.id, type: 'PARTNER_SHARING', granted: true, version: '1', source: 'PROFILE' } });
  return c;
};

describe('PE-01: language-school records do not depend on the documents level', () => {
  it.each(['DEFAULT', 'REFERRER'] as const)('a %s language school records, downloads its certificate and withdraws', async (template) => {
    const school = await asPartner('LANGUAGE_SCHOOL', template);
    const me = expectStatus(await school.agent.get('/api/partner/me'), 200).body;
    expect(me.access.template).toBe(template);
    const s = await consentingStudent(school.partner.id);

    const exam = await school.agent
      .post(`/api/partner/students/${s.user.id}/records`)
      .field('kind', 'EXAM')
      .field('level', 'B1')
      .field('examDate', '2026-10-15')
      .field('provider', 'GOETHE')
      .field('passed', 'true')
      .attach('certificate', await makePdf('Goethe B1'), { filename: 'zertifikat.pdf', ...PDF });
    expect(exam.status).toBe(201);
    const id = exam.body.record.id as string;
    expect((await school.agent.get(`/api/partner/student-records/${id}/certificate`)).status).toBe(200);
    expectStatus(await school.agent.delete(`/api/partner/student-records/${id}`), 200);
    expect(await prisma.partnerStudentRecord.count({ where: { id } })).toBe(0);
  });

  it('a college still cannot record (category rule unchanged)', async () => {
    const college = await asPartner('SCHOOL', 'DEFAULT');
    const s = await consentingStudent(college.partner.id);
    const r = await college.agent.post(`/api/partner/students/${s.user.id}/records`).send({ kind: 'ATTENDANCE', attendancePct: 90 });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('NOT_A_LANGUAGE_SCHOOL');
  });
});

describe('PE-08: partner document upload is refused before the file is stored', () => {
  it('DEFAULT (documents: status) gets 403 PARTNER_PERMISSION_DENIED (checked before multer runs)', async () => {
    const admin = await asAdmin();
    const p = await asPartner('AGENCY', 'DEFAULT');
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    expectStatus(await admin.agent.patch('/api/admin/partners/assign').send({ caseIds: [c.id], partnerId: p.partner.id }), 200);
    const req = (await clientCase(client.agent, c.id)).requirements.find((r) => r.stage === 'INITIAL')!;
    const up = await p.agent.post(`/api/partner/cases/${c.id}/documents`).field('requirementId', req.id).attach('file', await makePdf('x'), { filename: 'x.pdf', ...PDF });
    expect(up.status).toBe(403);
    expect(up.body.error).toBe('PARTNER_PERMISSION_DENIED');
    expect(await prisma.document.count({ where: { caseId: c.id, uploadedById: p.user.id } })).toBe(0);
  });
});
