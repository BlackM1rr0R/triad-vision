/**
 * Per-partner permission sets of the referral-partner portal (/api/partner) — pure logic, no database.
 *
 * Every partner has exactly one effective permission set:
 *   - no row / template LEGACY      → derived live from today's `ReferralPartner.visibility`, i.e. exactly what the
 *                                     portal showed before per-partner permissions existed (the migration wrote a
 *                                     LEGACY row for every partner that existed at deploy time → zero behaviour change)
 *   - template DEFAULT              → partners created in the admin panel from now on (initNewPartnerAccess)
 *   - row with a named template     → that template's constant (template changes reach every partner using it)
 *   - row with template CUSTOM      → the stored matrix
 *
 * Team members (PartnerMember) have their own set; what they may do is always the intersection with the owner's
 * (`intersectPerms`), so a member can never see more than the partner.
 *
 * Levels are ordered: documents none < status < list < upload < download, drive none < view < upload,
 * clientList none < masked < full. A higher level includes everything below it.
 */

export const CLIENT_LIST_LEVELS = ['none', 'masked', 'full'] as const;
export type ClientListLevel = (typeof CLIENT_LIST_LEVELS)[number];
/**
 * none     no documents at all
 * status   per requirement only "complete / missing" (title + state; no file names, no rejection notes)
 * list     + rejection reasons, number of files and the names of files the partner's own team uploaded
 * upload   + upload on behalf of the client (today's behaviour)
 * download + the names of all files of the requirement and downloading them
 */
export const DOCUMENT_LEVELS = ['none', 'status', 'list', 'upload', 'download'] as const;
export type DocumentLevel = (typeof DOCUMENT_LEVELS)[number];
export const DRIVE_LEVELS = ['none', 'view', 'upload'] as const;
export type DriveLevel = (typeof DRIVE_LEVELS)[number];

export interface PartnerPerms {
  /** none: no client names anywhere; masked: names + masked passport; full: + contacts / payment amounts of clients who consented. */
  clientList: ClientListLevel;
  /** Case status, journey step, next action, appointment / decision dates, timeline. */
  caseStage: boolean;
  documents: DocumentLevel;
  /** Commissions (list, export, dashboard totals) and the clients' payment state. */
  payments: boolean;
  /** Register clients from the portal / resend their invitation. */
  addClients: boolean;
  /** Write to and read messages from the Triad Vision team. */
  messaging: boolean;
  /** See the open vacancies. */
  vacancies: boolean;
  /** Own Drive folder (Partner/<name>) only. */
  drive: DriveLevel;
}

export const PERM_KEYS = ['clientList', 'caseStage', 'documents', 'payments', 'addClients', 'messaging', 'vacancies', 'drive'] as const satisfies readonly (keyof PartnerPerms)[];

export const TEMPLATES = ['LEGACY', 'DEFAULT', 'REFERRER', 'DOCUMENTS', 'FULL', 'CUSTOM'] as const;
export type PartnerTemplate = (typeof TEMPLATES)[number];

/** Partners created after deploy (no PartnerAccess row). */
export const DEFAULT_PERMS: PartnerPerms = {
  clientList: 'masked',
  caseStage: true,
  documents: 'status',
  payments: true,
  addClients: true,
  messaging: true,
  vacancies: true,
  drive: 'view',
};

/** Named templates (LEGACY and CUSTOM are not constants). */
export const TEMPLATE_PERMS: Record<Exclude<PartnerTemplate, 'LEGACY' | 'CUSTOM'>, PartnerPerms> = {
  DEFAULT: DEFAULT_PERMS,
  /** "Yalnız müştəri gətirir" — brings clients, follows their stage and commissions. */
  REFERRER: { clientList: 'masked', caseStage: true, documents: 'none', payments: true, addClients: true, messaging: true, vacancies: true, drive: 'none' },
  /** "Sənədlə də işləyir" — also collects and uploads documents. */
  DOCUMENTS: { clientList: 'masked', caseStage: true, documents: 'upload', payments: true, addClients: true, messaging: true, vacancies: true, drive: 'upload' },
  /** "Tam əməkdaşlıq" — full cooperation (contacts only with the client's consent). */
  FULL: { clientList: 'full', caseStage: true, documents: 'download', payments: true, addClients: true, messaging: true, vacancies: true, drive: 'upload' },
};

/**
 * Exactly what the portal allowed before per-partner permissions: client list masked (MINIMAL) or with contacts
 * after consent (EXTENDED), stage, document checklist + upload, commissions, registering clients; no messaging,
 * vacancies or drive (those portal areas did not exist).
 */
export const legacyPerms = (visibility: string | null | undefined): PartnerPerms => ({
  clientList: visibility === 'EXTENDED' ? 'full' : 'masked',
  caseStage: true,
  documents: 'upload',
  payments: true,
  addClients: true,
  messaging: false,
  vacancies: false,
  drive: 'none',
});

