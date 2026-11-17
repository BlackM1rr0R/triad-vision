import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { anon, asAdmin, asClient, asSuperAdmin, loginAgent, ORIGIN, sessionAgent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createUser, TEST_PASSWORD, uniq } from '../helpers/factories';
import { binaryParser, makePdf, PDF } from '../helpers/files';
import { clientCase, createCaseVia, expectStatus } from '../helpers/workflow';
import { issueSession } from '../../src/middleware/auth.js';
import { syncPartnerFolder } from '../../src/lib/drive/caseFolders.js';
import { resetLoginGuard } from '../../src/lib/loginGuard.js';

/**
 * Access Center: per-partner portal permissions, partner team members, partner drive isolation and login security
 * (lib/partnerAccess, lib/loginSecurity). Defaults must equal today's behaviour.
 */

beforeEach(() => {
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'private'), { recursive: true });
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'public'), { recursive: true });
  resetLoginGuard();
});

/** A partner created like the settlement import / older code does it (no PartnerAccess row) with a portal login. */
const asPartner = async (name = uniq('Partner ')) => {
  const u = await createUser({ role: 'AGENT', firstName: 'Ilqar', lastName: 'Mammadov', locale: 'en' });
  const partner = await prisma.referralPartner.create({ data: { name, userId: u.user.id, commissionCents: 10000 } });
  return { ...u, partner, agent: sessionAgent(u.token) };
};

const partnerCase = async (admin: Awaited<ReturnType<typeof asAdmin>>, partnerId: string) => {
  const client = await asClient({ firstName: 'Ayan', lastName: 'Quliyeva' });
  const c = await createCaseVia(client.agent);
  expectStatus(await admin.agent.patch('/api/admin/partners/assign').send({ caseIds: [c.id], partnerId }), 200);
  return { client, case: c };
};

const setTemplate = async (su: Awaited<ReturnType<typeof asSuperAdmin>>, partnerId: string, template: string, perms?: Record<string, unknown>) =>
  expectStatus(await su.agent.put(`/api/admin/access/partners/${partnerId}/permissions`).send({ template, ...(perms ? { perms } : {}) }), 200).body;

describe('partner permissions: legacy partners are unchanged', () => {
  it('a partner without a permission row keeps today’s portal (stage, checklist with own uploads, upload, commissions)', async () => {
    const admin = await asAdmin();
    const p = await asPartner();
    const { client, case: c } = await partnerCase(admin, p.partner.id);
    const me = expectStatus(await p.agent.get('/api/partner/me'), 200).body;
    expect(me.access).toMatchObject({ role: 'OWNER', template: 'LEGACY', permissions: { clientList: 'masked', documents: 'upload', drive: 'none', messaging: false, vacancies: false } });
    expect(me.partner.commissionCents).toBe(10000);

    const req = (await clientCase(client.agent, c.id)).requirements.find((r) => r.stage === 'INITIAL' && r.required)!;
    expectStatus(await p.agent.post(`/api/partner/cases/${c.id}/documents`).field('requirementId', req.id).attach('file', await makePdf('p'), { filename: 'partner-upload.pdf', ...PDF }), 201);
    const d = expectStatus(await p.agent.get(`/api/partner/cases/${c.id}`), 200).body.case;
    expect(d).toMatchObject({ status: 'DOCUMENTS_PENDING', step: 'DOCUMENTS', uploadStage: 'INITIAL' });
    expect(d.requirements.find((r: { id: string }) => r.id === req.id)).toMatchObject({ documentCount: 1, canUpload: true, myUploads: [expect.objectContaining({ name: 'partner-upload.pdf' })] });
    expect(d.requirements[0].files).toBeUndefined();
    expectStatus(await p.agent.get('/api/partner/commissions'), 200);
    expectStatus(await p.agent.get('/api/partner/clients'), 200);
    // Areas that did not exist before stay closed for legacy partners.
    expect((await p.agent.get('/api/partner/drive')).status).toBe(403);
    expect((await p.agent.get('/api/partner/messages')).status).toBe(403);
    expect((await p.agent.get('/api/partner/vacancies')).status).toBe(403);
    // Only the owner manages the team.
    expectStatus(await p.agent.get('/api/partner/team'), 200);
  });
});

