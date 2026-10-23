import crypto from 'node:crypto';
import type { CaseStatus } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';

/**
 * Public status check without login (/status): case number + date of birth, or the client's "for my family"
 * link. Off by default — the client turns it on per case in the portal privacy settings. The answer holds
 * no personal data: the stage of the 6-step progress, the date of the last update and who has the next move
 * (applicant / team / embassy). Never names, documents, employer, outcome or appointment details.
 *
 * Abuse: every lookup is stored (PublicStatusAttempt, also the audit trail). After 5 wrong tries within an
 * hour for one case number — or 10 from one IP — further lookups are refused until the hour has passed, even
 * with the right answer, so guessing birth dates does not pay. A wrong date, an unknown number and a case with
 * the public status off all give the same answer (no enumeration).
 */

export const STEP_KEYS = ['documents', 'contract', 'embassyDocs', 'appointment', 'decision', 'result'] as const;

/** Same mapping as the client portal stepper (client/src/lib/caseStatus.ts). */
export const STATUS_STEP: Record<CaseStatus, number> = {
  DOCUMENTS_PENDING: 0,
  DOCUMENTS_REVIEW: 0,
  CONTRACT_SENT: 1,
  CONTRACT_SIGNED: 1,
  EMBASSY_DOCUMENTS: 2,
  EMBASSY_REVIEW: 2,
  APPOINTMENT_SCHEDULED: 3,
  DECISION_PENDING: 4,
  APPROVED: 5,
  REJECTED: 5,
  CANCELLED: -1,
};

export type Ball = 'APPLICANT' | 'TEAM' | 'EMBASSY' | 'NONE';

export const BALL: Record<CaseStatus, Ball> = {
  DOCUMENTS_PENDING: 'APPLICANT',
  DOCUMENTS_REVIEW: 'TEAM',
  CONTRACT_SENT: 'APPLICANT',
  CONTRACT_SIGNED: 'TEAM',
  EMBASSY_DOCUMENTS: 'APPLICANT',
  EMBASSY_REVIEW: 'TEAM',
  APPOINTMENT_SCHEDULED: 'APPLICANT', // the applicant attends the embassy appointment
  DECISION_PENDING: 'EMBASSY',
  APPROVED: 'NONE',
  REJECTED: 'NONE',
  CANCELLED: 'NONE',
};

export const LOCK = { windowMs: 60 * 60 * 1000, perCase: 5, perIp: 10 } as const;

export interface PublicStatusView {
  /** Only echoed when the visitor typed it (number + birth date); a family link never reveals it. */
  caseNumber: string | null;
  step: number;
  stepKey: (typeof STEP_KEYS)[number] | null;
  steps: number;
  state: 'ACTIVE' | 'COMPLETED' | 'CLOSED';
  ball: Ball;
  /** YYYY-MM-DD */
  lastUpdate: string;
}

export const hashIp = (ip: string | undefined) =>
  crypto.createHmac('sha256', config.jwtSecret).update(`status-ip:${ip ?? '-'}`).digest('hex');

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export const normaliseCaseNumber = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-').slice(0, 40);

export const newShareToken = () => crypto.randomBytes(24).toString('base64url'); // 32 chars

const day = (d: Date) => d.toISOString().slice(0, 10);

export const buildView = async (c: { id: string; status: CaseStatus; createdAt: Date }, caseNumber: string | null): Promise<PublicStatusView> => {
  const last = await prisma.caseEvent.findFirst({
    where: { caseId: c.id, visibleToClient: true },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const step = STATUS_STEP[c.status];
  return {
    caseNumber,
    step,
    stepKey: step >= 0 ? STEP_KEYS[step] : null,
    steps: STEP_KEYS.length,
    state: c.status === 'CANCELLED' ? 'CLOSED' : step === 5 ? 'COMPLETED' : 'ACTIVE',
    ball: BALL[c.status],
    lastUpdate: day(last?.createdAt ?? c.createdAt),
  };
};

/** Minutes until the lockout ends, or 0 when lookups are allowed. */
export const lockedFor = async (ipHash: string, caseNumber: string | null) => {
  const since = new Date(Date.now() - LOCK.windowMs);
  const checks: Promise<{ n: number; first: Date | null }>[] = [
    prisma.publicStatusAttempt
      .findMany({ where: { ipHash, success: false, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true }, take: LOCK.perIp })
      .then((rows) => ({ n: rows.length >= LOCK.perIp ? rows.length : 0, first: rows[0]?.createdAt ?? null })),
  ];
  if (caseNumber) {
    checks.push(
      prisma.publicStatusAttempt
        .findMany({ where: { caseNumber, success: false, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true }, take: LOCK.perCase })
        .then((rows) => ({ n: rows.length >= LOCK.perCase ? rows.length : 0, first: rows[0]?.createdAt ?? null })),
    );
  }
  const results = await Promise.all(checks);
  const locked = results.filter((r) => r.n > 0 && r.first);
  if (!locked.length) return 0;
  const until = Math.max(...locked.map((r) => r.first!.getTime() + LOCK.windowMs));
  return Math.max(1, Math.ceil((until - Date.now()) / 60_000));
};

export const recordAttempt = (data: { caseNumber: string; ipHash: string; success: boolean; via: 'DOB' | 'LINK' }) =>
  prisma.publicStatusAttempt.create({ data });

/** Case number + birth date → the case, when it exists, the birth date matches and public status is on. */
export const findByNumberAndBirthDate = async (caseNumber: string, birthDate: string) => {
  const c = await prisma.case.findUnique({
    where: { number: caseNumber },
    select: { id: true, status: true, createdAt: true, client: { select: { birthDate: true, isActive: true } } },
  });
  if (!c || !c.client.birthDate || !c.client.isActive) return null;
  // Constant-time comparison of the date strings (birth dates are stored at UTC midnight).
  const a = Buffer.from(day(c.client.birthDate));
  const b = Buffer.from(birthDate.padEnd(10, ' ').slice(0, 10));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const setting = await prisma.casePublicStatus.findUnique({ where: { caseId: c.id } });
  if (!setting?.enabled) return null;
  return c;
};

export const findByToken = async (token: string) => {
  const setting = await prisma.casePublicStatus.findUnique({ where: { tokenHash: sha256(token) } });
  if (!setting?.enabled) return null;
  const c = await prisma.case.findUnique({
    where: { id: setting.caseId },
    select: { id: true, number: true, status: true, createdAt: true, client: { select: { isActive: true } } },
  });
  return c && c.client.isActive ? c : null;
};
