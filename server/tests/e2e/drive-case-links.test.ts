import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { asAdmin, asClient, asStaff, asSuperAdmin, sessionAgent, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, createUser, uniq } from '../helpers/factories';
import { makePdf } from '../helpers/files';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { ensureCaseFolder, syncCaseFolder, syncPartnerFolder } from '../../src/lib/drive/caseFolders.js';
import { backfillCaseLinks } from '../../src/lib/drive/workflowLinks.js';
import { resetMaskingCache } from '../../src/lib/privacy/mask.js';

/**
 * Case links in the drive (lib/drive/workflowLinks):
 *  1. the drive header's partner assignment goes through POST /admin/client-folders/partner (same history everywhere);
 *  2. "İş axınına kopyala" links the client folder's copy to the case; Fertig documents are found by the case id,
 *     legacy copies by name; renames of the client folder are followed; the by-name backfill;
 *  3. a client folder left behind after its case was deleted stays hidden from the partner (mark + recycle bin);
 *  4. masked landlord / address values are revealed with a reason and never saved back.
 */

beforeEach(() => {
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'private'), { recursive: true });
  fs.mkdirSync(path.join(TEST_UPLOADS_DIR, 'public'), { recursive: true });
});

const roots = async (a: Agent) => expectStatus(await a.get('/api/drive/roots'), 200).body;
const mkdir = async (a: Agent, parentId: string, name: string) => expectStatus(await a.post(`/api/drive/nodes/${parentId}/folders`).send({ name }), 201).body.item as { id: string; name: string };
const upload = async (a: Agent, parentId: string, filename: string) =>
  expectStatus(await a.post(`/api/drive/nodes/${parentId}/files`).attach('file', await makePdf(filename), { filename, contentType: 'application/pdf' }), 201).body.item as { id: string; name: string };
const stages = async (a: Agent) => {
  const r = expectStatus(await a.get('/api/drive/workflow/folders'), 200).body as { stages: { stage: string; id: string }[] };
  return Object.fromEntries(r.stages.map((s) => [s.stage, s.id])) as Record<'WRITTEN' | 'IN_PROGRESS' | 'DONE' | 'REFUSED', string>;
};

const clientCase = async (a: Agent, name = uniq('Ali Həsənov · ')) => {
  const r = await roots(a);
  const clientId = (await createClient({ firstName: 'Ali', lastName: 'Həsənov' })).user.id;
  const folder = await mkdir(a, r.cases.id, name);
  const c = await prisma.case.create({ data: { number: uniq('TV-'), clientId, profession: 'Sürücü', status: 'DOCUMENTS_REVIEW', visaType: 'WORK', driveFolderId: folder.id } });
  return { c, folder, clientId };
};

const asPartner = async () => {
  const u = await createUser({ role: 'AGENT', firstName: 'Ilqar', lastName: 'Mammadov', locale: 'en' });
  const partner = await prisma.referralPartner.create({ data: { name: uniq('Partner '), userId: u.user.id, commissionCents: 10000 } });
  return { ...u, partner, agent: sessionAgent(u.token) };
};

describe('drive header: partner assignment with history', () => {
  it('a single client folder assigned through the client-folder endpoint gets owner history, case event, audit and the partner notification', async () => {
    const staff = await asStaff();
    const p = await asPartner();
    const { c, clientId } = await clientCase(staff.agent);
    const r = expectStatus(await staff.agent.post('/api/admin/client-folders/partner').send({ cases: [c.id], partnerId: p.partner.id }), 200).body;
    expect(r.results[0]).toMatchObject({ caseId: c.id, ok: true });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).partnerId).toBe(p.partner.id);
    expect(await prisma.partnerClientChange.count({ where: { userId: clientId, toPartnerId: p.partner.id, source: 'ADMIN' } })).toBe(1);
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'PARTNER_CHANGED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { target: `case:${c.id}`, action: 'CASE_PARTNER_SET' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: p.user.id, type: 'PARTNER_NEW_CASE' } })).toBe(1);
  });
});

