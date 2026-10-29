import fsp from 'node:fs/promises';
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import type { SkillVideo } from '@prisma/client';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, badRequest, conflict, limiter, notFound, parse } from '../lib/http.js';
import { config } from '../config.js';
import { audit } from '../lib/audit.js';
import { recordConsent } from '../lib/privacy/consents.js';
import { notifyStaff } from '../lib/notifications.js';
import { FINAL_STATUSES } from '../lib/caseFlow.js';
import {
  SKILL_VIDEO_MAX_BYTES,
  SKILL_VIDEO_MAX_RECORD_SECONDS,
  SKILL_VIDEO_MAX_SECONDS,
  acceptPoster,
  inspectVideo,
  removeSkillFile,
  sendSkillFile,
  skillVideoUpload,
} from '../lib/skillVideos/media.js';
import { SKILL_TAGS, SKILL_VIDEO_MAX_COUNT, deleteVideos, employerCounts, ownerView, suggestedSkill } from '../lib/skillVideos/core.js';

/**
 * The candidate's skill videos — mounted at /api/skill-videos (CLIENT):
 *   GET    /                 { items, limits, skills, suggestedSkill }
 *   POST   /                 multipart: file (MP4 / WebM / MOV ≤ 150 MB, ≤ 3 min), poster? (JPEG / PNG / WebP),
 *                            title, skill, source (RECORDED | UPLOADED), durationSec (browser-measured), consent ("true")
 *   POST   /:id/replace      same multipart: new file, back to review (PENDING)
 *   PATCH  /:id              { title?, skill?, consent? } — consent false withdraws (hidden from employers at once)
 *   DELETE /:id
 *   GET    /:id/file         the video (HTTP Range) · GET /:id/poster
 * Design: lib/skillVideos/core.ts.
 */
export const skillVideosRouter = Router();
skillVideosRouter.use(requireRole('CLIENT'));

const uploadLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30, skip: () => config.isTest });

const bool = z.union([z.boolean(), z.enum(['true', 'false', '1', '0', 'on'])]).transform((v) => v === true || v === 'true' || v === '1' || v === 'on');
const meta = z.object({
  title: z.string().trim().min(1).max(120),
  skill: z.enum(SKILL_TAGS),
  source: z.enum(['RECORDED', 'UPLOADED']).default('UPLOADED'),
  durationSec: z.coerce.number().min(0).max(24 * 3600).optional(),
  consent: bool.optional().default(false),
});

const files = (req: Request) => (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
const dropUploads = async (req: Request) => {
  for (const list of Object.values(files(req))) for (const f of list ?? []) await fsp.unlink(f.path).catch(() => undefined);
};

/** Refuses before the (up to 150 MB) body is read when the candidate already has 5 videos. */
const roomForNew: RequestHandler = async (req, _res, next) => {
  const n = await prisma.skillVideo.count({ where: { userId: req.user!.id } });
  next(n >= SKILL_VIDEO_MAX_COUNT ? conflict('SKILL_VIDEO_LIMIT') : undefined);
};

const own = async (req: Request) => {
  const v = await prisma.skillVideo.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!v) throw notFound('VIDEO_NOT_FOUND');
  return v;
};

/** Checks the uploaded files + form; deletes them on any problem. */
const checkUpload = async (req: Request) => {
  try {
    const video = files(req).file?.[0];
    if (!video?.path) throw badRequest('FILE_REQUIRED');
    const body = parse(meta, req.body ?? {});
    const info = await inspectVideo(video);
    const limit = body.source === 'RECORDED' ? SKILL_VIDEO_MAX_RECORD_SECONDS : SKILL_VIDEO_MAX_SECONDS;
    // The container's own duration wins; browser recordings without one fall back to the browser's measurement.
    const seconds = info.durationSec ?? body.durationSec ?? null;
    if (seconds != null && seconds > limit + 1) throw badRequest('VIDEO_TOO_LONG');
    const poster = await acceptPoster(files(req).poster?.[0]);
    return { body, info, seconds, poster, storedName: video.filename };
  } catch (err) {
    await dropUploads(req);
    throw err;
  }
};

const logConsent = (req: Request, v: Pick<SkillVideo, 'id'>, granted: boolean) =>
  recordConsent({ userId: req.user!.id, type: 'SKILL_VIDEO', granted, source: 'SKILL_VIDEO', req });

const openCaseId = async (userId: string) =>
  (
    (await prisma.case.findFirst({ where: { clientId: userId, status: { notIn: FINAL_STATUSES } }, orderBy: { createdAt: 'desc' }, select: { id: true } })) ??
    (await prisma.case.findFirst({ where: { clientId: userId }, orderBy: { createdAt: 'desc' }, select: { id: true } }))
  )?.id ?? null;

const respondList = async (userId: string) => {
  const [rows, user] = await Promise.all([
    prisma.skillVideo.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.user.findUnique({ where: { id: userId }, select: { profession: true } }),
  ]);
  const counts = await employerCounts(rows.map((r) => r.id));
  return {
    items: rows.map((r) => ownerView(r, counts.get(r.id) ?? 0)),
    limits: { maxCount: SKILL_VIDEO_MAX_COUNT, maxBytes: SKILL_VIDEO_MAX_BYTES, maxSeconds: SKILL_VIDEO_MAX_SECONDS, maxRecordSeconds: SKILL_VIDEO_MAX_RECORD_SECONDS },
    skills: SKILL_TAGS,
    suggestedSkill: suggestedSkill(user?.profession),
    // "viewed by 2 employers" across all videos
    employersTotal: rows.length
      ? (await prisma.skillVideoView.groupBy({ by: ['companyId'], where: { videoId: { in: rows.map((r) => r.id) } } })).length
      : 0,
  };
};

