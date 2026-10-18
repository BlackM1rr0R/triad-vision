import type { CaseStatus, Locale } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { clientNotificationTypes, expectClientNotified, staffNotifications } from '../helpers/notify';
import {
  act,
  adminCase,
  clientCase,
  createCaseVia,
  driveCaseTo,
  expectStatus,
  reviewAll,
  sendContract,
  signContract,
  uploadDoc,
  uploadRequired,
} from '../helpers/workflow';

const status = async (agent: Agent, id: string) => (await clientCase(agent, id)).status;
const schedule = (at = '2026-11-20T09:30:00+04:00', place = 'Almaniya Səfirliyi, Nizami küç. 15, Bakı') => ({
  action: 'SCHEDULE_APPOINTMENT',
  at,
  place,
});

describe('full journey (client in German)', () => {
  it('DOCUMENTS_PENDING → … → REJECTED → REOPEN → APPROVED with a localized notification and email at every client-facing step', async () => {
    const client = await asClient({ firstName: 'Əli', lastName: 'Məmmədov', locale: 'de' });
    const admin = await asAdmin();
    const user = client.user;

    // 1. create
    const c = await createCaseVia(client.agent);
    const id = c.id;
    expect(await status(client.agent, id)).toBe('DOCUMENTS_PENDING');
    await expectClientNotified(user, 'CASE_CREATED', `Ihr Antrag wurde erstellt (${c.number})`);

    // 2. upload + submit
    expect((await client.agent.post(`/api/cases/${id}/submit`)).body.error).toBe('REQUIRED_DOCUMENTS_MISSING');
    await uploadRequired(client.agent, id, 'INITIAL');
    expectStatus(await client.agent.post(`/api/cases/${id}/submit`), 200);
    expect(await status(client.agent, id)).toBe('DOCUMENTS_REVIEW');
    expect((await staffNotifications(admin.user.id)).at(-1)!.title).toBe(`${c.number}: sənədlər yoxlamaya göndərildi`);

    // 3. staff rejects a document and requests changes
    let detail = await adminCase(admin.agent, id);
    const passportReq = detail.requirements.find((r) => r.stage === 'INITIAL' && r.required)!;
    const passportDoc = passportReq.documents[0];
    expectStatus(await admin.agent.post(`/api/admin/cases/${id}/documents/${passportDoc.id}/review`).send({ status: 'REJECTED', note: 'Unscharf' }), 200);
    let res = expectStatus(await act(admin.agent, id, { action: 'REQUEST_CHANGES', note: 'Bitte Reisepass neu hochladen' }), 200);
    expect(res.body.case.status).toBe('DOCUMENTS_PENDING');
    await expectClientNotified(user, 'DOCS_CHANGES_REQUESTED', 'Korrekturen an Ihren Dokumenten erforderlich', {
      bodyContains: 'Hinweis: Bitte Reisepass neu hochladen',
    });
    expect((await clientCase(client.agent, id)).staffNote).toBe('Bitte Reisepass neu hochladen');

    // 4. client re-uploads and resubmits
    expect((await client.agent.post(`/api/cases/${id}/submit`)).status).toBe(400);
    expectStatus(await uploadDoc(client.agent, id, passportReq.id, 'reisepass-neu.pdf'), 201);
    expectStatus(await client.agent.post(`/api/cases/${id}/submit`), 200);
    detail = await clientCase(client.agent, id);
    expect(detail.status).toBe('DOCUMENTS_REVIEW');
    expect(detail.staffNote).toBeNull();

    // 5. contract blocked until accepted, then sent
    expect((await sendContract(admin.agent, id)).body.error).toBe('REQUIRED_DOCUMENTS_NOT_ACCEPTED');
    await reviewAll(admin.agent, id, 'INITIAL');
    expectStatus(await sendContract(admin.agent, id), 201);
    expect(await status(client.agent, id)).toBe('CONTRACT_SENT');
    await expectClientNotified(user, 'CONTRACT_SENT', 'Vertrag zur Unterschrift bereit');

    // 6. sign → staff rejects signature → sign again → confirmed
    expectStatus(await signContract(client.agent, id), 200);
    expect(await status(client.agent, id)).toBe('CONTRACT_SIGNED');
    expect((await staffNotifications(admin.user.id)).at(-1)!.title).toBe(`${c.number}: müqavilə imzalandı`);
    res = expectStatus(await act(admin.agent, id, { action: 'REJECT_SIGNATURE', note: 'Unterschrift passt nicht' }), 200);
    expect(res.body.case.status).toBe('CONTRACT_SENT');
    expect(res.body.case.contract.signedAt).toBeNull();
    await expectClientNotified(user, 'CONTRACT_RESIGN_REQUESTED', 'Bitte unterschreiben Sie den Vertrag erneut', {
      bodyContains: 'Unterschrift passt nicht',
    });
    expectStatus(await signContract(client.agent, id), 200);
    res = expectStatus(await act(admin.agent, id, { action: 'CONFIRM_CONTRACT' }), 200);
    expect(res.body.case.status).toBe('EMBASSY_DOCUMENTS');
    expect(res.body.case.requirements.filter((r: { stage: string }) => r.stage === 'EMBASSY')).toHaveLength(7);
    await expectClientNotified(user, 'EMBASSY_DOCS_REQUESTED', 'Dokumente für die Botschaft');

    // 7. embassy documents, one round of changes
    await uploadRequired(client.agent, id, 'EMBASSY');
    expectStatus(await client.agent.post(`/api/cases/${id}/submit`), 200);
    expect(await status(client.agent, id)).toBe('EMBASSY_REVIEW');
    expectStatus(await act(admin.agent, id, { action: 'REQUEST_CHANGES', note: 'Versicherung fehlt Seite 2' }), 200);
    expect(await status(client.agent, id)).toBe('EMBASSY_DOCUMENTS');
    await expectClientNotified(user, 'EMBASSY_CHANGES_REQUESTED', 'Korrekturen an den Botschaftsunterlagen erforderlich', {
      bodyContains: 'Versicherung fehlt Seite 2',
    });
    expectStatus(await client.agent.post(`/api/cases/${id}/submit`), 200);

    // 8. appointment (blocked until accepted), rescheduled, lodged
    expect((await act(admin.agent, id, schedule())).body.error).toBe('REQUIRED_DOCUMENTS_NOT_ACCEPTED');
    await reviewAll(admin.agent, id, 'EMBASSY');
    res = expectStatus(await act(admin.agent, id, schedule()), 200);
    expect(res.body.case).toMatchObject({ status: 'APPOINTMENT_SCHEDULED', appointmentPlace: 'Almaniya Səfirliyi, Nizami küç. 15, Bakı' });
    expect(new Date(res.body.case.appointmentAt).toISOString()).toBe('2026-11-20T05:30:00.000Z');
    const appt = await expectClientNotified(user, 'APPOINTMENT_SCHEDULED', 'Botschaftstermin vereinbart', { bodyContains: 'Ort: Almaniya Səfirliyi' });
    expect(appt.body).toContain('20. November 2026');
    expect(appt.body).toContain('09:30');
    res = expectStatus(await act(admin.agent, id, { ...schedule('2026-11-21T10:00:00+04:00', 'Embassy Baku'), note: 'Neuer Termin' }), 200);
    expect(res.body.case.appointmentPlace).toBe('Embassy Baku');
    expect(res.body.case.events.some((e: { type: string }) => e.type === 'APPOINTMENT_RESCHEDULED')).toBe(true);

    expect((await act(admin.agent, id, { action: 'DECIDE', decision: 'APPROVED' })).status).toBe(409);
    expectStatus(await act(admin.agent, id, { action: 'MARK_LODGED' }), 200);
    expect(await status(client.agent, id)).toBe('DECISION_PENDING');
    await expectClientNotified(user, 'DECISION_PENDING', 'Antrag bei der Botschaft eingereicht');

    // 9. refused, then reopened at the embassy step
    const noReason = await act(admin.agent, id, { action: 'DECIDE', decision: 'REJECTED' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error).toBe('REASON_REQUIRED');
    res = expectStatus(await act(admin.agent, id, { action: 'DECIDE', decision: 'REJECTED', reason: 'Finanzierungsnachweis fehlt' }), 200);
    expect(res.body.case).toMatchObject({ status: 'REJECTED', decisionReason: 'Finanzierungsnachweis fehlt' });
    await expectClientNotified(user, 'REJECTED', 'Visumentscheidung: Ablehnung', { bodyContains: 'Grund: Finanzierungsnachweis fehlt' });

    res = expectStatus(await act(admin.agent, id, { action: 'REOPEN', to: 'EMBASSY_DOCUMENTS', note: 'Neuer Antrag' }), 200);
    expect(res.body.case).toMatchObject({ status: 'EMBASSY_DOCUMENTS', decisionReason: null, decisionAt: null });
    expect(res.body.case.requirements.filter((r: { stage: string }) => r.stage === 'EMBASSY')).toHaveLength(7);
    await expectClientNotified(user, 'REOPENED', 'Antrag wieder geöffnet', { bodyContains: 'Neuer Antrag' });

    // 10. second attempt approved
    expectStatus(await client.agent.post(`/api/cases/${id}/submit`), 200);
    expectStatus(await act(admin.agent, id, schedule('2026-12-10T09:00:00+04:00')), 200);
    expectStatus(await act(admin.agent, id, { action: 'MARK_LODGED' }), 200);
    res = expectStatus(
      await act(admin.agent, id, { action: 'DECIDE', decision: 'APPROVED', validFrom: '2027-01-01', validTo: '2027-06-30' }),
      200,
    );
    expect(res.body.case.status).toBe('APPROVED');
    expect(res.body.case.visaValidFrom).toBe('2027-01-01T00:00:00.000Z');
    expect(res.body.case.visaValidTo).toBe('2027-06-30T00:00:00.000Z');
    await expectClientNotified(user, 'APPROVED', 'Herzlichen Glückwunsch! Ihr Visum wurde erteilt');

    // 11. messages after the decision
    expectStatus(await admin.agent.post(`/api/admin/cases/${id}/messages`).send({ body: 'Glückwunsch!' }), 201);
    await expectClientNotified(user, 'NEW_MESSAGE', 'Neue Nachricht');
    expectStatus(await client.agent.post(`/api/cases/${id}/messages`).send({ body: 'Danke!' }), 201);

    // every client-facing step, in order (the satisfaction survey is sent once, in the background, after the first final status)
    const types = await clientNotificationTypes(user.id);
    expect(types.filter((t) => t === 'SURVEY')).toHaveLength(1);
    expect(types.filter((t) => t !== 'SURVEY')).toEqual([
      'CASE_CREATED',
      'DOCUMENT_REJECTED',
      'DOCS_CHANGES_REQUESTED',
      ...Array(4).fill('DOCUMENT_ACCEPTED'),
      'CONTRACT_SENT',
      'CONTRACT_RESIGN_REQUESTED',
      'EMBASSY_DOCS_REQUESTED',
      'EMBASSY_CHANGES_REQUESTED',
      ...Array(4).fill('DOCUMENT_ACCEPTED'),
      'APPOINTMENT_SCHEDULED',
      'APPOINTMENT_SCHEDULED',
      'DECISION_PENDING',
      'REJECTED',
      'REOPENED',
      'APPOINTMENT_SCHEDULED',
      'DECISION_PENDING',
      'APPROVED',
      'NEW_MESSAGE',
    ]);
    // all client notifications are in German
    const titles = (await prisma.notification.findMany({ where: { userId: user.id } })).map((n) => n.title);
    expect(titles).toContain('Dokument akzeptiert');
    // one email per non-document notification
    const emails = await prisma.emailLog.count({ where: { to: user.email } });
    expect(emails).toBe(titles.length - 9);

    // the client's history shows only client-visible events; the final case frees the client to apply again
    detail = await clientCase(client.agent, id);
    expect((detail.events as { visibleToClient: boolean }[]).every((e) => e.visibleToClient)).toBe(true);
    expect((detail.messages as unknown[]).length).toBe(2);
    expect((await client.agent.post('/api/cases').send({ profession: 'Second job' })).status).toBe(201);
  });
});

describe('notifications use the client’s language', () => {
  const expected: Record<Locale, string> = {
    az: 'Müraciət ləğv edildi',
    de: 'Antrag storniert',
    en: 'Application cancelled',
    ru: 'Заявка отменена',
  };
  it.each(Object.keys(expected) as Locale[])('%s', async (locale) => {
    const client = await asClient({ locale });
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    expectStatus(await act(admin.agent, c.id, { action: 'CANCEL', reason: 'Withdrawn by client' }), 200);
    await expectClientNotified(client.user, 'CANCELLED', expected[locale], { bodyContains: 'Withdrawn by client' });
  });
});

describe('invalid transitions', () => {
  const ACTIONS: Record<string, Record<string, unknown>> = {
    REQUEST_CHANGES: { action: 'REQUEST_CHANGES', note: 'Please fix' },
    REJECT_SIGNATURE: { action: 'REJECT_SIGNATURE', note: 'Mismatch' },
    CONFIRM_CONTRACT: { action: 'CONFIRM_CONTRACT' },
    SCHEDULE_APPOINTMENT: schedule(),
    MARK_LODGED: { action: 'MARK_LODGED' },
    DECIDE: { action: 'DECIDE', decision: 'APPROVED' },
    CANCEL: { action: 'CANCEL', reason: 'Withdrawn' },
    REOPEN: { action: 'REOPEN', to: 'DOCUMENTS_PENDING' },
  };
  const allowed: Partial<Record<CaseStatus, string[]>> = {
    DOCUMENTS_PENDING: ['CANCEL'],
    CONTRACT_SENT: ['CANCEL'],
    EMBASSY_DOCUMENTS: ['CANCEL'],
    DECISION_PENDING: ['DECIDE', 'CANCEL'],
    APPROVED: [],
  };

  for (const [from, ok] of Object.entries(allowed) as [CaseStatus, string[]][]) {
    it(`from ${from} every other action is 409 and leaves the case unchanged`, async () => {
      const client = await asClient();
      const admin = await asAdmin();
      const c = await driveCaseTo(from, { client: client.agent, admin: admin.agent });
      const events = await prisma.caseEvent.count({ where: { caseId: c.id } });
      for (const [name, body] of Object.entries(ACTIONS)) {
        if (ok.includes(name)) continue;
        const res = await act(admin.agent, c.id, body);
        expect(res.status, `${name} from ${from}`).toBe(409);
        expect(res.body.error).toBe('INVALID_TRANSITION');
      }
      expect(await status(client.agent, c.id)).toBe(from);
      expect(await prisma.caseEvent.count({ where: { caseId: c.id } })).toBe(events);
    });
  }

  it('client submit outside an upload step is 409', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await driveCaseTo('CONTRACT_SENT', { client: client.agent, admin: admin.agent });
    const res = await client.agent.post(`/api/cases/${c.id}/submit`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('INVALID_TRANSITION');
  });
});

describe('action validation', () => {
  it.each([
    [{ action: 'TELEPORT' }],
    [{}],
    [{ action: 'REQUEST_CHANGES', note: 'x' }],
    [{ action: 'REJECT_SIGNATURE' }],
    [{ action: 'SCHEDULE_APPOINTMENT', at: 'not a date', place: 'Embassy' }],
    [{ action: 'SCHEDULE_APPOINTMENT', at: '2026-11-20T09:30:00Z' }],
    [{ action: 'DECIDE', decision: 'MAYBE' }],
    [{ action: 'CANCEL' }],
    [{ action: 'REOPEN', to: 'APPROVED' }],
  ])('%j → 400 VALIDATION', async (body) => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await createCaseVia(client.agent);
    const res = await act(admin.agent, c.id, body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });

  it('unknown case → 404', async () => {
    const admin = await asAdmin();
    const res = await act(admin.agent, 'nope', { action: 'MARK_LODGED' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('CASE_NOT_FOUND');
  });

  it('clients cannot run staff actions', async () => {
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    expect((await act(client.agent, c.id, { action: 'CANCEL', reason: 'Myself' })).status).toBe(403);
  });
});

describe('cancel and reopen', () => {
  it('STAFF can cancel; the client may then start a new case; reopening is refused while that one is active', async () => {
    const client = await asClient({ locale: 'en' });
    const staff = await asStaff();
    const first = await createCaseVia(client.agent);
    const res = expectStatus(await act(staff.agent, first.id, { action: 'CANCEL', reason: 'Client withdrew' }), 200);
    expect(res.body.case).toMatchObject({ status: 'CANCELLED', cancelReason: 'Client withdrew' });

    const second = await createCaseVia(client.agent);
    const reopen = await act(staff.agent, first.id, { action: 'REOPEN', to: 'DOCUMENTS_PENDING' });
    expect(reopen.status).toBe(409);
    expect(reopen.body.error).toBe('ACTIVE_CASE_EXISTS');

    expectStatus(await act(staff.agent, second.id, { action: 'CANCEL', reason: 'Duplicate' }), 200);
    const ok = expectStatus(await act(staff.agent, first.id, { action: 'REOPEN', to: 'DOCUMENTS_PENDING', note: 'Back on' }), 200);
    expect(ok.body.case).toMatchObject({ status: 'DOCUMENTS_PENDING', cancelReason: null, staffNote: 'Back on' });
    // reopening at DOCUMENTS_PENDING does not create embassy requirements
    expect(ok.body.case.requirements.every((r: { stage: string }) => r.stage === 'INITIAL')).toBe(true);
    await expectClientNotified(client.user, 'REOPENED', 'Application reopened');
  });
});

describe('concurrency', () => {
  it('two simultaneous MARK_LODGED: exactly one succeeds, the other gets 409', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const staff = await asStaff();
    const c = await driveCaseTo('APPOINTMENT_SCHEDULED', { client: client.agent, admin: admin.agent });

    const results = await Promise.all([act(admin.agent, c.id, { action: 'MARK_LODGED' }), act(staff.agent, c.id, { action: 'MARK_LODGED' })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.error).toBe('INVALID_TRANSITION');
    expect(await status(client.agent, c.id)).toBe('DECISION_PENDING');
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'LODGED_AT_EMBASSY' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'DECISION_PENDING' } })).toBe(1);
  });

  it('two simultaneous decisions (APPROVED vs REJECTED): only one wins', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await driveCaseTo('DECISION_PENDING', { client: client.agent, admin: admin.agent });
    const results = await Promise.all([
      act(admin.agent, c.id, { action: 'DECIDE', decision: 'APPROVED' }),
      act(admin.agent, c.id, { action: 'DECIDE', decision: 'REJECTED', reason: 'Refused' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200)!.body.case.status;
    expect(await status(client.agent, c.id)).toBe(winner);
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'DECISION' } })).toBe(1);
  });

  it('two simultaneous signatures: one succeeds, the loser’s signed PDF is cleaned up', async () => {
    const client = await asClient();
    const admin = await asAdmin();
    const c = await driveCaseTo('CONTRACT_SENT', { client: client.agent, admin: admin.agent });
    const results = await Promise.all([signContract(client.agent, c.id), signContract(client.agent, c.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await status(client.agent, c.id)).toBe('CONTRACT_SIGNED');
    const signed = await prisma.document.findMany({ where: { caseId: c.id, stage: 'CONTRACT_SIGNED' } });
    expect(signed).toHaveLength(1);
    expect((await clientCase(client.agent, c.id)).contract!.signedFile!.id).toBe(signed[0].id);
  });

  it('two simultaneous client submits: one succeeds, one 409', async () => {
    const client = await asClient();
    const c = await createCaseVia(client.agent);
    await uploadRequired(client.agent, c.id, 'INITIAL');
    const results = await Promise.all([client.agent.post(`/api/cases/${c.id}/submit`), client.agent.post(`/api/cases/${c.id}/submit`)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'DOCUMENTS_SUBMITTED' } })).toBe(1);
  });
});
