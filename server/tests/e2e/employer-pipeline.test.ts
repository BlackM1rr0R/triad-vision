import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../helpers/db';
import { anon, asAdmin } from '../helpers/api';
import { uniq } from '../helpers/factories';
import { asCandidate, asCompany, cleanJobs } from './vacancies.fixtures';
import { publishPipelineChange } from '../../src/lib/employerPipeline/realtime.js';
import { subscribe, type RealtimeEvent } from '../../src/lib/messaging/realtime.js';
import { DIGEST_SENT_PREFIX, runPipelineDigests } from '../../src/lib/employerPipeline/digest.js';

beforeEach(cleanJobs);

const DAY = 24 * 60 * 60 * 1000;

const setup = async () => {
  const employer = await asCompany();
  const other = await asCompany();
  const now = Date.now();
  const cand = (firstName: string, lastName: string, extra: Record<string, unknown> = {}) => asCandidate({ firstName, lastName, ...extra });
  const mk = (clientId: string, companyId: string, data: Record<string, unknown> = {}) =>
    prisma.case.create({ data: { number: uniq('TV-'), clientId, profession: 'LKW-Fahrer', companyId, ...data } });

  const a = await cand('Orxan', 'Həsənov', { passportNumber: 'C7654321' });
  const b = await cand('Samir', 'Babayev');
  const c = await cand('Elvin', 'Rzayev');
  const d = await cand('Nicat', 'Kərimov');
  const f = await cand('Fremd', 'Person');

  const contract = await mk(a.user.id, employer.company.id, { status: 'CONTRACT_SENT', createdAt: new Date(now - 12 * DAY) });
  const sig = await prisma.signatureRequest.create({
    data: {
      title: 'Arbeitsvertrag Orxan',
      caseId: contract.id,
      companyId: employer.company.id,
      status: 'SENT',
      isCaseContract: true,
      sentAt: new Date(now - 2 * DAY),
      originalName: 'vertrag.pdf',
      originalKey: uniq('orig-'),
      originalSha256: 'a'.repeat(64),
      originalSize: 100,
      originalPages: 1,
      signers: { create: [{ role: 'COMPANY', userId: employer.user.id, name: 'Hans Becker', email: employer.user.email, order: 1 }] },
    },
  });

  const recog = await mk(b.user.id, employer.company.id, { status: 'EMBASSY_DOCUMENTS', createdAt: new Date(now - 50 * DAY) });
  await prisma.caseEvent.create({ data: { caseId: recog.id, type: 'STATUS_CHANGED', fromStatus: 'CONTRACT_SIGNED', toStatus: 'EMBASSY_DOCUMENTS', createdAt: new Date(now - 20 * DAY) } });
  await prisma.recognitionProcess.create({ data: { caseId: recog.id, clientId: b.user.id, profession: 'Berufskraftfahrer', procedureType: 'IHK_FOSA', status: 'IN_REVIEW', authority: 'IHK FOSA Nürnberg', note: 'Defizit Fahrpraxis', createdAt: new Date(now - 30 * DAY) } });

  const flight = await mk(c.user.id, employer.company.id, { status: 'APPROVED', decisionAt: new Date(now - 5 * DAY) });
  await prisma.arrivalPlan.create({ data: { caseId: flight.id, clientId: c.user.id, status: 'SUBMITTED', flightDate: new Date(now + 10 * DAY), arrivalTime: new Date(now + 10 * DAY + 3600_000), flightNumber: 'J2 123', pickupDetails: 'Abholung +49 170 000' } });
  await prisma.employerArrivalItem.createMany({
    data: [
      { caseId: flight.id, companyId: employer.company.id, key: 'HOUSING', done: true },
      { caseId: flight.id, companyId: employer.company.id, key: 'FIRST_DAY', dueDate: new Date(now + 20 * DAY) },
    ],
  });

  const arrived = await mk(d.user.id, employer.company.id, { status: 'APPROVED', decisionAt: new Date(now - 40 * DAY) });
  await prisma.arrivalPlan.create({ data: { caseId: arrived.id, clientId: d.user.id, status: 'COMPLETED', arrivalTime: new Date(now - 3 * DAY) } });
  await prisma.employmentContract.create({ data: { caseId: arrived.id, companyId: employer.company.id, jobTitle: 'Berufskraftfahrer CE', startDate: new Date(now + 4 * DAY) } });

  const foreign = await mk(f.user.id, other.company.id, { status: 'DECISION_PENDING' });
  return { employer, other, contract, sig, recog, flight, arrived, foreign, candidate: a };
};

