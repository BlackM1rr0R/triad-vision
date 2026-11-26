import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { clientCase, createCaseVia, expectStatus, uploadDoc } from '../helpers/workflow';

/**
 * Staff access control (lib/access): role templates, per-user overrides, case scope, break-glass, Access Center.
 * Defaults must reproduce today's access exactly.
 */

type Call = [method: 'get' | 'post', url: string, body?: object];

/** A client with a case and one uploaded document; optionally assigned to a staff member. */
const clientWithCase = async (lastName: string, assignedStaffId?: string) => {
  const client = await asClient({ lastName });
  const c = await createCaseVia(client.agent);
  const req = (await clientCase(client.agent, c.id)).requirements[0];
  const doc = expectStatus(await uploadDoc(client.agent, c.id, req.id), 201).body.document as { id: string };
  if (assignedStaffId) await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId } });
  return { client, c, doc };
};

const templateId = async (sup: Agent, key: string) => {
  const res = expectStatus(await sup.get('/api/admin/access/staff/templates'), 200);
  const t = (res.body.templates as { id: string; key: string | null }[]).find((x) => x.key === key);
  if (!t) throw new Error(`no template ${key}`);
  return t.id;
};

describe('defaults = today', () => {
  it('legacy STAFF / ADMIN users keep exactly their access across a broad sample of endpoints', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const { c, doc, client } = await clientWithCase('Legacyov');

    const perms = expectStatus(await staff.agent.get('/api/admin/me/permissions'), 200).body;
    expect(perms).toMatchObject({ superAdmin: false, caseScope: 'ALL', manageAccess: false, template: { key: 'legacy_staff' } });
    for (const actions of Object.values(perms.matrix as Record<string, string[]>)) expect(actions).toEqual(['view', 'edit', 'delete', 'export']);
    expect(expectStatus(await admin.agent.get('/api/admin/me/permissions'), 200).body.template.key).toBe('legacy_admin');

    const staffOk: Call[] = [
      ['get', '/api/admin/dashboard'],
      ['get', '/api/admin/cases'],
      ['get', '/api/admin/cases/summary'],
      ['get', `/api/admin/cases/${c.id}`],
      ['get', `/api/admin/cases/${c.id}/messages`],
      ['get', `/api/admin/clients/${client.user.id}`],
      ['get', '/api/admin/inquiries'],
      ['get', '/api/admin/users'],
      ['get', '/api/admin/users/staff'],
      ['get', '/api/admin/review/queue'],
      ['get', '/api/admin/inbox'],
      ['get', '/api/admin/command-search?q=Legacyov'],
      ['get', `/api/admin/client-billing/cases/${c.id}`],
      ['get', '/api/admin/candidates'],
      ['get', '/api/admin/companies'],
      ['get', `/api/files/${doc.id}`],
      ['get', `/api/files/${doc.id}?download=1`],
      ['get', '/api/tasks'],
    ];
    const adminOnly: Call[] = [
      ['get', '/api/admin/content/services'],
      ['get', '/api/admin/settings'],
      ['get', '/api/admin/invoices'],
      ['get', '/api/admin/client-billing/invoices'],
      ['get', '/api/admin/reports/datasets'],
    ];
    for (const [m, url] of staffOk) expect((await staff.agent[m](url)).status, `STAFF ${url}`).toBe(200);
    for (const [m, url] of adminOnly) expect((await staff.agent[m](url)).status, `STAFF ${url}`).toBe(403);
    for (const [m, url] of [...staffOk, ...adminOnly]) expect((await admin.agent[m](url)).status, `ADMIN ${url}`).toBe(200);

    // every case, including unassigned ones, as today
    const list = expectStatus(await staff.agent.get('/api/admin/cases'), 200).body;
    expect(list.items.map((x: { id: string }) => x.id)).toContain(c.id);
    // the Access Center itself stays SUPER_ADMIN-only by default
    expect((await admin.agent.get('/api/admin/access/staff/templates')).status).toBe(403);
    expect((await staff.agent.get('/api/admin/access/staff/users')).status).toBe(403);
    expect(expectStatus(await staff.agent.get('/api/admin/access/me'), 200).body).toEqual({ canManage: false, superAdmin: false });
  });
});

