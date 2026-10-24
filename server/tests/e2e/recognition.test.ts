import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { makePdf } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { config } from '../../src/config.js';
import { completeRequest } from '../../src/lib/esign/service.js';
import { runRecognitionDeadlines } from '../../src/lib/recognition/deadlines.js';
import { buildMyWork } from '../../src/lib/myWork.js';
import { loadNextStep } from '../../src/lib/account/nextStep.js';
import { asCompany } from './vacancies.fixtures';

const DAY = 24 * 60 * 60 * 1000;
const day = (d: Date) => d.toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * DAY);

const writeUpload = async (buf: Buffer) => {
  const storedName = `recog-${crypto.randomBytes(8).toString('hex')}.pdf`;
  await fs.mkdir(config.uploads.privateDir, { recursive: true });
  await fs.writeFile(path.join(config.uploads.privateDir, storedName), buf);
  return storedName;
};

/** Accepted document in the requirement `key` of the case. */
const acceptedDoc = async (caseId: string, key: string, uploadedById: string) => {
  const req = await prisma.documentRequirement.create({ data: { caseId, key, stage: 'INITIAL', title: { az: key, de: key, en: key, ru: key } } });
  const buf = await makePdf(`${key} document`);
  return prisma.document.create({ data: { caseId, requirementId: req.id, stage: 'INITIAL', originalName: `${key.toLowerCase()}.pdf`, storedName: await writeUpload(buf), mimeType: 'application/pdf', size: buf.length, status: 'ACCEPTED', uploadedById } });
};

const setup = async (opts: { companyId?: string } = {}) => {
  const staff = await asStaff({ locale: 'en' });
  const client = await asClient({ firstName: 'Nərmin', lastName: 'Həsənova', locale: 'az' });
  const kase = await prisma.case.create({ data: { clientId: client.user.id, number: uniq('TV-A-'), profession: 'Pflegefachkraft', assignedStaffId: staff.user.id, companyId: opts.companyId ?? null } });
  return { staff, client, kase };
};

