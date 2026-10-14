import type { CaseStatus } from '@prisma/client';
import type { Response } from 'supertest';
import type { Agent } from './api';
import { makePdf, PDF, SIGNATURE_DATA_URL } from './files';

/** Throws with the response body when the status is not the expected one (clearer than a bare expect). */
export const expectStatus = (res: Response, status: number) => {
  if (res.status !== status) {
    throw new Error(`Expected HTTP ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res;
};

interface Requirement {
  id: string;
  stage: string;
  required: boolean;
  documents: { id: string; status: string }[];
}
export interface CaseDetail {
  id: string;
  number: string;
  status: CaseStatus;
  requirements: Requirement[];
  contract: null | { file: { id: string } | null; signedFile: { id: string } | null; signedAt: string | null; version: number };
  [key: string]: unknown;
}

export const createCaseVia = async (client: Agent, profession = 'LKW sürücüsü') =>
  expectStatus(await client.post('/api/cases').send({ profession }), 201).body.case as { id: string; number: string };

export const clientCase = async (client: Agent, caseId: string) =>
  expectStatus(await client.get(`/api/cases/${caseId}`), 200).body.case as CaseDetail;

export const adminCase = async (admin: Agent, caseId: string) =>
  expectStatus(await admin.get(`/api/admin/cases/${caseId}`), 200).body.case as CaseDetail;

export const uploadDoc = async (client: Agent, caseId: string, requirementId: string, filename = 'doc.pdf') =>
  client
    .post(`/api/cases/${caseId}/documents`)
    .field('requirementId', requirementId)
    .attach('file', await makePdf('doc'), { filename, ...PDF });

export const uploadRequired = async (client: Agent, caseId: string, stage: 'INITIAL' | 'EMBASSY') => {
  const c = await clientCase(client, caseId);
  for (const r of c.requirements.filter((q) => q.stage === stage && q.required)) {
    expectStatus(await uploadDoc(client, caseId, r.id), 201);
  }
};

export const reviewAll = async (admin: Agent, caseId: string, stage: 'INITIAL' | 'EMBASSY', status = 'ACCEPTED') => {
  const c = await adminCase(admin, caseId);
  for (const r of c.requirements.filter((q) => q.stage === stage)) {
    for (const d of r.documents.filter((x) => x.status === 'PENDING')) {
      expectStatus(await admin.post(`/api/admin/cases/${caseId}/documents/${d.id}/review`).send({ status }), 200);
    }
  }
};

export const sendContract = async (admin: Agent, caseId: string, pages = 1) =>
  admin
    .post(`/api/admin/cases/${caseId}/documents`)
    .field('stage', 'CONTRACT')
    .attach('file', await makePdf('EMPLOYMENT CONTRACT', pages), { filename: 'müqavilə.pdf', ...PDF });

export const signContract = (client: Agent, caseId: string, signerName = 'Əli Məmmədov') =>
  client.post(`/api/cases/${caseId}/contract/sign`).send({ signerName, signature: SIGNATURE_DATA_URL, agree: true });

export const act = (admin: Agent, caseId: string, body: Record<string, unknown>) =>
  admin.post(`/api/admin/cases/${caseId}/actions`).send(body);

const ORDER: CaseStatus[] = [
  'DOCUMENTS_PENDING',
  'DOCUMENTS_REVIEW',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'EMBASSY_DOCUMENTS',
  'EMBASSY_REVIEW',
  'APPOINTMENT_SCHEDULED',
  'DECISION_PENDING',
];

/**
 * Creates a case for `client` and drives it through the real API to `target`.
 * APPROVED/REJECTED go through DECISION_PENDING; CANCELLED cancels a fresh case.
 */
export const driveCaseTo = async (target: CaseStatus, actors: { client: Agent; admin: Agent }) => {
  const { client, admin } = actors;
  const created = await createCaseVia(client);
  const id = created.id;
  if (target === 'CANCELLED') {
    expectStatus(await act(admin, id, { action: 'CANCEL', reason: 'Test cancel' }), 200);
    return created;
  }
  const stopAt = target === 'APPROVED' || target === 'REJECTED' ? ORDER.length - 1 : ORDER.indexOf(target);
  if (stopAt < 0) throw new Error(`driveCaseTo: unsupported status ${target}`);

  const steps: (() => Promise<unknown>)[] = [
    // → DOCUMENTS_REVIEW
    async () => {
      await uploadRequired(client, id, 'INITIAL');
      expectStatus(await client.post(`/api/cases/${id}/submit`), 200);
    },
    // → CONTRACT_SENT
    async () => {
      await reviewAll(admin, id, 'INITIAL');
      expectStatus(await sendContract(admin, id), 201);
    },
    // → CONTRACT_SIGNED
    async () => expectStatus(await signContract(client, id), 200),
    // → EMBASSY_DOCUMENTS
    async () => expectStatus(await act(admin, id, { action: 'CONFIRM_CONTRACT' }), 200),
    // → EMBASSY_REVIEW
    async () => {
      await uploadRequired(client, id, 'EMBASSY');
      expectStatus(await client.post(`/api/cases/${id}/submit`), 200);
    },
    // → APPOINTMENT_SCHEDULED
    async () => {
      await reviewAll(admin, id, 'EMBASSY');
      expectStatus(
        await act(admin, id, { action: 'SCHEDULE_APPOINTMENT', at: '2026-11-20T09:30:00+04:00', place: 'Embassy Baku' }),
        200,
      );
    },
    // → DECISION_PENDING
    async () => expectStatus(await act(admin, id, { action: 'MARK_LODGED' }), 200),
  ];
  for (let i = 0; i < stopAt; i++) await steps[i]();

  if (target === 'APPROVED') expectStatus(await act(admin, id, { action: 'DECIDE', decision: 'APPROVED' }), 200);
  if (target === 'REJECTED') {
    expectStatus(await act(admin, id, { action: 'DECIDE', decision: 'REJECTED', reason: 'Insufficient funds' }), 200);
  }
  return created;
};
