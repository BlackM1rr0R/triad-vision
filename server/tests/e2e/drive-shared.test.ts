import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createVisaCategory, l10n } from '../helpers/factories';
import { makePdf } from '../helpers/files';
import { clientCase, createCaseVia, expectStatus, uploadDoc } from '../helpers/workflow';
import { TEST_DOCS_DIR } from '../helpers/testEnv';
import { backfillCaseDrive, syncCaseFolder } from '../../src/lib/drive/caseFolders.js';
import { migratePersonalSpaces } from '../../src/lib/drive/layout.js';
import { ensureRoots } from '../../src/lib/drive/roots.js';
import { addFamilyMember } from '../../src/lib/journey/family.js';

// These tests check folder structure and copies with their original names: automatic naming (drive-org.test.ts) off.
beforeEach(async () => {
  await prisma.setting.create({ data: { key: 'drive.autoNaming', value: { enabled: false, pattern: '{Nachname}_{Vorname}_{Typ}_{Datum}' } } });
});

const roots = async (a: Agent) => expectStatus(await a.get('/api/drive/roots'), 200).body;
const list = async (a: Agent, id: string) => expectStatus(await a.get(`/api/drive/nodes/${encodeURIComponent(id)}/children`), 200).body;
const driveFile = (key: string) => path.join(TEST_DOCS_DIR, 'drive', key);

/** Names from the shared root down to the node ("Gemeinsame Dokumente/Anträge/…"). */
const pathOf = async (id: string) => {
  const names: string[] = [];
  let cur = await prisma.driveNode.findUnique({ where: { id }, select: { name: true, parentId: true } });
  while (cur) {
    names.unshift(cur.name);
    cur = cur.parentId ? await prisma.driveNode.findUnique({ where: { id: cur.parentId }, select: { name: true, parentId: true } }) : null;
  }
  return names.join('/');
};

const folderOf = async (caseId: string) =>
  waitFor(async () => {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { driveFolderId: true } });
    return c?.driveFolderId ?? null;
  });

const caseFor = async (opts: { firstName?: string; lastName?: string; passport?: string | null; body?: Record<string, unknown> } = {}) => {
  const client = await asClient({ firstName: opts.firstName ?? 'Ayan', lastName: opts.lastName ?? 'Quliyeva' });
  if (opts.passport) await prisma.user.update({ where: { id: client.user.id }, data: { passportNumber: opts.passport } });
  const c = expectStatus(await client.agent.post('/api/cases').send({ profession: 'Aşpaz', ...(opts.body ?? {}) }), 201).body.case as { id: string; number: string };
  return { client, c, folderId: await folderOf(c.id) };
};