describe('partner permissions: STATUS-only partners', () => {
  it('see complete / missing per requirement only: no file names, no upload, no download', async () => {
    const admin = await asAdmin();
    const su = await asSuperAdmin();
    const p = await asPartner();
    const { client, case: c } = await partnerCase(admin, p.partner.id);
    const req = (await clientCase(client.agent, c.id)).requirements.find((r) => r.stage === 'INITIAL' && r.required)!;
    const up = expectStatus(await p.agent.post(`/api/partner/cases/${c.id}/documents`).field('requirementId', req.id).attach('file', await makePdf('p'), { filename: 'partner-upload.pdf', ...PDF }), 201);

    // ADMIN without "manage access" cannot change it; the super admin can (audited before → after).
    expect((await admin.agent.put(`/api/admin/access/partners/${p.partner.id}/permissions`).send({ template: 'DEFAULT' })).status).toBe(403);
    await setTemplate(su, p.partner.id, 'DEFAULT');
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'ACCESS_PARTNER_PERMISSIONS_CHANGED', target: `partner:${p.partner.id}` } });
    expect(log.details).toMatchObject({ before: { template: 'LEGACY' }, after: { template: 'DEFAULT', perms: { documents: 'status' } } });

    const detail = expectStatus(await p.agent.get(`/api/partner/cases/${c.id}`), 200);
    expect(JSON.stringify(detail.body)).not.toContain('partner-upload.pdf');
    const r = detail.body.case.requirements.find((x: { id: string }) => x.id === req.id);
    expect(r).toMatchObject({ state: 'UPLOADED', documentCount: null, myUploads: [], canUpload: false, rejectionReason: null });
    expect(r.files).toBeUndefined();
    const again = await p.agent.post(`/api/partner/cases/${c.id}/documents`).field('requirementId', req.id).attach('file', await makePdf('q'), { filename: 'q.pdf', ...PDF });
    expect(again.status).toBe(403);
    expect(again.body.error).toBe('PARTNER_PERMISSION_DENIED');
    expect((await p.agent.get(`/api/partner/cases/${c.id}/documents/${up.body.document.id}/file`)).status).toBe(403);

    // Full cooperation: every file name and the download.
    await setTemplate(su, p.partner.id, 'FULL');
    const full = expectStatus(await p.agent.get(`/api/partner/cases/${c.id}`), 200).body.case;
    expect(full.requirements.find((x: { id: string }) => x.id === req.id).files).toEqual([expect.objectContaining({ id: up.body.document.id, name: 'partner-upload.pdf' })]);
    const file = await p.agent.get(`/api/partner/cases/${c.id}/documents/${up.body.document.id}/file`).buffer(true).parse(binaryParser);
    expect(file.status).toBe(200);
    expect((file.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    // Another partner's case stays invisible even with download rights.
    const other = await asPartner();
    await setTemplate(su, other.partner.id, 'FULL');
    expect((await other.agent.get(`/api/partner/cases/${c.id}/documents/${up.body.document.id}/file`)).status).toBe(404);
  });

  it('new partners created in the admin panel start with the DEFAULT set; the visibility field still moves the client list', async () => {
    const admin = await asAdmin();
    const su = await asSuperAdmin();
    const created = expectStatus(await admin.agent.post('/api/admin/partners').send({ name: uniq('New ') }), 201).body.partner;
    const row = expectStatus(await su.agent.get(`/api/admin/access/partners/${created.id}`), 200).body;
    expect(row).toMatchObject({ template: 'DEFAULT', perms: { clientList: 'masked', documents: 'status', drive: 'view', messaging: true, vacancies: true } });
    expectStatus(await admin.agent.patch(`/api/admin/partners/${created.id}`).send({ visibility: 'EXTENDED' }), 200);
    const after = expectStatus(await su.agent.get(`/api/admin/access/partners/${created.id}`), 200).body;
    expect(after).toMatchObject({ template: 'CUSTOM', perms: { clientList: 'full', documents: 'status' } });
    // The list for the Access Center (ADMIN without manage access: 403).
    expect((await admin.agent.get('/api/admin/access/partners')).status).toBe(403);
    expect(expectStatus(await su.agent.get('/api/admin/access/partners'), 200).body.items.find((i: { id: string }) => i.id === created.id)).toMatchObject({ template: 'CUSTOM' });
    const preview = expectStatus(await su.agent.get(`/api/admin/access/partners/${created.id}/preview`).query({ template: 'REFERRER' }), 200).body;
    expect(preview.areas).toMatchObject({ clients: true, drive: false, messages: true });
  });
});