type Card = { id: string; stage: string; expectedArrival: { at: string; source: string } | null; firstWorkDay: { at: string; source: string } | null; blockers: { code: string; params?: Record<string, number> }[]; name: string };

describe('employer candidate pipeline', () => {
  it('shows only the own company workers as cards with stage, dates and blockers', async () => {
    const s = await setup();
    const res = await s.employer.agent.get('/api/company/pipeline').expect(200);
    const cards = res.body.cards as Card[];
    expect(cards.map((c) => c.id).sort()).toEqual([s.contract.id, s.recog.id, s.flight.id, s.arrived.id].sort());
    const by = (id: string) => cards.find((c) => c.id === id)!;

    expect(by(s.contract.id)).toMatchObject({ stage: 'CONTRACT', name: 'Orxan H.' });
    expect(by(s.contract.id).blockers).toEqual([expect.objectContaining({ code: 'CONTRACT_UNSIGNED' })]);
    expect(by(s.contract.id).expectedArrival?.source).toBe('ESTIMATE');

    expect(by(s.recog.id)).toMatchObject({ stage: 'RECOGNITION', hasRecognition: true });
    expect(by(s.flight.id)).toMatchObject({ stage: 'FLIGHT', expectedArrival: { source: 'FLIGHT' }, firstWorkDay: { source: 'PLANNED' } });
    expect(by(s.flight.id).blockers).toEqual([expect.objectContaining({ code: 'ARRIVAL_CHECKLIST', params: { open: 1, total: 2 } })]);
    expect(by(s.arrived.id)).toMatchObject({ stage: 'ARRIVED', expectedArrival: { source: 'ACTUAL' }, firstWorkDay: { source: 'PLANNED' } });

    expect(res.body.summary).toMatchObject({ total: 4, byStage: { CONTRACT: 1, RECOGNITION: 1, FLIGHT: 1, ARRIVED: 1 }, arrivingNext30: 1 });
    expect(res.body.strip).toHaveLength(12);
    expect(res.body.strip.flatMap((m: { ids: string[] }) => m.ids)).toContain(s.flight.id);

    // Nothing beyond the workers panel: no other company, contact / passport data, flight details or recognition details.
    const raw = JSON.stringify(res.body);
    for (const secret of [s.foreign.id, 'Fremd', 'Həsənov', 'C7654321', '+994501112233', 'J2 123', '+49 170', 'IHK FOSA', 'Defizit', 'IN_REVIEW']) expect(raw).not.toContain(secret);
  });

  it('the other company sees only its own worker; candidates and suspended companies are refused', async () => {
    const s = await setup();
    const res = await s.other.agent.get('/api/company/pipeline').expect(200);
    expect(res.body.cards.map((c: Card) => c.id)).toEqual([s.foreign.id]);
    expect(res.body.cards[0].stage).toBe('DECISION');

    await s.candidate.agent.get('/api/company/pipeline').expect(403);
    await anon().get('/api/company/pipeline').expect(401);
    await prisma.company.update({ where: { id: s.employer.company.id }, data: { status: 'SUSPENDED' } });
    const blocked = await s.employer.agent.get('/api/company/pipeline').expect(403);
    expect(blocked.body.error).toBe('COMPANY_SUSPENDED');
    await s.employer.agent.put('/api/company/pipeline/preferences').send({ weeklyDigest: true }).expect(403);
  });

  it('pushes pipeline.updated to the company users only', async () => {
    const s = await setup();
    const got: RealtimeEvent[] = [];
    const otherGot: RealtimeEvent[] = [];
    const un1 = subscribe(s.employer.user.id, (e) => got.push(e));
    const un2 = subscribe(s.other.user.id, (e) => otherGot.push(e));
    await publishPipelineChange(s.flight.id);
    un1();
    un2();
    expect(got).toEqual([expect.objectContaining({ type: 'pipeline.updated', payload: { caseId: s.flight.id } })]);
    expect(otherGot).toEqual([]);
  });

  it('weekly digest: opt-in preference and one e-mail per week', async () => {
    const s = await setup();
    expect((await s.employer.agent.get('/api/company/pipeline/preferences').expect(200)).body).toEqual({ weeklyDigest: false });
    await s.employer.agent.put('/api/company/pipeline/preferences').send({ weeklyDigest: true }).expect(200);
    expect((await s.employer.agent.get('/api/company/pipeline/preferences').expect(200)).body).toEqual({ weeklyDigest: true });

    const monday = new Date('2026-11-16T06:00:00Z'); // 10:00 Baku
    expect(await runPipelineDigests(new Date('2026-11-17T06:00:00Z'))).toMatchObject({ skipped: 'NOT_DUE' });
    expect(await runPipelineDigests(monday)).toMatchObject({ sent: 1 });
    expect(await runPipelineDigests(monday)).toMatchObject({ sent: 0 });
    expect(await prisma.setting.count({ where: { key: { startsWith: DIGEST_SENT_PREFIX } } })).toBe(1);
  });
});

