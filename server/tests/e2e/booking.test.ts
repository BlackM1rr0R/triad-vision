import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { emailsTo, prisma, settle, waitFor } from '../helpers/db';
import { runBookingReminders } from '../../src/jobs/booking.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A slot `hours` from now, rounded to the minute. */
const slotAt = (staffId: string, hours: number, minutes = 30) => {
  const startsAt = new Date(Math.floor((Date.now() + hours * HOUR) / 60000) * 60000);
  return prisma.consultationSlot.create({ data: { staffId, startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60000) } });
};

const form = (slotId: string, over: Record<string, unknown> = {}) => ({
  slotId,
  topic: 'candidate',
  name: 'Ali Aliyev',
  email: 'ali@test.local',
  phone: '+994 50 000 00 00',
  message: 'I am a truck driver',
  locale: 'en',
  consent: true,
  ...over,
});

beforeEach(async () => {
  await prisma.reminderLog.deleteMany({ where: { key: { startsWith: 'booking-' } } });
});

describe('public slots', () => {
  it('lists only free, active, future slots at least 2 h ahead and within 21 days, one per time', async () => {
    const s1 = await asStaff();
    const s2 = await asStaff();
    const inactive = await asStaff({ isActive: false });
    const ok = await slotAt(s1.user.id, 5);
    const sameTime = await prisma.consultationSlot.create({ data: { staffId: s2.user.id, startsAt: ok.startsAt, endsAt: ok.endsAt } });
    await slotAt(s1.user.id, 1); // too soon
    await slotAt(s1.user.id, 23 * 24); // beyond 21 days
    await slotAt(s1.user.id, -5); // past
    await slotAt(inactive.user.id, 6);
    const booked = await slotAt(s1.user.id, 8);
    await anon().post('/api/booking').send(form(booked.id)).expect(201);

    const res = await anon().get('/api/booking/slots').expect(200);
    const ids = res.body.slots.map((s: { id: string }) => s.id);
    expect(ids).toHaveLength(1);
    expect([ok.id, sameTime.id]).toContain(ids[0]);
    expect(res.body.windowDays).toBe(21);
    expect(res.body.minNoticeHours).toBe(2);
    expect(res.body.slots[0]).not.toHaveProperty('staffId');
  });
});

