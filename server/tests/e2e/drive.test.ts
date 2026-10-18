import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { binaryParser, makePdf, SAMPLE } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { TEST_DOCS_DIR } from '../helpers/testEnv';
import { purgeExpiredTrash } from '../../src/lib/drive/trash.js';

const PDF = { contentType: 'application/pdf' } as const;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const storedFile = (key: string) => path.join(TEST_DOCS_DIR, 'drive', key);

const roots = async (a: Agent) => expectStatus(await a.get('/api/drive/roots'), 200).body;
const list = async (a: Agent, id: string) => a.get(`/api/drive/nodes/${encodeURIComponent(id)}/children`);
const mkdir = async (a: Agent, parentId: string, name: string) => a.post(`/api/drive/nodes/${encodeURIComponent(parentId)}/folders`).send({ name });
const upload = async (a: Agent, parentId: string, filename: string, opts: { body?: Buffer; type?: string; onConflict?: string; relativeDir?: string } = {}) => {
  const req = a.post(`/api/drive/nodes/${encodeURIComponent(parentId)}/files`);
  if (opts.onConflict) req.field('onConflict', opts.onConflict);
  if (opts.relativeDir) req.field('relativeDir', opts.relativeDir);
  return req.attach('file', opts.body ?? (await makePdf(filename)), { filename, contentType: opts.type ?? 'application/pdf' });
};
const grant = (a: Agent, nodeId: string, body: Record<string, unknown>) => a.put(`/api/drive/nodes/${encodeURIComponent(nodeId)}/grants`).send(body);
const download = (a: Agent, url: string) => a.get(url).buffer(true).parse(binaryParser);

/** Names of the entries of a (stored, uncompressed) ZIP, read from its central directory. */
const zipNames = (buf: Buffer) => {
  const end = buf.length - 22;
  expect(buf.readUInt32LE(end)).toBe(0x06054b50);
  const count = buf.readUInt16LE(end + 10);
  let off = buf.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const len = buf.readUInt16LE(off + 28);
    names.push(buf.subarray(off + 46, off + 46 + len).toString('utf8'));
    off += 46 + len + buf.readUInt16LE(off + 30) + buf.readUInt16LE(off + 32);
  }
  return names.sort();
};

/** A folder below the shared root that only the super admin sees (inheritance off, no grants). */
const restricted = async (su: Agent, parentId: string, name: string) => {
  const f = expectStatus(await mkdir(su, parentId, name), 201).body.item;
  expectStatus(await su.patch(`/api/drive/nodes/${f.id}/inheritance`).send({ inherit: false }), 200);
  return f as { id: string; name: string };
};

describe('drive: one shared workspace', () => {
  it('seeds "Gemeinsame Dokumente" once with its system folders; every staff member edits it', async () => {
    const staff = await asStaff({ firstName: 'Aynur', lastName: 'Q' });
    const r = await roots(staff.agent);
    expect(r.shared).toMatchObject({ space: 'SHARED', system: true, myAccess: 'EDIT', name: 'Gemeinsame Dokumente', parentId: null });
    expect(r.cases).toMatchObject({ name: 'Anträge', system: true, parentId: r.shared.id, myAccess: 'EDIT' });
    expect(r.partners).toMatchObject({ name: 'Partner', system: true, parentId: r.shared.id });
    expect(r.staff).toMatchObject({ name: 'Mitarbeiter', system: true, parentId: r.shared.id });
    expect(r.work).toMatchObject({ name: 'In Bearbeitung', system: true, parentId: r.shared.id, myAccess: 'EDIT' });
    expect(r.templates).toMatchObject({ name: 'Vorlagen', system: true, parentId: r.shared.id });
    // The clients workbook folder is for super admins only.
    expect(r.clients).toBeNull();
    expect(r.personal).toBeUndefined();
    expect(r.limits.maxFileBytes).toBe(50 * 1024 * 1024);

    await Promise.all([roots(staff.agent), roots(staff.agent)]);
    expect(await prisma.driveNode.count({ where: { parentId: null } })).toBe(1);
    expect(await prisma.driveNode.count({ where: { space: { in: ['PERSONAL', 'CASES'] } } })).toBe(0);
    const grants = await prisma.driveGrant.findMany({ where: { nodeId: r.shared.id } });
    expect(grants.map((g) => [g.role, g.access])).toEqual([['STAFF', 'EDIT']]);

    const admin = await asAdmin();
    const su = await asSuperAdmin();
    expect((await roots(admin.agent)).shared.myAccess).toBe('EDIT');
    const rs = await roots(su.agent);
    expect(rs.shared.myAccess).toBe('MANAGE');
    expect(rs.clients).toMatchObject({ name: 'Alle Kunden', system: true, inheritPermissions: false });
  });

  it('is staff only and needs 2FA', async () => {
    const client = await asClient();
    expect((await client.agent.get('/api/drive/roots')).status).toBe(403);
    const staff = await asStaff({ twoFactor: false });
    expect((await staff.agent.get('/api/drive/roots')).body.error).toBe('TWO_FACTOR_ENROLLMENT_REQUIRED');
  });
});

