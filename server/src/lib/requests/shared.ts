import { z } from 'zod';
import type { CandidateRequest, CandidateRequestStatus } from '@prisma/client';
import { prisma } from '../../db.js';
import { GERMAN_LEVELS } from '../matching.js';

/**
 * Employer bulk candidate requests ("Personalanfrage"): shared validation, progress counters and the
 * automatic status rules (IN_PROGRESS on the first proposal, FILLED once enough candidates are accepted).
 */

export const REQUEST_STATUSES = ['OPEN', 'IN_PROGRESS', 'FILLED', 'CANCELLED'] as const;
export const FINAL_REQUEST_STATUSES: CandidateRequestStatus[] = ['FILLED', 'CANCELLED'];

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

/** YYYY-MM-DD or ISO timestamp; '' / null clears. */
const optDate = z
  .union([z.null(), z.literal(''), z.string().max(40)])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00.000Z`) : new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_DATE' });
      return z.NEVER;
    }
    return d;
  });

const fields = {
  title: z.string().trim().min(2).max(200),
  profession: z.string().trim().min(2).max(120),
  quantity: z.number().int().min(1).max(200),
  visaCategoryId: z.string().max(40).nullable().optional(),
  germanLevel: z.enum(GERMAN_LEVELS).nullable().optional(),
  drivingLicence: optText(40),
  minExperience: z.number().int().min(0).max(40).nullable().optional(),
  city: optText(80),
  startDate: optDate,
  salaryMin: z.number().int().min(0).max(100_000).nullable().optional(),
  salaryMax: z.number().int().min(0).max(100_000).nullable().optional(),
  notes: optText(5000),
};

const salaryOrder = (v: { salaryMin?: number | null; salaryMax?: number | null }) =>
  v.salaryMin == null || v.salaryMax == null || v.salaryMin <= v.salaryMax;

export const requestInput = z.object(fields).refine(salaryOrder, { message: 'SALARY_RANGE', path: ['salaryMax'] });
export const requestPatch = z
  .object({
    title: fields.title.optional(),
    profession: fields.profession.optional(),
    quantity: fields.quantity.optional(),
    visaCategoryId: fields.visaCategoryId,
    germanLevel: fields.germanLevel,
    drivingLicence: fields.drivingLicence,
    minExperience: fields.minExperience,
    city: fields.city,
    startDate: fields.startDate,
    salaryMin: fields.salaryMin,
    salaryMax: fields.salaryMax,
    notes: fields.notes,
  })
  .refine(salaryOrder, { message: 'SALARY_RANGE', path: ['salaryMax'] });

export type RequestInput = z.infer<typeof requestPatch>;

export interface Progress {
  proposed: number;
  interviewing: number;
  accepted: number;
  rejected: number;
  quantity: number;
}

/** Application counters per linked vacancy (employer-visible statuses only). */
export const progressFor = async (requests: Pick<CandidateRequest, 'id' | 'vacancyId' | 'quantity'>[]) => {
  const vacancyIds = [...new Set(requests.map((r) => r.vacancyId).filter((v): v is string => !!v))];
  const rows = vacancyIds.length
    ? await prisma.vacancyApplication.groupBy({
        by: ['vacancyId', 'status'],
        where: { vacancyId: { in: vacancyIds }, status: { in: ['PROPOSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'] } },
        _count: { _all: true },
      })
    : [];
  const out = new Map<string, Progress>();
  for (const r of requests) {
    const of = (s: string) => rows.find((x) => x.vacancyId === r.vacancyId && x.status === s)?._count._all ?? 0;
    out.set(r.id, r.vacancyId ? { proposed: of('PROPOSED'), interviewing: of('INTERVIEW'), accepted: of('ACCEPTED'), rejected: of('REJECTED'), quantity: r.quantity } : { proposed: 0, interviewing: 0, accepted: 0, rejected: 0, quantity: r.quantity });
  }
  return out;
};

/**
 * Applies the automatic transitions to open requests: FILLED once accepted ≥ quantity, IN_PROGRESS once a
 * candidate has been proposed. Accepting happens in the employer's decision flow, so this runs on reads and
 * after proposals. Returns the requests with their (possibly updated) status.
 */
export const syncStatuses = async <T extends Pick<CandidateRequest, 'id' | 'vacancyId' | 'quantity' | 'status'>>(requests: T[], progress?: Map<string, Progress>) => {
  const p = progress ?? (await progressFor(requests));
  const out: T[] = [];
  for (const r of requests) {
    const pr = p.get(r.id);
    let next: CandidateRequestStatus = r.status;
    if (pr && !FINAL_REQUEST_STATUSES.includes(r.status)) {
      if (pr.accepted >= r.quantity) next = 'FILLED';
      else if (r.status === 'OPEN' && pr.proposed + pr.interviewing + pr.accepted + pr.rejected > 0) next = 'IN_PROGRESS';
    }
    if (next !== r.status) {
      await prisma.candidateRequest.updateMany({ where: { id: r.id, status: r.status }, data: { status: next } });
      out.push({ ...r, status: next });
    } else out.push(r);
  }
  return out;
};

/** What the employer sees of its own request (never the staff note). */
export const employerRequestView = (r: CandidateRequest & { visaCategory?: { title: unknown; visaLabel: string } | null }, progress?: Progress) => ({
  id: r.id,
  title: r.title,
  profession: r.profession,
  quantity: r.quantity,
  visaCategoryId: r.visaCategoryId,
  visaCategory: r.visaCategory ? { title: r.visaCategory.title, visaLabel: r.visaCategory.visaLabel } : null,
  germanLevel: r.germanLevel,
  drivingLicence: r.drivingLicence,
  minExperience: r.minExperience,
  city: r.city,
  startDate: r.startDate,
  salaryMin: r.salaryMin,
  salaryMax: r.salaryMax,
  notes: r.notes,
  status: r.status,
  vacancyId: r.vacancyId,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  progress: progress ?? null,
});

export const checkVisaCategory = async (id: string | null | undefined) => {
  if (!id) return true;
  return (await prisma.visaCategory.count({ where: { id } })) > 0;
};
