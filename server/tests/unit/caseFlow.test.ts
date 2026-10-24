import type { CaseStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const prisma = {
    case: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    setting: { findUnique: vi.fn() },
    requirementTemplate: { findMany: vi.fn() },
    webhook: { findMany: vi.fn() },
    webhookDelivery: { createMany: vi.fn() },
    caseEvent: { create: vi.fn() },
    contract: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    documentRequirement: { findMany: vi.fn(), count: vi.fn(), createMany: vi.fn() },
    user: { findFirstOrThrow: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
  return { prisma };
});

vi.mock('../../src/db.js', () => ({ prisma: db.prisma }));
vi.mock('../../src/lib/notifications.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/notifications.js')>()),
  notifyClient: vi.fn(),
  notifyStaff: vi.fn(),
}));
// The four-eyes gate has its own e2e tests; here it always passes.
vi.mock('../../src/lib/caseNext/fourEyes.js', () => ({ assertFourEyes: vi.fn() }));

const flow = await import('../../src/lib/caseFlow.js');
const { notifyClient, notifyStaff } = await import('../../src/lib/notifications.js');
const { HttpError } = await import('../../src/lib/http.js');

const p = db.prisma;
const CASE_ID = 'case1';
const ACTOR = 'staff1';
const ALL: CaseStatus[] = [
  'DOCUMENTS_PENDING',
  'DOCUMENTS_REVIEW',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'EMBASSY_DOCUMENTS',
  'EMBASSY_REVIEW',
  'APPOINTMENT_SCHEDULED',
  'DECISION_PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

/** In-memory case whose status follows the conditional update, like the real DB. */
let current: { id: string; number: string; clientId: string; status: CaseStatus };

const setStatus = (status: CaseStatus) => {
  current = { id: CASE_ID, number: 'TV-2026-0001', clientId: 'client1', status };
};

const expectHttp = async (promise: Promise<unknown>, status: number, code: string) => {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpError);
  expect(err).toMatchObject({ status, code });
};

beforeEach(() => {
  vi.clearAllMocks();
  setStatus('DOCUMENTS_PENDING');
  p.$transaction.mockImplementation(async (fn: (tx: typeof p) => unknown) => fn(p));
  p.case.findUnique.mockImplementation(async () => ({ ...current }));
  p.case.updateMany.mockImplementation(async (args: { where: { status: { in: CaseStatus[] } }; data: { status: CaseStatus } }) => {
    if (!args.where.status.in.includes(current.status)) return { count: 0 };
    current.status = args.data.status;
    return { count: 1 };
  });
  p.case.count.mockResolvedValue(0);
  p.documentRequirement.findMany.mockResolvedValue([]);
  p.documentRequirement.count.mockResolvedValue(0);
  p.contract.findUnique.mockResolvedValue(null);
  p.user.findFirstOrThrow.mockResolvedValue({ id: 'client1', locale: 'en' });
  p.user.findMany.mockResolvedValue([]);
  p.case.findUniqueOrThrow.mockImplementation(async () => ({ ...current, visaCategoryId: null }));
  p.case.findMany.mockResolvedValue([]);
  p.case.groupBy.mockResolvedValue([]);
  // auto-assignment off, no templates (built-in defaults), no webhooks
  p.setting.findUnique.mockResolvedValue(null);
  p.requirementTemplate.findMany.mockResolvedValue([]);
  p.webhook.findMany.mockResolvedValue([]);
});

