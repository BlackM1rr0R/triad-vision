import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, type Agent } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { binaryParser, makePdf, SAMPLE } from '../helpers/files';
import { clientCase, createCaseVia, expectStatus, uploadDoc } from '../helpers/workflow';
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

describe('drive: roots and default permissions', () => {
  it('seeds the shared and cases roots once and gives every staff member a personal root', async () => {
    const staff = await asStaff({ firstName: 'Aynur', lastName: 'Q' });
    const r = await roots(staff.agent);
    expect(r.shared).toMatchObject({ space: 'SHARED', system: true, myAccess: 'VIEW', name: 'Company drive' });
    expect(r.personal).toMatchObject({ space: 'PERSONAL', system: true, myAccess: 'MANAGE', name: 'Aynur Q', ownerId: staff.user.id });
    expect(r.cases).toBeNull();
    expect(r.team).toEqual([]);
    expect(r.limits.maxFileBytes).toBe(50 * 1024 * 1024);

    await roots(staff.agent);
    await Promise.all([roots(staff.agent), roots(staff.agent)]);
    expect(await prisma.driveNode.count({ where: { parentId: null, space: 'SHARED' } })).toBe(1);
    expect(await prisma.driveNode.count({ where: { parentId: null, space: 'CASES' } })).toBe(1);
    expect(await prisma.driveNode.count({ where: { parentId: null, space: 'PERSONAL', ownerId: staff.user.id } })).toBe(1);
    const grants = await prisma.driveGrant.findMany({ where: { node: { parentId: null, space: { in: ['SHARED', 'CASES'] } } }, include: { node: true } });
    expect(grants.map((g) => [g.node.space, g.role, g.access]).sort()).toEqual([
      ['CASES', 'ADMIN', 'DOWNLOAD'],
      ['SHARED', 'STAFF', 'VIEW'],
    ]);
  });

  it('admins see the cases root, the super admin manages everything and sees the team', async () => {
    const staff = await asStaff({ firstName: 'Bob' });
    await roots(staff.agent);
    const admin = await asAdmin();
    const su = await asSuperAdmin();
    const ra = await roots(admin.agent);
    expect(ra.cases).toMatchObject({ space: 'CASES', myAccess: 'DOWNLOAD' });
    expect(ra.shared.myAccess).toBe('VIEW');
    const rs = await roots(su.agent);
    expect(rs.shared.myAccess).toBe('MANAGE');
    expect(rs.cases.myAccess).toBe('MANAGE');
    expect(rs.team.map((t: { ownerId: string }) => t.ownerId).sort()).toEqual([staff.user.id, admin.user.id].sort());
  });

  it('is staff only and needs 2FA', async () => {
    const client = await asClient();
    expect((await client.agent.get('/api/drive/roots')).status).toBe(403);
    const staff = await asStaff({ twoFactor: false });
    expect((await staff.agent.get('/api/drive/roots')).body.error).toBe('TWO_FACTOR_ENROLLMENT_REQUIRED');
  });
});

