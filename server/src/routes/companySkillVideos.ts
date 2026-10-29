import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import type { Company } from '@prisma/client';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { forbidden, notFound, parse } from '../lib/http.js';
import { employerVisibleWhere } from '../lib/vacancies.js';
import { sendSkillFile } from '../lib/skillVideos/media.js';
import { employerVideoWhere, employerView } from '../lib/skillVideos/core.js';

/**
 * Employer portal: skill videos of the candidates presented to this company — mounted at
 * /api/company/skill-videos (COMPANY, own company only):
 *   GET  /                 { items: [{ applicationId, videos }] } for every employer-visible application
 *   GET  /:id/file         the video (HTTP Range) · GET /:id/poster
 *   POST /:id/view         { applicationId? } logs that this employer watched it (once per 30 min per viewer)
 * Only APPROVED videos with active consent of candidates presented to the company (lib/skillVideos/core.ts).
 * The player hides the download button (controlsList="nodownload"); that is a deterrent, not DRM.
 */
export const companySkillVideosRouter = Router();

const loadCompany: RequestHandler = async (req, res, next) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { company: true } });
  if (!u?.company) return next(forbidden('NO_COMPANY'));
  if (u.company.status === 'SUSPENDED') return next(forbidden('COMPANY_SUSPENDED'));
  res.locals.company = u.company;
  next();
};

companySkillVideosRouter.use(requireRole('COMPANY'), loadCompany);

const co = (res: Response) => res.locals.company as Company;

companySkillVideosRouter.get('/', async (_req, res) => {
  const companyId = co(res).id;
  const apps = await prisma.vacancyApplication.findMany({
    where: { vacancy: { companyId }, AND: [employerVisibleWhere] },
    select: { id: true, userId: true },
    take: 1000,
  });
  const videos = apps.length
    ? await prisma.skillVideo.findMany({
        where: { ...employerVideoWhere(companyId), userId: { in: [...new Set(apps.map((a) => a.userId))] } },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const byUser = new Map<string, ReturnType<typeof employerView>[]>();
  for (const v of videos) byUser.set(v.userId, [...(byUser.get(v.userId) ?? []), employerView(v)]);
  res.json({ items: apps.filter((a) => byUser.has(a.userId)).map((a) => ({ applicationId: a.id, videos: byUser.get(a.userId)! })) });
});

const visible = async (req: Request, res: Response) => {
  const v = await prisma.skillVideo.findFirst({ where: { id: String(req.params.id), ...employerVideoWhere(co(res).id) } });
  if (!v) throw notFound('VIDEO_NOT_FOUND');
  return v;
};

companySkillVideosRouter.get('/:id/file', async (req, res) => {
  await sendSkillFile(res, (await visible(req, res)).storedName);
});

companySkillVideosRouter.get('/:id/poster', async (req, res) => {
  const v = await visible(req, res);
  if (!v.posterName) throw notFound('POSTER_NOT_FOUND');
  await sendSkillFile(res, v.posterName);
});

const DEDUPE_MS = 30 * 60 * 1000;

companySkillVideosRouter.post('/:id/view', async (req, res) => {
  const body = parse(z.object({ applicationId: z.string().max(40).optional() }), req.body ?? {});
  const v = await visible(req, res);
  const companyId = co(res).id;
  // Only an application of this company for this candidate is kept as context.
  const app = body.applicationId
    ? await prisma.vacancyApplication.findFirst({ where: { id: body.applicationId, userId: v.userId, vacancy: { companyId } }, select: { id: true } })
    : null;
  const recent = await prisma.skillVideoView.findFirst({
    where: { videoId: v.id, companyId, viewerId: req.user!.id, createdAt: { gt: new Date(Date.now() - DEDUPE_MS) } },
    select: { id: true },
  });
  if (!recent) await prisma.skillVideoView.create({ data: { videoId: v.id, companyId, viewerId: req.user!.id, applicationId: app?.id ?? null } });
  res.json({ ok: true, counted: !recent });
});
