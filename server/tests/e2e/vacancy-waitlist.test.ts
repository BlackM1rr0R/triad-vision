import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { emailsTo, prisma, waitFor } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { cleanJobs, createVacancy } from './vacancies.fixtures';
import { alertToken } from '../../src/lib/jobAlerts/service.js';
import { runWaitlistNotices } from '../../src/lib/jobAlerts/waitlist.js';

/**
 * Vacancy waitlist ("Uyğun vakansiya açılanda xəbər ver", lib/jobAlerts/waitlist.ts): visitors with double opt-in
 * (and a lead), signed-in clients on their account, one notice per vacancy per person (in-app + e-mail), staff demand
 * counts and a masked export.
 */

const noticeFor = (recipient: string, vacancyId: string) => waitFor(() => prisma.jobAlertNotice.findFirst({ where: { recipient, vacancyId } }));

describe('vacancy waitlist', () => {
  beforeEach(cleanJobs);

  it('visitors: consent required, double opt-in, a lead; told once per vacancy with a free place in the wanted city', async () => {
    const body = { profession: 'truck_driver', city: 'Hamburg', germanLevel: 'B1', lng: 'de', email: 'Wait@Test.local', name: 'Rauf' };
    expect((await anon().post('/api/job-alerts/waitlist').send(body)).body.error).toBe('CONSENT_REQUIRED');
    expect((await anon().post('/api/job-alerts/waitlist').send({ ...body, email: undefined, consent: true })).body.error).toBe('EMAIL_REQUIRED');
    const res = expectStatus(await anon().post('/api/job-alerts/waitlist').send({ ...body, consent: true }), 201);
    expect(res.body).toMatchObject({ ok: true, confirmed: false });

    const entry = await prisma.jobAlert.findFirstOrThrow({ where: { email: 'wait@test.local', waitlist: true } });
    expect(entry).toMatchObject({ city: 'Hamburg', germanLevel: 'B1', confirmedAt: null, professions: ['truck_driver'] });
    expect((await emailsTo('wait@test.local'))[0].subject).toBe('Bitte bestätigen Sie Ihre Warteliste');
    // The sign-up is a lead like the other forms.
    const lead = await prisma.inquiry.findUniqueOrThrow({ where: { id: entry.inquiryId! } });
    expect(lead).toMatchObject({ source: 'waitlist:truck_driver', email: 'wait@test.local', contactName: 'Rauf', locale: 'de' });

    // Unconfirmed: nothing is sent.
    const hamburg = await createVacancy({ slug: 'wait-hh', germanLevel: 'A2' });
    await runWaitlistNotices();
    expect(await prisma.jobAlertNotice.count()).toBe(0);

    expectStatus(await anon().post('/api/job-alerts/confirm').send({ token: alertToken(entry.id) }), 200);
    await runWaitlistNotices();
    await noticeFor('wait@test.local', hamburg.id);
    const mail = await waitFor(() => prisma.emailLog.findFirst({ where: { to: 'wait@test.local', subject: { startsWith: 'Passende Stelle frei' } } }));
    expect(mail.subject).toBe('Passende Stelle frei: LKW-Fahrer de');

    // Another city, a higher German level and a full vacancy are not announced.
    const munich = await createVacancy({ slug: 'wait-muc', city: 'München' });
    const c1 = await createVacancy({ slug: 'wait-c1', germanLevel: 'C1' });
    const full = await createVacancy({ slug: 'wait-full', positions: 1, filledAdjustment: 1 });
    await runWaitlistNotices();
    await runWaitlistNotices();
    expect(await prisma.jobAlertNotice.count({ where: { vacancyId: { in: [munich.id, c1.id, full.id] } } })).toBe(0);
    // Once per vacancy per person, however often it runs.
    expect(await prisma.jobAlertNotice.count({ where: { recipient: 'wait@test.local', vacancyId: hamburg.id } })).toBe(1);

    // The full vacancy gets a free place again (staff correction): announced now.
    const admin = await asAdmin();
    expectStatus(await admin.agent.patch(`/api/admin/vacancies/${full.id}`).send({ filledAdjustment: 0 }), 200);
    await noticeFor('wait@test.local', full.id);

    // Unsubscribe stops everything.
    expectStatus(await anon().post('/api/job-alerts/unsubscribe').send({ token: alertToken(entry.id) }), 200);
    const later = await createVacancy({ slug: 'wait-later' });
    await runWaitlistNotices();
    expect(await prisma.jobAlertNotice.count({ where: { vacancyId: later.id } })).toBe(0);
  });

  it('signed-in clients: entry on the account, in-app notification + e-mail, a Bundesland matches its cities', async () => {
    const client = await asClient();
    const first = expectStatus(await client.agent.post('/api/job-alerts/waitlist').send({ profession: 'cook', city: 'Bayern', lng: 'en' }), 201);
    expect(first.body).toMatchObject({ confirmed: true, already: false, entry: { profession: 'cook', city: 'Bayern' } });
    expect(expectStatus(await client.agent.post('/api/job-alerts/waitlist').send({ profession: 'cook', city: 'bayern' }), 201).body.already).toBe(true);
    expect(expectStatus(await client.agent.get('/api/job-alerts/waitlist/mine'), 200).body.items).toHaveLength(1);
    // Not mixed into the job alerts list.
    expect(expectStatus(await client.agent.get('/api/job-alerts/mine'), 200).body.items).toHaveLength(0);

    const koch = await createVacancy({ slug: 'koch-nbg', title: { az: 'Aşpaz', de: 'Koch', en: 'Cook', ru: 'Повар' }, profession: 'Koch', city: 'Nürnberg', germanLevel: 'A1' });
    await createVacancy({ slug: 'koch-hh', title: { az: 'Aşpaz', de: 'Koch', en: 'Cook', ru: 'Повар' }, profession: 'Koch', city: 'Hamburg' });
    await runWaitlistNotices();
    await noticeFor(client.user.id, koch.id);
    expect(await prisma.jobAlertNotice.count({ where: { recipient: client.user.id } })).toBe(1);
    const n = await waitFor(() => prisma.notification.findFirst({ where: { userId: client.user.id, type: 'VACANCY_WAITLIST' } }));
    expect(n.link).toBe('/jobs/koch-nbg');
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: client.user.email, subject: { startsWith: 'A matching vacancy opened' } } }));

    // Other clients cannot remove it; the owner can.
    const other = await asClient();
    expect((await other.agent.delete(`/api/job-alerts/waitlist/mine/${first.body.entry.id}`)).status).toBe(404);
    expectStatus(await client.agent.delete(`/api/job-alerts/waitlist/mine/${first.body.entry.id}`), 200);
    expect(await prisma.jobAlertNotice.count({ where: { recipient: client.user.id } })).toBe(0); // notices go with the entry
  });

  it('staff: demand per profession in admin Vacancies; the export masks contacts without the clients export permission', async () => {
    const client = await asClient();
    expectStatus(await client.agent.post('/api/job-alerts/waitlist').send({ profession: 'electrician', city: 'Köln' }), 201);
    expectStatus(await anon().post('/api/job-alerts/waitlist').send({ profession: 'electrician', email: 'visitor.e@test.local', consent: true }), 201);

    const staff = await asStaff();
    const stats = expectStatus(await staff.agent.get('/api/admin/vacancies/waitlist'), 200).body;
    expect(stats).toMatchObject({ active: 1, pending: 1, accounts: 1 });
    expect(stats.professions[0]).toMatchObject({ key: 'electrician', active: 1, pending: 1, accounts: 1, cities: [{ city: 'Köln', count: 1 }] });
    // The job alert stats stay apart.
    expect(expectStatus(await staff.agent.get('/api/admin/site-features/job-alert-stats'), 200).body.active).toBe(0);

    const plain = expectStatus(await staff.agent.get('/api/admin/vacancies/waitlist/export.csv'), 200);
    expect(plain.headers['content-type']).toContain('text/csv');
    expect(plain.text).toContain('visitor.e@test.local');
    expect(plain.text).toContain(client.user.email);

    // Without "clients › export" the contacts are masked; without "employers › export" there is no export at all.
    const sup = await asSuperAdmin();
    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({ overrides: [{ area: 'clients', action: 'export', effect: 'deny' }] }), 200);
    const masked = expectStatus(await staff.agent.get('/api/admin/vacancies/waitlist/export.csv'), 200);
    expect(masked.text).not.toContain('visitor.e@test.local');
    expect(masked.text).toContain('v******@test.local');
    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({ overrides: [{ area: 'employers', action: 'export', effect: 'deny' }] }), 200);
    expect((await staff.agent.get('/api/admin/vacancies/waitlist/export.csv')).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: 'VACANCY_WAITLIST_EXPORTED' } })).toBe(2);
  });
});
