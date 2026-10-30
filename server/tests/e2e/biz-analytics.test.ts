import { describe, expect, it } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, createUser, createVisaCategory, uniq } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';

/**
 * Management analytics (Admin → Biznes analitikası, /api/admin/analytics/business): time per visa stage and the
 * bottleneck, partner / agent / staff performance with commission, the client funnel by registration month and
 * the CSV exports. The pure maths is unit tested in tests/unit/bizAnalytics.test.ts.
 */

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const bakuDay = (d: Date) => new Date(d.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** A case with its status timeline: [status, days ago] pairs after being opened `openedDaysAgo`. */
const caseWith = async (clientId: string, openedDaysAgo: number, timeline: [CaseStatus, number][], data: { partnerId?: string; visaCategoryId?: string; assignedStaffId?: string; decided?: boolean } = {}) => {
  const last = timeline.at(-1);
  const status = last?.[0] ?? 'DOCUMENTS_PENDING';
  const c = await prisma.case.create({
    data: {
      number: uniq('TV-B-'),
      clientId,
      profession: 'Aşpaz',
      status,
      createdAt: ago(openedDaysAgo),
      partnerId: data.partnerId,
      visaCategoryId: data.visaCategoryId,
      assignedStaffId: data.assignedStaffId,
      ...(['APPROVED', 'REJECTED'].includes(status) && last ? { decisionAt: ago(last[1]), closedAt: ago(last[1]) } : {}),
    },
  });
  let from: CaseStatus = 'DOCUMENTS_PENDING';
  await prisma.caseEvent.create({ data: { caseId: c.id, type: 'CASE_CREATED', toStatus: 'DOCUMENTS_PENDING', createdAt: ago(openedDaysAgo) } });
  for (const [to, d] of timeline) {
    await prisma.caseEvent.create({ data: { caseId: c.id, type: 'STATUS_CHANGED', fromStatus: from, toStatus: to, createdAt: ago(d) } });
    from = to;
  }
  return c;
};

const query = () => ({ from: bakuDay(ago(60)), to: bakuDay(new Date()) });

describe('GET /api/admin/analytics/business', () => {
  it('is for admins only and validates the filters', async () => {
    expect((await anon().get('/api/admin/analytics/business')).status).toBe(401);
    expect((await (await asClient()).agent.get('/api/admin/analytics/business')).status).toBe(403);
    expect((await (await asStaff()).agent.get('/api/admin/analytics/business')).status).toBe(403);
    expect((await (await asStaff()).agent.get('/api/admin/analytics/business.csv')).status).toBe(403);
    const admin = await asAdmin();
    expect((await admin.agent.get('/api/admin/analytics/business').query({ from: '2026-10-10', to: '2026-10-01' })).status).toBe(400);
    expect((await admin.agent.get('/api/admin/analytics/business').query({ from: '2020-01-01', to: '2026-10-01' })).status).toBe(400);
    expect((await admin.agent.get('/api/admin/analytics/business.csv').query({ section: 'nope' })).status).toBe(400);
    const empty = expectStatus(await admin.agent.get('/api/admin/analytics/business'), 200).body;
    expect(empty.range.months).toHaveLength(12);
    expect(empty.funnel.steps.map((s: { count: number }) => s.count)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(empty.stages.bottleneck.stage).toBeNull();
  });

  it('computes stage times, bottleneck, partner / agent / staff performance and the funnel', async () => {
    const admin = await asAdmin();
    const staff = await createUser({ role: 'STAFF', firstName: 'Leyla', lastName: 'Əliyeva' });
    const visa = await createVisaCategory({ visaLabel: '§18a' });
    const partner = await prisma.referralPartner.create({ data: { name: uniq('Partnyor ') } });
    const agentUser = await createUser({ role: 'AGENT', firstName: 'Agent', lastName: 'Gəncə' });
    const agent = await prisma.agent.create({ data: { userId: agentUser.user.id, code: uniq('AG').toUpperCase().slice(0, 30) } });

    // Four clients registered 40 days ago; two came through the agent.
    const clients = await Promise.all([1, 2, 3, 4].map(() => createClient()));
    const ids = clients.map((c) => c.user.id);
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { createdAt: ago(40) } });
    await prisma.user.updateMany({ where: { id: { in: [ids[0], ids[3]] } }, data: { referredByAgentId: agent.id, referredAt: ago(40) } });
    // Client 4 only booked a consultation.
    const slot = await prisma.consultationSlot.create({ data: { staffId: staff.user.id, startsAt: ago(35), endsAt: new Date(ago(35).getTime() + 30 * 60_000) } });
    await prisma.booking.create({ data: { slotId: slot.id, userId: ids[3], name: 'Nigar', email: 'n@test.local', meetingUrl: 'https://meet.test/x', manageToken: uniq('tok-'), status: 'DONE' } });

    // Client 1: approved partner case (documents 10 days, review 5 days, …) and arrived in Germany.
    const approved = await caseWith(
      ids[0],
      30,
      [
        ['DOCUMENTS_REVIEW', 20],
        ['CONTRACT_SENT', 15],
        ['CONTRACT_SIGNED', 14],
        ['EMBASSY_DOCUMENTS', 13],
        ['EMBASSY_REVIEW', 12],
        ['APPOINTMENT_SCHEDULED', 11],
        ['DECISION_PENDING', 10],
        ['APPROVED', 2],
      ],
      { partnerId: partner.id, visaCategoryId: visa.id, assignedStaffId: staff.user.id },
    );
    await prisma.arrivalPlan.create({ data: { caseId: approved.id, clientId: ids[0], status: 'COMPLETED' } });
    await prisma.partnerCommission.create({ data: { partnerId: partner.id, caseId: approved.id, amountCents: 25000 } });
    // Client 2: refused partner case (documents 6 days).
    await caseWith(ids[1], 20, [['DOCUMENTS_REVIEW', 14], ['DECISION_PENDING', 8], ['REJECTED', 4]], { partnerId: partner.id, visaCategoryId: visa.id });
    // Client 3: open case waiting for documents for 25 days (the bottleneck).
    await caseWith(ids[2], 25, []);

    const body = expectStatus(await admin.agent.get('/api/admin/analytics/business').query(query()), 200).body;

    // Stages: documents pending took 10 and 6 days; the open case has been waiting 25 days.
    const pending = body.stages.stages.find((s: { stage: string }) => s.stage === 'DOCUMENTS_PENDING');
    expect(pending).toMatchObject({ cases: 2, medianDays: 8, avgDays: 8 });
    expect(body.stages.stages.find((s: { stage: string }) => s.stage === 'DECISION_PENDING')).toMatchObject({ cases: 2, medianDays: 6 });
    expect(body.stages.bottleneck.stage).toBe('DOCUMENTS_PENDING');
    expect(body.stages.bottleneck.rows.find((r: { stage: string }) => r.stage === 'DOCUMENTS_PENDING')).toMatchObject({ open: 1, medianWaitingDays: 25, overTypical: 1 });
    expect(body.stages.byCategory.find((c: { categoryId: string | null }) => c.categoryId === visa.id)).toMatchObject({ cases: 2 });

    // Partner: 2 cases, 1 visa, 1 refusal, processing 28 and 16 days, commission 250 €.
    const p = body.performance.partners.find((r: { id: string | null }) => r.id === partner.id);
    expect(p).toMatchObject({ name: partner.name, clients: 2, cases: 2, approved: 1, refused: 1, approvalRate: 50, refusalRate: 50, avgDays: 22, medianDays: 22, commissionCents: 25000 });
    const noPartner = body.performance.partners.find((r: { id: string | null }) => r.id === null);
    expect(noPartner).toMatchObject({ cases: 1, active: 1 });
    // Agent: 2 referred clients, 1 opened a case.
    const a = body.performance.agents.find((r: { id: string }) => r.id === agent.id);
    expect(a).toMatchObject({ name: 'Agent Gəncə', clients: 2, clientsWithCase: 1, caseRate: 50, cases: 1, approved: 1 });
    expect(body.performance.staff.find((r: { id: string | null }) => r.id === staff.user.id)).toMatchObject({ name: 'Leyla Əliyeva', cases: 1, approved: 1 });

    // Funnel: 4 registered (+ the staff / admin users are not clients) → 4 consultation-or-beyond → 3 cases → 2 documents → 1 visa → 1 arrived.
    expect(body.funnel.steps.map((s: { count: number }) => s.count)).toEqual([4, 4, 3, 2, 1, 1]);
    expect(body.funnel.steps[2]).toMatchObject({ key: 'caseOpened', rate: 75, ofFirst: 75 });
    const month = body.funnel.cohorts.find((c: { steps: { count: number }[] }) => c.steps[0].count > 0);
    expect(month.steps[0].count).toBe(4);
    expect(body.funnel.categoryFiltered).toBe(false);

    // Category filter: only the two §18a cases (and their clients) remain.
    const filtered = expectStatus(await admin.agent.get('/api/admin/analytics/business').query({ ...query(), visaCategoryId: visa.id }), 200).body;
    expect(filtered.funnel.steps.map((s: { count: number }) => s.count)).toEqual([2, 2, 2, 2, 1, 1]);
    expect(filtered.funnel.categoryFiltered).toBe(true);
    expect(filtered.performance.partners.map((r: { id: string | null }) => r.id)).toEqual([partner.id]);
    expect(filtered.stages.bottleneck.stage).toBeNull();
    const none = expectStatus(await admin.agent.get('/api/admin/analytics/business').query({ ...query(), visaCategoryId: 'none' }), 200).body;
    expect(none.performance.partners.map((r: { cases: number }) => r.cases)).toEqual([1]);

    // CSV exports (semicolon, BOM) and an audit entry.
    for (const section of ['stages', 'partners', 'funnel']) {
      const res = expectStatus(await admin.agent.get('/api/admin/analytics/business.csv').query({ ...query(), section }), 200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(`biznes-analitika-${section}-`);
      expect(res.text.startsWith('﻿')).toBe(true);
      if (section === 'partners') expect(res.text).toContain(`Partnyor;${partner.name};2;`);
      if (section === 'funnel') expect(res.text).toContain('Cəmi;4;4;3;2;1;1;');
      if (section === 'stages') expect(res.text.split('\r\n')[1]).toMatch(/^Sənədlər gözlənilir;2;8;8;/);
    }
    expect(await prisma.auditLog.count({ where: { action: 'BIZ_ANALYTICS_EXPORTED' } })).toBe(3);
  });
});