describe('role templates + overrides', () => {
  it('Mühasib: 403 on case document download, 200 on the case invoices; audit-logged before → after', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    const { c, doc } = await clientWithCase('Muhasibov');

    const accountant = await templateId(sup.agent, 'accountant');
    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({ templateId: accountant }), 200);

    const dl = await staff.agent.get(`/api/files/${doc.id}?download=1`);
    expect(dl.status).toBe(403);
    expect(dl.body).toMatchObject({ error: 'NO_PERMISSION', area: 'documents', action: 'export' });
    expect((await staff.agent.get(`/api/files/${doc.id}`)).status).toBe(403);
    expect((await staff.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'ACCEPTED' })).status).toBe(403);
    expect((await staff.agent.get(`/api/admin/client-billing/cases/${c.id}`)).status).toBe(200);
    expect((await staff.agent.get(`/api/admin/cases/${c.id}`)).status).toBe(200); // cases: view
    expect((await staff.agent.patch(`/api/admin/cases/${c.id}`).send({ staffNote: 'x' })).status).toBe(403); // no cases: edit
    expect((await staff.agent.get('/api/admin/users')).status).toBe(403); // no settings
    expect((await staff.agent.get('/api/admin/users/staff')).status).toBe(200); // staff picker stays
    expect((await staff.agent.get('/api/admin/me/nav')).status).toBe(200);

    const perms = expectStatus(await staff.agent.get('/api/admin/me/permissions'), 200).body;
    expect(perms.template.key).toBe('accountant');
    expect(perms.matrix.documents).toEqual([]);
    expect(perms.matrix.finance).toEqual(['view', 'edit', 'delete', 'export']);

    const log = await prisma.auditLog.findFirst({ where: { action: 'ACCESS_USER_UPDATED', target: `user:${staff.user.id}` } });
    expect(log?.actorId).toBe(sup.user.id);
    expect(log?.details).toMatchObject({ before: null, after: { templateId: accountant, caseScope: 'ALL' } });

    // a per-user grant opens exactly one more action; a deny closes one
    expectStatus(
      await sup.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({
        overrides: [
          { area: 'documents', action: 'view', effect: 'grant' },
          { area: 'finance', action: 'delete', effect: 'deny' },
        ],
      }),
      200,
    );
    expect((await staff.agent.get(`/api/files/${doc.id}`)).status).toBe(200);
    expect((await staff.agent.get(`/api/files/${doc.id}?download=1`)).status).toBe(403);
    const preview = expectStatus(await sup.agent.get(`/api/admin/access/staff/users/${staff.user.id}/preview`), 200).body;
    expect(preview.matrix.documents).toEqual(['view']);
    expect(preview.matrix.finance).toEqual(['view', 'edit', 'export']);

    // back to the legacy template: today's access again
    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({ templateId: null, overrides: [] }), 200);
    expect((await staff.agent.get(`/api/files/${doc.id}?download=1`)).status).toBe(200);
  });

  it('templates: create, edit (all users of it change), reset a built-in one, refuse deleting a used one', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    const created = expectStatus(await sup.agent.post('/api/admin/access/staff/templates').send({ name: { az: 'Yalnız sayt' }, matrix: { content: ['view', 'edit'] } }), 201).body.template;
    expect(created.name).toEqual({ az: 'Yalnız sayt', de: 'Yalnız sayt', en: 'Yalnız sayt', ru: 'Yalnız sayt' });
    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({ templateId: created.id }), 200);
    expect((await staff.agent.get('/api/admin/cases')).status).toBe(403);
    expectStatus(await sup.agent.put(`/api/admin/access/staff/templates/${created.id}`).send({ matrix: { content: ['view'], cases: ['view'] } }), 200);
    expect((await staff.agent.get('/api/admin/cases')).status).toBe(200);
    expect((await sup.agent.delete(`/api/admin/access/staff/templates/${created.id}`)).status).toBe(409);
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_TEMPLATE_UPDATED', target: `staff-template:${created.id}` } })).toBe(1);

    // editing the legacy STAFF template restricts every STAFF user on it; reset restores today's access
    const other = await asStaff();
    const legacy = await templateId(sup.agent, 'legacy_staff');
    expectStatus(await sup.agent.put(`/api/admin/access/staff/templates/${legacy}`).send({ matrix: { cases: ['view'] } }), 200);
    expect((await other.agent.get('/api/admin/inquiries')).status).toBe(403);
    const list = expectStatus(await sup.agent.get('/api/admin/access/staff/templates'), 200).body.templates as { key: string; modified: boolean }[];
    expect(list.find((t) => t.key === 'legacy_staff')?.modified).toBe(true);
    expectStatus(await sup.agent.post(`/api/admin/access/staff/templates/${legacy}/reset`), 200);
    expect((await other.agent.get('/api/admin/inquiries')).status).toBe(200);
    expect((await sup.agent.delete(`/api/admin/access/staff/templates/${legacy}`)).status).toBe(400);
  });
});

