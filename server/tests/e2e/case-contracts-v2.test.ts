import { describe, expect, it } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { asClient, asStaff } from '../helpers/api';
import { prisma, waitFor } from '../helpers/db';
import { uniq } from '../helpers/factories';
import { binaryParser, makePdf, PDF, SIGNATURE_DATA_URL } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { asCandidate, createCompany, createVacancy } from './vacancies.fixtures';
import { staffConfirmContract } from '../../src/lib/caseFlow.js';
import { ballInCourtFor } from '../../src/lib/clientProcess/ballInCourt.js';

/**
 * Case contracts V2 (lib/caseContracts): staff upload their own PDF with marked signature places.
 *   Əmək müqaviləsi: the client signs first, then Triad Vision (which approves it); staff may return it with a reason.
 *   İş müqaviləsi: 1–10 PDFs signed by the client only; staff approve the set → employer visible, case → embassy documents.
 * Plus: applying to a vacancy starts the client's one active application (case).
 */

const BASE = '/api/admin/case-contracts/cases';
const CLIENT_BOX = { role: 'CANDIDATE', page: 1, x: 60, y: 100, w: 200, h: 50 };
const TRIAD_BOX = { role: 'STAFF', page: 1, x: 320, y: 100, w: 200, h: 50 };

const setup = async (status: CaseStatus = 'DOCUMENTS_REVIEW') => {
  const company = await prisma.company.create({ data: { name: `Spedition ${uniq('v2')} GmbH`, legalForm: 'GmbH', status: 'ACTIVE' } });
  const client = await asClient({ firstName: 'Rauf', lastName: 'Həsənov', locale: 'az' });
  const c = await prisma.case.create({ data: { clientId: client.user.id, number: `TV-2026-${uniq('v2')}`, profession: 'Berufskraftfahrer', status, companyId: company.id } });
  const staff = await asStaff({ firstName: 'Leyla', lastName: 'Staff' });
  await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staff.user.id } });
  return { company, client, c, staff };
};

type Agent = Awaited<ReturnType<typeof asStaff>>['agent'];
const upload = async (agent: Agent, caseId: string, step: 'LABOUR' | 'WORK', files: { name: string; boxes: object[] }[], extra: Record<string, unknown> = {}) => {
  let r = agent.post(`${BASE}/${caseId}/upload`).field('meta', JSON.stringify({ step, placements: files.map((f) => f.boxes), ...extra }));
  for (const f of files) r = r.attach('files', await makePdf(f.name, 2), { filename: `${f.name}.pdf`, ...PDF });
  return r;
};
const candidateOf = (requestId: string) => prisma.signatureSigner.findFirstOrThrow({ where: { requestId, role: 'CANDIDATE' } });
const completed = (id: string) =>
  waitFor(async () => {
    const r = await prisma.signatureRequest.findUniqueOrThrow({ where: { id } });
    return r.status === 'COMPLETED' && r.driveNodeId ? r : null;
  });

