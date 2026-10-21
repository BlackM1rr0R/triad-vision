import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, expectStatus } from '../helpers/workflow';
import { ensureCaseFolder } from '../../src/lib/drive/caseFolders.js';
import { registeredJobs } from '../../src/lib/scheduler.js';
import { addMonths, runDriveRetention, setLegalHold } from '../../src/lib/retention/drive.js';
import '../../src/jobs/retention-drive.js';

const DAY = 24 * 60 * 60 * 1000;

/** A closed case (closed `closedAt`) with its client folder and one file inside. */
const closedCase = async (closedAt: Date, name = 'Kamran') => {
  const client = await asClient({ firstName: name, lastName: 'Əliyev' });
  const c = await createCaseVia(client.agent);
  const folderId = (await ensureCaseFolder(c.id))!;
  await prisma.case.update({ where: { id: c.id }, data: { status: 'CANCELLED', closedAt } });
  const file = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FILE', name: 'pasport.pdf', parentId: folderId, size: 100, mimeType: 'application/pdf' } });
  return { c, folderId, fileId: file.id };
};

const monthsAgo = (m: number, extraDays = 0) => new Date(addMonths(new Date(), -m).getTime() - extraDays * DAY);

const pathOf = async (id: string) => {
  const names: string[] = [];
  let cur = await prisma.driveNode.findUnique({ where: { id }, select: { name: true, parentId: true } });
  while (cur) {
    names.unshift(cur.name);
    cur = cur.parentId ? await prisma.driveNode.findUnique({ where: { id: cur.parentId }, select: { name: true, parentId: true } }) : null;
  }
  return names.join('/');
};

