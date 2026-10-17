import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { INTERVIEW_PREP_SEED_COUNT, seedInterviewPrep } from '../../prisma/seed/interviewPrep';

const L = (s: string) => ({ az: `${s} az`, de: `${s} de`, en: `${s} en`, ru: `${s} ru` });

const question = (over: Record<string, unknown> = {}) => ({
  kind: 'EMBASSY',
  category: 'purpose',
  question: L('Warum'),
  answerDe: 'Ich arbeite bei [Firma].',
  tips: L('Tipp'),
  ...over,
});

describe('interview prep — client API', () => {
  it('filters by the visa type of the client’s case by default, by kind, and by an explicit visa type', async () => {
    await prisma.interviewPrepQuestion.createMany({
      data: [
        { kind: 'EMBASSY', category: 'purpose', question: L('General'), answerDe: 'A', sortOrder: 0 },
        { kind: 'EMBASSY', category: 'study', question: L('Study'), answerDe: 'B', visaTypes: ['STUDY'], sortOrder: 1 },
        { kind: 'EMBASSY', category: 'ausbildung', question: L('Ausbildung'), answerDe: 'C', visaTypes: ['AUSBILDUNG'], sortOrder: 2 },
        { kind: 'EMPLOYER', category: 'personal', question: L('Employer'), answerDe: 'D', visaTypes: ['WORK', 'AUSBILDUNG'], sortOrder: 0 },
        { kind: 'EMBASSY', category: 'purpose', question: L('Hidden'), answerDe: 'E', published: false, sortOrder: 3 },
      ],
    });
    const client = await asClient();
    expect((await anon().get('/api/interview-prep')).status).toBe(401);

    // No case yet: everything published.
    const all = expectStatus(await client.agent.get('/api/interview-prep'), 200).body;
    expect(all.visaType).toBeNull();
    expect(all.items.map((i: { answerDe: string }) => i.answerDe).sort()).toEqual(['A', 'B', 'C', 'D']);

    const c = await createCaseVia(client.agent);
    await prisma.case.update({ where: { id: c.id }, data: { visaType: 'AUSBILDUNG' } });
    const mine = expectStatus(await client.agent.get('/api/interview-prep'), 200).body;
    expect(mine.visaType).toBe('AUSBILDUNG');
    expect(mine.caseVisaType).toBe('AUSBILDUNG');
    expect(mine.items.map((i: { answerDe: string }) => i.answerDe)).toEqual(['A', 'C', 'D']);

    const embassy = expectStatus(await client.agent.get('/api/interview-prep?kind=EMBASSY'), 200).body;
    expect(embassy.items.map((i: { answerDe: string }) => i.answerDe)).toEqual(['A', 'C']);

    const study = expectStatus(await client.agent.get('/api/interview-prep?visaType=STUDY'), 200).body;
    expect(study.items.map((i: { answerDe: string }) => i.answerDe)).toEqual(['A', 'B']);

    const every = expectStatus(await client.agent.get('/api/interview-prep?visaType=ALL'), 200).body;
    expect(every.items).toHaveLength(4);
    expect(every.items.some((i: { answerDe: string }) => i.answerDe === 'E')).toBe(false);

    expect((await client.agent.get('/api/interview-prep?kind=NOPE')).status).toBe(400);
  });
});

