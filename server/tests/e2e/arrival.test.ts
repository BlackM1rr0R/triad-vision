import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { runArrivalReminders, runStaleArrivalReminders } from '../../src/jobs/arrival.js';
import { registeredJobs } from '../../src/lib/scheduler.js';
import { staffFeedEvents } from '../../src/lib/ops/calendar.js';

const HOUR = 60 * 60 * 1000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);

const makeCase = (clientId: string, status: CaseStatus = 'APPROVED', assignedStaffId: string | null = null) =>
  prisma.case.create({ data: { clientId, number: `TV-A-${crypto.randomBytes(3).toString('hex')}`, profession: 'Pflegefachkraft', status, assignedStaffId } });

const notes = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type } });

const fill = { arrivalTime: inHours(24 * 10).toISOString(), arrivalAirport: 'FRA', departureAirport: 'GYD', flightNumber: 'j2 123', travellers: 2 };

describe('arrival plans: client side', () => {
  it('creates DRAFT plans lazily only for approved cases and keeps clients apart', async () => {
    const client = await asClient();
    const other = await asClient();
    const approved = await makeCase(client.user.id);
    const pending = await makeCase(client.user.id, 'DECISION_PENDING');
    const foreign = await makeCase(other.user.id);

    const list = (await client.agent.get('/api/arrival').expect(200)).body.items;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ caseId: approved.id, status: 'DRAFT', editable: true, travellers: 1, housingStatus: 'NONE' });
    expect(list[0]).not.toHaveProperty('staffNote');
    // idempotent
    await client.agent.get('/api/arrival').expect(200);
    expect(await prisma.arrivalPlan.count()).toBe(1);

    await client.agent.get(`/api/arrival/${pending.id}`).expect(404);
    await client.agent.patch(`/api/arrival/${pending.id}`).send({ travellers: 2 }).expect(404);
    // another client's case is invisible, even after that client's plan exists
    await other.agent.get('/api/arrival').expect(200);
    await client.agent.get(`/api/arrival/${foreign.id}`).expect(404);
    await client.agent.patch(`/api/arrival/${foreign.id}`).send({ travellers: 2 }).expect(404);
    await client.agent.post(`/api/arrival/${foreign.id}/submit`).expect(404);
    await client.agent.get(`/api/arrival/${foreign.id}/ics`).expect(404);
    expect(await prisma.arrivalPlan.count({ where: { caseId: pending.id } })).toBe(0);

    // Direct access creates the plan too (deep link before the list was opened).
    const late = await makeCase(client.user.id);
    expect((await client.agent.get(`/api/arrival/${late.id}`).expect(200)).body.plan.status).toBe('DRAFT');
  });

  it('validates edits', async () => {
    const client = await asClient();
    const c = await makeCase(client.user.id);
    await client.agent.get('/api/arrival').expect(200);
    const bad = async (body: Record<string, unknown>, code: string) => {
      const res = await client.agent.patch(`/api/arrival/${c.id}`).send(body);
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error).toBe(code);
    };
    await bad({ arrivalTime: inHours(-1).toISOString() }, 'ARRIVAL_IN_PAST');
    await bad({ arrivalTime: inHours(24 * 500).toISOString() }, 'ARRIVAL_TOO_FAR');
    await bad({ arrivalTime: 'tomorrow' }, 'VALIDATION');
    await bad({ flightNumber: 'not a flight' }, 'VALIDATION');
    await bad({ travellers: 0 }, 'VALIDATION');
    await bad({ travellers: 11 }, 'VALIDATION');
    await bad({ housingBudget: 50 }, 'VALIDATION');
    await bad({ luggageNote: 'x'.repeat(301) }, 'VALIDATION');
    await bad({ status: 'CONFIRMED' }, 'VALIDATION'); // strict: no staff fields
    await bad({ housingFrom: '2020-01-01' }, 'HOUSING_FROM_IN_PAST');
    const arrival = inHours(24 * 10);
    const tooEarly = new Date(arrival.getTime() - 5 * 24 * HOUR).toISOString().slice(0, 10);
    await bad({ arrivalTime: arrival.toISOString(), flightDate: tooEarly }, 'FLIGHT_DATE_MISMATCH');

    const ok = await client.agent
      .patch(`/api/arrival/${c.id}`)
      .send({ ...fill, flightDate: arrival.toISOString().slice(0, 10), pickupRequested: true, housingRequested: true, housingCity: 'Frankfurt am Main', housingBudget: 700, luggageNote: '  ', clientNote: 'Zwei Koffer' })
      .expect(200);
    expect(ok.body.plan).toMatchObject({ flightNumber: 'J2 123', arrivalAirport: 'FRA', travellers: 2, pickupRequested: true, housingStatus: 'REQUESTED', luggageNote: null, housingBudget: 700 });
    expect(new Date(ok.body.plan.arrivalTime).getTime()).toBe(new Date(fill.arrivalTime).getTime());
    // ICAO code without space is normalised
    expect((await client.agent.patch(`/api/arrival/${c.id}`).send({ flightNumber: 'ahy071' }).expect(200)).body.plan.flightNumber).toBe('AHY 071');
    // switching the housing request off again while untouched by staff
    expect((await client.agent.patch(`/api/arrival/${c.id}`).send({ housingRequested: false }).expect(200)).body.plan.housingStatus).toBe('NONE');
    expect(await prisma.auditLog.count({ where: { action: 'ARRIVAL_PLAN_EDITED' } })).toBe(3);
  });

  it('submit and cancel rules, staff notifications', async () => {
    const client = await asClient({ firstName: 'Leyla', lastName: 'Məmmədova' });
    const staff = await asStaff({ locale: 'de' });
    const admin = await asAdmin();
    const c = await makeCase(client.user.id, 'APPROVED', staff.user.id);
    await client.agent.get('/api/arrival').expect(200);

    const incomplete = await client.agent.post(`/api/arrival/${c.id}/submit`).expect(400);
    expect(incomplete.body).toMatchObject({ error: 'PLAN_INCOMPLETE', fields: ['arrivalTime', 'arrivalAirport'] });
    await client.agent.patch(`/api/arrival/${c.id}`).send({ ...fill, housingRequested: true }).expect(200);
    expect((await client.agent.post(`/api/arrival/${c.id}/submit`).expect(400)).body.fields).toEqual(['housingCity', 'housingFrom']);
    await client.agent.patch(`/api/arrival/${c.id}`).send({ housingCity: 'Frankfurt', housingFrom: inHours(24 * 10).toISOString().slice(0, 10) }).expect(200);

    const sub = await client.agent.post(`/api/arrival/${c.id}/submit`).expect(200);
    expect(sub.body.plan).toMatchObject({ status: 'SUBMITTED', editable: true });
    expect(sub.body.plan.submittedAt).toBeTruthy();
    await client.agent.post(`/api/arrival/${c.id}/submit`).expect(409);
    // assigned staff (in German) is told, admins are not (somebody is responsible)
    const [n] = await notes(staff.user.id, 'ARRIVAL_SUBMITTED');
    expect(n.title).toContain('Neuer Ankunftsplan: Leyla Məmmədova');
    expect(n.body).toContain('J2 123');
    expect(n.link).toBe(`/admin/arrivals/${c.id}`);
    expect(await notes(admin.user.id, 'ARRIVAL_SUBMITTED')).toHaveLength(0);

    // a material edit of a submitted plan pings the responsible staff; a note-only edit does not
    await client.agent.patch(`/api/arrival/${c.id}`).send({ clientNote: 'Danke' }).expect(200);
    expect(await notes(staff.user.id, 'ARRIVAL_CLIENT_UPDATED')).toHaveLength(0);
    await client.agent.patch(`/api/arrival/${c.id}`).send({ arrivalTime: inHours(24 * 11).toISOString() }).expect(200);
    expect(await notes(staff.user.id, 'ARRIVAL_CLIENT_UPDATED')).toHaveLength(1);

    await client.agent.post(`/api/arrival/${c.id}/cancel`).expect(200);
    expect(await notes(staff.user.id, 'ARRIVAL_CLIENT_CANCELLED')).toHaveLength(1);
    await client.agent.post(`/api/arrival/${c.id}/cancel`).expect(409);
    await client.agent.patch(`/api/arrival/${c.id}`).send({ travellers: 3 }).expect(409);
    // reopen → DRAFT again
    expect((await client.agent.post(`/api/arrival/${c.id}/reopen`).expect(200)).body.plan.status).toBe('DRAFT');
    await client.agent.post(`/api/arrival/${c.id}/reopen`).expect(409);
  });

  it('without assigned staff the submission goes to every admin', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const staff = await asStaff();
    const c = await makeCase(client.user.id);
    await client.agent.get('/api/arrival').expect(200);
    await client.agent.patch(`/api/arrival/${c.id}`).send(fill).expect(200);
    await client.agent.post(`/api/arrival/${c.id}/submit`).expect(200);
    expect(await notes(admin.user.id, 'ARRIVAL_SUBMITTED')).toHaveLength(1);
    expect(await notes(staff.user.id, 'ARRIVAL_SUBMITTED')).toHaveLength(0);
  });

  it('serves the arrival as an ICS file', async () => {
    const client = await asClient({ locale: 'en' });
    const c = await makeCase(client.user.id);
    await client.agent.get('/api/arrival').expect(200);
    await client.agent.get(`/api/arrival/${c.id}/ics`).expect(400);
    await client.agent.patch(`/api/arrival/${c.id}`).send(fill).expect(200);
    const res = await client.agent.get(`/api/arrival/${c.id}/ics`).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/calendar/);
    expect(res.headers['content-disposition']).toContain(`arrival-${c.number}.ics`);
    const ics = res.text;
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Arrival in Germany · J2 123');
    expect(ics).toContain('LOCATION:FRA');
    const stamp = new Date(fill.arrivalTime).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    expect(ics).toContain(`DTSTART:${stamp}`);
  });
});

