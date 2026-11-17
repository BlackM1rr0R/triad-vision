import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { anon, app, asAdmin, asClient, ORIGIN } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { createCaseVia, expectStatus } from '../helpers/workflow';

type Agent = Awaited<ReturnType<typeof asClient>>['agent'];
const DAY = 24 * 60 * 60 * 1000;
const stageOf = async (agent: Agent) => expectStatus(await agent.get('/api/account/stage'), 200).body;

describe('GET /api/account/stage (stage-based portal)', () => {
  it('requires a session', async () => {
    expect((await anon().get('/api/account/stage')).status).toBe(401);
  });

  it('exploring → applying → departure → in Germany; next-step carries the same stage', async () => {
    const { agent, user } = await asClient();
    let body = await stageOf(agent);
    expect(body).toMatchObject({ stage: 'EXPLORING', phase: 'LEAD', arrived: false });
    expect(body.featured.length).toBeGreaterThanOrEqual(4);
    expect(body.featured.length).toBeLessThanOrEqual(7);

    const c = await createCaseVia(agent);
    body = await stageOf(agent);
    expect(body).toMatchObject({ stage: 'APPLYING', phase: 'PREPARING' });
    expect(body.featured.slice(0, 2)).toEqual(['documents', 'checklist']);
    const next = expectStatus(await agent.get('/api/account/next-step'), 200).body;
    expect(next.portal).toMatchObject({ stage: 'APPLYING', phase: 'PREPARING', featured: body.featured });

    await prisma.case.update({ where: { id: c.id }, data: { status: 'APPROVED', decisionAt: new Date() } });
    body = await stageOf(agent);
    expect(body).toMatchObject({ stage: 'DEPARTURE', phase: 'TRAVEL' });
    expect(body.featured).toContain('arrivalPrep');

    await prisma.arrivalPlan.create({ data: { caseId: c.id, clientId: user.id, status: 'COMPLETED', arrivalTime: new Date(Date.now() - 5 * DAY) } });
    body = await stageOf(agent);
    expect(body).toMatchObject({ stage: 'IN_GERMANY', phase: 'IN_GERMANY', arrived: true });
    expect(body.featured).toContain('onboarding');
  });

  it('closed: every case rejected', async () => {
    const { agent, user } = await asClient();
    await prisma.case.create({ data: { clientId: user.id, number: uniq('TV-ST-'), profession: 'Aşpaz', status: 'REJECTED', decisionAt: new Date() } });
    expect(await stageOf(agent)).toMatchObject({ stage: 'CLOSED', phase: 'CLOSED' });
  });

  it('staff viewing as the client get the client stage (read-only GET)', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    await createCaseVia(client.agent);
    const start = await admin.agent.post(`/api/admin/impersonate/${client.user.id}`).send({ reason: 'SUPPORT_REQUEST' });
    expect(start.status, JSON.stringify(start.body)).toBe(201);
    const raw = ([] as string[]).concat(start.headers['set-cookie'] ?? []).find((x) => x.startsWith('tv_imp='));
    const imp = raw!.split(';')[0].slice('tv_imp='.length);
    const res = await request(app).get('/api/account/stage').set('Cookie', `tv_session=${admin.token}; tv_imp=${imp}`).set('Origin', ORIGIN);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stage: 'APPLYING', phase: 'PREPARING' });
  });
});
