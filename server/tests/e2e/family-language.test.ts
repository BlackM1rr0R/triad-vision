import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { makePdf, PDF } from '../helpers/files';
import { clientCase, createCaseVia, expectStatus, uploadDoc } from '../helpers/workflow';
import { loadCaseContext } from '../../src/lib/ai/features/caseAi/data.js';
import { evaluateResults, levelFromText } from '../../src/lib/german/progress.js';
import { runGermanReminders } from '../../src/jobs/german.js';
import { clearCaseAiSettingsCache } from '../../src/lib/ai/features/caseAi/config.js';

const DAY = 24 * 60 * 60 * 1000;

type Member = {
  caseId: string;
  number: string;
  status: string;
  relation: string;
  visaType: string;
  removable: boolean;
  counts: { required: number; accepted: number; pending: number; rejected: number; missing: number };
  profile: Record<string, unknown> | null;
  checklist: { id: string; key: string | null; stage: string; required: boolean; state: string; documents: { id: string; status: string }[] }[];
};
type Overview = { main: { id: string }; members: Member[]; canAdd: boolean; aggregate: { total: number; approved: number; openItems: number; percent: number } };

const overview = async (agent: Agent, caseId: string) => expectStatus(await agent.get(`/api/family/cases/${caseId}`), 200).body as Overview;

const addSpouse = async (agent: Agent, caseId: string, over: Record<string, unknown> = {}) =>
  expectStatus(
    await agent.post(`/api/family/cases/${caseId}/members`).send({
      relation: 'spouse',
      firstName: 'Leyla',
      lastName: 'Mammadova',
      birthDate: '1993-05-02',
      nationality: 'AZE',
      passportNumber: 'c 1234 5678',
      passportExpiresAt: '2031-01-31',
      joinsWhen: 'WITH_MAIN',
      ...over,
    }),
    201,
  ).body as Overview & { memberCaseId: string };

// ─── Family members ─────────────────────────────────────────────────

