import { describe, expect, it } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { asAdmin, asClient, asStaff } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { createUser, uniq } from '../helpers/factories';
import { SIGNATURE_DATA_URL } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { seedLabourContractTemplate } from '../../prisma/seed/labourContractTemplate.js';

/** Two-step case contracts (lib/caseContracts): Əmək müqaviləsi (Triad Vision first → client → approve), then İş müqaviləsi. */

const BASE = '/api/admin/case-contracts/cases';

const setup = async (status: CaseStatus = 'DOCUMENTS_REVIEW') => {
  const company = await prisma.company.create({ data: { name: 'Spedition Müller', legalForm: 'GmbH', status: 'ACTIVE' } });
  const employer = await createUser({ role: 'COMPANY', firstName: 'Jürgen', lastName: 'Müller', locale: 'de' });
  await prisma.user.update({ where: { id: employer.user.id }, data: { companyId: company.id } });
  const client = await asClient({ firstName: 'Rauf', lastName: 'Həsənov', locale: 'az' });
  const c = await prisma.case.create({ data: { clientId: client.user.id, number: `TV-2026-${uniq('cc')}`, profession: 'Berufskraftfahrer', status, companyId: company.id } });
  await seedLabourContractTemplate(prisma);
  const labourTpl = await prisma.contractTemplate.findFirstOrThrow({ where: { kind: 'LABOUR' } });
  const workTpl = await prisma.contractTemplate.create({ data: { name: 'İş müqaviləsi', kind: 'WORK', language: 'de', body: '# Arbeitsvertrag\nArbeitnehmer/in: {{client.fullName}}, Beginn {{startDate}}.', active: true } });
  return { company, employer, client, c, labourTpl, workTpl };
};

const signers = (requestId: string) => prisma.signatureSigner.findMany({ where: { requestId }, orderBy: { order: 'asc' } });

