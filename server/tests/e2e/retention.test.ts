import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { TEST_DOCS_DIR, TEST_UPLOADS_DIR } from '../helpers/testEnv';
import { act, createCaseVia, driveCaseTo, expectStatus, uploadRequired } from '../helpers/workflow';
import { monthsBefore, retentionStatus, runRetention } from '../../src/jobs/retention.js';
import { registeredJobs } from '../../src/lib/scheduler.js';

const DAY = 24 * 60 * 60 * 1000;
const privateFile = (storedName: string) => path.join(TEST_UPLOADS_DIR, 'private', storedName);

const closeDaysAgo = (caseId: string, days: number) =>
  prisma.case.update({ where: { id: caseId }, data: { closedAt: new Date(Date.now() - days * DAY) } });

describe('Case.closedAt', () => {
  it('is set when a case is cancelled / decided and cleared on reopen', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await driveCaseTo('CANCELLED', { client: client.agent, admin: admin.agent });
    const cancelled = await prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(cancelled.closedAt).not.toBeNull();
    expectStatus(await act(admin.agent, c.id, { action: 'REOPEN', to: 'DOCUMENTS_PENDING' }), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).closedAt).toBeNull();
  });

  it('is set on an approval', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await driveCaseTo('APPROVED', { client: client.agent, admin: admin.agent });
    const row = await prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.status).toBe('APPROVED');
    expect(Math.abs(row.closedAt!.getTime() - Date.now())).toBeLessThan(60_000);
  });
});