describe('partner team members', () => {
  it('a member never gets more than the partner, cannot manage the team and loses access when deactivated', async () => {
    const admin = await asAdmin();
    const su = await asSuperAdmin();
    const p = await asPartner();
    const { case: c } = await partnerCase(admin, p.partner.id);
    await setTemplate(su, p.partner.id, 'DEFAULT');
    const tooMuch = { clientList: 'full', caseStage: true, documents: 'download', payments: true, addClients: true, messaging: true, vacancies: true, drive: 'upload' };
    const refused = await p.agent.post('/api/partner/team').send({ email: 'member@test.local', firstName: 'Nigar', perms: tooMuch });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('PERMS_EXCEED_PARTNER');

    const perms = { clientList: 'masked', caseStage: true, documents: 'status', payments: false, addClients: false, messaging: true, vacancies: false, drive: 'none' };
    const invited = expectStatus(await p.agent.post('/api/partner/team').send({ email: 'member@test.local', firstName: 'Nigar', perms }), 201).body.member;
    expect(invited).toMatchObject({ email: 'member@test.local', perms, active: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'member@test.local' } });
    expect(user.role).toBe('AGENT');
    expect(await prisma.auditLog.count({ where: { action: 'PARTNER_MEMBER_INVITED', target: `partner:${p.partner.id}` } })).toBe(1);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);

    const m = sessionAgent((await issueSession(user.id, { client: 'web' })).token);
    const me = expectStatus(await m.get('/api/partner/me'), 200).body;
    expect(me.access).toMatchObject({ role: 'MEMBER', permissions: perms });
    expect(me.partner.commissionCents).toBeNull();
    expectStatus(await m.get(`/api/partner/cases/${c.id}`), 200);
    expect((await m.get('/api/partner/commissions')).status).toBe(403);
    expect((await m.get('/api/partner/team')).body.error).toBe('PARTNER_OWNER_ONLY');
    expect((await m.get('/api/partner/profile')).body.error).toBe('PARTNER_OWNER_ONLY');
    expect((await m.post('/api/partner/clients').send({})).status).toBe(403);

    // The partner's own set shrinks: the member is capped at once (saved set untouched).
    const put = await setTemplate(su, p.partner.id, 'REFERRER');
    expect(put.membersCapped).toEqual([invited.id]); // saved 'status' > the partner's 'none': capped, shown in the UI
    expect((await m.get('/api/partner/me')).body.access.permissions.documents).toBe('none');
    expect((await m.get(`/api/partner/cases/${c.id}`)).body.case.requirements).toEqual([]);

    // Staff manage members too (partners:edit); deactivation logs the member out everywhere.
    expectStatus(await admin.agent.patch(`/api/admin/access/partners/${p.partner.id}/members/${invited.id}`).send({ active: false }), 200);
    expect((await m.get('/api/partner/me')).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: 'PARTNER_MEMBER_DEACTIVATED' } })).toBe(1);
    // Another partner cannot touch this member.
    const other = await asPartner();
    expect((await other.agent.patch(`/api/partner/team/${invited.id}`).send({ active: true })).status).toBe(404);
  });
});

