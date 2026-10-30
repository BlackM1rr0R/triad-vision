import { beforeEach, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { anon, asClient } from '../helpers/api';
import { prisma, settle, waitFor } from '../helpers/db';
import { createAdmin, createClient, createStaff, uniq } from '../helpers/factories';
import {
  addMonths,
  bakuParts,
  claimReminder,
  passportLevel,
  runAppointmentReminders,
  runContractReminders,
  runMissingDocsReminders,
  runPassportReminders,
  runReminders,
  runStaffSlaDigest,
} from '../../src/jobs/reminders.js';
import { registeredJobs } from '../../src/lib/scheduler.js';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

beforeEach(async () => {
  await prisma.reminderLog.deleteMany();
});

const makeCase = (clientId: string, data: Partial<Prisma.CaseUncheckedCreateInput> = {}) =>
  prisma.case.create({ data: { number: uniq('TV-T-'), clientId, profession: 'LKW driver', ...data } });

const notes = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type }, orderBy: { createdAt: 'asc' } });

/** A UTC moment on the same UTC date as `d`, at the given Baku (UTC+4) hour. */
const atBakuHour = (d: Date, hour: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour - 4, 0, 0));

describe('scheduler registration', () => {
  it('registers the reminder and review jobs', () => {
    expect(registeredJobs()).toEqual(expect.arrayContaining(['reminders', 'review-invites']));
  });

  it('claims a reminder key only once', async () => {
    expect(await claimReminder('x:1')).toBe(true);
    expect(await claimReminder('x:1')).toBe(false);
  });

  it('computes Baku day and hour', () => {
    expect(bakuParts(new Date('2026-10-15T21:30:00Z'))).toEqual({ day: '2026-10-16', hour: 1 });
  });
});

