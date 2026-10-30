import { describe, expect, it } from 'vitest';
import { asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { createRequirements } from '../../src/lib/docsIntel/requirementTemplates.js';

type Check = { code: string; status: string; memberCaseId: string | null; params: Record<string, unknown> };
type Readiness = { status: string; info: Record<string, unknown> | null; inferred: { sponsorTitle: string | null }; checks: Check[]; livingSpace: { required: number; persons: number }; timeline: { key: string; state: string }[] };
type Family = { mainCaseId: string; phase: string; members: { caseId: string; joinsWhen: string }[]; readiness: { status: string; problems: { code: string }[] } | null; current: string | null };

const waiting = async (agent: Awaited<ReturnType<typeof asStaff>>['agent'], stage = 'all') =>
  expectStatus(await agent.get('/api/family/reunion/waiting').query({ stage }), 200).body as { families: Family[]; counts: Record<string, number> };

describe('family reunion: readiness, timeline and the staff list', () => {
  it('client enters title / flat / income, the check follows the family; staff see the family move waiting → ready → active', async () => {
    const client = await asClient();
    const staff = await asStaff();
    const main = await createCaseVia(client.agent);
    const spouse = expectStatus(
      await client.agent.post(`/api/family/cases/${main.id}/members`).send({ relation: 'spouse', firstName: 'Nərmin', lastName: 'Həsənova', birthDate: '1995-06-01', joinsWhen: 'LATER' }),
      201,
    ).body.memberCaseId as string;
    const child = expectStatus(await client.agent.post(`/api/family/cases/${main.id}/members`).send({ relation: 'child', firstName: 'Elnur', lastName: 'Həsənov', birthDate: '2021-03-03', joinsWhen: 'LATER' }), 201).body
      .memberCaseId as string;

    let ov = expectStatus(await client.agent.get(`/api/family/cases/${main.id}`), 200).body as { readiness: Readiness };
    // WORK case → skilled worker guessed; no income yet, spouse A1 exempt by the title but not marked.
    expect(ov.readiness.inferred.sponsorTitle).toBe('SKILLED');
    expect(ov.readiness.info).toBeNull();
    expect(ov.readiness.status).toBe('INCOMPLETE');
    expect(ov.readiness.checks.find((c) => c.code === 'INCOME')?.status).toBe('missing');
    expect(ov.readiness.checks.find((c) => c.code === 'SPOUSE_LANGUAGE' && c.memberCaseId === spouse)?.status).toBe('warn');
    expect(ov.readiness.livingSpace).toEqual({ required: 34, persons: 3, actual: null });
    expect(ov.readiness.timeline.find((s) => s.state === 'current')?.key).toBe('worker');

    // Validation, other clients, member-case path (resolves to the main case).
    expect((await client.agent.put(`/api/family/cases/${main.id}/reunion/info`).send({ sponsorTitle: 'KING' })).status).toBe(400);
    expect((await client.agent.put(`/api/family/cases/${main.id}/reunion/info`).send({})).status).toBe(400);
    const stranger = await asClient();
    expect((await stranger.agent.put(`/api/family/cases/${main.id}/reunion/info`).send({ livingSpaceM2: 50 })).status).toBe(404);
    ov = expectStatus(await client.agent.put(`/api/family/cases/${spouse}/reunion/info`).send({ sponsorTitle: 'AUSBILDUNG', livingSpaceM2: 30, warmRent: 700, netMonthly: 1500 }), 200).body;
    expect(ov.readiness.info).toMatchObject({ sponsorTitle: 'AUSBILDUNG', livingSpaceM2: 30, warmRent: 700, netMonthly: 1500 });
    // Trainee: living space counts (30 < 34) and the spouse needs A1 → blocked.
    expect(ov.readiness.status).toBe('BLOCKED');
    expect(ov.readiness.checks.find((c) => c.code === 'LIVING_SPACE')).toMatchObject({ status: 'fail', params: { required: 34, actual: 30 } });
    expect(ov.readiness.checks.find((c) => c.code === 'SPOUSE_LANGUAGE')?.status).toBe('missing');
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'FAMILY_REUNION_INFO_UPDATED', target: `case:${main.id}` } });
    expect(JSON.stringify(log.details)).not.toContain('1500'); // field names only

    // Staff: skilled worker, enough income; the spouse marked A1 exempt → only the worker's approval is missing.
    expectStatus(await staff.agent.put(`/api/family/cases/${main.id}/reunion/info`).send({ sponsorTitle: 'SKILLED', netMonthly: 3800, titleIssuedAt: '2026-09-01' }), 200);
    expectStatus(await staff.agent.patch(`/api/family/members/${spouse}`).send({ germanExempt: true, germanExemptNote: '§ 30 (1) S. 3 Nr. 5' }), 200);
    ov = expectStatus(await client.agent.get(`/api/family/cases/${main.id}`), 200).body;
    expect(ov.readiness.status).toBe('READY');

    // Clients do not see the staff list.
    expect((await client.agent.get('/api/family/reunion/waiting')).status).toBe(403);
    let fam = (await waiting(staff.agent)).families.find((f) => f.mainCaseId === main.id)!;
    expect(fam).toMatchObject({ phase: 'waiting', current: 'worker', readiness: { status: 'READY', problems: [] } });
    expect(fam.members.map((m) => m.caseId).sort()).toEqual([spouse, child].sort());
    expect((await waiting(staff.agent, 'ready')).families.some((f) => f.mainCaseId === main.id)).toBe(false);

    await prisma.case.update({ where: { id: main.id }, data: { status: 'APPROVED', decisionAt: new Date() } });
    fam = (await waiting(staff.agent, 'ready')).families.find((f) => f.mainCaseId === main.id)!;
    expect(fam.phase).toBe('ready');
    expect(fam.current).toBe('documents');

    expectStatus(await staff.agent.post(`/api/family/cases/${main.id}/reunion/start`), 200);
    const list = await waiting(staff.agent, 'active');
    expect(list.families.find((f) => f.mainCaseId === main.id)?.phase).toBe('active');
    expect(list.counts.active).toBeGreaterThanOrEqual(1);

    // The embassy stage of a member case asks for the main applicant's proofs.
    await prisma.$transaction((tx) => createRequirements(tx, child, 'EMBASSY', null));
    const keys = (await prisma.documentRequirement.findMany({ where: { caseId: child, stage: 'EMBASSY' }, select: { key: true, required: true } })).map((r) => [r.key, r.required]);
    expect(keys).toEqual(expect.arrayContaining([['SPONSOR_RESIDENCE_TITLE', true], ['SPONSOR_SALARY', true], ['ACCOMMODATION', false]]));
  });
});
