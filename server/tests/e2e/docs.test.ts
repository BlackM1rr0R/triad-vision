import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin, type Actor } from '../helpers/api';
import { prisma } from '../helpers/db';
import { binaryParser, makePdf, PNG_BUFFER } from '../helpers/files';
import { TEST_DOCS_DIR } from '../helpers/testEnv';

const XLSX = { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as const;
/** A zip local-file-header is all the sniffer needs for an .xlsx. */
const XLSX_BUFFER = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(60)]);

type Folder = { id: string; slug: string; owner: { id: string }; access: string; fileCount: number };

const myFolder = async (actor: Actor) => {
  const res = await actor.agent.get('/api/docs/folders');
  expect(res.status).toBe(200);
  return (res.body.folders as Folder[]).find((f) => f.owner.id === actor.user.id)!;
};

const upload = (actor: Actor, folderId: string, name: string, buf: Buffer, type: string, fields: Record<string, string> = {}) => {
  let req = actor.agent.post(`/api/docs/folders/${folderId}/files`);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return req.attach('file', buf, { filename: name, contentType: type });
};

describe('document workspaces: folders', () => {
  it('every staff member gets their own folder on first use, named after them', async () => {
    const staff = await asStaff({ firstName: 'Nəriman', lastName: 'Abdullayev' });
    const folder = await myFolder(staff);
    expect(folder.slug).toBe('neriman');
    expect(folder.access).toBe('OWNER');
    // The standard root directory exists on disk and in the listing from the start.
    expect(fs.existsSync(path.join(TEST_DOCS_DIR, 'neriman', 'senedleri'))).toBe(true);
    const root = await staff.agent.get(`/api/docs/folders/${folder.id}`);
    expect(root.body.dirs.map((d: { path: string }) => d.path)).toEqual(['senedleri']);
    // Only their own folder is visible without grants.
    const all = await staff.agent.get('/api/docs/folders');
    expect(all.body.folders).toHaveLength(1);
  });

  it('two staff with the same name get distinct folders', async () => {
    const a = await asStaff({ firstName: 'Ali', lastName: 'Veli' });
    const b = await asStaff({ firstName: 'Ali', lastName: 'Veli' });
    expect((await myFolder(a)).slug).toBe('ali');
    expect((await myFolder(b)).slug).toBe('ali-veli');
    const c = await asStaff({ firstName: 'Ali', lastName: 'Veli' });
    expect((await myFolder(c)).slug).toBe('ali-3');
  });

  it('clients have no workspace access at all', async () => {
    const c = await asClient();
    expect((await c.agent.get('/api/docs/folders')).status).toBe(403);
  });

  it('the super admin sees every staff folder (created on demand) with OWNER access', async () => {
    const su = await asSuperAdmin();
    await asStaff({ firstName: 'Leyla', lastName: 'M' });
    await asAdmin({ firstName: 'Orxan', lastName: 'K' });
    await asClient();
    const res = await su.agent.get('/api/docs/folders');
    const slugs = (res.body.folders as Folder[]).map((f) => f.slug).sort();
    expect(slugs).toEqual(['leyla', 'orxan', 'super']);
    expect((res.body.folders as Folder[]).every((f) => f.access === 'OWNER')).toBe(true);
  });
});

