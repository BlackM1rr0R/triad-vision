import type { CaseStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { createCase } from '../caseFlow.js';
import { syncCaseFolder } from '../drive/caseFolders.js';
import { badRequest, conflict, notFound } from '../http.js';
import { documentSummary, progressPercent, STATUS_STEP, STEP_COUNT } from '../../routes/account.js';
import { createProfile, serializeProfile, type CreateMemberInput } from '../family/members.js';

/**
 * Family reunion (Familiennachzug). A member's case hangs under the main applicant's case
 * (Case.parentCaseId + Case.relation) and belongs to the SAME client user, who manages it from the
 * portal. The Case model has no free JSON column, so the member's personal details (name, birth
 * date, contact e-mail) live in a CaseEvent of type FAMILY_MEMBER whose note is a JSON document;
 * the API reads it back from there (hidden from the client timeline, see visibleToClient).
 */

export const FAMILY_EVENT = 'FAMILY_MEMBER';
export const RELATIONS = ['spouse', 'child', 'parent', 'other'] as const;
export type Relation = (typeof RELATIONS)[number];

export interface FamilyMemberInfo {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  email: string | null;
  relation: Relation;
}

export const parseMemberInfo = (note: string | null | undefined): FamilyMemberInfo | null => {
  if (!note) return null;
  try {
    const v = JSON.parse(note) as Partial<FamilyMemberInfo>;
    if (typeof v.firstName !== 'string' || typeof v.lastName !== 'string') return null;
    return {
      firstName: v.firstName,
      lastName: v.lastName,
      birthDate: typeof v.birthDate === 'string' ? v.birthDate : null,
      email: typeof v.email === 'string' ? v.email : null,
      relation: RELATIONS.includes(v.relation as Relation) ? (v.relation as Relation) : 'spouse',
    };
  } catch {
    return null;
  }
};

const memberSelect = {
  id: true,
  number: true,
  profession: true,
  status: true,
  relation: true,
  parentCaseId: true,
  createdAt: true,
  updatedAt: true,
  decisionAt: true,
  visaCategory: { select: { id: true, slug: true, title: true, visaLabel: true } },
  assignedStaff: { select: { id: true, firstName: true, lastName: true } },
  requirements: { include: { documents: { select: { status: true, reviewNote: true, createdAt: true } } } },
  events: { where: { type: FAMILY_EVENT }, orderBy: { createdAt: 'desc' }, take: 1, select: { note: true } },
  _count: { select: { documents: true } },
  familyProfile: true, // details (lib/family/members.ts)
} satisfies Prisma.CaseSelect;

type MemberRow = Prisma.CaseGetPayload<{ select: typeof memberSelect }>;

const summarize = (c: MemberRow) => {
  const hasEmbassy = c.requirements.some((r) => r.stage === 'EMBASSY');
  const stage: 'INITIAL' | 'EMBASSY' = STATUS_STEP[c.status] >= 2 && hasEmbassy ? 'EMBASSY' : 'INITIAL';
  const docs = documentSummary(c.requirements, stage);
  const { requirements: _r, events, _count, familyProfile, ...rest } = c;
  return {
    ...rest,
    member: parseMemberInfo(events[0]?.note),
    profile: familyProfile ? serializeProfile(familyProfile) : null,
    step: STATUS_STEP[c.status],
    stepCount: STEP_COUNT,
    percent: progressPercent(c.status, docs),
    documents: _count.documents,
  };
};

/** The whole family group of a case (main applicant + members), whichever case was asked for. */
export const familyGroup = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, parentCaseId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const rootId = c.parentCaseId ?? c.id;
  const [main, members] = await Promise.all([
    prisma.case.findUniqueOrThrow({ where: { id: rootId }, select: memberSelect }),
    prisma.case.findMany({ where: { parentCaseId: rootId }, orderBy: { createdAt: 'asc' }, select: memberSelect }),
  ]);
  const rows = members.map(summarize);
  const done = rows.filter((m) => m.status === 'APPROVED').length;
  return {
    main: summarize(main),
    members: rows,
    aggregate: {
      total: rows.length,
      approved: done,
      active: rows.filter((m) => !['APPROVED', 'REJECTED', 'CANCELLED'].includes(m.status)).length,
      percent: rows.length ? Math.round(rows.reduce((a, m) => a + m.percent, 0) / rows.length) : 0,
    },
  };
};

export const addFamilyMember = async (
  mainCaseId: string,
  actorId: string,
  input: { firstName: string; lastName: string; relation: Relation; birthDate?: string | null; email?: string | null; profession?: string | null } & Partial<Omit<CreateMemberInput, 'firstName' | 'lastName' | 'relation'>>,
) => {
  const main = await prisma.case.findUnique({ where: { id: mainCaseId }, select: { id: true, clientId: true, parentCaseId: true, status: true, visaCategoryId: true } });
  if (!main) throw notFound('CASE_NOT_FOUND');
  if (main.parentCaseId) throw badRequest('NOT_A_MAIN_CASE');
  if (main.status === 'CANCELLED') throw conflict('MAIN_CASE_CANCELLED');

  const created = await createCase(main.clientId, {
    profession: input.profession?.trim() || `Familiennachzug – ${input.relation}`,
    visaType: 'FAMILY', // the member applies for a family reunion visa (FAMILY checklist, VIDEX purpose)
    visaCategoryId: main.visaCategoryId,
    parentCaseId: main.id,
    relation: input.relation,
    actorId,
  });
  const info: FamilyMemberInfo = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    birthDate: input.birthDate ?? null,
    email: input.email?.trim() || null,
    relation: input.relation,
  };
  await prisma.caseEvent.create({
    data: { caseId: created.id, type: FAMILY_EVENT, note: JSON.stringify(info), actorId, visibleToClient: false },
  });
  const { profession: _p, ...profile } = input;
  await createProfile(main.id, created.id, { ...profile, email: info.email }, actorId);
  await prisma.caseEvent.create({
    data: { caseId: main.id, type: 'CASE_UPDATED', note: `Family member added: ${info.firstName} ${info.lastName} (${info.relation}) → ${created.number}`, actorId, visibleToClient: false },
  });
  void syncCaseFolder(created.id); // folder named after the member, inside the main applicant's folder
  // Reusable documents of the main case (marriage certificate, passport copy, visa …) go in right away.
  await (await import('../family/reunion.js')).copyReusableDocs(main.id, created.id, actorId).catch((e) => console.error('[family] document copy failed', e));
  return created;
};

const REMOVABLE: CaseStatus[] = ['DOCUMENTS_PENDING'];

/** Removes a member case that was created by mistake (only while nothing happened in it yet). */
export const removeFamilyMember = async (mainCaseId: string, memberId: string) => {
  const member = await prisma.case.findUnique({ where: { id: memberId }, select: { id: true, parentCaseId: true, status: true, _count: { select: { documents: true } } } });
  if (!member || member.parentCaseId !== mainCaseId) throw notFound('CASE_NOT_FOUND');
  if (!REMOVABLE.includes(member.status) || member._count.documents > 0) throw conflict('MEMBER_CASE_IN_PROGRESS');
  await prisma.case.delete({ where: { id: member.id } });
};