describe('POST /api/booking', () => {
  it('books a slot, emails the booker, notifies the staff member and counts the conversion', async () => {
    const staff = await asStaff({ locale: 'de' });
    const slot = await slotAt(staff.user.id, 30);
    const res = await anon().post('/api/booking').send(form(slot.id)).expect(201);

    expect(res.body.booking.meetingUrl).toMatch(/^https:\/\/meet\.jit\.si\/TriadVision-[a-f0-9]{20}$/);
    expect(res.body.manageToken).toEqual(expect.any(String));
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: res.body.booking.id } });
    expect(row.manageToken).not.toBe(res.body.manageToken);
    expect(row.manageToken).toMatch(/^[a-f0-9]{64}$/);
    expect(row).toMatchObject({ status: 'BOOKED', email: 'ali@test.local', topic: 'candidate', locale: 'en', userId: null });

    const mails = await emailsTo('ali@test.local');
    expect(mails[0].subject).toBe('Triad Vision · Your free consultation is confirmed');

    const note = await waitFor(() => prisma.notification.findFirst({ where: { userId: staff.user.id } }));
    expect(note.title).toBe('Neue Beratung: Ali Aliyev');
    expect(note.type).toBe('BOOKING_NEW');
    expect(note.link).toBe('/admin/bookings');

    // The counter is bumped best-effort after the response; wait for it instead of racing it.
    const metric = await waitFor(() => prisma.analyticsDaily.findFirst({ where: { metric: 'booking' } }));
    expect(metric.count).toBeGreaterThanOrEqual(1);
  });

  it('links the booking to the logged-in user', async () => {
    const staff = await asStaff();
    const client = await asClient();
    const slot = await slotAt(staff.user.id, 10);
    const res = await client.agent.post('/api/booking').send(form(slot.id, { email: client.user.email })).expect(201);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: res.body.booking.id } });
    expect(row.userId).toBe(client.user.id);
  });

  it('answers 409 SLOT_TAKEN when the slot is already booked, also for a simultaneous race', async () => {
    const staff = await asStaff();
    const slot = await slotAt(staff.user.id, 10);
    await anon().post('/api/booking').send(form(slot.id)).expect(201);
    const again = await anon().post('/api/booking').send(form(slot.id, { email: 'other@test.local' })).expect(409);
    expect(again.body.error).toBe('SLOT_TAKEN');

    const race = await slotAt(staff.user.id, 12);
    const results = await Promise.all(
      ['a', 'b', 'c'].map((p) => anon().post('/api/booking').send(form(race.id, { email: `${p}@test.local` }))),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await prisma.booking.count({ where: { slotId: race.id } })).toBe(1);
  });

  it('rejects slots less than 2 hours ahead, unknown slots, missing consent and bad input', async () => {
    const staff = await asStaff();
    const soon = await slotAt(staff.user.id, 1.5);
    expect((await anon().post('/api/booking').send(form(soon.id)).expect(400)).body.error).toBe('SLOT_TOO_SOON');
    expect((await anon().post('/api/booking').send(form('nope')).expect(404)).body.error).toBe('SLOT_NOT_FOUND');
    const slot = await slotAt(staff.user.id, 5);
    await anon().post('/api/booking').send(form(slot.id, { consent: false })).expect(400);
    await anon().post('/api/booking').send(form(slot.id, { email: 'not-an-email' })).expect(400);
    await anon().post('/api/booking').send(form(slot.id, { topic: 'visa' })).expect(400);
    expect(await prisma.booking.count()).toBe(0);
  });

  it('silently drops honeypot submissions', async () => {
    const staff = await asStaff();
    const slot = await slotAt(staff.user.id, 5);
    await anon().post('/api/booking').send(form(slot.id, { website: 'http://spam' })).expect(201);
    expect(await prisma.booking.count()).toBe(0);
  });

  it('allows at most 3 bookings per e-mail in 7 days (case-insensitive)', async () => {
    const staff = await asStaff();
    for (let i = 0; i < 3; i++) {
      const s = await slotAt(staff.user.id, 5 + i);
      await anon().post('/api/booking').send(form(s.id, { email: i === 1 ? 'ALI@test.local' : 'ali@test.local' })).expect(201);
    }
    const s = await slotAt(staff.user.id, 20);
    const res = await anon().post('/api/booking').send(form(s.id)).expect(429);
    expect(res.body.error).toBe('BOOKING_LIMIT');
    // older bookings no longer count
    await prisma.booking.updateMany({ data: { createdAt: new Date(Date.now() - 8 * DAY) } });
    await anon().post('/api/booking').send(form(s.id)).expect(201);
  });
});

describe('manage link', () => {
  const book = async () => {
    const staff = await asStaff({ locale: 'en' });
    const slot = await slotAt(staff.user.id, 30);
    const res = await anon().post('/api/booking').send(form(slot.id, { locale: 'de' })).expect(201);
    return { staff, slot, token: res.body.manageToken as string, id: res.body.booking.id as string };
  };

  it('shows the booking and serves the .ics', async () => {
    const { token, slot } = await book();
    const res = await anon().get('/api/booking/manage').query({ token }).expect(200);
    expect(res.body.booking).toMatchObject({ status: 'BOOKED', name: 'Ali Aliyev', canCancel: true, topic: 'candidate' });
    expect(new Date(res.body.booking.startsAt).getTime()).toBe(slot.startsAt.getTime());
    expect(res.body.booking.meetingUrl).toMatch(/meet\.jit\.si/);

    const ics = await anon().get('/api/booking/ics').query({ token }).expect(200);
    expect(ics.headers['content-type']).toMatch(/text\/calendar/);
    expect(ics.headers['content-disposition']).toMatch(/attachment/);
    expect(ics.text).toContain('BEGIN:VEVENT');
    expect(ics.text).toContain(`DTSTART:${slot.startsAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`);
    expect(ics.text).toContain('Triad Vision — kostenlose Beratung');
    expect(ics.text.replace(/\r\n /g, '')).toContain('https://meet.jit.si/TriadVision-');
  });

  it('rejects unknown or malformed tokens without leaking anything', async () => {
    await book();
    expect((await anon().get('/api/booking/manage').query({ token: 'x'.repeat(43) }).expect(404)).body.error).toBe('BOOKING_NOT_FOUND');
    await anon().get('/api/booking/manage').query({ token: 'short' }).expect(400);
    await anon().get('/api/booking/manage').expect(400);
    await anon().get('/api/booking/ics').query({ token: 'y'.repeat(43) }).expect(404);
  });

  it('cancels, frees the slot for someone else and notifies the staff member', async () => {
    const { token, slot, staff } = await book();
    const res = await anon().post('/api/booking/manage/cancel').send({ token, reason: 'Plans changed' }).expect(200);
    expect(res.body.booking).toMatchObject({ status: 'CANCELLED', canCancel: false, meetingUrl: null });
    expect((await anon().post('/api/booking/manage/cancel').send({ token }).expect(409)).body.error).toBe('BOOKING_NOT_ACTIVE');

    const n = await waitFor(() => prisma.notification.findFirst({ where: { userId: staff.user.id, type: 'BOOKING_CANCELLED' } }));
    expect(n.title).toBe('Consultation cancelled: Ali Aliyev');
    expect(n.body).toContain('Plans changed');
    const mails = await emailsTo('ali@test.local', 2);
    expect(mails.map((m) => m.subject)).toContain('Triad Vision · Beratung abgesagt');

    const slots = await anon().get('/api/booking/slots').expect(200);
    expect(slots.body.slots.map((s: { id: string }) => s.id)).toContain(slot.id);
    await anon().post('/api/booking').send(form(slot.id, { email: 'next@test.local' })).expect(201);
    expect(await prisma.booking.count({ where: { slotId: slot.id } })).toBe(1);
    // the old link now points nowhere
    await anon().get('/api/booking/manage').query({ token }).expect(404);
  });

  it('cannot cancel a consultation that already started', async () => {
    const { token, slot } = await book();
    await prisma.consultationSlot.update({ where: { id: slot.id }, data: { startsAt: new Date(Date.now() - 60000) } });
    expect((await anon().post('/api/booking/manage/cancel').send({ token }).expect(409)).body.error).toBe('BOOKING_STARTED');
  });
});