describe('two-step case contracts', () => {
  it('Əmək müqaviləsi: Triad Vision signs first, then the client, then staff approve; the employer is never involved; the PDF lands in the drive', async () => {
    const { client, c, labourTpl, workTpl, employer, company } = await setup();
    const staff = await asStaff({ firstName: 'Leyla', lastName: 'Staff' });
    await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id } });

    // Step 2 cannot be sent before step 1 is approved.
    const before = expectStatus(await staff.agent.get(`${BASE}/${c.id}`), 200).body;
    expect(before.steps.map((s: { step: string; state: string; blockedReason: string | null }) => [s.step, s.state, s.blockedReason])).toEqual([
      ['LABOUR', 'NOT_SENT', null],
      ['WORK', 'NOT_SENT', 'LABOUR_NOT_APPROVED'],
    ]);
    expect(expectStatus(await staff.agent.post(`${BASE}/${c.id}/send`).send({ step: 'WORK', templateId: workTpl.id, inputs: {} }), 409).body.error).toBe('LABOUR_NOT_APPROVED');
    // Wrong template kind for the step.
    expect(expectStatus(await staff.agent.post(`${BASE}/${c.id}/send`).send({ step: 'LABOUR', templateId: workTpl.id, inputs: {} }), 400).body.error).toBe('TEMPLATE_WRONG_KIND');
    // The generic template sender refuses the LABOUR kind (only this flow sends it).
    expectStatus(await staff.agent.post(`/api/admin/contract-templates/${labourTpl.id}/send`).send({ caseId: c.id }), 400);

    // Send step 1: Triad Vision (the sender, no countersign settings) first, the client second, no employer.
    const sent = expectStatus(await staff.agent.post(`${BASE}/${c.id}/send`).send({ step: 'LABOUR', templateId: labourTpl.id, inputs: { salary: '1.000 €' } }), 201).body;
    expect(sent.caseContract).toBe(true);
    const request = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: sent.signatureRequestId } });
    expect(request).toMatchObject({ contractKind: 'LABOUR', isCaseContract: true, companyId: null, order: 'SEQUENTIAL', status: 'SENT' });
    const [triad, cand] = await signers(request.id);
    expect((await signers(request.id)).map((s) => [s.role, s.order, s.userId])).toEqual([
      ['STAFF', 1, staff.user.id],
      ['CANDIDATE', 2, client.user.id],
    ]);
    expect((await signers(request.id)).some((s) => s.role === 'COMPANY' || s.userId === employer.user.id)).toBe(false);
    expect(await prisma.signatureRequest.count({ where: { companyId: company.id } })).toBe(0);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('CONTRACT_SENT');
    expect(triad.invitedAt).toBeTruthy();
    expect(cand.invitedAt).toBeNull(); // the client is not invited before Triad Vision signed

    // The client cannot sign before Triad Vision.
    const early = expectStatus(await client.agent.post(`/api/signatures/my/${cand.id}/sign`).send({ mode: 'TYPE', typedName: 'Rauf Həsənov', agree: true }), 409);
    expect(early.body.error).toBe('NOT_YOUR_TURN');
    const portal1 = expectStatus(await client.agent.get(`/api/account/case-contracts/cases/${c.id}`), 200).body.steps;
    expect(portal1.map((s: { state: string; myTurn: boolean }) => [s.state, s.myTurn])).toEqual([
      ['TRIAD_TO_SIGN', false],
      ['NOT_SENT', false],
    ]);
    expect(await prisma.notification.count({ where: { userId: client.user.id, type: 'SIGNATURE_REQUEST' } })).toBe(0);
    // Only staff can approve, only after both signatures.
    expect(expectStatus(await staff.agent.post(`${BASE}/${c.id}/approve`).send({ step: 'LABOUR' }), 409).body.error).toBe('NOT_FULLY_SIGNED');

    // Another STAFF member may not sign for Triad Vision; the designated signer can.
    const other = await asStaff();
    expect(expectStatus(await other.agent.post(`${BASE}/${c.id}/triad-sign`).send({ step: 'LABOUR', mode: 'TYPE', typedName: 'Other', agree: true }), 403).body.error).toBe('NOT_TRIAD_SIGNER');
    const afterTriad = expectStatus(await staff.agent.post(`${BASE}/${c.id}/triad-sign`).send({ step: 'LABOUR', mode: 'DRAW', signature: SIGNATURE_DATA_URL, agree: true }), 200).body;
    expect(afterTriad.steps[0].state).toBe('CLIENT_TO_SIGN');
    // Now the client is invited (portal notification + e-mail link) and can sign in the portal.
    await waitFor(async () => prisma.notification.findFirst({ where: { userId: client.user.id, type: 'SIGNATURE_REQUEST', link: `/account/signatures/${cand.id}` } }));
    const portal2 = expectStatus(await client.agent.get(`/api/account/case-contracts/cases/${c.id}`), 200).body.steps[0];
    expect(portal2).toMatchObject({ state: 'CLIENT_TO_SIGN', myTurn: true, signerId: cand.id });
    expect(portal2.triadSignedAt).toBeTruthy();
    expectStatus(await client.agent.post(`/api/signatures/my/${cand.id}/sign`).send({ mode: 'TYPE', typedName: 'Rauf Həsənov', agree: true }), 200);

    // Completed: case CONTRACT_SIGNED, signed PDF filed as a case document and in "<client folder>/Əmək müqaviləsi".
    const done = await waitFor(async () => {
      const r = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: request.id } });
      return r.status === 'COMPLETED' && r.driveNodeId ? r : null;
    });
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(kase.status).toBe('CONTRACT_SIGNED');
    const file = await prisma.driveNode.findUniqueOrThrow({ where: { id: done.driveNodeId! }, include: { parent: true } });
    expect(file.kind).toBe('FILE');
    expect(file.name).toBe(`Əmək müqaviləsi – ${c.number} (imzalanmış).pdf`);
    expect(file.parent?.name).toBe('Əmək müqaviləsi');
    expect(file.parent?.parentId).toBe(kase.driveFolderId);
    expect(file.finalAt).toBeTruthy();
    expect(file.documentId).toBe(done.finalDocumentId);
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: done.finalDocumentId! } });
    expect(doc).toMatchObject({ caseId: c.id, stage: 'CONTRACT_SIGNED', status: 'PENDING' });
    // Staff are told the client signed (assigned staff + admins).
    await waitFor(async () => prisma.notification.findFirst({ where: { userId: staff.user.id, type: 'STAFF', title: { contains: 'Əmək müqaviləsi' } } }));

    // Still blocked until approved.
    const signedView = expectStatus(await staff.agent.get(`${BASE}/${c.id}`), 200).body.steps;
    expect(signedView.map((s: { state: string; blockedReason: string | null; canApprove: boolean }) => [s.state, s.blockedReason, s.canApprove])).toEqual([
      ['SIGNED', null, true],
      ['NOT_SENT', 'LABOUR_NOT_APPROVED', false],
    ]);

    // Approve: case contract step confirmed, document accepted, client notified; step 2 unlocked.
    const approved = expectStatus(await staff.agent.post(`${BASE}/${c.id}/approve`).send({ step: 'LABOUR' }), 200).body;
    expect(approved.steps.map((s: { state: string; blockedReason: string | null }) => [s.state, s.blockedReason])).toEqual([
      ['APPROVED', 'ALREADY_APPROVED'],
      ['NOT_SENT', null],
    ]);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('EMBASSY_DOCUMENTS');
    expect((await prisma.document.findUniqueOrThrow({ where: { id: done.finalDocumentId! } })).status).toBe('ACCEPTED');
    await waitFor(async () => prisma.notification.findFirst({ where: { userId: client.user.id, type: 'CASE_CONTRACT_APPROVED' } }));
    expectStatus(await staff.agent.post(`${BASE}/${c.id}/approve`).send({ step: 'LABOUR' }), 409);
    // The drive copy was not duplicated into the stage folder by the document acceptance.
    expect(await prisma.driveNode.count({ where: { documentId: done.finalDocumentId! } })).toBe(1);

    // Step 2: İş müqaviləsi, same order, never the case contract, never the employer.
    const work = expectStatus(await staff.agent.post(`${BASE}/${c.id}/send`).send({ step: 'WORK', templateId: workTpl.id, inputs: { startDate: '2027-03-01' } }), 201).body;
    expect(work.caseContract).toBe(false);
    const wr = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: work.signatureRequestId } });
    expect(wr).toMatchObject({ contractKind: 'WORK', isCaseContract: false, companyId: null });
    const [wTriad, wCand] = await signers(wr.id);
    expect([wTriad.role, wCand.role]).toEqual(['STAFF', 'CANDIDATE']);
    expectStatus(await client.agent.post(`/api/signatures/my/${wCand.id}/sign`).send({ mode: 'TYPE', typedName: 'Rauf Həsənov', agree: true }), 409);
    expectStatus(await staff.agent.post(`${BASE}/${c.id}/triad-sign`).send({ step: 'WORK', mode: 'TYPE', typedName: 'Leyla Staff', agree: true }), 200);
    expectStatus(await client.agent.post(`/api/signatures/my/${wCand.id}/sign`).send({ mode: 'TYPE', typedName: 'Rauf Həsənov', agree: true }), 200);
    const wDone = await waitFor(async () => {
      const r = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: wr.id } });
      return r.status === 'COMPLETED' && r.driveNodeId ? r : null;
    });
    const wFile = await prisma.driveNode.findUniqueOrThrow({ where: { id: wDone.driveNodeId! }, include: { parent: true } });
    expect(wFile.parent?.name).toBe('İş müqaviləsi');
    expect(wFile.parent?.parentId).toBe(kase.driveFolderId);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('EMBASSY_DOCUMENTS'); // case status untouched by step 2
    expectStatus(await staff.agent.post(`${BASE}/${c.id}/approve`).send({ step: 'WORK' }), 200);
    const portal3 = expectStatus(await client.agent.get(`/api/account/case-contracts/cases/${c.id}`), 200).body.steps;
    expect(portal3.map((s: { state: string }) => s.state)).toEqual(['APPROVED', 'APPROVED']);
    expect(portal3.every((s: { signedDocumentId: string | null }) => !!s.signedDocumentId)).toBe(true);
  });

  it('an ADMIN may take over the Triad Vision signature; "Confirm contract" counts as approval; other clients see nothing', async () => {
    const { c, labourTpl, client } = await setup();
    const staff = await asStaff();
    const admin = await asAdmin({ firstName: 'Anar', lastName: 'Boss' });
    const sent = expectStatus(await staff.agent.post(`${BASE}/${c.id}/send`).send({ step: 'LABOUR', templateId: labourTpl.id, inputs: {} }), 201).body;
    expectStatus(await admin.agent.post(`${BASE}/${c.id}/triad-sign`).send({ step: 'LABOUR', mode: 'TYPE', typedName: 'Anar Boss', agree: true }), 200);
    const [triad, cand] = await signers(sent.signatureRequestId);
    expect(triad).toMatchObject({ status: 'SIGNED', userId: admin.user.id, name: 'Anar Boss' });
    expectStatus(await client.agent.post(`/api/signatures/my/${cand.id}/sign`).send({ mode: 'TYPE', typedName: 'Rauf Həsənov', agree: true }), 200);
    await waitFor(async () => ((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status === 'CONTRACT_SIGNED' ? true : null));
    expectStatus(await staff.agent.post(`/api/admin/cases/${c.id}/actions`).send({ action: 'CONFIRM_CONTRACT' }), 200);
    await waitFor(async () => ((await prisma.signatureRequest.findUniqueOrThrow({ where: { id: sent.signatureRequestId } })).approvedAt ? true : null));

    const stranger = await asClient();
    expectStatus(await stranger.agent.get(`/api/account/case-contracts/cases/${c.id}`), 404);
    expectStatus(await staff.agent.get(`/api/account/case-contracts/cases/${c.id}`), 403);
  });

  it('closed cases take no contract; a new version supersedes the open one', async () => {
    const { c, labourTpl } = await setup('CONTRACT_SENT');
    const staff = await asStaff();
    const first = expectStatus(await staff.agent.post(`${BASE}/${c.id}/send`).send({ step: 'LABOUR', templateId: labourTpl.id, inputs: {} }), 201).body;
    const second = expectStatus(await staff.agent.post(`${BASE}/${c.id}/send`).send({ step: 'LABOUR', templateId: labourTpl.id, inputs: {} }), 201).body;
    expect((await prisma.signatureRequest.findUniqueOrThrow({ where: { id: first.signatureRequestId } })).status).toBe('CANCELLED');
    expect((await prisma.signatureRequest.findUniqueOrThrow({ where: { id: second.signatureRequestId } })).status).toBe('SENT');
    await prisma.case.update({ where: { id: c.id }, data: { status: 'CANCELLED' } });
    expect(expectStatus(await staff.agent.post(`${BASE}/${c.id}/send`).send({ step: 'LABOUR', templateId: labourTpl.id, inputs: {} }), 409).body.error).toBe('CASE_CLOSED');
  });
});