/** No access at all (deactivated member, unknown data). */
export const NO_PERMS: PartnerPerms = { clientList: 'none', caseStage: false, documents: 'none', payments: false, addClients: false, messaging: false, vacancies: false, drive: 'none' };

const rank = <T extends string>(levels: readonly T[], v: T) => levels.indexOf(v);
export const atLeast = {
  clientList: (have: ClientListLevel, want: ClientListLevel) => rank(CLIENT_LIST_LEVELS, have) >= rank(CLIENT_LIST_LEVELS, want),
  documents: (have: DocumentLevel, want: DocumentLevel) => rank(DOCUMENT_LEVELS, have) >= rank(DOCUMENT_LEVELS, want),
  drive: (have: DriveLevel, want: DriveLevel) => rank(DRIVE_LEVELS, have) >= rank(DRIVE_LEVELS, want),
};

const minOf = <T extends string>(levels: readonly T[], a: T, b: T): T => (rank(levels, a) <= rank(levels, b) ? a : b);

/** What a team member may do: never more than the owner (per key the lower level). */
export const intersectPerms = (owner: PartnerPerms, member: PartnerPerms): PartnerPerms => ({
  clientList: minOf(CLIENT_LIST_LEVELS, owner.clientList, member.clientList),
  caseStage: owner.caseStage && member.caseStage,
  documents: minOf(DOCUMENT_LEVELS, owner.documents, member.documents),
  payments: owner.payments && member.payments,
  addClients: owner.addClients && member.addClients,
  messaging: owner.messaging && member.messaging,
  vacancies: owner.vacancies && member.vacancies,
  drive: minOf(DRIVE_LEVELS, owner.drive, member.drive),
});

/** Keys where `member` asks for more than `owner` has (empty = member ≤ owner). */
export const exceedingKeys = (owner: PartnerPerms, member: PartnerPerms): (keyof PartnerPerms)[] => {
  const capped = intersectPerms(owner, member);
  return PERM_KEYS.filter((k) => capped[k] !== member[k]);
};

const pick = <T extends string>(levels: readonly T[], v: unknown, fallback: T): T => (typeof v === 'string' && (levels as readonly string[]).includes(v) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/**
 * A stored JSON matrix → a complete permission set. Unknown / missing keys fall back to NO_PERMS (fail closed:
 * a corrupted row never grants more).
 */
export const parsePerms = (raw: unknown, fallback: PartnerPerms = NO_PERMS): PartnerPerms => {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    clientList: pick(CLIENT_LIST_LEVELS, o.clientList, fallback.clientList),
    caseStage: bool(o.caseStage, fallback.caseStage),
    documents: pick(DOCUMENT_LEVELS, o.documents, fallback.documents),
    payments: bool(o.payments, fallback.payments),
    addClients: bool(o.addClients, fallback.addClients),
    messaging: bool(o.messaging, fallback.messaging),
    vacancies: bool(o.vacancies, fallback.vacancies),
    drive: pick(DRIVE_LEVELS, o.drive, fallback.drive),
  };
};

export const isTemplate = (v: unknown): v is PartnerTemplate => typeof v === 'string' && (TEMPLATES as readonly string[]).includes(v);

/** The partner's (owner's) effective permissions from its access row (null = no row). */
export const partnerPermsOf = (partner: { visibility: string | null }, access: { template: string; perms: unknown } | null): { template: PartnerTemplate; perms: PartnerPerms } => {
  if (!access) return { template: 'LEGACY', perms: legacyPerms(partner.visibility) };
  const template: PartnerTemplate = isTemplate(access.template) ? access.template : 'CUSTOM';
  if (template === 'LEGACY') return { template, perms: legacyPerms(partner.visibility) };
  if (template === 'CUSTOM') return { template, perms: parsePerms(access.perms) };
  return { template, perms: { ...TEMPLATE_PERMS[template] } };
};

/** `ReferralPartner.visibility` that matches a permission set (kept in sync so older code paths agree). */
export const visibilityFor = (perms: PartnerPerms): 'MINIMAL' | 'EXTENDED' => (perms.clientList === 'full' ? 'EXTENDED' : 'MINIMAL');

export const samePerms = (a: PartnerPerms, b: PartnerPerms) => PERM_KEYS.every((k) => a[k] === b[k]);

// ─── Response shaping (applied to what lib/partnerPortal/cases.ts builds) ─────────────

type CaseRowLike = {
  status?: unknown;
  step?: unknown;
  nextAction?: unknown;
  refused?: unknown;
  missingDocuments?: unknown;
  appointmentAt?: unknown;
  decisionAt?: unknown;
};

/** Case list row / latest case: stage fields only with caseStage, the missing-document count only with documents. */
export const shapeCaseRow = <T extends CaseRowLike>(row: T, perms: PartnerPerms): T => {
  let out = row;
  if (!perms.caseStage) out = { ...out, status: null, step: null, nextAction: null, refused: null, appointmentAt: null, decisionAt: null };
  if (perms.documents === 'none' && 'missingDocuments' in out) out = { ...out, missingDocuments: null };
  return out;
};

