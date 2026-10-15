import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { contentPayload, l10n } from '../helpers/factories';
import { clientCase, createCaseVia, driveCaseTo, expectStatus, uploadDoc } from '../helpers/workflow';
import { clearForecastCache } from '../../src/lib/journey/forecast.js';
import { seedJourney } from '../../prisma/seed/journey';

const DAY = 24 * 60 * 60 * 1000;

const makeVisa = (over: Record<string, unknown> = {}) =>
  prisma.visaCategory.create({ data: { ...contentPayload['visa-categories'](over), items: { az: [], de: [], en: [], ru: [] } } as never });

const item = (over: Record<string, unknown> = {}) => ({
  slug: `item-${Math.random().toString(36).slice(2, 8)}`,
  icon: 'MapPin',
  title: l10n('Anmeldung'),
  body: l10n('Body'),
  link: 'https://example.org',
  dueDays: 14,
  sortOrder: 0,
  published: true,
  ...over,
});

const question = (level: string, answer = 1) => ({
  level,
  question: l10n(`Q ${level}`),
  options: ['a', 'b', 'c', 'd'],
  answer,
  sortOrder: 0,
  published: true,
});

/** A finished case with a synthetic status history (for the forecast statistics). */
const historicalCase = async (clientId: string, visaCategoryId: string | null, docsDays: number, start = new Date('2026-01-01T00:00:00Z')) => {
  const c = await prisma.case.create({ data: { clientId, number: `TV-H-${Math.random().toString(36).slice(2, 8)}`, profession: 'x', visaCategoryId, status: 'APPROVED', createdAt: start } });
  const at = (days: number) => new Date(start.getTime() + days * DAY);
  await prisma.caseEvent.createMany({
    data: [
      { caseId: c.id, type: 'CASE_CREATED', toStatus: 'DOCUMENTS_PENDING', createdAt: at(0) },
      { caseId: c.id, type: 'STATUS_CHANGED', toStatus: 'CONTRACT_SENT', createdAt: at(docsDays) },
      { caseId: c.id, type: 'STATUS_CHANGED', toStatus: 'EMBASSY_DOCUMENTS', createdAt: at(docsDays + 5) },
      { caseId: c.id, type: 'STATUS_CHANGED', toStatus: 'DECISION_PENDING', createdAt: at(docsDays + 40) },
      { caseId: c.id, type: 'DECISION', toStatus: 'APPROVED', createdAt: at(docsDays + 60) },
    ],
  });
  return c;
};

beforeEach(async () => {
  // These tables are not part of the shared resetDb (journey module data).
  await prisma.caseOnboarding.deleteMany();
  await prisma.onboardingItem.deleteMany();
  await prisma.germanQuestion.deleteMany();
  await prisma.languageCourse.deleteMany();
  clearForecastCache();
});

// ─── Forecast ──────────────────────────────────────────────────────────