describe('drive: optional restrictions (permission engine end to end)', () => {
  it('a folder with inheritance off is hidden until a grant opens it', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const other = await asStaff();
    const { shared } = await roots(su.agent);

    // Everybody creates in the shared workspace.
    expectStatus(await mkdir(staff.agent, shared.id, 'Mine'), 201);
    const hr = await restricted(su.agent, shared.id, 'HR');
    const contracts = expectStatus(await mkdir(su.agent, hr.id, 'Contracts'), 201).body.item;
    expect((await mkdir(su.agent, hr.id, 'contracts')).body.error).toBe('NAME_EXISTS');
    expect((await list(staff.agent, hr.id)).status).toBe(404);
    expect(expectStatus(await list(staff.agent, shared.id), 200).body.items.map((i: { name: string }) => i.name)).toEqual(expect.not.arrayContaining(['HR']));

    // Grant EDIT to one person on HR: inherited by Contracts.
    expectStatus(await grant(su.agent, hr.id, { userId: staff.user.id, access: 'EDIT' }), 200);
    expectStatus(await upload(staff.agent, contracts.id, 'offer.pdf'), 201);
    expect((await upload(other.agent, contracts.id, 'nope.pdf')).status).toBe(404);
    const listing = expectStatus(await list(staff.agent, contracts.id), 200).body;
    expect(listing.path.map((c: { name: string }) => c.name)).toEqual(['Gemeinsame Dokumente', 'HR', 'Contracts']);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: staff.user.id, type: 'DRIVE_SHARED' } });
    expect(n.link).toBe(`/workspace/drive/f/${hr.id}`);
    expect(n.title).toContain('qovluq paylaşdı');

    // Break inheritance on Contracts too: the staff member loses it again; "copy inherited" brings it back.
    expectStatus(await su.agent.patch(`/api/drive/nodes/${contracts.id}/inheritance`).send({ inherit: false }), 200);
    expect((await list(staff.agent, contracts.id)).status).toBe(404);
    expectStatus(await su.agent.patch(`/api/drive/nodes/${contracts.id}/inheritance`).send({ inherit: true }), 200);
    const off = expectStatus(await su.agent.patch(`/api/drive/nodes/${contracts.id}/inheritance`).send({ inherit: false, copyInherited: true }), 200).body;
    expect(off.copied).toBe(1);
    const access = expectStatus(await su.agent.get(`/api/drive/nodes/${contracts.id}/access`), 200).body;
    expect(access.entries.filter((e: { inherited: boolean }) => !e.inherited).map((e: { userId: string | null; access: string }) => [e.userId, e.access])).toEqual([[staff.user.id, 'EDIT']]);
    expect((await list(staff.agent, contracts.id)).status).toBe(200);
  });

  it('only MANAGE changes grants; nobody grants super admins; bad input is refused', async () => {
    const su = await asSuperAdmin();
    const lead = await asStaff();
    const editor = await asStaff();
    const { shared } = await roots(su.agent);
    const folder = expectStatus(await mkdir(lead.agent, shared.id, 'Team'), 201).body.item;
    // EDIT (everybody's default) is not MANAGE.
    expect((await grant(editor.agent, folder.id, { role: 'STAFF', access: 'VIEW' })).status).toBe(403);
    expectStatus(await grant(su.agent, folder.id, { userId: lead.user.id, access: 'MANAGE' }), 200);
    expectStatus(await grant(lead.agent, folder.id, { userId: editor.user.id, access: 'EDIT' }), 200);
    expect((await grant(lead.agent, folder.id, { userId: su.user.id, access: 'VIEW' })).body.error).toBe('USER_ALWAYS_HAS_ACCESS');
    expect((await grant(lead.agent, folder.id, { userId: (await asClient()).user.id, access: 'VIEW' })).body.error).toBe('INVALID_USER');
    expect((await grant(lead.agent, folder.id, { role: 'STAFF', userId: editor.user.id, access: 'VIEW' })).status).toBe(400);
    expect((await grant(lead.agent, folder.id, { role: 'SUPER_ADMIN', access: 'VIEW' })).status).toBe(400);
    expect((await grant(lead.agent, folder.id, { userId: editor.user.id, access: 'OWNER' })).status).toBe(400);
    const access = expectStatus(await lead.agent.get(`/api/drive/nodes/${folder.id}/access`), 200).body;
    expect(access.canManage).toBe(true);
    const g = access.entries.find((e: { userId: string }) => e.userId === editor.user.id);
    expectStatus(await lead.agent.delete(`/api/drive/nodes/${folder.id}/grants/${g.grantId}`), 200);
    const actions = (await prisma.auditLog.findMany({ where: { action: { startsWith: 'DRIVE_GRANT' } } })).map((a) => a.action).sort();
    expect(actions).toEqual(['DRIVE_GRANT_REMOVED', 'DRIVE_GRANT_SET', 'DRIVE_GRANT_SET']);
  });

  it('a MANAGE holder who breaks inheritance keeps control', async () => {
    const su = await asSuperAdmin();
    const lead = await asStaff();
    const { shared } = await roots(su.agent);
    const team = expectStatus(await mkdir(su.agent, shared.id, 'Team'), 201).body.item;
    const sub = expectStatus(await mkdir(su.agent, team.id, 'Sub'), 201).body.item;
    expectStatus(await grant(su.agent, team.id, { userId: lead.user.id, access: 'MANAGE' }), 200);
    expectStatus(await lead.agent.patch(`/api/drive/nodes/${sub.id}/inheritance`).send({ inherit: false }), 200);
    expect(expectStatus(await list(lead.agent, sub.id), 200).body.folder.myAccess).toBe('MANAGE');
    expect((await su.agent.patch(`/api/drive/nodes/${shared.id}/inheritance`).send({ inherit: false })).body.error).toBe('ROOT_HAS_NO_PARENT');
  });
});

