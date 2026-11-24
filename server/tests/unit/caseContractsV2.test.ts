import { describe, expect, it, vi } from 'vitest';
import type { CaseStatus } from '@prisma/client';
import { PDFDict, PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import {
  activeWorkSet,
  caseContractTurn,
  clientFirstSigners,
  FLOW_V2,
  sendBlockReason,
  signedFileName,
  stepState,
  workApproveBlock,
  workContractTurn,
  workSetState,
  type WorkDocLite,
} from '../../src/lib/caseContracts/flow.js';
import { buildInterimPdf, inspectPdfFields, interimPlan, resolvePlacements, stampSignatures, type Placement } from '../../src/lib/esign/placements.js';

import { PNG_BUFFER } from '../helpers/files';

vi.mock('../../src/db.js', () => ({ prisma: {} }));

const { computeBall } = await import('../../src/lib/clientProcess/ballInCourt.js');
const { DEFAULT_ETA } = await import('../../src/lib/clientProcess/settings.js');
const { nextActionOf } = await import('../../src/lib/partnerPortal/cases.js');
const { nextAction } = await import('../../src/routes/account.js');

/** Case contracts V2: the client signs first (Əmək müqaviləsi: then Triad Vision; İş müqaviləsi: client only, staff approve). */

const NOW = new Date('2026-11-22T09:00:00Z');
const DAY = 86_400_000;
let seq = 0;

const doc = (over: Partial<WorkDocLite> = {}): WorkDocLite => ({
  status: 'SENT',
  order: 'SEQUENTIAL',
  contractFlow: FLOW_V2,
  createdAt: new Date(NOW.getTime() - ++seq * 1000),
  approvedAt: null,
  expiresAt: new Date(NOW.getTime() + 10 * DAY),
  returnedAt: null,
  supersededAt: null,
  signers: [{ role: 'CANDIDATE', status: 'PENDING', order: 1 }],
  ...over,
});
const signedDoc = (over: Partial<WorkDocLite> = {}) => doc({ status: 'COMPLETED', signers: [{ role: 'CANDIDATE', status: 'SIGNED', order: 1 }], ...over });

describe('V2 Əmək müqaviləsi: client first, then Triad Vision', () => {
  it('signers: client order 1, Triad Vision order 2', () => {
    const s = clientFirstSigners({ name: 'Rauf', email: 'r@x.az' }, { name: 'Leyla', email: 'l@tv.de' });
    expect(s.map((x) => [x.role, x.order])).toEqual([
      ['CANDIDATE', 1],
      ['STAFF', 2],
    ]);
  });

  it('state and turn follow the reversed order', () => {
    const open = { status: 'SENT', order: 'SEQUENTIAL', createdAt: NOW, approvedAt: null, expiresAt: new Date(NOW.getTime() + DAY), signers: [{ role: 'CANDIDATE', status: 'PENDING', order: 1 }, { role: 'STAFF', status: 'PENDING', order: 2 }] };
    expect(stepState(open, NOW)).toBe('CLIENT_TO_SIGN');
    const clientDone = { ...open, signers: [{ role: 'CANDIDATE', status: 'SIGNED', order: 1 }, { role: 'STAFF', status: 'PENDING', order: 2 }] };
    expect(stepState(clientDone, NOW)).toBe('TRIAD_TO_SIGN');
    const esign = { signedAt: null, signatureRequestId: 'r1' };
    expect(caseContractTurn(esign, open, NOW)).toBe('CLIENT');
    expect(caseContractTurn(esign, clientDone, NOW)).toBe('TRIAD');
    // old flow unchanged: Triad Vision first
    expect(stepState({ ...open, signers: [{ role: 'STAFF', status: 'PENDING', order: 1 }, { role: 'CANDIDATE', status: 'PENDING', order: 2 }] }, NOW)).toBe('TRIAD_TO_SIGN');
  });

  it('a returned request is RETURNED (staff send a new version); a plain cancellation stays CANCELLED', () => {
    expect(stepState({ status: 'CANCELLED', returnedAt: NOW, createdAt: NOW, approvedAt: null, expiresAt: null, signers: [] })).toBe('RETURNED');
    expect(stepState({ status: 'CANCELLED', returnedAt: null, createdAt: NOW, approvedAt: null, expiresAt: null, signers: [] })).toBe('CANCELLED');
    expect(caseContractTurn({ signedAt: null, signatureRequestId: 'r1' }, { status: 'CANCELLED', order: 'SEQUENTIAL', expiresAt: null, signers: [] }, NOW)).toBe('STAFF');
  });
});

describe('V2 İş müqaviləsi: a set of 1–10 documents, signed by the client only', () => {
  it('the set: V2 requests, without superseded cancellations; returned ones stay until replaced / dropped', () => {
    const a = doc();
    const old = doc({ contractFlow: null });
    const superseded = doc({ status: 'CANCELLED' });
    const returned = doc({ status: 'CANCELLED', returnedAt: NOW });
    const replaced = doc({ status: 'CANCELLED', returnedAt: NOW, supersededAt: NOW });
    const draft = doc({ status: 'DRAFT' });
    expect(activeWorkSet([a, old, superseded, returned, replaced, draft])).toEqual([returned, a].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime()));
  });

  it('state, approval and turn of the set', () => {
    expect(workSetState([], NOW)).toBe('NOT_SENT');
    expect(workContractTurn([], NOW)).toBe('STAFF'); // staff upload the documents
    expect(workApproveBlock([], NOW)).toBe('NOTHING_TO_APPROVE');

    const mixed = [signedDoc(), doc()];
    expect(workSetState(mixed, NOW)).toBe('CLIENT_TO_SIGN');
    expect(workContractTurn(mixed, NOW)).toBe('CLIENT');
    expect(workApproveBlock(mixed, NOW)).toBe('NOT_FULLY_SIGNED');

    const all = [signedDoc(), signedDoc()];
    expect(workSetState(all, NOW)).toBe('SIGNED');
    expect(workContractTurn(all, NOW)).toBe('STAFF'); // staff review
    expect(workApproveBlock(all, NOW)).toBeNull();

    const withReturned = [signedDoc(), doc({ status: 'CANCELLED', returnedAt: NOW })];
    expect(workSetState(withReturned, NOW)).toBe('RETURNED');
    expect(workApproveBlock(withReturned, NOW)).toBe('DOCUMENT_RETURNED');

    const approved = [signedDoc({ approvedAt: NOW }), signedDoc({ approvedAt: NOW })];
    expect(workSetState(approved, NOW)).toBe('APPROVED');
    expect(workContractTurn(approved, NOW)).toBeNull();
    expect(workApproveBlock(approved, NOW)).toBe('ALREADY_APPROVED');

    expect(workSetState([doc({ expiresAt: new Date(NOW.getTime() - DAY) })], NOW)).toBe('EXPIRED');
  });

  it('İş müqaviləsi still needs the Əmək müqaviləsi approved; signed file names per document', () => {
    expect(sendBlockReason('WORK', { LABOUR: 'TRIAD_TO_SIGN', WORK: 'NOT_SENT' }, 'CONTRACT_SENT')).toBe('LABOUR_NOT_APPROVED');
    expect(sendBlockReason('WORK', { LABOUR: 'APPROVED', WORK: 'NOT_SENT' }, 'CONTRACT_SIGNED')).toBeNull();
    expect(signedFileName('WORK', 'TV-2026-0012', 'Arbeitsvertrag/Anlage 1')).toBe('İş müqaviləsi – Arbeitsvertrag Anlage 1 – TV-2026-0012 (imzalanmış).pdf');
  });
});