describe('admin: slots', () => {
  it('requires staff', async () => {
    const client = await asClient();
    await client.agent.get('/api/admin/booking/slots').expect(403);
    await anon().get('/api/admin/booking/slots').expect(401);
  });

  it('creates single slots for yourself, rejects overlaps and past times; only admins act for others', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const admin = await asAdmin();
    const startsAt = new Date(Date.now() + 3 * DAY);
    startsAt.setUTCSeconds(0, 0);
    const res = await staff.agent.post('/api/admin/booking/slots').send({ startsAt, minutes: 30 }).expect(201);
    expect(res.body.slot.staffId).toBe(staff.user.id);
    expect(new Date(res.body.slot.endsAt).getTime() - startsAt.getTime()).toBe(30 * 60000);

    const overlap = new Date(startsAt.getTime() + 15 * 60000);
    expect((await staff.agent.post('/api/admin/booking/slots').send({ startsAt: overlap, minutes: 30 }).expect(409)).body.error).toBe('SLOT_OVERLAP');
    await staff.agent.post('/api/admin/booking/slots').send({ startsAt: new Date(Date.now() - HOUR), minutes: 30 }).expect(400);
    await staff.agent.post('/api/admin/booking/slots').send({ startsAt, minutes: 20 }).expect(400);
    await staff.agent.post('/api/admin/booking/slots').send({ startsAt, minutes: 30, staffId: other.user.id }).expect(403);
    const forOther = await admin.agent.post('/api/admin/booking/slots').send({ startsAt, minutes: 60, staffId: other.user.id }).expect(201);
    expect(forOther.body.slot.staffId).toBe(other.user.id);
  });

  it('generates slots from a weekly template in the chosen time zone without duplicates', async () => {
    const staff = await asStaff();
    // Next Monday (UTC calendar) as the start date, so every generated slot is in the future.
    const d = new Date(Date.now() + 2 * DAY);
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
    const startDate = d.toISOString().slice(0, 10);
    const body = {
      timeZone: 'Europe/Berlin',
      minutes: 30,
      weeks: 2,
      startDate,
      days: [
        { weekday: 1, ranges: [{ from: '09:00', to: '11:00' }] },
        { weekday: 3, ranges: [{ from: '14:00', to: '15:00' }, { from: '16:00', to: '16:45' }] },
      ],
    };
    const res = await staff.agent.post('/api/admin/booking/slots/template').send(body).expect(201);
    // Monday 4 slots + Wednesday 2 + 1 per week, 2 weeks
    expect(res.body).toEqual({ created: 14, skipped: 0 });
    const slots = await prisma.consultationSlot.findMany({ where: { staffId: staff.user.id }, orderBy: { startsAt: 'asc' } });
    const berlin = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    expect(berlin.format(slots[0].startsAt)).toBe('Mon 09:00');
    expect(berlin.format(slots[3].startsAt)).toBe('Mon 10:30');
    expect(berlin.format(slots[4].startsAt)).toBe('Wed 14:00');
    expect(berlin.format(slots[6].startsAt)).toBe('Wed 16:00');

    const again = await staff.agent.post('/api/admin/booking/slots/template').send(body).expect(201);
    expect(again.body).toEqual({ created: 0, skipped: 14 });

    await staff.agent.post('/api/admin/booking/slots/template').send({ ...body, timeZone: 'Mars/Base' }).expect(400);
    await staff.agent
      .post('/api/admin/booking/slots/template')
      .send({ ...body, days: [{ weekday: 1, ranges: [{ from: '12:00', to: '10:00' }] }] })
      .expect(400);
  });

  it('deletes only own free slots (admins any free slot)', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const admin = await asAdmin();
    const free = await slotAt(staff.user.id, 30);
    const booked = await slotAt(staff.user.id, 40);
    const foreign = await slotAt(other.user.id, 30);
    await anon().post('/api/booking').send(form(booked.id)).expect(201);

    expect((await staff.agent.delete(`/api/admin/booking/slots/${booked.id}`).expect(409)).body.error).toBe('SLOT_BOOKED');
    await staff.agent.delete(`/api/admin/booking/slots/${foreign.id}`).expect(404);
    await staff.agent.delete(`/api/admin/booking/slots/${free.id}`).expect(200);
    await admin.agent.delete(`/api/admin/booking/slots/${foreign.id}`).expect(200);

    const a = await slotAt(staff.user.id, 50);
    const b = await slotAt(other.user.id, 50);
    const bulk = await staff.agent.post('/api/admin/booking/slots/bulk-delete').send({ ids: [a.id, b.id, booked.id] }).expect(200);
    expect(bulk.body).toEqual({ deleted: 1, kept: 2 });
    expect(await prisma.consultationSlot.count({ where: { id: b.id } })).toBe(1);
  });

  it('lists slots: staff see their own, admins everyone or a chosen staff member', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const admin = await asAdmin();
    await slotAt(staff.user.id, 30);
    await slotAt(other.user.id, 30);
    const mine = await staff.agent.get('/api/admin/booking/slots').query({ staffId: other.user.id }).expect(200);
    expect(mine.body.slots).toHaveLength(1);
    expect(mine.body.slots[0].staffId).toBe(staff.user.id);
    expect((await admin.agent.get('/api/admin/booking/slots').expect(200)).body.slots).toHaveLength(2);
    expect((await admin.agent.get('/api/admin/booking/slots').query({ staffId: other.user.id }).expect(200)).body.slots).toHaveLength(1);
    const staffList = await admin.agent.get('/api/admin/booking/staff').expect(200);
    expect(staffList.body.canManageOthers).toBe(true);
    expect(staffList.body.staff.length).toBeGreaterThanOrEqual(3);
    expect((await staff.agent.get('/api/admin/booking/staff').expect(200)).body.staff).toHaveLength(1);
  });
});