describe('drive: files', () => {
  it('uploads, detects name clashes, renames, replaces as a new version and restores old versions', async () => {
    const staff = await asStaff();
    const { shared } = await roots(staff.agent);
    const first = expectStatus(await upload(staff.agent, shared.id, 'Report.pdf'), 201).body.item;
    expect(first).toMatchObject({ kind: 'FILE', name: 'Report.pdf', mimeType: 'application/pdf', version: 1, myAccess: 'EDIT', previewable: true });
    const key1 = (await prisma.driveNode.findUniqueOrThrow({ where: { id: first.id } })).storageKey!;
    expect(fs.existsSync(storedFile(key1))).toBe(true);

    const clash = await upload(staff.agent, shared.id, 'report.PDF');
    expect(clash.status).toBe(409);
    expect(clash.body).toMatchObject({ error: 'NAME_EXISTS', existingId: first.id });
    const renamed = expectStatus(await upload(staff.agent, shared.id, 'Report.pdf', { onConflict: 'rename' }), 201).body.item;
    expect(renamed.name).toBe('Report (2).pdf');

    const v2 = expectStatus(await upload(staff.agent, shared.id, 'Report.pdf', { onConflict: 'replace', body: await makePdf('second version') }), 201).body;
    expect(v2.replaced).toBe(true);
    expect(v2.item).toMatchObject({ id: first.id, version: 2 });
    const props = expectStatus(await staff.agent.get(`/api/drive/nodes/${first.id}`), 200).body;
    expect(props.details.versions).toHaveLength(1);
    expect(props.details.versions[0]).toMatchObject({ version: 1, uploadedBy: { id: staff.user.id } });
    expect(props.details.modifiedBy.id).toBe(staff.user.id);

    const old = await download(staff.agent, `/api/drive/nodes/${first.id}/versions/${props.details.versions[0].id}/content`);
    expect(old.status).toBe(200);
    expect(old.headers['content-disposition']).toContain('Report%20(v1).pdf');
    expect(Buffer.compare(old.body as Buffer, fs.readFileSync(storedFile(key1)))).toBe(0);

    const restored = expectStatus(await staff.agent.post(`/api/drive/nodes/${first.id}/versions/${props.details.versions[0].id}/restore`), 200).body.item;
    expect(restored.version).toBe(3);
    expect(await prisma.driveFileVersion.count({ where: { nodeId: first.id } })).toBe(2);

    // Folder upload: sub-folders are created on the way.
    const deep = expectStatus(await upload(staff.agent, shared.id, 'x.pdf', { relativeDir: 'Scans/2026' }), 201).body.item;
    const scans = (await prisma.driveNode.findFirstOrThrow({ where: { name: 'Scans', parentId: shared.id } })).id;
    const y2026 = await prisma.driveNode.findFirstOrThrow({ where: { name: '2026', parentId: scans } });
    expect(deep.parentId).toBe(y2026.id);
    expect((await upload(staff.agent, shared.id, 'y.pdf', { relativeDir: '../evil' })).status).toBe(400);

    const actions = (await prisma.auditLog.findMany({ where: { action: { startsWith: 'DRIVE_FILE' } } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['DRIVE_FILE_UPLOADED', 'DRIVE_FILE_VERSION_ADDED', 'DRIVE_FILE_VERSION_RESTORED']));
  });

  it('checks content: spoofed or unsupported files are refused and nothing stays on disk', async () => {
    const staff = await asStaff();
    const { shared } = await roots(staff.agent);
    expect((await upload(staff.agent, shared.id, 'fake.pdf', { body: Buffer.from('<html><script>alert(1)</script>') })).body.error).toBe('FILE_CONTENT_MISMATCH');
    expect((await upload(staff.agent, shared.id, 'tool.exe', { body: Buffer.from('MZ'), type: 'application/octet-stream' })).body.error).toBe('UNSUPPORTED_FILE_TYPE');
    expect((await upload(staff.agent, shared.id, 'pic.svg', { body: SAMPLE.svg, type: 'image/svg+xml' })).body.error).toBe('UNSUPPORTED_FILE_TYPE');
    expect(await prisma.driveNode.count({ where: { kind: 'FILE' } })).toBe(0);
    // Office documents are fine.
    expectStatus(await upload(staff.agent, shared.id, 'letter.docx', { body: SAMPLE.zip, type: DOCX }), 201);
  });

  it('previews inline-safe files with VIEW, downloads need DOWNLOAD (restricted folder)', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const { shared } = await roots(su.agent);
    const policies = await restricted(su.agent, shared.id, 'Policies');
    expectStatus(await grant(su.agent, policies.id, { role: 'STAFF', access: 'VIEW' }), 200);
    const pdf = expectStatus(await upload(su.agent, policies.id, 'Policy.pdf'), 201).body.item;
    const docx = expectStatus(await upload(su.agent, policies.id, 'Policy.docx', { body: SAMPLE.zip, type: DOCX }), 201).body.item;

    const preview = await download(staff.agent, `/api/drive/nodes/${pdf.id}/content`);
    expect(preview.status).toBe(200);
    expect(preview.headers['content-disposition']).toMatch(/^inline/);
    expect(preview.headers['x-content-type-options']).toBe('nosniff');
    expect(preview.headers['content-security-policy']).toContain('sandbox');
    expect((await staff.agent.get(`/api/drive/nodes/${pdf.id}/content?download=1`)).status).toBe(403);
    expect((await staff.agent.get(`/api/drive/nodes/${docx.id}/content`)).status).toBe(403);

    expectStatus(await grant(su.agent, policies.id, { role: 'STAFF', access: 'DOWNLOAD' }), 200);
    const dl = await download(staff.agent, `/api/drive/nodes/${docx.id}/content`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toMatch(/^attachment/);
    expect((await staff.agent.get(`/api/drive/nodes/does-not-exist/content`)).status).toBe(404);
  });

  it('renames (keeping the extension), colours folders (MANAGE) and protects the system folders', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const { shared, cases, partners, staff: staffRoot } = await roots(staff.agent);
    const f = expectStatus(await upload(staff.agent, shared.id, 'a.pdf'), 201).body.item;
    expectStatus(await upload(staff.agent, shared.id, 'b.pdf'), 201);
    expect(expectStatus(await staff.agent.patch(`/api/drive/nodes/${f.id}`).send({ name: 'Invoice.pdf' }), 200).body.item.name).toBe('Invoice.pdf');
    expect((await staff.agent.patch(`/api/drive/nodes/${f.id}`).send({ name: 'Invoice.exe' })).body.error).toBe('EXTENSION_CHANGE_NOT_ALLOWED');
    expect((await staff.agent.patch(`/api/drive/nodes/${f.id}`).send({ name: 'b.pdf' })).body.error).toBe('NAME_EXISTS');
    expect((await staff.agent.patch(`/api/drive/nodes/${f.id}`).send({ name: '../x.pdf' })).body.error).toBe('INVALID_FILE_NAME');
    for (const sys of [shared, cases, partners, staffRoot]) {
      expect((await su.agent.patch(`/api/drive/nodes/${sys.id}`).send({ name: 'Other' })).body.error).toBe('SYSTEM_NODE');
      expect((await su.agent.post('/api/drive/trash').send({ ids: [sys.id] })).body.results[0].error).toBe('SYSTEM_NODE');
    }
    const dir = expectStatus(await mkdir(staff.agent, shared.id, 'Blue'), 201).body.item;
    expect((await staff.agent.patch(`/api/drive/nodes/${dir.id}`).send({ color: 'blue' })).status).toBe(403);
    expect(expectStatus(await su.agent.patch(`/api/drive/nodes/${dir.id}`).send({ color: 'blue' }), 200).body.item.color).toBe('blue');
    expect((await su.agent.patch(`/api/drive/nodes/${dir.id}`).send({ color: 'url(evil)' })).status).toBe(400);
  });

  it('moves and copies between folders, refusing cycles, system folders and restricted targets', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const { shared, cases } = await roots(staff.agent);
    const a = expectStatus(await mkdir(staff.agent, shared.id, 'A'), 201).body.item;
    const b = expectStatus(await mkdir(staff.agent, a.id, 'B'), 201).body.item;
    const file = expectStatus(await upload(staff.agent, a.id, 'doc.pdf'), 201).body.item;
    expectStatus(await upload(staff.agent, b.id, 'doc.pdf'), 201);

    const mv = expectStatus(await staff.agent.post('/api/drive/move').send({ ids: [file.id], targetId: b.id }), 200).body.results;
    expect(mv).toEqual([{ id: file.id, ok: true, name: 'doc (2).pdf' }]);
    expect((await staff.agent.post('/api/drive/move').send({ ids: [a.id], targetId: b.id })).body.results[0].error).toBe('INTO_ITSELF');
    expect((await staff.agent.post('/api/drive/move').send({ ids: [cases.id], targetId: a.id })).body.results[0].error).toBe('SYSTEM_NODE');
    const locked = await restricted(su.agent, shared.id, 'Locked');
    expect((await staff.agent.post('/api/drive/move').send({ ids: [a.id], targetId: locked.id })).status).toBe(404);

    // Copy keeps the original and gives the copy fresh files.
    const cp = expectStatus(await staff.agent.post('/api/drive/copy').send({ ids: [a.id], targetId: shared.id }), 200).body.results;
    expect(cp[0]).toMatchObject({ ok: true });
    const copies = await prisma.driveNode.findMany({ where: { parentId: shared.id, kind: 'FOLDER', system: false, name: { startsWith: 'A' } }, orderBy: { name: 'asc' } });
    expect(copies.map((c) => c.name)).toEqual(['A', 'A (2)']);
    expect(await prisma.driveNode.count({ where: { kind: 'FILE' } })).toBe(4);
    expect((await staff.agent.post('/api/drive/copy').send({ ids: [a.id], targetId: b.id })).body.results[0].error).toBe('INTO_ITSELF');
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_MOVED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_COPIED' } })).toBe(1);
  });

  it('recycle bin: trash, list, restore (with rename on clash), purge (admins) and the 30-day job', async () => {
    const staff = await asStaff();
    const colleague = await asStaff();
    const admin = await asAdmin();
    const { shared } = await roots(staff.agent);
    const dir = expectStatus(await mkdir(staff.agent, shared.id, 'Old'), 201).body.item;
    const inner = expectStatus(await upload(staff.agent, dir.id, 'inner.pdf'), 201).body.item;
    const innerKey = (await prisma.driveNode.findUniqueOrThrow({ where: { id: inner.id } })).storageKey!;
    expectStatus(await staff.agent.put(`/api/drive/nodes/${dir.id}/star`), 200);

    expect(expectStatus(await staff.agent.post('/api/drive/trash').send({ ids: [dir.id] }), 200).body.results[0].ok).toBe(true);
    expect(expectStatus(await list(staff.agent, shared.id), 200).body.items.map((i: { id: string }) => i.id)).not.toContain(dir.id);
    expect((await list(staff.agent, dir.id)).status).toBe(404);
    expect((await staff.agent.get(`/api/drive/nodes/${inner.id}/content`)).status).toBe(404);
    expect(expectStatus(await staff.agent.get('/api/drive/starred'), 200).body.items).toEqual([]);
    // One bin for the whole team: a colleague sees it too.
    const trash = expectStatus(await colleague.agent.get('/api/drive/trash'), 200).body;
    expect(trash.items.map((i: { id: string }) => i.id)).toEqual([dir.id]);
    expect(trash.items[0].deletedBy.id).toBe(staff.user.id);
    expect(trash.trashDays).toBe(30);
    expect(trash.canPurge).toBe(false);
    expect((await staff.agent.post('/api/drive/restore').send({ ids: [inner.id] })).body.results[0].error).toBe('NOT_A_TRASH_ROOT');

    // A new folder with the same name appeared meanwhile: the restored one is renamed.
    expectStatus(await mkdir(staff.agent, shared.id, 'Old'), 201);
    const rs = expectStatus(await colleague.agent.post('/api/drive/restore').send({ ids: [dir.id] }), 200).body.results[0];
    expect(rs).toMatchObject({ ok: true, name: 'Old (2)' });
    expect(expectStatus(await list(staff.agent, dir.id), 200).body.items.map((i: { id: string }) => i.id)).toEqual([inner.id]);

    // Delete for good: admins and above only.
    expectStatus(await staff.agent.post('/api/drive/trash').send({ ids: [dir.id] }), 200);
    expect((await staff.agent.post('/api/drive/purge').send({ ids: [dir.id] })).body.results[0].error).toBe('INSUFFICIENT_ACCESS');
    expect((await staff.agent.delete('/api/drive/trash')).status).toBe(403);
    expect(expectStatus(await admin.agent.post('/api/drive/purge').send({ ids: [dir.id] }), 200).body.results[0].ok).toBe(true);
    expect(await prisma.driveNode.findUnique({ where: { id: inner.id } })).toBeNull();
    expect(fs.existsSync(storedFile(innerKey))).toBe(false);

    // The job purges only what has been in the bin longer than 30 days.
    const keep = expectStatus(await upload(staff.agent, shared.id, 'keep.pdf'), 201).body.item;
    const expire = expectStatus(await upload(staff.agent, shared.id, 'expire.pdf'), 201).body.item;
    expectStatus(await staff.agent.post('/api/drive/trash').send({ ids: [keep.id, expire.id] }), 200);
    await prisma.driveNode.update({ where: { id: expire.id }, data: { deletedAt: new Date(Date.now() - 31 * 24 * 3600 * 1000) } });
    const r = await purgeExpiredTrash();
    expect(r).toMatchObject({ roots: 1, nodes: 1 });
    expect(await prisma.driveNode.findUnique({ where: { id: expire.id } })).toBeNull();
    expect(await prisma.driveNode.findUnique({ where: { id: keep.id } })).not.toBeNull();

    expect(expectStatus(await admin.agent.get('/api/drive/trash'), 200).body.canPurge).toBe(true);
    expectStatus(await admin.agent.delete('/api/drive/trash'), 200);
    expect(await prisma.driveNode.findUnique({ where: { id: keep.id } })).toBeNull();
    const actions = new Set((await prisma.auditLog.findMany({ select: { action: true } })).map((a) => a.action));
    for (const a of ['DRIVE_TRASHED', 'DRIVE_RESTORED', 'DRIVE_PURGED', 'DRIVE_TRASH_EMPTIED']) expect(actions.has(a), a).toBe(true);
  });

  it('exports folders and selections as ZIP, only what is visible', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const { shared } = await roots(su.agent);
    const proj = expectStatus(await mkdir(su.agent, shared.id, 'Project'), 201).body.item;
    const secret = await restricted(su.agent, proj.id, 'Secret');
    const plan = expectStatus(await upload(su.agent, proj.id, 'plan.pdf'), 201).body.item;
    expectStatus(await upload(su.agent, secret.id, 'hidden.pdf'), 201);

    const zip = await download(staff.agent, `/api/drive/export?ids=${proj.id}`);
    expect(zip.status).toBe(200);
    expect(zip.headers['content-type']).toBe('application/zip');
    expect(zipNames(zip.body as Buffer)).toEqual(['Project/plan.pdf']);
    const all = await download(su.agent, `/api/drive/export?ids=${proj.id}`);
    expect(zipNames(all.body as Buffer)).toEqual(['Project/Secret/hidden.pdf', 'Project/plan.pdf']);
    expect((await staff.agent.get(`/api/drive/export?ids=${secret.id}`)).status).toBe(404);
    // A selection of several items.
    const sel = await download(staff.agent, `/api/drive/export?ids=${plan.id},${proj.id}`);
    expect(zipNames(sel.body as Buffer)).toEqual(['Project/plan.pdf', 'plan.pdf']);
    // The audit row is written after the ZIP stream ends, so wait for it instead of racing the response.
    await waitFor(async () => (await prisma.auditLog.count({ where: { action: 'DRIVE_EXPORTED' } })) === 3);
  });
});

