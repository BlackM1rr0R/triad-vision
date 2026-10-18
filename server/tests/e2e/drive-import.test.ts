import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { TEST_DOCS_DIR } from '../helpers/testEnv';
import { importDocsToDrive } from '../../src/lib/drive/importDocs.js';

/** Writes a file of the old /docs layout and its DocFile row. */
const oldFile = async (folder: { id: string; slug: string }, rel: string, name: string, body: string, uploadedById: string) => {
  const dir = path.join(TEST_DOCS_DIR, folder.slug, ...rel.split('/').filter(Boolean));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), body);
  return prisma.docFile.create({
    data: { folderId: folder.id, path: rel, name, mimeType: 'application/pdf', size: Buffer.byteLength(body), version: 2, uploadedById, createdAt: new Date('2026-03-01T10:00:00Z') },
  });
};

describe('import of the old /docs workspaces into the drive', () => {
  it('dry run writes nothing; the import copies files, folders and grants; a re-run adds nothing', async () => {
    const owner = await asStaff({ firstName: 'Tofig', lastName: 'M' });
    const viewer = await asStaff();
    const exporter = await asStaff();
    const slug = `tofig-${Date.now()}`;
    const folder = await prisma.docFolder.create({ data: { ownerId: owner.user.id, slug } });
    for (const p of ['senedleri', 'senedleri/Firma A', 'senedleri/Firma A/senedler', 'bos']) await prisma.docDir.create({ data: { folderId: folder.id, path: p } });
    await oldFile(folder, '', 'root.pdf', '%PDF-root', owner.user.id);
    await oldFile(folder, 'senedleri/Firma A/senedler', 'Müqavilə.pdf', '%PDF-contract', owner.user.id);
    await prisma.docFile.create({ data: { folderId: folder.id, path: 'senedleri', name: 'lost.pdf', mimeType: 'application/pdf', size: 3, uploadedById: owner.user.id } });
    await prisma.docGrant.create({ data: { folderId: folder.id, userId: viewer.user.id, access: 'VIEW' } });
    await prisma.docGrant.create({ data: { folderId: folder.id, userId: exporter.user.id, access: 'DOWNLOAD' } });

    const dry = await importDocsToDrive({ dryRun: true });
    expect(dry).toMatchObject({ dryRun: true, workspaces: 1, foldersCreated: 4, filesImported: 2, grantsUpserted: 2, errors: [] });
    expect(dry.filesMissing).toEqual([`/docs/${slug}/senedleri/lost.pdf`]);
    expect(await prisma.driveNode.count()).toBe(0);

    const run = await importDocsToDrive();
    expect(run).toMatchObject({ dryRun: false, foldersCreated: 4, filesImported: 2, filesSkipped: 0, grantsUpserted: 2, errors: [] });
    // Each old workspace lands in the shared space as "Mitarbeiter/<owner>".
    const root = await prisma.driveNode.findFirstOrThrow({ where: { name: 'Tofig M', parent: { name: 'Mitarbeiter', system: true } } });
    expect(root).toMatchObject({ space: 'SHARED', ownerId: null, system: false });
    const contract = await prisma.driveNode.findFirstOrThrow({ where: { name: 'Müqavilə.pdf' }, include: { parent: { include: { parent: { include: { parent: true } } } } } });
    expect(contract).toMatchObject({ space: 'SHARED', ownerId: null, kind: 'FILE', version: 2, size: 13, createdById: owner.user.id });
    expect(contract.createdAt.toISOString()).toBe('2026-03-01T10:00:00.000Z');
    expect(contract.parent?.name).toBe('senedler');
    expect(contract.parent?.parent?.name).toBe('Firma A');
    expect(contract.parent?.parent?.parent?.parentId).toBe(root.id);
    expect(fs.readFileSync(path.join(TEST_DOCS_DIR, 'drive', contract.storageKey!), 'utf8')).toBe('%PDF-contract');
    // Originals stay where they were.
    expect(fs.existsSync(path.join(TEST_DOCS_DIR, slug, 'senedleri', 'Firma A', 'senedler', 'Müqavilə.pdf'))).toBe(true);
    expect(await prisma.driveNode.count({ where: { name: 'bos', kind: 'FOLDER', parentId: root.id } })).toBe(1);

    const grants = await prisma.driveGrant.findMany({ where: { nodeId: root.id } });
    expect(grants.map((g) => [g.userId, g.access]).sort()).toEqual(
      [
        [viewer.user.id, 'VIEW'],
        [exporter.user.id, 'EXPORT'],
      ].sort(),
    );

    const again = await importDocsToDrive();
    expect(again).toMatchObject({ foldersCreated: 0, foldersExisting: 4, filesImported: 0, filesSkipped: 2 });
    expect(await prisma.driveNode.count({ where: { kind: 'FILE' } })).toBe(2);
    expect(await prisma.driveGrant.count({ where: { nodeId: root.id } })).toBe(2);
  });
});
