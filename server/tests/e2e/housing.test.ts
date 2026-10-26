import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma } from '../helpers/db';
import { makePdf, PDF } from '../helpers/files';
import { anmeldungDeadline, berlinParts, berlinWallToUtc, dayToDate, deadlineInfo, dueReminder, listingMatchesCase, reminderPlan } from '../../src/lib/housing/core.js';
import { runAnmeldungAppointmentReminders, runAnmeldungDeadlineWarnings } from '../../src/jobs/housing.js';
import { registeredJobs } from '../../src/lib/scheduler.js';

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

const makeCase = (clientId: string, opts: { status?: CaseStatus; staff?: string | null; companyId?: string | null } = {}) =>
  prisma.case.create({
    data: { clientId, number: `TV-H-${crypto.randomBytes(3).toString('hex')}`, profession: 'Lagerist', status: opts.status ?? 'APPROVED', assignedStaffId: opts.staff ?? null, companyId: opts.companyId ?? null },
  });

const notes = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type } });
const berlinDayIn = (days: number) => berlinParts(new Date(Date.now() + days * DAY)).day;

describe('housing: pure rules', () => {
  it('converts German wall time (DST aware) and computes the two-week deadline', () => {
    expect(berlinWallToUtc('2026-11-02', '09:30').toISOString()).toBe('2026-11-02T08:30:00.000Z'); // CET
    expect(berlinWallToUtc('2026-07-01', '09:30').toISOString()).toBe('2026-07-01T07:30:00.000Z'); // CEST
    expect(berlinParts(new Date('2026-11-02T08:30:00Z'))).toMatchObject({ day: '2026-11-02', time: '09:30' });

    expect(anmeldungDeadline(dayToDate('2026-11-01'))!.toISOString().slice(0, 10)).toBe('2026-11-15');
    const now = new Date('2026-11-12T10:00:00Z');
    expect(deadlineInfo({ moveInDate: dayToDate('2026-11-01'), anmeldungDoneAt: null }, now)).toEqual({ deadline: '2026-11-15', daysLeft: 3, state: 'soon' });
    expect(deadlineInfo({ moveInDate: dayToDate('2026-11-10'), anmeldungDoneAt: null }, now)).toMatchObject({ daysLeft: 12, state: 'ok' });
    expect(deadlineInfo({ moveInDate: dayToDate('2026-10-20'), anmeldungDoneAt: null }, now)).toMatchObject({ daysLeft: -9, state: 'overdue' });
    expect(deadlineInfo({ moveInDate: dayToDate('2026-10-20'), anmeldungDoneAt: now }, now).state).toBe('done');
    expect(deadlineInfo({ moveInDate: null, anmeldungDoneAt: null }, now)).toEqual({ deadline: null, daysLeft: null, state: 'none' });
  });

  it('plans the 3-day, 1-day and same-morning reminders and skips those already past when saved', () => {
    const appt = berlinWallToUtc('2026-11-20', '10:00');
    const plan = reminderPlan(appt, new Date('2026-11-01T00:00:00Z'));
    expect(plan.map((r) => [r.kind, r.at.toISOString(), r.skipped])).toEqual([
      ['3d', '2026-11-17T09:00:00.000Z', false],
      ['1d', '2026-11-19T09:00:00.000Z', false],
      ['morning', '2026-11-20T06:00:00.000Z', false], // 07:00 German time
    ]);
    // Saved 2 days ahead: no 3-day reminder.
    expect(reminderPlan(appt, new Date('2026-11-18T09:00:00Z')).map((r) => r.skipped)).toEqual([true, false, false]);
    // Very early appointment: the "morning" one goes 2 hours before.
    expect(reminderPlan(berlinWallToUtc('2026-11-20', '06:30'), new Date('2026-11-01T00:00:00Z'))[2].at.toISOString()).toBe('2026-11-20T03:30:00.000Z');
    expect(dueReminder(appt, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-19T12:00:00Z'))).toBe('1d');
    expect(dueReminder(appt, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-16T12:00:00Z'))).toBeNull();
    expect(dueReminder(appt, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-20T10:00:00Z'))).toBeNull(); // over
  });

  it('listing visibility: employer listings only for that employer, others by city', () => {
    const ctx = { city: 'Frankfurt am Main', companyId: 'co1' };
    expect(listingMatchesCase({ active: true, city: 'frankfurt', companyId: null }, ctx)).toBe(true);
    expect(listingMatchesCase({ active: true, city: 'Offenbach', companyId: null }, ctx)).toBe(false);
    expect(listingMatchesCase({ active: false, city: 'Frankfurt', companyId: null }, ctx)).toBe(false);
    expect(listingMatchesCase({ active: true, city: 'Hamburg', companyId: 'co1' }, ctx)).toBe(true);
    expect(listingMatchesCase({ active: true, city: 'Frankfurt', companyId: 'co2' }, ctx)).toBe(false);
    expect(listingMatchesCase({ active: true, city: 'Nürnberg', companyId: null }, { city: 'Nuernberg', companyId: null })).toBe(true);
  });

  it('registers the reminder job', () => {
    expect(registeredJobs()).toContain('housing-anmeldung');
  });
});

describe('housing: client checklist and roles', () => {
  it('creates the record lazily for an approved case, ticks steps, keeps clients apart and shows staff the progress', async () => {
    const client = await asClient();
    const other = await asClient();
    const staff = await asStaff();
    await prisma.onboardingItem.create({ data: { slug: 'mietvertrag', title: { az: 'M', de: 'M', en: 'M', ru: 'M' }, body: {} } });

    // No approved case yet → empty page, writes refused.
    await makeCase(client.user.id, { status: 'DECISION_PENDING' });
    expect((await client.agent.get('/api/housing').expect(200)).body.case).toBeNull();
    await client.agent.patch('/api/housing').send({ steps: { budget: true } }).expect(409);

    const c = await makeCase(client.user.id);
    const first = (await client.agent.get('/api/housing').expect(200)).body;
    expect(first.case.id).toBe(c.id);
    expect(first.housing.progress).toEqual({ done: 0, total: 8 });
    expect(first.housing.steps.map((s: { key: string }) => s.key)).toEqual(['budget', 'documents', 'search', 'viewings', 'scams', 'contract', 'deposit', 'handover']);

    const res = await client.agent.patch('/api/housing').send({ steps: { budget: true, scams: true, handover: true }, budgetMax: 750, city: 'Bremen' }).expect(200);
    expect(res.body.housing.progress.done).toBe(3);
    expect(res.body.housing).toMatchObject({ budgetMax: 750, effectiveCity: 'Bremen' });
    // handover ticks the existing onboarding item "Wohnung und Mietvertrag"
    expect(await prisma.caseOnboarding.count({ where: { caseId: c.id, doneAt: { not: null } } })).toBe(1);
    await client.agent.patch('/api/housing').send({ steps: { scams: false } }).expect(200);
    await client.agent.patch('/api/housing').send({ steps: { bogus: true } }).expect(400);
    await client.agent.patch('/api/housing').send({ status: 'DONE' }).expect(400); // strict

    // Another client cannot address this case; staff cannot use the client API; clients not the admin one.
    await other.agent.get(`/api/housing?caseId=${c.id}`).expect(404);
    await other.agent.patch('/api/housing').send({ caseId: c.id, steps: { budget: true } }).expect(409);
    await staff.agent.get('/api/housing').expect(403);
    await client.agent.get(`/api/admin/housing/cases/${c.id}`).expect(403);

    const s = (await staff.agent.get(`/api/admin/housing/cases/${c.id}`).expect(200)).body;
    expect(s.housing.progress).toEqual({ done: 2, total: 8 });
    expect(s.housing.steps.find((x: { key: string }) => x.key === 'budget').doneAt).toBeTruthy();
    expect(await prisma.auditLog.count({ where: { action: 'HOUSING_UPDATED' } })).toBe(2);
  });

  it('contract upload with a review request → staff, staff reply → client, staff can open the file', async () => {
    const staff = await asStaff({ locale: 'de' });
    const client = await asClient({ firstName: 'Aysel', lastName: 'Quliyeva', locale: 'en' });
    const c = await makeCase(client.user.id, { staff: staff.user.id });
    const up = await client.agent
      .post('/api/housing/contract')
      .field('requestReview', 'true')
      .field('question', 'Is the Kaution ok?')
      .attach('file', await makePdf('Mietvertrag'), { filename: 'mietvertrag.pdf', ...PDF })
      .expect(201);
    expect(up.body.housing.contract).toMatchObject({ review: 'REQUESTED', question: 'Is the Kaution ok?' });
    expect(up.body.housing.contract.file.filename).toBe('mietvertrag.pdf');
    // the file is in the client's vault
    expect(await prisma.vaultDocument.count({ where: { userId: client.user.id, kind: 'OTHER' } })).toBe(1);
    const [n] = await notes(staff.user.id, 'HOUSING_STAFF_CONTRACT_REVIEW');
    expect(n.title).toContain('Mietvertrag ansehen');
    expect(n.body).toContain('Kaution');
    await client.agent.post('/api/housing/contract/review').send({}).expect(409); // already requested

    const file = await staff.agent.get(`/api/admin/housing/cases/${c.id}/files/contract`).expect(200);
    expect(file.headers['content-type']).toContain('application/pdf');
    await staff.agent.get(`/api/admin/housing/cases/${c.id}/files/melde`).expect(404);

    await staff.agent.post(`/api/admin/housing/cases/${c.id}/contract-review`).send({ reply: 'Looks fine; deposit is 2 net cold rents.' }).expect(200);
    const [r] = await notes(client.user.id, 'HOUSING_CONTRACT_REVIEWED');
    expect(r.body).toContain('not legal advice');
    expect((await client.agent.get('/api/housing').expect(200)).body.housing.contract).toMatchObject({ review: 'REVIEWED', reply: 'Looks fine; deposit is 2 net cold rents.' });
  });
});

describe('housing: Anmeldung', () => {
  it('appointment → staff told, reminders 3 days / 1 day / same morning once each', async () => {
    const staff = await asStaff();
    const client = await asClient();
    await makeCase(client.user.id, { staff: staff.user.id });
    const day = berlinDayIn(20);
    await client.agent.patch('/api/housing').send({ appointment: { date: berlinDayIn(-1), time: '10:00', address: 'Bürgeramt Mitte' } }).expect(400);
    await client.agent.patch('/api/housing').send({ appointment: { date: berlinDayIn(400), time: '10:00', address: 'Bürgeramt Mitte' } }).expect(400);
    await client.agent.patch('/api/housing').send({ appointment: { date: day, time: '25:00', address: 'X Y' } }).expect(400);
    const res = await client.agent.patch('/api/housing').send({ appointment: { date: day, time: '10:00', address: 'Bürgeramt Mitte, Karl-Marx-Allee 31' }, bring: { passport: true } }).expect(200);
    const a = res.body.housing.anmeldung;
    expect(a.status).toBe('APPOINTMENT_SET');
    expect(a.appointment).toMatchObject({ day, time: '10:00', address: 'Bürgeramt Mitte, Karl-Marx-Allee 31' });
    expect(a.appointment.reminders.map((r: { kind: string; skipped: boolean }) => [r.kind, r.skipped])).toEqual([['3d', false], ['1d', false], ['morning', false]]);
    expect(a.bring.find((b: { key: string }) => b.key === 'passport').doneAt).toBeTruthy();
    expect(await notes(staff.user.id, 'HOUSING_STAFF_APPT_SET')).toHaveLength(1);

    const at = berlinWallToUtc(day, '10:00');
    expect(await runAnmeldungAppointmentReminders(new Date(at.getTime() - 4 * DAY))).toBe(0);
    expect(await runAnmeldungAppointmentReminders(new Date(at.getTime() - 3 * DAY + 5 * MIN))).toBe(1);
    expect(await runAnmeldungAppointmentReminders(new Date(at.getTime() - 3 * DAY + 15 * MIN))).toBe(0); // claimed once
    expect(await runAnmeldungAppointmentReminders(new Date(at.getTime() - DAY + 5 * MIN))).toBe(1);
    const morning = berlinWallToUtc(day, '07:05');
    expect(await runAnmeldungAppointmentReminders(new Date(morning.getTime() - 20 * MIN))).toBe(0);
    expect(await runAnmeldungAppointmentReminders(morning)).toBe(1);
    expect(await runAnmeldungAppointmentReminders(new Date(at.getTime() + MIN))).toBe(0);
    for (const kind of ['APPT_3D', 'APPT_1D', 'APPT_MORNING']) expect(await notes(client.user.id, `HOUSING_${kind}`), kind).toHaveLength(1);

    // Moving the appointment re-arms the reminders.
    const day2 = berlinDayIn(25);
    await client.agent.patch('/api/housing').send({ appointment: { date: day2, time: '08:30', address: 'Bürgeramt Mitte, Karl-Marx-Allee 31' } }).expect(200);
    expect(await runAnmeldungAppointmentReminders(new Date(berlinWallToUtc(day2, '08:30').getTime() - DAY + MIN))).toBe(1);
  });

  it('staff record the appointment and move-in date; the client gets the confirmation', async () => {
    const staff = await asStaff();
    const client = await asClient({ locale: 'az' });
    const c = await makeCase(client.user.id, { staff: staff.user.id });
    const res = await staff.agent.patch(`/api/admin/housing/cases/${c.id}`).send({ moveInDate: berlinDayIn(-2), appointment: { date: berlinDayIn(5), time: '09:15', address: 'Bürgerbüro Nord' } }).expect(200);
    expect(res.body.housing.anmeldung).toMatchObject({ moveInDate: berlinDayIn(-2), daysLeft: 12, state: 'ok' });
    const [n] = await notes(client.user.id, 'HOUSING_APPT_SET');
    expect(n.body).toContain('Bürgerbüro Nord');
    expect(n.body).toContain('Almaniya vaxtı');
    await staff.agent.patch(`/api/admin/housing/cases/${c.id}`).send({ moveInDate: berlinDayIn(-400) }).expect(400);
    const pending = await makeCase(client.user.id, { status: 'EMBASSY_REVIEW' });
    await staff.agent.patch(`/api/admin/housing/cases/${pending.id}`).send({ moveInDate: berlinDayIn(0) }).expect(409);
    expect((await staff.agent.get(`/api/admin/housing/cases/${pending.id}`).expect(200)).body.housing).toBeNull();
    const ics = await client.agent.get(`/api/housing/appointment.ics?caseId=${c.id}`).expect(200);
    expect(ics.text).toContain('Bürgerbüro Nord');
  });

  it('warns staff (and the client without an appointment) close to the deadline and once when it passed', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const client = await asClient();
    const c = await makeCase(client.user.id, { staff: staff.user.id });
    await client.agent.patch('/api/housing').send({ moveInDate: berlinDayIn(-5) }).expect(200);
    expect(await runAnmeldungDeadlineWarnings()).toBe(0); // 9 days left

    await client.agent.patch('/api/housing').send({ moveInDate: berlinDayIn(-12) }).expect(200); // 2 days left
    const view = (await staff.agent.get(`/api/admin/housing/cases/${c.id}`).expect(200)).body.housing.anmeldung;
    expect(view).toMatchObject({ daysLeft: 2, state: 'soon', status: 'NOT_STARTED' });
    expect(await runAnmeldungDeadlineWarnings()).toBe(1);
    expect(await runAnmeldungDeadlineWarnings()).toBe(0);
    expect(await notes(staff.user.id, 'HOUSING_STAFF_DEADLINE_SOON')).toHaveLength(1);
    expect(await notes(admin.user.id, 'HOUSING_STAFF_DEADLINE_SOON')).toHaveLength(0); // somebody is responsible
    expect(await notes(client.user.id, 'HOUSING_DEADLINE_SOON')).toHaveLength(1);

    expect(await runAnmeldungDeadlineWarnings(new Date(Date.now() + 4 * DAY))).toBe(1);
    expect(await runAnmeldungDeadlineWarnings(new Date(Date.now() + 5 * DAY))).toBe(0);
    expect(await notes(staff.user.id, 'HOUSING_STAFF_DEADLINE_OVERDUE')).toHaveLength(1);
    const list = (await staff.agent.get('/api/admin/housing/deadlines').expect(200)).body.items;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ caseId: c.id, state: 'soon' });
  });

  it('Meldebescheinigung upload marks it done, ticks onboarding and creates the follow-on tasks once', async () => {
    const staff = await asStaff();
    const client = await asClient({ locale: 'de' });
    const c = await makeCase(client.user.id, { staff: staff.user.id });
    await prisma.onboardingItem.create({ data: { slug: 'anmeldung', title: { az: 'A', de: 'A', en: 'A', ru: 'A' }, body: {}, dueDays: 14 } });
    await client.agent.patch('/api/housing').send({ moveInDate: berlinDayIn(-12) }).expect(200);
    await client.agent.post('/api/housing/meldebescheinigung').expect(400);
    const res = await client.agent.post('/api/housing/meldebescheinigung').attach('file', await makePdf('Meldebescheinigung'), { filename: 'melde.pdf', ...PDF }).expect(201);
    expect(res.body.housing.anmeldung).toMatchObject({ status: 'DONE', state: 'done', doneVia: 'UPLOAD' });
    expect(res.body.housing.anmeldung.certificate.filename).toBe('melde.pdf');
    expect(res.body.followUps.map((t: { template: string }) => t.template).sort()).toEqual(['BANK_ACCOUNT', 'HEALTH_CARD', 'STEUER_ID']);
    const tasks = await prisma.clientTask.findMany({ where: { caseId: c.id } });
    expect(tasks.find((t) => t.template === 'STEUER_ID')!.title).toBe('Steuer-ID abwarten und dem Arbeitgeber geben');
    expect(await prisma.caseOnboarding.count({ where: { caseId: c.id, doneAt: { not: null } } })).toBe(1);
    expect(await notes(staff.user.id, 'HOUSING_STAFF_MELDE_UPLOADED')).toHaveLength(1);
    expect(await notes(client.user.id, 'HOUSING_ANMELDUNG_DONE')).toHaveLength(1);
    // tasks appear in "my tasks"
    expect((await client.agent.get('/api/client-process/tasks').expect(200)).body.tasks).toHaveLength(3);

    // A second upload replaces the file but creates nothing twice; no deadline warning for a done Anmeldung.
    await client.agent.post('/api/housing/meldebescheinigung').attach('file', await makePdf('again'), { filename: 'melde2.pdf', ...PDF }).expect(201);
    expect(await prisma.clientTask.count({ where: { caseId: c.id } })).toBe(3);
    expect(await notes(client.user.id, 'HOUSING_ANMELDUNG_DONE')).toHaveLength(1);
    expect(await runAnmeldungDeadlineWarnings()).toBe(0);
    expect((await staff.agent.get(`/api/admin/housing/cases/${c.id}/files/melde`).expect(200)).headers['content-type']).toContain('pdf');
  });

  it('staff can mark the Anmeldung done without a file', async () => {
    const staff = await asStaff();
    const client = await asClient();
    const c = await makeCase(client.user.id);
    const res = await staff.agent.patch(`/api/admin/housing/cases/${c.id}`).send({ anmeldungDone: true }).expect(200);
    expect(res.body.housing.anmeldung).toMatchObject({ status: 'DONE', doneVia: 'STAFF' });
    expect(await prisma.clientTask.count({ where: { caseId: c.id } })).toBe(3);
    await staff.agent.patch(`/api/admin/housing/cases/${c.id}`).send({ anmeldungDone: 'yes' }).expect(400);
  });
});

describe('housing: partner landlords', () => {
  const listing = (over: Record<string, unknown> = {}) => ({
    name: 'Wohnheim Süd',
    city: 'Bremen',
    type: 'WORKER_HOUSING',
    priceMin: 350,
    priceMax: 450,
    description: 'Möblierte Zimmer, 10 min zum Lager',
    contactName: 'Frau Becker',
    contactPhone: '+49 421 000000',
    contactEmail: 'becker@example.com',
    address: 'Hafenstr. 1',
    notes: 'Provision vereinbart',
    ...over,
  });

  it('ADMIN+ manage listings, STAFF only read and propose', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    await staff.agent.post('/api/admin/housing/listings').send(listing()).expect(403);
    const created = (await admin.agent.post('/api/admin/housing/listings').send(listing()).expect(201)).body.listing;
    await admin.agent.post('/api/admin/housing/listings').send(listing({ priceMin: 500, priceMax: 400 })).expect(400);
    await admin.agent.post('/api/admin/housing/listings').send(listing({ photos: ['javascript:alert(1)'] })).expect(400);
    await staff.agent.patch(`/api/admin/housing/listings/${created.id}`).send({ active: false }).expect(403);
    await staff.agent.delete(`/api/admin/housing/listings/${created.id}`).expect(403);
    const list = (await staff.agent.get('/api/admin/housing/listings').expect(200)).body;
    expect(list.canEdit).toBe(false);
    expect(list.items[0]).toMatchObject({ contactPhone: '+49 421 000000', notes: 'Provision vereinbart' });
    await admin.agent.patch(`/api/admin/housing/listings/${created.id}`).send({ priceMax: 480 }).expect(200);
    expect(await prisma.auditLog.count({ where: { action: { in: ['HOUSING_LISTING_CREATED', 'HOUSING_LISTING_UPDATED'] } } })).toBe(2);
  });

  it('matching by city / employer, contact hidden until introduced, proposals and answers', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const client = await asClient();
    const company = await prisma.company.create({ data: { name: 'Logistik GmbH', city: 'Bremen' } });
    const otherCo = await prisma.company.create({ data: { name: 'Andere AG' } });
    const c = await makeCase(client.user.id, { staff: staff.user.id, companyId: company.id });
    const mk = async (over: Record<string, unknown>) => (await admin.agent.post('/api/admin/housing/listings').send(listing(over)).expect(201)).body.listing;
    const city = await mk({ name: 'Bremen WG' });
    const elsewhere = await mk({ name: 'Hamburg Flat', city: 'Hamburg' });
    const employer = await mk({ name: 'Firmenwohnung', city: 'Hamburg', companyId: company.id });
    const foreignEmployer = await mk({ name: 'Andere Firma', companyId: otherCo.id });
    const inactive = await mk({ name: 'Alt', active: false });

    // City comes from the employer until the client sets one.
    let page = (await client.agent.get('/api/housing').expect(200)).body;
    const names = (xs: { name: string }[]) => xs.map((x) => x.name).sort();
    expect(names(page.listings.matching)).toEqual(['Bremen WG', 'Firmenwohnung']);
    const raw = JSON.stringify(page);
    expect(raw).not.toContain('+49 421 000000');
    expect(raw).not.toContain('becker@example.com');
    expect(raw).not.toContain('Hafenstr');
    expect(raw).not.toContain('Provision');
    expect(page.listings.matching.find((l: { name: string }) => l.name === 'Firmenwohnung').employer).toBe('Logistik GmbH');
    void elsewhere;
    void foreignEmployer;
    void inactive;

    // Staff see suggestions on the case card and propose one from another city.
    const card = (await staff.agent.get(`/api/admin/housing/cases/${c.id}`).expect(200)).body;
    expect(card.suggestions.map((l: { name: string }) => l.name)).toEqual(['Firmenwohnung', 'Bremen WG']);
    await staff.agent.post(`/api/admin/housing/listings/${inactive.id}/propose`).send({ caseId: c.id }).expect(409);
    const prop = (await staff.agent.post(`/api/admin/housing/listings/${elsewhere.id}/propose`).send({ caseId: c.id, note: 'Close to the warehouse' }).expect(201)).body.proposal;
    await staff.agent.post(`/api/admin/housing/listings/${elsewhere.id}/propose`).send({ caseId: c.id }).expect(409);
    expect(await notes(client.user.id, 'HOUSING_PROPOSAL_NEW')).toHaveLength(1);

    page = (await client.agent.get('/api/housing').expect(200)).body;
    expect(page.listings.proposed).toHaveLength(1);
    expect(page.listings.proposed[0]).toMatchObject({ name: 'Hamburg Flat', contact: null, proposal: { staffNote: 'Close to the warehouse', response: 'PENDING' } });

    // Answers are audited and reach the case manager.
    await client.agent.post(`/api/housing/proposals/${prop.id}/respond`).send({ interested: true, note: 'Ab 1.12.' }).expect(200);
    expect(await notes(staff.user.id, 'HOUSING_STAFF_PROPOSAL_INTERESTED')).toHaveLength(1);
    const other = await asClient();
    await makeCase(other.user.id);
    await other.agent.post(`/api/housing/proposals/${prop.id}/respond`).send({ interested: false }).expect(404);

    // Interest in a matching listing without a proposal; not in an invisible one.
    await client.agent.post(`/api/housing/listings/${city.id}/interest`).send({ note: 'WG ok' }).expect(201);
    await client.agent.post(`/api/housing/listings/${foreignEmployer.id}/interest`).send({}).expect(404);
    await client.agent.post(`/api/housing/listings/${inactive.id}/interest`).send({}).expect(404);
    expect(await notes(staff.user.id, 'HOUSING_STAFF_CLIENT_INTEREST')).toHaveLength(1);

    // Introduced → contact details shown to this client only.
    await staff.agent.patch(`/api/admin/housing/proposals/${prop.id}`).send({ introduced: true }).expect(200);
    expect(await notes(client.user.id, 'HOUSING_PROPOSAL_INTRODUCED')).toHaveLength(1);
    page = (await client.agent.get('/api/housing').expect(200)).body;
    const shown = page.listings.proposed.find((l: { name: string }) => l.name === 'Hamburg Flat');
    expect(shown.contact).toEqual({ name: 'Frau Becker', phone: '+49 421 000000', email: 'becker@example.com', address: 'Hafenstr. 1' });
    expect(JSON.stringify(page)).not.toContain('Provision');
    expect(page.listings.proposed.find((l: { name: string }) => l.name === 'Bremen WG').contact).toBeNull();
    expect(JSON.stringify((await other.agent.get('/api/housing').expect(200)).body)).not.toContain('+49 421 000000');

    // Withdrawn → gone from the portal.
    await staff.agent.patch(`/api/admin/housing/proposals/${prop.id}`).send({ withdrawn: true }).expect(200);
    page = (await client.agent.get('/api/housing').expect(200)).body;
    expect(page.listings.proposed.map((l: { name: string }) => l.name)).toEqual(['Bremen WG']);

    const actions = (await prisma.auditLog.findMany({ where: { action: { startsWith: 'HOUSING_' } }, select: { action: true } })).map((a) => a.action);
    for (const a of ['HOUSING_LISTING_PROPOSED', 'HOUSING_PROPOSAL_RESPONDED', 'HOUSING_LISTING_INTEREST', 'HOUSING_PROPOSAL_INTRODUCED', 'HOUSING_PROPOSAL_UPDATED']) expect(actions, a).toContain(a);
  });
});

describe('housing: DSGVO export, deletion and retention', () => {
  it('the personal-data export contains the housing record and proposals (contact only once introduced)', async () => {
    const staff = await asStaff();
    const admin = await asAdmin();
    const client = await asClient();
    const c = await makeCase(client.user.id, { staff: staff.user.id });
    await client.agent.patch('/api/housing').send({ city: 'Bremen', moveInDate: berlinDayIn(-3), steps: { budget: true }, bring: { passport: true }, appointment: { date: berlinDayIn(4), time: '11:00', address: 'Bürgeramt Mitte' } }).expect(200);
    await client.agent.post('/api/housing/contract').field('requestReview', 'true').field('question', 'Kaution ok?').attach('file', await makePdf('MV'), { filename: 'mv.pdf', ...PDF }).expect(201);
    const mk = async (name: string) => (await admin.agent.post('/api/admin/housing/listings').send({ name, city: 'Bremen', type: 'ROOM', contactPhone: `+49 ${name.length}11`, notes: 'intern' }).expect(201)).body.listing;
    const a = await mk('Haus A');
    const b = await mk('Haus BB');
    const pa = (await staff.agent.post(`/api/admin/housing/listings/${a.id}/propose`).send({ caseId: c.id }).expect(201)).body.proposal;
    await staff.agent.post(`/api/admin/housing/listings/${b.id}/propose`).send({ caseId: c.id }).expect(201);
    await client.agent.post(`/api/housing/proposals/${pa.id}/respond`).send({ interested: true, note: 'gern' }).expect(200);
    await staff.agent.patch(`/api/admin/housing/proposals/${pa.id}`).send({ introduced: true }).expect(200);

    const res = await client.agent.get('/api/privacy/export').expect(200);
    const data = typeof res.body === 'object' && Object.keys(res.body).length ? res.body : JSON.parse(res.text);
    const [rec] = data.housing.records;
    expect(rec).toMatchObject({ case: c.number, city: 'Bremen', moveInDate: berlinDayIn(-3), contractReview: { status: 'REQUESTED', question: 'Kaution ok?' }, rentalContract: { filename: 'mv.pdf' } });
    expect(rec.checklist.budget).toBeTruthy();
    expect(rec.anmeldungChecklist.passport).toBeTruthy();
    expect(rec.appointment.address).toBe('Bürgeramt Mitte');
    const byName = (n: string) => data.housing.partnerListings.find((p: { listing: { name: string } }) => p.listing.name === n);
    expect(byName('Haus A')).toMatchObject({ myAnswer: 'INTERESTED', myNote: 'gern', landlordContact: { phone: '+49 611' } });
    expect(byName('Haus BB').landlordContact).toBeNull();
    expect(JSON.stringify(data.housing)).not.toContain('intern');
    expect(JSON.stringify(data.housing)).not.toContain('+49 711');
  });

  it('account deletion removes the housing rows, proposals and the vault files; retention purges the record', async () => {
    const { deleteUserAccount } = await import('../../src/lib/userDeletion.js');
    const { runRetention } = await import('../../src/jobs/retention.js');
    const { vaultDir } = await import('../../src/lib/docCheck/index.js');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const sa = await asSuperAdmin();
    const admin = await asAdmin();
    const client = await asClient();
    const c = await makeCase(client.user.id);
    await client.agent.post('/api/housing/meldebescheinigung').attach('file', await makePdf('M'), { filename: 'm.pdf', ...PDF }).expect(201);
    const l = (await admin.agent.post('/api/admin/housing/listings').send({ name: 'Haus C', city: 'Bremen', type: 'ROOM' }).expect(201)).body.listing;
    await admin.agent.post(`/api/admin/housing/listings/${l.id}/propose`).send({ caseId: c.id }).expect(201);
    const key = (await prisma.vaultDocument.findFirstOrThrow({ where: { userId: client.user.id } })).storageKey;
    expect(fs.existsSync(path.join(vaultDir(), key))).toBe(true);

    await deleteUserAccount(sa.user.id, client.user.id);
    expect(await prisma.caseHousing.count({ where: { caseId: c.id } })).toBe(0);
    expect(await prisma.housingProposal.count({ where: { caseId: c.id } })).toBe(0);
    expect(await prisma.vaultDocument.count({ where: { userId: client.user.id } })).toBe(0);
    await new Promise((r) => setTimeout(r, 200)); // files are removed after the commit
    expect(fs.existsSync(path.join(vaultDir(), key))).toBe(false);
    expect(await prisma.partnerHousing.count({ where: { id: l.id } })).toBe(1); // the listing itself stays

    // Retention: a case closed longer than the period loses its housing record and proposals.
    const other = await asClient();
    const old = await prisma.case.create({ data: { clientId: other.user.id, number: 'TV-H-OLD', profession: 'x', status: 'APPROVED', closedAt: new Date('2015-01-01T00:00:00Z') } });
    await prisma.caseHousing.create({ data: { caseId: old.id, contractQuestion: 'old question' } });
    await prisma.housingProposal.create({ data: { caseId: old.id, listingId: l.id } });
    await runRetention();
    expect(await prisma.caseHousing.count({ where: { caseId: old.id } })).toBe(0);
    expect(await prisma.housingProposal.count({ where: { caseId: old.id } })).toBe(0);
  });
});