describe('case scope', () => {
  it('ASSIGNED hides other cases from the list and search and 403s direct reads', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    const mine = await clientWithCase('Scopeovmine', staff.user.id);
    const other = await clientWithCase('Scopeovother');
    expectStatus(await sup.agent.put(`/api/admin/access/scope/users/${staff.user.id}`).send({ caseScope: 'ASSIGNED' }), 200);

    const ids = (expectStatus(await staff.agent.get('/api/admin/cases'), 200).body.items as { id: string }[]).map((x) => x.id);
    expect(ids).toContain(mine.c.id);
    expect(ids).not.toContain(other.c.id);
    const found = expectStatus(await staff.agent.get('/api/admin/command-search?q=Scopeov'), 200).body;
    expect(found.cases.map((x: { id: string }) => x.id)).toEqual([mine.c.id]);
    expect(found.users.map((x: { id: string }) => x.id)).toEqual([mine.client.user.id]);
    const cands = expectStatus(await staff.agent.get('/api/admin/candidates?search=Scopeov'), 200).body;
    expect(JSON.stringify(cands)).not.toContain(other.client.user.id);

    for (const url of [`/api/admin/cases/${other.c.id}`, `/api/admin/cases/${other.c.id}/messages`, `/api/files/${other.doc.id}`, `/api/admin/clients/${other.client.user.id}`]) {
      const res = await staff.agent.get(url);
      expect(res.status, url).toBe(403);
      expect(res.body.error, url).toBe('OUT_OF_SCOPE');
    }
    expect((await staff.agent.get(`/api/admin/cases/${other.c.id}`)).body.caseId).toBe(other.c.id);
    expect((await staff.agent.get(`/api/admin/cases/${mine.c.id}`)).status).toBe(200);
    expect((await staff.agent.get(`/api/files/${mine.doc.id}`)).status).toBe(200);
    // bulk "all matching" stays inside the scope
    const resolved = expectStatus(await staff.agent.post('/api/admin/bulk/cases/resolve').send({ all: {} }), 200).body;
    expect(resolved.ids).toEqual([mine.c.id]);
  });

  it('TEAM: the cases of every team member', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    const mate = await asStaff();
    const theirs = await clientWithCase('Teamov', mate.user.id);
    const stranger = await clientWithCase('Teamovx');
    expectStatus(await sup.agent.put(`/api/admin/access/scope/users/${staff.user.id}`).send({ caseScope: 'TEAM' }), 200);
    expect((await staff.agent.get(`/api/admin/cases/${theirs.c.id}`)).status).toBe(403); // no team yet
    expectStatus(await sup.agent.post('/api/admin/access/scope/teams').send({ name: 'Bakı ofisi', memberIds: [staff.user.id, mate.user.id] }), 201);
    expect((await staff.agent.get(`/api/admin/cases/${theirs.c.id}`)).status).toBe(200);
    expect((await staff.agent.get(`/api/admin/cases/${stranger.c.id}`)).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_TEAM_CREATED' } })).toBe(1);
  });

  it('break-glass grants temporary access, is audit-logged, notifies admins and can be revoked', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    const other = await clientWithCase('Glassov');
    expectStatus(await sup.agent.put(`/api/admin/access/scope/users/${staff.user.id}`).send({ caseScope: 'ASSIGNED' }), 200);
    expect((await staff.agent.get(`/api/admin/cases/${other.c.id}`)).status).toBe(403);

    expect((await staff.agent.post('/api/admin/access/break-glass').send({ caseId: other.c.id, reason: 'short' })).status).toBe(400);
    const res = expectStatus(await staff.agent.post('/api/admin/access/break-glass').send({ caseId: other.c.id, reason: 'Client is at the embassy right now' }), 201).body;
    expect(res.hours).toBe(8);
    const hours = (new Date(res.grant.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(7.9);
    expect(hours).toBeLessThanOrEqual(8);

    expect((await staff.agent.get(`/api/admin/cases/${other.c.id}`)).status).toBe(200);
    expect((await staff.agent.get(`/api/files/${other.doc.id}`)).status).toBe(200);
    const ids = (expectStatus(await staff.agent.get('/api/admin/cases'), 200).body.items as { id: string }[]).map((x) => x.id);
    expect(ids).toContain(other.c.id);
    // already open: a second request is refused
    expect((await staff.agent.post('/api/admin/access/break-glass').send({ caseId: other.c.id, reason: 'Client is at the embassy right now' })).status).toBe(409);

    const log = await prisma.auditLog.findFirst({ where: { action: 'ACCESS_BREAK_GLASS', target: `case:${other.c.id}` } });
    expect(log?.actorId).toBe(staff.user.id);
    expect(log?.details).toMatchObject({ reason: 'Client is at the embassy right now' });
    expect(await prisma.notification.count({ where: { userId: sup.user.id, type: 'ACCESS_BREAK_GLASS' } })).toBe(1);

    const grants = expectStatus(await sup.agent.get('/api/admin/access/scope/break-glass'), 200).body.grants as { id: string; active: boolean; caseNumber: string }[];
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ active: true, caseNumber: other.c.number });
    expectStatus(await sup.agent.post(`/api/admin/access/scope/break-glass/${grants[0].id}/revoke`), 200);
    expect((await staff.agent.get(`/api/admin/cases/${other.c.id}`)).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_BREAK_GLASS_REVOKED' } })).toBe(1);
  });
});