describe('admin: bookings', () => {
  it('lists own bookings without the token hash, marks DONE / NO_SHOW only after the start', async () => {
    const staff = await asStaff();
    const other = await asStaff();
    const slot = await slotAt(staff.user.id, 30);
    const res = await anon().post('/api/booking').send(form(slot.id)).expect(201);
    const id = res.body.booking.id;
    const otherSlot = await slotAt(other.user.id, 30);
    await anon().post('/api/booking').send(form(otherSlot.id, { email: 'b@test.local' })).expect(201);

    const list = await staff.agent.get('/api/admin/booking/bookings').expect(200);
    expect(list.body.bookings).toHaveLength(1);
    expect(list.body.bookings[0]).not.toHaveProperty('manageToken');
    expect(list.body.summary.upcoming).toBe(1);

    expect((await staff.agent.patch(`/api/admin/booking/bookings/${id}`).send({ status: 'DONE' }).expect(400)).body.error).toBe('BOOKING_NOT_STARTED');
    await other.agent.patch(`/api/admin/booking/bookings/${id}`).send({ status: 'DONE' }).expect(404);
    await prisma.consultationSlot.update({ where: { id: slot.id }, data: { startsAt: new Date(Date.now() - HOUR) } });
    const done = await staff.agent.patch(`/api/admin/booking/bookings/${id}`).send({ status: 'NO_SHOW' }).expect(200);
    expect(done.body.booking.status).toBe('NO_SHOW');
    expect(done.body.booking).not.toHaveProperty('manageToken');
    expect(await prisma.auditLog.count({ where: { action: 'BOOKING_STATUS', target: id } })).toBe(1);
  });

  it('cancels with a message: emails the booker, notifies a registered booker in-app, frees the slot', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const client = await asClient({ locale: 'ru' });
    const slot = await slotAt(staff.user.id, 30);
    const res = await client.agent.post('/api/booking').send(form(slot.id, { email: client.user.email, locale: 'ru' })).expect(201);
    await settle();

    await admin.agent.post(`/api/admin/booking/bookings/${res.body.booking.id}/cancel`).send({ message: 'Staff is sick' }).expect(200);
    const mails = await emailsTo(client.user.email, 2);
    expect(mails.at(-1)!.subject).toBe('Triad Vision · Консультация отменена');
    const inApp = await waitFor(() => prisma.notification.findFirst({ where: { userId: client.user.id, type: 'BOOKING_CANCELLED' } }));
    expect(inApp.body).toContain('Staff is sick');
    // the slot owner hears about it because someone else cancelled
    await waitFor(() => prisma.notification.findFirst({ where: { userId: staff.user.id, type: 'BOOKING_CANCELLED' } }));
    expect((await admin.agent.post(`/api/admin/booking/bookings/${res.body.booking.id}/cancel`).send({}).expect(409)).body.error).toBe('BOOKING_NOT_ACTIVE');
    const slots = await anon().get('/api/booking/slots').expect(200);
    expect(slots.body.slots.map((s: { id: string }) => s.id)).toContain(slot.id);
  });
});