describe('consumers: the client signs the İş müqaviləsi in CONTRACT_SIGNED (V2)', () => {
  const settings = { eta: DEFAULT_ETA, useCategoryProcessing: true };
  const facts = (contractTurn: 'CLIENT' | 'STAFF' | null) => ({
    id: 'c1',
    status: 'CONTRACT_SIGNED' as CaseStatus,
    createdAt: new Date(NOW.getTime() - 10 * DAY),
    appointmentAt: null,
    processing: { min: null, max: null },
    contract: { signedAt: NOW, signatureRequestId: 'r1' },
    contractTurn,
    uploadReqs: [],
    pendingDocs: 0,
    tasks: [],
    pendingSignatures: 0,
    lastClientMsg: null,
    lastStaffMsg: null,
    statusEvents: [],
  });

  it('ball in court: CLIENT signs; STAFF / old flow check the signature', () => {
    const c = computeBall(facts('CLIENT'), settings, NOW);
    expect(c).toMatchObject({ side: 'CLIENT', reason: 'SIGN_CONTRACT' });
    expect(c.items.some((i) => i.reason === 'CHECK_SIGNATURE')).toBe(false);
    expect(computeBall(facts('STAFF'), settings, NOW)).toMatchObject({ side: 'TEAM', reason: 'CHECK_SIGNATURE' });
    expect(computeBall(facts(null), settings, NOW)).toMatchObject({ side: 'TEAM', reason: 'CHECK_SIGNATURE' });
  });

  it('ball in court (V2): the team sends the İş müqaviləsi documents, then approves the signed set — no "check the signature"', () => {
    const v2 = (work: 'NOT_SENT' | 'SIGNED' | 'RETURNED' | 'CLIENT_TO_SIGN') => ({ ...facts(work === 'CLIENT_TO_SIGN' ? 'CLIENT' : 'STAFF'), workContract: work });
    expect(computeBall(v2('NOT_SENT'), settings, NOW)).toMatchObject({ side: 'TEAM', reason: 'SEND_WORK_CONTRACT' });
    expect(computeBall(v2('RETURNED'), settings, NOW)).toMatchObject({ side: 'TEAM', reason: 'SEND_WORK_CONTRACT' });
    expect(computeBall(v2('SIGNED'), settings, NOW)).toMatchObject({ side: 'TEAM', reason: 'APPROVE_WORK_CONTRACT' });
    const client = computeBall(v2('CLIENT_TO_SIGN'), settings, NOW);
    expect(client).toMatchObject({ side: 'CLIENT', reason: 'SIGN_CONTRACT' });
    expect(client.items.some((i) => i.side === 'TEAM' && i.reason !== 'REPLY_MESSAGE')).toBe(false);
    for (const w of ['NOT_SENT', 'SIGNED'] as const) expect(computeBall(v2(w), settings, NOW).items.some((i) => i.reason === 'CHECK_SIGNATURE')).toBe(false);
    // Əmək müqaviləsi signed by the client, Triad Vision's turn: the team signs.
    expect(computeBall({ ...facts(null), contractTurn: 'TRIAD' as const, status: 'CONTRACT_SENT' as CaseStatus, contract: { signedAt: null, signatureRequestId: 'r1' } }, settings, NOW)).toMatchObject({ side: 'TEAM', reason: 'TRIAD_SIGN_CONTRACT' });
  });

  it('partner portal and the client next action', () => {
    expect(nextActionOf('CONTRACT_SIGNED', 0, 'CLIENT')).toBe('SIGN_CONTRACT');
    expect(nextActionOf('CONTRACT_SIGNED', 0, 'STAFF')).toBe('WAIT_CONTRACT_CHECK');
    expect(nextActionOf('CONTRACT_SENT', 0, 'TRIAD')).toBe('WAIT_CONTRACT_CHECK');
    const docs = { stage: 'INITIAL', rejected: 0, missingRequired: 0 } as Parameters<typeof nextAction>[1];
    expect(nextAction('CONTRACT_SIGNED', docs, 'CLIENT')).toMatchObject({ kind: 'SIGN_CONTRACT', owner: 'client' });
    expect(nextAction('CONTRACT_SIGNED', docs, null)).toMatchObject({ kind: 'WAIT_REVIEW', owner: 'staff' });
  });
});