describe('drive: permission engine end to end', () => {
  it('VIEW on the company drive does not allow changes; grants and inheritance do', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const other = await asStaff();
    const { shared } = await roots(su.agent);

    expect((await mkdir(staff.agent, shared.id, 'Mine')).status).toBe(403);
    const hr = expectStatus(await mkdir(su.agent, shared.id, 'HR'), 201).body.item;
    const contracts = expectStatus(await mkdir(su.agent, hr.id, 'Contracts'), 201).body.item;
    expect((await mkdir(su.agent, hr.id, 'contracts')).body.error).toBe('NAME_EXISTS');

    // Inherited VIEW from the root.
    const listing = expectStatus(await list(staff.agent, hr.id), 200).body;
    expect(listing.folder.myAccess).toBe('VIEW');
    expect(listing.items.map((i: { name: string }) => i.name)).toEqual(['Contracts']);
    expect(listing.path.map((c: { name: string }) => c.name)).toEqual(['Company drive', 'HR']);

    // Grant EDIT to one person on HR: inherited by Contracts.
    expectStatus(await grant(su.agent, hr.id, { userId: staff.user.id, access: 'EDIT' }), 200);
    expectStatus(await upload(staff.agent, contracts.id, 'offer.pdf'), 201);
    expect((await upload(other.agent, contracts.id, 'nope.pdf')).status).toBe(403);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: staff.user.id, type: 'DRIVE_SHARED' } });
    expect(n.link).toBe(`/workspace/drive/f/${hr.id}`);
    expect(n.title).toContain('qovluq paylaşdı');

    // Break inheritance on Contracts without copying: the staff member loses access completely (404).
    expectStatus(await su.agent.patch(`/api/drive/nodes/${contracts.id}/inheritance`).send({ inherit: false }), 200);
    expect((await list(staff.agent, contracts.id)).status).toBe(404);
    expect((await list(other.agent, contracts.id)).status).toBe(404);
    // ... and the parent listing hides it.
    expect(expectStatus(await list(staff.agent, hr.id), 200).body.items).toEqual([]);

    // Turn it back on, then off with "copy inherited": explicit grants appear.
    expectStatus(await su.agent.patch(`/api/drive/nodes/${contracts.id}/inheritance`).send({ inherit: true }), 200);
    const off = expectStatus(await su.agent.patch(`/api/drive/nodes/${contracts.id}/inheritance`).send({ inherit: false, copyInherited: true }), 200).body;
    expect(off.copied).toBe(2);
    const access = expectStatus(await su.agent.get(`/api/drive/nodes/${contracts.id}/access`), 200).body;
    expect(access.node.inheritPermissions).toBe(false);
    expect(access.entries.filter((e: { inherited: boolean }) => !e.inherited).map((e: { role: string | null; userId: string | null; access: string }) => [e.role ?? e.userId, e.access]).sort()).toEqual(
      [
        ['STAFF', 'VIEW'],
        [staff.user.id, 'EDIT'],
      ].sort(),
    );
    expect((await list(other.agent, contracts.id)).status).toBe(200);

    // A STAFF role grant also covers admins (role hierarchy).
    const admin = await asAdmin();
    expect(expectStatus(await list(admin.agent, contracts.id), 200).body.folder.myAccess).toBe('VIEW');
  });

  it('only MANAGE changes grants; nobody grants super admins or the owner; bad input is refused', async () => {
    const su = await asSuperAdmin();
    const owner = await asStaff();
    const editor = await asStaff();
    const { personal } = await roots(owner.agent);
    const folder = expectStatus(await mkdir(owner.agent, personal.id, 'Shared stuff'), 201).body.item;

    expectStatus(await grant(owner.agent, folder.id, { userId: editor.user.id, access: 'EDIT' }), 200);
    expect((await grant(editor.agent, folder.id, { role: 'STAFF', access: 'VIEW' })).status).toBe(403);
    expect((await grant(owner.agent, folder.id, { userId: su.user.id, access: 'VIEW' })).body.error).toBe('USER_ALWAYS_HAS_ACCESS');
    expect((await grant(owner.agent, folder.id, { userId: owner.user.id, access: 'VIEW' })).body.error).toBe('USER_ALWAYS_HAS_ACCESS');
    expect((await grant(owner.agent, folder.id, { userId: (await asClient()).user.id, access: 'VIEW' })).body.error).toBe('INVALID_USER');
    expect((await grant(owner.agent, folder.id, { role: 'STAFF', userId: editor.user.id, access: 'VIEW' })).status).toBe(400);
    expect((await grant(owner.agent, folder.id, { role: 'SUPER_ADMIN', access: 'VIEW' })).status).toBe(400);
    expect((await grant(owner.agent, folder.id, { userId: editor.user.id, access: 'OWNER' })).status).toBe(400);

    // Owner turns inheritance off on a folder they own: still MANAGE (owner).
    const access = expectStatus(await owner.agent.get(`/api/drive/nodes/${folder.id}/access`), 200).body;
    expect(access.canManage).toBe(true);
    expect(access.implicit.owner.id).toBe(owner.user.id);
    const g = access.entries.find((e: { userId: string }) => e.userId === editor.user.id);
    expect(g).toMatchObject({ access: 'EDIT', inherited: false, user: { id: editor.user.id } });
    expectStatus(await owner.agent.delete(`/api/drive/nodes/${folder.id}/grants/${g.grantId}`), 200);
    expect((await list(editor.agent, folder.id)).status).toBe(404);

    // Personal roots of others are invisible without a grant; the super admin sees everything.
    expect((await list(editor.agent, personal.id)).status).toBe(404);
    expect(expectStatus(await list(su.agent, personal.id), 200).body.folder.myAccess).toBe('MANAGE');

    const actions = (await prisma.auditLog.findMany({ where: { action: { startsWith: 'DRIVE_GRANT' } } })).map((a) => a.action).sort();
    expect(actions).toEqual(['DRIVE_GRANT_REMOVED', 'DRIVE_GRANT_SET']);
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

  it('shared with me lists the top-most folders reached only through a share', async () => {
    const owner = await asStaff({ firstName: 'Olga' });
    const me = await asStaff();
    const { personal } = await roots(owner.agent);
    const a = expectStatus(await mkdir(owner.agent, personal.id, 'A'), 201).body.item;
    const b = expectStatus(await mkdir(owner.agent, a.id, 'B'), 201).body.item;
    expectStatus(await grant(owner.agent, a.id, { userId: me.user.id, access: 'VIEW' }), 200);
    expectStatus(await grant(owner.agent, b.id, { userId: me.user.id, access: 'EDIT' }), 200);
    const shared = expectStatus(await me.agent.get('/api/drive/shared'), 200).body.items;
    expect(shared.map((i: { id: string }) => i.id)).toEqual([a.id]);
    const inside = expectStatus(await list(me.agent, b.id), 200).body;
    expect(inside.truncated).toBe(true);
    expect(inside.path.map((c: { name: string }) => c.name)).toEqual(['A', 'B']);
    expect(inside.folder.myAccess).toBe('EDIT');
  });
});

