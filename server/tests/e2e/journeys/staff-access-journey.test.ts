import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../../helpers/api';
import { prisma } from '../../helpers/db';
import { clientCase, createCaseVia, expectStatus, uploadRequired } from '../../helpers/workflow';

/**
 * Journey 4 — staff access control (lib/access) as the Access Center sets it up, through the real HTTP API:
 *
 *   a document specialist (template "Sənəd mütəxəssisi", case scope ASSIGNED) reviews the documents of their own
 *   cases, gets OUT_OF_SCOPE everywhere else, opens a foreign case with break-glass (8 hours, audited, admins told);
 *   an accountant ("Mühasib") cannot download case documents but works on the billing; a legacy STAFF user keeps
 *   today's access across a broad sample of the endpoints the admin UI calls.
 */

/** A client case with the initial documents handed in (DOCUMENTS_REVIEW), optionally assigned to a staff member. */
const reviewCase = async (lastName: string, assignedStaffId?: string) => {
  const client = await asClient({ lastName });
  const c = await createCaseVia(client.agent);
  await uploadRequired(client.agent, c.id, 'INITIAL');
  expectStatus(await client.agent.post(`/api/cases/${c.id}/submit`), 200);
  if (assignedStaffId) await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId } });
  const docs = (await clientCase(client.agent, c.id)).requirements.filter((r) => r.stage === 'INITIAL').flatMap((r) => r.documents.map((d) => d.id));
  return { client, c, docs };
};

const templateId = async (sup: Agent, key: string) => {
  const t = (expectStatus(await sup.get('/api/admin/access/staff/templates'), 200).body.templates as { id: string; key: string | null }[]).find((x) => x.key === key);
  if (!t) throw new Error(`no template ${key}`);
  return t.id;
};

const review = (a: Agent, caseId: string, docId: string, status: 'ACCEPTED' | 'REJECTED' = 'ACCEPTED') =>
  a.post(`/api/admin/cases/${caseId}/documents/${docId}/review`).send({ status, ...(status === 'REJECTED' ? { note: 'Oxunmur' } : {}) });

