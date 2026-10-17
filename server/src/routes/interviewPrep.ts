import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, VisaType } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { parse } from '../lib/http.js';

/**
 * Interview preparation for clients — mounted at /api/interview-prep.
 *   GET /?kind=EMBASSY|EMPLOYER&visaType=…|ALL   published questions; by default filtered to the
 *       visa type of the client's current case (questions without visa types fit every case).
 * Practice progress stays in the browser (localStorage); nothing is written here.
 */
export const interviewPrepRouter = Router();
interviewPrepRouter.use(requireAuth);

export const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;

const listQuery = z.object({
  kind: z.enum(['EMBASSY', 'EMPLOYER']).optional(),
  visaType: z.enum([...VISA_TYPES, 'ALL']).optional(),
});

/** The visa type of the client's newest open main case (else the newest case at all). */
const caseVisaType = async (userId: string): Promise<VisaType | null> => {
  const c =
    (await prisma.case.findFirst({ where: { clientId: userId, closedAt: null }, orderBy: [{ parentCaseId: 'asc' }, { createdAt: 'desc' }], select: { visaType: true } })) ??
    (await prisma.case.findFirst({ where: { clientId: userId }, orderBy: { createdAt: 'desc' }, select: { visaType: true } }));
  return c?.visaType ?? null;
};

export const fitsVisaType = (visaTypes: Prisma.JsonValue | null, visaType: VisaType | null) =>
  !visaType || !Array.isArray(visaTypes) || visaTypes.length === 0 || visaTypes.includes(visaType);

interviewPrepRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const caseType = await caseVisaType(req.user!.id);
  const visaType: VisaType | null = q.visaType === 'ALL' ? null : (q.visaType ?? caseType);
  const rows = await prisma.interviewPrepQuestion.findMany({
    where: { published: true, ...(q.kind ? { kind: q.kind } : {}) },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, kind: true, category: true, question: true, answerDe: true, tips: true, visaTypes: true, sortOrder: true },
  });
  res.json({ visaType, caseVisaType: caseType, items: rows.filter((r) => fitsVisaType(r.visaTypes, visaType)) });
});
