import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../helpers/db';
import { asStaff } from '../helpers/api';
import { binaryParser } from '../helpers/files';
import { uniq } from '../helpers/factories';
import { storedPath } from '../../src/lib/esign/service.js';
import { asCandidate, asCompany, cleanJobs } from './vacancies.fixtures';

beforeEach(cleanJobs);

const DAY = 24 * 60 * 60 * 1000;
const hash = () => crypto.randomBytes(32).toString('hex');

/**
 * One employer with four workers in different phases, plus a worker of another company:
 *  - inProc: documents stage
 *  - travel: visa approved, flight in 10 days, visa valid 20 days
 *  - working: arrived 40 days ago, probation ends in 7 days, residence title in 60 days, HIGH risk,
 *    worker check-in "ISSUE" with a private comment and HEALTH topic, employer check-in open
 *  - left: arrived and left the job
 */
const setup = async () => {
  const employer = await asCompany();
  const other = await asCompany();
  const staff = await asStaff({ firstName: 'Lena', lastName: 'Manager', email: `${uniq('mgr')}@triad.test` });
  const now = Date.now();
  const mk = async (firstName: string, data: Record<string, unknown>, companyId = employer.company.id) => {
    const c = await asCandidate({ firstName, lastName: 'Quliyev', passportNumber: `P${firstName.toUpperCase()}99` });
    const kase = await prisma.case.create({ data: { number: uniq('TV-'), clientId: c.user.id, profession: 'Pflegekraft', companyId, ...data } });
    return { ...c, kase };
  };
  const inProc = await mk('Aysel', { createdAt: new Date(now - 5 * DAY) });
  const travel = await mk('Babək', { status: 'APPROVED', decisionAt: new Date(now - 3 * DAY), visaValidTo: new Date(now + 20 * DAY) });
  await prisma.arrivalPlan.create({ data: { caseId: travel.kase.id, clientId: travel.user.id, status: 'CONFIRMED', flightDate: new Date(now + 10 * DAY), flightNumber: 'J2 777' } });
  const working = await mk('Cavid', { status: 'APPROVED', decisionAt: new Date(now - 60 * DAY), residenceTitleExpiresAt: new Date(now + 60 * DAY), assignedStaffId: staff.user.id });
  await prisma.arrivalPlan.create({ data: { caseId: working.kase.id, clientId: working.user.id, status: 'COMPLETED', arrivalTime: new Date(now - 40 * DAY) } });
  await prisma.employmentContract.create({ data: { caseId: working.kase.id, companyId: employer.company.id, jobTitle: 'Pflegefachkraft Station 3', startDate: new Date(now - 38 * DAY), probationEndsAt: new Date(now + 7 * DAY), grossMonthly: 7777.77 } });
  const fu = await prisma.arrivalFollowUp.create({
    data: {
      caseId: working.kase.id,
      clientId: working.user.id,
      companyId: employer.company.id,
      arrivedAt: new Date(now - 40 * DAY),
      riskScore: 70,
      riskLevel: 'HIGH',
      riskReasons: [
        { code: 'WORKER_ISSUE', points: 15, params: { count: 1 } },
        { code: 'TOPIC', points: 6, params: { topic: 'HEALTH' } },
        { code: 'OPEN_ISSUE', points: 10, params: { count: 1 } },
        { code: 'PROBATION_SOON', points: 15, params: { days: 7 } },
      ],
    },
  });
  await prisma.arrivalCheckIn.create({
    data: { followUpId: fu.id, caseId: working.kase.id, audience: 'WORKER', offsetDays: 30, dueAt: new Date(now - 10 * DAY), sentAt: new Date(now - 10 * DAY), tokenHash: hash(), answer: 'ISSUE', topics: ['HEALTH'], comment: 'Rückenschmerzen geheim', answeredAt: new Date(now - 9 * DAY) },
  });
  const empCheckIn = await prisma.arrivalCheckIn.create({
    data: { followUpId: fu.id, caseId: working.kase.id, audience: 'EMPLOYER', offsetDays: 30, dueAt: new Date(now - 10 * DAY), sentAt: new Date(now - 10 * DAY), tokenHash: hash() },
  });
  const left = await mk('Dilarə', { status: 'APPROVED', decisionAt: new Date(now - 200 * DAY) });
  await prisma.arrivalPlan.create({ data: { caseId: left.kase.id, clientId: left.user.id, status: 'COMPLETED', arrivalTime: new Date(now - 150 * DAY) } });
  await prisma.arrivalFollowUp.create({ data: { caseId: left.kase.id, clientId: left.user.id, companyId: employer.company.id, arrivedAt: new Date(now - 150 * DAY), leftJobAt: new Date(now - 20 * DAY), leftReason: 'OTHER', leftNote: 'privat' } });
  const foreign = await mk('Fremd', {}, other.company.id);

  // A contract the employer still has to sign (portal signer = the employer user).
  const sig = await prisma.signatureRequest.create({
    data: {
      title: 'Arbeitsvertrag Cavid',
      caseId: working.kase.id,
      companyId: employer.company.id,
      status: 'SENT',
      sentAt: new Date(now - DAY),
      originalName: 'vertrag.pdf',
      originalKey: uniq('orig-'),
      originalSha256: 'a'.repeat(64),
      originalSize: 100,
      originalPages: 1,
      signers: { create: [{ role: 'COMPANY', userId: employer.user.id, name: 'Hans Becker', email: employer.user.email, order: 1 }] },
    },
    include: { signers: true },
  });
  // A completed one with a stored final PDF.
  const finalKey = `${Date.now()}-esign-final-${crypto.randomBytes(6).toString('hex')}.pdf`;
  await fs.writeFile(storedPath(finalKey), Buffer.from('%PDF-1.4\n% test\n'));
  const done = await prisma.signatureRequest.create({
    data: {
      title: 'Zusatzvereinbarung',
      caseId: working.kase.id,
      companyId: employer.company.id,
      status: 'COMPLETED',
      completedAt: new Date(now - 30 * DAY),
      originalName: 'zusatz.pdf',
      originalKey: uniq('orig-'),
      originalSha256: 'b'.repeat(64),
      originalSize: 100,
      originalPages: 1,
      finalKey,
      signers: { create: [{ role: 'COMPANY', userId: employer.user.id, name: 'Hans Becker', email: employer.user.email, order: 1, status: 'SIGNED', signedAt: new Date(now - 30 * DAY) }] },
    },
  });
  return { employer, other, staff, inProc, travel, working, left, foreign, sig, done, empCheckIn };
};

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('company portal: my workers panel', () => {
  it('groups own workers by phase with dates, warnings, check-ins, risk, open items and next action', async () => {
    const s = await setup();
    const res = await s.employer.agent.get('/api/company/workers');
    expect(res.status).toBe(200);
    const items = res.body.items as Row[];
    expect(items).toHaveLength(4);
    const by = (id: string) => items.find((w) => w.id === id)!;

    expect(by(s.inProc.kase.id)).toMatchObject({ phase: 'IN_PROCESS', stage: 'DOCUMENTS', next: { code: 'CONTRACT' } });
    expect(by(s.inProc.kase.id).next.to).toBeTruthy();

    const travel = by(s.travel.kase.id);
    expect(travel).toMatchObject({ phase: 'TRAVELLING', next: { code: 'ARRIVAL' }, title: { kind: 'VISA', warn: 'CRITICAL' }, nextAction: 'PREPARE_ARRIVAL' });

    const working = by(s.working.kase.id);
    expect(working).toMatchObject({
      phase: 'WORKING',
      name: 'Cavid Q.',
      position: 'Pflegefachkraft Station 3',
      title: { kind: 'RESIDENCE', warn: 'WARN' },
      probation: { warn: 'WARN' },
      // The worker's side is status-only (answered), never whether a problem was reported.
      checkIn: { worker: 'ANSWERED', employer: 'OVERDUE', overall: 'OVERDUE' },
      // Scored from the employer's own (unanswered) check-in and the probation date only: the stored HIGH
      // score comes from the worker's answers and must not show through.
      risk: { level: 'LOW' },
      nextAction: 'SIGN_DOCUMENT',
      manager: { name: 'Lena Manager' },
    });
    expect(working.arrivedAt).toBeTruthy();
    // Employer-side reasons only: nothing derived from the worker's answers.
    expect(working.risk.reasons.map((r: Row) => r.code)).toEqual(['NO_RESPONSE', 'PROBATION_SOON']);
    expect(working.openItems.map((i: Row) => i.kind).sort()).toEqual(['CHECKIN', 'SIGNATURE']);
    expect(working.openItems.find((i: Row) => i.kind === 'SIGNATURE').link).toBe(`/company/contracts/${s.sig.signers[0].id}`);

    expect(by(s.left.kase.id)).toMatchObject({ phase: 'LEFT' });
    expect(res.body.summary).toMatchObject({ inProcess: 1, travelling: 1, working: 1, left: 1, probationSoon: 1, titlesExpiring: 2, atRisk: 0, openItems: 2 });

    // Privacy: no passport numbers, last names, flight numbers, salary, worker comments, health topics or leave notes.
    const raw = JSON.stringify(res.body);
    for (const secret of ['PCAVID99', 'Quliyev', 'J2 777', '7777.77', 'Rückenschmerzen', 'HEALTH', 'privat', 'Fremd', '+994501112233']) expect(raw).not.toContain(secret);
  });

  it('shows the worker drawer only for own workers, with employer documents and status-only worker check-ins', async () => {
    const s = await setup();
    const res = await s.employer.agent.get(`/api/company/workers/${s.working.kase.id}`);
    expect(res.status).toBe(200);
    expect(res.body.worker.id).toBe(s.working.kase.id);
    expect(res.body.timeline.map((t: Row) => t.code)).toEqual(expect.arrayContaining(['STAGE_DOCUMENTS', 'STAGE_ARRIVED', 'DOCUMENT_SIGNED']));
    expect(res.body.upcoming.map((u: Row) => u.code)).toEqual(expect.arrayContaining(['PROBATION_END', 'RESIDENCE_EXPIRY']));
    const docs = res.body.documents as Row[];
    expect(docs.find((d) => d.id === s.sig.id)).toMatchObject({ status: 'SENT', downloadable: false, signLink: `/company/contracts/${s.sig.signers[0].id}` });
    expect(docs.find((d) => d.id === s.done.id)).toMatchObject({ status: 'COMPLETED', downloadable: true });
    const worker = (res.body.checkIns as Row[]).find((c) => c.audience === 'WORKER')!;
    expect(worker).toMatchObject({ state: 'ANSWERED', topics: [], comment: null });
    expect((res.body.checkIns as Row[]).find((c) => c.audience === 'EMPLOYER')).toMatchObject({ state: 'OVERDUE', link: `/check-in/${s.empCheckIn.id}` });
    expect(res.body.contact.manager).toMatchObject({ name: 'Lena Manager' });
    expect(JSON.stringify(res.body)).not.toContain('Rückenschmerzen');

    // Another company's worker, and another company asking for ours: 404.
    expect((await s.employer.agent.get(`/api/company/workers/${s.foreign.kase.id}`)).status).toBe(404);
    expect((await s.other.agent.get(`/api/company/workers/${s.working.kase.id}`)).status).toBe(404);
    expect((await s.working.agent.get(`/api/company/workers/${s.working.kase.id}`)).status).toBe(403);
  });

  it('downloads only completed documents of own workers', async () => {
    const s = await setup();
    const ok = await s.employer.agent.get(`/api/company/workers/${s.working.kase.id}/documents/signature/${s.done.id}`).buffer(true).parse(binaryParser);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toContain('application/pdf');
    expect((ok.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await s.employer.agent.get(`/api/company/workers/${s.working.kase.id}/documents/signature/${s.sig.id}`)).status).toBe(404);
    expect((await s.other.agent.get(`/api/company/workers/${s.working.kase.id}/documents/signature/${s.done.id}`)).status).toBe(404);
    expect((await s.employer.agent.get(`/api/company/workers/${s.foreign.kase.id}/documents/signature/${s.done.id}`)).status).toBe(404);
  });

  it('exports the panel as CSV in German and English', async () => {
    const s = await setup();
    const de = await s.employer.agent.get('/api/company/workers/export.csv?lang=de');
    expect(de.status).toBe(200);
    expect(de.headers['content-type']).toContain('text/csv');
    expect(de.text).toContain('Nächste Aktion');
    expect(de.text).toContain('Cavid Q.');
    expect(de.text).toContain('Dokument unterschreiben');
    expect(de.text).not.toContain('Fremd');
    expect(de.text).not.toContain('PCAVID99');
    const en = await s.employer.agent.get('/api/company/workers/export.csv?lang=en');
    expect(en.text).toContain('Next action');
    expect(en.text).toContain('Sign document');
    expect((await s.working.agent.get('/api/company/workers/export.csv')).status).toBe(403);
  });
});