describe('family members: client portal', () => {
  it('the client adds a spouse and a child; each gets a member case with the relation checklist', async () => {
    const client = await asClient();
    const main = await createCaseVia(client.agent);

    expect((await client.agent.post(`/api/family/cases/${main.id}/members`).send({ relation: 'cousin', firstName: 'A', lastName: 'B' })).status).toBe(400);
    expect((await client.agent.post(`/api/family/cases/${main.id}/members`).send({ relation: 'spouse', firstName: '', lastName: 'B' })).status).toBe(400);

    const res = await addSpouse(client.agent, main.id);
    const spouse = res.members[0];
    expect(spouse).toMatchObject({ relation: 'spouse', visaType: 'FAMILY', status: 'DOCUMENTS_PENDING', removable: true });
    expect(spouse.profile).toMatchObject({ firstName: 'Leyla', lastName: 'Mammadova', birthDate: '1993-05-02', passportNumber: 'C12345678', joinsWhen: 'WITH_MAIN', germanExempt: false });
    expect(spouse.checklist.map((r) => r.key)).toEqual(['PASSPORT', 'MARRIAGE_CERT', 'GERMAN_CERT', 'PHOTO']);
    expect(spouse.counts).toMatchObject({ required: 4, accepted: 0, missing: 4 });

    const child = (await expectStatus(await client.agent.post(`/api/family/cases/${main.id}/members`).send({ relation: 'child', firstName: 'Ayan', lastName: 'Mammadova', joinsWhen: 'LATER' }), 201)).body as Overview;
    const kid = child.members[1];
    expect(kid.checklist.map((r) => [r.key, r.required])).toEqual([
      ['PASSPORT', true],
      ['BIRTH_CERT', true],
      ['PARENT_CONSENT', false],
      ['PHOTO', true],
    ]);
    expect(kid.profile).toMatchObject({ relation: 'child', joinsWhen: 'LATER' });

    // The member case row and the legacy journey group stay consistent.
    const row = await prisma.case.findUniqueOrThrow({ where: { id: spouse.caseId } });
    expect(row).toMatchObject({ parentCaseId: main.id, clientId: client.user.id, relation: 'spouse', visaType: 'FAMILY' });
    const group = expectStatus(await client.agent.get(`/api/journey/cases/${main.id}/family`), 200).body;
    expect(group.members[0].member).toMatchObject({ firstName: 'Leyla', lastName: 'Mammadova', relation: 'spouse' });
    expect(group.members[0].profile.passportNumber).toBe('C12345678');

    // From the member side the group resolves to the main case; members cannot have members.
    expect((await overview(client.agent, spouse.caseId)).main.id).toBe(main.id);
    expect((await client.agent.post(`/api/family/cases/${spouse.caseId}/members`).send({ relation: 'child', firstName: 'X', lastName: 'Y' })).status).toBe(400);

    // Strangers see nothing; an employer account cannot add members even with the id.
    const other = await asClient();
    expect((await other.agent.get(`/api/family/cases/${main.id}`)).status).toBe(404);
    expect((await other.agent.patch(`/api/family/members/${spouse.caseId}`).send({ firstName: 'Z' })).status).toBe(404);

    // The audit log names the fields, never the passport values.
    expectStatus(await client.agent.patch(`/api/family/members/${spouse.caseId}`).send({ passportNumber: 'D7654321', notes: 'x' }), 200);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'FAMILY_MEMBER_UPDATED' }, orderBy: { createdAt: 'desc' } });
    expect(JSON.stringify(log.details)).toContain('passportNumber');
    expect(JSON.stringify(log.details)).not.toContain('D7654321');
  });

  it('uploads per member, staff review, A1 exemption and removal rules', async () => {
    const client = await asClient();
    const staff = await asStaff();
    const main = await createCaseVia(client.agent);
    const { memberCaseId } = await addSpouse(client.agent, main.id);

    // Upload to the member's own checklist through the normal case upload.
    const detail = await clientCase(client.agent, memberCaseId);
    const passportReq = detail.requirements.find((r) => (r as unknown as { key: string }).key === 'PASSPORT')!;
    const up = expectStatus(await uploadDoc(client.agent, memberCaseId, passportReq.id, 'pass.pdf'), 201).body.document;
    let ov = await overview(client.agent, main.id);
    expect(ov.members[0].counts.pending).toBe(1);
    expect(ov.members[0].removable).toBe(false);

    // Staff accept on the member case → the family panel shows it.
    expectStatus(await staff.agent.post(`/api/admin/cases/${memberCaseId}/documents/${up.id}/review`).send({ status: 'ACCEPTED' }), 200);
    ov = await overview(staff.agent, main.id);
    expect(ov.members[0].checklist.find((r) => r.key === 'PASSPORT')!.state).toBe('accepted');
    expect(ov.members[0].counts.accepted).toBe(1);

    // A1 exemption makes the spouse's German certificate optional (and required again without it).
    expectStatus(await client.agent.patch(`/api/family/members/${memberCaseId}`).send({ germanExempt: true, germanExemptNote: 'Blue Card' }), 200);
    expect((await prisma.documentRequirement.findFirstOrThrow({ where: { caseId: memberCaseId, key: 'GERMAN_CERT' } })).required).toBe(false);
    expectStatus(await staff.agent.patch(`/api/family/members/${memberCaseId}`).send({ germanExempt: false }), 200);
    expect((await prisma.documentRequirement.findFirstOrThrow({ where: { caseId: memberCaseId, key: 'GERMAN_CERT' } })).required).toBe(true);

    // Name change → new FAMILY_MEMBER event for the legacy readers (drive folder, register).
    expectStatus(await client.agent.patch(`/api/family/members/${memberCaseId}`).send({ firstName: 'Leyli' }), 200);
    const ev = await prisma.caseEvent.findFirstOrThrow({ where: { caseId: memberCaseId, type: 'FAMILY_MEMBER' }, orderBy: { createdAt: 'desc' } });
    expect(JSON.parse(ev.note!).firstName).toBe('Leyli');

    // A member with uploads cannot be removed; a pristine one can (by the client too).
    expect((await client.agent.delete(`/api/family/members/${memberCaseId}`)).status).toBe(409);
    const kid = (await expectStatus(await client.agent.post(`/api/family/cases/${main.id}/members`).send({ relation: 'child', firstName: 'A', lastName: 'B' }), 201)).body as Overview & { memberCaseId: string };
    const del = expectStatus(await client.agent.delete(`/api/family/members/${kid.memberCaseId}`), 200).body as Overview;
    expect(del.members).toHaveLength(1);
    expect(await prisma.case.findUnique({ where: { id: kid.memberCaseId } })).toBeNull();
  });

  it('masks the member passport for staff, never overwrites it with the masked value, and can reveal it', async () => {
    const client = await asClient();
    const staff = await asStaff();
    const superAdmin = await asSuperAdmin();
    const main = await createCaseVia(client.agent);
    const { memberCaseId, members } = await addSpouse(client.agent, main.id);
    const profileId = members[0].profile!.id as string;

    const masked = (await overview(staff.agent, main.id)).members[0].profile!.passportNumber as string;
    expect(masked).toContain('•');
    expect((await overview(superAdmin.agent, main.id)).members[0].profile!.passportNumber).toBe('C12345678');
    // The client sees their own data in plain text.
    expect((await overview(client.agent, main.id)).members[0].profile!.passportNumber).toBe('C12345678');

    // Saving the staff form as it came back keeps the real number.
    expectStatus(await staff.agent.patch(`/api/family/members/${memberCaseId}`).send({ passportNumber: masked, nationality: 'AZE' }), 200);
    expect((await prisma.familyMember.findUniqueOrThrow({ where: { memberCaseId } })).passportNumber).toBe('C12345678');

    const reveal = expectStatus(await staff.agent.post('/api/admin/reveal').send({ entity: 'familyMember', id: profileId, field: 'passportNumber', reason: 'Embassy form check' }), 200);
    expect(reveal.body.value).toBe('C12345678');
  });

  it('staff add members with full details; legacy members get a profile on first access', async () => {
    const client = await asClient();
    const staff = await asStaff();
    const main = await createCaseVia(client.agent);
    // Old journey endpoint (staff) still works and now also stores the profile.
    const legacy = expectStatus(await staff.agent.post(`/api/journey/cases/${main.id}/family`).send({ firstName: 'Old', lastName: 'Member', relation: 'parent', birthDate: '1960-01-01' }), 201).body.case;
    // Simulate a member created before the FamilyMember table existed.
    await prisma.familyMember.delete({ where: { memberCaseId: legacy.id } });
    const ov = await overview(staff.agent, main.id);
    expect(ov.members[0].profile).toMatchObject({ firstName: 'Old', lastName: 'Member', relation: 'parent', birthDate: '1960-01-01' });
    expect(ov.members[0].checklist.map((r) => r.key)).toEqual(['PASSPORT', 'RELATIONSHIP_PROOF', 'PHOTO']);

    const res = await addSpouse(staff.agent, main.id, { relation: 'other', firstName: 'Ra', lastName: 'Ha' });
    expect(res.members[1]).toMatchObject({ relation: 'other' });
  });

  it('VIDEX / case AI of a member case use the member, the main language level stays untouched', async () => {
    const client = await asClient({ firstName: 'Elvin', lastName: 'Mammadov' });
    const staff = await asStaff();
    await prisma.user.update({ where: { id: client.user.id }, data: { germanLevel: 'A2', passportNumber: 'C00000001' } });
    const main = await createCaseVia(client.agent);
    const { memberCaseId } = await addSpouse(client.agent, main.id);

    const ctx = await loadCaseContext(memberCaseId);
    expect(ctx.familyMember).toBe(true);
    expect(ctx.client).toMatchObject({ firstName: 'Leyla', lastName: 'Mammadova', passportNumber: 'C12345678', germanLevel: null });
    expect(ctx.visaType).toBe('FAMILY');
    expect((await loadCaseContext(main.id)).client).toMatchObject({ firstName: 'Elvin', passportNumber: 'C00000001' });

    // The spouse's A1 certificate is accepted on the member case: the account level (main applicant) stays A2.
    const detail = await clientCase(client.agent, memberCaseId);
    const a1 = detail.requirements.find((r) => (r as unknown as { key: string }).key === 'GERMAN_CERT')!;
    const doc = expectStatus(await uploadDoc(client.agent, memberCaseId, a1.id, 'Goethe-Zertifikat_B2.pdf'), 201).body.document;
    expectStatus(await staff.agent.post(`/api/admin/cases/${memberCaseId}/documents/${doc.id}/review`).send({ status: 'ACCEPTED' }), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).germanLevel).toBe('A2');
  });

  it('the embassy package of the main case can include a section per member', async () => {
    clearCaseAiSettingsCache();
    const client = await asClient({ firstName: 'Elvin', lastName: 'Mammadov' });
    const staff = await asStaff();
    const main = await createCaseVia(client.agent);
    const { memberCaseId } = await addSpouse(client.agent, main.id);

    // Main: passport accepted; member: passport + marriage certificate accepted.
    const accept = async (caseId: string, key: string, name: string) => {
      const d = await clientCase(client.agent, caseId);
      const r = d.requirements.find((x) => (x as unknown as { key: string }).key === key)!;
      const doc = expectStatus(await uploadDoc(client.agent, caseId, r.id, name), 201).body.document;
      expectStatus(await staff.agent.post(`/api/admin/cases/${caseId}/documents/${doc.id}/review`).send({ status: 'ACCEPTED' }), 200);
    };
    await accept(main.id, 'PASSPORT', 'main-pass.pdf');
    await accept(memberCaseId, 'PASSPORT', 'spouse-pass.pdf');
    await accept(memberCaseId, 'MARRIAGE_CERT', 'heirat.pdf');

    const preview = expectStatus(await staff.agent.get(`/api/admin/cases/${main.id}/embassy-package`), 200).body.preview;
    expect(preview.family).toHaveLength(1);
    expect(preview.family[0]).toMatchObject({ caseId: memberCaseId, name: 'Leyla Mammadova', relation: 'spouse', heading: 'Ehepartner/in: Leyla Mammadova' });
    expect(preview.family[0].included).toBeGreaterThanOrEqual(1);

    const without = expectStatus(await staff.agent.post(`/api/admin/cases/${main.id}/embassy-package`).send({ format: 'pdf' }), 201).body;
    expect(without.entries.some((e: { key: string }) => e.key.startsWith('family:'))).toBe(false);
    const withFamily = expectStatus(await staff.agent.post(`/api/admin/cases/${main.id}/embassy-package`).send({ format: 'pdf', family: true }), 201).body;
    const familyEntries = withFamily.entries.filter((e: { key: string }) => e.key.startsWith(`family:${memberCaseId}:`));
    expect(familyEntries.length).toBeGreaterThanOrEqual(1);
    expect(withFamily.pages).toBeGreaterThan(without.pages);

    // The member's own package names the member as the applicant.
    const own = expectStatus(await staff.agent.post(`/api/admin/cases/${memberCaseId}/embassy-package`).send({ format: 'pdf' }), 201).body;
    expect(own.document.originalName).toMatch(/^Mammadova_Leyla_Botschaft_/);
    expect((await staff.agent.get(`/api/admin/cases/${memberCaseId}/embassy-package`)).body.preview.family).toEqual([]);
  });
});