describe('document workspaces: files and directories', () => {
  it('uploads keep their real name under /docs/<slug>/<path>/ and are listed per directory', async () => {
    const staff = await asStaff({ firstName: 'Aynur', lastName: 'Q' });
    const folder = await myFolder(staff);

    const mk = await staff.agent.post(`/api/docs/folders/${folder.id}/dirs`).send({ name: '2026' });
    expect(mk.status).toBe(201);
    expect(mk.body.dir).toEqual({ name: '2026', path: '2026' });
    const nested = await staff.agent.post(`/api/docs/folders/${folder.id}/dirs`).send({ path: '2026', name: 'Hesabatlar' });
    expect(nested.body.dir.path).toBe('2026/Hesabatlar');

    const up = await upload(staff, folder.id, 'Büdcə Q1.xlsx', XLSX_BUFFER, XLSX.contentType, { path: '2026/Hesabatlar' });
    expect(up.status).toBe(201);
    expect(up.body.file).toMatchObject({ name: 'Büdcə Q1.xlsx', path: '2026/Hesabatlar', previewable: false, version: 1 });
    expect(fs.existsSync(path.join(TEST_DOCS_DIR, 'aynur', '2026', 'Hesabatlar', 'Büdcə Q1.xlsx'))).toBe(true);

    const pdf = await upload(staff, folder.id, 'contract.pdf', await makePdf(), 'application/pdf');
    expect(pdf.status).toBe(201);
    expect(pdf.body.file.previewable).toBe(true);

    const root = await staff.agent.get(`/api/docs/folders/${folder.id}`);
    expect(root.body.path).toBe('');
    expect(root.body.dirs.map((d: { path: string }) => d.path)).toEqual(['2026', 'senedleri']);
    expect(root.body.files.map((f: { name: string }) => f.name)).toEqual(['contract.pdf']);

    const sub = await staff.agent.get(`/api/docs/folders/${folder.id}`).query({ path: '2026/Hesabatlar' });
    expect(sub.body.dirs).toEqual([]);
    expect(sub.body.files.map((f: { name: string }) => f.name)).toEqual(['Büdcə Q1.xlsx']);
    expect((await staff.agent.get(`/api/docs/folders/${folder.id}`).query({ path: 'nope' })).status).toBe(404);
  });

  it('refuses a second file with the same name unless replace=true, which bumps the version', async () => {
    const staff = await asStaff();
    const folder = await myFolder(staff);
    expect((await upload(staff, folder.id, 'a.pdf', await makePdf('v1'), 'application/pdf')).status).toBe(201);
    const dup = await upload(staff, folder.id, 'a.pdf', await makePdf('v2'), 'application/pdf');
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('FILE_EXISTS');
    const rep = await upload(staff, folder.id, 'a.pdf', await makePdf('v2', 3), 'application/pdf', { replace: 'true' });
    expect(rep.status).toBe(201);
    expect(rep.body.file.version).toBe(2);
    expect(await prisma.docFile.count({ where: { folderId: folder.id } })).toBe(1);
  });

  it('checks file content, not just the declared type, and blocks dangerous names', async () => {
    const staff = await asStaff();
    const folder = await myFolder(staff);
    const fake = await upload(staff, folder.id, 'evil.pdf', Buffer.from('<html><script>alert(1)</script>'), 'application/pdf');
    expect(fake.status).toBe(400);
    expect(fake.body.error).toBe('FILE_CONTENT_MISMATCH');
    const html = await upload(staff, folder.id, 'page.html', Buffer.from('<html>'), 'text/html');
    expect(html.status).toBe(400);
    expect(html.body.error).toBe('UNSUPPORTED_FILE_TYPE');
    const exe = await upload(staff, folder.id, 'run.exe', Buffer.from('MZ'), 'application/octet-stream');
    expect(exe.status).toBe(400);
    // Nothing was left behind, not even in the spool directory.
    expect(fs.readdirSync(path.join(TEST_DOCS_DIR, '.incoming'))).toEqual([]);

    for (const name of ['../x', 'a/b', '..', 'CON', ' x']) {
      const res = await staff.agent.post(`/api/docs/folders/${folder.id}/dirs`).send({ name });
      expect(res.status, name).toBe(400);
    }
    expect((await staff.agent.get(`/api/docs/folders/${folder.id}`).query({ path: '../../etc' })).status).toBe(400);
  });

  it('rename/move, delete and empty-directory rules', async () => {
    const staff = await asStaff({ firstName: 'Rena', lastName: 'H' });
    const folder = await myFolder(staff);
    await staff.agent.post(`/api/docs/folders/${folder.id}/dirs`).send({ name: 'old' });
    const up = await upload(staff, folder.id, 'photo.png', PNG_BUFFER, 'image/png', { path: 'old' });
    const fileId = up.body.file.id as string;

    // rename directory → file path follows
    const ren = await staff.agent.patch(`/api/docs/folders/${folder.id}/dirs`).send({ path: 'old', name: 'new' });
    expect(ren.status).toBe(200);
    expect(ren.body.dir.path).toBe('new');
    expect((await prisma.docFile.findUniqueOrThrow({ where: { id: fileId } })).path).toBe('new');
    expect(fs.existsSync(path.join(TEST_DOCS_DIR, 'rena', 'new', 'photo.png'))).toBe(true);

    // move file to root with a new name; extension cannot change
    expect((await staff.agent.patch(`/api/docs/files/${fileId}`).send({ name: 'photo.exe' })).status).toBe(400);
    const mv = await staff.agent.patch(`/api/docs/files/${fileId}`).send({ name: 'şəkil.png', path: '' });
    expect(mv.status).toBe(200);
    expect(fs.existsSync(path.join(TEST_DOCS_DIR, 'rena', 'şəkil.png'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_DOCS_DIR, 'rena', 'new', 'photo.png'))).toBe(false);

    // directory is now empty → deletable; root cannot be deleted
    expect((await staff.agent.delete(`/api/docs/folders/${folder.id}/dirs`).query({ path: 'new' })).status).toBe(200);
    expect(fs.existsSync(path.join(TEST_DOCS_DIR, 'rena', 'new'))).toBe(false);
    expect((await staff.agent.delete(`/api/docs/folders/${folder.id}/dirs`).query({ path: '' })).status).toBe(400);

    // non-empty directory refuses
    await staff.agent.post(`/api/docs/folders/${folder.id}/dirs`).send({ name: 'full' });
    await upload(staff, folder.id, 'x.pdf', await makePdf(), 'application/pdf', { path: 'full' });
    const del = await staff.agent.delete(`/api/docs/folders/${folder.id}/dirs`).query({ path: 'full' });
    expect(del.status).toBe(409);
    expect(del.body.error).toBe('DIR_NOT_EMPTY');

    expect((await staff.agent.delete(`/api/docs/files/${fileId}`)).status).toBe(200);
    expect(fs.existsSync(path.join(TEST_DOCS_DIR, 'rena', 'şəkil.png'))).toBe(false);
    expect((await staff.agent.delete(`/api/docs/files/${fileId}`)).status).toBe(404);
    const actions = (await prisma.auditLog.findMany({ where: { actorId: staff.user.id }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['DOC_FILE_UPLOADED', 'DOC_DIR_RENAMED', 'DOC_FILE_MOVED', 'DOC_DIR_DELETED', 'DOC_FILE_DELETED']));
  });

  it('exports a directory tree as a zip', async () => {
    const staff = await asStaff({ firstName: 'Zip', lastName: 'Z' });
    const folder = await myFolder(staff);
    await staff.agent.post(`/api/docs/folders/${folder.id}/dirs`).send({ name: 'sub' });
    await upload(staff, folder.id, 'one.pdf', await makePdf('one'), 'application/pdf');
    await upload(staff, folder.id, 'two.png', PNG_BUFFER, 'image/png', { path: 'sub' });
    const res = await staff.agent.get(`/api/docs/folders/${folder.id}/export`).buffer().parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toContain('zip.zip');
    const body = res.body as Buffer;
    expect(body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    // end-of-central-directory record with 2 entries
    const eocd = body.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(eocd).toBeGreaterThan(0);
    expect(body.readUInt16LE(eocd + 10)).toBe(2);
    expect(body.toString('latin1')).toContain('sub/two.png');
    // sub-tree export strips the prefix
    const sub = await staff.agent.get(`/api/docs/folders/${folder.id}/export`).query({ path: 'sub' }).buffer().parse(binaryParser);
    expect(sub.headers['content-disposition']).toContain('zip-sub.zip');
    expect((sub.body as Buffer).toString('latin1')).toContain('two.png');
    expect((sub.body as Buffer).toString('latin1')).not.toContain('sub/two.png');
  });
});

describe('document workspaces: companies and limits', () => {
  it('creates <root>/<company>/<docs> in one call and lists companies with their figures', async () => {
    const staff = await asStaff({ firstName: 'Abdulla', lastName: 'X' });
    const folder = await myFolder(staff);
    expect((await staff.agent.get('/api/docs/folders')).body.structure).toEqual({ rootDir: 'senedleri', companyDocsDir: 'senedler', maxFileBytes: 5 * 1024 * 1024 });

    const created = await staff.agent.post(`/api/docs/folders/${folder.id}/companies`).send({ name: 'arintransport' });
    expect(created.status).toBe(201);
    expect(created.body.company).toEqual({ name: 'arintransport', path: 'senedleri/arintransport', docsPath: 'senedleri/arintransport/senedler' });
    expect(fs.existsSync(path.join(TEST_DOCS_DIR, 'abdulla', 'senedleri', 'arintransport', 'senedler'))).toBe(true);
    expect((await staff.agent.post(`/api/docs/folders/${folder.id}/companies`).send({ name: 'arintransport' })).status).toBe(409);
    expect((await staff.agent.post(`/api/docs/folders/${folder.id}/companies`).send({ name: '../x' })).status).toBe(400);
    await staff.agent.post(`/api/docs/folders/${folder.id}/companies`).send({ name: 'kayatransport' });

    const up = await upload(staff, folder.id, 'müqavilə.pdf', await makePdf(), 'application/pdf', { path: 'senedleri/arintransport/senedler' });
    expect(up.status).toBe(201);
    expect(fs.existsSync(path.join(TEST_DOCS_DIR, 'abdulla', 'senedleri', 'arintransport', 'senedler', 'müqavilə.pdf'))).toBe(true);

    const list = await staff.agent.get(`/api/docs/folders/${folder.id}/companies`);
    expect(list.status).toBe(200);
    expect(list.body.rootDir).toBe('senedleri');
    expect(list.body.companies.map((c: { name: string; files: number }) => [c.name, c.files])).toEqual([['arintransport', 1], ['kayatransport', 0]]);
    expect(list.body.companies[0].bytes).toBeGreaterThan(0);
    expect(list.body.companies[0].lastUploadAt).not.toBeNull();

    // A viewer sees the same company list but cannot create one.
    const su = await asSuperAdmin();
    const other = await asStaff();
    await su.agent.put(`/api/docs/folders/${folder.id}/grants/${other.user.id}`).send({ access: 'VIEW' });
    expect((await other.agent.get(`/api/docs/folders/${folder.id}/companies`)).body.companies).toHaveLength(2);
    expect((await other.agent.post(`/api/docs/folders/${folder.id}/companies`).send({ name: 'z' })).status).toBe(403);
  });

  it('returns the whole directory tree with per-directory figures', async () => {
    const staff = await asStaff({ firstName: 'Tree', lastName: 'T' });
    const folder = await myFolder(staff);
    await staff.agent.post(`/api/docs/folders/${folder.id}/companies`).send({ name: 'acme' });
    await staff.agent.post(`/api/docs/folders/${folder.id}/dirs`).send({ name: 'misc' });
    await upload(staff, folder.id, 'a.pdf', await makePdf(), 'application/pdf', { path: 'senedleri/acme/senedler' });
    await upload(staff, folder.id, 'b.pdf', await makePdf(), 'application/pdf');
    const res = await staff.agent.get(`/api/docs/folders/${folder.id}/tree`);
    expect(res.status).toBe(200);
    expect(res.body.access).toBe('OWNER');
    expect(res.body.root).toMatchObject({ path: '', name: 'tree', files: 1 });
    const byPath = Object.fromEntries((res.body.dirs as { path: string; parent: string; files: number; fixed: boolean; name: string }[]).map((d) => [d.path, d]));
    expect(Object.keys(byPath).sort()).toEqual(['misc', 'senedleri', 'senedleri/acme', 'senedleri/acme/senedler']);
    expect(byPath['senedleri']).toMatchObject({ parent: '', fixed: true, files: 0 });
    expect(byPath['senedleri/acme']).toMatchObject({ parent: 'senedleri', fixed: false, name: 'acme' });
    expect(byPath['senedleri/acme/senedler']).toMatchObject({ parent: 'senedleri/acme', fixed: true, files: 1 });
    expect(byPath['senedleri/acme/senedler'].files).toBe(1);
    expect(res.body.totals).toMatchObject({ files: 2 });
    const other = await asStaff();
    expect((await other.agent.get(`/api/docs/folders/${folder.id}/tree`)).status).toBe(404);
  });

  it('refuses files larger than 5 MB and leaves nothing behind', async () => {
    const staff = await asStaff({ firstName: 'Big', lastName: 'B' });
    const folder = await myFolder(staff);
    const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(5 * 1024 * 1024, 1)]);
    const res = await upload(staff, folder.id, 'big.pdf', big, 'application/pdf');
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('FILE_TOO_LARGE');
    expect(await prisma.docFile.count({ where: { folderId: folder.id } })).toBe(0);
    expect(fs.readdirSync(path.join(TEST_DOCS_DIR, '.incoming'))).toEqual([]);
    const ok = await upload(staff, folder.id, 'ok.pdf', Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(4 * 1024 * 1024, 1)]), 'application/pdf');
    expect(ok.status).toBe(201);
  });
});