describe('reminder job', () => {
  it('sends the 24 h and 1 h reminders once each to booker and staff', async () => {
    const staff = await asStaff({ locale: 'az' });
    const slot = await slotAt(staff.user.id, 30);
    const res = await anon().post('/api/booking').send(form(slot.id)).expect(201);
    await settle();
    const id = res.body.booking.id;
    await prisma.booking.update({ where: { id }, data: { createdAt: new Date(Date.now() - 3 * DAY) } });

    // more than 24 h away: nothing yet
    expect(await runBookingReminders()).toBe(0);

    // 23 h before the start
    expect(await runBookingReminders(new Date(slot.startsAt.getTime() - 23 * HOUR))).toBe(1);
    expect(await runBookingReminders(new Date(slot.startsAt.getTime() - 22 * HOUR))).toBe(0);
    const mails = await emailsTo('ali@test.local', 2);
    expect(mails.map((m) => m.subject)).toContain('Triad Vision · Reminder: your consultation is tomorrow');
    const staff24 = await waitFor(() => prisma.notification.findFirst({ where: { userId: staff.user.id, type: 'BOOKING_REMINDER24H' } }));
    expect(staff24.title).toBe('Sabah məsləhət: Ali Aliyev');

    // 50 minutes before
    expect(await runBookingReminders(new Date(slot.startsAt.getTime() - 50 * 60000))).toBe(1);
    expect(await runBookingReminders(new Date(slot.startsAt.getTime() - 40 * 60000))).toBe(0);
    const all = await emailsTo('ali@test.local', 3);
    expect(all.map((m) => m.subject)).toContain('Triad Vision · Reminder: your consultation starts in 1 hour');
    await waitFor(() => prisma.notification.findFirst({ where: { userId: staff.user.id, type: 'BOOKING_REMINDER1H' } }));
  });

  it('skips cancelled bookings and the 24 h reminder for late bookings', async () => {
    const staff = await asStaff();
    const slot = await slotAt(staff.user.id, 20);
    const res = await anon().post('/api/booking').send(form(slot.id)).expect(201);
    expect(await runBookingReminders(new Date(slot.startsAt.getTime() - 19 * HOUR))).toBe(0);
    await anon().post('/api/booking/manage/cancel').send({ token: res.body.manageToken }).expect(200);
    expect(await runBookingReminders(new Date(slot.startsAt.getTime() - 30 * 60000))).toBe(0);
  });
});