/** Every staff/client action with the statuses it may start from (all others must give 409). */
const actions: { name: string; allowed: CaseStatus[]; to: (from: CaseStatus) => CaseStatus; run: () => Promise<unknown> }[] = [
  {
    name: 'staffRequestChanges',
    allowed: ['DOCUMENTS_REVIEW', 'EMBASSY_REVIEW'],
    to: (from) => (from === 'DOCUMENTS_REVIEW' ? 'DOCUMENTS_PENDING' : 'EMBASSY_DOCUMENTS'),
    run: () => flow.staffRequestChanges(CASE_ID, ACTOR, 'fix it'),
  },
  {
    name: 'staffSendContract',
    allowed: ['DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED'],
    to: () => 'CONTRACT_SENT',
    run: () => flow.staffSendContract(CASE_ID, ACTOR, 'doc1'),
  },
  {
    name: 'clientSignContract',
    allowed: ['CONTRACT_SENT'],
    to: () => 'CONTRACT_SIGNED',
    run: () => flow.clientSignContract(CASE_ID, 'client1', { signerName: 'A B', signedDocumentId: 'd', ip: '1', userAgent: 'ua' }),
  },
  {
    name: 'staffRejectSignature',
    allowed: ['CONTRACT_SIGNED'],
    to: () => 'CONTRACT_SENT',
    run: () => flow.staffRejectSignature(CASE_ID, ACTOR, 'bad'),
  },
  {
    name: 'staffConfirmContract',
    allowed: ['CONTRACT_SIGNED'],
    to: () => 'EMBASSY_DOCUMENTS',
    run: () => flow.staffConfirmContract(CASE_ID, ACTOR),
  },
  {
    name: 'staffScheduleAppointment',
    allowed: ['EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED'],
    to: () => 'APPOINTMENT_SCHEDULED',
    run: () => flow.staffScheduleAppointment(CASE_ID, ACTOR, { at: new Date('2026-11-20T05:30:00Z'), place: 'Embassy' }),
  },
  {
    name: 'staffMarkLodged',
    allowed: ['APPOINTMENT_SCHEDULED'],
    to: () => 'DECISION_PENDING',
    run: () => flow.staffMarkLodged(CASE_ID, ACTOR),
  },
  {
    name: 'staffDecide(APPROVED)',
    allowed: ['DECISION_PENDING'],
    to: () => 'APPROVED',
    run: () => flow.staffDecide(CASE_ID, ACTOR, { decision: 'APPROVED' }),
  },
  {
    name: 'staffDecide(REJECTED)',
    allowed: ['DECISION_PENDING'],
    to: () => 'REJECTED',
    run: () => flow.staffDecide(CASE_ID, ACTOR, { decision: 'REJECTED', reason: 'no funds' }),
  },
  {
    name: 'staffCancel',
    allowed: ALL.filter((s) => !flow.FINAL_STATUSES.includes(s)),
    to: () => 'CANCELLED',
    run: () => flow.staffCancel(CASE_ID, ACTOR, 'client withdrew'),
  },
  {
    name: 'staffReopen',
    allowed: ['REJECTED', 'CANCELLED'],
    to: () => 'EMBASSY_DOCUMENTS',
    run: () => flow.staffReopen(CASE_ID, ACTOR, 'EMBASSY_DOCUMENTS', 'again'),
  },
  {
    name: 'clientSubmitDocuments',
    allowed: ['DOCUMENTS_PENDING', 'EMBASSY_DOCUMENTS'],
    to: (from) => (from === 'DOCUMENTS_PENDING' ? 'DOCUMENTS_REVIEW' : 'EMBASSY_REVIEW'),
    run: () => flow.clientSubmitDocuments(CASE_ID, 'client1'),
  },
];

describe('caseFlow transition guards', () => {
  for (const a of actions) {
    describe(a.name, () => {
      for (const from of ALL) {
        const allowed = a.allowed.includes(from);
        it(`${allowed ? 'allows' : 'refuses'} ${from}`, async () => {
          setStatus(from);
          if (allowed) {
            await a.run();
            expect(current.status).toBe(a.to(from));
            expect(p.caseEvent.create).toHaveBeenCalledWith(
              expect.objectContaining({ data: expect.objectContaining({ caseId: CASE_ID, fromStatus: from, toStatus: a.to(from) }) }),
            );
          } else {
            await expectHttp(a.run(), 409, 'INVALID_TRANSITION');
            expect(current.status).toBe(from);
            expect(p.caseEvent.create).not.toHaveBeenCalled();
          }
        });
      }
    });
  }

  it('reports CASE_NOT_FOUND for an unknown case', async () => {
    p.case.findUnique.mockResolvedValue(null);
    await expectHttp(flow.staffMarkLodged('nope', ACTOR), 404, 'CASE_NOT_FOUND');
    await expectHttp(flow.staffRequestChanges('nope', ACTOR, 'x'), 404, 'CASE_NOT_FOUND');
  });

  it('turns a lost race (conditional update matched 0 rows) into 409', async () => {
    setStatus('APPOINTMENT_SCHEDULED');
    p.case.updateMany.mockResolvedValueOnce({ count: 0 });
    await expectHttp(flow.staffMarkLodged(CASE_ID, ACTOR), 409, 'INVALID_TRANSITION');
    expect(p.caseEvent.create).not.toHaveBeenCalled();
    expect(notifyClient).not.toHaveBeenCalled();
  });
});