describe('package configurator → quote request', () => {
  it('public view: catalogue services and prices, never apostille / translation / appointment booking', async () => {
    const res = await anon().get('/api/configurator?lang=de').expect(200);
    const services = res.body.services.map((s: { service: string }) => s.service);
    expect(services).toEqual(['RECRUITMENT', 'RECOGNITION', 'VISA_DOCUMENTS', 'RELOCATION', 'LANGUAGE_COURSE', 'ONBOARDING']);
    const recruitment = res.body.services.find((s: { service: string }) => s.service === 'RECRUITMENT');
    expect(recruitment.options.find((o: { catalogueId: string }) => o.catalogueId === 'placement-ce').unitPriceCents).toBe(450000);
    expect(res.body.professions.some((p: { key: string; label: string }) => p.key === 'truck_driver' && p.label === 'LKW-Fahrer/in')).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/apostill|übersetz|translat|termin/i);
  });

  it('a catalogue line for translations or apostille never reaches the configurator', async () => {
    await prisma.setting.create({
      data: {
        key: 'quotes',
        value: {
          catalogue: [
            { id: 'translation', name: 'Übersetzungen (beglaubigt)', unit: 'PIECE', unitPriceCents: 5000, vatRate: null, active: true, service: 'VISA_DOCUMENTS' },
            { id: 'visa', name: 'Visa-Unterlagen', unit: 'PERSON', unitPriceCents: 80000, vatRate: null, active: true, service: 'VISA_DOCUMENTS' },
          ],
        },
      },
    });
    const res = await anon().get('/api/configurator').expect(200);
    const visa = res.body.services.find((s: { service: string }) => s.service === 'VISA_DOCUMENTS');
    expect(visa.options.map((o: { catalogueId: string }) => o.catalogueId)).toEqual(['visa']);
    const rec = res.body.services.find((s: { service: string }) => s.service === 'RECRUITMENT');
    expect(rec).toMatchObject({ options: [], priced: false });
    const price = await anon()
      .post('/api/configurator/price')
      .send({ config: { positions: [{ profession: 'cook', count: 2 }], services: ['RECRUITMENT', 'VISA_DOCUMENTS'] } })
      .expect(200);
    expect(price.body.price).toMatchObject({ onRequest: true, totals: { netCents: 160000 } });
  });

  it('public request: a lead with the configuration, no quote', async () => {
    const before = await prisma.quote.count();
    await anon().post('/api/configurator/price').send({ config: { positions: [{ profession: 'nope', count: 1 }], services: ['RECRUITMENT'] } }).expect(400);
    const res = await anon()
      .post('/api/configurator/requests')
      .send({ config: { positions: [{ profession: 'truck_driver', count: 3 }], services: ['RECRUITMENT', 'VISA_DOCUMENTS'] }, companyName: 'Spedition Nord GmbH', contactName: 'Frau Nord', email: 'nord@example.test', locale: 'de' })
      .expect(201);
    const lead = await prisma.inquiry.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(lead).toMatchObject({ kind: 'company', source: 'configurator', workersNeeded: 3, companyName: 'Spedition Nord GmbH' });
    expect(lead.estimate).toMatchObject({ kind: 'configurator', totals: { netCents: 3 * 450000 + 3 * 90000 }, quoteId: null });
    expect(lead.message).toContain('LKW-Fahrer/in: 3');
    expect(await prisma.quote.count()).toBe(before);
  });

  it('portal request: lead + DRAFT quote for staff; the employer sees the offer only after staff send it', async () => {
    const employer = await asCompany();
    const other = await asCompany();
    const res = await employer.agent
      .post('/api/company/configurator/requests')
      .send({ config: { positions: [{ profession: 'truck_driver', count: 2 }, { profession: 'cook', count: 1 }], services: ['RECRUITMENT', 'ONBOARDING'], months: 2 }, message: 'Start im Frühjahr' })
      .expect(201);
    expect(res.body.quoteId).toBeUndefined();
    const lead = await prisma.inquiry.findUniqueOrThrow({ where: { id: res.body.id } });
    const quoteId = (lead.estimate as { quoteId: string }).quoteId;
    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(quote).toMatchObject({ companyId: employer.company.id, status: 'DRAFT', number: null, netCents: 2 * 450000 + 350000 + 3 * 2 * 15000 });
    const items = quote.items as { catalogueId: string; quantity: number; unitPriceCents: number }[];
    expect(items.map((i) => [i.catalogueId, i.quantity, i.unitPriceCents])).toEqual([
      ['placement-ce', 2, 450000],
      ['placement-skilled', 1, 350000],
      ['integration', 6, 15000],
    ]);
    expect(await prisma.quoteEvent.count({ where: { quoteId, type: 'CREATED' } })).toBe(1);

    // Drafts stay invisible to the employer (list, detail, PDF); the request shows as "in review".
    expect((await employer.agent.get('/api/company/quotes').expect(200)).body.quotes).toEqual([]);
    await employer.agent.get(`/api/company/quotes/${quoteId}`).expect(404);
    await employer.agent.get(`/api/company/quotes/${quoteId}/pdf`).expect(404);
    const mine = (await employer.agent.get('/api/company/configurator/requests').expect(200)).body.items;
    expect(mine).toEqual([expect.objectContaining({ id: lead.id, state: 'IN_REVIEW', quoteId: null, workers: 3 })]);
    expect((await other.agent.get('/api/company/configurator/requests').expect(200)).body.items).toEqual([]);

    // Staff review and send → numbered offer with PDF in the portal.
    const admin = await asAdmin();
    await admin.agent.post(`/api/admin/quotes/${quoteId}/send`).send({}).expect(200);
    const after = (await employer.agent.get('/api/company/configurator/requests').expect(200)).body.items;
    expect(after[0]).toMatchObject({ state: 'OFFER', quoteId });
    expect(after[0].quoteNumber).toMatch(/^TV-AN-/);
    expect((await employer.agent.get('/api/company/quotes').expect(200)).body.quotes.map((q: { id: string }) => q.id)).toEqual([quoteId]);
    await employer.agent.get(`/api/company/quotes/${quoteId}/pdf`).expect(200);
  });

  it('suspended companies cannot use the portal configurator', async () => {
    const employer = await asCompany('SUSPENDED');
    const res = await employer.agent.post('/api/company/configurator/requests').send({ config: { positions: [{ profession: 'cook', count: 1 }], services: ['RECRUITMENT'] } }).expect(403);
    expect(res.body.error).toBe('COMPANY_SUSPENDED');
    await employer.agent.get('/api/company/configurator').expect(403);
    expect(await prisma.quote.count({ where: { companyId: employer.company.id } })).toBe(0);
  });
});
