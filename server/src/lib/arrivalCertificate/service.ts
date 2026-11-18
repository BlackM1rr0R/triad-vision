import crypto from 'node:crypto';
import type { ArrivalCertificate, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { conflict } from '../http.js';
import { isImpersonating } from '../privacy/impersonationContext.js';

/**
 * "Welcome to Germany" arrival certificate (client portal → Arrival).
 *
 * Issued once per case, lazily on the client's first visit after the arrival was confirmed (arrival plan
 * COMPLETED by staff, or the post-arrival follow-up exists). The PDF itself is rendered on demand
 * (lib/arrivalCertificate/pdf) from the live case data in the language the client picks; only the number,
 * the verification code and the arrival date are stored.
 *
 * Public verification (/arrival-certificate/:code, QR on the PDF) confirms ONLY the certificate number, the
 * first name + initial of the surname and the arrival date. A certificate revoked by staff answers "revoked"
 * without any data. Rows are erased with the account (lib/userDeletion).
 */

export const CERT_CODE_RE = /^[A-Z2-9]{12}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (n: number) => Array.from(crypto.randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join('');

export const verifyUrlOf = (code: string) => `${config.clientUrl.replace(/\/+$/, '')}/arrival-certificate/${code}`;

const caseSelect = {
  id: true,
  number: true,
  clientId: true,
  parentCaseId: true,
  profession: true,
  company: { select: { name: true, city: true } },
  vacancy: { select: { city: true } },
  arrivalPlan: { select: { status: true, arrivalTime: true, flightDate: true, updatedAt: true, housingCity: true } },
  arrivalFollowUp: { select: { arrivedAt: true } },
} satisfies Prisma.CaseSelect;
type CertCase = Prisma.CaseGetPayload<{ select: typeof caseSelect }>;

/** Arrived = staff marked the arrival plan COMPLETED, or the post-arrival follow-up was started. */
export const hasArrived = (c: Pick<CertCase, 'arrivalPlan' | 'arrivalFollowUp'>) => c.arrivalPlan?.status === 'COMPLETED' || !!c.arrivalFollowUp;

/** Arrival date: the follow-up's arrival, the planned landing time, the flight date, else when the plan was completed. */
export const arrivalDateOf = (c: Pick<CertCase, 'arrivalPlan' | 'arrivalFollowUp'>) =>
  c.arrivalFollowUp?.arrivedAt ?? c.arrivalPlan?.arrivalTime ?? c.arrivalPlan?.flightDate ?? c.arrivalPlan?.updatedAt ?? new Date();

/** German city of the placement (employer, vacancy, arrival housing), first part only. */
export const certCityOf = (c: Pick<CertCase, 'company' | 'vacancy' | 'arrivalPlan'>) => {
  const raw = c.company?.city?.trim() || c.vacancy?.city?.trim() || c.arrivalPlan?.housingCity?.trim() || '';
  return raw.split(',')[0].trim().replace(/\s+/g, ' ').slice(0, 60) || null;
};

/** "Aynur Q." — first given name + initial of the surname (the only name the public check shows). */
export const firstNameInitial = (firstName: string, lastName: string) => {
  const first = firstName.trim().split(/\s+/)[0] ?? '';
  const initial = lastName.trim()[0]?.toLocaleUpperCase('az');
  return [first, initial ? `${initial}.` : ''].filter(Boolean).join(' ');
};

const issue = async (userId: string, c: CertCase): Promise<ArrivalCertificate> => {
  const existing = await prisma.arrivalCertificate.findUnique({ where: { caseId: c.id } });
  if (existing) return existing;
  const year = new Date().getUTCFullYear();
  for (let i = 0; i < 6; i++) {
    try {
      return await prisma.arrivalCertificate.create({ data: { caseId: c.id, userId, number: `ARR-${year}-${randomCode(6)}`, code: randomCode(12), arrivedAt: arrivalDateOf(c) } });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      const again = await prisma.arrivalCertificate.findUnique({ where: { caseId: c.id } });
      if (again) return again; // a parallel request issued it
    }
  }
  throw conflict('CERTIFICATE_NUMBER_EXHAUSTED');
};

export interface ClientCertificate {
  caseId: string;
  caseNumber: string;
  number: string;
  issuedAt: Date;
  arrivedAt: Date;
  city: string | null;
  profession: string;
  employer: string | null;
  revoked: boolean;
  verifyUrl: string | null;
}

const clientView = (cert: ArrivalCertificate, c: CertCase): ClientCertificate => ({
  caseId: c.id,
  caseNumber: c.number,
  number: cert.number,
  issuedAt: cert.issuedAt,
  arrivedAt: cert.arrivedAt,
  city: certCityOf(c),
  profession: c.profession,
  employer: c.company?.name?.trim() || null,
  revoked: !!cert.revokedAt,
  verifyUrl: cert.revokedAt ? null : verifyUrlOf(cert.code),
});

/** The client's certificates: issued now for every arrived main case that has none yet. */
export const clientCertificates = async (userId: string): Promise<ClientCertificate[]> => {
  const cases = await prisma.case.findMany({ where: { clientId: userId, parentCaseId: null }, select: caseSelect, orderBy: { createdAt: 'desc' }, take: 20 });
  const out: ClientCertificate[] = [];
  for (const c of cases) {
    const existing = await prisma.arrivalCertificate.findUnique({ where: { caseId: c.id } });
    if (!existing && !hasArrived(c)) continue;
    // "View as client" never issues one (number + code are random and permanent): only issued certificates are shown.
    if (!existing && isImpersonating()) continue;
    const cert = existing ?? (await issue(userId, c));
    out.push(clientView(cert, c));
  }
  return out;
};

/** Everything the PDF needs for one of the client's certificates (null: not theirs / none / revoked). */
export const certificateForPdf = async (userId: string, caseId: string) => {
  const [cert, c, user] = await Promise.all([
    prisma.arrivalCertificate.findUnique({ where: { caseId } }),
    prisma.case.findUnique({ where: { id: caseId }, select: caseSelect }),
    prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } }),
  ]);
  if (!cert || !c || !user || cert.userId !== userId || c.clientId !== userId) return null;
  if (cert.revokedAt) return { revoked: true as const };
  return {
    revoked: false as const,
    cert,
    fullName: `${user.firstName} ${user.lastName}`.replace(/\s+/g, ' ').trim(),
    city: certCityOf(c),
    profession: c.profession,
    employer: c.company?.name?.trim() || null,
  };
};

