import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createClient, createStaff, uniq } from '../helpers/factories';
import { expectStatus } from '../helpers/workflow';
import {
  DEFAULT_PHONE_REMINDERS,
  dueLead,
  getPhoneReminderSettings,
  normaliseLeads,
  reminderKey,
  runPhoneReminders,
  savePhoneReminderSettings,
} from '../../src/lib/messaging/appointmentReminders.js';
import { runAppointmentReminders } from '../../src/jobs/reminders.js';
import { registeredJobs } from '../../src/lib/scheduler.js';
import '../../src/jobs/phoneReminders.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const PROVIDER_ENV = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'SMS_PROVIDER'] as const;

beforeEach(() => {
  // No provider configured: the messaging layer records CONSOLE rows and sends nothing.
  for (const k of PROVIDER_ENV) delete process.env[k];
});

const at = new Date('2030-05-20T08:00:00Z');
const rows = (userId: string) => prisma.outboundMessage.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

const embassyCase = async (phone: string | null = '+994501112233', locale: 'az' | 'de' | 'en' | 'ru' = 'en') => {
  const { user } = await createClient({ locale, phone });
  const c = await prisma.case.create({
    data: { number: uniq('TV-P-'), clientId: user.id, profession: 'Nurse', status: 'APPOINTMENT_SCHEDULED', appointmentAt: at, appointmentPlace: 'VFS Baku' },
  });
  return { user, c };
};

describe('pure helpers', () => {
  it('dueLead picks the tightest window reached, nothing outside the largest one', () => {
    const leads = [120, 1440];
    expect(dueLead(at, new Date(at.getTime() - 30 * HOUR), leads)).toBeNull();
    expect(dueLead(at, new Date(at.getTime() - 20 * HOUR), leads)).toBe(1440);
    expect(dueLead(at, new Date(at.getTime() - 2 * HOUR), leads)).toBe(120);
    expect(dueLead(at, new Date(at.getTime() - 10 * MIN), leads)).toBe(120);
    expect(dueLead(at, new Date(at.getTime() + MIN), leads)).toBeNull();
  });

  it('normaliseLeads keeps 1–3 valid, unique, ascending lead times', () => {
    expect(normaliseLeads([1440, 120, 120, 5, 99999])).toEqual([120, 1440]);
    expect(normaliseLeads([])).toEqual(DEFAULT_PHONE_REMINDERS.leadMinutes);
    expect(normaliseLeads([15, 30, 60, 90])).toEqual([15, 30, 60]);
  });

  it('the embassy 1-day key is the one jobs/reminders.ts uses', () => {
    expect(reminderKey({ kind: 'EMBASSY', id: 'c1', at }, 1440, 'WHATSAPP')).toBe(`appt-24h-wa:c1:${at.toISOString()}`);
    expect(reminderKey({ kind: 'EMBASSY', id: 'c1', at }, 120, 'SMS')).toBe(`phone-rem:EMBASSY:c1:${at.toISOString()}:120`);
  });
});