describe('monthsBefore', () => {
  it('subtracts calendar months and clamps to the month end', () => {
    expect(monthsBefore(new Date('2026-03-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(monthsBefore(new Date('2026-10-15T00:00:00Z'), 12).toISOString()).toBe('2025-10-15T00:00:00.000Z');
    expect(monthsBefore(new Date('2026-01-15T00:00:00Z'), 120).toISOString()).toBe('2016-01-15T00:00:00.000Z');
  });
});

describe('DSGVO retention job', () => {
  it('is registered with the scheduler', () => {
    expect(registeredJobs()).toContain('retention');
  });

  it('deletes files and Document rows of cases closed longer than the period, keeps the case and its history', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const old = await driveCaseTo('APPROVED', { client: client.agent, admin: admin.agent });
    const docs = await prisma.document.findMany({ where: { caseId: old.id } });
    expect(docs.length).toBeGreaterThan(5);
    expect(docs.some((d) => d.stage === 'CONTRACT')).toBe(true);
    expect(docs.some((d) => d.stage === 'CONTRACT_SIGNED')).toBe(true);
    for (const d of docs) expect(fs.existsSync(privateFile(d.storedName))).toBe(true);
    await prisma.caseMessage.create({ data: { caseId: old.id, authorId: client.user.id, body: 'hello' } });
    const eventsBefore = await prisma.caseEvent.count({ where: { caseId: old.id } });

    // Another, recently closed case of another client must survive.
    const client2 = await asClient();
    const recent = await createCaseVia(client2.agent);
    await uploadRequired(client2.agent, recent.id, 'INITIAL');
    expectStatus(await act(admin.agent, recent.id, { action: 'CANCEL', reason: 'Withdrawn' }), 200);
    await closeDaysAgo(recent.id, 30);
    const recentDocs = await prisma.document.findMany({ where: { caseId: recent.id } });
    expect(recentDocs.length).toBeGreaterThan(0);

    // A staff workspace file must never be touched.
    const staff = await asStaff();
    const folder = await prisma.docFolder.create({ data: { ownerId: staff.user.id, slug: 'retention-test' } });
    fs.mkdirSync(path.join(TEST_DOCS_DIR, 'retention-test'), { recursive: true });
    const wsFile = path.join(TEST_DOCS_DIR, 'retention-test', 'keep.pdf');
    fs.writeFileSync(wsFile, 'workspace');
    await prisma.docFile.create({
      data: { folderId: folder.id, path: '', name: 'keep.pdf', mimeType: 'application/pdf', size: 9, uploadedById: staff.user.id },
    });

    // Time travel: closed 13 months ago (default period is 12 months).
    await closeDaysAgo(old.id, 400);
    const status = await retentionStatus();
    expect(status.settings).toEqual({ months: 12, includeMessages: false });
    expect(status.dueCases).toBe(1);

    const result = await runRetention();
    expect(result).toMatchObject({ cases: 1, documents: docs.length, files: docs.length, failed: 0, messages: 0 });
    expect(result.bytes).toBeGreaterThan(0);

    for (const d of docs) expect(fs.existsSync(privateFile(d.storedName))).toBe(false);
    expect(await prisma.document.count({ where: { caseId: old.id } })).toBe(0);
    const purged = await prisma.case.findUniqueOrThrow({ where: { id: old.id }, include: { contract: true } });
    expect(purged.status).toBe('APPROVED');
    expect(purged.documentsPurgedAt).not.toBeNull();
    expect(purged.contract?.signedAt).not.toBeNull();
    expect(await prisma.caseMessage.count({ where: { caseId: old.id } })).toBe(1);
    expect(await prisma.caseEvent.count({ where: { caseId: old.id } })).toBe(eventsBefore + 1);
    expect(await prisma.caseEvent.findFirst({ where: { caseId: old.id, type: 'DOCUMENTS_PURGED' } })).toMatchObject({ visibleToClient: false });

    // Untouched: the recent case and the staff workspace.
    expect(await prisma.document.count({ where: { caseId: recent.id } })).toBe(recentDocs.length);
    for (const d of recentDocs) expect(fs.existsSync(privateFile(d.storedName))).toBe(true);
    expect(fs.existsSync(wsFile)).toBe(true);
    expect(await prisma.docFile.count()).toBe(1);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'RETENTION_PURGE' } });
    expect(log.details).toMatchObject({ cases: 1, documents: docs.length, files: docs.length, months: 12 });

    // Idempotent: nothing left to do.
    expect(await runRetention()).toMatchObject({ cases: 0, documents: 0 });
    expect(await prisma.auditLog.count({ where: { action: 'RETENTION_PURGE' } })).toBe(1);
    expect((await retentionStatus()).purgedTotal).toBe(1);
  });

  it('follows the configured period and can delete chat messages too', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await driveCaseTo('CANCELLED', { client: client.agent, admin: admin.agent });
    await prisma.caseMessage.create({ data: { caseId: c.id, authorId: client.user.id, body: 'bye' } });
    await closeDaysAgo(c.id, 70);

    expectStatus(await admin.agent.put('/api/admin/settings/retention').send({ value: { months: 3, includeMessages: true } }), 200);
    expect(await runRetention()).toMatchObject({ cases: 0 });

    expectStatus(await admin.agent.put('/api/admin/settings/retention').send({ value: { months: 2, includeMessages: true } }), 200);
    const r = await runRetention();
    expect(r).toMatchObject({ cases: 1, messages: 1 });
    expect(await prisma.caseMessage.count({ where: { caseId: c.id } })).toBe(0);
  });

  it('never purges open cases, even with an old closedAt left over', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await driveCaseTo('CANCELLED', { client: client.agent, admin: admin.agent });
    await prisma.case.update({ where: { id: c.id }, data: { status: 'DOCUMENTS_PENDING', closedAt: new Date(Date.now() - 900 * DAY) } });
    expect(await runRetention()).toMatchObject({ cases: 0 });
  });

  it('a missing file on disk does not block the purge', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await driveCaseTo('CANCELLED', { client: client.agent, admin: admin.agent });
    await prisma.document.create({
      data: { caseId: c.id, stage: 'OTHER', originalName: 'gone.pdf', storedName: 'does-not-exist.pdf', mimeType: 'application/pdf', size: 1, uploadedById: admin.user.id },
    });
    await closeDaysAgo(c.id, 800);
    expect(await runRetention()).toMatchObject({ cases: 1, documents: 1, files: 0, failed: 0 });
  });
});

describe('retention settings API', () => {
  it('validates the retention setting and reports the status (ADMIN only)', async () => {
    const admin = await asAdmin();
    for (const value of [{ months: 0 }, { months: 121 }, { months: 1.5 }, { months: '12' }, {}]) {
      expect((await admin.agent.put('/api/admin/settings/retention').send({ value })).status, JSON.stringify(value)).toBe(400);
    }
    const ok = await admin.agent.put('/api/admin/settings/retention').send({ value: { months: 24 } });
    expect(ok.status).toBe(200);
    expect(ok.body.setting.value).toEqual({ months: 24, includeMessages: false });
    expect(await prisma.auditLog.count({ where: { action: 'SETTING_UPDATED', target: 'setting:retention' } })).toBe(1);

    const status = await admin.agent.get('/api/admin/settings/retention-status');
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ settings: { months: 24, includeMessages: false }, dueCases: 0, dueNext30Days: 0, purgedTotal: 0 });
    expect(new Date(status.body.nextRunAt).getTime()).toBeGreaterThan(0);

    const staff = await asStaff();
    expect((await staff.agent.get('/api/admin/settings/retention-status')).status).toBe(403);
  });
});