describe('journey: forecast', () => {
  it('owner and staff can read it; others cannot', async () => {
    const client = await asClient();
    const other = await asClient();
    const staff = await asStaff();
    const c = await createCaseVia(client.agent);

    expect((await anon().get(`/api/journey/cases/${c.id}/forecast`)).status).toBe(401);
    expect((await other.agent.get(`/api/journey/cases/${c.id}/forecast`)).status).toBe(404);
    expectStatus(await staff.agent.get(`/api/journey/cases/${c.id}/forecast`), 200);

    const res = expectStatus(await client.agent.get(`/api/journey/cases/${c.id}/forecast`), 200);
    const f = res.body.forecast;
    expect(f.currentStep).toBe('DOCUMENTS');
    expect(f.steps).toHaveLength(5);
    expect(f.steps.map((s: { status: string }) => s.status)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(f.steps[0]).toMatchObject({ key: 'DOCUMENTS', minDays: 10, maxDays: 20, basedOn: 'default' });
    expect(new Date(f.estimatedDecision.from).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(f.estimatedDecision.to).getTime()).toBeGreaterThan(new Date(f.estimatedDecision.from).getTime());
  });

  it('uses the visa category history when enough cases exist, and admin overrides win', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const staff = await asStaff();
    const visa = await makeVisa();
    const other = await asClient();
    for (const days of [8, 9, 12]) await historicalCase(other.user.id, visa.id, days);

    const created = expectStatus(await client.agent.post('/api/cases').send({ profession: 'Driver', visaCategoryId: visa.id }), 201).body.case;
    let f = expectStatus(await client.agent.get(`/api/journey/cases/${created.id}/forecast`), 200).body.forecast;
    expect(f.steps[0]).toMatchObject({ key: 'DOCUMENTS', basedOn: 'history', sample: 3, minDays: 9, maxDays: 11 });
    expect(f.steps[1]).toMatchObject({ key: 'CONTRACT', basedOn: 'history', minDays: 5, maxDays: 5 });
    // APPOINTMENT was never visited in the history → default
    expect(f.steps[3]).toMatchObject({ key: 'APPOINTMENT', basedOn: 'default' });

    // Staff may read the admin table but not write.
    const table = expectStatus(await staff.agent.get('/api/admin/journey/forecast'), 200).body;
    expect(table.items.find((v: { id: string }) => v.id === visa.id).effective.DOCUMENTS.basedOn).toBe('history');
    expect((await staff.agent.put(`/api/admin/journey/forecast/${visa.id}`).send({ DOCUMENTS: [1, 2] })).status).toBe(403);
    expect((await admin.agent.put(`/api/admin/journey/forecast/${visa.id}`).send({ DOCUMENTS: [9, 2] })).status).toBe(400);
    expect((await admin.agent.put('/api/admin/journey/forecast/nope').send({ DOCUMENTS: [1, 2] })).status).toBe(404);

    const put = expectStatus(await admin.agent.put(`/api/admin/journey/forecast/${visa.id}`).send({ DOCUMENTS: [2, 4], DECISION: [30, 60] }), 200);
    expect(put.body.override).toEqual({ DOCUMENTS: [2, 4], DECISION: [30, 60] });
    f = expectStatus(await client.agent.get(`/api/journey/cases/${created.id}/forecast`), 200).body.forecast;
    expect(f.steps[0]).toMatchObject({ basedOn: 'override', minDays: 2, maxDays: 4 });
    expect(f.steps[4]).toMatchObject({ basedOn: 'override', minDays: 30, maxDays: 60 });
    expect(f.steps[1].basedOn).toBe('history');

    // Clearing the override falls back to history again.
    expectStatus(await admin.agent.put(`/api/admin/journey/forecast/${visa.id}`).send({}), 200);
    f = expectStatus(await client.agent.get(`/api/journey/cases/${created.id}/forecast`), 200).body.forecast;
    expect(f.steps[0].basedOn).toBe('history');
  });
});

// ─── Onboarding ────────────────────────────────────────────────────────

describe('journey: onboarding', () => {
  it('needs an approved case to track progress', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    await prisma.onboardingItem.create({ data: item({ slug: 'anmeldung', dueDays: 14 }) });
    await prisma.onboardingItem.create({ data: item({ slug: 'hidden', published: false }) });

    let res = expectStatus(await client.agent.get('/api/journey/onboarding'), 200);
    expect(res.body.case).toBeNull();
    expect(res.body.progress).toBeNull();
    expect(res.body.items).toHaveLength(1);
    const itemId = res.body.items[0].id as string;
    expect((await client.agent.put(`/api/journey/onboarding/${itemId}`).send({ done: true })).status).toBe(409);
    expect((await admin.agent.get('/api/journey/onboarding')).status).toBe(403);

    const c = await driveCaseTo('APPROVED', { client: client.agent, admin: admin.agent });
    res = expectStatus(await client.agent.get('/api/journey/onboarding'), 200);
    expect(res.body.case.id).toBe(c.id);
    expect(res.body.progress).toEqual({ done: 0, total: 1, percent: 0 });
    const decisionAt = new Date(res.body.case.decisionAt).getTime();
    expect(new Date(res.body.items[0].dueAt).getTime()).toBe(decisionAt + 14 * DAY);

    const put = expectStatus(await client.agent.put(`/api/journey/onboarding/${itemId}`).send({ done: true, note: 'Bürgeramt Mitte' }), 200);
    expect(put.body.item).toMatchObject({ id: itemId, done: true, note: 'Bürgeramt Mitte' });
    expect(put.body.progress).toEqual({ done: 1, total: 1, percent: 100 });

    // Staff see the client's progress.
    const staffView = expectStatus(await admin.agent.get(`/api/admin/journey/onboarding/${c.id}`), 200);
    expect(staffView.body.items[0]).toMatchObject({ done: true, note: 'Bürgeramt Mitte' });
    expect(staffView.body.progress.percent).toBe(100);

    // Un-done keeps the note; unpublished / unknown items are refused.
    const undo = expectStatus(await client.agent.put(`/api/journey/onboarding/${itemId}`).send({ done: false }), 200);
    expect(undo.body.item).toMatchObject({ done: false, note: 'Bürgeramt Mitte' });
    const hidden = await prisma.onboardingItem.findUniqueOrThrow({ where: { slug: 'hidden' } });
    expect((await client.agent.put(`/api/journey/onboarding/${hidden.id}`).send({ done: true })).status).toBe(404);
  });

  it('admin CRUD for items (staff read-only)', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const url = '/api/admin/journey/onboarding-items';
    expect((await staff.agent.post(url).send(item())).status).toBe(403);
    expect((await admin.agent.post(url).send({ ...item(), slug: 'Bad Slug' })).status).toBe(400);
    expect((await admin.agent.post(url).send({ ...item(), link: 'javascript:alert(1)' })).status).toBe(400);

    const a = expectStatus(await admin.agent.post(url).send(item({ slug: 'a', sortOrder: 0 })), 201).body.item;
    const b = expectStatus(await admin.agent.post(url).send(item({ slug: 'b', sortOrder: 1, link: '' })), 201).body.item;
    expect(b.link).toBeNull();
    expect(expectStatus(await staff.agent.get(url), 200).body.items.map((i: { slug: string }) => i.slug)).toEqual(['a', 'b']);

    const upd = expectStatus(await admin.agent.put(`${url}/${a.id}`).send({ title: l10n('Changed'), dueDays: null, published: false }), 200);
    expect(upd.body.item).toMatchObject({ title: l10n('Changed'), dueDays: null, published: false });

    expectStatus(await admin.agent.put(`${url}/reorder`).send({ ids: [b.id, a.id] }), 200);
    expect(expectStatus(await admin.agent.get(url), 200).body.items.map((i: { slug: string }) => i.slug)).toEqual(['b', 'a']);

    expectStatus(await admin.agent.delete(`${url}/${a.id}`), 200);
    expect((await admin.agent.delete(`${url}/${a.id}`)).status).toBe(404);
    expect(expectStatus(await admin.agent.get(url), 200).body.items).toHaveLength(1);
  });
});

