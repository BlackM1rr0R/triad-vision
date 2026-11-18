import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { invalidateAccess } from '../../src/lib/access/store';

/**
 * Case scope (lib/access, ASSIGNED / TEAM) on the team workload board (/api/admin/workload), the interviews of the
 * ops calendar and the housing proposals / Anmeldung deadlines. The default scope ALL must see exactly what it saw
 * before; ASSIGNED only what belongs to its own cases.
 */

const DAY = 24 * 60 * 60 * 1000;

const setScope = async (sup: Agent, userId: string, caseScope: 'ALL' | 'ASSIGNED' | 'TEAM') => {
  expectStatus(await sup.put(`/api/admin/access/scope/users/${userId}`).send({ caseScope }), 200);
  invalidateAccess(userId);
};

const clientWithCase = async (lastName: string, data: Record<string, unknown> = {}) => {
  const client = await asClient({ lastName });
  const c = await createCaseVia(client.agent);
  if (Object.keys(data).length) await prisma.case.update({ where: { id: c.id }, data });
  return { client, c };
};

const range = () => `from=${new Date(Date.now() - DAY).toISOString()}&to=${new Date(Date.now() + 10 * DAY).toISOString()}`;

const interviewFor = (candidateId: string, extra: { staffId?: string; createdById?: string } = {}) =>
  prisma.interview.create({ data: { candidateId, startsAt: new Date(Date.now() + 2 * DAY), endsAt: new Date(Date.now() + 2 * DAY + 3600_000), status: 'CONFIRMED', ...extra } });

const setup = async () => {
  const sup = await asSuperAdmin();
  const admin = await asAdmin();
  const mine = await clientWithCase('Scopemine', { assignedStaffId: admin.user.id, status: 'APPROVED' });
  const other = await clientWithCase('Scopeother', { status: 'APPROVED' });
  const noCase = await asClient({ lastName: 'Scopenocase' });
  const noCaseOwn = await asClient({ lastName: 'Scopenocaseown' });
  const interviews = {
    mine: await interviewFor(mine.client.user.id),
    other: await interviewFor(other.client.user.id),
    unlinked: await interviewFor(noCase.user.id),
    unlinkedOwn: await interviewFor(noCaseOwn.user.id, { staffId: admin.user.id }),
    otherOwn: await interviewFor(other.client.user.id, { createdById: admin.user.id }),
  };
  const listing = await prisma.partnerHousing.create({ data: { name: 'WG Hauptstraße', city: 'Berlin', active: true } });
  const pMine = await prisma.housingProposal.create({ data: { listingId: listing.id, caseId: mine.c.id, source: 'STAFF' } });
  const pOther = await prisma.housingProposal.create({ data: { listingId: listing.id, caseId: other.c.id, source: 'STAFF' } });
  const moveIn = new Date(Date.UTC(2027, 0, 10));
  await prisma.caseHousing.createMany({ data: [{ caseId: mine.c.id, moveInDate: moveIn }, { caseId: other.c.id, moveInDate: moveIn }] });
  // an open, unassigned case for the workload "unassigned" count
  const unassigned = await clientWithCase('Scopeunassigned');
  return { sup, admin, mine, other, unassigned, interviews, listing, pMine, pOther };
};

const calendarInterviewIds = async (agent: Agent) =>
  (expectStatus(await agent.get(`/api/admin/ops-calendar?${range()}&types=interview`), 200).body.items as { id: string }[]).map((i) => i.id).sort();

describe('case scope: workload, ops-calendar interviews, housing', () => {
  it('ALL (default): everything, as before', async () => {
    const s = await setup();
    const ids = await calendarInterviewIds(s.admin.agent);
    expect(ids).toEqual(Object.values(s.interviews).map((i) => i.id).sort());

    const wl = expectStatus(await s.admin.agent.get('/api/admin/workload'), 200).body;
    expect(wl.scope).toBe('team');
    expect(wl.unassigned).toBeGreaterThanOrEqual(1); // the open "unassigned" case
    expectStatus(await s.admin.agent.get(`/api/admin/workload/suggest?caseId=${s.other.c.id}`), 200);

    const props = expectStatus(await s.admin.agent.get(`/api/admin/housing/listings/${s.listing.id}/proposals`), 200).body.items as { caseId: string }[];
    expect(props.map((p) => p.caseId).sort()).toEqual([s.mine.c.id, s.other.c.id].sort());
    const dl = expectStatus(await s.admin.agent.get('/api/admin/housing/deadlines'), 200).body.items as { caseId: string }[];
    expect(dl.map((d) => d.caseId)).toEqual(expect.arrayContaining([s.mine.c.id, s.other.c.id]));
    expectStatus(await s.admin.agent.patch(`/api/admin/housing/proposals/${s.pOther.id}`).send({ note: 'Bitte anrufen' }), 200);
  });

  it('ASSIGNED: own cases only; unlinked interviews only for their organiser / creator', async () => {
    const s = await setup();
    await setScope(s.sup.agent, s.admin.user.id, 'ASSIGNED');

    // Interviews: own case's candidate, plus those the admin organises / created; never another case's candidate.
    expect(await calendarInterviewIds(s.admin.agent)).toEqual([s.interviews.mine.id, s.interviews.unlinkedOwn.id, s.interviews.otherOwn.id].sort());
    // the other calendar layers keep following the scope
    const all = expectStatus(await s.admin.agent.get(`/api/admin/ops-calendar?${range()}`), 200).body;
    expect(JSON.stringify(all)).not.toContain(s.other.c.id);

    // Workload: capacity rows stay (not case data), the unassigned-cases count only over cases in scope.
    const wl = expectStatus(await s.admin.agent.get('/api/admin/workload'), 200).body;
    expect(wl.rows.some((r: { id: string }) => r.id === s.admin.user.id)).toBe(true);
    expect(wl.unassigned).toBe(0);
    // refused for a case outside the scope (the access guard answers 403 OUT_OF_SCOPE for ?caseId=, the route 404)
    expect([403, 404]).toContain((await s.admin.agent.get(`/api/admin/workload/suggest?caseId=${s.other.c.id}`)).status);
    expectStatus(await s.admin.agent.get(`/api/admin/workload/suggest?caseId=${s.mine.c.id}`), 200);

    // Housing: proposals of a listing, the deadlines list and editing a proposal follow the scope.
    const props = expectStatus(await s.admin.agent.get(`/api/admin/housing/listings/${s.listing.id}/proposals`), 200).body.items as { caseId: string }[];
    expect(props.map((p) => p.caseId)).toEqual([s.mine.c.id]);
    const dl = expectStatus(await s.admin.agent.get('/api/admin/housing/deadlines'), 200).body.items as { caseId: string }[];
    expect(dl.map((d) => d.caseId)).toEqual([s.mine.c.id]);
    expectStatus(await s.admin.agent.patch(`/api/admin/housing/proposals/${s.pOther.id}`).send({ note: 'x' }), 404);
    expectStatus(await s.admin.agent.patch(`/api/admin/housing/proposals/${s.pMine.id}`).send({ note: 'Bitte anrufen' }), 200);
    expect((await prisma.housingProposal.findUniqueOrThrow({ where: { id: s.pOther.id } })).staffNote).toBeNull();

    // Back to ALL: identical to the default again.
    await setScope(s.sup.agent, s.admin.user.id, 'ALL');
    expect(await calendarInterviewIds(s.admin.agent)).toEqual(Object.values(s.interviews).map((i) => i.id).sort());
  });
});
