import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { parse } from '../../lib/http.js';
import { staffView } from '../../lib/uploadAi/index.js';

/**
 * Fast document review (mounted on /api/admin/review, STAFF+): the queue of client uploads waiting for a decision
 * (Document PENDING in the INITIAL / EMBASSY stage) with everything the reviewer needs on one screen — requirement,
 * client / case, upload AI findings (name mismatch, quality, expiry) and the case's requirement checklist.
 * Decisions use the existing endpoint POST /api/admin/cases/:id/documents/:docId/review.
 *
 *   GET /review/queue?scope=all|mine&visaType=WORK&partnerId=<id|none>&caseId=<id>
 *       { items: [...], total, capped, counts: { all, mine }, filters: { visaTypes, partners } }
 */
export const adminReviewRouter = Router();

export const REVIEW_QUEUE_MAX = 200;
const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;

const queueQuery = z.object({
  scope: z.enum(['all', 'mine']).default('all'),
  visaType: z.enum(VISA_TYPES).optional(),
  partnerId: z.string().trim().min(1).max(40).optional(),
  /** One case only ("Sürətli yoxlama" from the case documents tab). */
  caseId: z.string().trim().min(1).max(40).optional(),
});

const pendingWhere = (extra: Prisma.DocumentWhereInput = {}): Prisma.DocumentWhereInput => ({
  status: 'PENDING',
  stage: { in: ['INITIAL', 'EMBASSY'] },
  case: { status: { notIn: ['APPROVED', 'REJECTED', 'CANCELLED'] } },
  ...extra,
});

export const queueWhere = (q: z.infer<typeof queueQuery>, viewerId: string): Prisma.DocumentWhereInput => {
  const caseWhere: Prisma.CaseWhereInput = {
    status: { notIn: ['APPROVED', 'REJECTED', 'CANCELLED'] },
    ...(q.scope === 'mine' ? { assignedStaffId: viewerId } : {}),
    ...(q.visaType ? { visaType: q.visaType as VisaType } : {}),
    ...(q.partnerId ? { partnerId: q.partnerId === 'none' ? null : q.partnerId } : {}),
    ...(q.caseId ? { id: q.caseId } : {}),
  };
  return { ...pendingWhere(), case: caseWhere };
};

adminReviewRouter.get('/queue', async (req, res) => {
  const q = parse(queueQuery, req.query);
  const me = req.user!.id;
  const where = queueWhere(q, me);
  const [docs, total, all, mine, partners] = await Promise.all([
    prisma.document.findMany({
      where,
      // Oldest upload first: the client who has waited longest is reviewed first.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: REVIEW_QUEUE_MAX,
      select: {
        id: true, caseId: true, stage: true, originalName: true, mimeType: true, size: true, createdAt: true, expiresAt: true, checks: true, requirementId: true,
        requirement: { select: { id: true, title: true, description: true, required: true } },
        case: {
          select: {
            id: true, number: true, status: true, visaType: true, profession: true, assignedStaffId: true,
            client: { select: { id: true, firstName: true, lastName: true, email: true } },
            visaCategory: { select: { title: true, visaLabel: true } },
            partner: { select: { id: true, name: true } },
            assignedStaff: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.document.count({ where }),
    prisma.document.count({ where: queueWhere({ scope: 'all' }, me) }),
    prisma.document.count({ where: queueWhere({ scope: 'mine' }, me) }),
    prisma.referralPartner.findMany({ where: { cases: { some: { documents: { some: pendingWhere() } } } }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 100 }),
  ]);
  const caseIds = [...new Set(docs.map((d) => d.caseId))];
  const [requirements, insights] = await Promise.all([
    caseIds.length
      ? prisma.documentRequirement.findMany({
          where: { caseId: { in: caseIds } },
          orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
          select: { id: true, caseId: true, stage: true, title: true, required: true, documents: { select: { id: true, status: true }, orderBy: { createdAt: 'desc' } } },
        })
      : [],
    docs.length ? prisma.documentInsight.findMany({ where: { documentId: { in: docs.map((d) => d.id) } } }) : [],
  ]);
  const insightOf = new Map(insights.map((i) => [i.documentId!, staffView(i)]));
  const checklistOf = new Map<string, { id: string; stage: string; title: unknown; required: boolean; state: 'MISSING' | 'PENDING' | 'ACCEPTED' | 'REJECTED' }[]>();
  for (const r of requirements) {
    const statuses = r.documents.map((d) => d.status);
    const state = statuses.includes('ACCEPTED') ? 'ACCEPTED' : statuses.includes('PENDING') ? 'PENDING' : statuses.length ? 'REJECTED' : 'MISSING';
    const list = checklistOf.get(r.caseId) ?? [];
    list.push({ id: r.id, stage: r.stage, title: r.title, required: r.required, state });
    checklistOf.set(r.caseId, list);
  }
  res.json({
    items: docs.map((d) => ({
      ...d,
      insight: insightOf.get(d.id) ?? null,
      checklist: (checklistOf.get(d.caseId) ?? []).filter((r) => r.stage === d.stage),
    })),
    total,
    capped: total > docs.length,
    counts: { all, mine },
    filters: { visaTypes: VISA_TYPES, partners },
  });
});
