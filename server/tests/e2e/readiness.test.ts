import { describe, expect, it } from 'vitest';
import { anon, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';

type Part = { key: string; score: number; weight: number; next: { key: string; to: string; gain: number } | null };

describe('Germany readiness score', () => {
  it('scores the own data, stores one snapshot per day and returns the history', async () => {
    const client = await asClient({ firstName: 'Nərmin', lastName: 'Əliyeva' });
    await prisma.user.update({ where: { id: client.user.id }, data: { germanLevel: 'B1', recognitionStatus: 'IN_PROGRESS' } });
    const c = await prisma.case.create({ data: { number: uniq('TV-'), clientId: client.user.id, profession: 'Pflegefachkraft', status: 'DOCUMENTS_PENDING' } });
    const req1 = await prisma.documentRequirement.create({ data: { caseId: c.id, stage: 'INITIAL', title: { de: 'Reisepass' }, required: true } });
    await prisma.documentRequirement.create({ data: { caseId: c.id, stage: 'INITIAL', title: { de: 'Diplom' }, required: true } });
    await prisma.document.create({
      data: { caseId: c.id, requirementId: req1.id, stage: 'INITIAL', originalName: 'pass.pdf', storedName: `${uniq('f')}.pdf`, mimeType: 'application/pdf', size: 10, status: 'ACCEPTED', uploadedById: client.user.id },
    });

    const res = await client.agent.get('/api/account/readiness');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    const parts = res.body.parts as Part[];
    expect(parts.map((p) => p.key)).toEqual(['language', 'documents', 'skills', 'housing', 'money']);
    expect(parts.find((p) => p.key === 'language')!.score).toBe(70);
    expect(parts.find((p) => p.key === 'documents')!.score).toBe(50);
    expect(parts.find((p) => p.key === 'documents')!.next).toMatchObject({ key: 'uploadMissing', to: '/account/checklist' });
    expect(parts.find((p) => p.key === 'money')!.next?.key).toBe('selfCheck');
    // 70 × 0.30 + 50 × 0.25 + (0 × 0.6 + 50 × 0.4) × 0.20 = 21 + 12.5 + 4 = 37.5 → 38
    expect(res.body.score).toBe(38);
    expect(res.body.weights).toEqual({ language: 30, documents: 25, skills: 20, housing: 15, money: 10 });
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].score).toBe(38);

    // Money self-check raises the score; still one snapshot for today.
    const money = await client.agent.put('/api/account/readiness/money').send({ savings: 'gt2', firstMonth: 'yes', travelCosts: 'yes', bankCard: 'yes' });
    expect(money.status).toBe(200);
    expect(money.body.parts.find((p: Part) => p.key === 'money').score).toBe(100);
    expect(money.body.score).toBe(48);
    expect(money.body.money).toEqual({ savings: 'gt2', firstMonth: 'yes', travelCosts: 'yes', bankCard: 'yes' });
    expect(await prisma.readinessSnapshot.count({ where: { userId: client.user.id } })).toBe(1);
    expect((await prisma.readinessSnapshot.findFirstOrThrow({ where: { userId: client.user.id } })).score).toBe(48);

    // An older snapshot shows up in the history (oldest first).
    await prisma.readinessSnapshot.create({ data: { userId: client.user.id, day: new Date(Date.now() - 7 * 24 * 3600 * 1000), score: 20, parts: {} } });
    const again = await client.agent.get('/api/account/readiness');
    expect(again.body.history.map((h: { score: number }) => h.score)).toEqual([20, 48]);
  });

  it('never mixes in another client’s data and rejects invalid answers', async () => {
    const a = await asClient();
    const b = await asClient();
    await prisma.user.update({ where: { id: b.user.id }, data: { germanLevel: 'C1' } });
    await prisma.case.create({ data: { number: uniq('TV-'), clientId: b.user.id, profession: 'Koch', status: 'APPROVED' } });
    await b.agent.put('/api/account/readiness/money').send({ savings: 'gt2' }).expect(200);

    const res = await a.agent.get('/api/account/readiness');
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(0);
    expect(res.body.caseId).toBeNull();
    expect(res.body.money).toEqual({});
    expect(res.body.history).toHaveLength(1);

    expect((await a.agent.put('/api/account/readiness/money').send({ savings: 'lots' })).status).toBe(400);
    expect((await a.agent.put('/api/account/readiness/money').send({ other: 'x' })).status).toBe(400);
  });

  it('is for signed-in clients only', async () => {
    expect((await anon().get('/api/account/readiness')).status).toBe(401);
    const staff = await asStaff();
    expect((await staff.agent.get('/api/account/readiness')).status).toBe(403);
  });
});
