import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { makePdf } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { cleanupWorkFolders, runDriveStartup } from '../../src/lib/drive/layout.js';
import { ensureSharedRoot } from '../../src/lib/drive/roots.js';

const roots = async (a: Agent) => expectStatus(await a.get('/api/drive/roots'), 200).body;
const trash = (a: Agent, ids: string[]) => a.post('/api/drive/trash').send({ ids });
const rename = (a: Agent, id: string, name: string) => a.patch(`/api/drive/nodes/${id}`).send({ name });
const upload = async (a: Agent, parentId: string, filename: string) =>
  expectStatus(await a.post(`/api/drive/nodes/${parentId}/files`).attach('file', await makePdf(filename), { filename, contentType: 'application/pdf' }), 201).body.item;

const folderOfCase = (caseId: string) =>
  waitFor(async () => (await prisma.case.findUnique({ where: { id: caseId }, select: { driveFolderId: true } }))?.driveFolderId ?? null);

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

describe('drive sections: super admins may change everything', () => {
  it('super admins rename, move and delete sections; staff and admins cannot; the root stays', async () => {
    const su = await asSuperAdmin();
    const admin = await asAdmin();
    const staff = await asStaff();
    const r = await roots(staff.agent);

    // Staff and admins: content yes, sections no.
    expect((await rename(staff.agent, r.templates.id, 'Muster')).body.error).toBe('SYSTEM_NODE');
    expect((await trash(admin.agent, [r.templates.id])).body.results[0].error).toBe('SYSTEM_NODE');
    expect((await staff.agent.post('/api/drive/move').send({ ids: [r.templates.id], targetId: r.staff.id })).body.results[0].error).toBe('SYSTEM_NODE');
    const doc = await upload(staff.agent, r.templates.id, 'Vorlage.pdf');
    expectStatus(await rename(staff.agent, doc.id, 'Muster.pdf'), 200);

    // Super admin: rename a section — it keeps being the section (found by id, not by name).
    expect(expectStatus(await rename(su.agent, r.cases.id, 'Anträge (Visa)'), 200).body.item.name).toBe('Anträge (Visa)');
    const client = await asClient({ firstName: 'Nərmin', lastName: 'Həsənova' });
    const c = expectStatus(await client.agent.post('/api/cases').send({ profession: 'Aşpaz' }), 201).body.case;
    const folderId = await folderOfCase(c.id);
    expect(await pathOf(folderId)).toBe(`Gemeinsame Dokumente/Anträge (Visa)/Arbeitsvisum/Ohne Kategorie/Nərmin Həsənova · ${c.number}`);
    expect((await roots(staff.agent)).cases).toMatchObject({ id: r.cases.id, name: 'Anträge (Visa)' });

    // Move a section: still found.
    expectStatus(await su.agent.post('/api/drive/move').send({ ids: [r.templates.id], targetId: r.staff.id }), 200);
    expect((await roots(staff.agent)).templates).toMatchObject({ id: r.templates.id, parentId: r.staff.id });

    // Delete a section: it goes to the bin with its content and is NOT created again by the layout job.
    expect(expectStatus(await trash(su.agent, [r.templates.id]), 200).body.results[0]).toMatchObject({ ok: true });
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: doc.id } })).deletedAt).not.toBeNull();
    await runDriveStartup(() => undefined);
    const after = await roots(staff.agent);
    expect(after.templates).toBeNull();
    expect(after.sections.templates).toBeUndefined();
    expect(await prisma.driveNode.count({ where: { name: 'Vorlagen', deletedAt: null } })).toBe(0);

    // Restoring it brings the section back (same id).
    expectStatus(await su.agent.post('/api/drive/restore').send({ ids: [r.templates.id] }), 200);
    expect((await roots(staff.agent)).templates).toMatchObject({ id: r.templates.id });

    // Client and partner folders are ordinary folders; the shared root can never go.
    expect(expectStatus(await trash(su.agent, [folderId]), 200).body.results[0].ok).toBe(true);
    expect((await trash(su.agent, [r.shared.id])).body.results[0].error).toBe('SYSTEM_NODE');
    expect((await rename(su.agent, r.shared.id, 'X')).body.error).toBe('SYSTEM_NODE');

    // Purging a deleted section stays with admins.
    expectStatus(await trash(su.agent, [r.staff.id]), 200);
    expect((await staff.agent.post('/api/drive/purge').send({ ids: [r.staff.id] })).body.results[0].error).toBe('INSUFFICIENT_ACCESS');
    expect(expectStatus(await admin.agent.post('/api/drive/purge').send({ ids: [r.staff.id] }), 200).body.results[0].ok).toBe(true);
    expect(await prisma.driveNode.findUnique({ where: { id: r.staff.id } })).toBeNull();
    expect((await roots(staff.agent)).staff).toBeNull();
  });

  it('a deleted "Partner" section comes back (restored from the bin) when a partner needs it, "Anträge" when a case needs it', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const r = await roots(staff.agent);
    expectStatus(await trash(su.agent, [r.partners.id, r.cases.id]), 200);
    expect((await roots(staff.agent)).partners).toBeNull();

    const created = expectStatus(await staff.agent.post('/api/admin/partners').send({ name: 'Elvin' }), 201).body;
    const folder = await prisma.driveNode.findUniqueOrThrow({ where: { id: created.folderId }, include: { parent: true } });
    expect(folder.parent).toMatchObject({ name: 'Partner', system: true, parentId: r.shared.id, deletedAt: null });
    // The trashed section itself is restored (same id), not duplicated.
    expect(folder.parentId).toBe(r.partners.id);
    expect((await roots(staff.agent)).partners).toMatchObject({ id: folder.parentId });

    const client = await asClient({ firstName: 'Orxan', lastName: 'Bayramov' });
    const c = expectStatus(await client.agent.post('/api/cases').send({ profession: 'Aşpaz' }), 201).body.case;
    const caseFolder = await folderOfCase(c.id);
    expect(await pathOf(caseFolder)).toBe(`Gemeinsame Dokumente/Anträge/Arbeitsvisum/Ohne Kategorie/Orxan Bayramov · ${c.number}`);
    const fresh = await roots(staff.agent);
    expect(fresh.cases.id).toBe(r.cases.id);
    // Only one live section of each kind.
    expect(await prisma.driveNode.count({ where: { name: 'Partner', system: true, deletedAt: null } })).toBe(1);
    expect(await prisma.driveNode.count({ where: { name: 'Anträge', system: true, deletedAt: null } })).toBe(1);
  });

  it('"In Bearbeitung" is no longer created; an old empty one goes to the bin, a non-empty one stays as an ordinary folder', async () => {
    const staff = await asStaff();
    const r = await roots(staff.agent);
    expect(await prisma.driveNode.count({ where: { name: 'In Bearbeitung' } })).toBe(0);

    const sharedId = await ensureSharedRoot();
    const empty = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'In Bearbeitung', parentId: sharedId, system: true, color: 'amber' } });
    await runDriveStartup(() => undefined);
    const gone = await prisma.driveNode.findUniqueOrThrow({ where: { id: empty.id } });
    expect(gone.deletedAt).not.toBeNull();
    // It is in the bin (restorable), not purged.
    expect(expectStatus(await staff.agent.get('/api/drive/trash'), 200).body.items.map((i: { id: string }) => i.id)).toContain(empty.id);

    const full = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'In Bearbeitung', parentId: sharedId, system: true } });
    const file = await upload(staff.agent, full.id, 'Korrektur.pdf');
    expect(await cleanupWorkFolders()).toMatchObject({ trashed: 0, kept: [full.id] });
    expect(await prisma.driveNode.findUniqueOrThrow({ where: { id: full.id } })).toMatchObject({ system: false, deletedAt: null });
    expect(await prisma.driveNode.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({ deletedAt: null, parentId: full.id });
    // Now an ordinary folder: staff may rename or delete it (like "Transport").
    expectStatus(await rename(staff.agent, full.id, 'Transport'), 200);
    expect(expectStatus(await trash(staff.agent, [full.id]), 200).body.results[0].ok).toBe(true);
    // Idempotent.
    expect(await cleanupWorkFolders()).toMatchObject({ trashed: 0, kept: [] });
    expect((await roots(staff.agent)).shared.id).toBe(r.shared.id);
  });
});