describe('drive: navigation helpers', () => {
  it('search, recent, starred, stats, people and properties', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff({ firstName: 'Zaur' });
    const other = await asStaff({ firstName: 'Leyla' });
    const { shared } = await roots(staff.agent);
    const dir = expectStatus(await mkdir(staff.agent, shared.id, 'Invoices 2026'), 201).body.item;
    const f = expectStatus(await upload(staff.agent, dir.id, 'Invoice-17.pdf'), 201).body.item;
    const locked = await restricted(su.agent, shared.id, 'Locked');
    expectStatus(await upload(su.agent, locked.id, 'Invoice-secret.pdf'), 201);

    const s = expectStatus(await staff.agent.get('/api/drive/search?q=invoice'), 200).body.items;
    expect(s.map((i: { name: string }) => i.name).sort()).toEqual(['Invoice-17.pdf', 'Invoices 2026']);
    expect(s.find((i: { id: string }) => i.id === f.id).location).toMatchObject({ id: dir.id, name: 'Invoices 2026' });
    expect(expectStatus(await staff.agent.get('/api/drive/search?q=invoice&type=folder'), 200).body.items.map((i: { id: string }) => i.id)).toEqual([dir.id]);
    expect(expectStatus(await staff.agent.get('/api/drive/search?q=invoice&type=pdf'), 200).body.items.map((i: { id: string }) => i.id)).toEqual([f.id]);
    expect((await staff.agent.get('/api/drive/search?q=')).status).toBe(400);

    expect(expectStatus(await staff.agent.get('/api/drive/recent'), 200).body.items.map((i: { id: string }) => i.id)).toEqual([f.id]);
    expectStatus(await staff.agent.put(`/api/drive/nodes/${f.id}/star`), 200);
    expect(expectStatus(await staff.agent.get('/api/drive/starred'), 200).body.items[0]).toMatchObject({ id: f.id, starred: true });
    expect(expectStatus(await list(staff.agent, dir.id), 200).body.items[0].starred).toBe(true);
    expect(expectStatus(await list(other.agent, dir.id), 200).body.items[0].starred).toBe(false);
    expectStatus(await staff.agent.delete(`/api/drive/nodes/${f.id}/star`), 200);

    const stats = expectStatus(await staff.agent.get('/api/drive/stats'), 200).body;
    expect(stats.shared.files).toBe(2);
    expect(stats.shared.bytes).toBeGreaterThan(0);
    expect(stats.total).toBeNull();

    const people = expectStatus(await staff.agent.get('/api/drive/people?q=Ley'), 200).body.people;
    expect(people.map((p: { id: string }) => p.id)).toEqual([other.user.id]);

    const props = expectStatus(await staff.agent.get(`/api/drive/nodes/${dir.id}`), 200).body;
    expect(props.details.totals).toMatchObject({ files: 1, folders: 0 });
    expect(props.path.map((p: { name: string }) => p.name)).toEqual(['Gemeinsame Dokumente', 'Invoices 2026']);
  });

  it('super admin overview: who can access what', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const { shared } = await roots(su.agent);
    const hr = expectStatus(await mkdir(su.agent, shared.id, 'HR'), 201).body.item;
    expectStatus(await grant(su.agent, hr.id, { userId: staff.user.id, access: 'MANAGE' }), 200);
    const ov = expectStatus(await su.agent.get(`/api/drive/overview/${staff.user.id}`), 200).body;
    const byId = new Map(ov.items.map((i: { id: string }) => [i.id, i]));
    expect(byId.get(shared.id)).toMatchObject({ level: 'EDIT', source: 'role' });
    expect(byId.get(hr.id)).toMatchObject({ level: 'MANAGE', source: 'user' });
    expect(ov.cases).toMatchObject({ rootLevel: 'EDIT', assignedCases: 0 });
    expect((await staff.agent.get(`/api/drive/overview/${staff.user.id}`)).status).toBe(403);
    expect((await su.agent.get('/api/drive/audit?action=DRIVE_')).body.items.length).toBeGreaterThan(0);
  });
});
