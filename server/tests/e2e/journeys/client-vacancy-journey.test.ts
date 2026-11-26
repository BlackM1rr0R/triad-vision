import { describe, expect, it } from 'vitest';
import { anon, asAdmin, asClient, asStaff } from '../../helpers/api';
import { prisma, waitFor } from '../../helpers/db';
import { staffNotifications } from '../../helpers/notify';
import { act, adminCase, approveFourEyes, clientCase, expectStatus, reviewAll, uploadDoc, uploadRequired } from '../../helpers/workflow';
import { docProgress, nextStep, notificationsOf, placesOf, portalStage, registerAndVerify } from '../../helpers/journey';
import { seedLabourContractTemplate } from '../../../prisma/seed/labourContractTemplate.js';

/**
 * Journey 1 — a client from the public sign-up to the arrival in Germany, with the vacancy policy ON
 * ("clients can only apply to active vacancies"), walked through the real HTTP API as the real roles:
 *
 *   staff open a vacancy with 2 places → client registers + confirms the e-mail → starts the case from the vacancy →
 *   uploads + hands in the initial documents → staff reject one → client replaces it while in review → staff accept
 *   all → early embassy upload while waiting → Əmək müqaviləsi (Triad Vision signs, client signs, staff approve) →
 *   İş müqaviləsi (same) → embassy documents handed in → staff review → appointment → lodged → visa approved →
 *   visa story / arrival prep → arrival plan → arrival recorded → future letter delivered, arrival certificate.
 *
 * Along the way: next-step card, portal stage, document progress, client notifications (types + links), and the
 * vacancy's free places (full → VACANCY_FULL for others, waitlist notice when a place frees up).
 */

const CC = '/api/admin/case-contracts/cases';
const DAY = 24 * 60 * 60 * 1000;
// A whole journey is one long test (many requests, PDF renders, background work); the e2e default is 30 s.

const signersOf = (requestId: string) => prisma.signatureSigner.findMany({ where: { requestId }, orderBy: { order: 'asc' } });
const caseStatus = async (id: string) => (await prisma.case.findUniqueOrThrow({ where: { id } })).status;

