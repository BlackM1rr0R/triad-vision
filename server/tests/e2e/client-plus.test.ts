import { afterEach, describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { clientCase, createCaseVia, expectStatus, uploadDoc } from '../helpers/workflow';
import { addFamilyMember } from '../../src/lib/journey/family.js';
import { setWeatherFetch } from '../../src/lib/clientPlus/weather.js';

const DAY = 24 * 60 * 60 * 1000;

// ─── 1. "Necə çəkməli?" examples on the document guides ─────────────

describe('document guide examples (good / bad image + tips)', () => {
  const text = { summary: '', where: '', duration: '', cost: '', apostille: '', translation: '', mistakes: '', tips: '' };
  const content = { az: text, de: text, en: text, ru: text };

  it('admin saves example images and tips in the guide JSON; the client gets them in their language (max 5 tips)', async () => {
    const admin = await asAdmin();
    const client = await asClient({ locale: 'de' });
    const examples = {
      goodImage: '/uploads/good.png',
      badImage: '/uploads/bad.png',
      tips: { az: 'a1\na2', de: 'Alle 4 Ecken\nKein Blitz\n\nKeine Finger\nFarbe\nScharf\nZu viel', en: '', ru: '' },
    };
    const body = { content, links: [], sampleImage: null, verified: true, published: true, examples };
    // Only upload URLs as images
    expectStatus(await admin.agent.put('/api/admin/doc-guides/CV').send({ ...body, examples: { ...examples, badImage: 'https://evil.example/x.png' } }), 400);
    const saved = expectStatus(await admin.agent.put('/api/admin/doc-guides/CV').send(body), 200).body.guide;
    expect(saved.examples).toMatchObject({ goodImage: '/uploads/good.png', badImage: '/uploads/bad.png' });
    expect(saved.content).not.toHaveProperty('_examples');
    expect(Object.keys(saved.content).sort()).toEqual(['az', 'de', 'en', 'ru']);

    // No text at all, but examples: still delivered (hasText false → no "Necə almalı?" drawer, only "Necə çəkməli?").
    const got = expectStatus(await client.agent.get('/api/client-data/guides?keys=CV'), 200).body.guides.CV;
    expect(got).toMatchObject({ hasText: false, examples: { goodImage: '/uploads/good.png', badImage: '/uploads/bad.png' } });
    expect(got.examples.tips).toEqual(['Alle 4 Ecken', 'Kein Blitz', 'Keine Finger', 'Farbe', 'Scharf']);

    // English is empty → falls back to the Azerbaijani tips.
    const en = await asClient({ locale: 'en' });
    expect(expectStatus(await en.agent.get('/api/client-data/guides?keys=CV'), 200).body.guides.CV.examples.tips).toEqual(['a1', 'a2']);

    // A save without `examples` keeps the stored ones; null removes them.
    const kept = expectStatus(await admin.agent.put('/api/admin/doc-guides/CV').send({ content: { ...content, az: { ...text, summary: 'CV PDF' } }, links: [], sampleImage: null, verified: true, published: true }), 200).body.guide;
    expect(kept.examples?.goodImage).toBe('/uploads/good.png');
    const cleared = expectStatus(await admin.agent.put('/api/admin/doc-guides/CV').send({ ...body, examples: null }), 200).body.guide;
    expect(cleared.examples).toBeNull();
    expect(expectStatus(await client.agent.get('/api/client-data/guides?keys=CV'), 200).body.guides.CV).toBeUndefined();

    // Built-in drafts carry no examples (the client draws its illustrated defaults).
    expect(expectStatus(await client.agent.get('/api/client-data/guides?keys=PASSPORT'), 200).body.guides.PASSPORT).toMatchObject({ hasText: true, examples: null });
  });
});

// ─── 2. Staff marks on a rejected scan ──────────────────────────────

describe('review marks on a rejected document', () => {
  it('reject with marks → stored and shown to the client; invalid shapes are refused; accept clears them', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    const req = (await clientCase(client.agent, c.id)).requirements.find((r) => r.stage === 'INITIAL')!;
    const doc = expectStatus(await uploadDoc(client.agent, c.id, req.id), 201).body.document as { id: string };
    const url = `/api/admin/cases/${c.id}/documents/${doc.id}/review`;
    const mark = { page: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.1, note: 'Künc kəsilib' };

    expectStatus(await admin.agent.post(url).send({ status: 'REJECTED', note: 'Yenidən', reviewMarks: [{ ...mark, x: 0.9, w: 0.3 }] }), 400); // out of the page
    expectStatus(await admin.agent.post(url).send({ status: 'REJECTED', note: 'Yenidən', reviewMarks: [{ ...mark, evil: 1 }] }), 400); // unknown key
    expectStatus(await admin.agent.post(url).send({ status: 'REJECTED', note: 'Yenidən', reviewMarks: [{ ...mark, note: 'x'.repeat(301) }] }), 400);
    expectStatus(await admin.agent.post(url).send({ status: 'REJECTED', note: 'Yenidən', reviewMarks: Array.from({ length: 21 }, () => mark) }), 400);
    expectStatus(await admin.agent.post(url).send({ status: 'REJECTED', note: 'Yenidən', reviewMarks: 'nope' }), 400);

    const res = expectStatus(await admin.agent.post(url).send({ status: 'REJECTED', note: 'Pasportun küncü görünmür', reviewMarks: [mark, { page: 2, x: 0.123456, y: 0, w: 0.5, h: 0.5 }] }), 200);
    expect(res.body.document.reviewMarks).toEqual([mark, { page: 2, x: 0.1235, y: 0, w: 0.5, h: 0.5, note: '' }]);

    const seen = (await clientCase(client.agent, c.id)).requirements.find((r) => r.id === req.id)!.documents.find((d) => d.id === doc.id) as unknown as { status: string; reviewNote: string; reviewMarks: unknown[] };
    expect(seen).toMatchObject({ status: 'REJECTED', reviewNote: 'Pasportun küncü görünmür' });
    expect(seen.reviewMarks).toHaveLength(2);

    // Rejecting without marks is still fine (and clears old marks); so does accepting.
    expectStatus(await admin.agent.post(url).send({ status: 'ACCEPTED' }), 200);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).reviewMarks).toBeNull();
  });
});

