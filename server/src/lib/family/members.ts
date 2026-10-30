import type { FamilyJoinsWhen, FamilyMember, FamilyRelation, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { syncCaseFolder } from '../drive/caseFolders.js';
import { badRequest, conflict, notFound } from '../http.js';
import { isMasked } from '../privacy/mask.js';
import { FAMILY_EVENT, parseMemberInfo, type Relation } from '../journey/family.js';
import { documentSummary, progressPercent, STATUS_STEP, STEP_COUNT } from '../../routes/account.js';

/**
 * Family members (Familiennachzug) — the details layer on top of the member sub-cases.
 *
 * Approach: every member has their OWN case (Case.parentCaseId → main case, same client user), created by
 * journey/family.ts addFamilyMember. That keeps one code path for checklists, uploads (portal, mobile,
 * smart uploads), staff review, case AI checks, VIDEX and the embassy package. The FamilyMember row holds
 * what a case has no column for: names as in the passport, passport data (sensitive), nationality,
 * "joins with the main applicant / later", the A1 exemption for spouses and notes.
 *
 * Members created before the FamilyMember table existed only have the FAMILY_MEMBER event (JSON note);
 * `ensureProfile` creates the row from it on first access.
 */

export const RELATION_ENUM: Record<Relation, FamilyRelation> = { spouse: 'SPOUSE', child: 'CHILD', parent: 'PARENT', other: 'OTHER' };
export const RELATION_KEY: Record<FamilyRelation, Relation> = { SPOUSE: 'spouse', CHILD: 'child', PARENT: 'parent', OTHER: 'other' };
/** Upper bound of members per main case (a guard against runaway clients, not a legal limit). */
export const MAX_MEMBERS = 12;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optText = (max: number) => z.string().trim().max(max).nullable().optional();

export const profileFields = {
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  birthDate: day.nullable().optional(),
  birthPlace: optText(120),
  sex: z.enum(['M', 'F', 'X']).nullable().optional(),
  nationality: optText(60),
  passportNumber: z.string().trim().max(40).regex(/^[A-Za-z0-9 •-]*$/, 'INVALID_PASSPORT_NUMBER').nullable().optional(),
  passportIssuedAt: day.nullable().optional(),
  passportExpiresAt: day.nullable().optional(),
  email: z.string().trim().email().max(190).nullable().optional().or(z.literal('')),
  joinsWhen: z.enum(['WITH_MAIN', 'LATER']).optional(),
  plannedEntryAt: day.nullable().optional(),
  germanExempt: z.boolean().optional(),
  germanExemptNote: optText(300),
  notes: optText(4000),
};

export const createMemberSchema = z.object({ ...profileFields, relation: z.enum(['spouse', 'child', 'parent', 'other']) });
export const updateMemberSchema = z
  .object({ ...profileFields, relation: z.enum(['spouse', 'child', 'parent', 'other']) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'EMPTY_UPDATE');

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(`${v}T00:00:00.000Z`));
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Prisma data from validated input; masked values (as staff see them) never overwrite the real one. */
export const profileData = (input: UpdateMemberInput) => {
  const data: Prisma.FamilyMemberUncheckedUpdateInput = {};
  if (input.firstName) data.firstName = input.firstName;
  if (input.lastName) data.lastName = input.lastName;
  for (const k of ['birthPlace', 'nationality', 'germanExemptNote', 'notes'] as const) {
    const v = input[k];
    if (v === undefined || (k === 'birthPlace' && v && isMasked(v))) continue;
    data[k] = v || null;
  }
  if (input.passportNumber !== undefined && !(input.passportNumber && isMasked(input.passportNumber))) {
    data.passportNumber = input.passportNumber ? input.passportNumber.replace(/\s+/g, '').toUpperCase() : null;
  }
  if (input.email !== undefined) data.email = input.email || null;
  if (input.sex !== undefined) data.sex = input.sex;
  if (input.joinsWhen !== undefined) data.joinsWhen = input.joinsWhen as FamilyJoinsWhen;
  if (input.germanExempt !== undefined) data.germanExempt = input.germanExempt;
  if (input.relation !== undefined) data.relation = RELATION_ENUM[input.relation];
  for (const k of ['birthDate', 'passportIssuedAt', 'passportExpiresAt', 'plannedEntryAt'] as const) {
    const d = toDate(input[k]);
    if (d !== undefined) data[k] = d;
  }
  return data;
};

export const serializeProfile = (p: FamilyMember) => ({
  id: p.id,
  mainCaseId: p.mainCaseId,
  memberCaseId: p.memberCaseId,
  relation: RELATION_KEY[p.relation],
  firstName: p.firstName,
  lastName: p.lastName,
  birthDate: iso(p.birthDate),
  birthPlace: p.birthPlace,
  sex: p.sex,
  nationality: p.nationality,
  passportNumber: p.passportNumber,
  passportIssuedAt: iso(p.passportIssuedAt),
  passportExpiresAt: iso(p.passportExpiresAt),
  email: p.email,
  joinsWhen: p.joinsWhen,
  plannedEntryAt: iso(p.plannedEntryAt),
  germanExempt: p.germanExempt,
  germanExemptNote: p.germanExemptNote,
  notes: p.notes,
  docsCopiedAt: p.docsCopiedAt?.toISOString() ?? null,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});
export type SerializedProfile = ReturnType<typeof serializeProfile>;

/** The FamilyMember row of a member case, created from the legacy FAMILY_MEMBER event when missing. */
export const ensureProfile = async (memberCaseId: string): Promise<FamilyMember | null> => {
  const existing = await prisma.familyMember.findUnique({ where: { memberCaseId } });
  if (existing) return existing;
  const c = await prisma.case.findUnique({
    where: { id: memberCaseId },
    select: { id: true, parentCaseId: true, relation: true, events: { where: { type: FAMILY_EVENT }, orderBy: { createdAt: 'desc' }, take: 1, select: { note: true, actorId: true } } },
  });
  if (!c?.parentCaseId) return null;
  const info = parseMemberInfo(c.events[0]?.note);
  const relation = (info?.relation ?? (c.relation as Relation | null) ?? 'spouse') as Relation;
  try {
    return await prisma.familyMember.create({
      data: {
        mainCaseId: c.parentCaseId,
        memberCaseId: c.id,
        relation: RELATION_ENUM[relation] ?? 'OTHER',
        firstName: info?.firstName || '—',
        lastName: info?.lastName || '—',
        birthDate: info?.birthDate ? new Date(`${info.birthDate}T00:00:00.000Z`) : null,
        email: info?.email ?? null,
        createdById: c.events[0]?.actorId ?? null,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return prisma.familyMember.findUnique({ where: { memberCaseId } });
    throw err;
  }
};

// ─── Overview (portal section, admin panel, mobile) ────────────────────

const memberCaseSelect = {
  id: true,
  number: true,
  status: true,
  relation: true,
  visaType: true,
  parentCaseId: true,
  clientId: true,
  appointmentAt: true,
  decisionAt: true,
  updatedAt: true,
  requirements: {
    orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
    select: {
      id: true,
      key: true,
      stage: true,
      title: true,
      description: true,
      required: true,
      sortOrder: true,
      documents: { orderBy: { createdAt: 'desc' }, select: { id: true, originalName: true, status: true, reviewNote: true, createdAt: true, mimeType: true, size: true } },
    },
  },
} satisfies Prisma.CaseSelect;
type MemberCaseRow = Prisma.CaseGetPayload<{ select: typeof memberCaseSelect }>;

export type ChecklistState = 'accepted' | 'pending' | 'rejected' | 'missing';

const checklistOf = (c: MemberCaseRow) =>
  c.requirements.map((r) => {
    // Same rules as the workflow (routes/account.ts requirementState).
    const state: ChecklistState = r.documents.some((d) => d.status === 'ACCEPTED') ? 'accepted' : r.documents.some((d) => d.status === 'PENDING') ? 'pending' : r.documents.length ? 'rejected' : 'missing';
    return { id: r.id, key: r.key, stage: r.stage, title: r.title, description: r.description, required: r.required, state, documents: r.documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })) };
  });

const summarizeMember = (c: MemberCaseRow, profile: FamilyMember | null) => {
  const hasEmbassy = c.requirements.some((r) => r.stage === 'EMBASSY');
  const stage: 'INITIAL' | 'EMBASSY' = STATUS_STEP[c.status] >= 2 && hasEmbassy ? 'EMBASSY' : 'INITIAL';
  const docs = documentSummary(c.requirements, stage);
  const checklist = checklistOf(c);
  const required = checklist.filter((i) => i.required);
  return {
    caseId: c.id,
    number: c.number,
    status: c.status,
    relation: (c.relation ?? (profile ? RELATION_KEY[profile.relation] : 'spouse')) as Relation,
    visaType: c.visaType,
    appointmentAt: c.appointmentAt?.toISOString() ?? null,
    decisionAt: c.decisionAt?.toISOString() ?? null,
    updatedAt: c.updatedAt.toISOString(),
    step: STATUS_STEP[c.status],
    stepCount: STEP_COUNT,
    percent: progressPercent(c.status, docs),
    final: FINAL_STATUSES.includes(c.status),
    removable: c.status === 'DOCUMENTS_PENDING' && c.requirements.every((r) => r.documents.length === 0),
    counts: {
      required: required.length,
      accepted: required.filter((i) => i.state === 'accepted').length,
      pending: checklist.filter((i) => i.state === 'pending').length,
      rejected: checklist.filter((i) => i.state === 'rejected').length,
      missing: required.filter((i) => i.state === 'missing').length,
    },
    profile: profile ? serializeProfile(profile) : null,
    checklist,
  };
};
export type FamilyMemberSummary = ReturnType<typeof summarizeMember>;

/** Root (main) case id of a case, whichever case of the group was asked for. */
export const rootCaseId = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, parentCaseId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  return c.parentCaseId ?? c.id;
};

