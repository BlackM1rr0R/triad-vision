import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { ensureSection } from '../../src/lib/drive/roots.js';
import { syncCommission } from '../../src/lib/settlement/service.js';

const roots = async (a: Agent) => expectStatus(await a.get('/api/drive/roots'), 200).body;
const trash = (a: Agent, ids: string[]) => a.post('/api/drive/trash').send({ ids });

const newCase = async (firstName: string, lastName: string) => {
  const client = await asClient({ firstName, lastName });
  return expectStatus(await client.agent.post('/api/cases').send({ visaType: 'WORK', profession: 'Aşpaz' }), 201).body.case as { id: string; number: string };
};

/** Names from the shared root down to the node. */
const pathOf = async (id: string) => {
  const names: string[] = [];
  let cur = await prisma.driveNode.findUnique({ where: { id }, select: { name: true, parentId: true } });
  while (cur) {
    names.unshift(cur.name);
    cur = cur.parentId ? await prisma.driveNode.findUnique({ where: { id: cur.parentId }, select: { name: true, parentId: true } }) : null;
  }
  return names.join('/');
};

const folderOfCase = async (caseId: string) => (await prisma.case.findUniqueOrThrow({ where: { id: caseId }, select: { driveFolderId: true } })).driveFolderId!;

/** Waits until the client folder of a case sits directly in `parentId`. */
const waitInside = (caseId: string, parentId: string) =>
  waitFor(async () => {
    const id = (await prisma.case.findUnique({ where: { id: caseId }, select: { driveFolderId: true } }))?.driveFolderId;
    if (!id) return null;
    const n = await prisma.driveNode.findUnique({ where: { id }, select: { parentId: true, deletedAt: true } });
    return n && !n.deletedAt && n.parentId === parentId ? id : null;
  });

const partnerRow = async (a: Agent, id: string) =>
  (expectStatus(await a.get('/api/admin/partners'), 200).body.items as { id: string; folderId: string | null }[]).find((p) => p.id === id);

