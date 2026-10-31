import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { asAdmin, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, createStaff } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';
import { createCase } from '../../src/lib/caseFlow.js';
import { buildDigestData, renderDigest, runStaffDigest, type DigestRecipient } from '../../src/lib/staffDigest/index.js';
import { periodRange, staffPerformance } from '../../src/lib/kpi/performance.js';
import { BACKUP_CHECK_KEY, runBackupCheckNotify } from '../../src/lib/ops/backupCheck.js';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

const recipient = (u: { id: string; email: string; locale: DigestRecipient['locale']; role: DigestRecipient['role']; firstName: string; lastName: string }): DigestRecipient => ({
  id: u.id,
  email: u.email,
  locale: u.locale,
  role: u.role,
  firstName: u.firstName,
  lastName: u.lastName,
});

const newCase = async (staffId: string | null) => {
  const { user: client } = await createClient({ firstName: 'Aysel', lastName: 'Məmmədova' });
  const c = await createCase(client.id, { profession: 'Pflegefachkraft', visaType: 'WORK' });
  if (staffId) await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staffId } });
  return { client, c };
};

let taskNo = 1;
const task = (title: string, dueAt: Date, userId: string, extra: Record<string, unknown> = {}) =>
  prisma.task.create({ data: { number: taskNo++, title, dueAt, assignees: { create: { userId } }, ...extra } });

// ─── 1. Morning digest ──────────────────────────────────────────────────

describe('staff morning digest', () => {
  // Fixed instants far from midnight: 2026-11-10 09:00 Baku (UTC+4).
  const at9 = new Date('2026-11-10T05:00:00Z');

  it('sends one digest per staff member and Baku day from 08:00, skips empty days, opted-out users and e-mail-off users', async () => {
    const busy = await asStaff({ locale: 'de', firstName: 'Lena' });
    const idle = (await createStaff({ locale: 'az' })).user;
    const optedOut = await asStaff({ locale: 'en' });
    const mailOff = (await createStaff({ locale: 'ru' })).user;
    await prisma.user.update({ where: { id: mailOff.id }, data: { emailNotifications: false } });

    // Work for "busy": an overdue task, a task due today, an embassy appointment today, a new lead assigned to them.
    await task('Zəng et', new Date(at9.getTime() - DAY), busy.user.id);
    await task('Vollmacht prüfen', new Date('2026-11-10T11:00:00Z'), busy.user.id);
    const { c } = await newCase(busy.user.id);
    await prisma.case.update({ where: { id: c.id }, data: { status: 'APPOINTMENT_SCHEDULED', appointmentAt: new Date('2026-11-10T08:00:00Z'), appointmentPlace: 'Botschaft Baku' } });
    await prisma.inquiry.create({ data: { kind: 'company', companyName: 'Pflege GmbH', contactName: 'Herr Weber', email: 'weber@example.com', message: 'Wir suchen 5 Pflegekräfte', locale: 'de', assignedStaffId: busy.user.id } });
    // The same kind of work for the opted-out and the e-mail-off user: they still get nothing.
    await task('Opted out task', new Date(at9.getTime() - DAY), optedOut.user.id);
    await task('Mail off task', new Date(at9.getTime() - DAY), mailOff.id);

    // Preference API: default on, switch off, read back.
    expect(expectStatus(await optedOut.agent.get('/api/admin/staff-ops/digest'), 200).body).toEqual({ enabled: true, emailNotifications: true });
    expect(expectStatus(await optedOut.agent.put('/api/admin/staff-ops/digest').send({ enabled: false }), 200).body).toEqual({ enabled: false });
    expect(expectStatus(await optedOut.agent.get('/api/admin/staff-ops/digest'), 200).body.enabled).toBe(false);

    // Before 08:00 Baku nothing goes out.
    expect(await runStaffDigest(new Date(at9.getTime() - 2 * HOUR))).toBe(0);
    // 09:00: exactly one e-mail, to the busy staff member, in German.
    expect(await runStaffDigest(at9)).toBe(1);
    const mails = await prisma.emailLog.findMany({ where: { subject: { contains: '2026-11-10' } } });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: busy.user.email, subject: 'Triad Vision · Ihr Tag heute · 2026-11-10' });
    for (const u of [idle, optedOut.user, mailOff]) expect(await prisma.emailLog.count({ where: { to: u.email } })).toBe(0);

    // Idempotent: later runs the same day send nothing (also after the opted-out user switches back on).
    await optedOut.agent.put('/api/admin/staff-ops/digest').send({ enabled: true });
    expect(await runStaffDigest(new Date(at9.getTime() + HOUR))).toBe(1); // only the re-enabled user, once
    expect(await runStaffDigest(new Date(at9.getTime() + 2 * HOUR))).toBe(0);
    expect(await prisma.emailLog.count({ where: { to: busy.user.email } })).toBe(1);
    expect(await prisma.emailLog.count({ where: { to: optedOut.user.email } })).toBe(1);
    // After 12:00 Baku nothing new starts (a long outage does not mail in the afternoon).
    expect(await runStaffDigest(new Date(at9.getTime() + DAY + 4 * HOUR))).toBe(0);

    // Content: grouped sections from the my-work queue, in the recipient's language.
    const data = await buildDigestData(recipient(busy.user), at9);
    const keys = data.sections.map((s) => s.key);
    expect(keys).toEqual(['appointments', 'overdue', 'new', 'today']);
    const { subject, body } = renderDigest(data, busy.user, at9);
    expect(subject).toBe('Ihr Tag heute · 2026-11-10');
    expect(body).toContain('Guten Morgen, Lena!');
    expect(body).toContain('Termine heute (1)');
    expect(body).toContain('12:00 ·');
    expect(body).toContain('Zəng et');
    expect(body).toContain('15:00 · Vollmacht prüfen · T-');
    expect(body).toContain('Pflege GmbH · Herr Weber');
  });

  it('test send works for staff even on an empty day', async () => {
    const staff = await asStaff({ locale: 'az' });
    expect(expectStatus(await staff.agent.post('/api/admin/staff-ops/digest/test'), 200).body).toEqual({ sent: true, total: 0 });
    expect(await prisma.emailLog.count({ where: { to: staff.user.email, subject: { contains: 'Bu gün nə etməlisən' } } })).toBe(1);
  });
});