describe('signature places on the original pages (lib/esign/placements)', () => {
  const pdfWithFields = async () => {
    const d = await PDFDocument.create();
    const p1 = d.addPage([595, 842]);
    d.addPage([595, 842]);
    const form = d.getForm();
    const f = form.createTextField('client_signature');
    f.addToPage(p1, { x: 60, y: 100, width: 200, height: 50 });
    return Buffer.from(await d.save());
  };

  it('finds AcroForm fields with page and rectangle', async () => {
    const info = await inspectPdfFields(await pdfWithFields());
    expect(info.pages).toHaveLength(2);
    // pdf-lib draws the widget with a 1 pt border around the requested box
    expect(info.fields).toEqual([{ name: 'client_signature', type: 'text', page: 1, x: 59.5, y: 99.5, w: 201, h: 51 }]);
  });

  it('field placements take the rectangle from the PDF; wrong page / unknown field are refused', async () => {
    const buf = await pdfWithFields();
    const out = await resolvePlacements(buf, [
      { role: 'CANDIDATE', page: 1, x: 0, y: 0, w: 10, h: 10, field: 'client_signature' },
      { role: 'STAFF', page: 2, x: 300, y: 100, w: 180, h: 50 },
    ]);
    expect(out).toEqual([
      { role: 'CANDIDATE', page: 1, x: 59.5, y: 99.5, w: 201, h: 51, field: 'client_signature' },
      { role: 'STAFF', page: 2, x: 300, y: 100, w: 180, h: 50 },
    ]);
    await expect(resolvePlacements(buf, [{ role: 'CANDIDATE', page: 3, x: 0, y: 0, w: 10, h: 10 }])).rejects.toMatchObject({ code: 'PLACEMENT_PAGE' });
    await expect(resolvePlacements(buf, [{ role: 'CANDIDATE', page: 1, x: 0, y: 0, w: 10, h: 10, field: 'nope' }])).rejects.toMatchObject({ code: 'PLACEMENT_FIELD' });
  });

  it('stamps into the places (no extra page) and removes the mapped field', async () => {
    const d = await PDFDocument.load(await pdfWithFields());
    await d.embedFont(StandardFonts.Helvetica);
    await stampSignatures(
      d,
      [
        { role: 'CANDIDATE', name: 'Rauf Həsənov', signedAt: NOW, typedName: 'Rauf Həsənov' },
        { role: 'STAFF', name: 'Leyla', signedAt: NOW, typedName: 'Leyla' },
      ],
      [
        { role: 'CANDIDATE', page: 1, x: 60, y: 100, w: 200, h: 50, field: 'client_signature' },
        { role: 'STAFF', page: 2, x: 300, y: 100, w: 180, h: 50 },
      ],
    );
    expect(d.getPageCount()).toBe(2);
    expect(d.getForm().getFieldMaybe('client_signature')).toBeUndefined();
    const again = await PDFDocument.load(await d.save());
    expect(again.getPageCount()).toBe(2);
  });
});

