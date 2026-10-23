import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { act, createCaseVia, driveCaseTo, expectStatus } from '../helpers/workflow';
import { withHistory } from '../../src/lib/history/context.js';

type Item = {
  id: string;
  entity: string;
  entityId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  oldLabel: unknown;
  newLabel: unknown;
  masked: boolean;
  sensitive: boolean;
  actor: { id: string; name: string | null; role: string | null } | null;
  source: string;
  requestId: string | null;
  revertOfId: string | null;
  revertedById: string | null;
  revertedAt: string | null;
  canRevert: boolean;
};

const changes = (where: { entity?: string; entityId?: string; field?: string } = {}) =>
  prisma.fieldChange.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });

const listFor = async (agent: Awaited<ReturnType<typeof asAdmin>>['agent'], query: string) =>
  expectStatus(await agent.get(`/api/admin/history?${query}`), 200).body as { items: Item[]; total: number };

describe('capture', () => {
  it('records admin case PATCH with actor, source, request id and resolved names', async () => {
    const admin = await asAdmin();
    const staff = await asStaff({ firstName: 'Nigar', lastName: 'Həsənova' });
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    await prisma.fieldChange.deleteMany(); // ignore auto-assignment noise from case creation

    expectStatus(await admin.agent.patch(`/api/admin/cases/${c.id}`).send({ assignedStaffId: staff.user.id, profession: 'Aşpaz' }), 200);
    const rows = await changes({ entity: 'CASE', entityId: c.id });
    expect(rows.map((r) => r.field).sort()).toEqual(['assignedStaffId', 'profession']);
    for (const r of rows) {
      expect(r.actorId).toBe(admin.user.id);
      expect(r.actorRole).toBe('ADMIN');
      expect(r.source).toBe('admin');
      expect(r.requestId).toBeTruthy();
    }
    expect(new Set(rows.map((r) => r.requestId)).size).toBe(1); // one request = one group
    const prof = rows.find((r) => r.field === 'profession')!;
    expect(prof.oldValue).toBe('LKW sürücüsü');
    expect(prof.newValue).toBe('Aşpaz');

    const list = await listFor(admin.agent, `entity=CASE&entityId=${c.id}`);
    const assigned = list.items.find((i) => i.field === 'assignedStaffId')!;
    expect(assigned.newValue).toBe(staff.user.id);
    expect(assigned.newLabel).toBe('Nigar Həsənova');
    expect(assigned.actor?.name).toContain('Admin');
    expect(assigned.canRevert).toBe(true);
  });

  it('records nothing when the values do not change and never touches untracked fields', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    await prisma.fieldChange.deleteMany();
    expectStatus(await admin.agent.patch(`/api/admin/cases/${c.id}`).send({ profession: 'LKW sürücüsü' }), 200);
    expect(await prisma.fieldChange.count()).toBe(0);
  });

  it('records a client profile update as source client; secrets and noise are never recorded', async () => {
    const client = await asClient({ firstName: 'Orxan' });
    expectStatus(await client.agent.patch('/api/auth/me').send({ firstName: 'Orxan2', city: 'Gəncə', passportNumber: 'C01234567' }), 200);
    expectStatus(
      await client.agent.patch('/api/auth/me').send({ currentPassword: client.password, newPassword: 'N3w-Password-2026!' }),
      200,
    );
    // Direct writes of secret / noise columns (2FA seed, calendar token, presence) leave no trace either.
    await prisma.user.update({ where: { id: client.user.id }, data: { totpSecret: 'v1:secret', calendarToken: 'tok-123', statusText: 'Busy', emailVerifiedAt: new Date() } });

    const rows = await changes({ entity: 'USER', entityId: client.user.id });
    const fields = rows.map((r) => r.field).sort();
    expect(fields).toEqual(['city', 'firstName', 'passportNumber']);
    for (const r of rows) expect(r.source).toBe('client');
    const all = JSON.stringify(await prisma.fieldChange.findMany());
    expect(all).not.toContain('passwordHash');
    expect(all).not.toContain('tok-123');
    expect(all).not.toContain('v1:secret');
    // The passport number is stored sealed, never in clear.
    const pass = rows.find((r) => r.field === 'passportNumber')!;
    expect(pass.sensitive).toBe(true);
    expect(JSON.stringify(pass.newValue)).not.toContain('C01234567');
  });

  it('records workflow transitions (status and the fields they set) inside the transition transaction', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    expectStatus(await act(admin.agent, c.id, { action: 'CANCEL', reason: 'Client withdrew' }), 200);
    const rows = await changes({ entity: 'CASE', entityId: c.id });
    const status = rows.find((r) => r.field === 'status')!;
    expect(status.oldValue).toBe('DOCUMENTS_PENDING');
    expect(status.newValue).toBe('CANCELLED');
    expect(status.actorId).toBe(admin.user.id);
    const reason = rows.find((r) => r.field === 'cancelReason')!;
    expect(reason.newValue).toBe('Client withdrew');
    expect(reason.requestId).toBe(status.requestId);
    expect(rows.some((r) => r.field === 'closedAt' || r.field === 'updatedAt')).toBe(false);
  });

  it('a rolled back transaction leaves no history', async () => {
    const client = await asClient();
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: client.user.id }, data: { city: 'Şəki' } });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await prisma.fieldChange.count({ where: { entityId: client.user.id } })).toBe(0);
  });

  it('withHistory sets the source for automation / AI work and the system is the default', async () => {
    const client = await asClient();
    await prisma.user.update({ where: { id: client.user.id }, data: { city: 'Bakı' } });
    await withHistory({ source: 'automation' }, () => prisma.user.update({ where: { id: client.user.id }, data: { city: 'Sumqayıt' } }));
    const rows = await changes({ entity: 'USER', entityId: client.user.id });
    expect(rows.map((r) => r.source)).toEqual(['automation', 'system']);
  });

  it('records company PATCH and updateMany', async () => {
    const admin = await asAdmin();
    const company = await prisma.company.create({ data: { name: 'Muster GmbH', city: 'Berlin' } });
    expectStatus(await admin.agent.patch(`/api/admin/companies/${company.id}`).send({ city: 'München', vatId: 'DE123456789' }), 200);
    await prisma.company.updateMany({ where: { id: company.id }, data: { note: 'bulk' } });
    const rows = await changes({ entity: 'COMPANY', entityId: company.id });
    expect(rows.map((r) => r.field).sort()).toEqual(['city', 'note', 'vatId']);
    expect(rows.find((r) => r.field === 'vatId')!.sensitive).toBe(true);
  });
});