describe('drive: files', () => {
  it('uploads, detects name clashes, renames, replaces as a new version and restores old versions', async () => {
    const staff = await asStaff();
    const { personal } = await roots(staff.agent);
    const first = expectStatus(await upload(staff.agent, personal.id, 'Report.pdf'), 201).body.item;
    expect(first).toMatchObject({ kind: 'FILE', name: 'Report.pdf', mimeType: 'application/pdf', version: 1, myAccess: 'MANAGE', previewable: true });
    const key1 = (await prisma.driveNode.findUniqueOrThrow({ where: { id: first.id } })).storageKey!;
    expect(fs.existsSync(storedFile(key1))).toBe(true);

    const clash = await upload(staff.agent, personal.id, 'report.PDF');
    expect(clash.status).toBe(409);
    expect(clash.body).toMatchObject({ error: 'NAME_EXISTS', existingId: first.id });
    const renamed = expectStatus(await upload(staff.agent, personal.id, 'Report.pdf', { onConflict: 'rename' }), 201).body.item;
    expect(renamed.name).toBe('Report (2).pdf');

    const v2 = expectStatus(await upload(staff.agent, personal.id, 'Report.pdf', { onConflict: 'replace', body: await makePdf('second version') }), 201).body;
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
    const deep = expectStatus(await upload(staff.agent, personal.id, 'x.pdf', { relativeDir: 'Scans/2026' }), 201).body.item;
    const scans = (await prisma.driveNode.findFirstOrThrow({ where: { name: 'Scans', parentId: personal.id } })).id;
    const y2026 = await prisma.driveNode.findFirstOrThrow({ where: { name: '2026', parentId: scans } });
    expect(deep.parentId).toBe(y2026.id);
    expect((await upload(staff.agent, personal.id, 'y.pdf', { relativeDir: '../evil' })).status).toBe(400);

    const actions = (await prisma.auditLog.findMany({ where: { action: { startsWith: 'DRIVE_FILE' } } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['DRIVE_FILE_UPLOADED', 'DRIVE_FILE_VERSION_ADDED', 'DRIVE_FILE_VERSION_RESTORED']));
  });

  it('checks content: spoofed or unsupported files are refused and nothing stays on disk', async () => {
    const staff = await asStaff();
    const { personal } = await roots(staff.agent);
    const before = fs.readdirSync(path.join(TEST_DOCS_DIR, 'drive')).length;
    expect((await upload(staff.agent, personal.id, 'fake.pdf', { body: Buffer.from('<html><script>alert(1)</script>') })).body.error).toBe('FILE_CONTENT_MISMATCH');
    expect((await upload(staff.agent, personal.id, 'tool.exe', { body: Buffer.from('MZ'), type: 'application/octet-stream' })).body.error).toBe('UNSUPPORTED_FILE_TYPE');
    expect((await upload(staff.agent, personal.id, 'pic.svg', { body: SAMPLE.svg, type: 'image/svg+xml' })).body.error).toBe('UNSUPPORTED_FILE_TYPE');
    expect(fs.readdirSync(path.join(TEST_DOCS_DIR, 'drive')).length).toBe(before);
    const incoming = fs.readdirSync(path.join(TEST_DOCS_DIR, '.incoming')).filter((f) => f.startsWith('drive-'));
    expect(incoming).toEqual([]);
    // Office documents are fine.
    expectStatus(await upload(staff.agent, personal.id, 'letter.docx', { body: SAMPLE.zip, type: DOCX }), 201);
  });

  it('previews inline-safe files with VIEW, downloads need DOWNLOAD', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const { shared } = await roots(su.agent);
    const pdf = expectStatus(await upload(su.agent, shared.id, 'Policy.pdf'), 201).body.item;
    const docx = expectStatus(await upload(su.agent, shared.id, 'Policy.docx', { body: SAMPLE.zip, type: DOCX }), 201).body.item;

    const preview = await download(staff.agent, `/api/drive/nodes/${pdf.id}/content`);
    expect(preview.status).toBe(200);
    expect(preview.headers['content-disposition']).toMatch(/^inline/);
    expect(preview.headers['x-content-type-options']).toBe('nosniff');
    expect(preview.headers['content-security-policy']).toContain('sandbox');
    expect((await staff.agent.get(`/api/drive/nodes/${pdf.id}/content?download=1`)).status).toBe(403);
    expect((await staff.agent.get(`/api/drive/nodes/${docx.id}/content`)).status).toBe(403);

    expectStatus(await grant(su.agent, shared.id, { role: 'STAFF', access: 'DOWNLOAD' }), 200);
    const dl = await download(staff.agent, `/api/drive/nodes/${docx.id}/content`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toMatch(/^attachment/);
    expect((await staff.agent.get(`/api/drive/nodes/does-not-exist/content`)).status).toBe(404);
  });

  it('renames (keeping the extension), colours folders (MANAGE) and protects system roots', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const { shared, personal } = await roots(staff.agent);
    const f = expectStatus(await upload(staff.agent, personal.id, 'a.pdf'), 201).body.item;
    expectStatus(await upload(staff.agent, personal.id, 'b.pdf'), 201);
    expect(expectStatus(await staff.agent.patch(`/api/drive/nodes/${f.id}`).send({ name: 'Invoice.pdf' }), 200).body.item.name).toBe('Invoice.pdf');
    expect((await staff.agent.patch(`/api/drive/nodes/${f.id}`).send({ name: 'Invoice.exe' })).body.error).toBe('EXTENSION_CHANGE_NOT_ALLOWED');
    expect((await staff.agent.patch(`/api/drive/nodes/${f.id}`).send({ name: 'b.pdf' })).body.error).toBe('NAME_EXISTS');
    expect((await staff.agent.patch(`/api/drive/nodes/${f.id}`).send({ name: '../x.pdf' })).body.error).toBe('INVALID_FILE_NAME');
    expect((await staff.agent.patch(`/api/drive/nodes/${personal.id}`).send({ name: 'Other' })).body.error).toBe('SYSTEM_NODE');
    const dir = expectStatus(await mkdir(staff.agent, personal.id, 'Blue'), 201).body.item;
    expect(expectStatus(await staff.agent.patch(`/api/drive/nodes/${dir.id}`).send({ color: 'blue' }), 200).body.item.color).toBe('blue');
    expect((await staff.agent.patch(`/api/drive/nodes/${dir.id}`).send({ color: 'url(evil)' })).status).toBe(400);
    expect((await staff.agent.patch(`/api/drive/nodes/${shared.id}`).send({ color: 'red' })).status).toBe(403);
    expect((await su.agent.post('/api/drive/trash').send({ ids: [shared.id] })).body.results[0].error).toBe('SYSTEM_NODE');
  });

  it('moves and copies between folders and spaces, refusing cycles', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const { shared, personal } = await roots(staff.agent);
    const a = expectStatus(await mkdir(staff.agent, personal.id, 'A'), 201).body.item;
    const b = expectStatus(await mkdir(staff.agent, a.id, 'B'), 201).body.item;
    const file = expectStatus(await upload(staff.agent, a.id, 'doc.pdf'), 201).body.item;
    expectStatus(await upload(staff.agent, b.id, 'doc.pdf'), 201);

    const mv = expectStatus(await staff.agent.post('/api/drive/move').send({ ids: [file.id], targetId: b.id }), 200).body.results;
    expect(mv).toEqual([{ id: file.id, ok: true, name: 'doc (2).pdf' }]);
    expect((await staff.agent.post('/api/drive/move').send({ ids: [a.id], targetId: b.id })).body.results[0].error).toBe('INTO_ITSELF');
    expect((await staff.agent.post('/api/drive/move').send({ ids: [personal.id], targetId: a.id })).body.results[0].error).toBe('SYSTEM_NODE');
    // VIEW on the company drive: cannot move into it.
    expect((await staff.agent.post('/api/drive/move').send({ ids: [a.id], targetId: shared.id })).status).toBe(403);

    // Copy keeps the original and gives the copy fresh files.
    const cp = expectStatus(await staff.agent.post('/api/drive/copy').send({ ids: [a.id], targetId: personal.id }), 200).body.results;
    expect(cp[0]).toMatchObject({ ok: true });
    const copies = await prisma.driveNode.findMany({ where: { parentId: personal.id, kind: 'FOLDER' }, orderBy: { name: 'asc' } });
    expect(copies.map((c) => c.name)).toEqual(['A', 'A (2)']);
    const copiedFiles = await prisma.driveNode.count({ where: { kind: 'FILE', ownerId: staff.user.id } });
    expect(copiedFiles).toBe(4);
    expect((await staff.agent.post('/api/drive/copy').send({ ids: [a.id], targetId: b.id })).body.results[0].error).toBe('INTO_ITSELF');

    // Moving into the company drive (with EDIT there) moves the subtree into the SHARED space.
    expectStatus(await grant(su.agent, shared.id, { userId: staff.user.id, access: 'EDIT' }), 200);
    expectStatus(await staff.agent.post('/api/drive/move').send({ ids: [a.id], targetId: shared.id }), 200);
    const movedB = await prisma.driveNode.findUniqueOrThrow({ where: { id: b.id } });
    expect(movedB).toMatchObject({ space: 'SHARED', ownerId: null });
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_MOVED' } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_COPIED' } })).toBe(1);
  });

  it('recycle bin: trash, list, restore (with rename on clash), purge and the 30-day job', async () => {
    const staff = await asStaff();
    const su = await asSuperAdmin();
    const { personal } = await roots(staff.agent);
    const dir = expectStatus(await mkdir(staff.agent, personal.id, 'Old'), 201).body.item;
    const inner = expectStatus(await upload(staff.agent, dir.id, 'inner.pdf'), 201).body.item;
    const innerKey = (await prisma.driveNode.findUniqueOrThrow({ where: { id: inner.id } })).storageKey!;
    expectStatus(await staff.agent.put(`/api/drive/nodes/${dir.id}/star`), 200);

    expect(expectStatus(await staff.agent.post('/api/drive/trash').send({ ids: [dir.id] }), 200).body.results[0].ok).toBe(true);
    expect(expectStatus(await list(staff.agent, personal.id), 200).body.items).toEqual([]);
    expect((await list(staff.agent, dir.id)).status).toBe(404);
    expect((await staff.agent.get(`/api/drive/nodes/${inner.id}/content`)).status).toBe(404);
    expect(expectStatus(await staff.agent.get('/api/drive/starred'), 200).body.items).toEqual([]);
    const trash = expectStatus(await staff.agent.get('/api/drive/trash'), 200).body;
    expect(trash.items.map((i: { id: string }) => i.id)).toEqual([dir.id]);
    expect(trash.items[0].deletedBy.id).toBe(staff.user.id);
    expect(trash.trashDays).toBe(30);
    expect((await staff.agent.post('/api/drive/restore').send({ ids: [inner.id] })).body.results[0].error).toBe('NOT_A_TRASH_ROOT');

    // A new folder with the same name appeared meanwhile: the restored one is renamed.
    expectStatus(await mkdir(staff.agent, personal.id, 'Old'), 201);
    const rs = expectStatus(await staff.agent.post('/api/drive/restore').send({ ids: [dir.id] }), 200).body.results[0];
    expect(rs).toMatchObject({ ok: true, name: 'Old (2)' });
    expect(expectStatus(await list(staff.agent, dir.id), 200).body.items.map((i: { id: string }) => i.id)).toEqual([inner.id]);

    // Delete for good.
    expectStatus(await staff.agent.post('/api/drive/trash').send({ ids: [dir.id] }), 200);
    const other = await asStaff();
    expect((await other.agent.post('/api/drive/purge').send({ ids: [dir.id] })).body.results[0].error).toBe('NODE_NOT_FOUND');
    expect(expectStatus(await staff.agent.post('/api/drive/purge').send({ ids: [dir.id] }), 200).body.results[0].ok).toBe(true);
    expect(await prisma.driveNode.findUnique({ where: { id: inner.id } })).toBeNull();
    expect(fs.existsSync(storedFile(innerKey))).toBe(false);

    // The job purges only what has been in the bin longer than 30 days.
    const keep = expectStatus(await upload(staff.agent, personal.id, 'keep.pdf'), 201).body.item;
    const expire = expectStatus(await upload(staff.agent, personal.id, 'expire.pdf'), 201).body.item;
    expectStatus(await staff.agent.post('/api/drive/trash').send({ ids: [keep.id, expire.id] }), 200);
    await prisma.driveNode.update({ where: { id: expire.id }, data: { deletedAt: new Date(Date.now() - 31 * 24 * 3600 * 1000) } });
    const r = await purgeExpiredTrash();
    expect(r).toMatchObject({ roots: 1, nodes: 1 });
    expect(await prisma.driveNode.findUnique({ where: { id: expire.id } })).toBeNull();
    expect(await prisma.driveNode.findUnique({ where: { id: keep.id } })).not.toBeNull();

    // Super admin sees everyone's bin, the owner empties theirs.
    expect(expectStatus(await su.agent.get('/api/drive/trash?all=1'), 200).body.items.map((i: { id: string }) => i.id)).toEqual([keep.id]);
    expectStatus(await staff.agent.delete('/api/drive/trash'), 200);
    expect(await prisma.driveNode.findUnique({ where: { id: keep.id } })).toBeNull();
    const actions = new Set((await prisma.auditLog.findMany({ select: { action: true } })).map((a) => a.action));
    for (const a of ['DRIVE_TRASHED', 'DRIVE_RESTORED', 'DRIVE_PURGED', 'DRIVE_TRASH_EMPTIED']) expect(actions.has(a), a).toBe(true);
  });

  it('exports folders and selections as ZIP, only with EXPORT and only what is visible', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const { shared } = await roots(su.agent);
    const proj = expectStatus(await mkdir(su.agent, shared.id, 'Project'), 201).body.item;
    const secret = expectStatus(await mkdir(su.agent, proj.id, 'Secret'), 201).body.item;
    expectStatus(await upload(su.agent, proj.id, 'plan.pdf'), 201);
    expectStatus(await upload(su.agent, secret.id, 'hidden.pdf'), 201);
    expectStatus(await su.agent.patch(`/api/drive/nodes/${secret.id}/inheritance`).send({ inherit: false }), 200);

    expect((await staff.agent.get(`/api/drive/export?ids=${proj.id}`)).status).toBe(403);
    expectStatus(await grant(su.agent, proj.id, { userId: staff.user.id, access: 'EXPORT' }), 200);
    const zip = await download(staff.agent, `/api/drive/export?ids=${proj.id}`);
    expect(zip.status).toBe(200);
    expect(zip.headers['content-type']).toBe('application/zip');
    expect(zipNames(zip.body as Buffer)).toEqual(['Project/plan.pdf']);
    const all = await download(su.agent, `/api/drive/export?ids=${proj.id}`);
    expect(zipNames(all.body as Buffer)).toEqual(['Project/Secret/hidden.pdf', 'Project/plan.pdf']);
    expect((await staff.agent.get(`/api/drive/export?ids=${secret.id}`)).status).toBe(404);
    // The audit row is written after the ZIP stream ends, so wait for it instead of racing the response.
    await waitFor(async () => (await prisma.auditLog.count({ where: { action: 'DRIVE_EXPORTED' } })) === 2);
  });
});