describe('journey: client with the vacancy policy ON, from sign-up to arrival', () => {
  it('walks every step and checks the portal state after each one', async () => {
    const admin = await asAdmin({ firstName: 'Anar', lastName: 'Boss' });
    const staff = await asStaff({ firstName: 'Leyla', lastName: 'Staff' });

    // ── 0. The owner switches the vacancy policy on; staff open a vacancy with 2 places ──────────────────────────
    const policy = expectStatus(await admin.agent.put('/api/admin/vacancies/policy').send({ clientsOnlyActiveVacancies: true }), 200).body.policy;
    expect(policy.clientsOnlyActiveVacancies).toBe(true);
    expect(expectStatus(await anon().get('/api/vacancies/policy'), 200).body.policy.clientsOnlyActiveVacancies).toBe(true);
    const created = expectStatus(
      await staff.agent.post('/api/admin/vacancies').send({
        title: { de: 'LKW-Fahrer CE (m/w/d)', az: 'TIR sürücüsü' },
        description: { de: 'Fernverkehr ab Hamburg' },
        profession: 'LKW-Fahrer',
        city: 'Hamburg',
        germanLevel: 'A2',
        positions: 2,
        publish: true,
      }),
      201,
    ).body.vacancy as { id: string; slug: string; status: string };
    expect(created.status).toBe('OPEN');
    expect(await placesOf(created.slug)).toEqual({ positions: 2, filled: 0, free: 2 });

    // ── 1. Sign-up through the public form, e-mail confirmed ─────────────────────────────────────────────────────
    const { user, agent: client } = await registerAndVerify({ firstName: 'Rauf', lastName: 'Həsənov', locale: 'az' });
    let ns = await nextStep(client);
    expect(ns.body.case).toBeNull();
    expect(ns.body.primary).toMatchObject({ kind: 'START_CASE', to: '/account#start' });
    expect(await portalStage(client)).toMatchObject({ stage: 'EXPLORING', phase: 'LEAD', arrived: false });

    // ── 2. The case can only be started from the vacancy ──────────────────────────────────────────────────────────
    const noVacancy = await client.post('/api/cases').send({ visaType: 'WORK', profession: 'Sürücü' });
    expect(noVacancy.status).toBe(400);
    expect(noVacancy.body.error).toBe('VACANCY_REQUIRED');
    const kase = expectStatus(await client.post('/api/cases').send({ vacancyId: created.id, visaType: 'TOURIST' }), 201).body.case as { id: string; number: string };
    expect(kase).toMatchObject({ vacancyId: created.id, visaType: 'WORK', profession: 'LKW-Fahrer' });
    const caseId = kase.id;
    // A case before the contract does not take a place.
    expect((await placesOf(created.slug)).free).toBe(2);
    const caseCreated = await waitFor(() => prisma.notification.findFirst({ where: { userId: user.id, type: 'CASE_CREATED' } }));
    expect(caseCreated.link).toBe(`/account/cases/${caseId}`);

    ns = await nextStep(client);
    expect(ns.body.case).toMatchObject({ id: caseId, status: 'DOCUMENTS_PENDING' });
    expect(ns.body.primary).toMatchObject({ kind: 'UPLOAD_DOCS', to: `/account/cases/${caseId}?tab=docs#docs-initial` });
    expect(await portalStage(client)).toMatchObject({ stage: 'APPLYING', phase: 'PREPARING' });
    let progress = await docProgress(client, caseId);
    expect(progress.status).toBe('DOCUMENTS_PENDING');
    expect(progress.steps[0]).toMatchObject({ key: 'documents', state: 'current' });
    expect(progress.documents.find((d) => d.stage === 'INITIAL')).toMatchObject({ uploadOpen: true });
    const percentAtStart = progress.percent ?? 0;

    // ── 3. Initial documents uploaded and handed in ───────────────────────────────────────────────────────────────
    await uploadRequired(client, caseId, 'INITIAL');
    ns = await nextStep(client);
    expect(ns.body.primary).toMatchObject({ kind: 'SUBMIT_DOCS' });
    expectStatus(await client.post(`/api/cases/${caseId}/submit`), 200);
    expect(await caseStatus(caseId)).toBe('DOCUMENTS_REVIEW');
    ns = await nextStep(client);
    expect(ns.kinds).not.toContain('UPLOAD_DOCS');
    expect(ns.kinds).not.toContain('SUBMIT_DOCS');
    expect(ns.body.waiting).toMatchObject({ side: 'TEAM' });
    progress = await docProgress(client, caseId);
    expect(progress.status).toBe('DOCUMENTS_REVIEW');
    expect(progress.percent ?? 0).toBeGreaterThan(percentAtStart);
    // Embassy documents are a preview only (the client does not wait for the contract yet).
    expect(await prisma.documentRequirement.count({ where: { caseId, stage: 'EMBASSY' } })).toBe(0);

    // ── 4. Staff reject one document; the client replaces it while the case stays in review ─────────────────────
    const firstReq = (await adminCase(staff.agent, caseId)).requirements.find((r) => r.stage === 'INITIAL' && r.required)!;
    const rejectedId = firstReq.documents[0].id;
    expectStatus(await staff.agent.post(`/api/admin/cases/${caseId}/documents/${rejectedId}/review`).send({ status: 'REJECTED', note: 'Surət oxunmur' }), 200);
    const rejectedNote = await waitFor(() => prisma.notification.findFirst({ where: { userId: user.id, type: 'DOCUMENT_REJECTED' } }));
    expect(rejectedNote.link).toBe(`/account/cases/${caseId}?tab=docs`);
    ns = await nextStep(client);
    expect(ns.body.primary).toMatchObject({ kind: 'FIX_DOCS', to: `/account/cases/${caseId}?tab=docs#docs-initial`, count: 1 });
    expect(ns.body.waiting).toBeNull();
    expect((await docProgress(client, caseId)).documents.find((d) => d.stage === 'INITIAL')!.counts.rejected).toBe(1);

    const replaced = expectStatus(await uploadDoc(client, caseId, firstReq.id, 'pasport-yeni.pdf'), 201).body.document;
    expect(replaced).toMatchObject({ status: 'PENDING', stage: 'INITIAL', requirementId: firstReq.id });
    expect(await caseStatus(caseId)).toBe('DOCUMENTS_REVIEW');
    expect((await nextStep(client)).kinds).not.toContain('FIX_DOCS');
    expect((await staffNotifications(admin.user.id)).map((n) => n.title)).toContain(`${kase.number}: rədd edilmiş sənəd yenidən yükləndi`);
    // The rejected file stays in the client's history with its reason.
    const history = (await clientCase(client, caseId)).requirements.find((r) => r.id === firstReq.id)!.documents as { id: string; status: string; reviewNote?: string | null }[];
    expect(history.find((d) => d.id === rejectedId)).toMatchObject({ status: 'REJECTED', reviewNote: 'Surət oxunmur' });

    // ── 5. Staff accept everything: the embassy list opens early (the client now waits for the contract) ─────────
    await reviewAll(staff.agent, caseId, 'INITIAL');
    const initialCounts = (await docProgress(client, caseId)).documents.find((d) => d.stage === 'INITIAL')!.counts;
    expect(initialCounts.requiredAccepted).toBe(initialCounts.required);
    expect(initialCounts.rejected).toBe(0);
    const embassyRows = await prisma.documentRequirement.count({ where: { caseId, stage: 'EMBASSY' } });
    expect(embassyRows).toBeGreaterThan(0);
    progress = await docProgress(client, caseId);
    expect(progress.embassyCollection).toMatchObject({ uploadOpen: true, preview: false });
    const embassyReqs = (await clientCase(client, caseId)).requirements.filter((r) => r.stage === 'EMBASSY' && r.required);
    const early = expectStatus(await uploadDoc(client, caseId, embassyReqs[0].id, 'krankenversicherung.pdf'), 201).body.document;
    expect(early).toMatchObject({ stage: 'EMBASSY', status: 'PENDING' });
    expect((await staffNotifications(admin.user.id)).some((n) => n.title === `${kase.number}: səfirlik sənədi erkən yükləndi`)).toBe(true);
    expectStatus(await staff.agent.post(`/api/admin/cases/${caseId}/documents/${early.id}/review`).send({ status: 'ACCEPTED' }), 200);
    // Handing in the embassy documents is not open yet.
    expect((await client.post(`/api/cases/${caseId}/submit`)).status).toBe(409);

    // ── 6. Əmək müqaviləsi: Triad Vision signs first, then the client, then staff approve ────────────────────────
    await seedLabourContractTemplate(prisma);
    const labourTpl = await prisma.contractTemplate.findFirstOrThrow({ where: { kind: 'LABOUR' } });
    const workTpl = await prisma.contractTemplate.create({ data: { name: 'İş müqaviləsi', kind: 'WORK', language: 'de', body: '# Arbeitsvertrag\nArbeitnehmer/in: {{client.fullName}}, Beginn {{startDate}}.', active: true } });
    const before = expectStatus(await staff.agent.get(`${CC}/${caseId}`), 200).body.steps;
    expect(before.map((s: { step: string; state: string; blockedReason: string | null }) => [s.step, s.state, s.blockedReason])).toEqual([
      ['LABOUR', 'NOT_SENT', null],
      ['WORK', 'NOT_SENT', 'LABOUR_NOT_APPROVED'],
    ]);
    const labour = expectStatus(await staff.agent.post(`${CC}/${caseId}/send`).send({ step: 'LABOUR', templateId: labourTpl.id, inputs: { salary: '1.000 €' } }), 201).body;
    expect(labour.caseContract).toBe(true);
    expect(await caseStatus(caseId)).toBe('CONTRACT_SENT');
    const [, labourClient] = await signersOf(labour.signatureRequestId);
    expect(labourClient.invitedAt).toBeNull();
    let portalSteps = expectStatus(await client.get(`/api/account/case-contracts/cases/${caseId}`), 200).body.steps;
    expect(portalSteps.map((s: { state: string; myTurn: boolean }) => [s.state, s.myTurn])).toEqual([
      ['TRIAD_TO_SIGN', false],
      ['NOT_SENT', false],
    ]);
    expect(expectStatus(await client.post(`/api/signatures/my/${labourClient.id}/sign`).send({ mode: 'TYPE', typedName: 'Rauf Həsənov', agree: true }), 409).body.error).toBe('NOT_YOUR_TURN');
    // Early embassy uploads stay open while the contract is out.
    expect((await docProgress(client, caseId)).embassyCollection).toMatchObject({ uploadOpen: true });

    expectStatus(await staff.agent.post(`${CC}/${caseId}/triad-sign`).send({ step: 'LABOUR', mode: 'TYPE', typedName: 'Leyla Staff', agree: true }), 200);
    const invite = await waitFor(() => prisma.notification.findFirst({ where: { userId: user.id, type: 'SIGNATURE_REQUEST' } }));
    expect(invite.link).toBe(`/account/signatures/${labourClient.id}`);
    portalSteps = expectStatus(await client.get(`/api/account/case-contracts/cases/${caseId}`), 200).body.steps;
    expect(portalSteps[0]).toMatchObject({ state: 'CLIENT_TO_SIGN', myTurn: true, signerId: labourClient.id });
    ns = await nextStep(client);
    expect(ns.body.primary).toMatchObject({ kind: 'SIGN_CONTRACT', to: `/account/cases/${caseId}?tab=docs#contract` });

    expectStatus(await client.post(`/api/signatures/my/${labourClient.id}/sign`).send({ mode: 'TYPE', typedName: 'Rauf Həsənov', agree: true }), 200);
    await waitFor(async () => ((await caseStatus(caseId)) === 'CONTRACT_SIGNED' ? true : null));
    // Contract signed: the client takes one of the two places.
    expect(await placesOf(created.slug)).toEqual({ positions: 2, filled: 1, free: 1 });
    expect((await nextStep(client)).body.waiting).toMatchObject({ side: 'TEAM' });

    const approved1 = expectStatus(await staff.agent.post(`${CC}/${caseId}/approve`).send({ step: 'LABOUR' }), 200).body.steps;
    expect(approved1.map((s: { state: string }) => s.state)).toEqual(['APPROVED', 'NOT_SENT']);
    expect(await caseStatus(caseId)).toBe('EMBASSY_DOCUMENTS');
    const labourOk = await waitFor(() => prisma.notification.findFirst({ where: { userId: user.id, type: 'CASE_CONTRACT_APPROVED' } }));
    expect(labourOk.link).toBe(`/account/cases/${caseId}#contract`);
    await waitFor(() => prisma.notification.findFirst({ where: { userId: user.id, type: 'EMBASSY_DOCS_REQUESTED' } }));
    // The embassy list is the one created early (no second set); the accepted early document stays.
    expect(await prisma.documentRequirement.count({ where: { caseId, stage: 'EMBASSY' } })).toBe(embassyRows);
    expect((await adminCase(staff.agent, caseId)).requirements.find((r) => r.id === embassyReqs[0].id)!.documents.map((d) => d.status)).toEqual(['ACCEPTED']);

    // ── 7. The vacancy fills up: others are refused; a waitlist entry hears when a place frees up ────────────────
    // A second worker was placed outside the system (staff correction): no free place left.
    expectStatus(await staff.agent.patch(`/api/admin/vacancies/${created.id}`).send({ filledAdjustment: 1 }), 200);
    expect(await placesOf(created.slug)).toEqual({ positions: 2, filled: 2, free: 0 });
    const other = await asClient({ firstName: 'Orxan', lastName: 'Quliyev' });
    const full = await other.agent.post('/api/cases').send({ vacancyId: created.id });
    expect(full.status).toBe(409);
    expect(full.body.error).toBe('VACANCY_FULL');
    expect((await other.agent.post(`/api/vacancies/${created.slug}/apply`).send({})).body.error).toBe('VACANCY_FULL');
    expect(await prisma.case.count({ where: { clientId: other.user.id } })).toBe(0);
    // Still listed on the board (full ones last), never hidden.
    expect(expectStatus(await anon().get('/api/vacancies'), 200).body.items.map((v: { slug: string }) => v.slug)).toContain(created.slug);
    expectStatus(await other.agent.post('/api/job-alerts/waitlist').send({ profession: 'truck_driver', city: 'Hamburg' }), 201);
    expect(await prisma.notification.count({ where: { userId: other.user.id, type: 'VACANCY_WAITLIST' } })).toBe(0);
    // The correction is undone: one place is free again → the waitlist is told (in-app link to the vacancy).
    expectStatus(await admin.agent.patch(`/api/admin/vacancies/${created.id}`).send({ filledAdjustment: 0 }), 200);
    expect(await placesOf(created.slug)).toEqual({ positions: 2, filled: 1, free: 1 });
    const waitNotice = await waitFor(() => prisma.notification.findFirst({ where: { userId: other.user.id, type: 'VACANCY_WAITLIST' } }));
    expect(waitNotice.link).toBe(`/jobs/${created.slug}`);

    // ── 8. No second contract: the İş müqaviləsi is retired (German documents go out from the drive workflow) ─────
    expect(expectStatus(await staff.agent.post(`${CC}/${caseId}/send`).send({ step: 'WORK', templateId: workTpl.id, inputs: { startDate: '2027-03-01' } }), 409).body.error).toBe('WORK_CONTRACT_RETIRED');
    expect(await caseStatus(caseId)).toBe('EMBASSY_DOCUMENTS');
    portalSteps = expectStatus(await client.get(`/api/account/case-contracts/cases/${caseId}`), 200).body.steps;
    expect(portalSteps.map((s: { state: string }) => s.state)).toEqual(['APPROVED', 'NOT_SENT']);
    expect(await prisma.notification.count({ where: { userId: user.id, type: 'CASE_CONTRACT_APPROVED' } })).toBe(1);
    expect((await nextStep(client)).kinds).not.toContain('SIGN_DOCUMENTS');

    // ── 9. Embassy documents handed in (the early one is already accepted), staff review ─────────────────────────
    for (const r of (await clientCase(client, caseId)).requirements.filter((q) => q.stage === 'EMBASSY' && q.required && q.documents.length === 0)) {
      expectStatus(await uploadDoc(client, caseId, r.id, 'embassy.pdf'), 201);
    }
    expect((await nextStep(client)).body.primary).toMatchObject({ kind: 'SUBMIT_DOCS', to: `/account/cases/${caseId}?tab=docs#docs-embassy` });
    expectStatus(await client.post(`/api/cases/${caseId}/submit`), 200);
    expect(await caseStatus(caseId)).toBe('EMBASSY_REVIEW');
    expect((await nextStep(client)).body.waiting).toMatchObject({ side: 'TEAM' });
    await reviewAll(staff.agent, caseId, 'EMBASSY');

    // ── 10. Appointment, lodged, decision ─────────────────────────────────────────────────────────────────────────
    const appointmentAt = new Date(Date.now() + 7 * DAY);
    expectStatus(await act(staff.agent, caseId, { action: 'SCHEDULE_APPOINTMENT', at: appointmentAt.toISOString(), place: 'Embassy Baku' }), 200);
    expect(await caseStatus(caseId)).toBe('APPOINTMENT_SCHEDULED');
    await waitFor(() => prisma.notification.findFirst({ where: { userId: user.id, type: 'APPOINTMENT_SCHEDULED' } }));
    ns = await nextStep(client);
    expect(ns.body.primary).toMatchObject({ kind: 'ATTEND_APPOINTMENT', to: `/account/cases/${caseId}#appointment`, detail: 'Embassy Baku' });
    expect(ns.kinds).toContain('PREP_INTERVIEW'); // appointment within the next weeks → interview practice
    await approveFourEyes(caseId);
    expectStatus(await act(staff.agent, caseId, { action: 'MARK_LODGED' }), 200);
    expect(await caseStatus(caseId)).toBe('DECISION_PENDING');
    ns = await nextStep(client);
    expect(ns.body.waiting).toMatchObject({ side: 'EMBASSY' });
    expect(ns.body.milestone?.key).toBe('DECISION');
    expectStatus(await act(staff.agent, caseId, { action: 'DECIDE', decision: 'APPROVED' }), 200);
    expect(await caseStatus(caseId)).toBe('APPROVED');
    expect((await waitFor(() => prisma.notification.findFirst({ where: { userId: user.id, type: 'APPROVED' } }))).link).toBe(`/account/cases/${caseId}`);
    // Still one place taken (approved cases keep it).
    expect((await placesOf(created.slug)).filled).toBe(1);

    // ── 11. Visa story and arrival preparation ────────────────────────────────────────────────────────────────────
    const story = expectStatus(await client.get(`/api/account/visa-story/${caseId}`), 200).body;
    expect(story).toMatchObject({ caseId, firstName: 'Rauf' });
    expect(story.documents.uploaded).toBeGreaterThan(initialCounts.required); // + the replaced scan, embassy and contract files
    expect(story.documents.approved).toBeLessThan(story.documents.uploaded); // the rejected scan counts as uploaded only
    expect(await portalStage(client)).toMatchObject({ stage: 'DEPARTURE', phase: 'TRAVEL', arrived: false });
    ns = await nextStep(client);
    expect(ns.body.progress).toBe(100);
    expect(ns.body.primary).toMatchObject({ kind: 'ARRIVAL_PLAN', to: '/account/arrival' });
    const prep = expectStatus(await client.get(`/api/account/plus/arrival-prep?case=${caseId}`), 200).body;
    expect(prep.case).toMatchObject({ id: caseId });
    expect(prep.before.map((t: { key: string }) => t.key)).toEqual(['flight', 'housing', 'firstDay']);

    // A letter to the future self, written before the arrival (sealed; delivered on arrival).
    const letter = expectStatus(await client.put('/api/account/future-letter').send({ body: 'Salam, gələcək Rauf! Almaniyaya xoş gəldin.' }), 200).body;
    expect(letter.letter).toMatchObject({ delivered: false, body: 'Salam, gələcək Rauf! Almaniyaya xoş gəldin.' });
    expect(letter.arrived).toBe(false);
    expect(expectStatus(await client.get('/api/account/arrival-certificate'), 200).body.items).toHaveLength(0);

    // ── 12. Arrival plan → staff confirm → arrival recorded ───────────────────────────────────────────────────────
    expect((await client.get('/api/arrival').expect(200)).body.items[0]).toMatchObject({ caseId, status: 'DRAFT', editable: true });
    const arrivalTime = new Date(Date.now() + 10 * DAY).toISOString();
    expectStatus(await client.patch(`/api/arrival/${caseId}`).send({ arrivalTime, arrivalAirport: 'HAM', departureAirport: 'GYD', flightNumber: 'j2 123', travellers: 1 }), 200);
    expectStatus(await client.post(`/api/arrival/${caseId}/submit`), 200);
    await waitFor(() => prisma.notification.findFirst({ where: { userId: admin.user.id, type: 'ARRIVAL_SUBMITTED' } }));
    ns = await nextStep(client);
    expect(ns.kinds).not.toContain('ARRIVAL_PLAN');
    expect(ns.kinds).toContain('ARRIVAL_PREP');
    expectStatus(await staff.agent.patch(`/api/admin/arrivals/${caseId}`).send({ status: 'CONFIRMED' }), 200);
    await waitFor(() => prisma.notification.findFirst({ where: { userId: user.id, type: 'ARRIVAL_CONFIRMED' } }));
    expectStatus(await staff.agent.patch(`/api/admin/arrivals/${caseId}`).send({ status: 'COMPLETED' }), 200);
    const welcome = await waitFor(() => prisma.notification.findFirst({ where: { userId: user.id, type: 'ARRIVAL_COMPLETED' } }));
    expect(welcome.link).toBe('/account/onboarding');
    expect(await portalStage(client)).toMatchObject({ stage: 'IN_GERMANY', phase: 'IN_GERMANY', arrived: true });
    expect((await nextStep(client)).body.arrived).toBe(true);

    // ── 13. Future letter delivered, arrival certificate issued ───────────────────────────────────────────────────
    const delivered = expectStatus(await client.get('/api/account/future-letter'), 200).body;
    expect(delivered.arrived).toBe(true);
    expect(delivered.letter).toMatchObject({ delivered: true, deliveredVia: 'ARRIVAL' });
    const letterNote = await waitFor(() => prisma.notification.findFirst({ where: { userId: user.id, type: 'FUTURE_LETTER' } }));
    expect(letterNote.link).toBe('/account/future-letter');
    expect(letterNote.body).not.toContain('gələcək Rauf'); // the in-app notification never carries the letter text
    // Once delivered the letter is final.
    expect(expectStatus(await client.put('/api/account/future-letter').send({ body: 'edit' }), 409).body.error).toBe('LETTER_DELIVERED');
    const certs = expectStatus(await client.get('/api/account/arrival-certificate'), 200).body.items;
    expect(certs).toHaveLength(1);
    expect(certs[0]).toMatchObject({ caseId, caseNumber: kase.number, city: 'Hamburg', profession: 'LKW-Fahrer', revoked: false });
    expect(certs[0].number).toMatch(/^ARR-\d{4}-[A-Z2-9]{6}$/);

    // ── The whole story in notifications: types (oldest first) and no duplicates of the one-off ones ─────────────
    const types = (await prisma.notification.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })).map((n) => n.type);
    for (const t of ['CASE_CREATED', 'DOCUMENT_REJECTED', 'SIGNATURE_REQUEST', 'CASE_CONTRACT_APPROVED', 'EMBASSY_DOCS_REQUESTED', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING', 'APPROVED', 'ARRIVAL_CONFIRMED', 'ARRIVAL_COMPLETED', 'FUTURE_LETTER']) {
      expect(types, t).toContain(t);
    }
    for (const t of ['CASE_CREATED', 'APPROVED', 'ARRIVAL_COMPLETED', 'FUTURE_LETTER']) expect(types.filter((x) => x === t), t).toHaveLength(1);
    expect(types.indexOf('CASE_CREATED')).toBeLessThan(types.indexOf('DOCUMENT_REJECTED'));
    expect(types.indexOf('APPROVED')).toBeLessThan(types.indexOf('ARRIVAL_COMPLETED'));
    expect(await notificationsOf(user.id, 'SIGNATURE_REQUEST')).toHaveLength(2); // Əmək + İş müqaviləsi
    // The other client never heard about Rauf's case.
    expect(await prisma.notification.count({ where: { userId: other.user.id, caseId } })).toBe(0);
  }, 180_000);

  // While the Əmək müqaviləsi waits for the Triad Vision signature (portal state TRIAD_TO_SIGN, the client's sign call
  // answers 409 NOT_YOUR_TURN) the client has nothing to do: the ball is with the team (lib/caseContracts/turn.ts).
  it('next step while Triad Vision has not signed the Əmək müqaviləsi yet: no "sign" card for the client', async () => {
    const staff = await asStaff();
    const client = await asClient();
    const c = await prisma.case.create({ data: { clientId: client.user.id, number: `TV-J1-${Date.now().toString(36)}`, profession: 'LKW-Fahrer', status: 'DOCUMENTS_REVIEW' } });
    await seedLabourContractTemplate(prisma);
    const tpl = await prisma.contractTemplate.findFirstOrThrow({ where: { kind: 'LABOUR' } });
    expectStatus(await staff.agent.post(`${CC}/${c.id}/send`).send({ step: 'LABOUR', templateId: tpl.id, inputs: {} }), 201);
    expect(expectStatus(await client.agent.get(`/api/account/case-contracts/cases/${c.id}`), 200).body.steps[0].state).toBe('TRIAD_TO_SIGN');
    const ns = await nextStep(client.agent);
    expect(ns.kinds).not.toContain('SIGN_CONTRACT');
    expect(ns.body.waiting).toMatchObject({ side: 'TEAM' });
  });
});
