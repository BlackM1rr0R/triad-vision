import { beforeEach, describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { clientCase, createCaseVia, expectStatus, uploadDoc } from '../helpers/workflow';
import { addFamilyMember } from '../../src/lib/journey/family.js';
import { requirementsFor } from '../../src/lib/docsIntel/requirementTemplates.js';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Portal planning pages (routes/accountPlus.ts): the document checklist per visa type and the arrival preparation
 * checklist. Both are client-only and read nothing but the caller's own cases.
 */

type Item = { id: string | null; key: string | null; state: string; required: boolean; rejectionNote: string | null; files: number };
type Stage = { stage: string; created: boolean; open: boolean; past: boolean; items: Item[] };

describe('GET /api/account/plus/doc-checklist', () => {
  it('needs a client session', async () => {
    expect((await anon().get('/api/account/plus/doc-checklist')).status).toBe(401);
    const staff = await asStaff();
    expect((await staff.agent.get('/api/account/plus/doc-checklist')).status).toBe(403);
  });

  it('no case yet: empty answer', async () => {
    const client = await asClient();
    const body = expectStatus(await client.agent.get('/api/account/plus/doc-checklist'), 200).body;
    expect(body).toMatchObject({ case: null, stages: [], progress: null });
  });

  it('lists the current stage with states and the later stage as a preview, with guides; uploads and rejections show up', async () => {
    const client = await asClient({ locale: 'en' });
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);

    let body = expectStatus(await client.agent.get('/api/account/plus/doc-checklist'), 200).body;
    expect(body.case).toMatchObject({ id: c.id, number: c.number, status: 'DOCUMENTS_PENDING', relation: null, memberName: null });
    expect(body.uploadStage).toBe('INITIAL');
    const [initial, embassy] = body.stages as Stage[];
    expect(initial).toMatchObject({ stage: 'INITIAL', created: true, open: true, past: false });
    const reqs = (await clientCase(client.agent, c.id)).requirements.filter((r) => r.stage === 'INITIAL');
    expect(initial.items.map((i) => i.id).sort()).toEqual(reqs.map((r) => r.id).sort());
    expect(initial.items.every((i) => i.state === 'waiting')).toBe(true);

    // The embassy stage does not exist yet: exactly what the case will get later, without ids.
    const expected = await requirementsFor(prisma, 'EMBASSY', null);
    expect(embassy).toMatchObject({ stage: 'EMBASSY', created: false, open: false });
    expect(embassy.items.map((i) => i.key)).toEqual(expected.map((r) => r.key));
    expect(embassy.items.every((i) => i.id === null && i.state === 'upcoming')).toBe(true);
    expect(await prisma.documentRequirement.count({ where: { caseId: c.id, stage: 'EMBASSY' } })).toBe(0); // the preview creates nothing

    // "Necə almalı?" guide in the reader's language (built-in draft for the passport).
    expect(body.guides.PASSPORT).toMatchObject({ key: 'PASSPORT', hasText: true });
    expect(typeof body.guides.PASSPORT.text.where).toBe('string');

    const total = initial.items.length + embassy.items.length;
    const required = [...initial.items, ...embassy.items].filter((i) => i.required).length;
    expect(body.progress).toEqual({ accepted: 0, inReview: 0, required, total });

    // Upload one, reject it with a reason → "rejected" with the reason; another upload → "review".
    const passport = initial.items.find((i) => i.key === 'PASSPORT') ?? initial.items[0];
    const doc = expectStatus(await uploadDoc(client.agent, c.id, passport.id!), 201).body.document as { id: string };
    body = expectStatus(await client.agent.get(`/api/account/plus/doc-checklist?case=${c.id}`), 200).body;
    expect((body.stages as Stage[])[0].items.find((i) => i.id === passport.id)).toMatchObject({ state: 'review', files: 1 });
    expect(body.progress.inReview).toBe(passport.required ? 1 : 0);

    expectStatus(await admin.agent.post(`/api/admin/cases/${c.id}/documents/${doc.id}/review`).send({ status: 'REJECTED', note: 'Corner cut off' }), 200);
    body = expectStatus(await client.agent.get(`/api/account/plus/doc-checklist?case=${c.id}`), 200).body;
    expect((body.stages as Stage[])[0].items.find((i) => i.id === passport.id)).toMatchObject({ state: 'rejected', rejectionNote: 'Corner cut off' });
  });

  it('a family member case shows the member’s own list; foreign cases are 404', async () => {
    const client = await asClient();
    const main = await createCaseVia(client.agent);
    const spouse = await addFamilyMember(main.id, client.user.id, { relation: 'spouse', firstName: 'Leyla', lastName: 'M' });

    const body = expectStatus(await client.agent.get(`/api/account/plus/doc-checklist?case=${spouse.id}`), 200).body;
    expect(body.case).toMatchObject({ id: spouse.id, relation: 'spouse', memberName: 'Leyla' });
    const own = await prisma.documentRequirement.findMany({ where: { caseId: spouse.id, stage: 'INITIAL' }, select: { id: true } });
    expect((body.stages as Stage[])[0].items.map((i) => i.id).sort()).toEqual(own.map((r) => r.id).sort());

    // Without ?case the main application is shown (not the member's).
    expect(expectStatus(await client.agent.get('/api/account/plus/doc-checklist'), 200).body.case.id).toBe(main.id);

    const other = await asClient();
    expect((await other.agent.get(`/api/account/plus/doc-checklist?case=${main.id}`)).status).toBe(404);
    expect((await other.agent.get(`/api/account/plus/doc-checklist?case=${spouse.id}`)).status).toBe(404);
    expect(expectStatus(await other.agent.get('/api/account/plus/doc-checklist'), 200).body.case).toBeNull();
  });
});

