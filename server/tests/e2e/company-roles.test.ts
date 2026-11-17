import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../helpers/db';
import { asAdmin, asSuperAdmin, sessionAgent } from '../helpers/api';
import { createUser, uniq } from '../helpers/factories';
import { asCandidate, asCompany, cleanJobs, createVacancy } from './vacancies.fixtures';

/**
 * Employer roles (lib/companyAccess): STANDARD members keep today's access; OWNER / ADMIN / HR / MANAGER / VIEWER are
 * enforced on the server; owners manage roles in the portal, SUPER_ADMIN in the Access Center.
 */

beforeEach(async () => {
  await prisma.companyMemberAccess.deleteMany();
  await cleanJobs();
});

const MINUTE = 60_000;

/** Company with an owner (oldest login) and colleagues with the given roles (null = STANDARD, no row). */
const setup = async (roles: (string | null)[]) => {
  const owner = await asCompany('ACTIVE', { email: `${uniq('owner')}@test.local` });
  await prisma.user.update({ where: { id: owner.user.id }, data: { createdAt: new Date(Date.now() - 60 * MINUTE) } });
  const members = [];
  for (const [i, role] of roles.entries()) {
    const u = await createUser({ firstName: `M${i}`, lastName: 'Kollege', locale: 'de', role: 'COMPANY', email: `${uniq('m')}@test.local` });
    await prisma.user.update({ where: { id: u.user.id }, data: { companyId: owner.company.id, createdAt: new Date(Date.now() - (30 - i) * MINUTE) } });
    if (role) await prisma.companyMemberAccess.create({ data: { userId: u.user.id, companyId: owner.company.id, role } });
    members.push({ user: u.user, agent: sessionAgent(u.token) });
  }
  return { owner, members };
};

const sentContract = async (companyId: string, caseId: string, userId: string, title = 'Arbeitsvertrag') =>
  prisma.signatureRequest.create({
    data: {
      title,
      caseId,
      companyId,
      status: 'SENT',
      isCaseContract: true,
      sentAt: new Date(),
      originalName: 'vertrag.pdf',
      originalKey: uniq('orig-'),
      originalSha256: 'a'.repeat(64),
      originalSize: 100,
      originalPages: 1,
      signers: { create: [{ role: 'COMPANY', userId, name: 'Kollege', email: 'k@test.local', order: 1 }] },
    },
    include: { signers: true },
  });

describe('existing employer logins are unchanged', () => {
  it('owner and STANDARD colleagues keep full access; only the owner manages the team', async () => {
    const { owner, members } = await setup([null]);
    const [colleague] = members;
    expect((await owner.agent.get('/api/company/access/me')).body).toMatchObject({ role: 'OWNER', isOwner: true });
    const me = (await colleague.agent.get('/api/company/access/me')).body;
    expect(me.role).toBe('STANDARD');
    expect(Object.entries(me.permissions).filter(([, v]) => !v).map(([k]) => k)).toEqual(['manageTeam']);

    await createVacancy({ companyId: owner.company.id });
    const vac = await colleague.agent.get('/api/company/vacancies');
    expect(vac.status).toBe(200);
    expect(JSON.stringify(vac.body)).toContain('salaryMin');
    for (const url of ['/api/company/invoices', '/api/company/forms', '/api/company/workers', '/api/company/pipeline', '/api/company/pool']) {
      expect((await colleague.agent.get(url)).status, url).toBe(200);
    }
    expect((await colleague.agent.post('/api/company/team').send({ email: 'x@firma.de', firstName: 'X', lastName: 'Y' })).body.error).toBe('NOT_COMPANY_OWNER');
    expect(await prisma.companyMemberAccess.count()).toBe(0);
  });
});

