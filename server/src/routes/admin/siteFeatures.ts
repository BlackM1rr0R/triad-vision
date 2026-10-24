import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { verifyStoredFile } from '../../lib/fileCheck.js';
import { normaliseVideoMime, videoMatches } from '../../lib/placement/introVideo.js';
import { SEO_LOCALES, type SeoLocale } from '../../lib/seoCatalogue.js';
import { searchStats } from '../../lib/search/index.js';
import { alertStats } from '../../lib/jobAlerts/service.js';
import { adminMagnet, filePath, filesOf, leadMagnetUpload, magnetInput, removeFile } from '../../lib/leadMagnets/service.js';
import { generateStarterEbook } from '../../lib/leadMagnets/starterEbook.js';

/**
 * Admin side of the public site features — mounted at /api/admin/site-features:
 *   GET    /search-stats?from=&to=           top searches and zero-result searches (anonymous daily counts)
 *   GET    /job-alert-stats                  active job alerts per profession
 *   POST   /video-upload                     story video (MP4 / WebM ≤ 100 MB) → public /uploads URL (ADMIN)
 *   GET    /lead-magnets                     e-books with download counts and PDF languages
 *   POST   /lead-magnets, PUT/DELETE /lead-magnets/:id                 (ADMIN)
 *   POST   /lead-magnets/:id/files/:lng      PDF upload for one language (ADMIN); DELETE removes it
 *   GET    /lead-magnets/:id/files/:lng      the stored PDF (preview)
 *   POST   /lead-magnets/starter             (re)generate the starter e-book from the guides (ADMIN, idempotent)
 */
export const adminSiteFeaturesRouter = Router();

const DAY = 24 * 60 * 60 * 1000;
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const todayUtc = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

adminSiteFeaturesRouter.get('/search-stats', async (req, res) => {
  const q = parse(z.object({ from: isoDay.optional(), to: isoDay.optional(), limit: z.coerce.number().int().min(1).max(100).catch(20) }), req.query);
  const to = q.to ? new Date(`${q.to}T00:00:00Z`) : todayUtc();
  const from = q.from ? new Date(`${q.from}T00:00:00Z`) : new Date(to.getTime() - 29 * DAY);
  if (from > to) throw badRequest('INVALID_RANGE');
  res.json({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), ...(await searchStats(from, to, q.limit)) });
});

adminSiteFeaturesRouter.get('/job-alert-stats', async (_req, res) => {
  res.json(await alertStats());
});

// ─── Story video upload ────────────────────────────────────────────────