type RequirementLike = {
  rejectionReason?: unknown;
  canUpload?: unknown;
  documentCount?: unknown;
  myUploads?: unknown;
};

/** One requirement of the case detail at the given document level (upload = unchanged, today's view). */
export const shapeRequirement = <T extends RequirementLike>(r: T, level: DocumentLevel): T => {
  if (level === 'upload' || level === 'download') return r;
  if (level === 'list') return { ...r, canUpload: false };
  // status: only the requirement and whether it is complete.
  return { ...r, rejectionReason: null, canUpload: false, documentCount: null, myUploads: [] };
};

type DetailLike = CaseRowLike & {
  appointmentPlace?: unknown;
  visaValidFrom?: unknown;
  visaValidTo?: unknown;
  timeline?: unknown;
  uploadStage?: unknown;
  requirements: RequirementLike[];
};

/** The whole case detail. With today's permissions (legacy) the object comes back unchanged. */
export const shapeCaseDetail = <T extends DetailLike>(detail: T, perms: PartnerPerms): T => {
  let out = shapeCaseRow(detail, perms);
  if (!perms.caseStage) out = { ...out, appointmentPlace: null, visaValidFrom: null, visaValidTo: null, timeline: [] };
  if (perms.documents === 'none') return { ...out, requirements: [], uploadStage: null };
  const reqs = out.requirements.map((r) => shapeRequirement(r, perms.documents));
  if (!atLeast.documents(perms.documents, 'upload')) return { ...out, requirements: reqs, uploadStage: null };
  return reqs.every((r, i) => r === out.requirements[i]) ? out : { ...out, requirements: reqs };
};

type ClientRowLike = {
  contact?: unknown;
  extended?: unknown;
  payment?: unknown;
  latestCase?: CaseRowLike | null;
};

/** Client list row (lib/partners/owned.ts → listPartnerClients). */
export const shapeClientRow = <T extends ClientRowLike>(row: T, perms: PartnerPerms): T => {
  let out = row;
  if (!perms.payments) out = { ...out, payment: null };
  if (out.latestCase && (!perms.caseStage || perms.documents === 'none')) out = { ...out, latestCase: shapeCaseRow(out.latestCase, perms) };
  return out;
};

/**
 * Attendance / exam records of a language school (lib/partners/schools.ts). They are the school's OWN data about
 * its own course — not the client's case documents — so they do not follow the `documents` level (DEFAULT has only
 * `status`, REFERRER `none`, and the school's core feature would be refused). Students are clients, so the client
 * list is required (masked or better); the student's consent and the LANGUAGE_SCHOOL category are checked by the
 * routes as before. Writing (add / withdraw) and the school's own certificate file need the same level.
 */
export const schoolRecordAccess = (perms: PartnerPerms, category: string | null | undefined) => {
  const students = perms.clientList !== 'none';
  return { view: students, write: students && category === 'LANGUAGE_SCHOOL', certificate: students };
};

/**
 * Whether a notification to the partner's portal login (lib/partnerPortal/notify.ts, lib/partners/owned.ts → notifyPartner)
 * fits the partner's permission set, by notification type; null = do not send. Notifications never carry more than
 * the portal shows, and their link always points to an area that exists for this login:
 *   PARTNER_COMMISSION_*                  payments (link /partner/commissions); client names only with the client list
 *   PARTNER_CASE_*, PARTNER_APPOINTMENT*  case stage + client list (name in the title, link /partner/clients/:id)
 *   PARTNER_NEW_CLIENT, PARTNER_NEW_CASE  client list (link /partner/people or /partner/clients/:id)
 *   anything else                         sent as before
 */
export const partnerNoticeRule = (perms: PartnerPerms, type: string): { names: boolean } | null => {
  const clients = perms.clientList !== 'none';
  if (type.startsWith('PARTNER_COMMISSION_')) return perms.payments ? { names: clients } : null;
  if (type.startsWith('PARTNER_CASE_') || type.startsWith('PARTNER_APPOINTMENT')) return perms.caseStage && clients ? { names: true } : null;
  if (type === 'PARTNER_NEW_CLIENT' || type === 'PARTNER_NEW_CASE') return clients ? { names: true } : null;
  return { names: clients };
};

/**
 * Portal areas the UI shows (cosmetic; the server checks every request). Referrers (lib/referrers) get the
 * "Komandam / Alt-referallar" area instead of the commission and team pages (no commissions for referrers).
 */
export const portalAreas = (perms: PartnerPerms, opts: { owner: boolean; referrer?: boolean }) => ({
  clients: perms.clientList !== 'none',
  cases: perms.clientList !== 'none',
  commissions: perms.payments && !opts.referrer,
  addClients: perms.addClients && perms.clientList !== 'none',
  messages: perms.messaging,
  vacancies: perms.vacancies,
  drive: perms.drive !== 'none',
  team: opts.owner && !opts.referrer,
  profile: opts.owner,
  referrals: !!opts.referrer && perms.clientList !== 'none',
});