describe('shared workspace: moving the old personal spaces', () => {
  it('moves every "My files" tree into Mitarbeiter/<name>, keeps files, versions and task links, and is idempotent', async () => {
    const staff = await asStaff({ firstName: 'Kamran', lastName: 'Əliyev' });
    const empty = await asStaff({ firstName: 'Empty', lastName: 'Root' });
    // Legacy data: the old shared root (VIEW for staff), the old CASES root and a personal tree.
    const oldShared = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'Firmenlaufwerk', system: true, inheritPermissions: false, grants: { create: { role: 'STAFF', access: 'VIEW' } } } });
    const oldCases = await prisma.driveNode.create({ data: { space: 'CASES', kind: 'FOLDER', name: 'Anträge', system: true, inheritPermissions: false, grants: { create: { role: 'ADMIN', access: 'DOWNLOAD' } } } });
    const root = await prisma.driveNode.create({ data: { space: 'PERSONAL', kind: 'FOLDER', name: 'Kamran Əliyev', ownerId: staff.user.id, system: true, inheritPermissions: false } });
    const folder = await prisma.driveNode.create({ data: { space: 'PERSONAL', kind: 'FOLDER', name: 'Müqavilələr', parentId: root.id, ownerId: staff.user.id } });
    const key = 'a'.repeat(32);
    fs.mkdirSync(path.join(TEST_DOCS_DIR, 'drive'), { recursive: true });
    fs.writeFileSync(driveFile(key), '%PDF-x');
    const file = await prisma.driveNode.create({ data: { space: 'PERSONAL', kind: 'FILE', name: 'a.pdf', parentId: folder.id, ownerId: staff.user.id, storageKey: key, mimeType: 'application/pdf', size: 6, version: 2 } });
    await prisma.driveFileVersion.create({ data: { nodeId: file.id, version: 1, storageKey: 'b'.repeat(32), mimeType: 'application/pdf', size: 3 } });
    const task = await prisma.task.create({ data: { number: 1, title: 'Linked' } });
    await prisma.taskAttachment.create({ data: { taskId: task.id, nodeId: file.id } });
    // The auto-generated clients workbook of a super admin is dropped (it lives once in the shared space now).
    const generated = await prisma.driveNode.create({ data: { space: 'PERSONAL', kind: 'FOLDER', name: 'Alle Kunden', parentId: root.id, ownerId: staff.user.id, system: true } });
    await prisma.driveNode.create({ data: { space: 'PERSONAL', kind: 'FOLDER', name: 'E', ownerId: empty.user.id, system: true, inheritPermissions: false } });

    const r = await ensureRoots();
    expect(r.sharedId).toBe(oldShared.id);
    expect(r.casesId).toBe(oldCases.id);
    expect(await prisma.driveNode.findUniqueOrThrow({ where: { id: oldShared.id } })).toMatchObject({ name: 'Gemeinsame Dokumente' });
    expect((await prisma.driveGrant.findMany({ where: { nodeId: oldShared.id } })).map((g) => [g.role, g.access])).toEqual([['STAFF', 'EDIT']]);
    expect(await prisma.driveNode.findUniqueOrThrow({ where: { id: oldCases.id } })).toMatchObject({ space: 'SHARED', parentId: oldShared.id, inheritPermissions: true });
    expect(await prisma.driveGrant.count({ where: { nodeId: oldCases.id } })).toBe(0);

    const first = await migratePersonalSpaces();
    expect(first).toMatchObject({ moved: 1, emptyRemoved: 1, folders: ['Kamran Əliyev'] });
    expect(await prisma.driveNode.count({ where: { space: 'PERSONAL' } })).toBe(0);
    expect(await prisma.driveNode.findUnique({ where: { id: generated.id } })).toBeNull();
    expect(await prisma.driveNode.findUniqueOrThrow({ where: { id: root.id } })).toMatchObject({ parentId: r.staffId, space: 'SHARED', ownerId: null, system: false, inheritPermissions: true });
    expect(await pathOf(file.id)).toBe('Gemeinsame Dokumente/Mitarbeiter/Kamran Əliyev/Müqavilələr/a.pdf');
    expect(await prisma.driveFileVersion.count({ where: { nodeId: file.id } })).toBe(1);
    expect(await prisma.taskAttachment.count({ where: { nodeId: file.id } })).toBe(1);
    expect(fs.existsSync(driveFile(key))).toBe(true);

    // Every staff member can now edit the moved files.
    const colleague = await asStaff();
    expect(expectStatus(await colleague.agent.get(`/api/drive/nodes/${file.id}`), 200).body.item.myAccess).toBe('EDIT');

    const again = await migratePersonalSpaces();
    expect(again).toMatchObject({ moved: 0, emptyRemoved: 0 });
    expect(await prisma.driveNode.count({ where: { parentId: r.staffId } })).toBe(1);
  });
});

