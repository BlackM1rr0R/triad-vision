import { describe, expect, it } from 'vitest';
import { asAdmin, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { ensureSection } from '../../src/lib/drive/roots.js';

const file = (parentId: string, name: string, size: number, extra: Record<string, unknown> = {}) =>
  prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FILE', name, parentId, size, mimeType: name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg', ...extra } });

describe('storage report', () => {
  it('sums sections, folders, uploaders, types, largest files, trash, versions and growth (ADMIN+)', async () => {
    const admin = await asAdmin({ firstName: 'Rəna', lastName: 'Admin' });
    const staff = await asStaff();
    const casesId = await ensureSection('cases');
    const templatesId = await ensureSection('templates');
    const sub = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'Müştəri A', parentId: casesId } });
    const deep = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'Pasport', parentId: sub.id } });
    const big = await file(deep.id, 'scan.pdf', 5000, { createdById: admin.user.id });
    await file(sub.id, 'foto.jpg', 1000, { createdById: staff.user.id });
    await file(templatesId, 'vorlage.pdf', 300);
    await file(templatesId, 'old.pdf', 700, { deletedAt: new Date() });
    await prisma.driveFileVersion.create({ data: { nodeId: big.id, version: 1, storageKey: 'k-old-1', mimeType: 'application/pdf', size: 4000 } });
    await prisma.driveNode.update({ where: { id: big.id }, data: { createdAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 15)) } });

    const r = expectStatus(await admin.agent.get('/api/originals/storage-report'), 200).body;
    expect(r.totals.bytes).toBe(6300);
    expect(r.totals.files).toBe(3);
    expect(r.sections.find((s: { key: string }) => s.key === 'cases').bytes).toBe(6000);
    expect(r.sections.find((s: { key: string }) => s.key === 'templates').bytes).toBe(300);
    expect(r.topFolders.find((f: { id: string }) => f.id === casesId)).toMatchObject({ bytes: 6000 });
    expect(r.topFolders.find((f: { id: string }) => f.id === sub.id)).toMatchObject({ bytes: 6000, files: 2 });
    expect(r.topFolders.find((f: { id: string }) => f.id === deep.id).path).toBe('Gemeinsame Dokumente / Anträge / Müştəri A / Pasport');
    expect(r.byUploader[0]).toMatchObject({ id: admin.user.id, name: 'Rəna Admin', bytes: 5000, files: 1 });
    expect(r.byUploader.find((u: { id: string | null }) => u.id === null).bytes).toBe(300);
    expect(r.byType.find((t: { type: string }) => t.type === 'pdf')).toMatchObject({ bytes: 5300, files: 2 });
    expect(r.byType.find((t: { type: string }) => t.type === 'image')).toMatchObject({ bytes: 1000 });
    expect(r.largestFiles[0]).toMatchObject({ id: big.id, bytes: 5000, parentId: deep.id });
    expect(r.trash).toEqual({ files: 1, bytes: 700 });
    expect(r.versions).toEqual({ bytes: 4000, count: 1 });
    expect(r.growth).toHaveLength(24);
    expect(r.growth[22].bytes).toBe(5000);
    expect(r.growth[23].bytes).toBe(1300);

    expect((await staff.agent.get('/api/originals/storage-report')).status).toBe(403);
  });
});