describe('document workspaces: permissions', () => {
  const setup = async () => {
    const su = await asSuperAdmin();
    const owner = await asStaff({ firstName: 'Owner', lastName: 'O' });
    const other = await asStaff({ firstName: 'Other', lastName: 'T' });
    const folder = await myFolder(owner);
    const pdf = await upload(owner, folder.id, 'doc.pdf', await makePdf(), 'application/pdf');
    const xlsx = await upload(owner, folder.id, 'sheet.xlsx', XLSX_BUFFER, XLSX.contentType);
    return { su, owner, other, folder, pdfId: pdf.body.file.id as string, xlsxId: xlsx.body.file.id as string };
  };

  const grant = (su: Actor, folderId: string, userId: string, access: string | null) =>
    su.agent.put(`/api/docs/folders/${folderId}/grants/${userId}`).send({ access });

  it('without a grant another staff member cannot even see the folder', async () => {
    const { other, folder, pdfId } = await setup();
    expect((await other.agent.get(`/api/docs/folders/${folder.id}`)).status).toBe(404);
    expect((await other.agent.get(`/api/docs/files/${pdfId}`)).status).toBe(404);
    expect((await other.agent.get('/api/docs/folders')).body.folders.map((f: Folder) => f.slug)).toEqual(['other']);
  });

  it('VIEW: list and preview inline, but no download, export or changes', async () => {
    const { su, other, folder, pdfId, xlsxId } = await setup();
    expect((await grant(su, folder.id, other.user.id, 'VIEW')).status).toBe(200);
    const list = await other.agent.get(`/api/docs/folders/${folder.id}`);
    expect(list.status).toBe(200);
    expect(list.body.access).toBe('VIEW');
    expect((await other.agent.get('/api/docs/folders')).body.folders.find((f: Folder) => f.id === folder.id).access).toBe('VIEW');

    const preview = await other.agent.get(`/api/docs/files/${pdfId}`).buffer().parse(binaryParser);
    expect(preview.status).toBe(200);
    expect(preview.headers['content-disposition']).toMatch(/^inline/);
    expect(preview.headers['content-security-policy']).toContain('sandbox');
    expect((await other.agent.get(`/api/docs/files/${pdfId}`).query({ download: 1 })).status).toBe(403);
    // spreadsheets cannot be previewed, so VIEW cannot fetch them at all
    expect((await other.agent.get(`/api/docs/files/${xlsxId}`)).status).toBe(403);
    expect((await other.agent.get(`/api/docs/folders/${folder.id}/export`)).status).toBe(403);
    expect((await upload(other, folder.id, 'n.pdf', await makePdf(), 'application/pdf')).status).toBe(403);
    expect((await other.agent.delete(`/api/docs/files/${pdfId}`)).status).toBe(403);
    expect((await other.agent.post(`/api/docs/folders/${folder.id}/dirs`).send({ name: 'x' })).status).toBe(403);
  });

  it('DOWNLOAD: adds download and export, still no changes', async () => {
    const { su, other, folder, pdfId, xlsxId } = await setup();
    await grant(su, folder.id, other.user.id, 'DOWNLOAD');
    const dl = await other.agent.get(`/api/docs/files/${xlsxId}`).buffer().parse(binaryParser);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toMatch(/^attachment/);
    expect((await other.agent.get(`/api/docs/files/${pdfId}`).query({ download: 1 })).headers['content-disposition']).toMatch(/^attachment/);
    expect((await other.agent.get(`/api/docs/folders/${folder.id}/export`).buffer().parse(binaryParser)).status).toBe(200);
    expect((await other.agent.patch(`/api/docs/files/${pdfId}`).send({ name: 'renamed.pdf' })).status).toBe(403);
    expect((await other.agent.delete(`/api/docs/files/${pdfId}`)).status).toBe(403);
  });

  it('EDIT: full collaboration inside the folder; grants can be lowered or removed', async () => {
    const { su, other, folder, pdfId } = await setup();
    await grant(su, folder.id, other.user.id, 'EDIT');
    expect((await upload(other, folder.id, 'theirs.pdf', await makePdf(), 'application/pdf')).status).toBe(201);
    expect((await other.agent.patch(`/api/docs/files/${pdfId}`).send({ name: 'renamed.pdf' })).status).toBe(200);
    expect((await other.agent.delete(`/api/docs/files/${pdfId}`)).status).toBe(200);

    await grant(su, folder.id, other.user.id, 'VIEW');
    expect((await upload(other, folder.id, 'more.pdf', await makePdf(), 'application/pdf')).status).toBe(403);
    expect((await grant(su, folder.id, other.user.id, null)).status).toBe(200);
    expect((await other.agent.get(`/api/docs/folders/${folder.id}`)).status).toBe(404);
    expect(await prisma.docGrant.count()).toBe(0);
  });

  it('only the super admin manages grants, and only for other staff', async () => {
    const { su, owner, other, folder } = await setup();
    const admin = await asAdmin();
    expect((await owner.agent.put(`/api/docs/folders/${folder.id}/grants/${other.user.id}`).send({ access: 'EDIT' })).status).toBe(403);
    expect((await admin.agent.put(`/api/docs/folders/${folder.id}/grants/${other.user.id}`).send({ access: 'EDIT' })).status).toBe(403);
    expect((await owner.agent.get(`/api/docs/folders/${folder.id}/grants`)).status).toBe(403);

    const client = await asClient();
    expect((await grant(su, folder.id, client.user.id, 'VIEW')).status).toBe(400);
    expect((await grant(su, folder.id, owner.user.id, 'VIEW')).body.error).toBe('USER_ALWAYS_HAS_ACCESS');
    expect((await grant(su, folder.id, su.user.id, 'VIEW')).body.error).toBe('USER_ALWAYS_HAS_ACCESS');
    expect((await grant(su, folder.id, other.user.id, 'ROOT')).status).toBe(400);

    await grant(su, folder.id, other.user.id, 'DOWNLOAD');
    const g = await su.agent.get(`/api/docs/folders/${folder.id}/grants`);
    expect(g.status).toBe(200);
    expect(g.body.grants).toEqual([expect.objectContaining({ access: 'DOWNLOAD', user: expect.objectContaining({ id: other.user.id }) })]);
    expect(g.body.candidates.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining([other.user.id, admin.user.id]));
    expect(g.body.candidates.map((c: { id: string }) => c.id)).not.toContain(owner.user.id);
    expect(await prisma.auditLog.count({ where: { action: 'DOC_GRANT_CHANGED' } })).toBeGreaterThan(0);
  });

  it('the super admin can read the audit trail', async () => {
    const { su } = await setup();
    const res = await su.agent.get('/api/docs/audit').query({ action: 'DOC_' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(res.body.items[0]).toMatchObject({ action: expect.stringMatching(/^DOC_/), actor: expect.objectContaining({ id: expect.any(String) }) });
    const staff = await asStaff();
    expect((await staff.agent.get('/api/docs/audit')).status).toBe(403);
  });
});