// ─── 2. Performance report ──────────────────────────────────────────────

describe('staff performance report', () => {
  it('computes closed cases, tasks, response times, overdue backlog and ratings per staff member over a period; CSV; ADMIN only', async () => {
    const admin = await asAdmin();
    const staff = await asStaff();
    const a = (await createStaff({ firstName: 'Aaron', lastName: 'Alpha' })).user;
    const b = (await createStaff({ firstName: 'Berta', lastName: 'Beta' })).user;
    // Period: September 2026 (Baku days).
    const inSep = (d: number, h = 10) => new Date(Date.UTC(2026, 8, d, h - 4));

    const { c, client } = await newCase(a.id);
    await prisma.case.update({ where: { id: c.id }, data: { status: 'APPROVED', createdAt: inSep(1), decisionAt: inSep(10), closedAt: inSep(10) } });
    await prisma.review.create({ data: { userId: client.id, caseId: c.id, tokenHash: `t-${c.id}`, rating: 4, status: 'PENDING', submittedAt: inSep(12) } });
    // A case of B's waiting on the team for 5 days (overdue now), and an open overdue task of B.
    const { c: waiting } = await newCase(b.id);
    await prisma.case.update({ where: { id: waiting.id }, data: { status: 'DOCUMENTS_REVIEW' } });
    await prisma.$executeRaw`UPDATE \`Case\` SET updatedAt = ${new Date(Date.now() - 5 * DAY)} WHERE id = ${waiting.id}`;
    await task('Open overdue', new Date(Date.now() - 2 * DAY), b.id);
    // Tasks of A in September: one done on time, one done late (missed deadline).
    await task('Done', inSep(5), a.id, { status: 'DONE', completedAt: inSep(4) });
    await task('Late', inSep(6), a.id, { status: 'DONE', completedAt: inSep(8) });
    // Lead created 10:00, first action by A at 13:00 (3 h); a later action by B does not count.
    const lead = await prisma.inquiry.create({ data: { kind: 'contact', contactName: 'Lead', email: 'lead@example.com', message: 'Hallo', locale: 'de', createdAt: inSep(15) } });
    await prisma.auditLog.create({ data: { actorId: a.id, action: 'INQUIRY_STATUS_CHANGED', target: lead.id, createdAt: inSep(15, 13) } });
    await prisma.auditLog.create({ data: { actorId: b.id, action: 'INQUIRY_NOTES_UPDATED', target: `inquiry:${lead.id}`, createdAt: inSep(15, 14) } });
    // Assigning to someone else is not a response.
    const lead2 = await prisma.inquiry.create({ data: { kind: 'contact', contactName: 'Lead 2', email: 'lead2@example.com', message: 'Hallo', locale: 'de', createdAt: inSep(16) } });
    await prisma.auditLog.create({ data: { actorId: b.id, action: 'INQUIRY_ASSIGNED', target: `inquiry:${lead2.id}`, details: { to: a.id }, createdAt: inSep(16, 11) } });

    expectStatus(await staff.agent.get('/api/admin/kpi/performance').query({ from: '2026-09-01', to: '2026-09-30' }), 403);
    expectStatus(await admin.agent.get('/api/admin/kpi/performance').query({ from: '2026-09-30', to: '2026-09-01' }), 400);
    expectStatus(await admin.agent.get('/api/admin/kpi/performance').query({ from: '2025-01-01', to: '2026-09-30' }), 400);

    const res = expectStatus(await admin.agent.get('/api/admin/kpi/performance').query({ from: '2026-09-01', to: '2026-09-30' }), 200).body;
    const row = (id: string) => res.rows.find((r: { staff: { id: string } }) => r.staff.id === id);
    expect(row(a.id)).toMatchObject({ casesClosed: 1, approved: 1, tasksDone: 2, tasksMissed: 1, openOverdueTasks: 0, overdueCases: 0, avgInquiryResponseHours: 3, inquiryResponses: 1, reviewAvg: 4, reviews: 1 });
    expect(row(b.id)).toMatchObject({ casesClosed: 0, openOverdueTasks: 1, overdueCases: 1, inquiryResponses: 0, reviewAvg: null });
    expect(res.team.total).toMatchObject({ casesClosed: 1, tasksDone: 2, openOverdueTasks: 1, avgInquiryResponseHours: 3, reviewAvg: 4 });

    const csv = expectStatus(await admin.agent.get('/api/admin/kpi/performance/export.csv').query({ from: '2026-09-01', to: '2026-09-30' }), 200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('"Aaron Alpha","STAFF","2026-09-01","2026-09-30","1"');
    expect(csv.text.split('\r\n')[0]).toContain('avgInquiryResponseHours');
    expect(await prisma.auditLog.count({ where: { action: 'STAFF_PERFORMANCE_EXPORTED' } })).toBe(1);

    // Period outside the activity: zeros, no crash.
    const empty = await staffPerformance('2026-07-01', '2026-07-31');
    expect(empty!.rows.find((r) => r.staff.id === a.id)).toMatchObject({ casesClosed: 0, tasksDone: 0, reviewAvg: null });
    expect(periodRange('2026-02-30', '2026-03-01')).toBeNull(); // not a calendar day
    expect(periodRange('2026-02-28', '2026-02-28')).not.toBeNull(); // one day
    expect(periodRange('nope', '2026-03-01')).toBeNull();
  });
});

// ─── 3. Backup restore test ─────────────────────────────────────────────

describe('backup restore test result', () => {
  // Exactly what deploy/backup-verify.sh writes.
  const result = (over: Prisma.InputJsonObject = {}): Prisma.InputJsonObject => ({
    status: 'ok',
    checkedAt: new Date(Date.now() - HOUR).toISOString().replace(/\.\d{3}Z$/, '.000Z'),
    backupFile: 'triad-20261031-0230.tar.gz.enc',
    backupAt: '2026-10-31T02:30:00.000Z',
    tables: 247,
    counts: { User: { restored: 5, live: 5 }, Case: { restored: 2, live: 2 } },
    durationSec: 67,
    error: null,
    host: 'triad-vision',
    ...over,
  });
  const write = (value: Prisma.InputJsonObject) =>
    prisma.setting.upsert({ where: { key: BACKUP_CHECK_KEY }, create: { key: BACKUP_CHECK_KEY, value }, update: { value } });

  it('shows the status to admins only and notifies admins once per result (failure e-mails even with e-mail off)', async () => {
    const admin = await asAdmin({ locale: 'en' });
    const sup = await asSuperAdmin({ locale: 'de' });
    const staff = await asStaff();
    await prisma.user.update({ where: { id: sup.user.id }, data: { emailNotifications: false } });

    expect(expectStatus(await admin.agent.get('/api/admin/staff-ops/backup-check'), 200).body).toMatchObject({ check: null, configured: false, stale: false });
    expect(await runBackupCheckNotify()).toBeNull();
    expectStatus(await staff.agent.get('/api/admin/staff-ops/backup-check'), 403);

    const ok = result();
    await write(ok);
    expect(expectStatus(await admin.agent.get('/api/admin/staff-ops/backup-check'), 200).body).toMatchObject({ configured: true, stale: false, check: { status: 'ok', tables: 247, backupFile: ok.backupFile } });
    expect(await runBackupCheckNotify()).toBe('ok');
    expect(await runBackupCheckNotify()).toBeNull(); // once per result
    const okNote = await prisma.notification.findFirst({ where: { userId: admin.user.id, type: 'BACKUP_CHECK_OK' } });
    expect(okNote?.title).toBe('Backup verified: restore succeeded');
    expect(await prisma.notification.count({ where: { userId: staff.user.id } })).toBe(0);
    await vi.waitFor(async () => expect(await prisma.emailLog.count({ where: { to: admin.user.email } })).toBe(1));

    // A failed check: every admin is e-mailed, also the one with e-mail notifications off.
    await write(result({ status: 'failed', checkedAt: new Date().toISOString(), error: 'database.sql is truncated (no completion marker)', tables: null, counts: {} }));
    expect(await runBackupCheckNotify()).toBe('failed');
    const failed = await prisma.notification.findFirst({ where: { userId: sup.user.id, type: 'BACKUP_CHECK_FAILED' } });
    expect(failed?.title).toBe('Backup-Prüfung FEHLGESCHLAGEN');
    expect(failed?.body).toContain('truncated');
    await vi.waitFor(async () => expect(await prisma.emailLog.count({ where: { to: sup.user.email, subject: { contains: 'FEHLGESCHLAGEN' } } })).toBe(1));
  });

  it('warns once when the last check is too old, and ignores an unreadable row', async () => {
    const admin = await asAdmin({ locale: 'az' });
    await write(result({ checkedAt: new Date(Date.now() - 10 * DAY).toISOString() }));
    expect(expectStatus(await admin.agent.get('/api/admin/staff-ops/backup-check'), 200).body.stale).toBe(true);
    expect(await runBackupCheckNotify()).toBe('stale');
    expect(await runBackupCheckNotify()).toBeNull();
    const notes = await prisma.notification.findMany({ where: { userId: admin.user.id } });
    expect(notes.map((n) => n.type)).toEqual(['BACKUP_CHECK_STALE']); // the old result itself is not announced

    await write({ status: 'maybe', checkedAt: 'yesterday' });
    expect(await runBackupCheckNotify()).toBeNull();
    expect(expectStatus(await admin.agent.get('/api/admin/staff-ops/backup-check'), 200).body.check).toBeNull();
  });
});
