import { Router } from 'express';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { limiter } from '../lib/http.js';
import { config } from '../config.js';
import { audit } from '../lib/audit.js';
import { INTRO_VIDEO_MAX_BYTES, deleteIntroVideo, introVideoInfo, introVideoUpload, saveIntroVideo, sendIntroVideo } from '../lib/placement/introVideo.js';

/**
 * The candidate's own video introduction for employers — mounted at /api/intro-video (CLIENT):
 *   GET    /        { video: { size, mimeType, updatedAt } | null, maxBytes }
 *   POST   /        multipart "file" (MP4 / WebM / MOV, ≤ 60 MB) — replaces the previous one
 *   DELETE /
 *   GET    /file    the video itself (range requests)
 * Staff watch it from the candidate card, employers through a share link. Design: lib/placement/introVideo.ts.
 */
export const introVideoRouter = Router();
introVideoRouter.use(requireRole('CLIENT'));

const uploadLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 20, skip: () => config.isTest });

const keyOf = async (userId: string) => (await prisma.user.findUnique({ where: { id: userId }, select: { introVideoKey: true } }))?.introVideoKey ?? null;

introVideoRouter.get('/', async (req, res) => {
  res.json({ video: await introVideoInfo(await keyOf(req.user!.id)), maxBytes: INTRO_VIDEO_MAX_BYTES });
});

introVideoRouter.post('/', uploadLimiter, introVideoUpload.single('file'), async (req, res) => {
  const saved = await saveIntroVideo(req.user!.id, req.file);
  await audit(req, 'INTRO_VIDEO_UPLOADED', `user:${req.user!.id}`, { size: saved.size, mimeType: saved.mimeType });
  res.status(201).json({ video: await introVideoInfo(saved.key) });
});

introVideoRouter.delete('/', async (req, res) => {
  const removed = await deleteIntroVideo(req.user!.id);
  if (removed) await audit(req, 'INTRO_VIDEO_DELETED', `user:${req.user!.id}`);
  res.json({ ok: true });
});

introVideoRouter.get('/file', async (req, res) => {
  await sendIntroVideo(res, await keyOf(req.user!.id));
});
