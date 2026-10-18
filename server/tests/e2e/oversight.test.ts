import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createClient, createStaff } from '../helpers/factories';
import { makePdf } from '../helpers/files';
import { act, clientCase, createCaseVia, uploadDoc } from '../helpers/workflow';

/** Uploads one file to the first required requirement and returns the created document. */
const uploadOne = async (client: Parameters<typeof clientCase>[0], caseId: string) => {
  const c = await clientCase(client, caseId);
  const req = c.requirements.find((r) => r.stage === 'INITIAL' && r.required)!;
  const res = await uploadDoc(client, caseId, req.id);
  expect(res.status).toBe(201);
  return res.body.document as { id: string };
};

describe('super-admin oversight', () => {
  it('is for the super admin only', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const client = await asClient();
    for (const a of [admin, staff]) {
      expect((await a.agent.get('/api/admin/oversight/summary')).status).toBe(403);
      expect((await a.agent.get('/api/admin/oversight/activity')).status).toBe(403);
      expect((await a.agent.get(`/api/admin/oversight/staff/${staff.user.id}`)).status).toBe(403);
    }
    expect((await client.agent.get('/api/admin/oversight/summary')).status).toBe(403);
  });

  it('summarises users, cases, inquiries, documents, workspaces and every staff member', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff({ firstName: 'Aynur', lastName: 'Q' });
    const idle = await createStaff({ firstName: 'Idle', lastName: 'S' });
    const client = await asClient();
    await createClient();
    await prisma.inquiry.create({ data: { kind: 'company', contactName: 'X', email: 'x@y.z', message: 'hello there', locale: 'az', workersNeeded: 5 } });

    // Staff activity: review a document, send a message, upload a workspace file.
    const c = await createCaseVia(client.agent);
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id } });
    const doc = await uploadOne(client.agent, c.id);
    expect((await staff.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'ACCEPTED' })).status).toBe(200);
    expect((await staff.agent.post(`/api/admin/cases/${c.id}/messages`).send({ body: 'Salam' })).status).toBe(201);
    const roots = await staff.agent.get('/api/drive/roots');
    const folderId = roots.body.shared.id as string;
    expect((await staff.agent.post(`/api/drive/nodes/${folderId}/files`).attach('file', await makePdf(), { filename: 'a.pdf', contentType: 'application/pdf' })).status).toBe(201);

    const res = await su.agent.get('/api/admin/oversight/summary');
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b.users.byRole).toMatchObject({ CLIENT: 2, STAFF: 2, SUPER_ADMIN: 1 });
    expect(b.users.total).toBe(5);
    expect(b.users.clientsNew7d).toBe(2);
    expect(b.users.staffOnline).toBeGreaterThanOrEqual(1);
    expect(b.users.sessionsLive).toBeGreaterThanOrEqual(3);
    expect(b.cases.byStatus).toEqual({ DOCUMENTS_PENDING: 1 });
    expect(b.cases.new7d).toBe(1);
    expect(b.inquiries.byStatus).toEqual({ NEW: 1 });
    expect(b.inquiries.byKind).toEqual({ company: 1 });
    expect(b.documents.byStatus).toEqual({ ACCEPTED: 1 });
    // The upload plus the drive copy of the accepted document (made in the background).
    await waitFor(async () => (await prisma.driveNode.count({ where: { documentId: doc.id } })) === 1);
    expect((await su.agent.get('/api/admin/oversight/summary')).body.workspaces).toMatchObject({ files: 2 });
    expect(b.workspaces.bytes).toBeGreaterThan(0);
    expect(b.security.auditEntries30d).toBeGreaterThan(0);

    const rows = b.staff as { id: string; online: boolean; caseActions30d: number; documentsReviewed30d: number; messages30d: number; workspaceUploads30d: number; assignedOpen: number; activeMinutes30d: number; logins30d: number; workspace: { files: number } | null; lastSeenAt: string | null }[];
    expect(rows.map((r) => r.id).sort()).toEqual([su.user.id, staff.user.id, idle.user.id].sort());
    const a = rows.find((r) => r.id === staff.user.id)!;
    expect(a).toMatchObject({ online: true, documentsReviewed30d: 1, messages30d: 1, workspaceUploads30d: 1, assignedOpen: 1, logins30d: 1 });
    expect(a.caseActions30d).toBeGreaterThanOrEqual(1);
    expect(a.workspace).toBeNull(); // nobody has a personal space any more
    expect(a.lastSeenAt).not.toBeNull();
    const i = rows.find((r) => r.id === idle.user.id)!;
    expect(i).toMatchObject({ caseActions30d: 0, messages30d: 0, assignedOpen: 0 });
  });

  it('reports active time from sessions', async () => {
    const su = await asSuperAdmin();
    const staff = await createStaff();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.session.updateMany({ where: { userId: staff.user.id }, data: { createdAt: twoHoursAgo, lastSeenAt: oneHourAgo, revokedAt: oneHourAgo } });
    const res = await su.agent.get('/api/admin/oversight/summary');
    const row = res.body.staff.find((r: { id: string }) => r.id === staff.user.id);
    expect(row.online).toBe(false);
    expect(row.activeMinutes30d).toBe(60);
    expect(row.activeMinutes7d).toBe(60);
    expect(row.activeDays30d).toBe(1);
  });

  it('returns a daily activity series covering the window', async () => {
    const su = await asSuperAdmin();
    const client = await asClient();
    await createCaseVia(client.agent);
    const res = await su.agent.get('/api/admin/oversight/activity').query({ days: 14 });
    expect(res.status).toBe(200);
    expect(res.body.series).toHaveLength(14);
    const today = res.body.series.at(-1);
    expect(today.day).toBe(new Date().toISOString().slice(0, 10));
    expect(today.logins).toBeGreaterThanOrEqual(2);
    expect(today.newCases).toBe(1);
    expect(today.newClients).toBe(1);
    expect(today.caseEvents).toBeGreaterThanOrEqual(1);
    expect(today.staffActiveMinutes).toBeGreaterThanOrEqual(0);
    expect((await su.agent.get('/api/admin/oversight/activity').query({ days: 3 })).status).toBe(400);
  });

  it('shows one staff member in depth', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff({ firstName: 'Rena', lastName: 'H' });
    const other = await asStaff();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id } });
    expect((await act(su.agent, c.id, { action: 'CANCEL', reason: 'Test cancel' })).status).toBe(200);
    await staff.agent.post(`/api/admin/cases/${c.id}/notes`).send({ note: 'internal' });
    // A personal space from before the shared workspace (moved away by the start-up task).
    const folderId = (await prisma.driveNode.create({ data: { space: 'PERSONAL', kind: 'FOLDER', name: 'Rena H', ownerId: staff.user.id, system: true, inheritPermissions: false } })).id;
    expect((await su.agent.put(`/api/drive/nodes/${folderId}/grants`).send({ userId: other.user.id, access: 'VIEW' })).status).toBe(200);

    const res = await su.agent.get(`/api/admin/oversight/staff/${staff.user.id}`);
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b.user).toMatchObject({ id: staff.user.id, firstName: 'Rena', role: 'STAFF' });
    expect(b.online).toBe(true);
    expect(b.dailyActive).toHaveLength(31);
    expect(b.hourHistogram).toHaveLength(24);
    expect(b.sessions).toHaveLength(1);
    expect(b.sessions[0].live).toBe(true);
    expect(b.events.map((e: { type: string }) => e.type)).toContain('INTERNAL_NOTE');
    expect(b.events[0].case).toMatchObject({ number: expect.any(String), client: { firstName: 'Test' } });
    expect(b.eventTypes30d.INTERNAL_NOTE).toBe(1);
    expect(b.assignedCases.closed.map((x: { id: string }) => x.id)).toEqual([c.id]);
    expect(b.assignedCases.open).toEqual([]);
    expect(b.workspace).toMatchObject({ slug: 'Rena H', files: 0, sharedWith: [{ access: 'VIEW', user: { id: other.user.id } }], accessTo: [] });
    expect(b.totals).toMatchObject({ assignedCases: 1 });

    expect((await su.agent.get(`/api/admin/oversight/staff/${client.user.id}`)).status).toBe(404);
    expect((await su.agent.get('/api/admin/oversight/staff/nope')).status).toBe(404);
  });
});