describe('arrival plans: admin side', () => {
  const submitted = async (opts: { staffId?: string | null; locale?: 'az' | 'de' | 'en' | 'ru'; hours?: number } = {}) => {
    const client = await asClient({ locale: opts.locale ?? 'az', firstName: 'Orxan' });
    const c = await makeCase(client.user.id, 'APPROVED', opts.staffId ?? null);
    await client.agent.get('/api/arrival').expect(200);
    await client.agent
      .patch(`/api/arrival/${c.id}`)
      .send({ ...fill, arrivalTime: inHours(opts.hours ?? 24 * 10).toISOString(), pickupRequested: true, housingRequested: true, housingCity: 'Köln', housingFrom: inHours(24 * 10).toISOString().slice(0, 10) })
      .expect(200);
    await client.agent.post(`/api/arrival/${c.id}/submit`).expect(200);
    return { client, c };
  };

  it('lists with filters and counts, and only staff may use it', async () => {
    const staff = await asStaff();
    const a = await submitted({ staffId: staff.user.id, hours: 48 });
    const b = await submitted({ hours: 24 * 30 });
    const draftClient = await asClient();
    await makeCase(draftClient.user.id);
    await draftClient.agent.get('/api/arrival').expect(200);
    await prisma.arrivalPlan.update({ where: { caseId: b.c.id }, data: { pickupRequested: false, housingStatus: 'NONE' } });

    await a.client.agent.get('/api/admin/arrivals').expect(403);

    const all = (await staff.agent.get('/api/admin/arrivals').expect(200)).body;
    expect(all.items.map((i: { caseId: string }) => i.caseId)).toEqual([a.c.id, b.c.id]); // open, soonest first
    expect(all.items[0]).toMatchObject({ upcoming: true, client: { firstName: 'Orxan' }, case: { number: a.c.number } });
    expect(all.items[0]).toHaveProperty('staffNote');
    expect(all.counts).toEqual({ submitted: 2, confirmed: 0, upcoming: 1, pickupOpen: 1, housingOpen: 1 });
    expect((await staff.agent.get('/api/admin/arrivals?status=all').expect(200)).body.total).toBe(3);
    expect((await staff.agent.get('/api/admin/arrivals?status=DRAFT').expect(200)).body.total).toBe(1);
    expect((await staff.agent.get('/api/admin/arrivals?upcoming=1').expect(200)).body.items).toHaveLength(1);
    expect((await staff.agent.get('/api/admin/arrivals?pickup=1').expect(200)).body.items[0].caseId).toBe(a.c.id);
    expect((await staff.agent.get('/api/admin/arrivals?housing=1').expect(200)).body.total).toBe(1);
    expect((await staff.agent.get('/api/admin/arrivals?mine=1').expect(200)).body.total).toBe(1);
    expect((await staff.agent.get(`/api/admin/arrivals?search=${a.c.number}`).expect(200)).body.total).toBe(1);
    await staff.agent.get('/api/admin/arrivals?status=NOPE').expect(400);
    expect((await staff.agent.get(`/api/admin/arrivals/${a.c.id}`).expect(200)).body.plan.caseId).toBe(a.c.id);
    await staff.agent.get('/api/admin/arrivals/nope').expect(404);
    expect((await staff.agent.get('/api/admin/arrivals/staff').expect(200)).body.people.some((p: { id: string }) => p.id === staff.user.id)).toBe(true);
  });

  it('staff updates notify the client in their language and are audited', async () => {
    const staff = await asStaff();
    const handler = await asStaff();
    const { client, c } = await submitted({ staffId: staff.user.id, locale: 'ru' });

    // invalid things
    await staff.agent.patch(`/api/admin/arrivals/${c.id}`).send({ status: 'DRAFT' }).expect(400);
    await staff.agent.patch(`/api/admin/arrivals/${c.id}`).send({ handledById: client.user.id }).expect(400);

    // internal note only → no client notification
    await staff.agent.patch(`/api/admin/arrivals/${c.id}`).send({ staffNote: 'Ruft morgen an' }).expect(200);
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: { startsWith: 'ARRIVAL_' } } })).toBe(0);
    // the client never sees the internal note
    expect((await client.agent.get(`/api/arrival/${c.id}`).expect(200)).body.plan).not.toHaveProperty('staffNote');

    // pickup arranged but not yet confirmed → details are hidden from the client
    await staff.agent.patch(`/api/admin/arrivals/${c.id}`).send({ pickupDetails: 'Elvin, +49 151 000000, Terminal 1 exit B' }).expect(200);
    expect((await client.agent.get(`/api/arrival/${c.id}`).expect(200)).body.plan.pickupDetails).toBeNull();
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: { startsWith: 'ARRIVAL_' } } })).toBe(0);

    const res = await staff.agent
      .patch(`/api/admin/arrivals/${c.id}`)
      .send({ status: 'CONFIRMED', pickupConfirmed: true, housingStatus: 'OFFERED', housingDetails: 'WG-Zimmer, Ehrenfeld, 520 €', handledById: handler.user.id })
      .expect(200);
    expect(res.body.plan).toMatchObject({ status: 'CONFIRMED', pickupConfirmed: true, housingStatus: 'OFFERED', handledById: handler.user.id });
    const [confirmed] = await notes(client.user.id, 'ARRIVAL_CONFIRMED');
    expect(confirmed.title).toBe('Ваш план приезда подтверждён');
    expect(confirmed.body).toContain('Terminal 1 exit B');
    expect(confirmed.body).toContain('Ehrenfeld');
    expect(await notes(handler.user.id, 'ARRIVAL_ASSIGNED')).toHaveLength(1);
    const view = (await client.agent.get(`/api/arrival/${c.id}`).expect(200)).body.plan;
    expect(view).toMatchObject({ editable: false, pickupDetails: 'Elvin, +49 151 000000, Terminal 1 exit B', housingDetails: 'WG-Zimmer, Ehrenfeld, 520 €' });
    await client.agent.patch(`/api/arrival/${c.id}`).send({ travellers: 3 }).expect(409);

    // housing arranged → UPDATED notice
    await staff.agent.patch(`/api/admin/arrivals/${c.id}`).send({ housingStatus: 'ARRANGED' }).expect(200);
    expect(await notes(client.user.id, 'ARRIVAL_UPDATED')).toHaveLength(1);
    // same values again → nothing new
    await staff.agent.patch(`/api/admin/arrivals/${c.id}`).send({ housingStatus: 'ARRANGED' }).expect(200);
    expect(await notes(client.user.id, 'ARRIVAL_UPDATED')).toHaveLength(1);

    // completed → welcome text linking to the onboarding checklist
    await staff.agent.patch(`/api/admin/arrivals/${c.id}`).send({ status: 'COMPLETED' }).expect(200);
    const [done] = await notes(client.user.id, 'ARRIVAL_COMPLETED');
    expect(done.link).toBe('/account/onboarding');
    expect(done.title).toBe('Добро пожаловать в Германию!');
    // no way back from COMPLETED
    await staff.agent.patch(`/api/admin/arrivals/${c.id}`).send({ status: 'CONFIRMED' }).expect(409);
    await staff.agent.patch(`/api/admin/arrivals/${c.id}`).send({ status: 'CANCELLED' }).expect(409);
    await client.agent.post(`/api/arrival/${c.id}/cancel`).expect(409);
    expect(await prisma.auditLog.count({ where: { action: 'ARRIVAL_PLAN_UPDATED', target: res.body.plan.id } })).toBe(5); // the no-op patch is not audited
  });

  it('pickup cannot be confirmed when not requested; cancelling notifies the client with a reason', async () => {
    const staff = await asStaff();
    const { client, c } = await submitted({ locale: 'de' });
    await prisma.arrivalPlan.update({ where: { caseId: c.id }, data: { pickupRequested: false } });
    expect((await staff.agent.patch(`/api/admin/arrivals/${c.id}`).send({ pickupConfirmed: true }).expect(400)).body.error).toBe('PICKUP_NOT_REQUESTED');
    await staff.agent.patch(`/api/admin/arrivals/${c.id}`).send({ status: 'CANCELLED', note: 'Flug storniert' }).expect(200);
    const [n] = await notes(client.user.id, 'ARRIVAL_CANCELLED');
    expect(n.title).toBe('Ankunftsplan storniert');
    expect(n.body).toContain('Flug storniert');
  });
});