describe('İş axını: case links of the stage folders', () => {
  it('links the copy to the case, finds Fertig files by case id and follows renames of the client folder', async () => {
    const staff = await asStaff();
    const { c, folder } = await clientCase(staff.agent);
    const st = await stages(staff.agent);
    const f1 = await upload(staff.agent, folder.id, 'Arbeitsvertrag.pdf');
    expectStatus(await staff.agent.post('/api/drive/workflow/copy').send({ ids: [f1.id], stage: 'DONE' }), 200);
    const linked = await prisma.driveNode.findFirstOrThrow({ where: { parentId: st.DONE, workflowCaseId: c.id, deletedAt: null } });
    expect(linked.name).toBe(folder.name);

    // rename in the drive: the stage folder follows; Fertig files are still found (by the case id)
    const renamed = uniq('Ali Həsənov · Pass-Nr. C77 ');
    expectStatus(await staff.agent.patch(`/api/drive/nodes/${folder.id}`).send({ name: renamed }), 200);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: linked.id } })).name).toBe(renamed);
    await prisma.case.update({ where: { id: c.id }, data: { processingStage: 'DONE' } });
    const view = expectStatus(await staff.agent.get(`/api/admin/client-folders/cases/${c.id}/ready-docs`), 200).body;
    expect(view.folder.id).toBe(linked.id);
    expect(view.files.map((f: { name: string }) => f.name)).toEqual([f1.name]);

    // a second copy reuses the linked folder (even when its name differs from the client folder)
    await prisma.driveNode.update({ where: { id: linked.id }, data: { name: uniq('Manuell umbenannt ') } });
    const f2 = await upload(staff.agent, folder.id, 'Anschreiben.pdf');
    expectStatus(await staff.agent.post('/api/drive/workflow/copy').send({ ids: [f2.id], stage: 'DONE' }), 200);
    expect(await prisma.driveNode.count({ where: { parentId: st.DONE, workflowCaseId: c.id, deletedAt: null } })).toBe(1);
    expect(await prisma.driveNode.count({ where: { parentId: linked.id, deletedAt: null } })).toBe(2);

    // a client data change renames the client folder (syncCaseFolder): the stage folder follows again
    await prisma.user.update({ where: { id: c.clientId }, data: { firstName: 'Əli', passportNumber: uniq('C') } });
    await syncCaseFolder(c.id);
    const clientName = (await prisma.driveNode.findUniqueOrThrow({ where: { id: folder.id } })).name;
    expect(clientName).toContain('Əli');
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: linked.id } })).name).toBe(clientName);
  });

  it('sending a linked folder to the next stage keeps the case link', async () => {
    const staff = await asStaff();
    const { c, folder } = await clientCase(staff.agent);
    const st = await stages(staff.agent);
    const f = await upload(staff.agent, folder.id, 'Pass.pdf');
    expectStatus(await staff.agent.post('/api/drive/workflow/copy').send({ ids: [f.id], stage: 'WRITTEN' }), 200);
    const written = await prisma.driveNode.findFirstOrThrow({ where: { parentId: st.WRITTEN, workflowCaseId: c.id, deletedAt: null } });
    const copy = await prisma.driveNode.findFirstOrThrow({ where: { parentId: written.id, deletedAt: null } });
    expectStatus(await staff.agent.post('/api/drive/workflow/send').send({ ids: [copy.id], stage: 'IN_PROGRESS' }), 200);
    const next = await prisma.driveNode.findFirstOrThrow({ where: { parentId: st.IN_PROGRESS, workflowCaseId: c.id, deletedAt: null } });
    expect(next.name).toBe(folder.name);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: copy.id } })).parentId).toBe(next.id);
  });

  it('a legacy copy is found by name, never one linked to another case; the backfill links it when unambiguous', async () => {
    const staff = await asStaff();
    const { c, folder } = await clientCase(staff.agent);
    const st = await stages(staff.agent);
    await prisma.case.update({ where: { id: c.id }, data: { processingStage: 'DONE' } });
    // a copy made before the link existed (no workflowCaseId)
    const legacy = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: folder.name, parentId: st.DONE } });
    const f = await upload(staff.agent, legacy.id, 'Zeugnis.pdf');
    let view = expectStatus(await staff.agent.get(`/api/admin/client-folders/cases/${c.id}/ready-docs`), 200).body;
    expect(view.folder.id).toBe(legacy.id);
    expect(view.files.map((x: { nodeId: string }) => x.nodeId)).toEqual([f.id]);

    // linked to another case: not this case's folder any more
    const other = await clientCase(staff.agent);
    await prisma.driveNode.update({ where: { id: legacy.id }, data: { workflowCaseId: other.c.id } });
    view = expectStatus(await staff.agent.get(`/api/admin/client-folders/cases/${c.id}/ready-docs`), 200).body;
    expect(view.folder).toBeNull();

    // backfill: unlinked again → linked to the one case with that client folder name (idempotent)
    await prisma.driveNode.update({ where: { id: legacy.id }, data: { workflowCaseId: null } });
    await backfillCaseLinks();
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: legacy.id } })).workflowCaseId).toBe(c.id);
    await backfillCaseLinks();
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: legacy.id } })).workflowCaseId).toBe(c.id);

    // two cases with the same client folder name: the backfill leaves the copy alone
    const twinName = uniq('Twin · ');
    await clientCase(staff.agent, twinName);
    const r2 = await roots(staff.agent);
    const typeFolder = await mkdir(staff.agent, r2.cases.id, uniq('Andere '));
    const twinFolder = await mkdir(staff.agent, typeFolder.id, twinName);
    await prisma.case.create({ data: { number: uniq('TV-'), clientId: c.clientId, profession: 'X', driveFolderId: twinFolder.id } });
    const twinCopy = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: twinName, parentId: st.DONE } });
    await backfillCaseLinks();
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: twinCopy.id } })).workflowCaseId).toBeNull();
  });
});