// ─── German language progress ───────────────────────────────────────

describe('german progress: rules', () => {
  it('evaluates module results and finds levels in text', () => {
    const full = { LESEN: { score: 70, max: 100, passed: null }, HOEREN: { score: 65, max: 100, passed: null }, SCHREIBEN: { score: 60, max: 100, passed: null }, SPRECHEN: { score: 80, max: 100, passed: null } };
    expect(evaluateResults('GOETHE', full).passed).toBe(true);
    expect(evaluateResults('GOETHE', { ...full, SCHREIBEN: { score: 50, max: 100, passed: null } }).passed).toBe(false);
    expect(evaluateResults('GOETHE', { LESEN: full.LESEN }).passed).toBeNull(); // incomplete
    expect(evaluateResults('TESTDAF', { LESEN: { score: 3, max: 5, passed: null } }).modules.LESEN!.passed).toBe(true);
    expect(evaluateResults('TELC', {}, true).passed).toBe(true); // explicit overall result
    expect(levelFromText('Goethe-Zertifikat_B1.pdf')).toBe('B1');
    expect(levelFromText('telc deutsch a2 zertifikat')).toBe('A2');
    expect(levelFromText('scan_2026.pdf', 'B12 form')).toBeNull();
  });
});

describe('german progress: candidate', () => {
  it('goal, courses and exams (with admin exam dates) on the Alman dili page', async () => {
    const client = await asClient();
    const staff = await asStaff();
    const admin = await asAdmin();

    let me = expectStatus(await client.agent.get('/api/german/me'), 200).body;
    expect(me).toMatchObject({ level: 'none', progress: { current: 'none', target: 'B1', percent: 0 }, courses: [], exams: [] });
    expect((await staff.agent.get('/api/german/me')).status).toBe(403);

    me = expectStatus(await client.agent.put('/api/german/me/plan').send({ targetLevel: 'A2', targetDate: '2027-03-01' }), 200).body;
    expect(me.plan).toMatchObject({ targetLevel: 'A2' });
    expect(me.progress.target).toBe('A2');

    expect((await client.agent.post('/api/german/me/courses').send({ school: 'Goethe Baku', level: 'A1', startsAt: '2026-11-10', endsAt: '2026-11-01' })).status).toBe(400);
    const course = expectStatus(await client.agent.post('/api/german/me/courses').send({ school: 'Goethe Baku', level: 'A1', startsAt: '2026-11-01', endsAt: '2027-01-20', schedule: 'Mo–Fr 9–13', format: 'offline' }), 201).body;
    expect(course.courses).toHaveLength(1);
    me = expectStatus(await client.agent.patch(`/api/german/me/courses/${course.id}`).send({ status: 'ACTIVE' }), 200).body;
    expect(me.courses[0].status).toBe('ACTIVE');
    expect(me.timeline.map((t: { kind: string }) => t.kind)).toEqual(['course-start', 'course-end']);

    // Exam dates: staff read, only admins write.
    const date = { provider: 'GOETHE', level: 'A1', city: 'Baku', location: 'Goethe-Zentrum', examDate: '2027-02-14T09:00:00.000Z', registrationDeadline: '2027-01-20', link: 'https://www.goethe.de/baku' };
    expect((await staff.agent.post('/api/admin/german/exam-dates').send(date)).status).toBe(403);
    expect((await admin.agent.post('/api/admin/german/exam-dates').send({ ...date, link: 'javascript:alert(1)' })).status).toBe(400);
    const created = expectStatus(await admin.agent.post('/api/admin/german/exam-dates').send(date), 201).body.item;
    expect(expectStatus(await staff.agent.get('/api/admin/german/exam-dates'), 200).body.items).toHaveLength(1);
    expect(expectStatus(await client.agent.get('/api/german/exam-dates'), 200).body.items[0].id).toBe(created.id);

    // Picking an exam date copies provider, date, place and deadline.
    const exam = expectStatus(await client.agent.post('/api/german/me/exams').send({ examDateId: created.id }), 201).body;
    expect(exam.exams[0]).toMatchObject({ provider: 'GOETHE', level: 'A1', location: 'Goethe-Zentrum, Baku', examDate: '2027-02-14T09:00:00.000Z', status: 'PLANNED' });
    me = expectStatus(await client.agent.patch(`/api/german/me/exams/${exam.id}`).send({ status: 'REGISTERED' }), 200).body;
    expect(me.exams[0].registeredAt).toBeTruthy();

    // Results per module decide the overall result (and the status).
    me = expectStatus(
      await client.agent.patch(`/api/german/me/exams/${exam.id}`).send({ results: { LESEN: { score: 70, max: 100 }, HOEREN: { score: 40, max: 100 }, SCHREIBEN: { score: 70, max: 100 }, SPRECHEN: { score: 90, max: 100 } } }),
      200,
    ).body;
    expect(me.exams[0]).toMatchObject({ passed: false, status: 'FAILED' });
    expect(me.exams[0].results.HOEREN.passed).toBe(false);
    // A self-reported result never changes the profile level.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).germanLevel ?? 'none').toBe('none');

    // Other users' rows are not reachable.
    const other = await asClient();
    expect((await other.agent.patch(`/api/german/me/exams/${exam.id}`).send({ status: 'CANCELLED' })).status).toBe(404);
    expect((await other.agent.delete(`/api/german/me/courses/${course.id}`)).status).toBe(404);

    // Deleting the exam date keeps the candidate's copy.
    expectStatus(await admin.agent.delete(`/api/admin/german/exam-dates/${created.id}`), 200);
    expect((await prisma.germanExam.findUniqueOrThrow({ where: { id: exam.id } })).examDateId).toBeNull();
  });

  it('an accepted certificate raises User.germanLevel (never lowers it)', async () => {
    const client = await asClient();
    const staff = await asStaff();
    // No case yet → the certificate has nowhere to go.
    const ex = expectStatus(await client.agent.post('/api/german/me/exams').send({ provider: 'TELC', level: 'B1', examDate: '2026-09-01' }), 201).body;
    expect((await client.agent.post(`/api/german/me/exams/${ex.id}/certificate`).attach('file', await makePdf('ZERTIFIKAT'), { filename: 'zertifikat.pdf', ...PDF })).status).toBe(409);

    const main = await createCaseVia(client.agent);
    const up = expectStatus(await client.agent.post(`/api/german/me/exams/${ex.id}/certificate`).attach('file', await makePdf('ZERTIFIKAT'), { filename: 'zertifikat.pdf', ...PDF }), 201).body;
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: up.document.id }, include: { requirement: true } });
    expect(doc).toMatchObject({ caseId: main.id, status: 'PENDING' });
    expect(doc.requirement?.key).toBe('LANGUAGE_CERT');
    expect(up.certificates).toHaveLength(1);
    expect((await prisma.germanExam.findUniqueOrThrow({ where: { id: ex.id } })).certificateDocumentId).toBe(doc.id);

    expectStatus(await staff.agent.post(`/api/admin/cases/${main.id}/documents/${doc.id}/review`).send({ status: 'ACCEPTED' }), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).germanLevel).toBe('B1');
    expect(await prisma.germanExam.findUniqueOrThrow({ where: { id: ex.id } })).toMatchObject({ passed: true, status: 'PASSED' });
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'GERMAN_LEVEL_UPDATED' } })).toBe(1);
    expect(await prisma.caseEvent.count({ where: { caseId: main.id, type: 'GERMAN_LEVEL_UPDATED' } })).toBe(1);
    const me = expectStatus(await client.agent.get('/api/german/me'), 200).body;
    expect(me).toMatchObject({ level: 'B1', case: { id: main.id } });

    // A lower certificate (level from the file name, no exam) leaves B1 in place.
    const req = doc.requirementId!;
    const low = expectStatus(await uploadDoc(client.agent, main.id, req, 'Goethe-Zertifikat_A2.pdf'), 201).body.document;
    expectStatus(await staff.agent.post(`/api/admin/cases/${main.id}/documents/${low.id}/review`).send({ status: 'ACCEPTED' }), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).germanLevel).toBe('B1');
    // A higher one found in the file name raises it.
    const high = expectStatus(await uploadDoc(client.agent, main.id, req, 'telc_B2_Zertifikat.pdf'), 201).body.document;
    expectStatus(await staff.agent.post(`/api/admin/cases/${main.id}/documents/${high.id}/review`).send({ status: 'ACCEPTED' }), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).germanLevel).toBe('B2');
    // Other documents never touch the level.
    const detail = await clientCase(client.agent, main.id);
    const cv = detail.requirements.find((r) => (r as unknown as { key: string }).key === 'CV')!;
    const cvDoc = expectStatus(await uploadDoc(client.agent, main.id, cv.id, 'C1_lebenslauf.pdf'), 201).body.document;
    expectStatus(await staff.agent.post(`/api/admin/cases/${main.id}/documents/${cvDoc.id}/review`).send({ status: 'ACCEPTED' }), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).germanLevel).toBe('B2');
  });

  it('staff view and edit a candidate (level audited), clients cannot use the admin API', async () => {
    const client = await asClient();
    const staff = await asStaff();
    expect((await client.agent.get(`/api/admin/german/users/${client.user.id}`)).status).toBe(403);
    expect((await staff.agent.get(`/api/admin/german/users/${staff.user.id}`)).status).toBe(404); // not a candidate

    let ov = expectStatus(await staff.agent.put(`/api/admin/german/users/${client.user.id}/level`).send({ level: 'A2' }), 200).body;
    expect(ov.level).toBe('A2');
    expect(await prisma.auditLog.count({ where: { action: 'GERMAN_LEVEL_SET', target: `user:${client.user.id}` } })).toBe(1);
    expect((await staff.agent.put(`/api/admin/german/users/${client.user.id}/level`).send({ level: 'X9' })).status).toBe(400);

    ov = expectStatus(await staff.agent.post(`/api/admin/german/users/${client.user.id}/courses`).send({ school: 'DIA Baku', level: 'B1' }), 201).body;
    expect(ov.courses[0]).toMatchObject({ school: 'DIA Baku', createdById: staff.user.id });
    ov = expectStatus(await staff.agent.post(`/api/admin/german/users/${client.user.id}/exams`).send({ provider: 'OESD', level: 'B1', passed: true }), 201).body;
    expect(ov.exams[0].passed).toBe(true);
    // Matching / vacancies read the same column.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).germanLevel).toBe('A2');
  });

  it('reminds of the registration deadline, the exam day and the course start (once each)', async () => {
    const client = await asClient();
    const now = new Date('2026-12-01T08:00:00Z');
    await prisma.germanExam.create({ data: { userId: client.user.id, provider: 'GOETHE', level: 'A1', status: 'PLANNED', registrationDeadline: new Date(now.getTime() + 2 * DAY) } });
    await prisma.germanExam.create({ data: { userId: client.user.id, provider: 'TELC', level: 'A2', status: 'REGISTERED', examDate: new Date(now.getTime() + 20 * 3600 * 1000), location: 'Baku' } });
    await prisma.germanExam.create({ data: { userId: client.user.id, provider: 'OESD', level: 'B1', status: 'REGISTERED', registrationDeadline: new Date(now.getTime() + DAY) } }); // already registered → no deadline reminder
    await prisma.germanCourse.create({ data: { userId: client.user.id, school: 'Goethe', level: 'A1', status: 'PLANNED', startsAt: new Date(now.getTime() + DAY) } });
    await prisma.germanCourse.create({ data: { userId: client.user.id, school: 'Far', level: 'A1', status: 'PLANNED', startsAt: new Date(now.getTime() + 10 * DAY) } });

    expect(await runGermanReminders(now)).toBe(3);
    expect(await runGermanReminders(now)).toBe(0);
    const types = (await prisma.notification.findMany({ where: { userId: client.user.id }, select: { type: true } })).map((n) => n.type).sort();
    expect(types).toEqual(['GERMAN_COURSE_REMINDER', 'GERMAN_DEADLINE_REMINDER', 'GERMAN_EXAM_REMINDER']);
  });
});