describe('shared workspace: client folders', () => {
  it('names folders by client name and passport number (case number without one) under Anträge/type/category', async () => {
    const su = await asSuperAdmin();
    const withPass = await caseFor({ passport: 'C01234567' });
    expect(await pathOf(withPass.folderId)).toBe('Gemeinsame Dokumente/Anträge/Arbeitsvisum/Ohne Kategorie/Ayan Quliyeva · Pass-Nr. C01234567');
    const noPass = await caseFor({ firstName: 'Rauf', lastName: 'Məmmədov' });
    expect(await pathOf(noPass.folderId)).toBe(`Gemeinsame Dokumente/Anträge/Arbeitsvisum/Ohne Kategorie/Rauf Məmmədov · ${noPass.c.number}`);

    const courier = await createVisaCategory({ slug: 'kuryer', title: l10n('Kuryer'), visaLabel: '§18b' });
    const ausb = await caseFor({ firstName: 'Aysel', lastName: 'B', passport: 'P1', body: { visaType: 'AUSBILDUNG', visaCategoryId: courier.id } });
    expect(await pathOf(ausb.folderId)).toBe('Gemeinsame Dokumente/Anträge/Ausbildung/§18b · Kuryer de/Aysel B · Pass-Nr. P1');

    // Same name and passport in the same place: the case number is appended.
    const twin = await caseFor({ passport: 'C01234567' });
    expect(await pathOf(twin.folderId)).toBe(`Gemeinsame Dokumente/Anträge/Arbeitsvisum/Ohne Kategorie/Ayan Quliyeva · Pass-Nr. C01234567 · ${twin.c.number}`);

    // The client adds the passport number → the folder is renamed; staff change the category → it moves.
    expectStatus(await noPass.client.agent.patch('/api/auth/me').send({ passportNumber: 'AA1234567' }), 200);
    await waitFor(async () => (await prisma.driveNode.findUnique({ where: { id: noPass.folderId } }))?.name === 'Rauf Məmmədov · Pass-Nr. AA1234567');
    expectStatus(await su.agent.patch(`/api/admin/cases/${noPass.c.id}`).send({ visaCategoryId: courier.id }), 200);
    await waitFor(async () => (await pathOf(noPass.folderId)).includes('Arbeitsvisum/§18b · Kuryer de/'));

    // The listing marks client folders with their case.
    const staff = await asStaff();
    const item = expectStatus(await staff.agent.get(`/api/drive/nodes/${withPass.folderId}`), 200).body;
    expect(item.item).toMatchObject({ caseId: withPass.c.id, caseNumber: withPass.c.number, myAccess: 'EDIT' });
    expect(item.details.caseLink).toBe(`/admin/cases/${withPass.c.id}`);
    // Search by case number finds the folder even though the name shows the passport number.
    const found = expectStatus(await staff.agent.get(`/api/drive/search?q=${encodeURIComponent(withPass.c.number)}`), 200).body.items;
    expect(found.map((i: { id: string }) => i.id)).toContain(withPass.folderId);
  });

  it('moves the client folder into Partner/<name> when a partner brings the client, keeping its files', async () => {
    const staff = await asStaff();
    const { c, folderId } = await caseFor({ firstName: 'Tofiq', lastName: 'Həsənov', passport: 'C7' });
    const up = expectStatus(await staff.agent.post(`/api/drive/nodes/${folderId}/files`).attach('file', await makePdf('note'), { filename: 'note.pdf', contentType: 'application/pdf' }), 201).body.item;
    const partner = await prisma.referralPartner.create({ data: { name: 'İlqar' } });
    await prisma.case.update({ where: { id: c.id }, data: { partnerId: partner.id } });
    await syncCaseFolder(c.id);
    expect(await pathOf(up.id)).toBe('Gemeinsame Dokumente/Partner/İlqar/Tofiq Həsənov · Pass-Nr. C7/note.pdf');
    const r = await roots(staff.agent);
    const partnerFolders = (await list(staff.agent, r.partners.id)).items;
    expect(partnerFolders.map((i: { name: string }) => i.name)).toEqual(['İlqar']);
    expect(partnerFolders[0].partner).toMatchObject({ id: partner.id, name: 'İlqar', active: true });
    const clientFolder = (await list(staff.agent, partnerFolders[0].id)).items[0];
    expect(clientFolder).toMatchObject({ id: folderId, caseId: c.id, caseInfo: { clientName: 'Tofiq Həsənov', passportNumber: 'C7', visaType: 'WORK', partner: { id: partner.id, name: 'İlqar' } } });

    // Staff moved it elsewhere by hand; a data change puts it back where it belongs.
    const elsewhere = expectStatus(await staff.agent.post(`/api/drive/nodes/${r.shared.id}/folders`).send({ name: 'Arbeit' }), 201).body.item;
    expectStatus(await staff.agent.post('/api/drive/move').send({ ids: [folderId], targetId: elsewhere.id }), 200);
    await prisma.case.update({ where: { id: c.id }, data: { partnerId: null } });
    await syncCaseFolder(c.id);
    expect(await pathOf(up.id)).toBe('Gemeinsame Dokumente/Anträge/Arbeitsvisum/Ohne Kategorie/Tofiq Həsənov · Pass-Nr. C7/note.pdf');
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).driveFolderId).toBe(folderId);
  });

  it('puts family members into the main applicant\'s folder (Familie/<Name>)', async () => {
    const su = await asSuperAdmin();
    const { c, folderId } = await caseFor({ firstName: 'Ənvər', lastName: 'Z', passport: 'C9', body: { visaType: 'FAMILY' } });
    const member = await addFamilyMember(c.id, su.user.id, { firstName: 'Leyla', lastName: 'Z', relation: 'spouse' });
    const memberFolder = await folderOf(member.id);
    await waitFor(async () => (await pathOf(memberFolder)).endsWith('/Familie/Leyla Z'));
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: memberFolder } })).parentId).not.toBe(folderId);
    expect(await pathOf(memberFolder)).toBe('Gemeinsame Dokumente/Anträge/Familiennachzug/Ohne Kategorie/Ənvər Z · Pass-Nr. C9/Familie/Leyla Z');
  });
});