describe('embassy appointment reminders', () => {
  it('reminds the candidate and assigned staff the day before, then the candidate on the morning, once each', async () => {
    const { user: client } = await createClient({ locale: 'de' });
    const { user: staff } = await createStaff({ locale: 'en' });
    const at = new Date('2030-03-12T06:00:00Z'); // 10:00 Baku
    const c = await makeCase(client.id, { status: 'APPOINTMENT_SCHEDULED', appointmentAt: at, appointmentPlace: 'VFS Global Baku', assignedStaffId: staff.id });

    const dayBefore = new Date('2030-03-11T10:00:00Z'); // 14:00 Baku, 20 h before
    await runAppointmentReminders(dayBefore);
    await runAppointmentReminders(dayBefore);

    const first = await notes(client.id, 'APPOINTMENT_REMINDER');
    expect(first).toHaveLength(1);
    expect(first[0].title).toBe('Morgen ist Ihr Botschaftstermin');
    expect(first[0].body).toContain('VFS Global Baku');
    expect(first[0].body).toContain('Original-Reisepass');
    expect(first[0].caseId).toBe(c.id);
    const staffNotes = await notes(staff.id, 'APPOINTMENT_REMINDER_STAFF');
    expect(staffNotes).toHaveLength(1);
    expect(staffNotes[0].title).toBe(`${c.number}: embassy appointment tomorrow`);
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: client.email, subject: 'Triad Vision · Morgen ist Ihr Botschaftstermin' } }));

    // Same day, before 07:00 Baku: nothing yet.
    await runAppointmentReminders(new Date('2030-03-12T02:00:00Z'));
    expect(await notes(client.id, 'APPOINTMENT_REMINDER')).toHaveLength(1);

    // Morning of the day.
    const morning = new Date('2030-03-12T03:30:00Z');
    await runAppointmentReminders(morning);
    await runAppointmentReminders(morning);
    const all = await notes(client.id, 'APPOINTMENT_REMINDER');
    expect(all).toHaveLength(2);
    expect(all[1].title).toBe('Heute ist Ihr Botschaftstermin');
    expect(await notes(staff.id, 'APPOINTMENT_REMINDER_STAFF')).toHaveLength(1);
  });

  it('respects the email preference but keeps the in-app notification', async () => {
    const { user: client } = await createClient({ locale: 'en' });
    await prisma.user.update({ where: { id: client.id }, data: { emailNotifications: false } });
    await makeCase(client.id, { status: 'APPOINTMENT_SCHEDULED', appointmentAt: new Date('2030-03-12T06:00:00Z'), appointmentPlace: 'Embassy' });
    await runAppointmentReminders(new Date('2030-03-11T10:00:00Z'));
    expect(await notes(client.id, 'APPOINTMENT_REMINDER')).toHaveLength(1);
    await settle();
    expect(await prisma.emailLog.count({ where: { to: client.email } })).toBe(0);
  });

  it('ignores appointments more than 24 h away and other statuses', async () => {
    const { user: client } = await createClient();
    await makeCase(client.id, { status: 'APPOINTMENT_SCHEDULED', appointmentAt: new Date('2030-03-14T06:00:00Z'), appointmentPlace: 'X' });
    const { user: other } = await createClient();
    await makeCase(other.id, { status: 'DECISION_PENDING', appointmentAt: new Date('2030-03-12T06:00:00Z'), appointmentPlace: 'X' });
    await runAppointmentReminders(new Date('2030-03-11T10:00:00Z'));
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe('missing documents reminders', () => {
  const addRequirements = (caseId: string, stage: 'INITIAL' | 'EMBASSY') =>
    prisma.documentRequirement.createMany({
      data: [
        { caseId, stage, required: true, sortOrder: 0, title: { az: 'Pasport', de: 'Reisepass', en: 'Passport', ru: 'Паспорт' } },
        { caseId, stage, required: true, sortOrder: 1, title: { az: 'Foto', de: 'Foto', en: 'Photo', ru: 'Фото' } },
        { caseId, stage, required: false, sortOrder: 2, title: { az: 'Əlavə', de: 'Extra', en: 'Extra', ru: 'Доп.' } },
      ],
    });

  it('reminds every 7 days at most 3 times, then escalates to the assigned staff once', async () => {
    const { user: client } = await createClient({ locale: 'en' });
    const { user: staff } = await createStaff({ locale: 'az' });
    const c = await makeCase(client.id, { status: 'DOCUMENTS_PENDING', assignedStaffId: staff.id });
    await addRequirements(c.id, 'INITIAL');
    const t0 = c.createdAt.getTime();
    const run = (days: number) => runMissingDocsReminders(new Date(t0 + days * DAY));

    await run(6);
    expect(await notes(client.id, 'MISSING_DOCUMENTS_REMINDER')).toHaveLength(0);
    await run(8);
    const first = await notes(client.id, 'MISSING_DOCUMENTS_REMINDER');
    expect(first).toHaveLength(1);
    expect(first[0].title).toBe('Your documents are still incomplete');
    expect(first[0].body).toContain('• Passport');
    expect(first[0].body).toContain('• Photo');
    expect(first[0].body).not.toContain('Extra');

    await run(10);
    expect(await notes(client.id, 'MISSING_DOCUMENTS_REMINDER')).toHaveLength(1);
    await run(15);
    await run(22);
    expect(await notes(client.id, 'MISSING_DOCUMENTS_REMINDER')).toHaveLength(3);
    expect(await notes(staff.id, 'MISSING_DOCUMENTS_ESCALATION')).toHaveLength(0);

    await run(29);
    expect(await notes(client.id, 'MISSING_DOCUMENTS_REMINDER')).toHaveLength(3);
    const esc = await notes(staff.id, 'MISSING_DOCUMENTS_ESCALATION');
    expect(esc).toHaveLength(1);
    expect(esc[0].title).toBe(`${c.number}: namizəd sənədləri yükləmir`);
    await run(36);
    await run(50);
    expect(await notes(staff.id, 'MISSING_DOCUMENTS_ESCALATION')).toHaveLength(1);
  });

  it('escalates to all admins when no staff member is assigned', async () => {
    const { user: client } = await createClient();
    const { user: admin } = await createAdmin();
    const c = await makeCase(client.id, { status: 'EMBASSY_DOCUMENTS' });
    await addRequirements(c.id, 'EMBASSY');
    const t0 = c.createdAt.getTime();
    for (const d of [8, 15, 22, 29]) await runMissingDocsReminders(new Date(t0 + d * DAY));
    const reminders = await notes(client.id, 'MISSING_DOCUMENTS_REMINDER');
    expect(reminders).toHaveLength(3);
    expect(reminders[0].title).toBe('Səfirlik sənədləri hələ yüklənməyib');
    expect(await notes(admin.id, 'MISSING_DOCUMENTS_ESCALATION')).toHaveLength(1);
  });

  it('counts from the last upload and skips cases with every required document uploaded', async () => {
    const { user: client } = await createClient();
    const c = await makeCase(client.id, { status: 'DOCUMENTS_PENDING' });
    await addRequirements(c.id, 'INITIAL');
    const reqs = await prisma.documentRequirement.findMany({ where: { caseId: c.id, required: true }, orderBy: { sortOrder: 'asc' } });
    const t0 = c.createdAt.getTime();
    // One upload on day 5: the idle clock restarts.
    await prisma.document.create({
      data: { caseId: c.id, requirementId: reqs[0].id, stage: 'INITIAL', originalName: 'p.pdf', storedName: uniq('s'), mimeType: 'application/pdf', size: 1, uploadedById: client.id, createdAt: new Date(t0 + 5 * DAY) },
    });
    await runMissingDocsReminders(new Date(t0 + 8 * DAY));
    expect(await notes(client.id, 'MISSING_DOCUMENTS_REMINDER')).toHaveLength(0);
    await runMissingDocsReminders(new Date(t0 + 13 * DAY));
    const n = await notes(client.id, 'MISSING_DOCUMENTS_REMINDER');
    expect(n).toHaveLength(1);
    expect(n[0].body).not.toContain('Pasport');

    // Second required document uploaded → complete → no more reminders.
    await prisma.document.create({
      data: { caseId: c.id, requirementId: reqs[1].id, stage: 'INITIAL', originalName: 'f.jpg', storedName: uniq('s'), mimeType: 'image/jpeg', size: 1, uploadedById: client.id, createdAt: new Date(t0 + 14 * DAY) },
    });
    await runMissingDocsReminders(new Date(t0 + 40 * DAY));
    expect(await notes(client.id, 'MISSING_DOCUMENTS_REMINDER')).toHaveLength(1);
  });
});

describe('passport expiry reminders', () => {
  it('maps the expiry date to a level', () => {
    const now = new Date('2026-10-15T00:00:00Z');
    expect(passportLevel(new Date('2027-06-01'), now)).toBeNull();
    expect(passportLevel(new Date('2027-03-01'), now)).toBe('6m');
    expect(passportLevel(new Date('2026-12-01'), now)).toBe('3m');
    expect(passportLevel(new Date('2026-10-01'), now)).toBe('expired');
  });

  it('reminds at 6 and 3 months and informs staff when a case is active', async () => {
    const { user: client } = await createClient({ locale: 'ru' });
    const { user: staff } = await createStaff({ locale: 'de' });
    const expiry = new Date('2031-06-30T00:00:00Z');
    await prisma.user.update({ where: { id: client.id }, data: { passportExpiry: expiry } });
    const c = await makeCase(client.id, { status: 'EMBASSY_DOCUMENTS', assignedStaffId: staff.id });

    await runPassportReminders(addMonths(expiry, -7));
    expect(await notes(client.id, 'PASSPORT_EXPIRY')).toHaveLength(0);

    const at6 = addMonths(expiry, -5);
    await runPassportReminders(at6);
    await runPassportReminders(at6);
    const n6 = await notes(client.id, 'PASSPORT_EXPIRY');
    expect(n6).toHaveLength(1);
    expect(n6[0].title).toBe('Паспорт истекает менее чем через 6 месяцев');
    expect(n6[0].link).toBe('/account/profile');
    const s6 = await notes(staff.id, 'PASSPORT_EXPIRY_STAFF');
    expect(s6).toHaveLength(1);
    expect(s6[0].title).toBe(`${c.number}: Reisepass des Kandidaten`);

    await runPassportReminders(addMonths(expiry, -2));
    const all = await notes(client.id, 'PASSPORT_EXPIRY');
    expect(all).toHaveLength(2);
    expect(all[1].title).toBe('Паспорт истекает менее чем через 3 месяца');

    await runPassportReminders(new Date(expiry.getTime() + DAY));
    expect((await notes(client.id, 'PASSPORT_EXPIRY')).map((n) => n.title).at(-1)).toBe('Срок действия паспорта истёк');
    expect(await notes(staff.id, 'PASSPORT_EXPIRY_STAFF')).toHaveLength(3);
  });

  it('does not inform staff without an active case, and a new date starts fresh', async () => {
    const { user: client } = await createClient({ locale: 'en' });
    const { user: admin } = await createAdmin();
    const expiry = new Date('2031-06-30T00:00:00Z');
    await prisma.user.update({ where: { id: client.id }, data: { passportExpiry: expiry } });
    // REJECTED, not APPROVED: after an approved visa the passport belongs to the permit reminders (permit-expiry.test.ts).
    await makeCase(client.id, { status: 'REJECTED' });
    await runPassportReminders(addMonths(expiry, -5));
    expect(await notes(client.id, 'PASSPORT_EXPIRY')).toHaveLength(1);
    expect(await prisma.notification.count({ where: { userId: admin.id } })).toBe(0);

    // A renewed passport that expires soon again gets its own reminders.
    const renewed = new Date('2031-09-30T00:00:00Z');
    await prisma.user.update({ where: { id: client.id }, data: { passportExpiry: renewed } });
    await runPassportReminders(addMonths(renewed, -4));
    expect(await notes(client.id, 'PASSPORT_EXPIRY')).toHaveLength(2);
  });
});

describe('staff SLA digest', () => {
  it('sends one daily digest per staff member listing waiting cases, unassigned ones to every admin', async () => {
    const { user: client } = await createClient();
    const { user: staff } = await createStaff({ locale: 'en' });
    const { user: admin } = await createAdmin({ locale: 'az' });
    const { user: admin2 } = await createAdmin({ locale: 'de' });
    const mine = await makeCase(client.id, { status: 'DOCUMENTS_REVIEW', assignedStaffId: staff.id });
    const unassigned = await makeCase(client.id, { status: 'EMBASSY_REVIEW' });
    const decision = await makeCase(client.id, { status: 'DECISION_PENDING', assignedStaffId: staff.id });
    await makeCase(client.id, { status: 'DOCUMENTS_PENDING', assignedStaffId: staff.id }); // client's turn: never listed

    const now = atBakuHour(new Date(Date.now() + 5 * DAY), 10);
    await runStaffSlaDigest(atBakuHour(new Date(Date.now() + 5 * DAY), 6)); // before 08:00 Baku: nothing
    expect(await prisma.notification.count()).toBe(0);

    await runStaffSlaDigest(now);
    await runStaffSlaDigest(new Date(now.getTime() + 2 * HOUR));
    const s = await notes(staff.id, 'STAFF_SLA_DIGEST');
    expect(s).toHaveLength(1);
    expect(s[0].title).toBe('Cases waiting: 1');
    expect(s[0].body).toContain(mine.number);
    expect(s[0].body).toContain('document review');
    expect(s[0].body).not.toContain(decision.number);
    for (const a of [admin, admin2]) {
      const d = await notes(a.id, 'STAFF_SLA_DIGEST');
      expect(d).toHaveLength(1);
      expect(d[0].body).toContain(unassigned.number);
      expect(d[0].body).not.toContain(mine.number);
    }

    // Next day, decision pending > 21 days is included too.
    await runStaffSlaDigest(new Date(now.getTime() + 23 * DAY));
    const later = await notes(staff.id, 'STAFF_SLA_DIGEST');
    expect(later).toHaveLength(2);
    expect(later[1].body).toContain(decision.number);
  });
});

describe('contract signature reminder', () => {
  it('reminds the candidate once when the contract waits more than 5 days', async () => {
    const { user: client } = await createClient({ locale: 'az' });
    const c = await makeCase(client.id, { status: 'CONTRACT_SENT' });
    const sentAt = new Date();
    await prisma.contract.create({ data: { caseId: c.id, fileDocumentId: 'doc-x', sentAt } });

    await runContractReminders(new Date(sentAt.getTime() + 4 * DAY));
    expect(await notes(client.id, 'CONTRACT_SIGN_REMINDER')).toHaveLength(0);
    await runContractReminders(new Date(sentAt.getTime() + 6 * DAY));
    await runContractReminders(new Date(sentAt.getTime() + 9 * DAY));
    const n = await notes(client.id, 'CONTRACT_SIGN_REMINDER');
    expect(n).toHaveLength(1);
    expect(n[0].title).toBe('Müqavilə imzanızı gözləyir');
    expect(n[0].body).toContain('6 gündür');
  });

  it('runs every part together without throwing', async () => {
    await expect(runReminders(new Date())).resolves.toBeUndefined();
  });
});

describe('passport validity in the account', () => {
  it('reads, saves, validates and clears the passport expiry date', async () => {
    const client = await asClient();
    expect((await anon().get('/api/account/passport')).status).toBe(401);
    expect((await client.agent.get('/api/account/passport')).body).toEqual({ passportExpiry: null });
    const saved = await client.agent.patch('/api/account/passport').send({ passportExpiry: '2029-04-30' });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ passportExpiry: '2029-04-30' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).passportExpiry?.toISOString()).toBe('2029-04-30T00:00:00.000Z');
    expect((await client.agent.get('/api/account/passport')).body).toEqual({ passportExpiry: '2029-04-30' });
    for (const bad of ['2029-02-30', '30.04.2029', '1990-01-01', '2090-01-01', 42]) {
      expect((await client.agent.patch('/api/account/passport').send({ passportExpiry: bad })).status).toBe(400);
    }
    expect((await client.agent.patch('/api/account/passport').send({ passportExpiry: null })).body).toEqual({ passportExpiry: null });
  });
});