// ─── German ────────────────────────────────────────────────────────────

describe('journey: German preparation', () => {
  it('test → score → confirm level, status and courses', async () => {
    const client = await asClient();
    await prisma.germanQuestion.createMany({
      data: [
        ...Array.from({ length: 6 }, () => question('A1')),
        ...Array.from({ length: 6 }, () => question('A2')),
        ...Array.from({ length: 6 }, () => question('B1')),
        ...Array.from({ length: 6 }, () => question('B2')),
        { ...question('A1'), published: false },
      ],
    });
    const test = expectStatus(await client.agent.get('/api/journey/german/test'), 200).body;
    expect(test.questions).toHaveLength(20);
    expect(test.questions.every((q: Record<string, unknown>) => q.answer === undefined && Array.isArray(q.options))).toBe(true);
    const byLevel = (l: string) => test.questions.filter((q: { level: string }) => q.level === l).length;
    expect([byLevel('A1'), byLevel('A2'), byLevel('B1'), byLevel('B2')]).toEqual([5, 5, 5, 5]);

    // All A1/A2 right, B1 wrong, B2 right → A2.
    const answers: Record<string, number> = {};
    for (const q of test.questions as { id: string; level: string }[]) answers[q.id] = q.level === 'B1' ? 0 : 1;
    const scored = expectStatus(await client.agent.post('/api/journey/german/test').send({ answers }), 200).body;
    expect(scored.result.estimated).toBe('A2');
    expect(scored.result.levels.map((l: { passed: boolean }) => l.passed)).toEqual([true, true, false, true]);
    expect(Object.keys(scored.correct)).toHaveLength(20);
    expect((await client.agent.post('/api/journey/german/test').send({ answers: {} })).status).toBe(400);
    expect((await client.agent.post('/api/journey/german/test').send({ answers: { nope: 1 } })).status).toBe(400);

    // Nothing stored until confirmed.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).germanLevel).toBeNull();
    expectStatus(await client.agent.put('/api/journey/german/level').send({ level: 'A2' }), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).germanLevel).toBe('A2');
    expect((await client.agent.put('/api/journey/german/level').send({ level: 'Z9' })).status).toBe(400);

    await prisma.languageCourse.createMany({ data: [{ name: 'Goethe', sortOrder: 1 }, { name: 'ADU', sortOrder: 0 }, { name: 'Hidden', published: false }] });
    const courses = expectStatus(await client.agent.get('/api/journey/german/courses'), 200).body.items;
    expect(courses.map((c: { name: string }) => c.name)).toEqual(['ADU', 'Goethe']);
  });

  it('status: required level from the visa, certificate from the LANGUAGE_CERT requirement', async () => {
    const client = await asClient();
    let st = expectStatus(await client.agent.get('/api/journey/german/status'), 200).body;
    expect(st).toMatchObject({ userLevel: null, requiredLevel: null, meetsRequirement: null, case: null, certificate: null });

    const visa = await makeVisa({ germanLevel: 'B1' });
    const created = expectStatus(await client.agent.post('/api/cases').send({ profession: 'Driver', visaCategoryId: visa.id }), 201).body.case;
    st = expectStatus(await client.agent.get('/api/journey/german/status'), 200).body;
    expect(st.requiredLevel).toBe('B1');
    expect(st.meetsRequirement).toBe(false);
    expect(st.case.id).toBe(created.id);
    expect(st.certificate).toMatchObject({ caseId: created.id, status: 'missing', stage: 'INITIAL', link: `/account/cases/${created.id}#docs-initial` });

    const detail = await clientCase(client.agent, created.id);
    expectStatus(await uploadDoc(client.agent, created.id, st.certificate.requirementId), 201);
    expect(detail.requirements.some((r) => r.id === st.certificate.requirementId)).toBe(true);
    st = expectStatus(await client.agent.get('/api/journey/german/status'), 200).body;
    expect(st.certificate.status).toBe('pending');

    await prisma.user.update({ where: { id: client.user.id }, data: { germanLevel: 'B2' } });
    st = expectStatus(await client.agent.get('/api/journey/german/status'), 200).body;
    expect(st.meetsRequirement).toBe(true);
  });

  it('admin CRUD for questions and courses', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const q = '/api/admin/journey/german/questions';
    expect((await staff.agent.post(q).send(question('A1'))).status).toBe(403);
    expect((await admin.agent.post(q).send({ ...question('A1'), answer: 4 })).status).toBe(400);
    expect((await admin.agent.post(q).send({ ...question('C1') })).status).toBe(400);
    const created = expectStatus(await admin.agent.post(q).send(question('B1', 2)), 201).body.item;
    expect(created).toMatchObject({ level: 'B1', answer: 2 });
    expect((await admin.agent.put(`${q}/${created.id}`).send({ options: ['x', 'y'] })).status).toBe(400); // answer 2 out of range
    expect(expectStatus(await admin.agent.put(`${q}/${created.id}`).send({ options: ['x', 'y'], answer: 0 }), 200).body.item.answer).toBe(0);
    expect(expectStatus(await staff.agent.get(q), 200).body.items).toHaveLength(1);
    expectStatus(await admin.agent.delete(`${q}/${created.id}`), 200);
    expect(expectStatus(await admin.agent.get(q), 200).body.items).toHaveLength(0);

    const c = '/api/admin/journey/german/courses';
    expect((await staff.agent.post(c).send({ name: 'X' })).status).toBe(403);
    expect((await admin.agent.post(c).send({ name: '' })).status).toBe(400);
    const course = expectStatus(await admin.agent.post(c).send({ name: 'Goethe', provider: 'GI', url: 'https://goethe.de', format: 'hybrid', description: l10n('D') }), 201).body.item;
    expect(course).toMatchObject({ name: 'Goethe', format: 'hybrid' });
    const upd = expectStatus(await admin.agent.put(`${c}/${course.id}`).send({ url: '', description: null, published: false }), 200).body.item;
    expect(upd).toMatchObject({ url: null, description: null, published: false });
    expectStatus(await admin.agent.delete(`${c}/${course.id}`), 200);
    expect(expectStatus(await admin.agent.get(c), 200).body.items).toHaveLength(0);
  });
});