describe('case contracts V2: own PDF, signature places, client first', () => {
  it('inspect lists the pages and form fields of a PDF', async () => {
    const { staff } = await setup();
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    doc.getForm().createTextField('Unterschrift_Arbeitnehmer').addToPage(page, { x: 50, y: 80, width: 180, height: 40 });
    const out = expectStatus(await staff.agent.post(`${BASE.replace('/cases', '')}/inspect`).attach('file', Buffer.from(await doc.save()), { filename: 'form.pdf', ...PDF }), 200).body;
    expect(out.pageCount).toBe(1);
    expect(out.fields).toEqual([expect.objectContaining({ name: 'Unterschrift_Arbeitnehmer', type: 'text', page: 1 })]);
  });

  it('Əmək müqaviləsi: places are required; client signs first, then Triad Vision → approved, signed PDF in the drive and on the case', async () => {
    const { client, c, staff } = await setup();
    // Places: client + Triad Vision are both required; İş müqaviləsi is still locked.
    expect(expectStatus(await upload(staff.agent, c.id, 'LABOUR', [{ name: 'emek', boxes: [CLIENT_BOX] }]), 400).body.error).toBe('TRIAD_PLACE_REQUIRED');
    expect(expectStatus(await upload(staff.agent, c.id, 'LABOUR', [{ name: 'emek', boxes: [TRIAD_BOX] }]), 400).body.error).toBe('CLIENT_PLACE_REQUIRED');
    expect(expectStatus(await upload(staff.agent, c.id, 'WORK', [{ name: 'is', boxes: [CLIENT_BOX] }]), 409).body.error).toBe('LABOUR_NOT_APPROVED');

    const sent = expectStatus(await upload(staff.agent, c.id, 'LABOUR', [{ name: 'emek', boxes: [CLIENT_BOX, TRIAD_BOX] }]), 201).body;
    expect(sent.caseContract).toBe(true);
    const [id] = sent.signatureRequestIds as string[];
    const r = await prisma.signatureRequest.findUniqueOrThrow({ where: { id }, include: { signers: { orderBy: { order: 'asc' } } } });
    expect(r).toMatchObject({ contractKind: 'LABOUR', contractFlow: 'V2', isCaseContract: true, companyId: null, status: 'SENT' });
    expect(r.signers.map((s) => [s.role, s.order])).toEqual([
      ['CANDIDATE', 1],
      ['STAFF', 2],
    ]);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('CONTRACT_SENT');

    // Triad Vision cannot sign before the client.
    expectStatus(await staff.agent.post(`${BASE}/${c.id}/triad-sign`).send({ step: 'LABOUR', mode: 'TYPE', typedName: 'Leyla Staff', agree: true }), 409);
    const portal = expectStatus(await client.agent.get(`/api/account/case-contracts/cases/${c.id}`), 200).body.steps[0];
    expect(portal).toMatchObject({ state: 'CLIENT_TO_SIGN', myTurn: true, flow: 'V2' });
    // The cabinet status line says what is required.
    expect(expectStatus(await client.agent.get('/api/account/next-step'), 200).body.statusLine).toMatchObject({ stage: 'SIGN_LABOUR', required: true });

    const cand = r.signers[0];
    expectStatus(await client.agent.post(`/api/signatures/my/${cand.id}/sign`).send({ mode: 'DRAW', signature: SIGNATURE_DATA_URL, agree: true }), 200);
    const mid = expectStatus(await staff.agent.get(`${BASE}/${c.id}`), 200).body.steps[0];
    expect(mid).toMatchObject({ state: 'TRIAD_TO_SIGN', canTriadSign: true, canReturn: true });
    expect(expectStatus(await client.agent.get('/api/account/next-step'), 200).body.statusLine).toMatchObject({ stage: 'LABOUR_TRIAD', required: false });

    // Triad Vision agrees and signs: completed + approved at once; the case waits for the İş müqaviləsi.
    expectStatus(await staff.agent.post(`${BASE}/${c.id}/triad-sign`).send({ step: 'LABOUR', mode: 'TYPE', typedName: 'Leyla Staff', agree: true }), 200);
    const done = await completed(id);
    await waitFor(async () => (await prisma.signatureRequest.findUniqueOrThrow({ where: { id } })).approvedAt);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('CONTRACT_SIGNED');
    const file = await prisma.driveNode.findUniqueOrThrow({ where: { id: done.driveNodeId! }, include: { parent: true } });
    expect(file.parent?.name).toBe('Əmək müqaviləsi');
    // Signatures are stamped into the places: no signature page appended (only the certificate).
    const finalDoc = await prisma.document.findUniqueOrThrow({ where: { id: done.finalDocumentId! } });
    expect(finalDoc).toMatchObject({ caseId: c.id, stage: 'CONTRACT_SIGNED' });
    await waitFor(async () => prisma.notification.findFirst({ where: { userId: client.user.id, type: 'CASE_CONTRACT_APPROVED' } }));
    // "Confirm contract" cannot skip the İş müqaviləsi.
    await expect(staffConfirmContract(c.id, staff.user.id)).rejects.toMatchObject({ code: 'WORK_CONTRACT_PENDING' });
  });

  it('interim PDF: after the client signs, staff see the client signature before Triad Vision signs; the original stays untouched; next step / ball follow V2', async () => {
    const { client, c, staff } = await setup();
    const [id] = expectStatus(await upload(staff.agent, c.id, 'LABOUR', [{ name: 'emek', boxes: [CLIENT_BOX, TRIAD_BOX] }]), 201).body.signatureRequestIds as string[];
    const get = (url: string) => staff.agent.get(url).buffer(true).parse(binaryParser);
    const images = async (buf: Buffer) => {
      const page = (await PDFDocument.load(buf)).getPages()[0];
      return page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)?.keys().length ?? 0;
    };
    const original = expectStatus(await get(`/api/admin/signatures/${id}/document?version=original`), 200).body as Buffer;
    // Nobody signed yet: "current" is the original.
    expect(Buffer.compare(expectStatus(await get(`/api/admin/signatures/${id}/document?version=current`), 200).body as Buffer, original)).toBe(0);

    const cand = await candidateOf(id);
    expectStatus(await client.agent.post(`/api/signatures/my/${cand.id}/sign`).send({ mode: 'DRAW', signature: SIGNATURE_DATA_URL, agree: true }), 200);
    const current = await get(`/api/admin/signatures/${id}/document?version=current`);
    expectStatus(current, 200);
    expect(current.headers['content-type']).toContain('application/pdf');
    const interim = current.body as Buffer;
    expect(Buffer.compare(interim, original)).not.toBe(0);
    expect(await images(interim)).toBeGreaterThan(await images(original));
    // The default while signing is the interim copy too; the original is unchanged.
    expect(Buffer.compare(expectStatus(await get(`/api/admin/signatures/${id}/document`), 200).body as Buffer, interim)).toBe(0);
    expect(Buffer.compare(expectStatus(await get(`/api/admin/signatures/${id}/document?version=original`), 200).body as Buffer, original)).toBe(0);
    // The client's own copy shows their signature as well.
    const mine = await client.agent.get(`/api/signatures/my/${cand.id}/document`).buffer(true).parse(binaryParser);
    expect(await images(expectStatus(mine, 200).body as Buffer)).toBeGreaterThan(await images(original));

    // Staff next step and ball: Triad Vision signs now (the client has signed) — not "client not invited yet".
    const next = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}/next-step`), 200).body.nextStep;
    expect(next.steps[0]).toMatchObject({ code: 'TRIAD_SIGN_AFTER_CLIENT' });
    expect(await ballInCourtFor(c.id)).toMatchObject({ side: 'TEAM', reason: 'TRIAD_SIGN_CONTRACT' });

    // Triad Vision signs → approved; the next step is the İş müqaviləsi, not "confirm the contract".
    expectStatus(await staff.agent.post(`${BASE}/${c.id}/triad-sign`).send({ step: 'LABOUR', mode: 'TYPE', typedName: 'Leyla Staff', agree: true }), 200);
    await completed(id);
    await waitFor(async () => (await prisma.signatureRequest.findUniqueOrThrow({ where: { id } })).approvedAt);
    const after = expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}/next-step`), 200).body.nextStep;
    expect(after.steps[0]).toMatchObject({ code: 'SEND_WORK_CONTRACT' });
    expect(after.steps.map((x: { code: string }) => x.code)).not.toContain('CONFIRM_CONTRACT');
    expect(await ballInCourtFor(c.id)).toMatchObject({ side: 'TEAM', reason: 'SEND_WORK_CONTRACT' });

    // İş müqaviləsi sent: the client's turn; signed by the client: staff approve.
    const [w] = expectStatus(await upload(staff.agent, c.id, 'WORK', [{ name: 'is', boxes: [CLIENT_BOX] }]), 201).body.signatureRequestIds as string[];
    expect(expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}/next-step`), 200).body.nextStep.steps.map((x: { code: string }) => x.code)).toContain('AWAIT_WORK_SIGNATURE');
    expect(await ballInCourtFor(c.id)).toMatchObject({ side: 'CLIENT', reason: 'SIGN_CONTRACT' });
    expectStatus(await client.agent.post(`/api/signatures/my/${(await candidateOf(w)).id}/sign`).send({ mode: 'TYPE', typedName: 'Rauf Həsənov', agree: true }), 200);
    await completed(w);
    expect(expectStatus(await staff.agent.get(`/api/admin/cases/${c.id}/next-step`), 200).body.nextStep.steps[0]).toMatchObject({ code: 'APPROVE_WORK_CONTRACT' });
    expect(await ballInCourtFor(c.id)).toMatchObject({ side: 'TEAM', reason: 'APPROVE_WORK_CONTRACT' });
  });

  it('Əmək müqaviləsi returned with a reason: the client sees it, a new version can be uploaded', async () => {
    const { client, c, staff } = await setup();
    const [id] = expectStatus(await upload(staff.agent, c.id, 'LABOUR', [{ name: 'emek', boxes: [CLIENT_BOX, TRIAD_BOX] }]), 201).body.signatureRequestIds as string[];
    const cand = await candidateOf(id);
    expectStatus(await client.agent.post(`/api/signatures/my/${cand.id}/sign`).send({ mode: 'TYPE', typedName: 'Rauf Həsənov', agree: true }), 200);
    expectStatus(await staff.agent.post(`${BASE}/${c.id}/return`).send({ step: 'LABOUR', reason: 'Səhv tarix' }), 200);
    const r = await prisma.signatureRequest.findUniqueOrThrow({ where: { id } });
    expect(r).toMatchObject({ status: 'CANCELLED', returnReason: 'Səhv tarix' });
    const portal = expectStatus(await client.agent.get(`/api/account/case-contracts/cases/${c.id}`), 200).body.steps[0];
    expect(portal).toMatchObject({ state: 'RETURNED', returnReason: 'Səhv tarix' });
    await waitFor(async () => prisma.notification.findFirst({ where: { userId: client.user.id, type: 'CASE_CONTRACT_RETURNED' } }));
    expectStatus(await upload(staff.agent, c.id, 'LABOUR', [{ name: 'emek-2', boxes: [CLIENT_BOX, TRIAD_BOX] }]), 201);
  });

  it('İş müqaviləsi: several PDFs, client signs all, one returned and replaced, staff approve → employer visible, embassy documents', async () => {
    const { client, c, staff, company } = await setup();
    // Əmək müqaviləsi done (V2) — the case contract step.
    const [lab] = expectStatus(await upload(staff.agent, c.id, 'LABOUR', [{ name: 'emek', boxes: [CLIENT_BOX, TRIAD_BOX] }]), 201).body.signatureRequestIds as string[];
    expectStatus(await client.agent.post(`/api/signatures/my/${(await candidateOf(lab)).id}/sign`).send({ mode: 'TYPE', typedName: 'Rauf Həsənov', agree: true }), 200);
    expectStatus(await staff.agent.post(`${BASE}/${c.id}/triad-sign`).send({ step: 'LABOUR', mode: 'TYPE', typedName: 'Leyla Staff', agree: true }), 200);
    await waitFor(async () => (await prisma.signatureRequest.findUniqueOrThrow({ where: { id: lab } })).approvedAt);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('CONTRACT_SIGNED');

    // No Triad Vision place on the İş müqaviləsi; at most 10 documents.
    expect(expectStatus(await upload(staff.agent, c.id, 'WORK', [{ name: 'is', boxes: [CLIENT_BOX, TRIAD_BOX] }]), 400).body.error).toBe('NO_TRIAD_SIGNATURE');
    const ids = expectStatus(
      await upload(staff.agent, c.id, 'WORK', [
        { name: 'Arbeitsvertrag', boxes: [CLIENT_BOX] },
        { name: 'Anlage', boxes: [{ ...CLIENT_BOX, page: 2 }] },
      ]),
      201,
    ).body.signatureRequestIds as string[];
    expect(ids).toHaveLength(2);
    const reqs = await prisma.signatureRequest.findMany({ where: { id: { in: ids } }, include: { signers: true } });
    for (const x of reqs) {
      expect(x).toMatchObject({ contractKind: 'WORK', contractFlow: 'V2', isCaseContract: false, companyId: null });
      expect(x.signers.map((s) => s.role)).toEqual(['CANDIDATE']);
    }
    // Client: SIGN_WORK in the status line; the employer is still hidden.
    expect(expectStatus(await client.agent.get('/api/account/next-step'), 200).body.statusLine).toMatchObject({ stage: 'SIGN_WORK', required: true });
    const before = expectStatus(await client.agent.get(`/api/cases/${c.id}`), 200).body.case;
    expect(JSON.stringify(before)).not.toContain(company.name);

    for (const id of ids) expectStatus(await client.agent.post(`/api/signatures/my/${(await candidateOf(id)).id}/sign`).send({ mode: 'TYPE', typedName: 'Rauf Həsənov', agree: true }), 200);
    for (const id of ids) await completed(id);
    let view = expectStatus(await staff.agent.get(`${BASE}/${c.id}`), 200).body.steps[1];
    expect(view).toMatchObject({ state: 'SIGNED', flow: 'V2', canApprove: true });
    expect(view.documents).toHaveLength(2);

    // One document returned → approval blocked until replaced.
    expectStatus(await staff.agent.post(`${BASE}/${c.id}/return`).send({ step: 'WORK', requestId: ids[1], reason: 'Səhifə 2 imzasızdır' }), 200);
    expect(expectStatus(await staff.agent.post(`${BASE}/${c.id}/approve`).send({ step: 'WORK' }), 409).body.error).toBe('DOCUMENT_RETURNED');
    const portal = expectStatus(await client.agent.get(`/api/account/case-contracts/cases/${c.id}`), 200).body.steps[1];
    expect(portal.documents.find((d: { id: string }) => d.id === ids[1])).toMatchObject({ state: 'RETURNED', returnReason: 'Səhifə 2 imzasızdır' });
    const [replacement] = expectStatus(await upload(staff.agent, c.id, 'WORK', [{ name: 'Anlage-2', boxes: [CLIENT_BOX] }], { replacesId: ids[1] }), 201).body.signatureRequestIds as string[];
    expectStatus(await client.agent.post(`/api/signatures/my/${(await candidateOf(replacement)).id}/sign`).send({ mode: 'TYPE', typedName: 'Rauf Həsənov', agree: true }), 200);
    await completed(replacement);

    view = expectStatus(await staff.agent.get(`${BASE}/${c.id}`), 200).body.steps[1];
    expect(view.documents).toHaveLength(2);
    expectStatus(await staff.agent.post(`${BASE}/${c.id}/approve`).send({ step: 'WORK' }), 200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('EMBASSY_DOCUMENTS');
    const approved = await prisma.signatureRequest.findMany({ where: { id: { in: [ids[0], replacement] } } });
    expect(approved.every((x) => !!x.approvedAt)).toBe(true);
    // Drive: both signed copies under "<client folder>/İş müqaviləsi"; client documents list them.
    for (const x of approved) expect((await prisma.driveNode.findUniqueOrThrow({ where: { id: x.driveNodeId! }, include: { parent: true } })).parent?.name).toBe('İş müqaviləsi');
    const after = expectStatus(await client.agent.get(`/api/cases/${c.id}`), 200).body.case;
    const ids2 = (after.otherDocuments as { id: string }[]).map((d) => d.id);
    for (const x of approved) expect(ids2).toContain(x.finalDocumentId);
    for (const x of approved) expectStatus(await client.agent.get(`/api/files/${x.finalDocumentId}`), 200);
  });
});

describe('one active application per client', () => {
  it('applying to a vacancy starts the case; a second application is refused while it runs', async () => {
    const company = await createCompany();
    const v1 = await createVacancy({ companyId: company.id });
    const v2 = await createVacancy({ companyId: company.id });
    const cand = await asCandidate();
    const res = expectStatus(await cand.agent.post(`/api/vacancies/${v1.slug}/apply`).send({}), 201).body;
    expect(res.caseId).toBeTruthy();
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: res.caseId } });
    expect(kase).toMatchObject({ clientId: cand.user.id, vacancyId: v1.id, status: 'DOCUMENTS_PENDING' });

    const again = expectStatus(await cand.agent.post(`/api/vacancies/${v2.slug}/apply`).send({}), 409).body;
    expect(again).toMatchObject({ error: 'ACTIVE_CASE_EXISTS', caseId: kase.id });
    expect(expectStatus(await cand.agent.get(`/api/vacancies/${v2.slug}/me`), 200).body.activeCase).toMatchObject({ id: kase.id });
    expect(expectStatus(await cand.agent.post('/api/cases').send({ vacancyId: v2.id }), 409).body).toMatchObject({ error: 'ACTIVE_CASE_EXISTS', caseId: kase.id });

    // After the case ended a new one can be opened.
    await prisma.case.update({ where: { id: kase.id }, data: { status: 'CANCELLED' } });
    expect(expectStatus(await cand.agent.post(`/api/vacancies/${v2.slug}/apply`).send({}), 201).body.caseId).not.toBe(kase.id);
  });
});