describe('recognition tracker (Anerkennung)', () => {
  it('process with checklist linked to case documents, status sync to the match score, deficit notice, letters, fee invoice, client card + next step', async () => {
    const { staff, client, kase } = await setup();
    const passport = await acceptedDoc(kase.id, 'PASSPORT', staff.user.id);
    const diploma = await acceptedDoc(kase.id, 'DIPLOMA', staff.user.id);

    // Clients cannot reach the staff API.
    expect((await client.agent.get(`/api/admin/recognition/cases/${kase.id}`)).status).toBe(403);

    const created = expectStatus(await staff.agent.post(`/api/admin/recognition/cases/${kase.id}`).send({ procedureType: 'FULL_RECOGNITION', profession: 'Pflegefachfrau', federalState: 'Bayern', authority: 'Landesamt für Pflege' }), 201).body.process;
    expect(created).toMatchObject({ status: 'PREPARING', regulated: true, clientId: client.user.id, authority: 'Landesamt für Pflege' });
    const card = expectStatus(await staff.agent.get(`/api/admin/recognition/cases/${kase.id}`), 200).body;
    const p = card.processes[0];
    expect(p.checklist.find((i: { key: string }) => i.key === 'PASSPORT')).toMatchObject({ documentId: passport.id, done: true });
    expect(p.checklist.find((i: { key: string }) => i.key === 'DIPLOMA')).toMatchObject({ documentId: diploma.id, done: true });
    expect(p.checklist.find((i: { key: string }) => i.key === 'GERMAN_CERT')).toMatchObject({ optional: false, done: false });
    expect(p.events).toHaveLength(1);
    expect(card.documents.map((d: { id: string }) => d.id)).toEqual(expect.arrayContaining([passport.id, diploma.id]));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).recognitionStatus).toBe('IN_PROGRESS');

    // Client portal: read-only card with what the client still has to send; the next step points there.
    const mine = expectStatus(await client.agent.get(`/api/account/recognition/cases/${kase.id}`), 200).body.items;
    expect(mine[0].clientTodo.map((i: { key: string }) => i.key)).toEqual(expect.arrayContaining(['TRANSLATIONS', 'GERMAN_CERT']));
    expect(mine[0]).not.toHaveProperty('note');
    const next = await loadNextStep(client.user.id);
    const all = [next.primary, ...next.secondary];
    expect(all.some((a) => a?.kind === 'RECOGNITION_DOCS' && a.to === `/account/cases/${kase.id}#recognition`)).toBe(true);
    const stranger = await asClient();
    expect((await stranger.agent.get(`/api/account/recognition/cases/${kase.id}`)).status).toBe(404);

    // Checklist: a foreign document is refused; ticking items works.
    const otherCase = await prisma.case.create({ data: { clientId: stranger.user.id, number: uniq('TV-X-'), profession: 'x' } });
    const foreign = await acceptedDoc(otherCase.id, 'CV', staff.user.id);
    expect(expectStatus(await staff.agent.put(`/api/admin/recognition/${p.id}/checklist`).send({ items: [{ key: 'CV', done: true, documentId: foreign.id }] }), 400).body.error).toBe('DOCUMENT_NOT_IN_CASE');
    const items = p.checklist.map((i: { key: string; done: boolean; documentId: string | null; client: boolean }) => ({ ...i, done: i.client ? true : i.done }));
    expectStatus(await staff.agent.put(`/api/admin/recognition/${p.id}/checklist`).send({ items }), 200);
    expect((await loadNextStep(client.user.id)).primary?.kind).not.toBe('RECOGNITION_DOCS');

    // Submitted → decision: deficit notice (PARTIAL for matching), client notified, decision date set.
    expectStatus(await staff.agent.post(`/api/admin/recognition/${p.id}/status`).send({ status: 'SUBMITTED' }), 200);
    const deficit = expectStatus(await staff.agent.post(`/api/admin/recognition/${p.id}/status`).send({ status: 'DEFICIT_NOTICE', note: 'Praxisstunden Pädiatrie fehlen' }), 200).body.process;
    expect(deficit.submittedAt).toBeTruthy();
    expect(deficit.decisionAt).toBeTruthy();
    expect(expectStatus(await staff.agent.post(`/api/admin/recognition/${p.id}/status`).send({ status: 'DEFICIT_NOTICE' }), 409).body.error).toBe('SAME_STATUS');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).recognitionStatus).toBe('PARTIAL');
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: client.user.id, type: 'RECOGNITION_STATUS' }, orderBy: { createdAt: 'desc' } });
    expect(note.body).toContain('Defizitbescheid');

    const patched = expectStatus(
      await staff.agent.patch(`/api/admin/recognition/${p.id}`).send({ deficitNotes: '120 h Pädiatrie', adaptationMeasure: 'KENNTNISPRUEFUNG', nextDeadline: day(inDays(3)), nextDeadlineNote: 'Anmeldung Kenntnisprüfung', feeCents: 30000 }),
      200,
    ).body.process;
    expect(patched).toMatchObject({ adaptationMeasure: 'KENNTNISPRUEFUNG', deficitNotes: '120 h Pädiatrie', feeCents: 30000 });
    expect(await prisma.recognitionEvent.count({ where: { processId: p.id, type: 'DEADLINE' } })).toBe(1);

    // Letter in with the file: stored as a case document and on the timeline.
    const letter = expectStatus(
      await staff.agent
        .post(`/api/admin/recognition/${p.id}/letters`)
        .field('type', 'LETTER_IN')
        .field('note', 'Defizitbescheid vom Landesamt')
        .attach('file', await makePdf('Bescheid'), { filename: 'Bescheid.pdf', contentType: 'application/pdf' }),
      201,
    ).body;
    expect(letter.document).toMatchObject({ caseId: kase.id, stage: 'OTHER', status: 'ACCEPTED', originalName: 'Bescheid.pdf' });
    expect(letter.event).toMatchObject({ type: 'LETTER_IN', documentId: letter.document.id });

    // Fee → client invoice draft (pass-through), once.
    const inv = expectStatus(await staff.agent.post(`/api/admin/recognition/${p.id}/fee-invoice`), 201).body.invoice;
    expect(inv).toMatchObject({ status: 'DRAFT', grossCents: 30000 });
    expect(expectStatus(await staff.agent.post(`/api/admin/recognition/${p.id}/fee-invoice`), 409).body.error).toBe('INVOICE_EXISTS');

    // Client sees the deficits once there is a deficit notice.
    expect(expectStatus(await client.agent.get(`/api/account/recognition/cases/${kase.id}`), 200).body.items[0]).toMatchObject({ status: 'DEFICIT_NOTICE', deficitNotes: '120 h Pädiatrie', adaptationMeasure: 'KENNTNISPRUEFUNG' });

    // A positive ZAB statement keeps the best status even while the full recognition runs.
    const zab = expectStatus(await staff.agent.post(`/api/admin/recognition/cases/${kase.id}`).send({ procedureType: 'ZAB_STATEMENT', profession: 'Bachelor Pflege' }), 201).body.process;
    expect(zab).toMatchObject({ feeCents: 20000, regulated: false });
    expect(zab.authority).toContain('ZAB');
    expectStatus(await staff.agent.post(`/api/admin/recognition/${zab.id}/status`).send({ status: 'RECOGNISED' }), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).recognitionStatus).toBe('RECOGNISED');

    // Admin list: filters + counts.
    const list = expectStatus(await staff.agent.get('/api/admin/recognition').query({ status: 'open' }), 200).body;
    expect(list.items.map((i: { id: string }) => i.id)).toEqual([p.id]);
    expect(list.items[0]).toMatchObject({ client: { name: 'Nərmin Həsənova' } });
    expect([3, 4]).toContain(list.items[0].daysLeft);
    expect(list.counts).toMatchObject({ open: 1, soon: 1, overdue: 0 });
    expect(expectStatus(await staff.agent.get('/api/admin/recognition').query({ status: 'all', authority: 'ZAB' }), 200).body.items).toHaveLength(1);
    expect(expectStatus(await staff.agent.get('/api/admin/recognition').query({ status: 'all', soon: 2 }), 200).body.items).toHaveLength(0);

    // Deleting is ADMIN+.
    expect((await staff.agent.delete(`/api/admin/recognition/${zab.id}`)).status).toBe(403);
    const admin = await asAdmin();
    expectStatus(await admin.agent.delete(`/api/admin/recognition/${zab.id}`), 200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.user.id } })).recognitionStatus).toBe('PARTIAL');
  });

  it('deadline reminders: task + notification once, escalation to admins when overdue; my-work and the Expiring feed list it', async () => {
    const { staff, kase } = await setup();
    const admin = await asAdmin();
    const p = expectStatus(await staff.agent.post(`/api/admin/recognition/cases/${kase.id}`).send({ procedureType: 'IHK_FOSA', profession: 'Elektroniker' }), 201).body.process;
    await staff.agent.patch(`/api/admin/recognition/${p.id}`).send({ nextDeadline: day(inDays(4)), nextDeadlineNote: 'Unterlagen nachreichen' });

    const first = await runRecognitionDeadlines();
    expect(first.recognition).toBe(1);
    expect((await runRecognitionDeadlines()).recognition).toBe(0);
    const task = await prisma.task.findFirstOrThrow({ where: { caseId: kase.id }, include: { assignees: true } });
    expect(task.assignees.map((a) => a.userId)).toEqual([staff.user.id]);
    expect(task.title).toContain('Unterlagen nachreichen');
    expect(await prisma.notification.count({ where: { userId: staff.user.id, type: 'RECOGNITION_DEADLINE' } })).toBe(1);

    const work = await buildMyWork({ id: staff.user.id, role: 'STAFF', locale: 'en', firstName: 'S', lastName: 'T' }, { team: false });
    const item = work.items.find((i) => i.kind === 'recognition_deadline');
    expect(item).toMatchObject({ link: `/admin/cases/${kase.id}#case-recognition`, category: 'documents' });

    const feed = expectStatus(await staff.agent.get('/api/admin/recognition/deadlines').query({ days: 30 }), 200).body.items;
    expect(feed).toEqual([expect.objectContaining({ source: 'RECOGNITION', kind: 'NEXT', caseId: kase.id })]);
    expect([4, 5]).toContain(feed[0].daysLeft);

    // Overdue (the deadline moved into the past) → escalation to the staff member and the admins.
    await prisma.recognitionProcess.update({ where: { id: p.id }, data: { nextDeadline: inDays(-1) } });
    expect((await runRecognitionDeadlines()).recognition).toBe(1);
    expect(await prisma.notification.count({ where: { userId: admin.user.id, type: 'RECOGNITION_DEADLINE_OVERDUE' } })).toBe(1);
    expect(await prisma.task.count({ where: { caseId: kase.id, priority: 'HIGH' } })).toBe(1);

    // Settings: ADMIN only; switched off → no reminders.
    expect((await staff.agent.put('/api/admin/recognition/settings').send({ enabled: false, leadDays: 7 })).status).toBe(403);
    expectStatus(await admin.agent.put('/api/admin/recognition/settings').send({ enabled: false, leadDays: 7 }), 200);
    await prisma.recognitionProcess.update({ where: { id: p.id }, data: { nextDeadline: inDays(2) } });
    expect((await runRecognitionDeadlines()).recognition).toBe(0);
  });
});