describe('Access Center guard rails', () => {
  it('SUPER_ADMIN cannot restrict themselves (or another SUPER_ADMIN); managers cannot edit their own access', async () => {
    const sup = await asSuperAdmin();
    const sup2 = await asSuperAdmin();
    const accountant = await templateId(sup.agent, 'accountant');
    for (const id of [sup.user.id, sup2.user.id]) {
      const r1 = await sup.agent.put(`/api/admin/access/staff/users/${id}`).send({ templateId: accountant, overrides: [{ area: 'settings', action: 'view', effect: 'deny' }] });
      expect(r1.status).toBe(400);
      expect(r1.body.error).toBe('SUPER_ADMIN_ALWAYS_FULL');
      expect((await sup.agent.put(`/api/admin/access/scope/users/${id}`).send({ caseScope: 'ASSIGNED' })).status).toBe(400);
    }
    expect(await prisma.staffAccess.count()).toBe(0);
    // still everything
    expect((await sup.agent.get('/api/admin/access/staff/templates')).status).toBe(200);
    const perms = expectStatus(await sup.agent.get('/api/admin/me/permissions'), 200).body;
    expect(perms).toMatchObject({ superAdmin: true, manageAccess: true, caseScope: 'ALL' });

    // "manage access": granted by a SUPER_ADMIN to an ADMIN only; the manager can't touch their own settings
    const admin = await asAdmin();
    const staff = await asStaff();
    expect((await sup.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({ manageAccess: true })).status).toBe(400);
    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${admin.user.id}`).send({ manageAccess: true }), 200);
    expect((await admin.agent.get('/api/admin/access/staff/templates')).status).toBe(200);
    expect(expectStatus(await admin.agent.get('/api/admin/access/me'), 200).body.canManage).toBe(true);
    expect((await admin.agent.put(`/api/admin/access/staff/users/${admin.user.id}`).send({ templateId: accountant })).body.error).toBe('CANNOT_CHANGE_OWN_ACCESS');
    expect((await admin.agent.put(`/api/admin/access/staff/users/${sup.user.id}`).send({ templateId: accountant })).body.error).toBe('SUPER_ADMIN_ALWAYS_FULL');
    const other = await asAdmin();
    expect((await admin.agent.put(`/api/admin/access/staff/users/${other.user.id}`).send({ manageAccess: true })).status).toBe(403);
    expectStatus(await admin.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({ templateId: accountant }), 200);
    // revoked → closed again
    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${admin.user.id}`).send({ manageAccess: false }), 200);
    expect((await admin.agent.get('/api/admin/access/staff/templates')).status).toBe(403);
  });
});

