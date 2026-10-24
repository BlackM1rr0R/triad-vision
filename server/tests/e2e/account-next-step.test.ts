import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { createCaseVia, driveCaseTo, expectStatus, uploadRequired } from '../helpers/workflow';
import { runCheckIns } from '../../src/lib/checkIns/service.js';

type Agent = Awaited<ReturnType<typeof asClient>>['agent'];
const DAY = 24 * 60 * 60 * 1000;
const nextStep = async (agent: Agent) => expectStatus(await agent.get('/api/account/next-step'), 200).body;

describe('GET /api/account/next-step', () => {
  it('requires a session', async () => {
    expect((await anon().get('/api/account/next-step')).status).toBe(401);
  });

  it('a new client: start an application, no case, nothing counted', async () => {
    const { agent } = await asClient();
    const body = await nextStep(agent);
    expect(body).toMatchObject({ case: null, progress: null, milestone: null, arrived: false, waiting: null, secondary: [] });
    expect(body.primary).toMatchObject({ kind: 'START_CASE', to: '/account#start' });
    expect(body.counts).toMatchObject({ actions: 0, unreadMessages: 0, pendingSignatures: 0, pendingLegal: 0, openCheckIns: 0 });
  });

  it('a fresh case: "Upload: <first required document>" straight to the upload step, progress and forecast', async () => {
    const { agent } = await asClient();
    const created = await createCaseVia(agent);
    const body = await nextStep(agent);
    expect(body.case).toMatchObject({ id: created.id, number: created.number, status: 'DOCUMENTS_PENDING', step: 0, stepCount: 6 });
    expect(body.progress).toBe(0);
    expect(body.primary).toMatchObject({ kind: 'UPLOAD_DOCS', to: `/account/cases/${created.id}?tab=docs#docs-initial`, count: 4 });
    const first = await prisma.documentRequirement.findFirst({ where: { caseId: created.id, stage: 'INITIAL', required: true }, orderBy: { sortOrder: 'asc' } });
    expect(body.primary.detail).toEqual(first!.title);
    expect(body.milestone).toMatchObject({ key: 'DOCUMENTS' });
    expect(new Date(body.milestone.to).getTime()).toBeGreaterThan(Date.now());
    expect(body.counts.actions).toBeGreaterThanOrEqual(1);
    // CASE_CREATED notification
    expect(body.counts.unreadNotifications).toBe(1);

    await uploadRequired(agent, created.id, 'INITIAL');
    const after = await nextStep(agent);
    expect(after.primary).toMatchObject({ kind: 'SUBMIT_DOCS', to: `/account/cases/${created.id}?tab=docs#docs-initial` });
    expect(after.progress).toBe(8);
  });

  it('waiting for the embassy: no client action, who has it and the profile nudge', async () => {
    const { agent } = await asClient();
    const admin = await asAdmin();
    await driveCaseTo('DECISION_PENDING', { client: agent, admin: admin.agent });
    const body = await nextStep(agent);
    expect(body.case.status).toBe('DECISION_PENDING');
    expect(body.waiting).toMatchObject({ side: 'EMBASSY' });
    // The new test client has an empty profile: a nudge, not an action.
    expect(body.primary).toMatchObject({ kind: 'COMPLETE_PROFILE', to: '/account/profile' });
    expect(body.counts.actions).toBe(0);
    expect(body.milestone?.key).toBe('DECISION');
  });

  it('pending legal re-acceptance comes first and is counted', async () => {
    const { agent, user } = await asClient();
    await createCaseVia(agent);
    const doc = await prisma.legalDocument.create({
      data: { kind: 'TERMS', version: uniq('ns-'), title: { az: 'AGB', de: 'AGB', en: 'Terms', ru: 'AGB' }, body: { az: 'x', de: 'x', en: 'x', ru: 'x' }, status: 'PUBLISHED', requiresReacceptance: true, publishedAt: new Date() },
    });
    try {
      const body = await nextStep(agent);
      expect(body.primary).toMatchObject({ kind: 'ACCEPT_LEGAL', to: '/account/privacy#legal', count: 1 });
      expect(body.secondary[0].kind).toBe('UPLOAD_DOCS');
      expect(body.counts.pendingLegal).toBe(1);
      expectStatus(await agent.post('/api/legal/me/accept').send({ ids: [doc.id] }), 200);
      expect((await nextStep(agent)).primary.kind).toBe('UPLOAD_DOCS');
    } finally {
      await prisma.consentRecord.deleteMany({ where: { userId: user.id, legalDocumentId: doc.id } });
      await prisma.legalDocument.delete({ where: { id: doc.id } });
    }
  });

  it('approved: plan the arrival; after arrival: the check-in and the arrived flag', async () => {
    const { agent, user } = await asClient();
    const c = await prisma.case.create({ data: { clientId: user.id, number: uniq('TV-NS-'), profession: 'Aşpaz', status: 'APPROVED', decisionAt: new Date() } });
    let body = await nextStep(agent);
    expect(body.case).toMatchObject({ id: c.id, status: 'APPROVED' });
    expect(body.progress).toBe(100);
    expect(body.arrived).toBe(false);
    expect(body.primary).toMatchObject({ kind: 'ARRIVAL_PLAN', to: '/account/arrival' });

    // Arrived 31 days ago: a check-in goes out.
    await prisma.arrivalPlan.create({ data: { caseId: c.id, clientId: user.id, status: 'COMPLETED', arrivalTime: new Date(Date.now() - 31 * DAY) } });
    await runCheckIns();
    const checkIn = await prisma.arrivalCheckIn.findFirst({ where: { caseId: c.id, audience: 'WORKER', sentAt: { not: null } } });
    expect(checkIn).toBeTruthy();
    body = await nextStep(agent);
    expect(body.arrived).toBe(true);
    expect(body.primary).toMatchObject({ kind: 'ANSWER_CHECKIN', to: `/check-in/${checkIn!.id}` });
    expect(body.counts.openCheckIns).toBe(1);
    expect(body.secondary.map((a: { kind: string }) => a.kind)).not.toContain('ARRIVAL_PLAN');

    expectStatus(await agent.post(`/api/check-ins/${checkIn!.id}`).send({ answer: 'OK' }), 200);
    body = await nextStep(agent);
    expect(body.counts.openCheckIns).toBe(0);
    expect(body.primary?.kind).not.toBe('ANSWER_CHECKIN');
  });

  it('residence permit expiring within the lead time (no renewal case yet): write to us', async () => {
    const { agent, user } = await asClient();
    const c = await prisma.case.create({
      data: { clientId: user.id, number: uniq('TV-NS-'), profession: 'Aşpaz', status: 'APPROVED', residenceTitleExpiresAt: new Date(Date.now() + 40 * DAY) },
    });
    await prisma.arrivalPlan.create({ data: { caseId: c.id, clientId: user.id, status: 'COMPLETED', arrivalTime: new Date(Date.now() - 300 * DAY) } });
    const body = await nextStep(agent);
    const all = [body.primary, ...body.secondary];
    expect(all.find((a: { kind: string }) => a.kind === 'RENEW_RESIDENCE')).toMatchObject({ to: `/account/cases/${c.id}?tab=messages` });
    expect(body.milestone).toMatchObject({ key: 'RESIDENCE_EXPIRY' });
  });
});