skillVideosRouter.get('/', async (req, res) => {
  res.json(await respondList(req.user!.id));
});

skillVideosRouter.post('/', uploadLimiter, roomForNew, skillVideoUpload, async (req, res) => {
  const up = await checkUpload(req);
  const userId = req.user!.id;
  // Two uploads in parallel could both pass the early check.
  if ((await prisma.skillVideo.count({ where: { userId } })) >= SKILL_VIDEO_MAX_COUNT) {
    await dropUploads(req);
    throw conflict('SKILL_VIDEO_LIMIT');
  }
  const now = new Date();
  const v = await prisma.skillVideo.create({
    data: {
      userId,
      caseId: await openCaseId(userId),
      title: up.body.title,
      skill: up.body.skill,
      source: up.body.source,
      storedName: up.storedName,
      posterName: up.poster,
      mimeType: up.info.mimeType,
      size: up.info.size,
      durationSec: up.seconds != null ? Math.round(up.seconds) : null,
      consentAt: up.body.consent ? now : null,
    },
  });
  if (up.body.consent) await logConsent(req, v, true);
  await audit(req, 'SKILL_VIDEO_UPLOADED', `skillVideo:${v.id}`, { size: v.size, mimeType: v.mimeType, durationSec: v.durationSec, source: v.source });
  void notifyStaff('Yeni bacarıq videosu yoxlanmalıdır', `${req.user!.firstName} ${req.user!.lastName}: "${v.title}" (${v.skill}).`, { caseId: v.caseId ?? undefined, link: '/admin/skill-videos', type: 'SKILL_VIDEO_REVIEW' }).catch(() => undefined);
  res.status(201).json({ video: ownerView(v, 0) });
});

skillVideosRouter.post('/:id/replace', uploadLimiter, async (req, _res, next) => {
  await own(req); // 404 before the body is read
  next();
}, skillVideoUpload, async (req, res) => {
  const before = await own(req).catch(async (err) => {
    await dropUploads(req);
    throw err;
  });
  const up = await checkUpload(req);
  const now = new Date();
  const v = await prisma.skillVideo.update({
    where: { id: before.id },
    data: {
      title: up.body.title,
      skill: up.body.skill,
      source: up.body.source,
      storedName: up.storedName,
      posterName: up.poster,
      mimeType: up.info.mimeType,
      size: up.info.size,
      durationSec: up.seconds != null ? Math.round(up.seconds) : null,
      // New footage: reviewed again, and the consent checkbox is asked again for it.
      status: 'PENDING',
      rejectReason: null,
      reviewedAt: null,
      reviewedById: null,
      consentAt: up.body.consent ? now : null,
      consentWithdrawnAt: null,
    },
  });
  await removeSkillFile(before.storedName);
  await removeSkillFile(before.posterName);
  if (up.body.consent !== !!(before.consentAt && !before.consentWithdrawnAt)) await logConsent(req, v, up.body.consent);
  await audit(req, 'SKILL_VIDEO_REPLACED', `skillVideo:${v.id}`, { size: v.size, mimeType: v.mimeType, durationSec: v.durationSec });
  res.json({ video: ownerView(v, (await employerCounts([v.id])).get(v.id) ?? 0) });
});

skillVideosRouter.patch('/:id', async (req, res) => {
  const body = parse(z.object({ title: z.string().trim().min(1).max(120).optional(), skill: z.enum(SKILL_TAGS).optional(), consent: z.boolean().optional() }).strict(), req.body ?? {});
  const before = await own(req);
  const data: Record<string, unknown> = {};
  if (body.title !== undefined && body.title !== before.title) {
    data.title = body.title;
    // Employers read the title: a changed title of an approved video is checked again.
    if (before.status === 'APPROVED') Object.assign(data, { status: 'PENDING', reviewedAt: null, reviewedById: null });
  }
  if (body.skill !== undefined) data.skill = body.skill;
  const had = !!(before.consentAt && !before.consentWithdrawnAt);
  if (body.consent !== undefined && body.consent !== had) {
    Object.assign(data, body.consent ? { consentAt: new Date(), consentWithdrawnAt: null } : { consentWithdrawnAt: new Date() });
  }
  const v = Object.keys(data).length ? await prisma.skillVideo.update({ where: { id: before.id }, data }) : before;
  if (body.consent !== undefined && body.consent !== had) {
    await logConsent(req, v, body.consent);
    await audit(req, body.consent ? 'SKILL_VIDEO_CONSENT_GIVEN' : 'SKILL_VIDEO_CONSENT_WITHDRAWN', `skillVideo:${v.id}`);
  }
  res.json({ video: ownerView(v, (await employerCounts([v.id])).get(v.id) ?? 0) });
});

skillVideosRouter.delete('/:id', async (req, res) => {
  const v = await own(req);
  await deleteVideos([v]);
  await audit(req, 'SKILL_VIDEO_DELETED', `skillVideo:${v.id}`);
  res.json({ ok: true });
});

skillVideosRouter.get('/:id/file', async (req, res) => {
  await sendSkillFile(res, (await own(req)).storedName);
});

skillVideosRouter.get('/:id/poster', async (req, res) => {
  const v = await own(req);
  if (!v.posterName) throw new HttpError(404, 'POSTER_NOT_FOUND');
  await sendSkillFile(res, v.posterName);
});