describe('shared workspace: case documents become files', () => {
  const uploaded = async () => {
    const x = await caseFor({ firstName: 'Kamran', lastName: 'Aliyev', passport: 'C5' });
    const req = (await clientCase(x.client.agent, x.c.id)).requirements.find((r) => r.stage === 'INITIAL')!;
    const doc = expectStatus(await uploadDoc(x.client.agent, x.c.id, req.id, 'passport.pdf'), 201).body.document as { id: string };
    return { ...x, doc, req };
  };

  it('copies an accepted document into the stage folder; deleting the copy keeps the case document', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const { c, doc, folderId } = await uploaded();
    expect(await prisma.driveNode.count({ where: { documentId: doc.id } })).toBe(0);
    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'ACCEPTED' }), 200);
    const copy = await waitFor(() => prisma.driveNode.findUnique({ where: { documentId: doc.id } }));
    expect(await pathOf(copy.id)).toBe('Gemeinsame Dokumente/Anträge/Arbeitsvisum/Ohne Kategorie/Kamran Aliyev · Pass-Nr. C5/Erstdokumente/passport.pdf');
    expect(copy).toMatchObject({ kind: 'FILE', space: 'SHARED', mimeType: 'application/pdf' });
    expect(fs.existsSync(driveFile(copy.storageKey!))).toBe(true);

    const stage = (await list(staff.agent, folderId)).items[0];
    expect(stage.name).toBe('Erstdokumente');
    const files = (await list(staff.agent, stage.id)).items;
    expect(files[0]).toMatchObject({ id: copy.id, documentId: doc.id, caseId: c.id, caseNumber: c.number, docStatus: 'ACCEPTED', stage: 'INITIAL', myAccess: 'EDIT' });

    // Staff rename it like any file; accepting again does not copy twice.
    expectStatus(await staff.agent.patch(`/api/drive/nodes/${copy.id}`).send({ name: 'Pass.pdf' }), 200);
    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'ACCEPTED' }), 200);
    await new Promise((r) => setTimeout(r, 200));
    expect(await prisma.driveNode.count({ where: { documentId: doc.id } })).toBe(1);

    // Delete for good: the case document stays.
    expectStatus(await staff.agent.post('/api/drive/bulk/delete').send({ ids: [copy.id] }), 200);
    expectStatus(await admin.agent.post('/api/drive/purge').send({ ids: [copy.id] }), 200);
    expect(await prisma.driveNode.findUnique({ where: { id: copy.id } })).toBeNull();
    expect(await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ status: 'ACCEPTED' });
  });

  it('removes the drive copy when a super admin deletes the case document', async () => {
    const su = await asSuperAdmin();
    const { c, doc } = await uploaded();
    expectStatus(await su.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'ACCEPTED' }), 200);
    const copy = await waitFor(() => prisma.driveNode.findUnique({ where: { documentId: doc.id } }));
    expectStatus(await su.agent.delete(`/api/admin/cases/${c.id}/documents/${doc.id}`), 200);
    expect(await prisma.driveNode.findUnique({ where: { id: copy.id } })).toBeNull();
    expect(fs.existsSync(driveFile(copy.storageKey!))).toBe(false);
  });

  it('backfill creates missing folders and copies accepted documents once', async () => {
    const { c, doc, folderId } = await uploaded();
    // An old case without a folder, and a document accepted before the drive copied anything.
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'ACCEPTED' } });
    await prisma.case.update({ where: { id: c.id }, data: { driveFolderId: null } });
    await prisma.driveNode.delete({ where: { id: folderId } });

    const first = await backfillCaseDrive();
    expect(first).toMatchObject({ folders: 1, copied: 1, missing: 0 });
    const newFolder = (await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).driveFolderId!;
    const copy = await prisma.driveNode.findUniqueOrThrow({ where: { documentId: doc.id } });
    expect(await pathOf(copy.id)).toBe(`${await pathOf(newFolder)}/Erstdokumente/passport.pdf`);

    const second = await backfillCaseDrive();
    expect(second).toMatchObject({ folders: 0, copied: 0, existing: 1 });
    expect(await prisma.driveNode.count({ where: { documentId: doc.id } })).toBe(1);
  });
});