describe('drive: cases area (virtual, read-only)', () => {
  const caseWithDoc = async () => {
    const client = await asClient({ firstName: 'Kamran', lastName: 'Aliyev' });
    const c = await createCaseVia(client.agent);
    const req = (await clientCase(client.agent, c.id)).requirements.find((r) => r.stage === 'INITIAL')!;
    const doc = expectStatus(await uploadDoc(client.agent, c.id, req.id, 'passport.pdf'), 201).body.document as { id: string };
    return { client, c, doc };
  };

  it('assigned staff see their own cases with DOWNLOAD; admins all; others nothing', async () => {
    const { c, doc } = await caseWithDoc();
    const assigned = await asStaff();
    const otherStaff = await asStaff();
    const admin = await asAdmin();
    const su = await asSuperAdmin();
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: assigned.user.id } });

    const r = await roots(assigned.agent);
    expect(r.cases).toMatchObject({ myAccess: 'VIEW', childCount: 1 });
    const casesList = expectStatus(await list(assigned.agent, r.cases.id), 200).body;
    expect(casesList.items).toHaveLength(1);
    expect(casesList.items[0]).toMatchObject({ id: `case:${c.id}`, name: `${c.number} — Kamran Aliyev`, virtual: true, myAccess: 'DOWNLOAD', caseStatus: 'DOCUMENTS_PENDING' });
    const stages = expectStatus(await list(assigned.agent, `case:${c.id}`), 200).body;
    expect(stages.items.map((i: { id: string }) => i.id)).toEqual([`case:${c.id}:INITIAL`]);
    const docs = expectStatus(await list(assigned.agent, `case:${c.id}:INITIAL`), 200).body;
    expect(docs.items[0]).toMatchObject({ id: `doc:${doc.id}`, name: 'passport.pdf', docStatus: 'PENDING', kind: 'FILE' });
    expect(docs.path.map((p: { id: string }) => p.id)).toEqual([r.cases.id, `case:${c.id}`, `case:${c.id}:INITIAL`]);
    const dl = await download(assigned.agent, `/api/drive/nodes/doc:${doc.id}/content?download=1`);
    expect(dl.status).toBe(200);
    expect((dl.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    // DOWNLOAD is not EXPORT.
    expect((await assigned.agent.get(`/api/drive/export?ids=case:${c.id}`)).status).toBe(403);

    expect((await roots(otherStaff.agent)).cases).toBeNull();
    expect((await list(otherStaff.agent, `case:${c.id}`)).status).toBe(404);
    expect((await otherStaff.agent.get(`/api/drive/nodes/doc:${doc.id}/content`)).status).toBe(404);
    expect((await list(assigned.agent, `case:${c.id}:BOGUS`)).status).toBe(404);
    expect((await list(assigned.agent, `case:../../etc`)).status).toBe(404);

    expect(expectStatus(await list(admin.agent, `case:${c.id}`), 200).body.folder.myAccess).toBe('DOWNLOAD');
    // Super admin: capped at EXPORT (read-only area) and can export a case as ZIP.
    expect(expectStatus(await list(su.agent, `case:${c.id}`), 200).body.folder.myAccess).toBe('EXPORT');
    const zip = await download(su.agent, `/api/drive/export?ids=case:${c.id}`);
    expect(zipNames(zip.body as Buffer)).toEqual([`${c.number} — Kamran Aliyev/INITIAL/passport.pdf`]);

    // Read-only: nothing can be created, renamed, moved or deleted there.
    expect((await mkdir(su.agent, r.cases.id, 'x')).body.error).toBe('READ_ONLY');
    expect((await mkdir(su.agent, `case:${c.id}`, 'x')).body.error).toBe('READ_ONLY');
    expect((await su.agent.patch(`/api/drive/nodes/doc:${doc.id}`).send({ name: 'x.pdf' })).body.error).toBe('READ_ONLY');
    expect((await su.agent.post('/api/drive/trash').send({ ids: [`doc:${doc.id}`] })).body.results[0].error).toBe('READ_ONLY');

    // A case document can be copied into the drive (DOWNLOAD).
    const { personal } = await roots(assigned.agent);
    expect(expectStatus(await assigned.agent.post('/api/drive/copy').send({ ids: [`doc:${doc.id}`], targetId: personal.id }), 200).body.results[0]).toMatchObject({ ok: true, name: 'passport.pdf' });

    // Search finds cases and documents.
    const found = expectStatus(await assigned.agent.get('/api/drive/search?q=passport'), 200).body.items;
    expect(found.map((i: { id: string }) => i.id).sort()).toEqual(expect.arrayContaining([`doc:${doc.id}`]));
  });

  it('marks DSGVO-purged cases', async () => {
    const { c } = await caseWithDoc();
    const su = await asSuperAdmin();
    await prisma.document.deleteMany({ where: { caseId: c.id } });
    await prisma.case.update({ where: { id: c.id }, data: { documentsPurgedAt: new Date() } });
    const item = expectStatus(await list(su.agent, `case:${c.id}`), 200).body;
    expect(item.folder.purged).toBe(true);
    expect(item.items).toEqual([]);
  });
});