describe('revert', () => {
  it('reverts a field change, links both rows and audits it', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    expectStatus(await admin.agent.patch(`/api/admin/cases/${c.id}`).send({ profession: 'Aşpaz' }), 200);
    const change = (await changes({ entity: 'CASE', entityId: c.id, field: 'profession' }))[0]!;

    const dry = expectStatus(await admin.agent.post(`/api/admin/history/${change.id}/revert`).send({ dryRun: true }), 200).body;
    expect(dry.plan).toMatchObject({ current: 'Aşpaz', target: 'LKW sürücüsü' });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).profession).toBe('Aşpaz');

    const res = expectStatus(await admin.agent.post(`/api/admin/history/${change.id}/revert`).send({}), 200).body;
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).profession).toBe('LKW sürücüsü');
    const revertRow = await prisma.fieldChange.findUniqueOrThrow({ where: { id: res.revertChangeId } });
    expect(revertRow).toMatchObject({ source: 'revert', revertOfId: change.id, actorId: admin.user.id, oldValue: 'Aşpaz', newValue: 'LKW sürücüsü' });
    const original = await prisma.fieldChange.findUniqueOrThrow({ where: { id: change.id } });
    expect(original.revertedById).toBe(revertRow.id);
    expect(original.revertedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'HISTORY_REVERTED', actorId: admin.user.id } })).toBe(1);

    // A second revert of the same change is refused.
    const again = await admin.agent.post(`/api/admin/history/${change.id}/revert`).send({});
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('ALREADY_REVERTED');
  });

  it('409 CHANGED_SINCE when the field changed again; "revert anyway" with force', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    expectStatus(await admin.agent.patch(`/api/admin/cases/${c.id}`).send({ profession: 'Aşpaz' }), 200);
    const first = (await changes({ entity: 'CASE', entityId: c.id, field: 'profession' }))[0]!;
    expectStatus(await admin.agent.patch(`/api/admin/cases/${c.id}`).send({ profession: 'Qaynaqçı' }), 200);

    const res = await admin.agent.post(`/api/admin/history/${first.id}/revert`).send({});
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'CHANGED_SINCE', current: 'Qaynaqçı', canForce: true });

    expectStatus(await admin.agent.post(`/api/admin/history/${first.id}/revert`).send({ force: true }), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).profession).toBe('LKW sürücüsü');
  });

  it('status: only the latest change, only through a workflow step back', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    // DOCUMENTS_PENDING → DOCUMENTS_REVIEW (client submit): the step back is "request changes".
    const c = await driveCaseTo('DOCUMENTS_REVIEW', { client: client.agent, admin: admin.agent });
    const submit = (await changes({ entity: 'CASE', entityId: c.id, field: 'status' }))[0]!;
    expect(submit).toMatchObject({ oldValue: 'DOCUMENTS_PENDING', newValue: 'DOCUMENTS_REVIEW', source: 'client' });

    const ok = expectStatus(await admin.agent.post(`/api/admin/history/${submit.id}/revert`).send({ note: 'Pasport şəkli bulanıqdır' }), 200).body;
    expect(ok.plan.via).toBe('REQUEST_CHANGES');
    const after = await prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.status).toBe('DOCUMENTS_PENDING');
    expect(after.staffNote).toBe('Pasport şəkli bulanıqdır');
    const back = (await changes({ entity: 'CASE', entityId: c.id, field: 'status' }))[0]!;
    expect(back).toMatchObject({ source: 'revert', revertOfId: submit.id });
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, fromStatus: 'DOCUMENTS_REVIEW', toStatus: 'DOCUMENTS_PENDING' } })).toBe(1);

    // An older status change cannot be reverted any more.
    const older = await prisma.fieldChange.findFirstOrThrow({ where: { entityId: c.id, field: 'status', id: { not: back.id }, revertedAt: null } }).catch(() => null);
    if (older) {
      const r = await admin.agent.post(`/api/admin/history/${older.id}/revert`).send({});
      expect(r.status).toBe(409);
    }
  });

  it('status: a forward step has no way back (TRANSITION_NOT_ALLOWED) and force does not help', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const c = await driveCaseTo('EMBASSY_DOCUMENTS', { client: client.agent, admin: admin.agent });
    const confirm = (await changes({ entity: 'CASE', entityId: c.id, field: 'status' }))[0]!;
    expect(confirm).toMatchObject({ oldValue: 'CONTRACT_SIGNED', newValue: 'EMBASSY_DOCUMENTS' });
    // The contract upload goes through multer: the actor must survive the multipart parser.
    const sent = await prisma.fieldChange.findFirstOrThrow({ where: { entityId: c.id, field: 'status', newValue: { equals: 'CONTRACT_SENT' } } });
    expect(sent).toMatchObject({ actorId: admin.user.id, source: 'admin' });
    const res = await admin.agent.post(`/api/admin/history/${confirm.id}/revert`).send({ force: true });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'TRANSITION_NOT_ALLOWED', reason: 'NO_WORKFLOW_STEP', from: 'EMBASSY_DOCUMENTS', to: 'CONTRACT_SIGNED' });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('EMBASSY_DOCUMENTS');

    const list = await listFor(admin.agent, `entity=CASE&entityId=${c.id}&field=status`);
    expect(list.items.filter((i) => i.canRevert).map((i) => i.id)).toEqual([confirm.id]); // only the latest is offered
  });

  it('status: a cancellation is undone by reopening', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    expectStatus(await act(admin.agent, c.id, { action: 'CANCEL', reason: 'mistake' }), 200);
    const cancel = (await changes({ entity: 'CASE', entityId: c.id, field: 'status' }))[0]!;
    const res = expectStatus(await admin.agent.post(`/api/admin/history/${cancel.id}/revert`).send({}), 200).body;
    expect(res.plan.via).toBe('REOPEN');
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('DOCUMENTS_PENDING');
  });

  it('bulk: reverts every change of one request', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const before = await prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expectStatus(await admin.agent.patch(`/api/admin/cases/${c.id}`).send({ assignedStaffId: staff.user.id, profession: 'Aşpaz' }), 200);
    const rows = await changes({ entity: 'CASE', entityId: c.id });
    const requestId = rows.find((r) => r.field === 'profession')!.requestId!;

    const res = expectStatus(await admin.agent.post(`/api/admin/history/requests/${requestId}/revert`).send({}), 200).body;
    expect(res).toMatchObject({ ok: true, reverted: 2, failed: 0 });
    const after = await prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.profession).toBe(before.profession);
    expect(after.assignedStaffId).toBe(before.assignedStaffId);
    expect(await prisma.fieldChange.count({ where: { requestId, revertedAt: null } })).toBe(0);
  });

  it('user fields: revert of a profile change through the normal update path', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    expectStatus(await client.agent.patch('/api/auth/me').send({ city: 'Gəncə', birthDate: '1990-05-01' }), 200);
    const birth = (await changes({ entity: 'USER', entityId: client.user.id, field: 'birthDate' }))[0]!;
    expectStatus(await admin.agent.post(`/api/admin/history/${birth.id}/revert`).send({}), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).birthDate).toBeNull();
  });
});