export const familyOverview = async (caseId: string) => {
  const mainId = await rootCaseId(caseId);
  const main = await prisma.case.findUniqueOrThrow({
    where: { id: mainId },
    select: { id: true, number: true, status: true, clientId: true, visaType: true, client: { select: { firstName: true, lastName: true } } },
  });
  const rows = await prisma.case.findMany({ where: { parentCaseId: mainId }, orderBy: { createdAt: 'asc' }, select: memberCaseSelect });
  const profiles = await Promise.all(rows.map((r) => ensureProfile(r.id)));
  const members = rows.map((r, i) => summarizeMember(r, profiles[i]));
  // Familiennachzug start + document copies (lazy imports: reunion.ts / readiness.ts import this module).
  const reunion = await (await import('./reunion.js')).reunionSummary(mainId);
  return {
    main: { id: main.id, number: main.number, status: main.status, visaType: main.visaType, name: `${main.client.firstName} ${main.client.lastName}`.trim() },
    requestedCaseId: caseId,
    members,
    canAdd: !['CANCELLED', 'REJECTED'].includes(main.status) && members.length < MAX_MEMBERS,
    aggregate: {
      total: members.length,
      approved: members.filter((m) => m.status === 'APPROVED').length,
      openItems: members.reduce((a, m) => a + m.counts.missing + m.counts.rejected, 0),
      percent: members.length ? Math.round(members.reduce((a, m) => a + m.percent, 0) / members.length) : 0,
    },
    reunion,
    // Title / flat / income vs. the family (lib/family/legal.ts) + the step timeline; none without members.
    readiness: members.length ? await (await import('./readiness.js')).familyReadiness(mainId, members, !!reunion?.ready) : null,
  };
};