describe('client-level reveals respect case scope', () => {
  it('ASSIGNED staff can reveal the address only of clients with an in-scope case', async () => {
    const sup = await asSuperAdmin();
    const staff = await asStaff();
    const mine = await clientWithCase('Revealscopemine', staff.user.id);
    const other = await clientWithCase('Revealscopeother');
    await prisma.user.update({ where: { id: mine.client.user.id }, data: { address: 'Nizami küç. 1, Bakı' } });
    await prisma.user.update({ where: { id: other.client.user.id }, data: { address: 'Füzuli küç. 2, Bakı' } });
    const reveal = (id: string) => staff.agent.post('/api/admin/reveal').send({ entity: 'clientAddress', id, field: 'address', reason: 'Məktub göndərmək üçün ünvan lazımdır' });

    // Scope ALL (default): both visible, as before.
    expect((await reveal(other.client.user.id)).status).toBe(200);

    expectStatus(await sup.agent.put(`/api/admin/access/scope/users/${staff.user.id}`).send({ caseScope: 'ASSIGNED' }), 200);
    const ok = expectStatus(await reveal(mine.client.user.id), 200).body;
    expect(ok.value).toBe('Nizami küç. 1, Bakı');
    const denied = await reveal(other.client.user.id);
    expect([403, 404]).toContain(denied.status);
    expect(JSON.stringify(denied.body)).not.toContain('Füzuli');
  });
});

describe('GET /api/admin/access/staff/users/:id/preview (effective permissions for the user card panel)', () => {
  it('STAFF cannot read permissions of anyone, an ADMIN without "manage access" neither; the super admin gets the enforced matrix', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const admin = await asAdmin();
    const sup = await asSuperAdmin();
    expectStatus(await staff.agent.get(`/api/admin/access/staff/users/${other.user.id}/preview`), 403);
    expectStatus(await staff.agent.get(`/api/admin/access/staff/users/${staff.user.id}/preview`), 403);
    expectStatus(await admin.agent.get(`/api/admin/access/staff/users/${other.user.id}/preview`), 403);
    const p = expectStatus(await sup.agent.get(`/api/admin/access/staff/users/${other.user.id}/preview`), 200).body;
    expect(p).toMatchObject({ superAdmin: false, caseScope: 'ALL' });
    // defaults reproduce today: a legacy staff member has every action in every area
    for (const actions of Object.values(p.matrix as Record<string, string[]>)) expect(actions).toEqual(['view', 'edit', 'delete', 'export']);
    // a client is not a staff member
    const client = await asClient();
    expectStatus(await sup.agent.get(`/api/admin/access/staff/users/${client.user.id}/preview`), 404);
  });
});
