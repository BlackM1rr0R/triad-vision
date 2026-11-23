import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff, asSuperAdmin } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { expectStatus } from '../helpers/workflow';
import { cleanJobs, createVacancy } from './vacancies.fixtures';
import { requestToken, runVacancyRequestNotices } from '../../src/lib/vacancyRequests/service.js';

/**
 * "Vakansiya sorğusu" (lib/vacancyRequests): guests and clients ask for a kind of job (WORK / AUSBILDUNG), staff handle
 * the requests in admin › Vacancies and offer vacancies, matching new / reactivated vacancies are announced once.
 * No case is ever created by the request itself.
 */

const koch = { az: 'Aşpaz', de: 'Koch', en: 'Cook', ru: 'Повар' };

describe('vacancy requests', () => {
  beforeEach(cleanJobs);

  it('guests: name + contact + consent required, honeypot ignored, a lead and a staff notification, no case', async () => {
    await asAdmin(); // staff notices go to ADMIN+ (notifyStaff)
    const body = { type: 'WORK', sector: 'logistics', profession: 'truck_driver', city: 'Hamburg', germanLevel: 'A2', lng: 'az' };
    expect((await anon().post('/api/vacancy-requests').send({ ...body, name: 'Rauf', phone: '+994501234567' })).body.error).toBe('CONSENT_REQUIRED');
    expect((await anon().post('/api/vacancy-requests').send({ ...body, consent: true, phone: '+994501234567' })).body.error).toBe('NAME_REQUIRED');
    expect((await anon().post('/api/vacancy-requests').send({ ...body, consent: true, name: 'Rauf' })).body.error).toBe('CONTACT_REQUIRED');
    expect((await anon().post('/api/vacancy-requests').send({ type: 'WORK', consent: true, name: 'Rauf', email: 'r@test.local' })).body.error).toBe('PROFESSION_REQUIRED');
    expect((await anon().post('/api/vacancy-requests').send({ ...body, type: 'NONSENSE', consent: true, name: 'Rauf', email: 'r@test.local' })).status).toBe(400);
    // Honeypot: pretends success, stores nothing.
    expectStatus(await anon().post('/api/vacancy-requests').send({ ...body, consent: true, name: 'Bot', email: 'b@test.local', website: 'http://spam' }), 201);
    expect(await prisma.vacancyRequest.count()).toBe(0);

    const ok = expectStatus(await anon().post('/api/vacancy-requests').send({ ...body, consent: true, name: 'Rauf', email: 'Rauf@Test.local', phone: '+994501234567' }), 201);
    expect(ok.body.already).toBe(false);
    const r = await prisma.vacancyRequest.findFirstOrThrow();
    expect(r).toMatchObject({ type: 'WORK', sector: 'logistics', profession: 'truck_driver', city: 'Hamburg', status: 'NEW', userId: null, email: 'rauf@test.local' });
    const lead = await prisma.inquiry.findUniqueOrThrow({ where: { id: r.inquiryId! } });
    expect(lead).toMatchObject({ source: 'vacancy-request', email: 'rauf@test.local', contactName: 'Rauf' });
    await waitFor(() => prisma.notification.findFirst({ where: { type: 'STAFF', title: { startsWith: 'Vakansiya sorğusu' } } }));
    expect(await prisma.consentRecord.count({ where: { type: 'VACANCY_REQUEST', email: 'rauf@test.local', granted: true } })).toBe(1);
    // The same request again is not duplicated.
    expect(expectStatus(await anon().post('/api/vacancy-requests').send({ ...body, consent: true, name: 'Rauf', email: 'rauf@test.local' }), 201).body.already).toBe(true);
    expect(await prisma.vacancyRequest.count()).toBe(1);
    expect(await prisma.case.count()).toBe(0);

    // Guest withdraws with the e-mail link token.
    expect((await anon().post('/api/vacancy-requests/cancel').send({ token: 'bad.token' })).status).toBe(404);
    expect(expectStatus(await anon().get('/api/vacancy-requests/by-token').query({ token: requestToken(r.id) }), 200).body).toMatchObject({ type: 'WORK', cancelled: false });
    expectStatus(await anon().post('/api/vacancy-requests/cancel').send({ token: requestToken(r.id) }), 200);
    expect(await prisma.vacancyRequest.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: 'CLOSED' });
    expect(await prisma.consentRecord.count({ where: { type: 'VACANCY_REQUEST', granted: false } })).toBe(1);
  });

  it('clients: one click from a deactivated vacancy, own list, ownership on cancel, no case', async () => {
    const dead = await createVacancy({ slug: 'dead-ausb', employmentType: 'AUSBILDUNG', sector: 'healthcare', profession: 'Pflegefachmann', status: 'CLOSED', publishedAt: new Date() });
    const client = await asClient();
    const res = expectStatus(await client.agent.post('/api/vacancy-requests').send({ type: 'AUSBILDUNG', sourceVacancySlug: dead.slug, lng: 'de' }), 201);
    expect(res.body.already).toBe(false);
    const r = await prisma.vacancyRequest.findFirstOrThrow({ where: { userId: client.user.id } });
    expect(r).toMatchObject({ type: 'AUSBILDUNG', sector: 'healthcare', sourceVacancyId: dead.id, email: null });
    expect(expectStatus(await client.agent.post('/api/vacancy-requests').send({ type: 'AUSBILDUNG', sourceVacancySlug: dead.slug }), 201).body.already).toBe(true);

    const mine = expectStatus(await client.agent.get('/api/vacancy-requests/mine'), 200).body.items;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: r.id, status: 'NEW', type: 'AUSBILDUNG' });
    expect(mine[0]).not.toHaveProperty('staffNote');
    expect(await prisma.case.count({ where: { clientId: client.user.id } })).toBe(0);

    const other = await asClient();
    expect((await other.agent.post(`/api/vacancy-requests/mine/${r.id}/cancel`)).status).toBe(404);
    expect(expectStatus(await other.agent.get('/api/vacancy-requests/mine'), 200).body.items).toHaveLength(0);
    expectStatus(await client.agent.post(`/api/vacancy-requests/mine/${r.id}/cancel`), 200);
    expect(expectStatus(await client.agent.get('/api/vacancy-requests/mine'), 200).body.items[0]).toMatchObject({ status: 'CLOSED', cancelled: true });
    expect((await anon().get('/api/vacancy-requests/mine')).status).toBe(401);
  });

  it('admin: list with filters and masked contacts, status / note / assignee, offer a vacancy (no case), duplicate offer refused', async () => {
    const client = await asClient();
    expectStatus(await client.agent.post('/api/vacancy-requests').send({ type: 'WORK', profession: 'cook', city: 'Köln', lng: 'en' }), 201);
    expectStatus(await anon().post('/api/vacancy-requests').send({ type: 'AUSBILDUNG', sector: 'hospitality', consent: true, name: 'Leyla', email: 'leyla@test.local' }), 201);

    const staff = await asStaff();
    const all = expectStatus(await staff.agent.get('/api/admin/vacancies/requests'), 200).body;
    expect(all).toMatchObject({ total: 2, counts: { NEW: 2, OFFERED: 0 } });
    const onlyAusb = expectStatus(await staff.agent.get('/api/admin/vacancies/requests').query({ type: 'AUSBILDUNG' }), 200).body;
    expect(onlyAusb.items).toHaveLength(1);
    expect(onlyAusb.items[0]).toMatchObject({ isAccount: false, sector: 'hospitality' });
    expect(expectStatus(await staff.agent.get('/api/admin/vacancies/requests').query({ sector: 'logistics' }), 200).body.items).toHaveLength(0);

    // Contacts: plain by default, masked without the clients view permission.
    expect(onlyAusb.items[0].email).toBe('leyla@test.local');
    const sup = await asSuperAdmin();
    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({ overrides: [{ area: 'clients', action: 'view', effect: 'deny' }] }), 200);
    const masked = expectStatus(await staff.agent.get('/api/admin/vacancies/requests').query({ type: 'AUSBILDUNG' }), 200).body.items[0];
    expect(masked.email).not.toContain('leyla@');
    expect(masked.contactMasked).toBe(true);
    expectStatus(await sup.agent.put(`/api/admin/access/staff/users/${staff.user.id}`).send({ overrides: [] }), 200);

    const admin = await asAdmin();
    const row = all.items.find((i: { isAccount: boolean }) => i.isAccount);
    const patched = expectStatus(await admin.agent.patch(`/api/admin/vacancies/requests/${row.id}`).send({ status: 'IN_PROGRESS', staffNote: 'ruft zurück', assignedStaffId: staff.user.id }), 200).body.item;
    expect(patched).toMatchObject({ status: 'IN_PROGRESS', staffNote: 'ruft zurück', assignedStaffId: staff.user.id });
    expect((await admin.agent.patch(`/api/admin/vacancies/requests/${row.id}`).send({ assignedStaffId: client.user.id })).status).toBe(400);

    // Offer: an open vacancy with a free place -> notice, in-app notification + e-mail, status OFFERED, no application / case.
    const v = await createVacancy({ slug: 'offer-koch', title: koch, profession: 'Koch', city: 'Berlin', germanLevel: 'A1' });
    const closed = await createVacancy({ slug: 'offer-closed', status: 'CLOSED' });
    const offered = expectStatus(await admin.agent.post(`/api/admin/vacancies/requests/${row.id}/offer`).send({ vacancyId: v.id }), 200).body;
    expect(offered.item).toMatchObject({ status: 'OFFERED', offers: [{ source: 'STAFF', vacancy: { slug: 'offer-koch' } }] });
    expect(offered.delivered).toBe(true);
    const n = await waitFor(() => prisma.notification.findFirst({ where: { userId: client.user.id, type: 'VACANCY_REQUEST' } }));
    expect(n.link).toBe('/jobs/offer-koch');
    await waitFor(() => prisma.emailLog.findFirst({ where: { to: client.user.email, subject: { startsWith: 'A vacancy matching your request' } } }));
    expect(await prisma.vacancyApplication.count()).toBe(0);
    expect(await prisma.case.count()).toBe(0);
    expect((await admin.agent.post(`/api/admin/vacancies/requests/${row.id}/offer`).send({ vacancyId: v.id })).body.error).toBe('ALREADY_OFFERED');
    expect((await admin.agent.post(`/api/admin/vacancies/requests/${row.id}/offer`).send({ vacancyId: closed.id })).body.error).toBe('VACANCY_CLOSED');
    // The client sees the offer (vacancy title + slug, no employer).
    const mine = expectStatus(await client.agent.get('/api/vacancy-requests/mine'), 200).body.items[0];
    expect(mine.offers).toMatchObject([{ slug: 'offer-koch' }]);
    expect(JSON.stringify(mine)).not.toContain('Firma');
    // Offered pairs are not announced again by the automatic run.
    await runVacancyRequestNotices();
    expect(await prisma.vacancyRequestNotice.count({ where: { requestId: row.id, vacancyId: v.id } })).toBe(1);
  });

  it('reactivation / new vacancy: matching open requests are told once per vacancy (in-app + e-mail), others not', async () => {
    const client = await asClient();
    expectStatus(await client.agent.post('/api/vacancy-requests').send({ type: 'WORK', profession: 'truck_driver', city: 'Hamburg', lng: 'de' }), 201);
    expectStatus(await anon().post('/api/vacancy-requests').send({ type: 'WORK', sector: 'logistics', consent: true, name: 'Guest', email: 'guest.r@test.local', lng: 'de' }), 201);
    expectStatus(await anon().post('/api/vacancy-requests').send({ type: 'WORK', sector: 'logistics', consent: true, name: 'Phone only', phone: '+994501112244' }), 201);

    const dead = await createVacancy({ slug: 'react-lkw', status: 'CLOSED', publishedAt: new Date() });
    await runVacancyRequestNotices(); // deactivated: nothing
    expect(await prisma.vacancyRequestNotice.count()).toBe(0);

    const admin = await asAdmin();
    expectStatus(await admin.agent.post(`/api/admin/vacancies/${dead.id}/active`).send({ active: true }), 200);
    await runVacancyRequestNotices();
    await runVacancyRequestNotices();
    expect(await prisma.vacancyRequestNotice.count({ where: { vacancyId: dead.id } })).toBe(2); // account + guest with e-mail; once each
    await waitFor(() => prisma.notification.findFirst({ where: { userId: client.user.id, type: 'VACANCY_REQUEST' } }));
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'VACANCY_REQUEST' } })).toBe(1);
    const mail = await waitFor(() => prisma.emailLog.findFirst({ where: { to: 'guest.r@test.local', subject: { startsWith: 'Passende Stelle zu Ihrer Anfrage' } } }));
    expect(mail.subject).toContain('LKW-Fahrer');
    expect(await prisma.vacancyRequest.count({ where: { status: 'OFFERED' } })).toBe(2);

    // Another sector / type / city and a full vacancy are not announced; a new matching vacancy is.
    await createVacancy({ slug: 'no-cook', title: koch, profession: 'Koch', sector: 'hospitality' });
    await createVacancy({ slug: 'no-ausb', employmentType: 'AUSBILDUNG' });
    await createVacancy({ slug: 'no-munich', city: 'München' });
    await createVacancy({ slug: 'no-full', positions: 1, filledAdjustment: 1 });
    const fresh = await createVacancy({ slug: 'fresh-lkw', city: 'Hamburg' });
    await runVacancyRequestNotices();
    const told = await prisma.vacancyRequestNotice.findMany({ where: { vacancyId: { not: dead.id } } });
    const slugOf = new Map((await prisma.vacancy.findMany({ select: { id: true, slug: true } })).map((v) => [v.id, v.slug]));
    const slugs = told.map((t) => slugOf.get(t.vacancyId));
    // Other sector, other type and a full vacancy: nobody. München: only the guest request without a city.
    expect(slugs.filter((x) => ['no-cook', 'no-ausb', 'no-full'].includes(x ?? ''))).toEqual([]);
    const clientReq = await prisma.vacancyRequest.findFirstOrThrow({ where: { userId: client.user.id } });
    expect(told.filter((t) => t.requestId === clientReq.id).map((t) => slugOf.get(t.vacancyId))).toEqual(['fresh-lkw']);
    expect(slugs.filter((x) => x === 'fresh-lkw')).toHaveLength(2);

    // A cancelled request hears nothing more.
    const mine = expectStatus(await client.agent.get('/api/vacancy-requests/mine'), 200).body.items[0];
    expectStatus(await client.agent.post(`/api/vacancy-requests/mine/${mine.id}/cancel`), 200);
    const later = await createVacancy({ slug: 'later-lkw', city: 'Hamburg' });
    await runVacancyRequestNotices();
    expect(await prisma.vacancyRequestNotice.count({ where: { requestId: mine.id, vacancyId: later.id } })).toBe(0);
  });
});