describe('runPhoneReminders', () => {
  it('embassy appointment: 1 day and 2 hours before, once each, by WhatsApp', async () => {
    const { user, c } = await embassyCase();
    const dayBefore = new Date(at.getTime() - 20 * HOUR);
    expect(await runPhoneReminders(dayBefore)).toBe(1);
    expect(await runPhoneReminders(dayBefore)).toBe(0);
    const twoHours = new Date(at.getTime() - 90 * MIN);
    expect(await runPhoneReminders(twoHours)).toBe(1);
    expect(await runPhoneReminders(twoHours)).toBe(0);
    const list = await rows(user.id);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ channel: 'WHATSAPP', to: '+994501112233', status: 'CONSOLE', caseId: c.id, templateKey: 'APPOINTMENT_REMINDER' });
    expect(list[0].body).toContain('embassy');
    expect(list[0].body).toContain('VFS Baku');
  });

  it('does not duplicate the 24-hour reminder the appointment job already sent', async () => {
    const { user } = await embassyCase();
    const dayBefore = new Date(at.getTime() - 20 * HOUR);
    await runAppointmentReminders(dayBefore);
    expect(await rows(user.id)).toHaveLength(1);
    expect(await runPhoneReminders(dayBefore)).toBe(0);
    expect(await rows(user.id)).toHaveLength(1);
  });

  it('a moved appointment gets fresh reminders', async () => {
    const { user, c } = await embassyCase();
    await runPhoneReminders(new Date(at.getTime() - HOUR));
    const moved = new Date(at.getTime() + 3 * HOUR);
    await prisma.case.update({ where: { id: c.id }, data: { appointmentAt: moved } });
    await runPhoneReminders(new Date(moved.getTime() - HOUR));
    expect(await rows(user.id)).toHaveLength(2);
  });

  it('respects opt-outs and a missing phone number; SMS when WhatsApp is off', async () => {
    const { user: noPhone } = await embassyCase(null);
    const { user: optedOut } = await embassyCase('+994502223344');
    await prisma.user.update({ where: { id: optedOut.id }, data: { whatsappOptIn: false, smsNotifications: false } });
    const { user: smsOnly } = await embassyCase('+994503334455', 'de');
    await prisma.user.update({ where: { id: smsOnly.id }, data: { whatsappOptIn: false } });
    const { user: inactive } = await embassyCase('+994504445566');
    await prisma.user.update({ where: { id: inactive.id }, data: { isActive: false } });

    await runPhoneReminders(new Date(at.getTime() - HOUR));
    expect(await rows(noPhone.id)).toHaveLength(0);
    expect(await rows(optedOut.id)).toHaveLength(0);
    expect(await rows(inactive.id)).toHaveLength(0);
    const sms = await rows(smsOnly.id);
    expect(sms).toHaveLength(1);
    expect(sms[0]).toMatchObject({ channel: 'SMS', status: 'CONSOLE' });
    expect(sms[0].body).toContain('Botschaftstermin');
  });

  it('German exam, booking and interview reminders', async () => {
    const { user } = await createClient({ locale: 'az', phone: '0501234567' });
    const staff = await createStaff();
    await prisma.germanExam.create({ data: { userId: user.id, provider: 'GOETHE', level: 'B1', examDate: at, location: 'Goethe-Institut Baku', status: 'REGISTERED' } });
    const slot = await prisma.consultationSlot.create({ data: { staffId: staff.user.id, startsAt: new Date(at.getTime() + HOUR), endsAt: new Date(at.getTime() + 90 * MIN) } });
    await prisma.booking.create({
      data: { slotId: slot.id, userId: user.id, name: 'Test', email: user.email, meetingUrl: 'https://meet.example/abc', manageToken: uniq('tok'), createdAt: new Date(at.getTime() - 10 * 24 * HOUR) },
    });
    const company = await prisma.company.create({ data: { name: 'Klinikum Test GmbH' } });
    const interview = await prisma.interview.create({
      data: { candidateId: user.id, companyId: company.id, startsAt: new Date(at.getTime() + 2 * HOUR), endsAt: new Date(at.getTime() + 3 * HOUR), status: 'CONFIRMED' },
    });
    // The interview was confirmed long ago (updatedAt is set by Prisma; move it back).
    await prisma.$executeRaw`UPDATE Interview SET updatedAt = ${new Date(at.getTime() - 10 * 24 * HOUR)} WHERE id = ${interview.id}`;

    expect(await runPhoneReminders(new Date(at.getTime() - 20 * HOUR))).toBe(3);
    const list = await rows(user.id);
    expect(list.map((r) => r.templateKey).sort()).toEqual(['BOOKING_REMINDER', 'GERMAN_EXAM_REMINDER', 'INTERVIEW_REMINDER']);
    expect(list.every((r) => r.to === '+994501234567' && r.status === 'CONSOLE')).toBe(true);
    expect(list.find((r) => r.templateKey === 'GERMAN_EXAM_REMINDER')!.body).toContain('Goethe B1');
    expect(list.find((r) => r.templateKey === 'INTERVIEW_REMINDER')!.body).toContain('Klinikum Test GmbH');
    expect(list.find((r) => r.templateKey === 'BOOKING_REMINDER')!.body).toContain('https://meet.example/abc');
  });

  it('a booking made inside a lead window skips that window (the confirmation covered it)', async () => {
    const { user } = await createClient({ phone: '+994505556677' });
    const staff = await createStaff();
    const slot = await prisma.consultationSlot.create({ data: { staffId: staff.user.id, startsAt: at, endsAt: new Date(at.getTime() + HOUR) } });
    await prisma.booking.create({
      data: { slotId: slot.id, userId: user.id, name: 'Test', email: user.email, meetingUrl: 'https://meet.example/x', manageToken: uniq('tok'), createdAt: new Date(at.getTime() - 5 * HOUR) },
    });
    expect(await runPhoneReminders(new Date(at.getTime() - 4 * HOUR))).toBe(0);
    expect(await runPhoneReminders(new Date(at.getTime() - HOUR))).toBe(1);
  });

  it('settings: switched off, a kind off, custom lead times', async () => {
    const { user } = await embassyCase();
    await savePhoneReminderSettings({ ...DEFAULT_PHONE_REMINDERS, enabled: false });
    expect(await runPhoneReminders(new Date(at.getTime() - HOUR))).toBe(0);
    await savePhoneReminderSettings({ ...DEFAULT_PHONE_REMINDERS, kinds: { ...DEFAULT_PHONE_REMINDERS.kinds, EMBASSY: false } });
    expect(await runPhoneReminders(new Date(at.getTime() - HOUR))).toBe(0);
    await savePhoneReminderSettings({ enabled: true, leadMinutes: [30, 2880], kinds: DEFAULT_PHONE_REMINDERS.kinds });
    expect(await runPhoneReminders(new Date(at.getTime() - 40 * HOUR))).toBe(1);
    expect(await runPhoneReminders(new Date(at.getTime() - HOUR))).toBe(0);
    expect(await runPhoneReminders(new Date(at.getTime() - 20 * MIN))).toBe(1);
    expect(await rows(user.id)).toHaveLength(2);
  });

  it('the job is registered', () => {
    expect(registeredJobs()).toContain('phone-reminders');
  });
});

describe('admin settings API', () => {
  it('GET for staff, PUT for admins only, validated', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const got = expectStatus(await staff.agent.get('/api/admin/messaging/reminders'), 200);
    expect(got.body.settings).toEqual(DEFAULT_PHONE_REMINDERS);
    expectStatus(await staff.agent.put('/api/admin/messaging/reminders').send(DEFAULT_PHONE_REMINDERS), 403);
    expectStatus(await admin.agent.put('/api/admin/messaging/reminders').send({ ...DEFAULT_PHONE_REMINDERS, leadMinutes: [5] }), 400);
    const body = { enabled: true, leadMinutes: [1440, 60], kinds: { EMBASSY: true, GERMAN_EXAM: false, BOOKING: true, INTERVIEW: true } };
    const saved = expectStatus(await admin.agent.put('/api/admin/messaging/reminders').send(body), 200);
    expect(saved.body.settings.leadMinutes).toEqual([60, 1440]);
    expect(await getPhoneReminderSettings()).toMatchObject({ leadMinutes: [60, 1440], kinds: { GERMAN_EXAM: false } });
  });
});