describe('drive retention', () => {
  it('is registered as a daily job', () => {
    expect(registeredJobs()).toContain('retention-drive');
  });

  it('archives client folders N months after the case closed (Archiv/<year>), once', async () => {
    const old = await closedCase(monthsAgo(7));
    const fresh = await closedCase(monthsAgo(2), 'Nigar');
    const r = await runDriveRetention();
    expect(r.archived).toBe(1);
    const folder = await prisma.driveNode.findUniqueOrThrow({ where: { id: old.folderId } });
    expect(folder.archivedAt).not.toBeNull();
    const year = (await prisma.case.findUniqueOrThrow({ where: { id: old.c.id } })).closedAt!.getUTCFullYear();
    expect(await pathOf(old.folderId)).toMatch(new RegExp(`^Gemeinsame Dokumente/Archiv/${year}/Kamran Əliyev`));
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: fresh.folderId } })).archivedAt).toBeNull();
    // Files stay inside.
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: old.fileId } })).parentId).toBe(old.folderId);
    expect(await prisma.auditLog.count({ where: { action: 'DRIVE_RETENTION_ARCHIVE' } })).toBe(1);
    expect((await runDriveRetention()).archived).toBe(0);
  });

  it('warns ADMIN+ 30 and 7 days before the purge, once each', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    // Purge (36 months) in 20 days → the 30-day warning.
    const soon = await closedCase(new Date(addMonths(new Date(), -36).getTime() + 20 * DAY));
    let r = await runDriveRetention();
    expect(r.warned).toBe(1);
    let notes = await prisma.notification.findMany({ where: { userId: admin.user.id, type: 'DRIVE_RETENTION_WARNING' } });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toContain('30');
    expect(notes[0].body).toContain(soon.c.number);
    expect(await prisma.notification.count({ where: { userId: staff.user.id, type: 'DRIVE_RETENTION_WARNING' } })).toBe(0);
    expect((await runDriveRetention()).warned).toBe(0);

    // 5 days left → the 7-day warning.
    await prisma.case.update({ where: { id: soon.c.id }, data: { closedAt: new Date(addMonths(new Date(), -36).getTime() + 5 * DAY) } });
    r = await runDriveRetention();
    expect(r.warned).toBe(1);
    notes = await prisma.notification.findMany({ where: { userId: admin.user.id, type: 'DRIVE_RETENTION_WARNING' }, orderBy: { createdAt: 'asc' } });
    expect(notes).toHaveLength(2);
    expect(notes[1].title).toContain('7');
    expect((await runDriveRetention()).warned).toBe(0);
  });

  it('moves the folder to the recycle bin on the purge date and audits it; Final and legal hold are skipped', async () => {
    const due = await closedCase(monthsAgo(36, 1));
    const held = await closedCase(monthsAgo(40), 'Leyla');
    const final = await closedCase(monthsAgo(37), 'Orxan');
    const finalInside = await closedCase(monthsAgo(38), 'Səbinə');
    await setLegalHold(held.folderId, true);
    await prisma.driveNode.update({ where: { id: final.folderId }, data: { finalAt: new Date() } });
    await prisma.driveNode.update({ where: { id: finalInside.fileId }, data: { finalAt: new Date() } });

    const r = await runDriveRetention();
    expect(r.purged).toBe(1);
    const folder = await prisma.driveNode.findUniqueOrThrow({ where: { id: due.folderId } });
    expect(folder.deletedAt).not.toBeNull();
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: due.fileId } })).deletedAt).not.toBeNull();
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'DRIVE_RETENTION_PURGE' } });
    expect(log.target).toBe(`drive:${due.folderId}`);
    for (const k of [held, final, finalInside]) {
      expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: k.folderId } })).deletedAt).toBeNull();
    }
    // Held / final folders are not archived either.
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: held.folderId } })).archivedAt).toBeNull();
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: final.folderId } })).archivedAt).toBeNull();

    // A folder restored by hand after a retention purge is not purged again.
    await prisma.driveNode.updateMany({ where: { deletedAt: { not: null } }, data: { deletedAt: null } });
    expect((await runDriveRetention()).purged).toBe(0);
  });

  it('settings, legal hold toggle and the dry-run preview (ADMIN+)', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const toArchive = await closedCase(monthsAgo(6, -10)); // archive date in 10 days
    const toPurge = await closedCase(monthsAgo(36, -15), 'Aysel'); // purge in 15 days
    const later = await closedCase(monthsAgo(1), 'Tural');

    const s = expectStatus(await admin.agent.get('/api/originals/retention/settings'), 200).body.settings;
    expect(s).toEqual({ archiveMonths: 6, deleteMonths: 36 });
    let p = expectStatus(await admin.agent.get('/api/originals/retention/preview'), 200).body;
    expect(p.caseDocuments.months).toBe(12);
    expect(p.archive.map((i: { folderId: string }) => i.folderId)).toContain(toArchive.folderId);
    expect(p.archive.map((i: { folderId: string }) => i.folderId)).not.toContain(later.folderId);
    expect(p.purge.map((i: { folderId: string }) => i.folderId)).toEqual([toPurge.folderId]);
    expect(p.purge[0].skipReason).toBeNull();

    expectStatus(await admin.agent.put('/api/originals/retention/legal-hold').send({ folderId: toPurge.folderId, hold: true }), 200);
    p = expectStatus(await admin.agent.get('/api/originals/retention/preview'), 200).body;
    expect(p.purge[0].skipReason).toBe('LEGAL_HOLD');
    expect(p.legalHolds).toBe(1);
    expect(expectStatus(await admin.agent.get('/api/originals/retention/legal-hold'), 200).body.folderIds).toEqual([toPurge.folderId]);

    expect((await admin.agent.put('/api/originals/retention/settings').send({ archiveMonths: 12, deleteMonths: 6 })).status).toBe(400);
    expectStatus(await admin.agent.put('/api/originals/retention/settings').send({ archiveMonths: 1, deleteMonths: 48 }), 200);
    p = expectStatus(await admin.agent.get('/api/originals/retention/preview'), 200).body;
    expect(p.purge).toHaveLength(0);
    expect(p.archive.map((i: { folderId: string }) => i.folderId)).toContain(later.folderId);

    expect((await staff.agent.get('/api/originals/retention/preview')).status).toBe(403);
    expect((await staff.agent.put('/api/originals/retention/legal-hold').send({ folderId: toPurge.folderId, hold: false })).status).toBe(403);
    // The preview changed nothing.
    expect(await prisma.driveNode.count({ where: { archivedAt: { not: null } } })).toBe(0);
  });
});