describe('interview prep — admin API', () => {
  it('admins create, edit, publish, reorder and delete; staff may only read; clients are out', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const client = await asClient();

    expect((await client.agent.get('/api/admin/interview-prep')).status).toBe(403);
    expect((await staff.agent.post('/api/admin/interview-prep').send(question())).status).toBe(403);

    const a = expectStatus(await admin.agent.post('/api/admin/interview-prep').send(question({ visaTypes: ['WORK', 'WORK'] })), 201).body.item;
    expect(a.visaTypes).toEqual(['WORK']);
    expect(a.sortOrder).toBe(0);
    const b = expectStatus(await admin.agent.post('/api/admin/interview-prep').send(question({ category: 'family', visaTypes: [], tips: { az: '', de: '', en: '', ru: '' } })), 201).body.item;
    expect(b.visaTypes).toBeNull();
    expect(b.tips).toBeNull();
    expect(b.sortOrder).toBe(1);
    expect((await admin.agent.post('/api/admin/interview-prep').send(question({ question: { az: 'x', de: '', en: 'x', ru: 'x' } }))).status).toBe(400);
    expect((await admin.agent.post('/api/admin/interview-prep').send(question({ visaTypes: ['MARS'] }))).status).toBe(400);

    const list = expectStatus(await staff.agent.get('/api/admin/interview-prep'), 200).body;
    expect(list.items).toHaveLength(2);
    expect(list.categories).toEqual(['family', 'purpose']);
    expect(expectStatus(await staff.agent.get('/api/admin/interview-prep?visaType=STUDY'), 200).body.items.map((i: { id: string }) => i.id)).toEqual([b.id]);
    expect(expectStatus(await staff.agent.get('/api/admin/interview-prep?category=purpose'), 200).body.items.map((i: { id: string }) => i.id)).toEqual([a.id]);

    expect((await staff.agent.put(`/api/admin/interview-prep/${a.id}`).send({ answerDe: 'Neu' })).status).toBe(403);
    const edited = expectStatus(await admin.agent.put(`/api/admin/interview-prep/${a.id}`).send({ answerDe: 'Neu', visaTypes: null }), 200).body.item;
    expect(edited.answerDe).toBe('Neu');
    expect(edited.visaTypes).toBeNull();
    expect(edited.category).toBe('purpose');

    expect((await staff.agent.patch(`/api/admin/interview-prep/${a.id}/publish`).send({ published: false })).status).toBe(403);
    expect(expectStatus(await admin.agent.patch(`/api/admin/interview-prep/${a.id}/publish`).send({ published: false }), 200).body.item.published).toBe(false);
    expect(expectStatus(await client.agent.get('/api/interview-prep'), 200).body.items.map((i: { id: string }) => i.id)).toEqual([b.id]);
    expect(expectStatus(await staff.agent.get('/api/admin/interview-prep?published=false'), 200).body.items).toHaveLength(1);

    expectStatus(await admin.agent.post('/api/admin/interview-prep/reorder').send({ ids: [b.id, a.id] }), 200);
    expect((await prisma.interviewPrepQuestion.findUniqueOrThrow({ where: { id: a.id } })).sortOrder).toBe(1);
    expect((await prisma.interviewPrepQuestion.findUniqueOrThrow({ where: { id: b.id } })).sortOrder).toBe(0);
    expect((await admin.agent.post('/api/admin/interview-prep/reorder').send({ ids: ['missing'] })).status).toBe(404);
    expect((await staff.agent.post('/api/admin/interview-prep/reorder').send({ ids: [a.id] })).status).toBe(403);

    expect((await staff.agent.delete(`/api/admin/interview-prep/${a.id}`)).status).toBe(403);
    expectStatus(await admin.agent.delete(`/api/admin/interview-prep/${a.id}`), 200);
    expect((await admin.agent.delete(`/api/admin/interview-prep/${a.id}`)).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { actorId: admin.user.id, action: { startsWith: 'INTERVIEW_PREP_' } } })).toBe(6);
  });
});

describe('interview prep — seed', () => {
  it('seeds at least 40 four-language questions once and never twice', async () => {
    expect(INTERVIEW_PREP_SEED_COUNT).toBeGreaterThanOrEqual(40);
    expect(await seedInterviewPrep(prisma)).toBe(INTERVIEW_PREP_SEED_COUNT);
    expect(await seedInterviewPrep(prisma)).toBe(0);
    const rows = await prisma.interviewPrepQuestion.findMany();
    expect(rows).toHaveLength(INTERVIEW_PREP_SEED_COUNT);
    expect(rows.filter((r) => r.kind === 'EMBASSY').length).toBeGreaterThanOrEqual(20);
    expect(rows.filter((r) => r.kind === 'EMPLOYER').length).toBeGreaterThanOrEqual(18);
    for (const r of rows) {
      const q = r.question as Record<string, string>;
      for (const l of ['az', 'de', 'en', 'ru']) expect(q[l]?.length).toBeGreaterThan(5);
      expect(r.answerDe.length).toBeGreaterThan(20);
    }
    // A seeded table that an admin has edited is left alone.
    await prisma.interviewPrepQuestion.deleteMany({ where: { kind: 'EMPLOYER' } });
    expect(await seedInterviewPrep(prisma)).toBe(0);
  });
});
