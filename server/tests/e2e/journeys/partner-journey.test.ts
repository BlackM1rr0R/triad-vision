import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_UPLOADS_DIR } from '../../helpers/testEnv';
import { anon, asAdmin, asStaff, asSuperAdmin, sessionAgent } from '../../helpers/api';
import { prisma, waitFor } from '../../helpers/db';
import { createUser, uniq } from '../../helpers/factories';
import { binaryParser } from '../../helpers/files';
import { clientCase, expectStatus, reviewAll, sendContract, signContract, uploadRequired } from '../../helpers/workflow';
import { registerAndVerify } from '../../helpers/journey';
import { issueSession } from '../../../src/middleware/auth.js';
import { syncPartnerFolder } from '../../../src/lib/drive/caseFolders.js';

/**
 * Journey 2 — a referral partner from the admin panel to the commission, through the real HTTP API:
 *
 *   admin creates the partner (DEFAULT permission set) → a client signs up with the partner's code (/p/CODE puts it
 *   into the sign-up form) → the partner follows the client: masked identity, case stage, documents as STATUS only,
 *   no download → the partner adds a team member (never more than the partner) → partner drive: own folder only →
 *   the super admin upgrades the partner's template → file names + download (the member stays capped) → the
 *   commission is created when the case reaches the partner's trigger (CONTRACT_SIGNED).
 */

beforeEach(() => {
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'private'), { recursive: true });
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'public'), { recursive: true });
});

const setTemplate = async (su: Awaited<ReturnType<typeof asSuperAdmin>>, partnerId: string, template: string) =>
  expectStatus(await su.agent.put(`/api/admin/access/partners/${partnerId}/permissions`).send({ template }), 200).body;