// ─── Writes ────────────────────────────────────────────────────────────

/** Keeps the legacy readers (drive folder names, client register, settlements) in step with the profile. */
const writeLegacyEvent = async (p: FamilyMember, actorId: string | null) => {
  await prisma.caseEvent.create({
    data: {
      caseId: p.memberCaseId,
      type: FAMILY_EVENT,
      note: JSON.stringify({ firstName: p.firstName, lastName: p.lastName, birthDate: iso(p.birthDate), email: p.email, relation: RELATION_KEY[p.relation] }),
      actorId,
      visibleToClient: false,
    },
  });
};

/** Spouse with the A1 exemption: the A1 certificate becomes optional (and required again without it). */
const syncA1Requirement = async (p: FamilyMember) => {
  if (p.relation !== 'SPOUSE') return;
  await prisma.documentRequirement.updateMany({ where: { caseId: p.memberCaseId, key: 'GERMAN_CERT', stage: 'INITIAL' }, data: { required: !p.germanExempt } });
};

/** Creates the profile row for a freshly created member case (called by addFamilyMember). */
export const createProfile = async (mainCaseId: string, memberCaseId: string, input: CreateMemberInput, actorId: string) => {
  const data = profileData(input) as Prisma.FamilyMemberUncheckedCreateInput;
  const p = await prisma.familyMember.create({
    data: { ...data, mainCaseId, memberCaseId, relation: RELATION_ENUM[input.relation], firstName: input.firstName.trim(), lastName: input.lastName.trim(), createdById: actorId },
  });
  await syncA1Requirement(p);
  return p;
};

