import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, limiter, parse } from '../lib/http.js';
import { documentUpload } from '../middleware/upload.js';
import { createUploadLink, ingestLinkUpload, listUploadLinks, publicUploadView, resolveUploadToken, revokeUploadLink } from '../lib/uploadLinks/service.js';
import { UPLOAD_LINK_MAX_DAYS } from '../lib/uploadLinks/token.js';

/**
 * Login-free case upload links (lib/uploadLinks).
 *
 * Public — mounted at /api/upload-links (no session; rate limited; noindex):
 *   GET  /:token                 { client: "Ə. M.", items: [{ id, title, uploaded }], expiresAt, limits }  (404 unknown, 410 expired / revoked)
 *   POST /:token/files           multipart file + requirementId → the file becomes a PENDING case document
 *
 * Staff — adminUploadLinksRouter, mounted on the admin router (STAFF+, audited):
 *   GET  /cases/:id/upload-links           links of the case (never the token)
 *   POST /cases/:id/upload-links           { requirementIds, days?, note?, email? } → { link, url, token, emailed }
 *   POST /upload-links/:linkId/revoke
 */
export const uploadLinksRouter = Router();

const token = (req: Request) => String(req.params.token ?? '').slice(0, 64);
const viewLimiter = limiter({ windowMs: 60 * 1000, limit: 60, skip: () => config.isTest });
const uploadLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 40, skip: () => config.isTest });

uploadLinksRouter.use((_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

uploadLinksRouter.get('/:token', viewLimiter, async (req, res) => {
  res.json(await publicUploadView(token(req)));
});

uploadLinksRouter.post(
  '/:token/files',
  uploadLimiter,
  // Reject unknown / expired / revoked links before multer writes anything to disk.
  async (req, _res, next) => {
    try {
      await resolveUploadToken(token(req));
      next();
    } catch (err) {
      next(err);
    }
  },
  documentUpload.single('file'),
  async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('FILE_REQUIRED');
    const requirementId = String((req.body as Record<string, unknown>)?.requirementId ?? '').slice(0, 40);
    const r = await ingestLinkUpload(token(req), file, requirementId);
    await audit(req, 'UPLOAD_LINK_FILE', `case:${r.caseId}`, { linkId: r.link.id, documentId: r.document.id, requirementId, size: r.document.size, mimeType: r.document.mimeType });
    res.status(201).json({ document: r.document, checks: r.checks, quality: r.quality, photoCheck: r.photoCheck });
  },
);

// ─── Staff (mounted on the admin router: STAFF+) ─────────────────────────

export const adminUploadLinksRouter = Router();

adminUploadLinksRouter.get('/cases/:id/upload-links', async (req, res) => {
  res.json({ items: await listUploadLinks(String(req.params.id)) });
});

const createSchema = z.object({
  requirementIds: z.array(z.string().min(1).max(40)).min(1).max(30),
  days: z.number().int().min(1).max(UPLOAD_LINK_MAX_DAYS).optional(),
  note: z.string().trim().max(500).nullish(),
  email: z.boolean().optional(),
});

adminUploadLinksRouter.post('/cases/:id/upload-links', async (req, res) => {
  const body = parse(createSchema, req.body);
  const r = await createUploadLink({ caseId: String(req.params.id), requirementIds: body.requirementIds, days: body.days, note: body.note, email: body.email, actorId: req.user!.id });
  await audit(req, 'UPLOAD_LINK_CREATED', `case:${r.link.caseId}`, { linkId: r.link.id, requirementIds: r.link.requirementIds, expiresAt: r.link.expiresAt.toISOString(), emailed: r.emailed });
  res.status(201).json(r);
});

adminUploadLinksRouter.post('/upload-links/:linkId/revoke', async (req, res) => {
  const link = await revokeUploadLink(String(req.params.linkId), req.user!.id);
  await audit(req, 'UPLOAD_LINK_REVOKED', `case:${link.caseId}`, { linkId: link.id });
  res.json({ link });
});

/** Case summary used by the dialog (requirements to pick from). */
adminUploadLinksRouter.get('/cases/:id/upload-links/requirements', async (req, res) => {
  const rows = await prisma.documentRequirement.findMany({
    where: { caseId: String(req.params.id) },
    select: { id: true, title: true, stage: true, required: true, documents: { select: { status: true } } },
    orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
  });
  res.json({
    items: rows.map((r) => ({ id: r.id, title: r.title, stage: r.stage, required: r.required, missing: !r.documents.some((d) => d.status !== 'REJECTED') })),
  });
});
