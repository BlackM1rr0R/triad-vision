import type { Role } from '@prisma/client';
import { prisma } from '../../db.js';
import type { ExtraMaskGroup } from './sensitiveRules.js';

/**
 * "Reveal with reason" for the Access Center groups (SALARY, HEALTH, ADDRESS, FAMILY): what can be revealed and
 * where the plaintext lives. Used by POST /api/admin/reveal (routes/admin/privacyTools.ts) next to the original
 * entities. The reason must be at least 10 characters for these (the original groups keep their 5).
 *
 * Entities (id = …):
 *   employmentContract  case id         grossMonthly, grossYearly                         SALARY
 *   familyReunion       main case id    netMonthly                                         SALARY
 *   casePermit          case id         healthInsuranceExpiresAt                           HEALTH
 *   clientAddress       user id         address                                            ADDRESS
 *   arrivalPlan         plan or case id housingDetails                                     ADDRESS
 *   partnerHousing      listing id      address, contactName, contactPhone, contactEmail   ADDRESS
 *   familyPerson        FamilyMember id firstName, lastName, birthDate, birthPlace,         FAMILY
 *                                       passportNumber, passportIssuedAt, passportExpiresAt, email
 */

export const EXTRA_REVEAL_ENTITIES = ['employmentContract', 'familyReunion', 'casePermit', 'clientAddress', 'arrivalPlan', 'partnerHousing', 'familyPerson'] as const;
export type ExtraRevealEntity = (typeof EXTRA_REVEAL_ENTITIES)[number];

export const EXTRA_REASON_MIN = 10;

type Loaded = { found: boolean; value: string | null; caseId?: string | null };

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const num = (v: { toString(): string } | number | null | undefined) => (v === null || v === undefined ? null : String(v));

export const EXTRA_REVEALERS: Record<ExtraRevealEntity, { group: ExtraMaskGroup; fields: string[]; minRole: Role; load: (id: string, field: string) => Promise<Loaded> }> = {
  employmentContract: {
    group: 'SALARY',
    fields: ['grossMonthly', 'grossYearly'],
    minRole: 'STAFF',
    load: async (id, field) => {
      const c = await prisma.employmentContract.findUnique({ where: { caseId: id }, select: { grossMonthly: true, grossYearly: true } });
      return { found: !!c, value: c ? num(field === 'grossYearly' ? c.grossYearly : c.grossMonthly) : null, caseId: id };
    },
  },
  familyReunion: {
    group: 'SALARY',
    fields: ['netMonthly'],
    minRole: 'STAFF',
    load: async (id) => {
      const r = await prisma.familyReunionInfo.findUnique({ where: { mainCaseId: id }, select: { netMonthly: true } });
      return { found: !!r, value: num(r?.netMonthly), caseId: id };
    },
  },
  casePermit: {
    group: 'HEALTH',
    fields: ['healthInsuranceExpiresAt'],
    minRole: 'STAFF',
    load: async (id) => {
      const c = await prisma.case.findUnique({ where: { id }, select: { healthInsuranceExpiresAt: true } });
      return { found: !!c, value: day(c?.healthInsuranceExpiresAt), caseId: id };
    },
  },
  clientAddress: {
    group: 'ADDRESS',
    fields: ['address'],
    minRole: 'STAFF',
    load: async (id) => {
      const u = await prisma.user.findUnique({ where: { id }, select: { address: true } });
      return { found: !!u, value: u?.address ?? null };
    },
  },
  arrivalPlan: {
    group: 'ADDRESS',
    fields: ['housingDetails'],
    minRole: 'STAFF',
    load: async (id) => {
      const p = await prisma.arrivalPlan.findFirst({ where: { OR: [{ id }, { caseId: id }] }, select: { housingDetails: true, caseId: true } });
      return { found: !!p, value: p?.housingDetails ?? null, caseId: p?.caseId ?? null };
    },
  },
  partnerHousing: {
    group: 'ADDRESS',
    fields: ['address', 'contactName', 'contactPhone', 'contactEmail'],
    minRole: 'STAFF',
    load: async (id, field) => {
      const h = await prisma.partnerHousing.findUnique({ where: { id }, select: { address: true, contactName: true, contactPhone: true, contactEmail: true } });
      return { found: !!h, value: h ? ((h as Record<string, string | null>)[field] ?? null) : null };
    },
  },
  familyPerson: {
    group: 'FAMILY',
    fields: ['firstName', 'lastName', 'birthDate', 'birthPlace', 'passportNumber', 'passportIssuedAt', 'passportExpiresAt', 'email'],
    minRole: 'STAFF',
    load: async (id, field) => {
      const m = await prisma.familyMember.findUnique({
        where: { id },
        select: { mainCaseId: true, firstName: true, lastName: true, birthDate: true, birthPlace: true, passportNumber: true, passportIssuedAt: true, passportExpiresAt: true, email: true },
      });
      if (!m) return { found: false, value: null };
      const v = (m as Record<string, unknown>)[field];
      return { found: true, value: v instanceof Date ? day(v) : typeof v === 'string' ? v : null, caseId: m.mainCaseId };
    },
  },
};

export const isExtraRevealEntity = (e: string): e is ExtraRevealEntity => (EXTRA_REVEAL_ENTITIES as readonly string[]).includes(e);

/** The new group a reveal belongs to (null: an original entity / field). */
export const extraRevealGroup = (entity: string, field: string): ExtraMaskGroup | null =>
  isExtraRevealEntity(entity) && EXTRA_REVEALERS[entity].fields.includes(field) ? EXTRA_REVEALERS[entity].group : null;

/**
 * Case visibility of the core access engine (lib/access: caseScopeWhere), when it exists: a staff member may only
 * reveal data of a case they can see. Without the engine every staff member sees every case (today).
 */
const ACCESS_SPEC = '../access/index.js';
type ScopeFn = (user: { id: string; role: Role }) => Promise<Record<string, unknown>>;
let scopeProbe: Promise<ScopeFn | null> | null = null;

export const inCaseScope = async (user: { id: string; role: Role }, caseId: string | null | undefined): Promise<boolean> => {
  if (!caseId) return true;
  scopeProbe ??= import(/* @vite-ignore */ ACCESS_SPEC)
    .then((m: { caseScopeWhere?: unknown }) => (typeof m.caseScopeWhere === 'function' ? (m.caseScopeWhere as ScopeFn) : null))
    .catch(() => null);
  const fn = await scopeProbe;
  if (!fn) return true;
  try {
    const where = await fn(user);
    if (!where || !Object.keys(where).length) return true;
    return !!(await prisma.case.findFirst({ where: { AND: [{ id: caseId }, where] }, select: { id: true } }));
  } catch {
    return false; // the engine exists but its scope failed: fail closed for a reveal
  }
};