/** Public check: number, first name + initial and date only; revoked → { revoked } without data. */
export const verifyArrivalCertificate = async (code: string) => {
  if (!CERT_CODE_RE.test(code)) return null;
  const cert = await prisma.arrivalCertificate.findUnique({ where: { code } });
  if (!cert) return null;
  if (cert.revokedAt) return { valid: false as const, revoked: true as const };
  const user = await prisma.user.findUnique({ where: { id: cert.userId }, select: { firstName: true, lastName: true } });
  if (!user) return null;
  return { valid: true as const, number: cert.number, holder: firstNameInitial(user.firstName, user.lastName), arrivedAt: cert.arrivedAt.toISOString().slice(0, 10) };
};

// ─── Staff ──────────────────────────────────────────────────────────────

export const staffCertificateView = (cert: ArrivalCertificate | null) =>
  cert
    ? { id: cert.id, number: cert.number, issuedAt: cert.issuedAt, arrivedAt: cert.arrivedAt, revokedAt: cert.revokedAt, revokeReason: cert.revokeReason, verifyUrl: verifyUrlOf(cert.code) }
    : null;

export const setRevoked = async (id: string, revoked: boolean, staffId: string, reason?: string | null) => {
  const cert = await prisma.arrivalCertificate.findUnique({ where: { id } });
  if (!cert) return null;
  return prisma.arrivalCertificate.update({
    where: { id },
    data: revoked ? { revokedAt: cert.revokedAt ?? new Date(), revokedById: staffId, revokeReason: reason?.trim() || null } : { revokedAt: null, revokedById: null, revokeReason: null },
  });
};

/** DSGVO erasure (plain ids, no foreign key). */
export const eraseArrivalCertificates = (userId: string, caseIds: string[] = []) =>
  prisma.arrivalCertificate.deleteMany({ where: { OR: [{ userId }, ...(caseIds.length ? [{ caseId: { in: caseIds } }] : [])] } });