describe('drive: navigation helpers', () => {
  it('search, recent, starred, stats, people and properties', async () => {
    const staff = await asStaff({ firstName: 'Zaur' });
    const other = await asStaff({ firstName: 'Leyla' });
    const { personal } = await roots(staff.agent);
    const dir = expectStatus(await mkdir(staff.agent, personal.id, 'Invoices 2026'), 201).body.item;
    const f = expectStatus(await upload(staff.agent, dir.id, 'Invoice-17.pdf'), 201).body.item;
    expectStatus(await upload(other.agent, (await roots(other.agent)).personal.id, 'Invoice-secret.pdf'), 201);

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
    expectStatus(await staff.agent.delete(`/api/drive/nodes/${f.id}/star`), 200);
    expect((await other.agent.put(`/api/drive/nodes/${f.id}/star`)).status).toBe(404);

    const stats = expectStatus(await staff.agent.get('/api/drive/stats'), 200).body;
    expect(stats.personal.files).toBe(1);
    expect(stats.personal.bytes).toBeGreaterThan(0);
    expect(stats.total).toBeNull();

    const people = expectStatus(await staff.agent.get('/api/drive/people?q=Ley'), 200).body.people;
    expect(people.map((p: { id: string }) => p.id)).toEqual([other.user.id]);

    const props = expectStatus(await staff.agent.get(`/api/drive/nodes/${dir.id}`), 200).body;
    expect(props.details.totals).toMatchObject({ files: 1, folders: 0 });
    expect(props.path.map((p: { name: string }) => p.name)).toEqual(['Zaur User', 'Invoices 2026']);
  });

  it('super admin overview: who can access what', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const { shared } = await roots(su.agent);
    const hr = expectStatus(await mkdir(su.agent, shared.id, 'HR'), 201).body.item;
    expectStatus(await grant(su.agent, hr.id, { userId: staff.user.id, access: 'EDIT' }), 200);
    const ov = expectStatus(await su.agent.get(`/api/drive/overview/${staff.user.id}`), 200).body;
    const byId = new Map(ov.items.map((i: { id: string }) => [i.id, i]));
    expect(byId.get(shared.id)).toMatchObject({ level: 'VIEW', source: 'role' });
    expect(byId.get(hr.id)).toMatchObject({ level: 'EDIT', source: 'user' });
    expect(ov.items.some((i: { source: string; space: string }) => i.source === 'owner' && i.space === 'PERSONAL')).toBe(true);
    expect(ov.cases).toMatchObject({ rootLevel: null, assignedCases: 0 });
    expect((await staff.agent.get(`/api/drive/overview/${staff.user.id}`)).status).toBe(403);
    expect((await su.agent.get('/api/drive/audit?action=DRIVE_')).body.items.length).toBeGreaterThan(0);
  });
});