// ─── 3. Family switcher ─────────────────────────────────────────────

describe('family switcher', () => {
  it('lists the own cases (self, spouse, child: name); next-step / overview follow ?case=; foreign cases are ignored or 404', async () => {
    const client = await asClient();
    const main = await createCaseVia(client.agent);
    const spouse = await addFamilyMember(main.id, client.user.id, { relation: 'spouse', firstName: 'Leyla', lastName: 'M' });
    const child = await addFamilyMember(main.id, client.user.id, { relation: 'child', firstName: 'Aylin', lastName: 'M' });

    const list = expectStatus(await client.agent.get('/api/account/plus/family'), 200).body.cases as { id: string; kind: string; firstName: string | null; isDefault: boolean }[];
    expect(list.map((x) => x.kind)).toEqual(['self', 'spouse', 'child']);
    expect(list[0]).toMatchObject({ id: main.id, isDefault: true, firstName: null });
    expect(list[2]).toMatchObject({ firstName: 'Aylin' });
    const childId = list[2].id;
    expect([spouse, child].some((m) => JSON.stringify(m).includes(childId))).toBe(true);

    const def = expectStatus(await client.agent.get('/api/account/next-step'), 200).body;
    expect(def.case.id).toBe(main.id);
    const picked = expectStatus(await client.agent.get(`/api/account/next-step?case=${childId}`), 200).body;
    expect(picked.case.id).toBe(childId);
    expect(picked.primary.to).toContain(childId);
    const ov = expectStatus(await client.agent.get(`/api/account/overview?case=${childId}`), 200).body;
    expect(ov.activeCase.id).toBe(childId);

    // Another client's case: next-step falls back to the own default, countdowns refuse it.
    const other = await asClient();
    const foreign = await createCaseVia(other.agent);
    expect(expectStatus(await client.agent.get(`/api/account/next-step?case=${foreign.id}`), 200).body.case.id).toBe(main.id);
    expect(expectStatus(await client.agent.get(`/api/account/overview?case=${foreign.id}`), 200).body.activeCase.id).toBe(main.id);
    expectStatus(await client.agent.get(`/api/account/plus/countdowns?case=${foreign.id}`), 404);
    expect(expectStatus(await other.agent.get('/api/account/plus/family'), 200).body.cases).toHaveLength(1);

    // Staff accounts have no portal extras.
    const staff = await asStaff();
    expectStatus(await staff.agent.get('/api/account/plus/family'), 403);
  });
});

// ─── 4. Countdown cards + weather ───────────────────────────────────