describe('restricted roles are enforced on the server', () => {
  it('VIEWER: no salaries, cannot sign EzB / AVV, no invoices, no worker documents; sees workers and pipeline', async () => {
    const { owner, members } = await setup(['VIEWER']);
    const [viewer] = members;
    await createVacancy({ companyId: owner.company.id, salaryMin: 2777, salaryMax: 3333 });

    const vac = await viewer.agent.get('/api/company/vacancies');
    expect(vac.status).toBe(200);
    const raw = JSON.stringify(vac.body);
    expect(raw).not.toContain('2777');
    expect(raw).not.toContain('salaryMin');

    for (const [method, url] of [
      ['post', '/api/company/avv/sign'],
      ['post', '/api/company/avv/preview'],
      ['post', '/api/company/forms/abcdefgh12/submit'],
      ['get', '/api/company/forms'],
      ['get', '/api/company/invoices'],
      ['get', '/api/company/quotes'],
      ['post', '/api/company/vacancies'],
      ['patch', '/api/company/me'],
      ['get', '/api/company/workers/abcdefgh12/documents/form/abcdefgh12'],
    ] as const) {
      const res = await viewer.agent[method](url).send({});
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.error).toBe('COMPANY_PERMISSION_REQUIRED');
    }
    expect((await viewer.agent.get('/api/company/workers')).status).toBe(200);
    expect((await viewer.agent.get('/api/company/pipeline')).status).toBe(200);
    expect((await viewer.agent.get('/api/company/dashboard')).status).toBe(200);
  });

  it('VIEWER cannot open or sign a contract sent to them; it is not even listed', async () => {
    const { owner, members } = await setup(['VIEWER']);
    const [viewer] = members;
    const cand = await asCandidate();
    const kase = await prisma.case.create({ data: { number: uniq('TV-'), clientId: cand.user.id, profession: 'Koch', companyId: owner.company.id } });
    const sig = await sentContract(owner.company.id, kase.id, viewer.user.id, 'Arbeitsvertrag Geheim');
    const list = await viewer.agent.get('/api/signatures/my');
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([]);
    expect((await viewer.agent.get(`/api/signatures/my/${sig.signers[0].id}`)).status).toBe(403);
    expect((await viewer.agent.post(`/api/signatures/my/${sig.signers[0].id}/sign`).send({ mode: 'TYPE', typedName: 'X' })).status).toBe(403);
    // The worker panel does not show the contract either.
    expect(JSON.stringify((await viewer.agent.get('/api/company/workers')).body)).not.toContain('Arbeitsvertrag Geheim');
  });

  it('HR fills the EzB and handles requests but cannot manage the team', async () => {
    const { members } = await setup(['HR', 'VIEWER']);
    const [hr, viewer] = members;
    expect((await hr.agent.get('/api/company/forms')).status).toBe(200);
    expect((await hr.agent.get('/api/company/forms/kldb?q=fahrer')).status).toBe(200);
    expect((await hr.agent.get('/api/company/requests')).status).toBe(200);
    expect((await hr.agent.get('/api/company/pool')).status).toBe(200);
    const invite = await hr.agent.post('/api/company/team').send({ email: `${uniq('x')}@firma.de`, firstName: 'X', lastName: 'Y' });
    expect(invite.status).toBe(403);
    expect((await hr.agent.patch(`/api/company/team/${viewer.user.id}/role`).send({ role: 'ADMIN' })).status).toBe(403);
    expect((await hr.agent.delete(`/api/company/team/${viewer.user.id}`)).status).toBe(403);
    expect((await hr.agent.post('/api/company/avv/sign').send({})).status).toBe(403);
    expect((await hr.agent.get('/api/company/invoices')).status).toBe(403);
    const team = (await hr.agent.get('/api/company/team')).body;
    expect(team.canManage).toBe(false);
  });

  it('MANAGER sees the pipeline and ticks the arrival checklist, but no contracts, salaries or documents', async () => {
    const { owner, members } = await setup(['MANAGER']);
    const [manager] = members;
    const cand = await asCandidate();
    const kase = await prisma.case.create({ data: { number: uniq('TV-'), clientId: cand.user.id, profession: 'Koch', companyId: owner.company.id } });
    await sentContract(owner.company.id, kase.id, owner.user.id, 'Arbeitsvertrag Koch');
    expect((await manager.agent.get('/api/company/pipeline')).status).toBe(200);
    const detail = await manager.agent.get(`/api/company/workers/${kase.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.documents).toEqual([]);
    expect(JSON.stringify(detail.body)).not.toContain('Arbeitsvertrag Koch');
    expect((await manager.agent.get(`/api/company/workers/${kase.id}/documents/signature/abcdefgh12`)).status).toBe(403);
    expect((await manager.agent.get('/api/company/avv')).status).toBe(403);
    expect((await manager.agent.get('/api/company/forms')).status).toBe(403);
    // Checklist writes pass the role check (the worker itself is not eligible yet → not a 403).
    expect((await manager.agent.post(`/api/company/workers/${kase.id}/checklist`).send({ label: 'Schlüssel' })).status).not.toBe(403);
  });

  it('cross-company isolation is unchanged for every role', async () => {
    const a = await setup(['HR']);
    const b = await asCompany();
    const cand = await asCandidate();
    const foreign = await prisma.case.create({ data: { number: uniq('TV-'), clientId: cand.user.id, profession: 'Koch', companyId: b.company.id } });
    expect((await a.members[0].agent.get(`/api/company/workers/${foreign.id}`)).status).toBe(404);
    expect((await a.owner.agent.get(`/api/company/workers/${foreign.id}`)).status).toBe(404);
    expect((await a.owner.agent.patch(`/api/company/team/${b.user.id}/role`).send({ role: 'VIEWER' })).status).toBe(404);
  });
});

describe('team roles in the portal', () => {
  it('the owner assigns roles (audited); ADMIN manages colleagues but never the owner', async () => {
    const { owner, members } = await setup([null, null]);
    const [m1, m2] = members;
    expect((await owner.agent.patch(`/api/company/team/${m1.user.id}/role`).send({ role: 'ADMIN' })).body).toMatchObject({ role: 'ADMIN' });
    expect((await owner.agent.patch(`/api/company/team/${m1.user.id}/role`).send({ role: 'OWNER' })).status).toBe(400);
    const log = await prisma.auditLog.findFirst({ where: { action: 'COMPANY_ACCESS_CHANGED', target: `user:${m1.user.id}` } });
    expect(log?.details).toMatchObject({ before: { role: null }, after: { role: 'ADMIN' }, source: 'PORTAL' });

    // ADMIN (not the owner) may now manage the team …
    expect((await m1.agent.patch(`/api/company/team/${m2.user.id}/role`).send({ role: 'VIEWER' })).status).toBe(200);
    const team = (await m1.agent.get('/api/company/team')).body;
    expect(team.canManage).toBe(true);
    expect(team.members.find((m: { id: string }) => m.id === m2.user.id).role).toBe('VIEWER');
    // … but not the owner, and not itself.
    expect((await m1.agent.patch(`/api/company/team/${owner.user.id}/role`).send({ role: 'VIEWER' })).body.error).toBe('CANNOT_CHANGE_OWNER');
    expect((await m1.agent.delete(`/api/company/team/${owner.user.id}`)).body.error).toBe('CANNOT_CHANGE_OWNER');
    expect((await m1.agent.patch(`/api/company/team/${m1.user.id}/role`).send({ role: 'VIEWER' })).body.error).toBe('CANNOT_CHANGE_SELF');
    // The viewer is restricted right away; back to STANDARD restores today's access (row removed).
    expect((await m2.agent.get('/api/company/invoices')).status).toBe(403);
    expect((await owner.agent.patch(`/api/company/team/${m2.user.id}/role`).send({ role: 'STANDARD' })).status).toBe(200);
    expect(await prisma.companyMemberAccess.findUnique({ where: { userId: m2.user.id } })).toBeNull();
    expect((await m2.agent.get('/api/company/invoices')).status).toBe(200);
  });

  it('an invitation can carry a role', async () => {
    const { owner } = await setup([]);
    const res = await owner.agent.post('/api/company/team').send({ email: `${uniq('hr')}@firma.de`, firstName: 'H', lastName: 'R', role: 'HR' });
    expect(res.status).toBe(201);
    expect(res.body.member.role).toBe('HR');
    expect((await prisma.companyMemberAccess.findUnique({ where: { userId: res.body.member.id } }))?.role).toBe('HR');
  });
});

describe('Access Center › Employers (SUPER_ADMIN)', () => {
  it('lists members, sets roles and per-user overrides (audited); ADMIN and employers are refused', async () => {
    const { owner, members } = await setup(['VIEWER']);
    const [viewer] = members;
    const sa = await asSuperAdmin();
    const admin = await asAdmin();
    expect((await admin.agent.get('/api/admin/access/employers/companies')).status).toBe(403);
    expect((await owner.agent.get('/api/admin/access/employers/companies')).status).toBe(403);

    const list = await sa.agent.get(`/api/admin/access/employers/companies?q=${encodeURIComponent(owner.company.name)}`);
    expect(list.body.items[0]).toMatchObject({ id: owner.company.id, members: 2, withRole: 1 });
    const mem = (await sa.agent.get(`/api/admin/access/employers/companies/${owner.company.id}/members`)).body.members;
    expect(mem.map((m: { role: string; isOwner: boolean }) => [m.role, m.isOwner])).toEqual([
      ['STANDARD', true],
      ['VIEWER', false],
    ]);

    await createVacancy({ companyId: owner.company.id, salaryMin: 2777 });
    expect(JSON.stringify((await viewer.agent.get('/api/company/vacancies')).body)).not.toContain('2777');
    const patched = await sa.agent.patch(`/api/admin/access/employers/members/${viewer.user.id}`).send({ role: 'VIEWER', overrides: { viewSalaries: true } });
    expect(patched.status).toBe(200);
    expect(patched.body.permissions.viewSalaries).toBe(true);
    expect(JSON.stringify((await viewer.agent.get('/api/company/vacancies')).body)).toContain('2777');
    const log = await prisma.auditLog.findFirst({ where: { action: 'COMPANY_ACCESS_CHANGED', target: `user:${viewer.user.id}` }, orderBy: { createdAt: 'desc' } });
    expect(log?.details).toMatchObject({ source: 'ACCESS_CENTER', before: { role: 'VIEWER', overrides: {} }, after: { role: 'VIEWER', overrides: { viewSalaries: true } } });

    // The owner keeps everything whatever is stored.
    await sa.agent.patch(`/api/admin/access/employers/members/${owner.user.id}`).send({ role: 'VIEWER' });
    expect((await owner.agent.get('/api/company/invoices')).status).toBe(200);
    expect((await sa.agent.patch(`/api/admin/access/employers/members/${sa.user.id}`).send({ role: 'VIEWER' })).status).toBe(404);
    expect((await sa.agent.patch(`/api/admin/access/employers/members/${viewer.user.id}`).send({ role: 'VIEWER', overrides: { bogus: true } })).status).toBe(400);
  });
});
