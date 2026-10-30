import type { FamilyReunionInfo, VisaType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { badRequest, notFound } from '../http.js';
import { isBlueCardCategory } from '../ai/features/caseAi/contract.js';
import { assessReunion, reunionTimeline, SPONSOR_TITLES, type SponsorTitle } from './legal.js';
import type { FamilyMemberSummary } from './members.js';

/**
 * Familiennachzug readiness (rules: lib/family/legal.ts): the main applicant's title, flat and income — saved in
 * FamilyReunionInfo, empty fields guessed from the case (visa category, decision date, employment contract) —
 * checked against every member, plus the step timeline of the client portal and the staff list of families
 * waiting for the reunion (/admin/family-reunion).
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amount = (max: number) => z.number().int().min(0).max(max).nullable().optional();

export const reunionInfoSchema = z
  .object({
    sponsorTitle: z.enum(SPONSOR_TITLES).nullable().optional(),
    titleIssuedAt: day.nullable().optional(),
    livingSpaceM2: amount(2000),
    warmRent: amount(20000),
    netMonthly: amount(100000),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'EMPTY_UPDATE');
export type ReunionInfoInput = z.infer<typeof reunionInfoSchema>;

/** Residence title guessed from the main case's visa (WORK → skilled worker, a § 18g category → Blue Card). */
export const inferTitle = (visaType: VisaType, category: { visaLabel: string; slug: string } | null): SponsorTitle | null => {
  if (isBlueCardCategory(category)) return 'BLUE_CARD';
  if (category && /\b19\b|ict/i.test(`${category.visaLabel} ${category.slug}`)) return 'ICT';
  if (category && /18\s*d|forsch|research/i.test(`${category.visaLabel} ${category.slug}`)) return 'RESEARCH';
  const map: Partial<Record<VisaType, SponsorTitle>> = { WORK: 'SKILLED', AUSBILDUNG: 'AUSBILDUNG', WEITERBILDUNG: 'OTHER', STUDY: 'STUDY', JOB_SEEKER: 'JOB_SEEKER' };
  return map[visaType] ?? null;
};

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const num = (d: { toNumber(): number } | null | undefined) => (d == null ? null : d.toNumber());

const serializeInfo = (i: FamilyReunionInfo | null) =>
  i ? { sponsorTitle: (i.sponsorTitle as SponsorTitle | null) ?? null, titleIssuedAt: iso(i.titleIssuedAt), livingSpaceM2: i.livingSpaceM2, warmRent: i.warmRent, netMonthly: i.netMonthly, notes: i.notes, updatedAt: i.updatedAt.toISOString() } : null;

/** Readiness + timeline of a family, from the members already summarised by familyOverview. */
export const familyReadiness = async (mainCaseId: string, members: FamilyMemberSummary[], workerReady: boolean, now = new Date()) => {
  const [main, info, contract] = await Promise.all([
    prisma.case.findUniqueOrThrow({ where: { id: mainCaseId }, select: { visaType: true, decisionAt: true, visaCategory: { select: { visaLabel: true, slug: true } } } }),
    prisma.familyReunionInfo.findUnique({ where: { mainCaseId } }),
    prisma.employmentContract.findUnique({ where: { caseId: mainCaseId }, select: { grossMonthly: true, grossYearly: true } }),
  ]);
  const gross = num(contract?.grossMonthly) ?? (contract?.grossYearly != null ? Math.round(contract.grossYearly.toNumber() / 12) : null);
  const inferred = { sponsorTitle: inferTitle(main.visaType, main.visaCategory), titleIssuedAt: iso(main.decisionAt), grossMonthly: gross };
  const title = (info?.sponsorTitle as SponsorTitle | null) ?? inferred.sponsorTitle;
  // Members whose case was refused / cancelled are not part of the move (a later restart brings them back).
  const moving = members.filter((m) => m.status !== 'CANCELLED' && m.status !== 'REJECTED');
  const assessment = assessReunion(
    { title, titleIssuedAt: info?.titleIssuedAt ?? main.decisionAt, livingSpaceM2: info?.livingSpaceM2 ?? null, warmRent: info?.warmRent ?? null, netMonthly: info?.netMonthly ?? null, grossMonthly: gross },
    moving.map((m) => ({
      caseId: m.caseId,
      relation: m.relation,
      birthDate: m.profile?.birthDate ? new Date(`${m.profile.birthDate}T00:00:00.000Z`) : null,
      germanExempt: !!m.profile?.germanExempt,
      germanCertAccepted: m.checklist.some((i) => i.key === 'GERMAN_CERT' && i.state === 'accepted'),
    })),
    now,
  );
  const sponsorCodes = ['SPONSOR_TITLE', 'LIVING_SPACE', 'INCOME'];
  const proofReady = assessment.checks.filter((c) => sponsorCodes.includes(c.code)).every((c) => c.status === 'ok' || c.status === 'warn');
  const timeline = reunionTimeline(
    {
      workerReady,
      proofReady,
      members: members.map((m) => ({
        status: m.status,
        appointmentAt: m.appointmentAt ? new Date(m.appointmentAt) : null,
        plannedEntryAt: m.profile?.plannedEntryAt ? new Date(`${m.profile.plannedEntryAt}T00:00:00.000Z`) : null,
        openItems: m.counts.missing + m.counts.rejected,
      })),
    },
    now,
  );
  return { info: serializeInfo(info), inferred, ...assessment, timeline };
};
export type FamilyReadiness = Awaited<ReturnType<typeof familyReadiness>>;

/** Saves the main applicant's data (client: own case; staff: any). Only the main case carries it. */
export const saveReunionInfo = async (caseId: string, input: ReunionInfoInput, actorId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, parentCaseId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  if (c.parentCaseId) throw badRequest('NOT_A_MAIN_CASE');
  const data = {
    ...(input.sponsorTitle !== undefined && { sponsorTitle: input.sponsorTitle }),
    ...(input.titleIssuedAt !== undefined && { titleIssuedAt: input.titleIssuedAt ? new Date(`${input.titleIssuedAt}T00:00:00.000Z`) : null }),
    ...(input.livingSpaceM2 !== undefined && { livingSpaceM2: input.livingSpaceM2 }),
    ...(input.warmRent !== undefined && { warmRent: input.warmRent }),
    ...(input.netMonthly !== undefined && { netMonthly: input.netMonthly }),
    ...(input.notes !== undefined && { notes: input.notes || null }),
    updatedById: actorId,
  };
  await prisma.familyReunionInfo.upsert({ where: { mainCaseId: c.id }, create: { mainCaseId: c.id, ...data }, update: data });
  return Object.keys(data).filter((k) => k !== 'updatedById');
};

// ─── Staff list ────────────────────────────────────────────────────────

export const WAITING_STAGES = ['waiting', 'ready', 'active', 'all'] as const;
export type WaitingStage = (typeof WAITING_STAGES)[number];
const LIST_LIMIT = 150;

/**
 * Families with members joining LATER whose cases are not all closed: where the worker is (visa / arrival),
 * whether the reunion started, the readiness status and the open document items. Stage filter:
 * waiting = worker not ready yet, ready = worker ready but not started, active = started.
 */
export const waitingFamilies = async (stage: WaitingStage) => {
  const rows = await prisma.familyMember.findMany({
    where: { joinsWhen: 'LATER', memberCase: { status: { notIn: FINAL_STATUSES } } },
    select: { mainCaseId: true },
    distinct: ['mainCaseId'],
    orderBy: { createdAt: 'desc' }, // newest families first
    take: LIST_LIMIT,
  });
  const { familyOverview } = await import('./members.js');
  const out = [];
  const counts = { waiting: 0, ready: 0, active: 0 };
  for (const { mainCaseId } of rows) {
    const ov = await familyOverview(mainCaseId);
    const r = ov.reunion;
    if (!r) continue;
    const phase: Exclude<WaitingStage, 'all'> = r.startedAt ? 'active' : r.ready ? 'ready' : 'waiting';
    counts[phase]++; // over every family: the filter only narrows the rows
    if (stage !== 'all' && stage !== phase) continue;
    const main = await prisma.case.findUniqueOrThrow({ where: { id: mainCaseId }, select: { assignedStaff: { select: { firstName: true, lastName: true } } } });
    out.push({
      mainCaseId,
      number: ov.main.number,
      name: ov.main.name,
      status: ov.main.status,
      staff: main.assignedStaff ? `${main.assignedStaff.firstName} ${main.assignedStaff.lastName}`.trim() : null,
      phase,
      startedAt: r.startedAt,
      members: ov.members.map((m) => ({ caseId: m.caseId, number: m.number, relation: m.relation, status: m.status, joinsWhen: m.profile?.joinsWhen ?? 'WITH_MAIN', name: m.profile ? `${m.profile.firstName} ${m.profile.lastName}`.trim() : m.number })),
      openItems: ov.aggregate.openItems,
      readiness: ov.readiness ? { status: ov.readiness.status, problems: ov.readiness.checks.filter((c) => c.status !== 'ok').map((c) => ({ code: c.code, status: c.status })) } : null,
      current: ov.readiness?.timeline.find((s) => s.state === 'current')?.key ?? null,
    });
  }
  return { families: out, counts, truncated: rows.length >= LIST_LIMIT };
};