/** Edits a member's details; who may edit is checked by the route (owner or staff). */
export const updateProfile = async (memberCaseId: string, input: UpdateMemberInput, actor: { id: string; staff: boolean }) => {
  const before = await ensureProfile(memberCaseId);
  if (!before) throw notFound('FAMILY_MEMBER_NOT_FOUND');
  const memberCase = await prisma.case.findUniqueOrThrow({ where: { id: memberCaseId }, select: { status: true } });
  if (!actor.staff && FINAL_STATUSES.includes(memberCase.status)) throw conflict('MEMBER_CASE_CLOSED');
  // Clients cannot change the relation once documents were reviewed (the checklist depends on it).
  if (input.relation && input.relation !== RELATION_KEY[before.relation] && !actor.staff && memberCase.status !== 'DOCUMENTS_PENDING') throw conflict('RELATION_LOCKED');
  const data = profileData(input);
  const after = await prisma.familyMember.update({ where: { id: before.id }, data });
  if (after.relation !== before.relation) await prisma.case.update({ where: { id: memberCaseId }, data: { relation: RELATION_KEY[after.relation] } });
  const legacyChanged =
    after.firstName !== before.firstName || after.lastName !== before.lastName || iso(after.birthDate) !== iso(before.birthDate) || after.email !== before.email || after.relation !== before.relation;
  if (legacyChanged) {
    await writeLegacyEvent(after, actor.id);
    void syncCaseFolder(memberCaseId); // folder name follows the member's name
  }
  if (after.germanExempt !== before.germanExempt || after.relation !== before.relation) await syncA1Requirement(after);
  const changed = Object.keys(data).filter((k) => String((before as Record<string, unknown>)[k] ?? '') !== String((after as Record<string, unknown>)[k] ?? ''));
  return { profile: after, changed };
};

/** Member case + profile for a route: 404 unless it is a member case. */
export const loadMemberCase = async (memberCaseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: memberCaseId }, select: { id: true, parentCaseId: true, clientId: true, status: true } });
  if (!c || !c.parentCaseId) throw notFound('FAMILY_MEMBER_NOT_FOUND');
  return c as typeof c & { parentCaseId: string };
};

export const assertCanAdd = async (mainCaseId: string, byClient: boolean) => {
  const main = await prisma.case.findUnique({ where: { id: mainCaseId }, select: { id: true, parentCaseId: true, status: true } });
  if (!main) throw notFound('CASE_NOT_FOUND');
  if (main.parentCaseId) throw badRequest('NOT_A_MAIN_CASE');
  if (byClient && main.status === 'REJECTED') throw conflict('MAIN_CASE_CLOSED');
  const count = await prisma.case.count({ where: { parentCaseId: main.id } });
  if (count >= MAX_MEMBERS) throw conflict('TOO_MANY_MEMBERS');
  return main;
};