describe('document preconditions', () => {
  const req = (id: string, statuses: string[]) => ({ id, documents: statuses.map((status) => ({ status })) });

  it('client submit needs a non-rejected upload for every required document', async () => {
    setStatus('DOCUMENTS_PENDING');
    p.documentRequirement.findMany.mockResolvedValue([req('r1', ['PENDING']), req('r2', ['REJECTED']), req('r3', [])]);
    const err = await flow.clientSubmitDocuments(CASE_ID, 'client1').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 400, code: 'REQUIRED_DOCUMENTS_MISSING', message: 'r2,r3' });
    expect(p.documentRequirement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { caseId: CASE_ID, stage: 'INITIAL', required: true } }),
    );
    expect(current.status).toBe('DOCUMENTS_PENDING');
  });

  it('client submit accepts a rejected document once a new upload exists', async () => {
    p.documentRequirement.findMany.mockResolvedValue([req('r1', ['REJECTED', 'PENDING']), req('r2', ['ACCEPTED'])]);
    await flow.clientSubmitDocuments(CASE_ID, 'client1');
    expect(current.status).toBe('DOCUMENTS_REVIEW');
    expect(notifyStaff).toHaveBeenCalledTimes(1);
  });

  it('client submit checks EMBASSY requirements during the embassy stage', async () => {
    setStatus('EMBASSY_DOCUMENTS');
    await flow.clientSubmitDocuments(CASE_ID, 'client1');
    expect(p.documentRequirement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { caseId: CASE_ID, stage: 'EMBASSY', required: true } }),
    );
  });

  it('client submit refuses someone else’s case with 404', async () => {
    await expectHttp(flow.clientSubmitDocuments(CASE_ID, 'intruder'), 404, 'CASE_NOT_FOUND');
  });

  it('clientSignContract refuses someone else’s case with 404', async () => {
    setStatus('CONTRACT_SENT');
    await expectHttp(
      flow.clientSignContract(CASE_ID, 'intruder', { signerName: 'x', signedDocumentId: 'd', ip: '', userAgent: '' }),
      404,
      'CASE_NOT_FOUND',
    );
  });

  it('sending the contract from DOCUMENTS_REVIEW needs every required INITIAL document ACCEPTED', async () => {
    setStatus('DOCUMENTS_REVIEW');
    p.documentRequirement.findMany.mockResolvedValue([req('r1', ['ACCEPTED']), req('r2', ['PENDING'])]);
    const err = await flow.staffSendContract(CASE_ID, ACTOR, 'doc').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 400, code: 'REQUIRED_DOCUMENTS_NOT_ACCEPTED', message: 'r2' });
    expect(current.status).toBe('DOCUMENTS_REVIEW');
  });

  it('re-sending a contract bumps the version and clears the signature', async () => {
    setStatus('CONTRACT_SIGNED');
    p.contract.findUnique.mockResolvedValue({ caseId: CASE_ID, version: 2 });
    await flow.staffSendContract(CASE_ID, ACTOR, 'doc2');
    expect(p.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fileDocumentId: 'doc2', signedDocumentId: null, signedAt: null, version: 3 }),
      }),
    );
    expect(p.contract.create).not.toHaveBeenCalled();
    expect(notifyClient).toHaveBeenCalledWith(CASE_ID, 'CONTRACT_SENT', undefined);
  });

  it('first contract is created', async () => {
    setStatus('DOCUMENTS_REVIEW');
    await flow.staffSendContract(CASE_ID, ACTOR, 'doc1');
    expect(p.contract.create).toHaveBeenCalledWith({ data: { caseId: CASE_ID, fileDocumentId: 'doc1' } });
  });

  it('scheduling from EMBASSY_REVIEW needs every required EMBASSY document ACCEPTED', async () => {
    setStatus('EMBASSY_REVIEW');
    p.documentRequirement.findMany.mockResolvedValue([req('e1', ['PENDING'])]);
    await expectHttp(
      flow.staffScheduleAppointment(CASE_ID, ACTOR, { at: new Date(), place: 'Embassy' }),
      400,
      'REQUIRED_DOCUMENTS_NOT_ACCEPTED',
    );
  });

  it('rescheduling records APPOINTMENT_RESCHEDULED and notifies with the localized date', async () => {
    setStatus('APPOINTMENT_SCHEDULED');
    await flow.staffScheduleAppointment(CASE_ID, ACTOR, { at: new Date('2026-11-20T05:30:00Z'), place: 'Embassy Baku', note: 'bring originals' });
    expect(p.caseEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'APPOINTMENT_RESCHEDULED' }) }),
    );
    expect(notifyClient).toHaveBeenCalledWith(
      CASE_ID,
      'APPOINTMENT_SCHEDULED',
      expect.objectContaining({ place: 'Embassy Baku', note: 'bring originals', date: expect.stringContaining('09:30') }),
    );
  });

  it('confirming the contract creates default EMBASSY requirements only once', async () => {
    setStatus('CONTRACT_SIGNED');
    await flow.staffConfirmContract(CASE_ID, ACTOR);
    expect(p.documentRequirement.createMany).toHaveBeenCalledTimes(1);
    const data = p.documentRequirement.createMany.mock.calls[0][0].data as { stage: string; required: boolean }[];
    expect(data.every((d) => d.stage === 'EMBASSY')).toBe(true);
    expect(data.filter((d) => d.required)).toHaveLength(4);

    setStatus('CONTRACT_SIGNED');
    p.documentRequirement.count.mockResolvedValue(7);
    await flow.staffConfirmContract(CASE_ID, ACTOR);
    expect(p.documentRequirement.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('decisions, cancel and reopen', () => {
  it.each([undefined, null, '', '   '])('REJECTED needs a reason (%j)', async (reason) => {
    setStatus('DECISION_PENDING');
    await expectHttp(flow.staffDecide(CASE_ID, ACTOR, { decision: 'REJECTED', reason }), 400, 'REASON_REQUIRED');
    expect(current.status).toBe('DECISION_PENDING');
  });

  it('APPROVED stores validity dates; REJECTED clears them', async () => {
    setStatus('DECISION_PENDING');
    const validFrom = new Date('2027-01-01');
    const validTo = new Date('2027-06-30');
    await flow.staffDecide(CASE_ID, ACTOR, { decision: 'APPROVED', validFrom, validTo });
    expect(p.case.updateMany.mock.calls[0][0].data).toMatchObject({ visaValidFrom: validFrom, visaValidTo: validTo, status: 'APPROVED' });

    setStatus('DECISION_PENDING');
    await flow.staffDecide(CASE_ID, ACTOR, { decision: 'REJECTED', reason: 'no', validFrom, validTo });
    expect(p.case.updateMany.mock.calls[1][0].data).toMatchObject({ visaValidFrom: null, visaValidTo: null, decisionReason: 'no' });
  });

  it('reopen is refused while the client has another active case', async () => {
    setStatus('REJECTED');
    p.case.count.mockResolvedValue(1);
    await expectHttp(flow.staffReopen(CASE_ID, ACTOR, 'DOCUMENTS_PENDING'), 409, 'ACTIVE_CASE_EXISTS');
    expect(current.status).toBe('REJECTED');
  });

  it('reopen to DOCUMENTS_PENDING clears decision fields and does not add embassy requirements', async () => {
    setStatus('CANCELLED');
    await flow.staffReopen(CASE_ID, ACTOR, 'DOCUMENTS_PENDING');
    expect(current.status).toBe('DOCUMENTS_PENDING');
    expect(p.case.updateMany.mock.calls[0][0].data).toMatchObject({ decisionAt: null, decisionReason: null, cancelReason: null });
    expect(p.documentRequirement.createMany).not.toHaveBeenCalled();
    expect(notifyClient).toHaveBeenCalledWith(CASE_ID, 'REOPENED', { note: undefined });
  });

  it('cancel stores the reason and notifies the client', async () => {
    setStatus('CONTRACT_SENT');
    await flow.staffCancel(CASE_ID, ACTOR, 'withdrew');
    expect(p.case.updateMany.mock.calls[0][0].data).toMatchObject({ cancelReason: 'withdrew' });
    expect(notifyClient).toHaveBeenCalledWith(CASE_ID, 'CANCELLED', { reason: 'withdrew' });
  });
});

describe('createCase', () => {
  const year = new Date().getFullYear();

  beforeEach(() => {
    p.case.create.mockImplementation(async ({ data }: { data: { number: string } }) => ({ id: 'new', status: 'DOCUMENTS_PENDING', ...data }));
  });

  it('refuses a second active case', async () => {
    p.case.count.mockResolvedValue(1);
    await expectHttp(flow.createCase('client1', { profession: 'Driver' }), 409, 'ACTIVE_CASE_EXISTS');
    expect(p.case.count).toHaveBeenCalledWith({ where: { clientId: 'client1', parentCaseId: null, status: { notIn: flow.FINAL_STATUSES } } });
    expect(p.case.create).not.toHaveBeenCalled();
  });

  it('numbers the first case of the year TV-YYYY-0001', async () => {
    p.$queryRaw.mockResolvedValue([{ n: null }]);
    const c = await flow.createCase('client1', { profession: 'Driver' });
    expect(c.number).toBe(`TV-${year}-0001`);
    expect(c.number).toMatch(/^TV-\d{4}-\d{4}$/);
    // the max is computed numerically in SQL, scoped to this year's prefix
    const [sql, ...params] = p.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(sql.join('?')).toMatch(/MAX\(CAST\(SUBSTRING/);
    expect(params).toContain(`TV-${year}-%`);
  });

  it('increments the last number of the year', async () => {
    p.$queryRaw.mockResolvedValue([{ n: 41n }]);
    expect((await flow.createCase('client1', { profession: 'Driver' })).number).toBe(`TV-${year}-0042`);
    p.$queryRaw.mockResolvedValue([{ n: 999 }]);
    expect((await flow.createCase('client1', { profession: 'Driver' })).number).toBe(`TV-${year}-1000`);
    // past 9999 the number simply grows to 5 digits (string ordering used to break here)
    p.$queryRaw.mockResolvedValue([{ n: 9999n }]);
    expect((await flow.createCase('client1', { profession: 'Driver' })).number).toBe(`TV-${year}-10000`);
    p.$queryRaw.mockResolvedValue([{ n: 10000n }]);
    expect((await flow.createCase('client1', { profession: 'Driver' })).number).toBe(`TV-${year}-10001`);
  });

  it('creates the 4 required + 3 optional INITIAL requirements, a CASE_CREATED event and notifications', async () => {
    p.$queryRaw.mockResolvedValue([{ n: null }]);
    await flow.createCase('client1', { profession: 'Driver', visaCategoryId: 'v1' });
    const data = p.documentRequirement.createMany.mock.calls[0][0].data as { stage: string; required: boolean; sortOrder: number }[];
    expect(data).toHaveLength(7);
    expect(data.filter((d) => d.required)).toHaveLength(4);
    expect(data.map((d) => d.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(p.caseEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'CASE_CREATED', toStatus: 'DOCUMENTS_PENDING' }) }),
    );
    expect(notifyClient).toHaveBeenCalledWith('new', 'CASE_CREATED');
    expect(notifyStaff).toHaveBeenCalledTimes(1);
  });

  it('retries when two cases race for the same number (P2002)', async () => {
    p.$queryRaw.mockResolvedValue([{ n: null }]);
    p.$transaction.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    const c = await flow.createCase('client1', { profession: 'Driver' });
    expect(c.number).toBe(`TV-${year}-0001`);
    expect(p.$transaction).toHaveBeenCalledTimes(2);
  });

  it('gives up with CASE_NUMBER_RACE after 5 collisions', async () => {
    p.$transaction.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    await expectHttp(flow.createCase('client1', { profession: 'Driver' }), 409, 'CASE_NUMBER_RACE');
    expect(p.$transaction).toHaveBeenCalledTimes(5);
  });

  it('rethrows other errors immediately', async () => {
    p.$transaction.mockRejectedValueOnce(new Error('db down'));
    await expect(flow.createCase('client1', { profession: 'Driver' })).rejects.toThrow('db down');
    expect(p.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('CLIENT_UPLOAD_STAGE', () => {
  it('only allows uploads while the client is collecting documents', () => {
    expect(flow.CLIENT_UPLOAD_STAGE).toEqual({ DOCUMENTS_PENDING: 'INITIAL', EMBASSY_DOCUMENTS: 'EMBASSY' });
  });
});