describe('journey: staff access from the Access Center to the daily work', () => {
  it('document specialist with ASSIGNED scope: own cases yes, others OUT_OF_SCOPE, break-glass 8 h', async () => {
    const sup = await asSuperAdmin();
    const spec = await asStaff({ firstName: 'Günel', lastName: 'Sənədova' });
    const mine = await reviewCase('Ownscopeov', spec.user.id);
    const other = await reviewCase('Foreignscopeov');

    // The super admin sets the template and the scope (both audited).
    const documentsTpl = await templateId(sup.agent, 'documents');
    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${spec.user.id}`).send({ templateId: documentsTpl }), 200);
    expectStatus(await sup.agent.put(`/api/admin/access/scope/users/${spec.user.id}`).send({ caseScope: 'ASSIGNED' }), 200);
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_USER_UPDATED', target: `user:${spec.user.id}` } })).toBeGreaterThanOrEqual(1);
    const perms = expectStatus(await spec.agent.get('/api/admin/me/permissions'), 200).body;
    expect(perms).toMatchObject({ caseScope: 'ASSIGNED', template: { key: 'documents' } });
    expect(perms.matrix.documents).toEqual(['view', 'edit', 'delete', 'export']);
    expect(perms.matrix.finance ?? []).toEqual([]);

    // Own case: list, open, review (reject one, accept the rest), download.
    const ids = (expectStatus(await spec.agent.get('/api/admin/cases'), 200).body.items as { id: string }[]).map((x) => x.id);
    expect(ids).toContain(mine.c.id);
    expect(ids).not.toContain(other.c.id);
    expectStatus(await spec.agent.get(`/api/admin/cases/${mine.c.id}`), 200);
    expectStatus(await review(spec.agent, mine.c.id, mine.docs[0], 'REJECTED'), 200);
    for (const d of mine.docs.slice(1)) expectStatus(await review(spec.agent, mine.c.id, d), 200);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: mine.docs[0] } })).status).toBe('REJECTED');
    expect(await prisma.notification.count({ where: { userId: mine.client.user.id, type: 'DOCUMENT_REJECTED' } })).toBe(1);
    expect((await spec.agent.get(`/api/files/${mine.docs[1]}?download=1`)).status).toBe(200);
    // Finance stays closed even on the own case.
    expect((await spec.agent.get(`/api/admin/client-billing/cases/${mine.c.id}`)).status).toBe(403);

    // Another case: OUT_OF_SCOPE for every read, and the review changes nothing.
    for (const url of [`/api/admin/cases/${other.c.id}`, `/api/admin/cases/${other.c.id}/messages`, `/api/files/${other.docs[0]}`, `/api/admin/clients/${other.client.user.id}`]) {
      const res = await spec.agent.get(url);
      expect(res.status, url).toBe(403);
      expect(res.body.error, url).toBe('OUT_OF_SCOPE');
    }
    expect((await review(spec.agent, other.c.id, other.docs[0])).status).toBe(403);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: other.docs[0] } })).status).toBe('PENDING');
    const found = expectStatus(await spec.agent.get('/api/admin/command-search?q=scopeov'), 200).body;
    expect(found.cases.map((x: { id: string }) => x.id)).toEqual([mine.c.id]);

    // Break-glass: a reason, 8 hours, audited, the admins are told; then the case opens.
    expect((await spec.agent.post('/api/admin/access/break-glass').send({ caseId: other.c.id, reason: 'short' })).status).toBe(400);
    const glass = expectStatus(await spec.agent.post('/api/admin/access/break-glass').send({ caseId: other.c.id, reason: 'Müştəri indi səfirlikdədir, sənəd lazımdır' }), 201).body;
    expect(glass.hours).toBe(8);
    const hours = (new Date(glass.grant.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(7.9);
    expect(hours).toBeLessThanOrEqual(8);
    expectStatus(await spec.agent.get(`/api/admin/cases/${other.c.id}`), 200);
    expect((await spec.agent.get(`/api/files/${other.docs[0]}`)).status).toBe(200);
    expect((expectStatus(await spec.agent.get('/api/admin/cases'), 200).body.items as { id: string }[]).map((x) => x.id)).toContain(other.c.id);
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_BREAK_GLASS', target: `case:${other.c.id}`, actorId: spec.user.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: sup.user.id, type: 'ACCESS_BREAK_GLASS' } })).toBe(1);
    // A second request while one is open is refused; once revoked the case is closed again.
    expect((await spec.agent.post('/api/admin/access/break-glass').send({ caseId: other.c.id, reason: 'Müştəri indi səfirlikdədir, sənəd lazımdır' })).status).toBe(409);
    const grants = expectStatus(await sup.agent.get('/api/admin/access/scope/break-glass'), 200).body.grants as { id: string; active: boolean }[];
    expect(grants).toHaveLength(1);
    expectStatus(await sup.agent.post(`/api/admin/access/scope/break-glass/${grants[0].id}/revoke`), 200);
    expect((await spec.agent.get(`/api/admin/cases/${other.c.id}`)).status).toBe(403);
  }, 120_000);

  it('accountant ("Mühasib"): billing yes, case documents no; back to legacy restores today', async () => {
    const sup = await asSuperAdmin();
    const acc = await asStaff({ firstName: 'Kamilə', lastName: 'Hesabova' });
    const { c, docs } = await reviewCase('Muhasibov');
    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${acc.user.id}`).send({ templateId: await templateId(sup.agent, 'accountant') }), 200);

    const dl = await acc.agent.get(`/api/files/${docs[0]}?download=1`);
    expect(dl.status).toBe(403);
    expect(dl.body).toMatchObject({ error: 'NO_PERMISSION', area: 'documents', action: 'export' });
    expect((await acc.agent.get(`/api/files/${docs[0]}`)).status).toBe(403);
    expect((await review(acc.agent, c.id, docs[0])).status).toBe(403);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: docs[0] } })).status).toBe('PENDING');
    expect((await acc.agent.get(`/api/admin/client-billing/cases/${c.id}`)).status).toBe(200);
    expect((await acc.agent.get(`/api/admin/cases/${c.id}`)).status).toBe(200); // cases: view
    expect((await acc.agent.patch(`/api/admin/cases/${c.id}`).send({ staffNote: 'x' })).status).toBe(403); // no cases: edit
    expect((await acc.agent.get('/api/admin/me/nav')).status).toBe(200);

    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${acc.user.id}`).send({ templateId: null, overrides: [] }), 200);
    expect((await acc.agent.get(`/api/files/${docs[0]}?download=1`)).status).toBe(200);
    expectStatus(await review(acc.agent, c.id, docs[0]), 200);
  }, 120_000);

  it('legacy STAFF keeps today’s access across the endpoints the admin UI calls', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const { c, docs, client } = await reviewCase('Legacyjourneyov');

    const perms = expectStatus(await staff.agent.get('/api/admin/me/permissions'), 200).body;
    expect(perms).toMatchObject({ superAdmin: false, caseScope: 'ALL', manageAccess: false, template: { key: 'legacy_staff' } });
    for (const actions of Object.values(perms.matrix as Record<string, string[]>)) expect(actions).toEqual(['view', 'edit', 'delete', 'export']);

    const staffOk = [
      '/api/admin/me/nav',
      '/api/admin/access/me',
      '/api/admin/dashboard',
      '/api/admin/cases',
      '/api/admin/cases/summary',
      `/api/admin/cases/${c.id}`,
      `/api/admin/cases/${c.id}/messages`,
      `/api/admin/cases/${c.id}/official-forms`,
      `/api/admin/clients/${client.user.id}`,
      `/api/admin/client-billing/cases/${c.id}`,
      `/api/admin/case-contracts/cases/${c.id}`,
      '/api/admin/inquiries',
      '/api/admin/users',
      '/api/admin/users/staff',
      '/api/admin/review/queue',
      '/api/admin/inbox',
      '/api/admin/command-search?q=Legacyjourneyov',
      '/api/admin/candidates',
      '/api/admin/companies',
      '/api/admin/vacancies',
      '/api/admin/vacancies/policy',
      '/api/admin/vacancies/waitlist',
      '/api/admin/arrivals',
      '/api/admin/register',
      `/api/files/${docs[0]}`,
      `/api/files/${docs[0]}?download=1`,
      '/api/tasks',
      '/api/drive/roots',
    ];
    const adminOnly = ['/api/admin/content/services', '/api/admin/settings', '/api/admin/invoices', '/api/admin/client-billing/invoices', '/api/admin/reports/datasets'];
    for (const url of staffOk) expect((await staff.agent.get(url)).status, `STAFF ${url}`).toBe(200);
    for (const url of adminOnly) expect((await staff.agent.get(url)).status, `STAFF ${url}`).toBe(403);
    for (const url of [...staffOk, ...adminOnly]) expect((await admin.agent.get(url)).status, `ADMIN ${url}`).toBe(200);
    // Writes the daily work needs.
    expectStatus(await review(staff.agent, c.id, docs[0]), 200);
    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/messages`).send({ body: 'Sənədləriniz yoxlanılır.' }), 201);
    // The Access Center itself stays SUPER_ADMIN-only.
    expect((await staff.agent.get('/api/admin/access/staff/users')).status).toBe(403);
    expect((await admin.agent.get('/api/admin/access/staff/templates')).status).toBe(403);
    expect(await prisma.staffAccess.count()).toBe(0); // nothing was written for the legacy users
  }, 120_000);
});
