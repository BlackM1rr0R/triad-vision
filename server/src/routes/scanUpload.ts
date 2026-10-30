import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { isStaff, requireAuth } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, HttpError, limiter, parse } from '../lib/http.js';
import { FileCheckError, verifyStoredFile } from '../lib/fileCheck.js';
import { buildScanPdf, SCAN_IMAGE_MIME, SCAN_MAX_PAGES, SCAN_MAX_PDF_BYTES, ScanImageError } from '../lib/scan/pdf.js';
import { scheduleAiDocCheck } from '../lib/aiDocs/docCheck.js';
import { prepareCaseDocument, publicQuality, scheduleUploadAnalysis } from '../lib/uploadAi/index.js';
import { photoCheckOnUpload } from '../lib/photoCheck/index.js'; // biometric photo rules (PHOTO / PHOTO_2)
import { resolveScanTarget, scanFileName, STAFF_SCAN_STAGES, storeScanDocument } from '../lib/scan/store.js';

/**
 * POST /api/cases/:caseId/documents/scan — phone / browser scan: up to 20 JPEG/PNG page images
 * (multipart field `pages`, in order) become ONE PDF stored as a normal case document.
 * Fields: requirementId (client: required), stage (staff only: INITIAL/EMBASSY/VISA/OTHER), name.
 * The case owner and staff (with 2FA, any case) may use it. Mounted before the cases router.
 */
export const scanUploadRouter = Router();
scanUploadRouter.use(requireAuth);

const incomingDir = path.join(config.uploads.privateDir, '.scan-incoming');
fsSync.mkdirSync(incomingDir, { recursive: true });

const scanUpload = multer({
  storage: multer.diskStorage({
    destination: incomingDir,
    filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(10).toString('hex')}`),
  }),
  limits: { fileSize: config.uploads.maxFileSize, files: SCAN_MAX_PAGES },
  fileFilter: (_req, file, cb) => {
    // Only JPEG / PNG: the PDF embeds the bytes directly.
    const mime = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
    if ((SCAN_IMAGE_MIME as readonly string[]).includes(mime)) {
      file.mimetype = mime;
      cb(null, true);
    } else cb(badRequest('UNSUPPORTED_FILE_TYPE'));
  },
}).array('pages', SCAN_MAX_PAGES);

const receivePages = (req: Request, res: Response, next: NextFunction) =>
  scanUpload(req, res, (err: unknown) => {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') return next(badRequest('TOO_MANY_PAGES', `At most ${SCAN_MAX_PAGES} pages`));
    next(err);
  });

scanUploadRouter.post('/:caseId/documents/scan', receivePages, async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  try {
    if (!files.length) throw badRequest('PAGES_REQUIRED');
    const body = parse(
      z.object({
        requirementId: z.string().trim().min(1).max(40).optional(),
        stage: z.enum(STAFF_SCAN_STAGES).optional(),
        name: z.string().trim().max(180).optional(),
      }),
      req.body,
    );
    const actor = { id: req.user!.id, staff: isStaff(req.user), twoFactorEnabled: !!req.user!.twoFactorEnabled };
    const target = await resolveScanTarget(actor, { caseId: String(req.params.caseId), requirementId: body.requirementId, stage: body.stage });

    const pages: { data: Buffer; mime: string }[] = [];
    for (const f of files) {
      try {
        await verifyStoredFile(f.path, f.mimetype);
      } catch (err) {
        if (err instanceof FileCheckError) throw badRequest(err.code);
        throw err;
      }
      pages.push({ data: await fs.readFile(f.path), mime: f.mimetype });
    }
    let pdf: Buffer;
    try {
      pdf = await buildScanPdf(pages, { title: body.name });
    } catch (err) {
      if (err instanceof ScanImageError) throw badRequest('INVALID_IMAGE', err.message);
      throw err;
    }
    if (pdf.length > SCAN_MAX_PDF_BYTES) throw new HttpError(413, 'SCAN_TOO_LARGE');

    const result = await storeScanDocument(actor, target, pdf, scanFileName(body.name), pages.length);
    await audit(req, 'DOCUMENT_SCAN_UPLOADED', result.document.id, { caseId: target.c.id, pages: pages.length, size: pdf.length, staff: target.asStaff });
    const quality = publicQuality(await prepareCaseDocument(result.document.id)); // smart uploads: scan quality, never throws
    const photoCheck = await photoCheckOnUpload(result.document.id); // a scanned PDF for the biometric photo → "upload a JPEG / PNG"
    res.status(201).json({ ...result, pages: pages.length, quality, photoCheck });
    if (!target.asStaff) scheduleAiDocCheck(result.document.id); // AI check of client scans (checks.ai)
    scheduleUploadAnalysis({ documentId: result.document.id }); // recognition + proposals, in the background
  } finally {
    await Promise.all(files.map((f) => fs.unlink(f.path).catch(() => undefined)));
  }
});

/**
 * POST /api/scan/pdf — the camera scanner's pages (multipart `pages`, ≤ 20 JPEG/PNG, in order) as ONE PDF in the
 * response, stored nowhere. Lets every upload spot that takes a PDF (vault, housing, translations, job
 * applications) reuse the scanner: the browser sends the returned PDF through that spot's normal upload.
 * Any signed-in user; rate-limited per account.
 */
export const scanPdfRouter = Router();
scanPdfRouter.use(requireAuth);

const scanPdfLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 30, keyGenerator: (req) => `scan-pdf:${req.user?.id ?? req.ip}` });

scanPdfRouter.post('/pdf', scanPdfLimiter, receivePages, async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  try {
    if (!files.length) throw badRequest('PAGES_REQUIRED');
    const body = parse(z.object({ name: z.string().trim().max(180).optional() }), req.body);
    const pages: { data: Buffer; mime: string }[] = [];
    for (const f of files) {
      try {
        await verifyStoredFile(f.path, f.mimetype);
      } catch (err) {
        if (err instanceof FileCheckError) throw badRequest(err.code);
        throw err;
      }
      pages.push({ data: await fs.readFile(f.path), mime: f.mimetype });
    }
    let pdf: Buffer;
    try {
      pdf = await buildScanPdf(pages, { title: body.name });
    } catch (err) {
      if (err instanceof ScanImageError) throw badRequest('INVALID_IMAGE', err.message);
      throw err;
    }
    if (pdf.length > SCAN_MAX_PDF_BYTES) throw new HttpError(413, 'SCAN_TOO_LARGE');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${scanFileName(body.name).replace(/[^\w.-]/g, '_')}"`);
    res.setHeader('X-Scan-Pages', String(pages.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  } finally {
    await Promise.all(files.map((f) => fs.unlink(f.path).catch(() => undefined)));
  }
});
