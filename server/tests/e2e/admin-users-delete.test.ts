import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { TEST_DOCS_DIR, TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { createCaseVia, expectStatus, uploadRequired } from '../helpers/workflow';
import { ensureRoots } from '../../src/lib/drive/roots.js';

const privateFile = (storedName: string) => path.join(TEST_UPLOADS_DIR, 'private', storedName);
const driveFile = (key: string) => path.join(TEST_DOCS_DIR, 'drive', key);

const del = (agent: Awaited<ReturnType<typeof asSuperAdmin>>['agent'], id: string, confirmEmail: string) =>
  agent.delete(`/api/admin/users/${id}`).send({ confirmEmail });

describe('DELETE /api/admin/users/:id — rules', () => {
  it('only the super admin may delete (admin / staff / client get 403)', async () => {
    const victim = await asClient();
    for (const actor of [await asAdmin(), await asStaff(), await asClient()]) {
      expectStatus(await actor.agent.delete(`/api/admin/users/${victim.user.id}`).send({ confirmEmail: victim.user.email }), 403);
      expectStatus(await actor.agent.get(`/api/admin/users/${victim.user.id}/deletion-preview`), 403);
    }
    expect(await prisma.user.findUnique({ where: { id: victim.user.id } })).not.toBeNull();
  });

  it('refuses to delete yourself, another super admin, and unknown ids', async () => {
    const sa = await asSuperAdmin();
    const other = await asSuperAdmin();
    expect(expectStatus(await del(sa.agent, sa.user.id, sa.user.email), 400).body.error).toBe('CANNOT_DELETE_SELF');
    expect(expectStatus(await del(sa.agent, other.user.id, other.user.email), 403).body.error).toBe('CANNOT_DELETE_SUPER_ADMIN');
    expect(expectStatus(await del(sa.agent, 'nope', 'x@test.local'), 404).body.error).toBe('USER_NOT_FOUND');
    expect(await prisma.user.count({ where: { id: { in: [sa.user.id, other.user.id] } } })).toBe(2);
  });

  it('requires the email as confirmation', async () => {
    const sa = await asSuperAdmin();
    const victim = await asClient();
    expect(expectStatus(await del(sa.agent, victim.user.id, 'wrong@test.local'), 400).body.error).toBe('CONFIRMATION_MISMATCH');
    expectStatus(await sa.agent.delete(`/api/admin/users/${victim.user.id}`).send({}), 400);
    // Case-insensitive match is accepted.
    expectStatus(await del(sa.agent, victim.user.id, victim.user.email.toUpperCase()), 200);
    expect(await prisma.user.findUnique({ where: { id: victim.user.id } })).toBeNull();
  });
});

describe('DELETE /api/admin/users/:id — candidate', () => {
  it('removes the account with its cases, documents (also on disk), messages, applications and notifications', async () => {
    const sa = await asSuperAdmin();
    const staff = await asStaff();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    await uploadRequired(client.agent, c.id, 'INITIAL');
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id } });
    // A staff upload and a staff message inside the candidate's own case go with the case.
    const staffDoc = await prisma.document.create({
      data: { caseId: c.id, stage: 'INITIAL', originalName: 'note.pdf', storedName: `${crypto.randomUUID()}.pdf`, mimeType: 'application/pdf', size: 4, uploadedById: staff.user.id },
    });
    fs.writeFileSync(privateFile(staffDoc.storedName), 'test');
    await prisma.caseMessage.createMany({
      data: [
        { caseId: c.id, authorId: client.user.id, body: 'Salam' },
        { caseId: c.id, authorId: staff.user.id, body: 'Salam, baxırıq' },
      ],
    });
    await prisma.notification.create({ data: { userId: client.user.id, type: 'INFO', title: 't', body: 'b' } });
    const docs = await prisma.document.findMany({ where: { caseId: c.id } });
    expect(docs.length).toBeGreaterThan(1);
    for (const d of docs) expect(fs.existsSync(privateFile(d.storedName))).toBe(true);

    // Another candidate's case must not be touched.
    const other = await asClient();
    const otherCase = await createCaseVia(other.agent);
    await uploadRequired(other.agent, otherCase.id, 'INITIAL');
    const otherDocs = await prisma.document.findMany({ where: { caseId: otherCase.id } });

    const preview = expectStatus(await sa.agent.get(`/api/admin/users/${client.user.id}/deletion-preview`), 200).body;
    expect(preview.user).toMatchObject({ id: client.user.id, email: client.user.email, role: 'CLIENT' });
    expect(preview.counts).toMatchObject({ cases: 1, documents: docs.length, caseMessages: 2 });

    const res = expectStatus(await del(sa.agent, client.user.id, client.user.email), 200);
    expect(res.body).toMatchObject({ ok: true, user: { id: client.user.id, role: 'CLIENT' } });
    expect(res.body.counts).toMatchObject({ cases: 1, documents: docs.length, files: docs.length, caseMessages: 2 });
    expect(res.body.counts.notifications).toBeGreaterThanOrEqual(1);

    expect(await prisma.user.findUnique({ where: { id: client.user.id } })).toBeNull();
    expect(await prisma.case.findUnique({ where: { id: c.id } })).toBeNull();
    expect(await prisma.document.count({ where: { caseId: c.id } })).toBe(0);
    expect(await prisma.caseMessage.count({ where: { caseId: c.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: client.user.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: client.user.id } })).toBe(0);
    for (const d of docs) expect(fs.existsSync(privateFile(d.storedName))).toBe(false);
    // The old session no longer works.
    expectStatus(await client.agent.get('/api/cases'), 401);

    // Untouched: the other candidate, the staff member.
    expect(await prisma.document.count({ where: { caseId: otherCase.id } })).toBe(otherDocs.length);
    for (const d of otherDocs) expect(fs.existsSync(privateFile(d.storedName))).toBe(true);
    expect(await prisma.user.findUnique({ where: { id: staff.user.id } })).not.toBeNull();
  });

  it('writes a USER_DELETED audit entry with the super admin as actor; earlier entries of the user keep no actor', async () => {
    const sa = await asSuperAdmin();
    const client = await asClient();
    await prisma.auditLog.create({ data: { actorId: client.user.id, action: 'EMAIL_VERIFIED', target: `user:${client.user.id}` } });
    expectStatus(await del(sa.agent, client.user.id, client.user.email), 200);

    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'USER_DELETED' } });
    expect(entry.actorId).toBe(sa.user.id);
    expect(entry.target).toBe(`user:${client.user.id}`);
    expect(entry.details).toMatchObject({ email: client.user.email, role: 'CLIENT', counts: expect.objectContaining({ cases: 0 }) });
    expect(await prisma.auditLog.count({ where: { actorId: client.user.id } })).toBe(0);
    const old = await prisma.auditLog.findFirstOrThrow({ where: { action: 'EMAIL_VERIFIED' } });
    expect(old.actorId).toBeNull();
  });
});