const VIDEO_MAX = 100 * 1024 * 1024;
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: config.uploads.publicDir,
    filename: (_req, file, cb) => {
      const mime = normaliseVideoMime(file.mimetype, file.originalname) ?? 'video/mp4';
      cb(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${mime === 'video/webm' ? '.webm' : '.mp4'}`);
    },
  }),
  limits: { fileSize: VIDEO_MAX, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = normaliseVideoMime(file.mimetype, Buffer.from(file.originalname, 'latin1').toString('utf8'));
    // Browsers play MP4 (H.264) and WebM everywhere; QuickTime .mov is not accepted for the public site.
    if (mime !== 'video/mp4' && mime !== 'video/webm') return cb(badRequest('UNSUPPORTED_FILE_TYPE'));
    file.mimetype = mime;
    cb(null, true);
  },
});

adminSiteFeaturesRouter.post('/video-upload', requireMinRole('ADMIN'), videoUpload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED');
  const fh = await fsp.open(req.file.path, 'r');
  const head = Buffer.alloc(64);
  const { bytesRead } = await fh.read(head, 0, 64, 0).finally(() => fh.close());
  if (!videoMatches(head.subarray(0, bytesRead), req.file.mimetype)) {
    await fsp.unlink(req.file.path).catch(() => undefined);
    throw badRequest('FILE_CONTENT_MISMATCH');
  }
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

// ─── Lead magnets ─────────────────────────────────────────────────────

const lngParam = (raw: string): SeoLocale => {
  if (!(SEO_LOCALES as readonly string[]).includes(raw)) throw badRequest('INVALID_LANGUAGE');
  return raw as SeoLocale;
};

const getMagnet = async (id: string) => {
  const m = await prisma.leadMagnet.findUnique({ where: { id } });
  if (!m) throw notFound('LEAD_MAGNET_NOT_FOUND');
  return m;
};

const magnetData = (b: Partial<z.infer<typeof magnetInput>>) => ({
  ...(b.slug ? { slug: b.slug } : {}),
  ...(b.title ? { title: b.title } : {}),
  ...(b.description !== undefined ? { description: b.description ?? Prisma.DbNull } : {}),
  ...(b.coverUrl !== undefined ? { coverUrl: b.coverUrl || null } : {}),
  ...(b.published !== undefined ? { published: b.published } : {}),
});

adminSiteFeaturesRouter.get('/lead-magnets', async (_req, res) => {
  const items = await prisma.leadMagnet.findMany({ orderBy: { createdAt: 'asc' } });
  const sources = await prisma.inquiry.groupBy({ by: ['source'], where: { source: { startsWith: 'ebook:' } }, _count: { _all: true } });
  res.json({ items: items.map((m) => ({ ...adminMagnet(m), leads: sources.find((s) => s.source === `ebook:${m.slug}`)?._count._all ?? 0 })) });
});

adminSiteFeaturesRouter.post('/lead-magnets/starter', requireMinRole('ADMIN'), async (req, res) => {
  const { magnet, generated } = await generateStarterEbook();
  await audit(req, 'LEAD_MAGNET_STARTER_GENERATED', `leadMagnet:${magnet.id}`, { generated });
  res.status(201).json({ item: adminMagnet(magnet), generated });
});

adminSiteFeaturesRouter.post('/lead-magnets', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(magnetInput, req.body);
  if (await prisma.leadMagnet.count({ where: { slug: body.slug } })) throw conflict('SLUG_TAKEN');
  const magnet = await prisma.leadMagnet.create({
    data: { slug: body.slug, title: body.title, description: body.description ?? Prisma.DbNull, coverUrl: body.coverUrl || null, published: body.published ?? true, files: {} },
  });
  await audit(req, 'LEAD_MAGNET_CREATED', `leadMagnet:${magnet.id}`);
  res.status(201).json({ item: adminMagnet(magnet) });
});

adminSiteFeaturesRouter.put('/lead-magnets/:id', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(magnetInput.partial(), req.body);
  const m = await getMagnet(String(req.params.id));
  if (body.slug && body.slug !== m.slug && (await prisma.leadMagnet.count({ where: { slug: body.slug } }))) throw conflict('SLUG_TAKEN');
  const magnet = await prisma.leadMagnet.update({ where: { id: m.id }, data: magnetData(body) });
  res.json({ item: adminMagnet(magnet) });
});

adminSiteFeaturesRouter.delete('/lead-magnets/:id', requireMinRole('ADMIN'), async (req, res) => {
  const m = await getMagnet(String(req.params.id));
  await prisma.leadMagnet.delete({ where: { id: m.id } });
  for (const key of Object.values(filesOf(m.files))) await removeFile(key);
  await audit(req, 'LEAD_MAGNET_DELETED', `leadMagnet:${m.id}`, { slug: m.slug });
  res.json({ ok: true });
});

adminSiteFeaturesRouter.post('/lead-magnets/:id/files/:lng', requireMinRole('ADMIN'), leadMagnetUpload.single('file'), async (req, res) => {
  const lng = lngParam(String(req.params.lng));
  if (!req.file) throw badRequest('FILE_REQUIRED');
  try {
    await verifyStoredFile(req.file.path, 'application/pdf');
  } catch {
    await fsp.unlink(req.file.path).catch(() => undefined);
    throw badRequest('FILE_CONTENT_MISMATCH');
  }
  const m = await getMagnet(String(req.params.id)).catch(async (err) => {
    await fsp.unlink(req.file!.path).catch(() => undefined);
    throw err;
  });
  const files = filesOf(m.files);
  const old = files[lng];
  files[lng] = path.basename(req.file.path);
  const magnet = await prisma.leadMagnet.update({ where: { id: m.id }, data: { files } });
  await removeFile(old);
  res.status(201).json({ item: adminMagnet(magnet) });
});

adminSiteFeaturesRouter.delete('/lead-magnets/:id/files/:lng', requireMinRole('ADMIN'), async (req, res) => {
  const lng = lngParam(String(req.params.lng));
  const m = await getMagnet(String(req.params.id));
  const files = filesOf(m.files);
  const old = files[lng];
  delete files[lng];
  const magnet = await prisma.leadMagnet.update({ where: { id: m.id }, data: { files } });
  await removeFile(old);
  res.json({ item: adminMagnet(magnet) });
});

adminSiteFeaturesRouter.get('/lead-magnets/:id/files/:lng', async (req, res) => {
  const lng = lngParam(String(req.params.lng));
  const m = await getMagnet(String(req.params.id));
  const key = filesOf(m.files)[lng];
  if (!key || !fs.existsSync(filePath(key))) throw notFound('FILE_MISSING');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${m.slug}-${lng}.pdf"`);
  fs.createReadStream(filePath(key)).pipe(res);
});