describe('partner drive: client folders left behind', () => {
  const setDriveView = async (su: Awaited<ReturnType<typeof asSuperAdmin>>, partnerId: string) =>
    expectStatus(await su.agent.put(`/api/admin/access/partners/${partnerId}/permissions`).send({ template: 'DEFAULT' }), 200);

  it('stays hidden after its case was deleted, and orphans from before are found by the backfill', async () => {
    const su = await asSuperAdmin();
    const p = await asPartner();
    await setDriveView(su, p.partner.id);
    const root = (await syncPartnerFolder(p.partner.id))!;
    const own = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'Müqavilələr', parentId: root } });
    const clientFolder = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'Ayan Quliyeva · C123', parentId: root } });
    const secret = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FILE', name: 'pasport.pdf', parentId: clientFolder.id, storageKey: uniq('k'), mimeType: 'application/pdf', size: 1 } });
    const client = await asClient();
    const c = await prisma.case.create({ data: { number: uniq('TV-'), clientId: client.user.id, profession: 'X', partnerId: p.partner.id, driveFolderId: clientFolder.id } });
    await backfillCaseLinks(); // marks current client folders (new ones get the mark when created / synced)
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: clientFolder.id } })).clientFolderAt).not.toBeNull();

    // the case row disappears (any path): the folder stays a client folder for the partner drive
    await prisma.case.delete({ where: { id: c.id } });
    const list = expectStatus(await p.agent.get('/api/partner/drive'), 200).body;
    expect(list.items.map((i: { id: string }) => i.id)).toEqual([own.id]);
    expect((await p.agent.get('/api/partner/drive').query({ folder: clientFolder.id })).status).toBe(404);
    expect((await p.agent.get(`/api/partner/drive/files/${secret.id}`)).status).toBe(404);

    // an orphan from before the mark existed: looks like a client folder → marked by the backfill
    const orphan = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'Nigar Əliyeva · TV-2025-0042', parentId: root } });
    const withCopies = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'Köhnə qovluq', parentId: root } });
    const doc = await prisma.document.create({
      data: { caseId: (await createCaseVia(client.agent)).id, stage: 'INITIAL', originalName: 'p.pdf', storedName: uniq('s'), mimeType: 'application/pdf', size: 1, status: 'ACCEPTED', uploadedById: client.user.id },
    });
    await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FILE', name: 'p.pdf', parentId: withCopies.id, storageKey: uniq('k'), documentId: doc.id } });
    await backfillCaseLinks();
    const after = expectStatus(await p.agent.get('/api/partner/drive'), 200).body;
    expect(after.items.map((i: { id: string }) => i.id)).toEqual([own.id]);
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: orphan.id } })).clientFolderAt).not.toBeNull();
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: withCopies.id } })).clientFolderAt).not.toBeNull();
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: own.id } })).clientFolderAt).toBeNull();
  });

  it('removing a family member case sends its client folder to the recycle bin, marked', async () => {
    const staff = await asStaff();
    const client = await asClient({ firstName: 'Rauf', lastName: 'Kərimov' });
    const main = await createCaseVia(client.agent);
    await ensureCaseFolder(main.id);
    const added = expectStatus(await staff.agent.post(`/api/admin/journey/cases/${main.id}/family`).send({ firstName: 'Səbinə', lastName: 'Kərimova', relation: 'spouse' }), 201).body;
    const memberId = added.case.id as string;
    const folderId = (await ensureCaseFolder(memberId))!;
    expectStatus(await staff.agent.delete(`/api/admin/journey/cases/${main.id}/family/${memberId}`), 200);
    expect(await prisma.case.findUnique({ where: { id: memberId } })).toBeNull();
    const folder = await prisma.driveNode.findUniqueOrThrow({ where: { id: folderId } });
    expect(folder.deletedAt).not.toBeNull();
    expect(folder.deletedById).toBe(staff.user.id);
    expect(folder.clientFolderAt).not.toBeNull();
  });
});