describe('sensitive fields and authorization', () => {
  it('masks sensitive values for admins; the super admin sees and may revert them', async () => {
    const admin = await asAdmin();
    const sup = await asSuperAdmin();
    const client = await asClient();
    expectStatus(await client.agent.patch('/api/auth/me').send({ passportNumber: 'C01234567' }), 200);
    expectStatus(await client.agent.patch('/api/auth/me').send({ passportNumber: 'C07654321' }), 200);

    const masked = await listFor(admin.agent, `entity=USER&entityId=${client.user.id}&field=passportNumber`);
    expect(masked.items[0]).toMatchObject({ newValue: '•••321', oldValue: '•••567', masked: true, canRevert: false });
    expect(JSON.stringify(masked)).not.toContain('C0765');

    const r = await admin.agent.post(`/api/admin/history/${masked.items[0]!.id}/revert`).send({});
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('SENSITIVE_FIELD');

    const clear = await listFor(sup.agent, `entity=USER&entityId=${client.user.id}&field=passportNumber`);
    expect(clear.items[0]).toMatchObject({ newValue: 'C07654321', oldValue: 'C01234567', masked: false, canRevert: true });
    expectStatus(await sup.agent.post(`/api/admin/history/${clear.items[0]!.id}/revert`).send({}), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).passportNumber).toBe('C01234567');
  });

  it('STAFF may read the history of their own cases only, and never revert', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const client = await asClient();
    const mine = await createCaseVia(client.agent);
    await prisma.case.update({ where: { id: mine.id }, data: { assignedStaffId: staff.user.id } });
    const other = await createCaseVia((await asClient()).agent);
    await prisma.case.update({ where: { id: other.id }, data: { assignedStaffId: null } });
    expectStatus(await admin.agent.patch(`/api/admin/cases/${mine.id}`).send({ profession: 'Aşpaz' }), 200);

    const list = await listFor(staff.agent, `entity=CASE&entityId=${mine.id}`);
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items.every((i) => !i.canRevert)).toBe(true);
    expect((await staff.agent.get(`/api/admin/history?entity=CASE&entityId=${other.id}`)).status).toBe(403);
    expect((await staff.agent.get('/api/admin/history')).status).toBe(403);
    expect((await staff.agent.get(`/api/admin/history?entity=USER&entityId=${client.user.id}`)).status).toBe(403);
    const change = list.items.find((i) => i.field === 'profession')!;
    expect((await staff.agent.post(`/api/admin/history/${change.id}/revert`).send({})).status).toBe(403);
    expect((await client.agent.get('/api/admin/history')).status).toBe(403);
  });

  it('role / isActive / email reverts are for the super admin only', async () => {
    const admin = await asAdmin();
    const sup = await asSuperAdmin();
    const target = await asStaff();
    expectStatus(await sup.agent.patch(`/api/admin/users/${target.user.id}`).send({ isActive: false }), 200);
    const change = (await changes({ entity: 'USER', entityId: target.user.id, field: 'isActive' }))[0]!;
    expect(change).toMatchObject({ oldValue: true, newValue: false, actorId: sup.user.id });
    expect((await admin.agent.post(`/api/admin/history/${change.id}/revert`).send({})).status).toBe(403);
    expectStatus(await sup.agent.post(`/api/admin/history/${change.id}/revert`).send({}), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } })).isActive).toBe(true);
  });

  it('global list filters by actor, source and date range', async () => {
    const admin = await asAdmin();
    const client = await asClient();
    expectStatus(await client.agent.patch('/api/auth/me').send({ city: 'Lənkəran' }), 200);
    const company = await prisma.company.create({ data: { name: 'Filter GmbH' } });
    expectStatus(await admin.agent.patch(`/api/admin/companies/${company.id}`).send({ city: 'Köln' }), 200);

    const byActor = await listFor(admin.agent, `actorId=${admin.user.id}`);
    expect(byActor.items.every((i) => i.actor?.id === admin.user.id)).toBe(true);
    expect(byActor.items.some((i) => i.entity === 'COMPANY')).toBe(true);
    const bySource = await listFor(admin.agent, 'source=client');
    expect(bySource.items.length).toBeGreaterThan(0);
    expect(bySource.items.every((i) => i.source === 'client')).toBe(true);
    const future = await listFor(admin.agent, `from=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}`);
    expect(future.total).toBe(0);
    expect((await admin.agent.get('/api/admin/history?entity=NOPE')).status).toBe(400);
  });
});