describe('countdown cards', () => {
  afterEach(() => setWeatherFetch(null));

  it('embassy, flight and Anmeldung cards with days left, weather of the destination (cached); none without dates', async () => {
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    expect(expectStatus(await client.agent.get('/api/account/plus/countdowns'), 200).body).toMatchObject({ caseId: c.id, cards: [], weather: null });

    const calls: string[] = [];
    setWeatherFetch(async (url) => {
      calls.push(url);
      if (url.includes('geocoding')) return { results: [{ name: 'Wien', latitude: 48.2, longitude: 16.37, country_code: 'AT' }, { name: 'München', latitude: 48.14, longitude: 11.58, country_code: 'DE' }] };
      return { daily: { time: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'], weather_code: [0, 3, 61, 71, 95], temperature_2m_max: [12.4, 10, 8, 2, 9], temperature_2m_min: [3, 2, 1, -2, 4], precipitation_probability_max: [0, 10, 80, 60, 90] } };
    });

    const now = Date.now();
    await prisma.case.update({ where: { id: c.id }, data: { appointmentAt: new Date(now + 12 * DAY), appointmentPlace: 'Deutsche Botschaft Baku' } });
    await prisma.arrivalPlan.create({ data: { caseId: c.id, clientId: client.user.id, flightDate: new Date(now + 34 * DAY), flightNumber: 'J2 123', arrivalAirport: 'MUC', housingCity: 'München (Bayern)' } });
    await prisma.caseHousing.create({ data: { caseId: c.id, moveInDate: new Date(new Date(now + 40 * DAY).toISOString().slice(0, 10) + 'T00:00:00.000Z') } });

    const body = expectStatus(await client.agent.get(`/api/account/plus/countdowns?case=${c.id}`), 200).body;
    expect(body.cards.map((x: { kind: string }) => x.kind)).toEqual(['EMBASSY', 'FLIGHT', 'ANMELDUNG']);
    expect(body.cards[0]).toMatchObject({ days: 12, place: 'Deutsche Botschaft Baku' });
    expect(body.cards[1]).toMatchObject({ days: 34, detail: 'J2 123', place: 'MUC', to: '/account/arrival' });
    expect(body.cards[2].days).toBe(54);
    expect(body.city).toBe('München (Bayern)');
    expect(body.weather).toMatchObject({ city: 'München', country: 'DE' });
    expect(body.weather.days).toHaveLength(4);
    expect(body.weather.days.map((d: { icon: string }) => d.icon)).toEqual(['sun', 'cloud', 'rain', 'snow']);
    expect(body.weather.days[0]).toMatchObject({ max: 12, min: 3, rain: 0 });
    expect(calls[0]).toContain('name=M%C3%BCnchen&'); // "(Bayern)" stripped

    // Cached: a second request does not call Open-Meteo again.
    expectStatus(await client.agent.get('/api/account/plus/countdowns'), 200);
    expect(calls).toHaveLength(2);

    // Done Anmeldung and a past appointment disappear.
    await prisma.caseHousing.update({ where: { caseId: c.id }, data: { anmeldungDoneAt: new Date() } });
    await prisma.case.update({ where: { id: c.id }, data: { appointmentAt: new Date(now - 3 * DAY) } });
    const later = expectStatus(await client.agent.get('/api/account/plus/countdowns'), 200).body;
    expect(later.cards.map((x: { kind: string }) => x.kind)).toEqual(['FLIGHT']);
  });

  it('Open-Meteo down → cards without weather', async () => {
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    setWeatherFetch(async () => {
      throw new Error('down');
    });
    await prisma.case.update({ where: { id: c.id }, data: { appointmentAt: new Date(Date.now() + 5 * DAY) } });
    await prisma.caseHousing.create({ data: { caseId: c.id, city: 'Berlin' } });
    const body = expectStatus(await client.agent.get('/api/account/plus/countdowns'), 200).body;
    expect(body.cards).toHaveLength(1);
    expect(body.weather).toBeNull();
  });
});

// ─── 6. Offline pack ────────────────────────────────────────────────

describe('offline pack', () => {
  it('own documents (not rejected) and the appointment card, nothing of other clients', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    const reqs = (await clientCase(client.agent, c.id)).requirements.filter((r) => r.stage === 'INITIAL');
    const a = expectStatus(await uploadDoc(client.agent, c.id, reqs[0].id, 'passport.pdf'), 201).body.document as { id: string };
    const b = expectStatus(await uploadDoc(client.agent, c.id, reqs[1].id, 'photo.pdf'), 201).body.document as { id: string };
    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${b.id}/review`).send({ status: 'REJECTED', note: 'x' }), 200);
    await prisma.case.update({ where: { id: c.id }, data: { appointmentAt: new Date(Date.now() + 3 * DAY), appointmentPlace: 'Baku' } });
    const other = await asClient();
    await createCaseVia(other.agent);

    const pack = expectStatus(await client.agent.get('/api/account/plus/offline-pack'), 200).body;
    expect(pack.cases).toHaveLength(1);
    expect(pack.cases[0].documents.map((d: { id: string }) => d.id)).toEqual([a.id]);
    expect(pack.cases[0].documents[0]).toMatchObject({ name: 'passport.pdf', mimeType: 'application/pdf' });
    expect(pack.cases[0].appointment).toMatchObject({ place: 'Baku' });
    expect(pack.cases[0].cards[0]).toMatchObject({ kind: 'EMBASSY', days: 3 });
  });
});