describe('arrival reminders and calendar', () => {
  const plan = async (hours: number, staffId: string | null) => {
    const client = await asClient();
    const c = await makeCase(client.user.id, 'APPROVED', staffId);
    await client.agent.get('/api/arrival').expect(200);
    await client.agent.patch(`/api/arrival/${c.id}`).send({ ...fill, arrivalTime: inHours(hours).toISOString() }).expect(200);
    await client.agent.post(`/api/arrival/${c.id}/submit`).expect(200);
    return { client, c };
  };

  it('reminds 48 h and 6 h before arrival once each (client and handler)', async () => {
    expect(registeredJobs().includes('arrival-reminders')).toBe(true);
    const staff = await asStaff();
    const soon = await plan(40, staff.user.id);
    const far = await plan(24 * 5, staff.user.id);
    const now = new Date();

    expect(await runArrivalReminders(now)).toBe(1);
    expect(await runArrivalReminders(now)).toBe(0); // dedupe
    expect(await notes(soon.client.user.id, 'ARRIVAL_REMINDER_48H')).toHaveLength(1);
    expect(await notes(staff.user.id, 'ARRIVAL_STAFF_REMINDER_48H')).toHaveLength(1);
    expect(await notes(far.client.user.id, 'ARRIVAL_REMINDER_48H')).toHaveLength(0);

    // 35 hours later: inside the last 6 hours → the 6 h reminder, once
    const later = new Date(now.getTime() + 35 * HOUR);
    expect(await runArrivalReminders(later)).toBe(1);
    expect(await runArrivalReminders(later)).toBe(0);
    expect(await notes(soon.client.user.id, 'ARRIVAL_REMINDER_6H')).toHaveLength(1);
    expect(await notes(staff.user.id, 'ARRIVAL_STAFF_REMINDER_6H')).toHaveLength(1);

    // cancelled plans are not reminded
    await soon.client.agent.post(`/api/arrival/${far.c.id}/cancel`).expect(404); // not theirs
    await far.client.agent.post(`/api/arrival/${far.c.id}/cancel`).expect(200);
    expect(await runArrivalReminders(new Date(now.getTime() + 24 * 4 * HOUR))).toBe(0);
  });

  it('a submitted plan untouched for 2 days reminds admins once a day', async () => {
    const admin = await asAdmin();
    const { c } = await plan(24 * 10, null);
    await prisma.notification.deleteMany();
    const now = new Date();
    expect(await runStaleArrivalReminders(now)).toBe(0);
    const in3d = new Date(now.getTime() + 3 * 24 * HOUR);
    in3d.setUTCHours(10, 0, 0, 0); // still ≥ 2 days after the submission
    expect(await runStaleArrivalReminders(in3d)).toBe(1);
    expect(await runStaleArrivalReminders(new Date(in3d.getTime() + 5 * HOUR))).toBe(0); // same day
    expect(await runStaleArrivalReminders(new Date(in3d.getTime() + 24 * HOUR))).toBe(1);
    expect(await notes(admin.user.id, 'ARRIVAL_STALE')).toHaveLength(2);
    // once confirmed, no more stale reminders
    await prisma.arrivalPlan.update({ where: { caseId: c.id }, data: { status: 'CONFIRMED' } });
    expect(await runStaleArrivalReminders(new Date(in3d.getTime() + 48 * HOUR))).toBe(0);
  });

  it('arrivals appear in the handler’s calendar feed', async () => {
    const staff = await asStaff({ locale: 'en' });
    const other = await asStaff();
    const { c } = await plan(24 * 3, staff.user.id);
    const events = await staffFeedEvents({ ...staff.user, locale: 'en' });
    const ev = events.find((e) => e.url?.endsWith(`/admin/arrivals/${c.id}`));
    expect(ev?.summary).toBe('Arrival: Test User J2 123');
    expect(ev?.uid).toMatch(/^case-appointment-arrival-/);
    expect((await staffFeedEvents(other.user)).some((e) => e.url?.includes('/admin/arrivals/'))).toBe(false);
  });
});