describe('journey: referral partner, sign-up link → portal → team → drive → commission', () => {
  it('walks every step with the permission set the partner has at that moment', async () => {
    const admin = await asAdmin();
    const su = await asSuperAdmin();
    const staff = await asStaff();

    // ── 1. Partner created in the admin panel: DEFAULT set, commission at CONTRACT_SIGNED ────────────────────────
    const partner = expectStatus(
      await admin.agent.post('/api/admin/partners').send({ name: 'Ilqar Mammadov', commissionCents: 15000, commissionTrigger: 'CONTRACT_SIGNED' }),
      201,
    ).body.partner as { id: string; code: string; name: string };
    expect(partner.code).toBeTruthy();
    const access = expectStatus(await su.agent.get(`/api/admin/access/partners/${partner.id}`), 200).body;
    expect(access).toMatchObject({ template: 'DEFAULT', perms: { clientList: 'masked', documents: 'status', drive: 'view', payments: true } });
    // The partner's portal login (AGENT user linked to the partner).
    const login = await createUser({ role: 'AGENT', firstName: 'Ilqar', lastName: 'Mammadov', locale: 'en' });
    await prisma.referralPartner.update({ where: { id: partner.id }, data: { userId: login.user.id } });
    const p = sessionAgent(login.token);
    const me = expectStatus(await p.get('/api/partner/me'), 200).body;
    expect(me.access).toMatchObject({ role: 'OWNER', template: 'DEFAULT', permissions: { documents: 'status', clientList: 'masked' } });

    // ── 2. A client signs up with the code from the partner's short link ─────────────────────────────────────────
    const check = expectStatus(await anon().get('/api/auth/referral-code').query({ code: partner.code.toLowerCase() }), 200).body;
    expect(check).toMatchObject({ valid: true, kind: 'PARTNER', partnerName: 'Ilqar Mammadov' });
    const { user, agent: client, email } = await registerAndVerify({ firstName: 'Nigar', lastName: 'Əliyeva', ref: partner.code, partnerConsent: true, passportNumber: 'C01234567' });
    expect(user.ownerPartnerId).toBe(partner.id);
    expect(await prisma.partnerClientChange.findFirst({ where: { userId: user.id } })).toMatchObject({ toPartnerId: partner.id, source: 'SIGNUP_LINK' });
    expect(await waitFor(() => prisma.notification.findFirst({ where: { userId: login.user.id, type: 'PARTNER_NEW_CLIENT' } }))).toMatchObject({ link: '/partner/people' });

    // The client's case belongs to the partner; no commission yet (trigger is later).
    const kase = expectStatus(await client.post('/api/cases').send({ visaType: 'WORK', profession: 'Aşpaz' }), 201).body.case as { id: string; number: string };
    expect((await prisma.case.findUniqueOrThrow({ where: { id: kase.id } })).partnerId).toBe(partner.id);
    await waitFor(() => prisma.notification.findFirst({ where: { userId: login.user.id, type: 'PARTNER_NEW_CASE' } }));
    expect(await prisma.partnerCommission.count({ where: { partnerId: partner.id } })).toBe(0);
    await uploadRequired(client, kase.id, 'INITIAL');
    expectStatus(await client.post(`/api/cases/${kase.id}/submit`), 200);
    const firstReq = (await clientCase(client, kase.id)).requirements.find((r) => r.stage === 'INITIAL' && r.required)!;
    const docId = firstReq.documents[0].id;

    // ── 3. DEFAULT: masked identity, stage, documents as STATUS only, no upload, no download ──────────────────────
    const clients = expectStatus(await p.get('/api/partner/clients'), 200).body;
    const row = clients.items.find((x: { id: string }) => x.id === user.id);
    expect(row).toMatchObject({ owned: true, consent: true, contact: null });
    expect(JSON.stringify(clients)).not.toContain(email);
    const detail = expectStatus(await p.get(`/api/partner/cases/${kase.id}`), 200).body;
    const raw = JSON.stringify(detail);
    expect(raw).not.toContain(email);
    expect(raw).not.toContain('C01234567');
    expect(raw).not.toContain('doc.pdf'); // the client's file names
    expect(detail.case.client).toEqual({ firstName: 'Nigar', lastName: 'Əliyeva', passport: '******567' });
    expect(detail.case.status).toBe('DOCUMENTS_REVIEW');
    const statusOnly = detail.case.requirements.find((x: { id: string }) => x.id === firstReq.id);
    expect(statusOnly).toMatchObject({ state: 'UPLOADED', documentCount: null, myUploads: [], canUpload: false, rejectionReason: null });
    expect(statusOnly.files).toBeUndefined();
    const denied = await p.get(`/api/partner/cases/${kase.id}/documents/${docId}/file`);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('PARTNER_PERMISSION_DENIED');

    // ── 4. Team member: never more than the partner, owner-only areas closed ─────────────────────────────────────
    const tooMuch = { clientList: 'full', caseStage: true, documents: 'download', payments: true, addClients: true, messaging: true, vacancies: true, drive: 'upload' };
    const refused = await p.post('/api/partner/team').send({ email: `${uniq('member')}@test.local`, firstName: 'Səbinə', perms: tooMuch });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('PERMS_EXCEED_PARTNER');
    const memberPerms = { clientList: 'masked', caseStage: true, documents: 'status', payments: false, addClients: false, messaging: true, vacancies: false, drive: 'none' };
    const memberEmail = `${uniq('member')}@test.local`;
    const invited = expectStatus(await p.post('/api/partner/team').send({ email: memberEmail, firstName: 'Səbinə', perms: memberPerms }), 201).body.member;
    expect(invited).toMatchObject({ email: memberEmail, perms: memberPerms, active: true });
    const memberUser = await prisma.user.findUniqueOrThrow({ where: { email: memberEmail } });
    const m = sessionAgent((await issueSession(memberUser.id, { client: 'web' })).token);
    expect(expectStatus(await m.get('/api/partner/me'), 200).body.access).toMatchObject({ role: 'MEMBER', permissions: memberPerms });
    expectStatus(await m.get(`/api/partner/cases/${kase.id}`), 200);
    expect((await m.get('/api/partner/commissions')).status).toBe(403);
    expect((await m.get('/api/partner/team')).body.error).toBe('PARTNER_OWNER_ONLY');
    expect((await m.get('/api/partner/drive')).status).toBe(403);

    // ── 5. Partner drive: the own folder only, never the client's folder or another partner's ────────────────────
    const root = (await syncPartnerFolder(partner.id))!;
    const own = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'Müqavilələr', parentId: root } });
    const otherPartner = expectStatus(await admin.agent.post('/api/admin/partners').send({ name: uniq('Kamal ') }), 201).body.partner as { id: string };
    const otherRoot = (await syncPartnerFolder(otherPartner.id))!;
    const foreign = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FILE', name: 'foreign.pdf', parentId: otherRoot, storageKey: uniq('k'), mimeType: 'application/pdf', size: 1 } });
    const drive = expectStatus(await p.get('/api/partner/drive'), 200).body;
    expect(drive.rootId).toBe(root);
    expect(drive.items.map((i: { id: string }) => i.id)).toContain(own.id);
    expect(drive.canUpload).toBe(false);
    const caseFolder = (await prisma.case.findUniqueOrThrow({ where: { id: kase.id } })).driveFolderId;
    if (caseFolder) {
      // The client's folder may live below the partner's folder in the team drive; the portal never shows it.
      expect(drive.items.map((i: { id: string }) => i.id)).not.toContain(caseFolder);
      expect((await p.get('/api/partner/drive').query({ folder: caseFolder })).status).toBe(404);
    }
    expect((await p.get(`/api/partner/drive/files/${foreign.id}`)).status).toBe(404);
    expect((await p.get('/api/partner/drive').query({ folder: otherRoot })).status).toBe(404);
    expect((await p.get(`/api/drive/nodes/${root}`)).status).toBe(403); // the staff drive API stays closed

    // ── 6. Upgrade: full cooperation → file names and download; the member stays at its own saved set ────────────
    expect((await admin.agent.put(`/api/admin/access/partners/${partner.id}/permissions`).send({ template: 'FULL' })).status).toBe(403); // ADMIN without "manage access"
    await setTemplate(su, partner.id, 'FULL');
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'ACCESS_PARTNER_PERMISSIONS_CHANGED', target: `partner:${partner.id}` } });
    expect(log.details).toMatchObject({ before: { template: 'DEFAULT' }, after: { template: 'FULL' } });
    const full = expectStatus(await p.get(`/api/partner/cases/${kase.id}`), 200).body.case;
    expect(full.requirements.find((x: { id: string }) => x.id === firstReq.id).files).toEqual([expect.objectContaining({ id: docId, name: 'doc.pdf' })]);
    const file = await p.get(`/api/partner/cases/${kase.id}/documents/${docId}/file`).buffer(true).parse(binaryParser);
    expect(file.status).toBe(200);
    expect((file.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect((await m.get(`/api/partner/cases/${kase.id}/documents/${docId}/file`)).status).toBe(403);
    expect(expectStatus(await m.get('/api/partner/me'), 200).body.access.permissions.documents).toBe('status');
    // Download rights never reach another partner's client.
    const stranger = await createUser({ role: 'AGENT' });
    await prisma.referralPartner.update({ where: { id: otherPartner.id }, data: { userId: stranger.user.id } });
    await setTemplate(su, otherPartner.id, 'FULL');
    expect((await sessionAgent(stranger.token).get(`/api/partner/cases/${kase.id}/documents/${docId}/file`)).status).toBe(404);

    // ── 7. The case reaches the trigger: commission created once, partner told ──────────────────────────────────
    await reviewAll(staff.agent, kase.id, 'INITIAL');
    expectStatus(await sendContract(staff.agent, kase.id), 201);
    expect(await prisma.partnerCommission.count({ where: { partnerId: partner.id } })).toBe(0); // CONTRACT_SENT is not the trigger
    expectStatus(await signContract(client, kase.id), 200);
    const commission = await waitFor(() => prisma.partnerCommission.findFirst({ where: { partnerId: partner.id, caseId: kase.id } }));
    expect(commission).toMatchObject({ status: 'PENDING', amountCents: 15000 });
    const earned = await waitFor(() => prisma.notification.findFirst({ where: { userId: login.user.id, type: 'PARTNER_COMMISSION_EARNED' } }));
    expect(earned.link).toBe('/partner/commissions');
    const com = expectStatus(await p.get('/api/partner/commissions'), 200).body;
    expect(com.items).toHaveLength(1);
    expect(com.items[0]).toMatchObject({ status: 'PENDING', amountCents: 15000, case: { id: kase.id } });
    expect(await prisma.partnerCommission.count({ where: { partnerId: otherPartner.id } })).toBe(0);
    expect(expectStatus(await p.get(`/api/partner/cases/${kase.id}`), 200).body.case.status).toBe('CONTRACT_SIGNED');
  }, 120_000);
});