describe('deleting a referral partner', () => {
  it('without force answers 409 with the counts; staff may not; with force cases, commissions, settlements, login and folder are cleaned up', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const created = expectStatus(await admin.agent.post('/api/admin/partners').send({ name: 'Ilqar', email: 'ilqar@example.com', commissionCents: 5000 }), 201).body;
    const partnerId = created.partner.id as string;
    const partnerFolder = created.folderId as string;
    const c1 = await newCase('Ayan', 'Quliyeva');
    const c2 = await newCase('Rauf', 'Məmmədov');
    expectStatus(await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [c1.id, c2.id], partnerId }), 200);
    await waitInside(c1.id, partnerFolder);
    await waitInside(c2.id, partnerFolder);
    expect(await prisma.partnerCommission.count({ where: { partnerId, status: 'PENDING', settlementEntryId: null } })).toBe(2);

    // A settlement row with a partner share (ledger-owned commission) and a portal login.
    const entry = await prisma.settlementEntry.create({ data: { clientName: 'Orxan (CE)', partnerId, partnerShareCents: 30000 } });
    await syncCommission(entry.id);
    expect(await prisma.partnerCommission.count({ where: { settlementEntryId: entry.id } })).toBe(1);
    const login = expectStatus(await admin.agent.post(`/api/admin/partners/${partnerId}/login`).send({ email: 'ilqar@example.com' }), 201).body.login;

    // Without force: 409 with the numbers the dialog shows.
    const blocked = await admin.agent.delete(`/api/admin/partners/${partnerId}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ error: 'PARTNER_HAS_CASES', cases: 2, clients: 2, settlements: 1 });
    // Staff never delete partners.
    expect((await staff.agent.delete(`/api/admin/partners/${partnerId}?force=1`)).status).toBe(403);

    const res = expectStatus(await admin.agent.delete(`/api/admin/partners/${partnerId}?force=1`), 200).body;
    expect(res).toMatchObject({ ok: true, cases: 2, commissionsCancelled: 2, settlements: 1, loginDeactivated: true, folder: 'trashed' });
    expect(await prisma.referralPartner.findUnique({ where: { id: partnerId } })).toBeNull();

    // Cases unassigned; client folders back in Anträge/<Visumart>/<Kategorie>.
    expect(await prisma.case.count({ where: { id: { in: [c1.id, c2.id] }, partnerId: { not: null } } })).toBe(0);
    expect(await pathOf(await folderOfCase(c1.id))).toBe(`Gemeinsame Dokumente/Anträge/Arbeitsvisum/Ohne Kategorie/Ayan Quliyeva · ${c1.number}`);
    expect(await pathOf(await folderOfCase(c2.id))).toBe(`Gemeinsame Dokumente/Anträge/Arbeitsvisum/Ohne Kategorie/Rauf Məmmədov · ${c2.number}`);
    // Commissions: none left for the partner (automatic ones cancelled, ledger one removed with the share's owner).
    expect(await prisma.partnerCommission.count({ where: { partnerId } })).toBe(0);
    expect(await prisma.partnerCommission.count({ where: { settlementEntryId: entry.id } })).toBe(0);
    // The settlement row stays, without the partner.
    expect(await prisma.settlementEntry.findUniqueOrThrow({ where: { id: entry.id } })).toMatchObject({ partnerId: null, clientName: 'Orxan (CE)', partnerShareCents: 30000 });
    // Login deactivated; the empty partner folder is in the bin (restorable).
    expect(await prisma.user.findUniqueOrThrow({ where: { id: login.id } })).toMatchObject({ isActive: false, role: 'AGENT' });
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: partnerFolder } })).deletedAt).not.toBeNull();

    const log = await prisma.auditLog.findFirst({ where: { action: 'PARTNER_DELETED', target: partnerId } });
    expect(log?.details).toMatchObject({ name: 'Ilqar', cases: 2, force: true, folder: 'trashed' });
  });

  it('keeps a partner folder that still holds other files as an ordinary folder', async () => {
    const su = await asSuperAdmin();
    const created = expectStatus(await su.agent.post('/api/admin/partners').send({ name: 'Ənvər' }), 201).body;
    const kept = expectStatus(await su.agent.post(`/api/drive/nodes/${created.folderId}/folders`).send({ name: 'Müqavilə' }), 201).body.item;
    const res = expectStatus(await su.agent.delete(`/api/admin/partners/${created.partner.id}`), 200).body;
    expect(res).toMatchObject({ folder: 'kept', cases: 0 });
    expect(await prisma.driveNode.findUniqueOrThrow({ where: { id: created.folderId } })).toMatchObject({ deletedAt: null });
    expect(await prisma.driveNode.findUniqueOrThrow({ where: { id: kept.id } })).toMatchObject({ deletedAt: null });
  });

  it('deleting a partner whose folder is in the bin brings the client folders (with their files) back to Anträge', async () => {
    const su = await asSuperAdmin();
    const created = expectStatus(await su.agent.post('/api/admin/partners').send({ name: 'Tofiq' }), 201).body;
    const c = await newCase('Nigar', 'Həsənova');
    expectStatus(await su.agent.patch('/api/admin/partners/assign').send({ caseIds: [c.id], partnerId: created.partner.id }), 200);
    const clientFolder = await waitInside(c.id, created.folderId);
    expect(expectStatus(await trash(su.agent, [created.folderId]), 200).body.results[0].ok).toBe(true);
    expect((await partnerRow(su.agent, created.partner.id))?.folderId).toBeNull();

    expect(expectStatus(await su.agent.delete(`/api/admin/partners/${created.partner.id}?force=1`), 200).body).toMatchObject({ folder: 'trashed' });
    // Same client folder (not a new empty one), alive, in Anträge.
    expect(await folderOfCase(c.id)).toBe(clientFolder);
    expect(await pathOf(clientFolder)).toBe(`Gemeinsame Dokumente/Anträge/Arbeitsvisum/Ohne Kategorie/Nigar Həsənova · ${c.number}`);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: clientFolder } })).deletedAt).toBeNull();
  });
});

describe('partner folders in the drive', () => {
  it('a trashed "Partner" section is recovered by ensureSection (restored, not duplicated)', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const r = await roots(staff.agent);
    const old = expectStatus(await staff.agent.post('/api/admin/partners').send({ name: 'Elvin' }), 201).body;
    expect(expectStatus(await trash(su.agent, [r.partners.id]), 200).body.results[0].ok).toBe(true);
    expect((await roots(staff.agent)).partners).toBeNull();

    expect(await ensureSection('partners')).toBe(r.partners.id);
    expect(await prisma.driveNode.findUniqueOrThrow({ where: { id: r.partners.id } })).toMatchObject({ deletedAt: null, system: true, name: 'Partner' });
    // What was deleted with it came back too, and only one live section exists.
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: old.folderId } })).deletedAt).toBeNull();
    expect(await prisma.driveNode.count({ where: { name: 'Partner', system: true, deletedAt: null } })).toBe(1);
    expect((await roots(staff.agent)).partners).toMatchObject({ id: r.partners.id });

    // Creating a partner afterwards works and lands in the same section.
    const fresh = expectStatus(await staff.agent.post('/api/admin/partners').send({ name: 'Vüsal' }), 201).body;
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: fresh.folderId } })).parentId).toBe(r.partners.id);
  });

  it('a partner folder deleted in the drive is restored by "recreate" (with its client folders); a restore after a new folder merges', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const created = expectStatus(await staff.agent.post('/api/admin/partners').send({ name: 'Ilqar' }), 201).body;
    const partnerId = created.partner.id as string;
    const c = await newCase('Ayan', 'Quliyeva');
    expectStatus(await staff.agent.patch('/api/admin/partners/assign').send({ caseIds: [c.id], partnerId }), 200);
    const clientFolder = await waitInside(c.id, created.folderId);
    expect((await partnerRow(staff.agent, partnerId))?.folderId).toBe(created.folderId);

    // Deleted in the drive: the partner stays, without a folder.
    expect(expectStatus(await trash(su.agent, [created.folderId]), 200).body.results[0].ok).toBe(true);
    expect((await partnerRow(staff.agent, partnerId))?.folderId).toBeNull();

    // "Qovluq yoxdur — yarat": the same folder comes back from the bin, client folder included.
    const again = expectStatus(await staff.agent.post(`/api/admin/partners/${partnerId}/folder`), 200).body;
    expect(again).toMatchObject({ folderId: created.folderId, restored: true, created: false });
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: clientFolder } })).deletedAt).toBeNull();
    expect((await partnerRow(staff.agent, partnerId))?.folderId).toBe(created.folderId);
    // Idempotent.
    expect(expectStatus(await staff.agent.post(`/api/admin/partners/${partnerId}/folder`), 200).body).toMatchObject({ folderId: created.folderId, restored: false, created: false });

    // Deleted again, a new "Ilqar" folder made by hand, then the old one restored from the bin: one folder.
    expectStatus(await trash(su.agent, [created.folderId]), 200);
    const manual = expectStatus(await staff.agent.post(`/api/drive/nodes/${(await roots(staff.agent)).partners.id}/folders`).send({ name: 'Ilqar' }), 201).body.item;
    expect(manual.partner).toMatchObject({ id: partnerId });
    expectStatus(await su.agent.post('/api/drive/restore').send({ ids: [created.folderId] }), 200);
    const live = await prisma.driveNode.findMany({ where: { parentId: manual.parentId, deletedAt: null, name: { startsWith: 'Ilqar' } }, select: { id: true, name: true } });
    expect(live).toEqual([{ id: manual.id, name: 'Ilqar' }]);
    expect(await prisma.driveNode.findUniqueOrThrow({ where: { id: clientFolder } })).toMatchObject({ parentId: manual.id, deletedAt: null });
    expect((await partnerRow(staff.agent, partnerId))?.folderId).toBe(manual.id);
  });

  it('staff create new folders inside "Partner"; a folder carrying a partner name becomes that partner\'s folder', async () => {
    const staff = await asStaff();
    const r = await roots(staff.agent);
    const plain = expectStatus(await staff.agent.post(`/api/drive/nodes/${r.partners.id}/folders`).send({ name: 'Ümumi sənədlər' }), 201).body.item;
    expect(plain).toMatchObject({ name: 'Ümumi sənədlər', parentId: r.partners.id });
    expect(plain.partner).toBeUndefined();
    // A name clash with a trashed folder is no clash.
    expectStatus(await trash(staff.agent, [plain.id]), 200);
    expectStatus(await staff.agent.post(`/api/drive/nodes/${r.partners.id}/folders`).send({ name: 'Ümumi sənədlər' }), 201);
    // A live clash is.
    expect((await staff.agent.post(`/api/drive/nodes/${r.partners.id}/folders`).send({ name: 'Ümumi sənədlər' })).status).toBe(409);
  });
});