describe('§ 81a accelerated skilled-worker procedure', () => {
  it('start (needs the employer), Vollmacht by e-signature, agreement, submission e-mail, fee, pre-approval → embassy deadlines, employer portal, deadlines', async () => {
    const employer = await asCompany();
    const { staff, client, kase } = await setup({ companyId: employer.company.id });
    const passport = await acceptedDoc(kase.id, 'PASSPORT', staff.user.id);

    // Needs an employer on the case.
    const { kase: noCompany } = await setup();
    expect(expectStatus(await staff.agent.post(`/api/admin/accelerated/cases/${noCompany.id}`).send({}), 400).body.error).toBe('COMPANY_REQUIRED');
    expect(expectStatus(await staff.agent.get(`/api/admin/accelerated/cases/${noCompany.id}`), 200).body).toMatchObject({ canStart: false, procedure: null });

    const started = expectStatus(await staff.agent.post(`/api/admin/accelerated/cases/${kase.id}`).send({ authority: 'Ausländerbehörde München', authorityEmail: 'abh@muenchen.example' }), 201).body.procedure;
    expect(started).toMatchObject({ status: 'PREPARING', companyId: employer.company.id, feeCents: 41100 });
    expect(expectStatus(await staff.agent.post(`/api/admin/accelerated/cases/${kase.id}`).send({}), 409).body.error).toBe('ACCELERATED_EXISTS');
    expect(await prisma.notification.count({ where: { userId: employer.user.id, type: 'ACCELERATED_PROCEDURE' } })).toBe(1);

    // Employer portal: the agreement is the employer's to-do.
    let drawer = expectStatus(await employer.agent.get(`/api/company/workers/${kase.id}`), 200).body;
    expect(drawer.accelerated).toMatchObject({ status: 'PREPARING', todos: ['SIGN_AGREEMENT'] });
    expect(drawer.accelerated).not.toHaveProperty('note');
    expect(drawer.worker.openItems).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'ACCELERATED', id: `${kase.id}:SIGN_AGREEMENT` })]));
    expect(drawer.worker.nextAction).toBe('ACCELERATED_STEP');

    // Vollmacht from the template → e-signature request to the worker; completion moves the step.
    const sig = expectStatus(await staff.agent.post(`/api/admin/accelerated/${started.id}/vollmacht`), 201).body.signatureRequest;
    const reqRow = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: sig.id }, include: { signers: true } });
    expect(reqRow).toMatchObject({ status: 'SENT', caseId: kase.id });
    expect(reqRow.title).toContain('Vollmacht § 81a AufenthG');
    expect(reqRow.signers.map((s) => [s.role, s.userId])).toEqual([['CANDIDATE', client.user.id]]);
    expect(expectStatus(await staff.agent.post(`/api/admin/accelerated/${started.id}/vollmacht`), 409).body.error).toBe('SIGNATURE_PENDING');
    await prisma.signatureSigner.updateMany({ where: { requestId: sig.id }, data: { status: 'SIGNED', signedAt: new Date(), signatureMode: 'TYPE', typedName: 'Nərmin Həsənova', authMethod: 'PORTAL' } });
    await completeRequest(sig.id);
    let card = expectStatus(await staff.agent.get(`/api/admin/accelerated/cases/${kase.id}`), 200).body;
    expect(card.procedure).toMatchObject({ status: 'POWER_OF_ATTORNEY', vollmacht: { status: 'COMPLETED' } });
    expect(card.procedure.powerOfAttorneyAt).toBeTruthy();
    expect(card.documents.some((d: { name: string }) => d.name.includes('Vollmacht_81a'))).toBe(true);

    // Agreement upload → AGREEMENT_SIGNED, logged.
    const agreement = expectStatus(
      await staff.agent.post(`/api/admin/accelerated/${started.id}/documents`).field('kind', 'AGREEMENT').attach('file', await makePdf('Vereinbarung'), { filename: 'Vereinbarung.pdf', contentType: 'application/pdf' }),
      201,
    ).body;
    expect(agreement.procedure).toMatchObject({ status: 'AGREEMENT_SIGNED' });
    drawer = expectStatus(await employer.agent.get(`/api/company/workers/${kase.id}`), 200).body;
    expect(drawer.accelerated.todos).toEqual([]);

    // Submission e-mail: German draft with suggested attachments → sent, logged OUT, SUBMITTED.
    const draft = expectStatus(await staff.agent.get(`/api/admin/accelerated/${started.id}/submission`), 200).body.draft;
    expect(draft.to).toBe('abh@muenchen.example');
    expect(draft.subject).toContain('§ 81a AufenthG');
    expect(draft.body).toContain('Nərmin Həsənova');
    expect(draft.documentIds).toEqual(expect.arrayContaining([passport.id, agreement.document.id]));
    const sent = expectStatus(await staff.agent.post(`/api/admin/accelerated/${started.id}/submission`).send({ to: draft.to, subject: draft.subject, body: draft.body, documentIds: draft.documentIds }), 201).body;
    expect(sent.procedure).toMatchObject({ status: 'SUBMITTED' });
    expect(sent.message).toMatchObject({ direction: 'OUT', channel: 'EMAIL' });
    expect(await prisma.emailLog.count({ where: { to: 'abh@muenchen.example' } })).toBe(1);

    // Fee requested → employer to-do + notification; paid.
    expectStatus(await staff.agent.post(`/api/admin/accelerated/${started.id}/step`).send({ action: 'FEE_REQUESTED' }), 200);
    drawer = expectStatus(await employer.agent.get(`/api/company/workers/${kase.id}`), 200).body;
    expect(drawer.accelerated).toMatchObject({ status: 'FEE_REQUESTED', todos: ['PAY_FEE'], feeCents: 41100 });
    expect(await prisma.notification.count({ where: { userId: employer.user.id, type: 'ACCELERATED_PROCEDURE' } })).toBe(2);
    expectStatus(await staff.agent.post(`/api/admin/accelerated/${started.id}/step`).send({ action: 'FEE_PAID' }), 200);
    expectStatus(await staff.agent.post(`/api/admin/accelerated/${started.id}/step`).send({ action: 'IN_REVIEW' }), 200);

    // Embassy notification needs the pre-approval first.
    expect(expectStatus(await staff.agent.post(`/api/admin/accelerated/${started.id}/step`).send({ action: 'EMBASSY_NOTIFIED' }), 409).body.error).toBe('PRE_APPROVAL_REQUIRED');

    // Incoming letter with a reply date → REPLY deadline until an outgoing message follows.
    const letter = expectStatus(
      await staff.agent
        .post(`/api/admin/accelerated/${started.id}/documents`)
        .field('kind', 'LETTER_IN')
        .field('subject', 'Nachforderung Unterlagen')
        .field('dueAt', day(inDays(2)))
        .attach('file', await makePdf('Nachforderung'), { filename: 'Nachforderung.pdf', contentType: 'application/pdf' }),
      201,
    ).body;
    expect(letter.message).toMatchObject({ direction: 'IN', channel: 'LETTER', subject: 'Nachforderung Unterlagen' });
    card = expectStatus(await staff.agent.get(`/api/admin/accelerated/cases/${kase.id}`), 200).body;
    expect(card.procedure.deadlines.map((d: { kind: string }) => d.kind)).toEqual(['REPLY']);
    expect((await runRecognitionDeadlines()).accelerated).toBe(1);
    expect(await prisma.notification.count({ where: { userId: staff.user.id, type: 'RECOGNITION_DEADLINE' } })).toBe(1);
    const work = await buildMyWork({ id: staff.user.id, role: 'STAFF', locale: 'en', firstName: 'S', lastName: 'T' }, { team: false });
    expect(work.items.find((i) => i.kind === 'accelerated_deadline')).toMatchObject({ link: `/admin/cases/${kase.id}#case-81a`, note: { key: 'accelerated.REPLY' } });
    expectStatus(await staff.agent.post(`/api/admin/accelerated/${started.id}/messages`).send({ direction: 'OUT', channel: 'EMAIL', subject: 'Unterlagen nachgereicht' }), 201);
    card = expectStatus(await staff.agent.get(`/api/admin/accelerated/cases/${kase.id}`), 200).body;
    expect(card.procedure.deadlines).toEqual([]);

    // Pre-approval (upload) → appointment deadline +3 weeks, client + employer told.
    const pre = expectStatus(
      await staff.agent.post(`/api/admin/accelerated/${started.id}/documents`).field('kind', 'PRE_APPROVAL').field('date', day(new Date())).attach('file', await makePdf('Vorabzustimmung'), { filename: 'Vorabzustimmung.pdf', contentType: 'application/pdf' }),
      201,
    ).body.procedure;
    expect(pre.status).toBe('PRE_APPROVAL');
    expect(pre.preApprovalDocId).toBeTruthy();
    expect(Math.round((new Date(pre.appointmentDeadline).getTime() - new Date(pre.preApprovalAt).getTime()) / DAY)).toBe(21);
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'ACCELERATED_PRE_APPROVAL' } })).toBe(1);

    expectStatus(await staff.agent.post(`/api/admin/accelerated/${started.id}/step`).send({ action: 'EMBASSY_NOTIFIED' }), 200);
    const appointmentAt = inDays(10);
    const booked = expectStatus(await staff.agent.post(`/api/admin/accelerated/${started.id}/step`).send({ action: 'APPOINTMENT', appointmentAt: appointmentAt.toISOString() }), 200).body.procedure;
    expect(booked.status).toBe('APPOINTMENT_BOOKED');
    expect(Math.round((new Date(booked.decisionDeadline).getTime() - appointmentAt.getTime()) / DAY)).toBe(21);

    // Admin list with the nearest deadline.
    const list = expectStatus(await staff.agent.get('/api/admin/accelerated'), 200).body;
    expect(list.items).toEqual([expect.objectContaining({ id: started.id, status: 'APPOINTMENT_BOOKED', next: expect.objectContaining({ kind: 'DECISION' }), company: { id: employer.company.id, name: employer.company.name } })]);

    // Decision ends it; no further steps.
    expectStatus(await staff.agent.post(`/api/admin/accelerated/${started.id}/step`).send({ action: 'DECIDED', outcome: 'VISA_DECIDED' }), 200);
    expect(expectStatus(await staff.agent.post(`/api/admin/accelerated/${started.id}/step`).send({ action: 'FEE_PAID' }), 409).body.error).toBe('ACCELERATED_CLOSED');
    card = expectStatus(await staff.agent.get(`/api/admin/accelerated/cases/${kase.id}`), 200).body;
    expect(card.procedure.final).toBe(true);
    expect(card.messages.length).toBeGreaterThanOrEqual(6);

    // Another company never sees it.
    const other = await asCompany();
    expect((await other.agent.get(`/api/company/workers/${kase.id}`)).status).toBe(404);
  });
});