// ─── Family reunion ────────────────────────────────────────────────────

describe('journey: family reunion', () => {
  it('staff add a member case under the main case (same client, inherited staff + visa)', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const staff = await asStaff();
    const visa = await makeVisa();
    const main = expectStatus(await client.agent.post('/api/cases').send({ profession: 'Driver', visaCategoryId: visa.id }), 201).body.case;
    expectStatus(await admin.agent.patch(`/api/admin/cases/${main.id}`).send({ assignedStaffId: staff.user.id }), 200);

    // Clients cannot add members; validation applies.
    expect((await client.agent.post(`/api/journey/cases/${main.id}/family`).send({ firstName: 'L', lastName: 'M', relation: 'spouse' })).status).toBe(403);
    expect((await staff.agent.post(`/api/journey/cases/${main.id}/family`).send({ firstName: 'L', lastName: 'M', relation: 'cousin' })).status).toBe(400);

    const res = expectStatus(
      await staff.agent.post(`/api/journey/cases/${main.id}/family`).send({ firstName: 'Leyla', lastName: 'Məmmədova', relation: 'spouse', birthDate: '1992-04-03', email: 'leyla@example.com' }),
      201,
    );
    const member = res.body.case;
    expect(member).toMatchObject({ clientId: client.user.id, parentCaseId: main.id, relation: 'spouse', assignedStaffId: staff.user.id, visaCategoryId: visa.id, profession: 'Familiennachzug – spouse' });
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].member).toEqual({ firstName: 'Leyla', lastName: 'Məmmədova', birthDate: '1992-04-03', email: 'leyla@example.com', relation: 'spouse' });
    expect(res.body.aggregate).toMatchObject({ total: 1, approved: 0, active: 1 });

    // The member case has its own requirements and the member event stays off the client timeline.
    const memberDetail = await clientCase(client.agent, member.id);
    expect(memberDetail.requirements.length).toBeGreaterThan(0);
    expect((memberDetail.events as { type: string }[]).some((e) => e.type === 'FAMILY_MEMBER')).toBe(false);

    // The one-active-case rule still blocks a second main case, but not members.
    expect((await client.agent.post('/api/cases').send({ profession: 'Second' })).status).toBe(409);
    expectStatus(await staff.agent.post(`/api/journey/cases/${main.id}/family`).send({ firstName: 'Ayan', lastName: 'Məmmədova', relation: 'child' }), 201);
    // Members cannot have members.
    expect((await staff.agent.post(`/api/journey/cases/${member.id}/family`).send({ firstName: 'X', lastName: 'Y', relation: 'child' })).status).toBe(400);

    // The main client sees every case, and the group from either side.
    const list = expectStatus(await client.agent.get('/api/cases'), 200).body.cases;
    expect(list).toHaveLength(3);
    const group = expectStatus(await client.agent.get(`/api/journey/cases/${member.id}/family`), 200).body;
    expect(group.main.id).toBe(main.id);
    expect(group.members.map((m: { relation: string }) => m.relation)).toEqual(['spouse', 'child']);
    const other = await asClient();
    expect((await other.agent.get(`/api/journey/cases/${main.id}/family`)).status).toBe(404);
    // Admin mirror endpoint.
    expect(expectStatus(await staff.agent.get(`/api/admin/journey/cases/${main.id}/family`), 200).body.members).toHaveLength(2);
  });

  it('a pristine member case can be removed, a used one cannot', async () => {
    const client = await asClient();
    const staff = await asStaff();
    const main = await createCaseVia(client.agent);
    const member = expectStatus(await staff.agent.post(`/api/journey/cases/${main.id}/family`).send({ firstName: 'A', lastName: 'B', relation: 'child' }), 201).body.case;

    const detail = await clientCase(client.agent, member.id);
    expectStatus(await uploadDoc(client.agent, member.id, detail.requirements[0].id), 201);
    expect((await staff.agent.delete(`/api/journey/cases/${main.id}/family/${member.id}`)).status).toBe(409);
    expect((await client.agent.delete(`/api/journey/cases/${main.id}/family/${member.id}`)).status).toBe(403);

    const fresh = expectStatus(await staff.agent.post(`/api/journey/cases/${main.id}/family`).send({ firstName: 'C', lastName: 'D', relation: 'parent' }), 201).body.case;
    expect((await staff.agent.delete(`/api/journey/cases/${member.id}/family/${fresh.id}`)).status).toBe(404); // wrong parent
    const del = expectStatus(await staff.agent.delete(`/api/journey/cases/${main.id}/family/${fresh.id}`), 200);
    expect(del.body.members).toHaveLength(1);
    expect(await prisma.case.findUnique({ where: { id: fresh.id } })).toBeNull();
  });
});

// ─── Seed ──────────────────────────────────────────────────────────────

describe('journey: seed', () => {
  it('seeds items, questions and courses idempotently', async () => {
    const first = await seedJourney(prisma);
    expect(first.onboardingItems).toBeGreaterThanOrEqual(10);
    expect(first.germanQuestions).toBeGreaterThanOrEqual(36);
    expect(await prisma.onboardingItem.count()).toBe(first.onboardingItems);
    expect(await prisma.germanQuestion.count()).toBe(first.germanQuestions);
    expect(await prisma.languageCourse.count()).toBe(first.languageCourses);
    const questions = await prisma.germanQuestion.findMany();
    expect(questions.every((q) => (q.options as string[]).length >= 2 && q.answer < (q.options as string[]).length)).toBe(true);
    for (const level of ['A1', 'A2', 'B1']) expect(questions.filter((q) => q.level === level).length).toBeGreaterThanOrEqual(10);

    await seedJourney(prisma);
    expect(await prisma.onboardingItem.count()).toBe(first.onboardingItems);
    expect(await prisma.germanQuestion.count()).toBe(first.germanQuestions);
  });
});