describe('partner drive: own folder only', () => {
  it('lists and opens only the partner folder, never client folders or other partners’ folders', async () => {
    const su = await asSuperAdmin();
    const p = await asPartner();
    const other = await asPartner();
    await setTemplate(su, p.partner.id, 'DEFAULT'); // drive: view
    const root = (await syncPartnerFolder(p.partner.id))!;
    const otherRoot = (await syncPartnerFolder(other.partner.id))!;
    const own = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'Müqavilələr', parentId: root } });
    const clientFolder = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'Ayan Quliyeva · C123', parentId: root } });
    const c = await asClient();
    await prisma.case.create({ data: { number: uniq('TV-'), clientId: c.user.id, profession: 'X', partnerId: p.partner.id, driveFolderId: clientFolder.id } });
    const secret = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FILE', name: 'pasport.pdf', parentId: clientFolder.id, storageKey: uniq('k'), mimeType: 'application/pdf', size: 1 } });
    const foreign = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FILE', name: 'foreign.pdf', parentId: otherRoot, storageKey: uniq('k'), mimeType: 'application/pdf', size: 1 } });

    const list = expectStatus(await p.agent.get('/api/partner/drive'), 200).body;
    expect(list.rootId).toBe(root);
    expect(list.items.map((i: { id: string }) => i.id)).toEqual([own.id]);
    expect(list.canUpload).toBe(false);
    expect((await p.agent.get('/api/partner/drive').query({ folder: clientFolder.id })).status).toBe(404);
    expect((await p.agent.get(`/api/partner/drive/files/${secret.id}`)).status).toBe(404);
    expect((await p.agent.get(`/api/partner/drive/files/${foreign.id}`)).status).toBe(404);
    expect((await p.agent.get('/api/partner/drive').query({ folder: otherRoot })).status).toBe(404);
    // The staff drive API stays closed for partners.
    expect((await p.agent.get(`/api/drive/nodes/${root}`)).status).toBe(403);

    const view = await p.agent.post('/api/partner/drive/files').attach('file', await makePdf('x'), { filename: 'x.pdf', ...PDF });
    expect(view.status).toBe(403);
    await setTemplate(su, p.partner.id, 'DOCUMENTS'); // drive: upload
    const up = expectStatus(await p.agent.post(`/api/partner/drive/files?folder=${own.id}`).attach('file', await makePdf('x'), { filename: 'Hesab.pdf', ...PDF }), 201).body.item;
    expect(up.name).toBe('Hesab.pdf');
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: up.id } })).parentId).toBe(own.id);
    // Never into a client folder.
    expect((await p.agent.post(`/api/partner/drive/files?folder=${clientFolder.id}`).attach('file', await makePdf('y'), { filename: 'y.pdf', ...PDF })).status).toBe(404);
    const file = await p.agent.get(`/api/partner/drive/files/${up.id}?download=1`).buffer(true).parse(binaryParser);
    expect(file.status).toBe(200);
  });
});