describe('GET /api/account/plus/arrival-prep', () => {
  beforeEach(async () => {
    // Journey module tables are not part of the shared resetDb.
    await prisma.caseOnboarding.deleteMany();
    await prisma.onboardingItem.deleteMany();
  });

  const item = (slug: string, dueDays: number | null, sortOrder: number) => ({
    slug,
    icon: 'CheckCircle2',
    title: { az: slug, de: slug, en: slug, ru: slug },
    body: { az: 'a', de: 'd', en: 'e', ru: 'r' },
    dueDays,
    sortOrder,
  });

  it('needs a client session; nothing before the approval', async () => {
    expect((await anon().get('/api/account/plus/arrival-prep')).status).toBe(401);
    const staff = await asStaff();
    expect((await staff.agent.get('/api/account/plus/arrival-prep')).status).toBe(403);
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    const body = expectStatus(await client.agent.get(`/api/account/plus/arrival-prep?case=${c.id}`), 200).body;
    expect(body).toMatchObject({ case: null, before: [], after: [], progress: null });
  });

  it('flight / housing / first day from the arrival plan, post-arrival tasks dated from the arrival, ticks count', async () => {
    const client = await asClient();
    const c = await prisma.case.create({ data: { clientId: client.user.id, number: uniq('TV-AP-'), profession: 'Aşpaz', status: 'APPROVED', decisionAt: new Date() } });
    await prisma.onboardingItem.createMany({ data: [item('integrationskurs', 90, 0), item('bankkonto', 30, 1), item('anmeldung', 14, 2), item('mobilfunk', null, 3)] });

    let body = expectStatus(await client.agent.get('/api/account/plus/arrival-prep'), 200).body;
    expect(body.case).toMatchObject({ id: c.id });
    expect(body.before.map((t: { key: string }) => t.key)).toEqual(['flight', 'housing', 'firstDay']);
    expect(body.before.every((t: { done: boolean }) => !t.done)).toBe(true);
    // Core tasks first (Anmeldung, bank, SIM …), the rest after.
    expect(body.after.map((t: { slug: string }) => t.slug)).toEqual(['anmeldung', 'bankkonto', 'mobilfunk', 'integrationskurs']);
    expect(body.progress).toEqual({ done: 0, total: 7, percent: 0 });

    // The plan was created on the first visit; fill in the flight and the move-in day.
    const arrival = new Date(Date.now() + 20 * DAY);
    const moveIn = new Date(Date.UTC(arrival.getUTCFullYear(), arrival.getUTCMonth(), arrival.getUTCDate() + 2));
    await prisma.arrivalPlan.update({ where: { caseId: c.id }, data: { flightDate: arrival, arrivalTime: arrival, flightNumber: 'J2 8001', departureAirport: 'GYD', arrivalAirport: 'FRA' } });
    await prisma.caseHousing.create({ data: { caseId: c.id, moveInDate: moveIn } });

    body = expectStatus(await client.agent.get(`/api/account/plus/arrival-prep?case=${c.id}`), 200).body;
    const byKey = Object.fromEntries(body.before.map((t: { key: string }) => [t.key, t]));
    expect(byKey.flight).toMatchObject({ done: true, detail: 'J2 8001 · GYD → FRA' });
    expect(new Date(byKey.flight.date).getTime()).toBe(arrival.getTime());
    expect(byKey.housing).toMatchObject({ done: true });
    expect(byKey.firstDay).toMatchObject({ done: false });
    expect(new Date(body.arrivalAt).getTime()).toBe(arrival.getTime());

    const bySlug = Object.fromEntries(body.after.map((t: { slug: string }) => [t.slug, t]));
    expect(new Date(bySlug.anmeldung.dueAt).getTime()).toBe(moveIn.getTime() + 14 * DAY); // 14 days after moving in
    expect(new Date(bySlug.bankkonto.dueAt).getTime()).toBe(arrival.getTime() + 30 * DAY); // from the arrival day
    expect(bySlug.mobilfunk.dueAt).toBeNull();
    expect(body.progress).toMatchObject({ done: 2, total: 7 });

    // Ticking through the onboarding endpoint is reflected here.
    expectStatus(await client.agent.put(`/api/journey/onboarding/${bySlug.bankkonto.id}`).send({ done: true, caseId: c.id }), 200);
    body = expectStatus(await client.agent.get('/api/account/plus/arrival-prep'), 200).body;
    expect(body.after.find((t: { slug: string }) => t.slug === 'bankkonto')).toMatchObject({ done: true, overdue: false });
    expect(body.progress).toMatchObject({ done: 3, total: 7, percent: 43 });

    // Another client sees nothing of it.
    const other = await asClient();
    expect((await other.agent.get(`/api/account/plus/arrival-prep?case=${c.id}`)).status).toBe(404);
    expect(expectStatus(await other.agent.get('/api/account/plus/arrival-prep'), 200).body.case).toBeNull();
  });
});