describe('interim PDF while a V2 request is being signed (lib/esign/placements)', () => {
  const places: Placement[] = [
    { role: 'CANDIDATE', page: 1, x: 60, y: 100, w: 200, h: 50, field: 'client_signature' },
    { role: 'STAFF', page: 1, x: 320, y: 100, w: 200, h: 50 },
  ];
  const signer = (role: string, status: string, order: number) => ({ role, status, order });

  it('selects the signatures given so far and only their places', () => {
    const clientSigned = interimPlan('SENT', [signer('STAFF', 'PENDING', 2), signer('CANDIDATE', 'SIGNED', 1)], places);
    expect(clientSigned).toEqual({ signers: [signer('CANDIDATE', 'SIGNED', 1)], placements: [places[0]] });
    // nobody signed, no places (old flow: signature page at completion), not in progress any more → no interim copy
    expect(interimPlan('SENT', [signer('CANDIDATE', 'PENDING', 1), signer('STAFF', 'PENDING', 2)], places)).toBeNull();
    expect(interimPlan('SENT', [signer('CANDIDATE', 'SIGNED', 1)], null)).toBeNull();
    expect(interimPlan('SENT', [signer('CANDIDATE', 'SIGNED', 1)], [])).toBeNull();
    for (const status of ['COMPLETED', 'CANCELLED', 'DECLINED', 'DRAFT']) expect(interimPlan(status, [signer('CANDIDATE', 'SIGNED', 1)], places)).toBeNull();
    // like the final stamp: the FIRST signer of a role fills its places
    expect(interimPlan('SENT', [signer('CANDIDATE', 'PENDING', 1), signer('CANDIDATE', 'SIGNED', 2)], places)).toBeNull();
  });

  it('stamps the client signature into its place; the Triad Vision place and the original stay untouched', async () => {
    const d = await PDFDocument.create();
    const p1 = d.addPage([595, 842]);
    const form = d.getForm();
    form.createTextField('client_signature').addToPage(p1, { x: 60, y: 100, width: 200, height: 50 });
    form.createTextField('triad_signature').addToPage(p1, { x: 320, y: 30, width: 200, height: 50 });
    const original = Buffer.from(await d.save());
    const copy = Buffer.from(original);
    const plan = interimPlan('SENT', [signer('CANDIDATE', 'SIGNED', 1), signer('STAFF', 'PENDING', 2)], places)!;
    const out = await buildInterimPdf(original, [{ role: 'CANDIDATE', name: 'Rauf Həsənov', signedAt: NOW, imagePng: PNG_BUFFER }], plan.placements);
    expect(Buffer.compare(original, copy)).toBe(0);
    const again = await PDFDocument.load(out);
    expect(again.getPageCount()).toBe(1);
    expect(again.getForm().getFieldMaybe('client_signature')).toBeUndefined();
    expect(again.getForm().getFieldMaybe('triad_signature')).toBeDefined();
    const xobjects = again.getPages()[0].node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    expect(xobjects?.keys().length ?? 0).toBeGreaterThan(0);
  });
});