describe('login security', () => {
  const login = (email: string) => anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email, password: TEST_PASSWORD });

  it('defaults: partners do not need 2FA; staff 2FA can never be switched off', async () => {
    const su = await asSuperAdmin();
    const p = await asPartner();
    const me = expectStatus(await p.agent.get('/api/auth/me'), 200).body.user;
    expect(me.twoFactorRequired).toBe(false);
    expect(me.twoFactorSetupNeeded).toBeUndefined();
    expectStatus(await p.agent.get('/api/partner/me'), 200);
    for (const role of ['STAFF', 'ADMIN', 'SUPER_ADMIN']) {
      const res = await su.agent.put(`/api/admin/access/login-security/roles/${role}`).send({ require2fa: false });
      expect(res.body.error).toBe('STAFF_2FA_LOCKED');
    }
    expect((await su.agent.put(`/api/admin/access/login-security/users/${su.user.id}`).send({ require2fa: false })).body.error).toBe('STAFF_2FA_LOCKED');
    expect((await su.agent.put('/api/admin/access/login-security/roles/COMPANY').send({ requireActiveContract: true })).status).toBe(400);
    const admin = await asAdmin();
    expect((await admin.agent.get('/api/admin/access/login-security')).status).toBe(403);
  });

  it('2FA for AGENT when switched on: the partner logs in, is guided to the set-up, and gets in once a factor exists', async () => {
    const su = await asSuperAdmin();
    const p = await asPartner();
    expectStatus(await su.agent.put('/api/admin/access/login-security/roles/AGENT').send({ require2fa: true }), 200);
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_LOGIN_SECURITY_ROLE_CHANGED', target: 'role:AGENT' } })).toBe(1);

    const agent = await loginAgent(p.user.email, TEST_PASSWORD); // not locked out
    const me = expectStatus(await agent.get('/api/auth/me'), 200).body.user;
    expect(me).toMatchObject({ twoFactorRequired: true, twoFactorSetupNeeded: true });
    const blocked = await agent.get('/api/partner/me');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('TWO_FACTOR_ENROLLMENT_REQUIRED');
    expect(expectStatus(await agent.get('/api/auth/2fa/status'), 200).body.required).toBe(true);

    // A per-user exemption, then the factor itself.
    expectStatus(await su.agent.put(`/api/admin/access/login-security/users/${p.user.id}`).send({ require2fa: false }), 200);
    expectStatus(await agent.get('/api/partner/me'), 200);
    expectStatus(await su.agent.delete(`/api/admin/access/login-security/users/${p.user.id}`), 200);
    expect((await agent.get('/api/partner/me')).status).toBe(403);
    await prisma.user.update({ where: { id: p.user.id }, data: { emailOtpEnabledAt: new Date() } });
    expectStatus(await agent.get('/api/partner/me'), 200);
    expect((await agent.get('/api/auth/me')).body.user.twoFactorSetupNeeded).toBeUndefined();
  });

  it('session idle timeout and maximum age per role', async () => {
    const su = await asSuperAdmin();
    const p = await asPartner();
    const sixMinutesAgo = new Date(Date.now() - 6 * 60_000);
    await prisma.session.updateMany({ where: { userId: p.user.id }, data: { lastSeenAt: sixMinutesAgo } });
    expectStatus(await p.agent.get('/api/partner/me'), 200); // default idle timeout: longer

    expectStatus(await su.agent.put('/api/admin/access/login-security/roles/AGENT').send({ webIdleMinutes: 5 }), 200);
    const q = await asPartner();
    await prisma.session.updateMany({ where: { userId: q.user.id }, data: { lastSeenAt: sixMinutesAgo } });
    const idle = await q.agent.get('/api/partner/me');
    expect(idle.status).toBe(401);
    expect(idle.body.error).toBe('SESSION_EXPIRED');

    expectStatus(await su.agent.put('/api/admin/access/login-security/roles/AGENT').send({ webIdleMinutes: null, webMaxHours: 1 }), 200);
    const r = await asPartner();
    await prisma.session.updateMany({ where: { userId: r.user.id }, data: { createdAt: new Date(Date.now() - 2 * 3_600_000) } });
    expect((await r.agent.get('/api/partner/me')).status).toBe(401);
    // New sessions get the shorter lifetime (cookie and row).
    const res = expectStatus(await login(r.user.email), 200);
    expect(String(res.headers['set-cookie'])).toContain('Max-Age=3600');
    // Staff sessions keep the server default.
    expect((await su.agent.get('/api/admin/access/login-security')).status).toBe(200);
  });

  it('partner login only while the contract is active (when switched on); off by default', async () => {
    const su = await asSuperAdmin();
    const p = await asPartner();
    await prisma.referralPartner.update({ where: { id: p.partner.id }, data: { active: false } });
    expectStatus(await login(p.user.email), 200); // today: an inactive partner can still log in

    expectStatus(await su.agent.put('/api/admin/access/login-security/roles/AGENT').send({ requireActiveContract: true }), 200);
    const refused = await login(p.user.email);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe('PARTNER_CONTRACT_INACTIVE');
    expect((await p.agent.get('/api/partner/me')).status).toBe(401); // the open session ends too

    const yesterday = new Date(Date.now() - 24 * 3_600_000);
    await prisma.referralPartner.update({ where: { id: p.partner.id }, data: { active: true, contractEnd: new Date(yesterday.toISOString().slice(0, 10)) } });
    expect((await login(p.user.email)).status).toBe(403);
    await prisma.referralPartner.update({ where: { id: p.partner.id }, data: { contractEnd: new Date(new Date().toISOString().slice(0, 10)) } });
    expectStatus(await login(p.user.email), 200);
    // Agent-programme logins without a partner are not affected.
    const lone = await createUser({ role: 'AGENT' });
    expectStatus(await login(lone.user.email), 200);
  });
});
