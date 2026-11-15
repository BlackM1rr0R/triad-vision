import { afterEach, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { createCaseVia, driveCaseTo, expectStatus } from '../helpers/workflow';
import { setWeatherFetch } from '../../src/lib/clientPlus/weather.js';

const DAY = 24 * 60 * 60 * 1000;

const approvedCase = async (client: Awaited<ReturnType<typeof asClient>>) => {
  const c = await createCaseVia(client.agent);
  await prisma.case.update({ where: { id: c.id }, data: { status: 'APPROVED', decisionAt: new Date() } });
  return c;
};

const geoAndForecast = (calls: string[]) => async (url: string) => {
  calls.push(url);
  if (url.includes('geocoding')) return { results: [{ name: 'Hamburg', latitude: 53.55, longitude: 9.99, country_code: 'DE' }] };
  const time = Array.from({ length: 7 }, (_, i) => new Date(Date.now() + i * DAY).toISOString().slice(0, 10));
  return { daily: { time, weather_code: time.map(() => 61), temperature_2m_max: time.map(() => 7), temperature_2m_min: time.map(() => 2), precipitation_probability_max: time.map(() => 70) } };
};

describe('My Germany day', () => {
  afterEach(() => setWeatherFetch(null));

  it('no approved case → NO_CASE; approved without a flight → NO_FLIGHT; staff are refused', async () => {
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    expect(expectStatus(await client.agent.get('/api/account/germany/day'), 200).body).toMatchObject({ phase: 'NO_CASE', case: null, weather: null });
    await prisma.case.update({ where: { id: c.id }, data: { status: 'APPROVED', decisionAt: new Date() } });
    expect(expectStatus(await client.agent.get('/api/account/germany/day'), 200).body).toMatchObject({ phase: 'NO_FLIGHT', case: { id: c.id } });
    const staff = await asStaff();
    expectStatus(await staff.agent.get('/api/account/germany/day'), 403);
    expectStatus(await (await asClient()).agent.get(`/api/account/germany/day?case=${c.id}`), 404); // someone else's case
  });

  it('flight in 10 days: countdown, week forecast, packing open; ticks are stored per client', async () => {
    const client = await asClient();
    const c = await approvedCase(client);
    const calls: string[] = [];
    setWeatherFetch(geoAndForecast(calls));
    await prisma.arrivalPlan.create({ data: { caseId: c.id, clientId: client.user.id, arrivalTime: new Date(Date.now() + 10 * DAY), flightNumber: 'J2 8011', arrivalAirport: 'HAM', housingCity: 'Hamburg' } });

    const day = expectStatus(await client.agent.get('/api/account/germany/day'), 200).body;
    expect(day).toMatchObject({ phase: 'UPCOMING', flightNumber: 'J2 8011', arrivalAirport: 'HAM', city: 'Hamburg', dayOnly: false });
    expect(day.days).toBeGreaterThanOrEqual(9);
    expect(day.days).toBeLessThanOrEqual(11);
    expect(day.weather).toMatchObject({ mode: 'forecast', city: 'Hamburg' });
    expect(day.weather.days).toHaveLength(7);
    expect(day.packing).toMatchObject({ open: true, done: 0 });
    expect(day.packing.items.length).toBe(day.packing.total);

    expectStatus(await client.agent.put('/api/account/germany/packing/nonsense').send({ done: true }), 400);
    expectStatus(await client.agent.put('/api/account/germany/packing/passport').send({ done: 'yes' }), 400);
    const ticked = expectStatus(await client.agent.put('/api/account/germany/packing/passport').send({ done: true }), 200).body.packing;
    expect(ticked.done).toBe(1);
    expect(ticked.items.find((i: { key: string }) => i.key === 'passport').checkedAt).toBeTruthy();
    expectStatus(await client.agent.put('/api/account/germany/packing/money').send({ done: true }), 200);
    expect(expectStatus(await client.agent.put('/api/account/germany/packing/money').send({ done: false }), 200).body.packing.done).toBe(1);
    expect(expectStatus(await client.agent.get('/api/account/germany/day'), 200).body.packing.done).toBe(1);
    expect(calls).toHaveLength(2); // second GET used the cache

    // Another client sees their own (empty) state.
    const other = await asClient();
    await approvedCase(other);
    expect(expectStatus(await other.agent.get('/api/account/germany/day'), 200).body.packing.done).toBe(0);
  });

  it('flight in 40 days: typical climate, packing closed (ticking refused)', async () => {
    const client = await asClient();
    const c = await approvedCase(client);
    let called = 0;
    setWeatherFetch(async () => {
      called++;
      return {};
    });
    await prisma.arrivalPlan.create({ data: { caseId: c.id, clientId: client.user.id, flightDate: new Date(Date.now() + 40 * DAY), housingCity: 'Berlin' } });
    const day = expectStatus(await client.agent.get('/api/account/germany/day'), 200).body;
    expect(day).toMatchObject({ phase: 'UPCOMING', dayOnly: true, weather: { mode: 'climate', city: 'Berlin', generic: false } });
    expect(day.packing).toMatchObject({ open: false });
    expect(day.packing.opensInDays).toBeGreaterThanOrEqual(25);
    expect(called).toBe(0);
    expectStatus(await client.agent.put('/api/account/germany/packing/passport').send({ done: true }), 409);
  });
});

describe('arrival card', () => {
  it('404 before the visa; own data only: address, employer contact, first day, emergency, embassy, support', async () => {
    const client = await asClient({ firstName: 'Əli', lastName: 'Həsənov' });
    const c = await createCaseVia(client.agent);
    expectStatus(await client.agent.get('/api/account/germany/arrival-card'), 404);

    const company = await prisma.company.create({ data: { name: 'Nord Logistik GmbH', contactName: 'Anna Schulz', phone: '+49 40 123456', street: 'Hafenstraße 1', postalCode: '20457', city: 'Hamburg', note: 'INTERNAL' } });
    await prisma.case.update({ where: { id: c.id }, data: { status: 'APPROVED', decisionAt: new Date(), companyId: company.id } });
    const start = new Date('2027-01-04T00:00:00.000Z');
    await prisma.employmentContract.create({ data: { caseId: c.id, companyId: company.id, employerName: 'Nord Logistik GmbH', startDate: start } });
    await prisma.arrivalPlan.create({
      data: {
        caseId: c.id,
        clientId: client.user.id,
        arrivalTime: new Date(Date.now() + 20 * DAY),
        flightNumber: 'J2 8011',
        arrivalAirport: 'HAM',
        housingStatus: 'REQUESTED',
        housingDetails: 'Elbchaussee 5, 22763 Hamburg',
        staffNote: 'SECRET',
        pickupDetails: 'not yet confirmed',
      },
    });

    // Housing not offered yet: the staff text is not shown, only the city.
    let card = expectStatus(await client.agent.get('/api/account/germany/arrival-card'), 200).body.card;
    expect(card.address).toMatchObject({ text: null, city: 'Hamburg', source: 'CITY' });
    expect(card.arrival).toMatchObject({ flightNumber: 'J2 8011', airport: 'HAM', pickup: null });

    await prisma.arrivalPlan.update({ where: { caseId: c.id }, data: { housingStatus: 'ARRANGED', pickupConfirmed: true, pickupDetails: 'Meeting point Terminal 1' } });
    card = expectStatus(await client.agent.get('/api/account/germany/arrival-card'), 200).body.card;
    expect(card.holder.name).toBe('Əli Həsənov');
    expect(card.address).toMatchObject({ text: 'Elbchaussee 5, 22763 Hamburg', source: 'ARRIVAL_PLAN' });
    expect(card.employer).toEqual({ name: 'Nord Logistik GmbH', contactName: 'Anna Schulz', phone: '+49 40 123456', email: null, address: 'Hafenstraße 1, 20457 Hamburg' });
    expect(card.firstWorkDay).toBe(start.toISOString());
    expect(card.arrival.pickup).toBe('Meeting point Terminal 1');
    expect(card.emergency.map((e: { number: string }) => e.number)).toEqual(['112', '110', '116117']);
    expect(card.embassy.consular.phone).toMatch(/^\+49 30/);
    expect(card.support.phone).toBe('+994 51 414 14 01');
    const raw = JSON.stringify(card);
    expect(raw).not.toContain('SECRET');
    expect(raw).not.toContain('INTERNAL');

    // The support number follows the contact setting.
    await prisma.setting.upsert({ where: { key: 'contact' }, create: { key: 'contact', value: { phone: '+994 12 000 00 00' } }, update: { value: { phone: '+994 12 000 00 00' } } });
    expect(expectStatus(await client.agent.get('/api/account/germany/arrival-card'), 200).body.card.support.phone).toBe('+994 12 000 00 00');

    // Someone else: their own (none) card; the case id of this client is not found.
    const other = await asClient();
    expectStatus(await other.agent.get('/api/account/germany/arrival-card'), 404);
    expectStatus(await other.agent.get(`/api/account/germany/arrival-card?case=${c.id}`), 404);
    expectStatus(await (await asStaff()).agent.get('/api/account/germany/arrival-card'), 403);
  });
});

describe('badges', () => {
  it('earned through the real workflow, stored once with the date, fresh until seen; own badges only', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const first = expectStatus(await client.agent.get('/api/account/germany/badges'), 200).body;
    expect(first.total).toBeGreaterThanOrEqual(14);
    expect(first.badges.find((b: { key: string }) => b.key === 'VISA_APPROVED')).toMatchObject({ earned: false, earnedAt: null, fresh: false });
    expect(first.badges.find((b: { key: string }) => b.key === 'STREAK_7').progress).toEqual({ value: 0, goal: 7 });

    await driveCaseTo('APPROVED', { client: client.agent, admin: admin.agent });
    const after = expectStatus(await client.agent.get('/api/account/germany/badges'), 200).body;
    const byKey = Object.fromEntries(after.badges.map((b: { key: string }) => [b.key, b]));
    for (const k of ['DOCS_UPLOADED', 'DOCS_ACCEPTED', 'CONTRACT_SIGNED', 'VISA_APPROVED']) expect(byKey[k], k).toMatchObject({ earned: true, fresh: true });
    expect(byKey.ARRIVED.earned).toBe(false);
    const earnedAt = byKey.VISA_APPROVED.earnedAt;
    expect(earnedAt).toBeTruthy();

    // German: a 7-day streak, a placement test at A2.
    const today = new Date();
    const dayStr = (i: number) => new Date(today.getTime() - i * DAY + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await prisma.germanPracticeDay.createMany({ data: Array.from({ length: 7 }, (_, i) => ({ userId: client.user.id, day: dayStr(i + 20), reviews: 5, correct: 4, newWords: 2 })) });
    await prisma.germanTestAttempt.create({ data: { userId: client.user.id, estimated: 'A2', correct: 10, total: 20, percent: 50, levels: [] } });

    expectStatus(await client.agent.post('/api/account/germany/badges/seen').send({ keys: ['NOPE'] }), 400);
    expect(expectStatus(await client.agent.post('/api/account/germany/badges/seen').send({ keys: ['VISA_APPROVED'] }), 200).body.updated).toBe(1);
    const german = expectStatus(await client.agent.get('/api/account/germany/badges'), 200).body;
    const g = Object.fromEntries(german.badges.map((b: { key: string }) => [b.key, b]));
    expect(g.STREAK_7).toMatchObject({ earned: true, fresh: true });
    expect(g.STREAK_30).toMatchObject({ earned: false, progress: { value: 7, goal: 30 } });
    expect(g.LEVEL_A2.earned).toBe(true);
    expect(g.LEVEL_B1.earned).toBe(false);
    expect(g.VISA_APPROVED).toMatchObject({ fresh: false, earnedAt }); // date kept
    expect(await prisma.clientBadge.count({ where: { userId: client.user.id, key: 'VISA_APPROVED' } })).toBe(1);

    expect(expectStatus(await client.agent.post('/api/account/germany/badges/seen').send({}), 200).body.updated).toBeGreaterThan(0);
    expect(expectStatus(await client.agent.get('/api/account/germany/badges'), 200).body.badges.some((b: { fresh: boolean }) => b.fresh)).toBe(false);

    // Kept once earned, even if the case is no longer approved.
    await prisma.case.updateMany({ where: { clientId: client.user.id }, data: { status: 'CANCELLED' } });
    const kept = expectStatus(await client.agent.get('/api/account/germany/badges'), 200).body.badges.find((b: { key: string }) => b.key === 'VISA_APPROVED');
    expect(kept.earned).toBe(true);

    // Another client has none of them; staff cannot use the endpoint.
    const other = await asClient();
    expect(expectStatus(await other.agent.get('/api/account/germany/badges'), 200).body.earned).toBe(0);
    expectStatus(await (await asStaff()).agent.get('/api/account/germany/badges'), 403);
  });
});