describe('shared workspace: bulk actions', () => {
  it('bulk delete and move with per-item permission and system-folder guards, one audit entry each', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const r = await roots(staff.agent);
    const mk = async (parentId: string, name: string) => expectStatus(await staff.agent.post(`/api/drive/nodes/${parentId}/folders`).send({ name }), 201).body.item as { id: string };
    const a = await mk(r.shared.id, 'A');
    const b = await mk(r.shared.id, 'B');
    const target = await mk(r.shared.id, 'Ziel');
    const f1 = expectStatus(await staff.agent.post(`/api/drive/nodes/${a.id}/files`).attach('file', await makePdf('1'), { filename: 'one.pdf', contentType: 'application/pdf' }), 201).body.item;
    const locked = expectStatus(await su.agent.post(`/api/drive/nodes/${r.shared.id}/folders`).send({ name: 'Locked' }), 201).body.item;
    expectStatus(await su.agent.patch(`/api/drive/nodes/${locked.id}/inheritance`).send({ inherit: false }), 200);

    const mv = expectStatus(await staff.agent.post('/api/drive/bulk/move').send({ ids: [a.id, b.id, r.cases.id, locked.id, target.id], targetId: target.id }), 200).body;
    expect(mv).toMatchObject({ ok: 2, failed: 3 });
    const err = Object.fromEntries(mv.results.map((x: { id: string; error?: string }) => [x.id, x.error ?? 'ok']));
    expect(err).toEqual({ [a.id]: 'ok', [b.id]: 'ok', [r.cases.id]: 'SYSTEM_NODE', [locked.id]: 'NODE_NOT_FOUND', [target.id]: 'INTO_ITSELF' });
    expect(await pathOf(f1.id)).toBe('Gemeinsame Dokumente/Ziel/A/one.pdf');
    expect((await staff.agent.post('/api/drive/bulk/move').send({ ids: [a.id], targetId: locked.id })).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_BULK_MOVED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_MOVED' } })).toBe(0);

    const del = expectStatus(await staff.agent.post('/api/drive/bulk/delete').send({ ids: [a.id, b.id, r.staff.id, locked.id] }), 200).body;
    expect(del).toMatchObject({ ok: 2, failed: 2 });
    expect(await prisma.driveNode.count({ where: { id: { in: [a.id, b.id, f1.id] }, deletedAt: { not: null } } })).toBe(3);
    const audit = await prisma.auditLog.findMany({ where: { action: 'DRIVE_BULK_TRASHED' } });
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ requested: 4, deleted: 2, failed: 2, nodes: 3 });
    expect((await staff.agent.post('/api/drive/bulk/delete').send({ ids: [] })).status).toBe(400);

    // Restore is for everyone, the permanent purge for admins.
    expect(expectStatus(await staff.agent.post('/api/drive/restore').send({ ids: [a.id] }), 200).body.results[0].ok).toBe(true);
    expect(await prisma.driveNode.findUniqueOrThrow({ where: { id: f1.id } })).toMatchObject({ deletedAt: null });
    expect((await staff.agent.post('/api/drive/purge').send({ ids: [b.id] })).body.results[0].error).toBe('INSUFFICIENT_ACCESS');
    expect(expectStatus(await su.agent.post('/api/drive/purge').send({ ids: [b.id] }), 200).body.results[0].ok).toBe(true);
  });
});