describe('enriched admin pages (no duplicated storage, all derived)', () => {
  it('dashboard carries pending docs, overdue work, upcoming appointments and decision figures', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    await uploadOne(client.agent, c.id);
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: admin.user.id } });
    const res = await admin.agent.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ docsPending: 1, casesNew7d: 1, waitingOverdue3d: 0, myOpenCases: 1, unansweredClientMessages: 0, avgDaysToDecision: null });
    expect(res.body.appointments).toEqual([]);
    expect(res.body.inquiriesByStatus).toEqual({});
    await client.agent.post(`/api/cases/${c.id}/messages`).send({ body: 'sual' });
    expect((await admin.agent.get('/api/admin/dashboard')).body.unansweredClientMessages).toBe(1);
    await admin.agent.post(`/api/admin/cases/${c.id}/messages`).send({ body: 'cavab' });
    expect((await admin.agent.get('/api/admin/dashboard')).body.unansweredClientMessages).toBe(0);
  });

  it('case list rows include age, days in status, pending docs, messages and last event', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    await uploadOne(client.agent, c.id);
    await client.agent.post(`/api/cases/${c.id}/messages`).send({ body: 'hi' });
    const res = await admin.agent.get('/api/admin/cases');
    const row = res.body.items[0];
    expect(row).toMatchObject({ id: c.id, pendingDocs: 1, messagesCount: 1, daysInStatus: 0, ageDays: 0 });
    expect(row.lastEvent).toMatchObject({ type: 'DOCUMENT_UPLOADED', actor: { role: 'CLIENT' } });
    expect(row.statusSince).toBeDefined();
  });

  it('case detail returns derived stats: status history, document balance, message balance', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const doc = await uploadOne(client.agent, c.id);
    await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'REJECTED', note: 'blurry' });
    await client.agent.post(`/api/cases/${c.id}/messages`).send({ body: 'why?' });
    const res = await admin.agent.get(`/api/admin/cases/${c.id}`);
    expect(res.status).toBe(200);
    const s = res.body.stats;
    expect(s.statusHistory).toEqual([expect.objectContaining({ status: 'DOCUMENTS_PENDING', current: true })]);
    expect(s.documents).toMatchObject({ total: 1, pending: 0, accepted: 0, rejected: 1, requiredAccepted: 0 });
    expect(s.documents.requiredTotal).toBeGreaterThan(0);
    expect(s.messages).toMatchObject({ total: 1, fromClient: 1, fromStaff: 0, awaitingStaffReply: true });
    expect(s.lastActivity).toMatchObject({ type: 'DOCUMENT_REJECTED', byRole: 'ADMIN' });
    expect(s.daysToDecision).toBeNull();
  });

  it('user rows show last activity, live sessions and workload', async () => {
    const su = await asSuperAdmin();
    const staff = await asStaff();
    const res = await su.agent.get('/api/admin/users');
    const row = res.body.users.find((u: { id: string }) => u.id === staff.user.id);
    expect(row).toMatchObject({ online: true, liveSessions: 1, logins30d: 1, _count: { cases: 0, assignedCases: 0, docFiles: 0, messages: 0 } });
    expect(row.lastSeenAt).toBeDefined();
    expect(row.lastLoginAt).toBeDefined();
  });

  it('inquiries carry a summary', async () => {
    const admin = await asAdmin();
    await prisma.inquiry.create({ data: { kind: 'company', contactName: 'A', email: 'a@b.c', message: 'need workers', locale: 'de', workersNeeded: 12 } });
    await prisma.inquiry.create({ data: { kind: 'contact', contactName: 'B', email: 'b@b.c', message: 'question here', locale: 'az', status: 'DONE' } });
    const res = await admin.agent.get('/api/admin/inquiries');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.summary).toMatchObject({ byStatus: { NEW: 1, DONE: 1 }, byKind: { company: 1, contact: 1 }, new7d: 2, oldestOpenDays: 0, workersRequested: 12 });
  });

  it('client overview includes derived case figures', async () => {
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    await uploadOne(client.agent, c.id);
    const res = await client.agent.get('/api/account/overview');
    expect(res.body.activeCase.stats).toMatchObject({ ageDays: 0, daysInStatus: 0, messages: 0, uploads: 1 });
    expect(res.body.activeCase.stats.events).toBeGreaterThanOrEqual(1);
  });
});