describe('DELETE /api/admin/users/:id — staff member', () => {
  it('unassigns cases, keeps their uploads and messages in others’ cases, moves "My files" into the company drive', async () => {
    const sa = await asSuperAdmin();
    const staff = await asStaff({ firstName: 'Kamran', lastName: 'Əliyev' });
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id } });
    const staffDoc = await prisma.document.create({
      data: { caseId: c.id, stage: 'INITIAL', originalName: 'checklist.pdf', storedName: `${crypto.randomUUID()}.pdf`, mimeType: 'application/pdf', size: 4, uploadedById: staff.user.id },
    });
    fs.writeFileSync(privateFile(staffDoc.storedName), 'test');
    const msg = await prisma.caseMessage.create({ data: { caseId: c.id, authorId: staff.user.id, body: 'Sənədləriniz qəbul olundu' } });
    const event = await prisma.caseEvent.create({ data: { caseId: c.id, type: 'NOTE', actorId: staff.user.id, note: 'checked' } });

    // Personal drive: root → folder → file (on disk).
    const { sharedId } = await ensureRoots();
    const root = await prisma.driveNode.create({
      data: { space: 'PERSONAL', kind: 'FOLDER', name: 'Kamran Əliyev', ownerId: staff.user.id, system: true, inheritPermissions: false, createdById: staff.user.id },
    });
    const folder = await prisma.driveNode.create({ data: { space: 'PERSONAL', kind: 'FOLDER', name: 'Müqavilələr', parentId: root.id, ownerId: staff.user.id, createdById: staff.user.id } });
    const key = crypto.randomBytes(16).toString('hex');
    fs.mkdirSync(path.join(TEST_DOCS_DIR, 'drive'), { recursive: true });
    fs.writeFileSync(driveFile(key), 'pdf');
    const file = await prisma.driveNode.create({
      data: { space: 'PERSONAL', kind: 'FILE', name: 'a.pdf', parentId: folder.id, ownerId: staff.user.id, createdById: staff.user.id, storageKey: key, mimeType: 'application/pdf', size: 3 },
    });
    // A file the staff member created in the company drive stays (creator set to null).
    const sharedFile = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: 'Team', parentId: sharedId, createdById: staff.user.id } });
    // Team content and a task created by them.
    const task = await prisma.task.create({ data: { number: 1, title: 'Call the embassy', createdById: staff.user.id } });
    const ann = await prisma.announcement.create({ data: { authorId: staff.user.id, title: 'Hello', body: 'Team' } });

    const preview = expectStatus(await sa.agent.get(`/api/admin/users/${staff.user.id}/deletion-preview`), 200).body;
    expect(preview.counts).toMatchObject({ cases: 0, assignedCases: 1, personalFiles: 1 });

    const res = expectStatus(await del(sa.agent, staff.user.id, staff.user.email), 200);
    expect(res.body.counts).toMatchObject({
      assignedCasesUnassigned: 1,
      documentsReassigned: 1,
      messagesReassigned: 1,
      announcementsReassigned: 1,
      driveNodesMoved: 3,
      driveFolder: 'Silinmiş istifadəçi — Kamran Əliyev',
    });

    expect(await prisma.user.findUnique({ where: { id: staff.user.id } })).toBeNull();
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(kase.assignedStaffId).toBeNull();
    expect((await prisma.document.findUniqueOrThrow({ where: { id: staffDoc.id } })).uploadedById).toBe(sa.user.id);
    expect(fs.existsSync(privateFile(staffDoc.storedName))).toBe(true);
    expect((await prisma.caseMessage.findUniqueOrThrow({ where: { id: msg.id } })).authorId).toBe(sa.user.id);
    expect((await prisma.caseEvent.findUniqueOrThrow({ where: { id: event.id } })).actorId).toBeNull();
    expect((await prisma.announcement.findUniqueOrThrow({ where: { id: ann.id } })).authorId).toBe(sa.user.id);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).createdById).toBeNull();
    expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: sharedFile.id } })).createdById).toBeNull();

    const moved = await prisma.driveNode.findUniqueOrThrow({ where: { id: root.id } });
    expect(moved).toMatchObject({ space: 'SHARED', parentId: sharedId, ownerId: null, system: false, inheritPermissions: false, name: 'Silinmiş istifadəçi — Kamran Əliyev' });
    expect(await prisma.driveNode.findUniqueOrThrow({ where: { id: folder.id } })).toMatchObject({ space: 'SHARED', ownerId: null, parentId: root.id });
    expect(await prisma.driveNode.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({ space: 'SHARED', ownerId: null, parentId: folder.id, storageKey: key });
    expect(fs.existsSync(driveFile(key))).toBe(true);
    // The super admin can open the moved folder in the drive.
    expectStatus(await sa.agent.get(`/api/drive/nodes/${root.id}`), 200);

    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'USER_DELETED' } });
    expect(entry.actorId).toBe(sa.user.id);
    expect(entry.details).toMatchObject({ email: staff.user.email, role: 'STAFF', counts: expect.objectContaining({ assignedCasesUnassigned: 1, driveNodesMoved: 3 }) });
  });

  it('a second deleted staff member with the same name gets a free folder name; an empty "My files" is just removed', async () => {
    const sa = await asSuperAdmin();
    const a = await asStaff({ firstName: 'Ali', lastName: 'V' });
    const b = await asStaff({ firstName: 'Ali', lastName: 'V' });
    const empty = await asStaff();
    for (const u of [a, b]) {
      const root = await prisma.driveNode.create({ data: { space: 'PERSONAL', kind: 'FOLDER', name: 'Ali V', ownerId: u.user.id, system: true, inheritPermissions: false } });
      await prisma.driveNode.create({ data: { space: 'PERSONAL', kind: 'FOLDER', name: 'x', parentId: root.id, ownerId: u.user.id } });
    }
    const emptyRoot = await prisma.driveNode.create({ data: { space: 'PERSONAL', kind: 'FOLDER', name: 'E', ownerId: empty.user.id, system: true, inheritPermissions: false } });
    expect(expectStatus(await del(sa.agent, a.user.id, a.user.email), 200).body.counts.driveFolder).toBe('Silinmiş istifadəçi — Ali V');
    expect(expectStatus(await del(sa.agent, b.user.id, b.user.email), 200).body.counts.driveFolder).toBe('Silinmiş istifadəçi — Ali V (2)');
    expect(expectStatus(await del(sa.agent, empty.user.id, empty.user.email), 200).body.counts.driveFolder).toBeNull();
    expect(await prisma.driveNode.findUnique({ where: { id: emptyRoot.id } })).toBeNull();
  });

  it('keeps booked consultation slots (moved to the super admin) and deletes free ones; a clash answers 409', async () => {
    const sa = await asSuperAdmin();
    const staff = await asStaff();
    const at = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    at.setUTCSeconds(0, 0);
    const booked = await prisma.consultationSlot.create({ data: { staffId: staff.user.id, startsAt: at, endsAt: new Date(at.getTime() + 30 * 60_000) } });
    const booking = await prisma.booking.create({
      data: { slotId: booked.id, name: 'Nigar', email: 'nigar@test.local', meetingUrl: 'https://meet.example/x', manageToken: crypto.randomBytes(16).toString('hex') },
    });
    const free = await prisma.consultationSlot.create({ data: { staffId: staff.user.id, startsAt: new Date(at.getTime() + 60 * 60_000), endsAt: new Date(at.getTime() + 90 * 60_000) } });

    // The super admin already has a slot at the booked time → nothing is deleted.
    const own = await prisma.consultationSlot.create({ data: { staffId: sa.user.id, startsAt: at, endsAt: new Date(at.getTime() + 30 * 60_000) } });
    expect(expectStatus(await del(sa.agent, staff.user.id, staff.user.email), 409).body.error).toBe('SLOT_CONFLICT');
    expect(await prisma.user.findUnique({ where: { id: staff.user.id } })).not.toBeNull();
    expect(await prisma.consultationSlot.count({ where: { staffId: staff.user.id } })).toBe(2);

    await prisma.consultationSlot.delete({ where: { id: own.id } });
    const res = expectStatus(await del(sa.agent, staff.user.id, staff.user.email), 200);
    expect(res.body.counts).toMatchObject({ slotsReassigned: 1, slotsDeleted: 1 });
    expect((await prisma.consultationSlot.findUniqueOrThrow({ where: { id: booked.id } })).staffId).toBe(sa.user.id);
    expect(await prisma.booking.findUnique({ where: { id: booking.id } })).not.toBeNull();
    expect(await prisma.consultationSlot.findUnique({ where: { id: free.id } })).toBeNull();
  });
});