describe('masked addresses: reveal and save', () => {
  beforeEach(() => resetMaskingCache());
  afterEach(() => resetMaskingCache());

  /** Access Center › Sensitive fields: one group for one role. */
  const setRole = async (su: Agent, role: 'STAFF' | 'ADMIN', group: string, mode: 'VISIBLE' | 'MASKED' | 'HIDDEN') => {
    expectStatus(await su.put('/api/admin/access/sensitive/role').send({ role, group, mode }), 200);
    resetMaskingCache();
  };

  it('landlord listing: masked for staff, revealed with a reason, a save with the mask keeps the stored values', async () => {
    const su = await asSuperAdmin();
    const admin = await asAdmin();
    const staff = await asStaff();
    const id = expectStatus(
      await admin.agent.post('/api/admin/housing/listings').send({
        name: uniq('Wohnung '),
        city: 'Berlin',
        type: 'APARTMENT',
        priceMin: 500,
        priceMax: 700,
        address: 'Musterstraße 12, 10115 Berlin',
        contactName: 'Frau Schmidt',
        contactPhone: '+49 30 1234567',
        contactEmail: 'vermieter@example.de',
      }),
      201,
    ).body.listing.id as string;
    try {
      await setRole(su.agent, 'STAFF', 'ADDRESS', 'MASKED');
      const list = expectStatus(await staff.agent.get('/api/admin/housing/listings'), 200).body.items as { id: string; name: string; address: string | null; contactName: string | null }[];
      const row = list.find((l) => l.id === id)!;
      expect(row).toMatchObject({ address: '••••', contactName: '••••' });
      expect(row.name).toMatch(/^Wohnung /); // the listing name stays visible
      const shown = expectStatus(await staff.agent.post('/api/admin/reveal').send({ entity: 'partnerHousing', id, field: 'address', reason: 'Mənzil ünvanını müştəriyə göndərmək üçün' }), 200).body;
      expect(shown.value).toBe('Musterstraße 12, 10115 Berlin');

      // an admin form loaded while masked, saved after the group was switched off: "••••" never overwrites
      await setRole(su.agent, 'ADMIN', 'ADDRESS', 'MASKED');
      const loaded = (expectStatus(await admin.agent.get('/api/admin/housing/listings'), 200).body.items as { id: string; address: string }[]).find((l) => l.id === id)!;
      expect(loaded.address).toBe('••••');
      await setRole(su.agent, 'ADMIN', 'ADDRESS', 'VISIBLE');
      expectStatus(await admin.agent.patch(`/api/admin/housing/listings/${id}`).send({ address: loaded.address, contactName: '••••', contactPhone: '+49 30 7654321' }), 200);
      expect(await prisma.partnerHousing.findUniqueOrThrow({ where: { id } })).toMatchObject({ address: 'Musterstraße 12, 10115 Berlin', contactName: 'Frau Schmidt', contactPhone: '+49 30 7654321' });
    } finally {
      await setRole(su.agent, 'STAFF', 'ADDRESS', 'VISIBLE');
      await setRole(su.agent, 'ADMIN', 'ADDRESS', 'VISIBLE');
    }
  });

  it('client address: case detail and 360° page carry it for staff (masked by policy) and it can be revealed', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const client = await asClient({ firstName: 'Lalə', lastName: 'Məmmədova' });
    await prisma.user.update({ where: { id: client.user.id }, data: { address: 'Nizami küç. 10, Bakı' } });
    const c = await createCaseVia(client.agent);
    expect(expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}`), 200).body.case.client.address).toBe('Nizami küç. 10, Bakı');
    // the client portal's case view does not carry it
    expect(expectStatus(await client.agent.get(`/api/cases/${c.id}`), 200).body.case.client?.address).toBeUndefined();
    try {
      await setRole(su.agent, 'STAFF', 'ADDRESS', 'MASKED');
      expect(expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}`), 200).body.case.client.address).toBe('••••');
      expect(expectStatus(await staff.agent.get(`/api/admin/clients/${client.user.id}`), 200).body.client.address).toBe('••••');
      const shown = expectStatus(await staff.agent.post('/api/admin/reveal').send({ entity: 'clientAddress', id: client.user.id, field: 'address', reason: 'Məktub göndərmək üçün ünvan' }), 200).body;
      expect(shown.value).toBe('Nizami küç. 10, Bakı');
    } finally {
      await setRole(su.agent, 'STAFF', 'ADDRESS', 'VISIBLE');
    }
  });
});
