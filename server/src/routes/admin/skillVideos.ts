import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { sendSkillFile } from '../../lib/skillVideos/media.js';
import { employerCounts, notifyReview, staffView } from '../../lib/skillVideos/core.js';

/**
 * Staff review of the candidates' skill videos — mounted at /api/admin/skill-videos (STAFF+):
 *   GET  /?status=PENDING|APPROVED|REJECTED|ALL&page   review queue (oldest pending first) + counts
 *   GET  /?userId= | ?caseId=                          one candidate's videos (case page → Documents tab)
 *   POST /:id/approve · POST /:id/reject { reason }    rejection notifies the candidate (in-app, push, e-mail)
 *   GET  /:id/views                                    employer view log (company, viewer, when)
 *   GET  /:id/file (HTTP Range) · GET /:id/poster
 */
export const adminSkillVideosRouter = Router();

const PAGE = 30;
const userSelect = { select: { id: true, firstName: true, lastName: true, profession: true } } as const;

adminSkillVideosRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'ALL']).default('PENDING'),
      userId: z.string().max(40).optional(),
      caseId: z.string().max(40).optional(),
      page: z.coerce.number().int().min(1).max(1000).default(1),
    }),
    req.query,
  );
  let userId = q.userId;
  if (q.caseId) {
    const c = await prisma.case.findUnique({ where: { id: q.caseId }, select: { clientId: true } });
    if (!c) throw notFound('CASE_NOT_FOUND');
    userId = c.clientId;
  }
  const where: Prisma.SkillVideoWhereInput = { ...(userId ? { userId } : {}), ...(q.status !== 'ALL' && !userId ? { status: q.status } : {}) };
  const [rows, total, grouped] = await Promise.all([
    prisma.skillVideo.findMany({
      where,
      include: { user: userSelect },
      orderBy: userId ? { createdAt: 'asc' } : q.status === 'PENDING' ? { updatedAt: 'asc' } : { updatedAt: 'desc' },
      skip: userId ? 0 : (q.page - 1) * PAGE,
      take: userId ? 20 : PAGE,
    }),
    prisma.skillVideo.count({ where }),
    prisma.skillVideo.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const counts = await employerCounts(rows.map((r) => r.id));
  // Case number per candidate for the queue (latest case).
  const cases = await prisma.case.findMany({
    where: { clientId: { in: [...new Set(rows.map((r) => r.userId))] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, number: true, clientId: true },
  });
  const caseOf = new Map<string, { id: string; number: string }>();
  for (const c of cases) if (!caseOf.has(c.clientId)) caseOf.set(c.clientId, { id: c.id, number: c.number });
  res.json({
    items: rows.map((r) => ({ ...staffView(r, counts.get(r.id) ?? 0), case: caseOf.get(r.userId) ?? null })),
    total,
    page: q.page,
    pageSize: PAGE,
    counts: Object.fromEntries(grouped.map((g) => [g.status, g._count._all])),
  });
});

const load = async (req: Request) => {
  const v = await prisma.skillVideo.findUnique({ where: { id: String(req.params.id) } });
  if (!v) throw notFound('VIDEO_NOT_FOUND');
  return v;
};

adminSkillVideosRouter.post('/:id/approve', async (req, res) => {
  const v = await load(req);
  if (v.status === 'APPROVED') throw conflict('ALREADY_APPROVED');
  const updated = await prisma.skillVideo.update({
    where: { id: v.id },
    data: { status: 'APPROVED', rejectReason: null, reviewedById: req.user!.id, reviewedAt: new Date() },
  });
  await audit(req, 'SKILL_VIDEO_APPROVED', `skillVideo:${v.id}`, { userId: v.userId });
  void notifyReview(updated, 'approved').catch((err) => console.error('[skill-videos] notify failed', err));
  res.json({ video: staffView(updated, (await employerCounts([v.id])).get(v.id) ?? 0) });
});

adminSkillVideosRouter.post('/:id/reject', async (req, res) => {
  const body = parse(z.object({ reason: z.string().trim().min(3).max(1000) }), req.body ?? {});
  const v = await load(req);
  const updated = await prisma.skillVideo.update({
    where: { id: v.id },
    data: { status: 'REJECTED', rejectReason: body.reason, reviewedById: req.user!.id, reviewedAt: new Date() },
  });
  await audit(req, 'SKILL_VIDEO_REJECTED', `skillVideo:${v.id}`, { userId: v.userId });
  await notifyReview(updated, 'rejected');
  res.json({ video: staffView(updated, (await employerCounts([v.id])).get(v.id) ?? 0) });
});

adminSkillVideosRouter.get('/:id/views', async (req, res) => {
  const v = await load(req);
  const rows = await prisma.skillVideoView.findMany({ where: { videoId: v.id }, orderBy: { createdAt: 'desc' }, take: 200 });
  const [companies, viewers] = await Promise.all([
    prisma.company.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.companyId))] } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.viewerId).filter((x): x is string => !!x))] } }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const co = new Map(companies.map((c) => [c.id, c.name]));
  const us = new Map(viewers.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  res.json({
    items: rows.map((r) => ({ id: r.id, at: r.createdAt, companyId: r.companyId, company: co.get(r.companyId) ?? null, viewer: r.viewerId ? (us.get(r.viewerId) ?? null) : null, applicationId: r.applicationId })),
    employers: co.size,
  });
});

adminSkillVideosRouter.get('/:id/file', async (req, res) => {
  await sendSkillFile(res, (await load(req)).storedName);
});

adminSkillVideosRouter.get('/:id/poster', async (req, res) => {
  const v = await load(req);
  if (!v.posterName) throw notFound('POSTER_NOT_FOUND');
  await sendSkillFile(res, v.posterName);
});
