import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireMinRole } from '../middleware/auth.js';
import { decodeOriginalName } from '../middleware/upload.js';
import { HttpError, badRequest, limiter, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { allows } from '../lib/drive/levels.js';
import { finalError } from '../lib/drive/org/finalCheck.js';
import { buildItems, itemSelect } from '../lib/drive/items.js';
import { createFileIn } from '../lib/drive/files.js';
import { logDriveActivity } from '../lib/driveCollab/activity.js';
import { PDF_LIMITS, PDF_MIME, loadPdf, parseRanges } from '../lib/pdfTools/core.js';
import { TARGETS, compressPdf } from '../lib/pdfTools/compress.js';
import { compressImage, heicToJpeg, imageToPdf, isHeic, toolKind } from '../lib/pdfTools/images.js';
import { applyOps, extractPages, mergeSources, redactPages, stamp, watermark, type InsertSource, type PageOp } from '../lib/pdfTools/pages.js';
import {
  VersionConflictError,
  assertVersionable,
  createResult,
  ctxOf,
  ensureStampsFolder,
  loadFile,
  loadPdfFile,
  outName,
  readBytes,
  saveResult,
  targetFolder,
  type SaveAs,
} from '../lib/pdfTools/drive.js';

/**
 * PDF tools of the team drive (/api/drive/pdf-tools), same access rules as /api/drive (STAFF + 2FA, drive
 * permissions per node). Changing a file itself ("version") needs EDIT, respects the edit lock (423
 * FILE_LOCKED), the Final mark (423 FILE_FINAL) and the base version (409 VERSION_CONFLICT); "copy"
 * needs DOWNLOAD on the source and EDIT on the target folder. Page indices are 0-based.
 *
 *   GET  /:nodeId/info                                    → name, version, pages, rights, final
 *   POST /:nodeId/apply   { baseVersion, ops[], saveAs?, name? } → rotate / delete / reorder / insert
 *   POST /split           { nodeId, mode: selected|each|ranges, pages?, ranges?, name?, parentId? }
 *   POST /merge           { ids[], name?, parentId? }     → PDFs and images in that order
 *   POST /compress        { ids[], target: email|portal2mb|custom, maxBytes?, saveAs, toPdf? }
 *   POST /heic-to-jpg     { ids[] }                       → JPG copies next to HEIC files
 *   POST /heic-upload     multipart file + parentId       → HEIC converted on upload, stored as JPG
 *   POST /watermark       { ids[], text, position, opacity, size, color, pages?, saveAs }
 *   POST /redact          { nodeId, baseVersion, pages: [{index, imagePng}], saveAs?, name? } (JSON or multipart)
 *   POST /stamp           { nodeId, baseVersion, items[], saveAs, name? }
 *   GET  /stamps                                          → stamp & signature images (Vorlagen)
 *   POST /stamps          { name, imagePng }              → adds one (PNG, transparency kept)
 */
export const pdfToolsRouter = Router();
pdfToolsRouter.use(requireMinRole('STAFF'));

const heavy = limiter({ windowMs: 60 * 1000, limit: 40, skip: () => config.isTest });

const idSchema = z.string().min(1).max(120);
const saveAsSchema = z.enum(['version', 'copy']);
const nameSchema = z.string().max(300).optional();
const pageIdx = z.number().int().min(0).max(PDF_LIMITS.maxPages);

const itemsOf = async (req: Request, ids: string[]) => {
  if (!ids.length) return [];
  const rows = await prisma.driveNode.findMany({ where: { id: { in: ids } }, select: itemSelect });
  const items = await buildItems(ctxOf(req), rows);
  return ids.map((id) => items.find((i) => i.id === id)).filter(Boolean);
};

const baseOf = (name: string) => name.replace(/\.[^.]+$/, '') || name;

// ─── info ────────────────────────────────────────────────────────────

pdfToolsRouter.get('/:nodeId/info', async (req, res) => {
  const ctx = ctxOf(req);
  const f = await loadPdfFile(ctx, String(req.params.nodeId), 'VIEW');
  const level = ctx.level(f.node.id);
  let pages: number | null = null;
  try {
    pages = (await loadPdf(await readBytes(f.node.id))).getPageCount();
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
  }
  res.json({
    id: f.node.id,
    name: f.node.name,
    parentId: f.node.parentId,
    version: f.version,
    size: f.size,
    pages,
    final: f.final,
    canEdit: allows(level, 'EDIT') && !f.final,
    canDownload: allows(level, 'DOWNLOAD'),
  });
});

// ─── page editor ─────────────────────────────────────────────────────

const opSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rotate'), pages: z.array(pageIdx).min(1).max(PDF_LIMITS.maxPages), angle: z.number().int().refine((a) => a % 90 === 0 && Math.abs(a) <= 270, 'ANGLE') }),
  z.object({ type: z.literal('delete'), pages: z.array(pageIdx).min(1).max(PDF_LIMITS.maxPages) }),
  z.object({ type: z.literal('reorder'), order: z.array(pageIdx).min(1).max(PDF_LIMITS.maxPages) }),
  z.object({ type: z.literal('insert'), at: pageIdx, sourceNodeId: idSchema, pages: z.array(pageIdx).max(PDF_LIMITS.maxPages).optional() }),
]);

/** Insert sources: DOWNLOAD (their content ends up in this file); PDFs and images only. */
const insertLoader = (req: Request) => async (nodeId: string): Promise<InsertSource> => {
  const f = await loadFile(ctxOf(req), nodeId, 'DOWNLOAD');
  if (!f.kind) throw badRequest('UNSUPPORTED_CONVERSION');
  return { kind: f.kind === 'pdf' ? 'pdf' : 'image', bytes: await readBytes(nodeId) };
};

pdfToolsRouter.post('/:nodeId/apply', heavy, async (req, res) => {
  const body = parse(z.object({ baseVersion: z.number().int().min(1), ops: z.array(opSchema).min(1).max(PDF_LIMITS.maxOps), saveAs: saveAsSchema.default('version'), name: nameSchema, parentId: idSchema.optional() }), req.body);
  if (body.ops.filter((o) => o.type === 'insert').length > PDF_LIMITS.maxInserts) throw badRequest('TOO_MANY_INSERTS');
  const ctx = ctxOf(req);
  const src = await loadPdfFile(ctx, String(req.params.nodeId), body.saveAs === 'version' ? 'EDIT' : 'DOWNLOAD');
  if (body.saveAs === 'version') await assertVersionable(req, ctx, src, body.baseVersion);
  else if (body.baseVersion !== src.version) throw new VersionConflictError(src.version);
  const { bytes, pageCount } = await applyOps(await readBytes(src.node.id), body.ops as PageOp[], insertLoader(req));
  const saved = await saveResult({
    req,
    ctx,
    src,
    bytes,
    mime: PDF_MIME,
    saveAs: body.saveAs,
    baseVersion: body.baseVersion,
    name: outName(body.name, src.node.name, ' (kopya)', '.pdf'),
    parentId: body.parentId,
    op: 'edit',
    meta: { ops: body.ops.map((o) => o.type), pages: pageCount },
  });
  const [item] = await itemsOf(req, [saved.id]);
  res.status(saved.created ? 201 : 200).json({ item, version: saved.version, pageCount, created: saved.created });
});

// ─── split / merge ───────────────────────────────────────────────────

pdfToolsRouter.post('/split', heavy, async (req, res) => {
  const body = parse(
    z.object({
      nodeId: idSchema,
      mode: z.enum(['selected', 'each', 'ranges']),
      pages: z.array(pageIdx).max(PDF_LIMITS.maxPages).optional(),
      ranges: z.string().max(2000).optional(),
      name: nameSchema,
      parentId: idSchema.optional(),
    }),
    req.body,
  );
  const ctx = ctxOf(req);
  const src = await loadPdfFile(ctx, body.nodeId, 'DOWNLOAD');
  const parent = await targetFolder(ctx, body.parentId ?? src.node.parentId);
  const buf = await readBytes(src.node.id);
  const count = (await loadPdf(buf)).getPageCount();
  let groups: number[][];
  if (body.mode === 'selected') {
    if (!body.pages?.length) throw badRequest('INVALID_PAGES');
    groups = [body.pages];
  } else if (body.mode === 'each') groups = Array.from({ length: count }, (_, i) => [i]);
  else groups = parseRanges(body.ranges ?? '', count);
  if (groups.length > PDF_LIMITS.maxSplitOutputs) throw badRequest('TOO_MANY_PARTS');
  const base = body.name ? baseOf(outName(body.name, src.node.name, '', '.pdf')) : baseOf(src.node.name);
  const label = (g: number[]) => (g.length === 1 ? `${g[0] + 1}` : g.every((v, i) => i === 0 || v === g[i - 1] + 1) ? `${g[0] + 1}-${g[g.length - 1] + 1}` : `${g.length}`);
  const created: string[] = [];
  for (const g of groups) {
    const bytes = await extractPages(buf, g);
    const name = body.mode === 'selected' && body.name ? outName(body.name, src.node.name, '', '.pdf') : `${base} (s. ${label(g)}).pdf`;
    const c = await createResult(req, parent, name, bytes, PDF_MIME, 'split', { sourceId: src.node.id, pages: g.length });
    created.push(c.id);
  }
  res.status(201).json({ items: await itemsOf(req, created) });
});

pdfToolsRouter.post('/merge', heavy, async (req, res) => {
  const body = parse(z.object({ ids: z.array(idSchema).min(2).max(PDF_LIMITS.maxMergeSources), name: nameSchema, parentId: idSchema.optional() }), req.body);
  const ctx = ctxOf(req);
  const ids = [...new Set(body.ids)];
  if (ids.length < 2) throw badRequest('MERGE_NEEDS_TWO');
  const files = [];
  for (const id of ids) {
    const f = await loadFile(ctx, id, 'DOWNLOAD');
    if (!f.kind) throw badRequest('UNSUPPORTED_CONVERSION');
    files.push(f);
  }
  if (files.reduce((a, f) => a + f.size, 0) > PDF_LIMITS.maxMergeBytes) throw new HttpError(413, 'FILE_TOO_LARGE');
  const parent = await targetFolder(ctx, body.parentId ?? files[0].node.parentId);
  const sources: InsertSource[] = [];
  for (const f of files) sources.push({ kind: f.kind === 'pdf' ? 'pdf' : 'image', bytes: await readBytes(f.node.id) });
  const name = outName(body.name, files[0].node.name, ' (birləşdirilmiş)', '.pdf');
  const bytes = await mergeSources(sources, baseOf(name));
  const c = await createResult(req, parent, name, bytes, PDF_MIME, 'merge', { sources: ids.slice(0, 50) });
  res.status(201).json({ item: (await itemsOf(req, [c.id]))[0] });
});

// ─── compress / HEIC ─────────────────────────────────────────────────

type BatchRow = { id: string; ok: boolean; error?: string; itemId?: string; name?: string; before?: number; after?: number; reached?: boolean; unchanged?: boolean; savedAs?: SaveAs };

const errCode = (err: unknown) => {
  if (err instanceof HttpError) return err.code;
  throw err;
};

/** Batch with a single file: its error is the answer (status 403 / 409 / 423 …), like the single-file tools. */
const singleFailure = (ids: string[], results: BatchRow[], errors: unknown[]) => {
  if (ids.length === 1 && results.length === 1 && !results[0].ok && errors[0]) throw errors[0];
};

pdfToolsRouter.post('/compress', heavy, async (req, res) => {
  const body = parse(
    z.object({
      ids: z.array(idSchema).min(1).max(PDF_LIMITS.maxBatch),
      target: z.enum(['email', 'portal2mb', 'custom']),
      maxBytes: z.number().int().min(50_000).max(config.drive.maxFileSize).optional(),
      saveAs: saveAsSchema.default('copy'),
      toPdf: z.boolean().optional(),
    }),
    req.body,
  );
  if (body.target === 'custom' && !body.maxBytes) throw badRequest('MAX_BYTES_REQUIRED');
  const maxBytes = body.target === 'custom' ? body.maxBytes! : TARGETS[body.target];
  const ctx = ctxOf(req);
  const results: BatchRow[] = [];
  const changed: string[] = [];
  const errors: unknown[] = [];
  const unique = [...new Set(body.ids)];
  for (const id of unique) {
    try {
      const src = await loadFile(ctx, id, body.saveAs === 'version' ? 'EDIT' : 'DOWNLOAD');
      if (!src.kind) throw badRequest('UNSUPPORTED_CONVERSION');
      // A new version is only possible without a format change: check lock / Final / rights before the work.
      if (body.saveAs === 'version' && (src.kind === 'pdf' || (src.kind === 'jpeg' && !body.toPdf))) await assertVersionable(req, ctx, src, src.version);
      const buf = await readBytes(id);
      let bytes: Buffer;
      let mime: string;
      let ext: string;
      let reached: boolean;
      if (src.kind === 'pdf') {
        const r = await compressPdf(buf, maxBytes);
        bytes = r.bytes;
        reached = r.reached;
        mime = PDF_MIME;
        ext = '.pdf';
      } else {
        const r = await compressImage(buf, body.toPdf ? null : maxBytes);
        bytes = body.toPdf ? await imageToPdf(r.bytes, baseOf(src.node.name)) : r.bytes;
        reached = bytes.length <= maxBytes;
        mime = body.toPdf ? PDF_MIME : r.mime;
        ext = body.toPdf ? '.pdf' : '.jpg';
      }
      // Only JPEG→JPEG and PDF→PDF can be a new version; a format change always makes a copy.
      const sameFormat = (src.kind === 'pdf' && mime === PDF_MIME) || (src.kind === 'jpeg' && mime === 'image/jpeg');
      const saveAs: SaveAs = body.saveAs === 'version' && sameFormat ? 'version' : 'copy';
      if (sameFormat && bytes.length >= buf.length) {
        results.push({ id, ok: true, unchanged: true, before: buf.length, after: buf.length, reached: buf.length <= maxBytes });
        continue;
      }
      const saved = await saveResult({
        req,
        ctx,
        src,
        bytes,
        mime,
        saveAs,
        baseVersion: src.version,
        name: outName(undefined, src.node.name, ' (kiçildilmiş)', ext),
        op: 'compress',
        meta: { before: buf.length, after: bytes.length, target: body.target, reached },
      });
      changed.push(saved.id);
      results.push({ id, ok: true, itemId: saved.id, name: saved.name, before: buf.length, after: bytes.length, reached, savedAs: saveAs });
    } catch (err) {
      results.push({ id, ok: false, error: errCode(err) });
      errors.push(err);
    }
  }
  singleFailure(unique, results, errors);
  res.json({ results, maxBytes, items: await itemsOf(req, changed) });
});

pdfToolsRouter.post('/heic-to-jpg', heavy, async (req, res) => {
  const body = parse(z.object({ ids: z.array(idSchema).min(1).max(PDF_LIMITS.maxBatch), parentId: idSchema.optional() }), req.body);
  const ctx = ctxOf(req);
  const results: BatchRow[] = [];
  const created: string[] = [];
  const errors: unknown[] = [];
  const unique = [...new Set(body.ids)];
  for (const id of unique) {
    try {
      const src = await loadFile(ctx, id, 'DOWNLOAD');
      const buf = await readBytes(id);
      if (!isHeic(buf)) throw badRequest('NOT_HEIC');
      const jpg = await heicToJpeg(buf);
      const saved = await saveResult({ req, ctx, src, bytes: jpg, mime: 'image/jpeg', saveAs: 'copy', name: outName(undefined, src.node.name, '', '.jpg'), parentId: body.parentId, op: 'heic', meta: { before: buf.length, after: jpg.length } });
      created.push(saved.id);
      results.push({ id, ok: true, itemId: saved.id, name: saved.name, before: buf.length, after: jpg.length });
    } catch (err) {
      results.push({ id, ok: false, error: errCode(err) });
      errors.push(err);
    }
  }
  singleFailure(unique, results, errors);
  res.status(created.length ? 201 : 200).json({ results, items: await itemsOf(req, created) });
});

/** HEIC photos are not accepted by the plain drive upload: the explorer offers to convert them here. */
const heicUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.drive.maxFileSize, files: 1, fields: 5, fieldSize: 1024 } });

pdfToolsRouter.post('/heic-upload', heavy, heicUpload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('FILE_REQUIRED');
  const ctx = ctxOf(req);
  const parent = await targetFolder(ctx, typeof req.body?.parentId === 'string' ? req.body.parentId : null);
  if (!isHeic(file.buffer)) throw badRequest('NOT_HEIC');
  const jpg = await heicToJpeg(file.buffer);
  const original = decodeOriginalName(file.originalname || 'Foto.heic');
  const c = await createFileIn(parent, outName(undefined, original, '', '.jpg'), jpg, 'image/jpeg', req.user!.id);
  await audit(req, 'DRIVE_PDF_HEIC', `drive:${c.id}`, { name: c.name, parentId: parent.id, original: original.slice(0, 200), before: file.size, after: jpg.length });
  await logDriveActivity({ nodeId: c.id, folderId: parent.id, actorId: req.user!.id, action: 'UPLOAD', name: c.name, meta: { via: 'pdf-tools', op: 'heic', kind: 'FILE' } });
  res.status(201).json({ item: (await itemsOf(req, [c.id]))[0] });
});

// ─── watermark ───────────────────────────────────────────────────────

pdfToolsRouter.post('/watermark', heavy, async (req, res) => {
  const body = parse(
    z.object({
      ids: z.array(idSchema).min(1).max(PDF_LIMITS.maxWatermarkBatch),
      text: z.string().trim().min(1).max(120),
      position: z.enum(['diagonal', 'footer', 'header']).default('diagonal'),
      opacity: z.number().min(0.05).max(1).default(0.2),
      size: z.number().min(6).max(200).default(60),
      color: z.string().regex(/^#?[0-9a-fA-F]{6}$/).default('#c0392b'),
      pages: z.string().max(2000).default('all'),
      saveAs: saveAsSchema.default('copy'),
    }),
    req.body,
  );
  const ctx = ctxOf(req);
  const results: BatchRow[] = [];
  const changed: string[] = [];
  const errors: unknown[] = [];
  const unique = [...new Set(body.ids)];
  for (const id of unique) {
    try {
      const src = await loadPdfFile(ctx, id, body.saveAs === 'version' ? 'EDIT' : 'DOWNLOAD');
      if (body.saveAs === 'version') await assertVersionable(req, ctx, src, src.version);
      const buf = await readBytes(id);
      const count = (await loadPdf(buf)).getPageCount();
      const pages = body.pages.trim().toLowerCase() === 'all' || !body.pages.trim() ? null : new Set(parseRanges(body.pages, count).flat());
      const bytes = await watermark(buf, { text: body.text, position: body.position, opacity: body.opacity, size: body.size, color: body.color, pages });
      const saved = await saveResult({ req, ctx, src, bytes, mime: PDF_MIME, saveAs: body.saveAs, baseVersion: src.version, name: outName(undefined, src.node.name, ` (${body.text.slice(0, 40)})`, '.pdf'), op: 'watermark', meta: { text: body.text, position: body.position } });
      changed.push(saved.id);
      results.push({ id, ok: true, itemId: saved.id, name: saved.name, savedAs: body.saveAs });
    } catch (err) {
      results.push({ id, ok: false, error: errCode(err) });
      errors.push(err);
    }
  }
  singleFailure(unique, results, errors);
  res.json({ results, items: await itemsOf(req, changed) });
});

// ─── redaction ───────────────────────────────────────────────────────

const redactUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PDF_LIMITS.maxRedactImageBytes, files: PDF_LIMITS.maxRedactPages, fields: 10, fieldSize: 64 * 1024 },
});
/** JSON (base64 images, small requests) or multipart (field "meta" + files "page_<index>"). */
const maybeMultipart = (req: Request, res: Response, next: NextFunction) => (req.is('multipart/form-data') ? redactUpload.any()(req, res, next) : next());

const redactSchema = z.object({
  nodeId: idSchema,
  baseVersion: z.number().int().min(1),
  pages: z.array(z.object({ index: pageIdx, imagePng: z.string().max(Math.ceil((PDF_LIMITS.maxRedactImageBytes * 4) / 3) + 100).optional() })).min(1).max(PDF_LIMITS.maxRedactPages),
  saveAs: saveAsSchema.default('copy'),
  name: nameSchema,
});

const decodeImage = (s: string) => {
  const b64 = s.replace(/^data:image\/(png|jpeg);base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length || buf.length > PDF_LIMITS.maxRedactImageBytes) throw new HttpError(413, 'IMAGE_TOO_LARGE');
  return buf;
};

pdfToolsRouter.post('/redact', heavy, maybeMultipart, async (req, res) => {
  const multipart = Array.isArray(req.files);
  let raw: unknown = req.body;
  if (multipart) {
    try {
      raw = JSON.parse(String(req.body?.meta ?? ''));
    } catch {
      throw badRequest('INVALID_META');
    }
  }
  const body = parse(redactSchema, raw);
  const files = multipart ? (req.files as Express.Multer.File[]) : [];
  const list = body.pages.map((p) => {
    if (multipart) {
      const f = files.find((x) => x.fieldname === `page_${p.index}`);
      if (!f) throw badRequest('PAGE_IMAGE_MISSING');
      return { index: p.index, image: f.buffer };
    }
    if (!p.imagePng) throw badRequest('PAGE_IMAGE_MISSING');
    return { index: p.index, image: decodeImage(p.imagePng) };
  });
  const ctx = ctxOf(req);
  const src = await loadPdfFile(ctx, body.nodeId, body.saveAs === 'version' ? 'EDIT' : 'DOWNLOAD');
  if (body.saveAs === 'version') await assertVersionable(req, ctx, src, body.baseVersion);
  else if (body.baseVersion !== src.version) throw new VersionConflictError(src.version);
  const bytes = await redactPages(await readBytes(src.node.id), list);
  const saved = await saveResult({
    req,
    ctx,
    src,
    bytes,
    mime: PDF_MIME,
    saveAs: body.saveAs,
    baseVersion: body.baseVersion,
    name: outName(body.name, src.node.name, ' (gizlədilmiş)', '.pdf'),
    op: 'redact',
    meta: { pages: list.map((p) => p.index + 1) },
  });
  res.status(saved.created ? 201 : 200).json({ item: (await itemsOf(req, [saved.id]))[0], version: saved.version, created: saved.created });
});

// ─── stamps & signatures ─────────────────────────────────────────────

const stampSchema = z.object({
  nodeId: idSchema,
  baseVersion: z.number().int().min(1),
  items: z
    .array(
      z.object({
        page: pageIdx,
        x: z.number().min(-10).max(20000),
        y: z.number().min(-10).max(20000),
        width: z.number().min(2).max(20000),
        height: z.number().min(2).max(20000),
        imageNodeId: idSchema,
        dateText: z.string().max(60).optional(),
      }),
    )
    .min(1)
    .max(PDF_LIMITS.maxStampItems),
  saveAs: saveAsSchema.default('version'),
  name: nameSchema,
});

pdfToolsRouter.post('/stamp', heavy, async (req, res) => {
  const body = parse(stampSchema, req.body);
  const ctx = ctxOf(req);
  const src = await loadPdfFile(ctx, body.nodeId, body.saveAs === 'version' ? 'EDIT' : 'DOWNLOAD');
  // Never on Final files — not even as a copy (a stamped copy of a signed contract would look official).
  if (src.final) throw finalError();
  if (body.saveAs === 'version') await assertVersionable(req, ctx, src, body.baseVersion);
  else if (body.baseVersion !== src.version) throw new VersionConflictError(src.version);
  const loadImage = async (id: string) => {
    const f = await loadFile(ctx, id, 'DOWNLOAD');
    if (f.kind === 'pdf' || !f.kind) throw badRequest('UNSUPPORTED_IMAGE');
    if (f.size > PDF_LIMITS.maxStampImageBytes) throw new HttpError(413, 'IMAGE_TOO_LARGE');
    return readBytes(id);
  };
  const bytes = await stamp(await readBytes(src.node.id), body.items, loadImage);
  const saved = await saveResult({
    req,
    ctx,
    src,
    bytes,
    mime: PDF_MIME,
    saveAs: body.saveAs,
    baseVersion: body.baseVersion,
    name: outName(body.name, src.node.name, ' (möhürlü)', '.pdf'),
    op: 'stamp',
    meta: { items: body.items.length, images: [...new Set(body.items.map((i) => i.imageNodeId))].slice(0, 20), pages: [...new Set(body.items.map((i) => i.page + 1))] },
  });
  res.status(saved.created ? 201 : 200).json({ item: (await itemsOf(req, [saved.id]))[0], version: saved.version, created: saved.created });
});

pdfToolsRouter.get('/stamps', async (req, res) => {
  const ctx = ctxOf(req);
  const folderId = await ensureStampsFolder();
  await ctx.load([folderId]);
  const level = ctx.level(folderId);
  if (!level) {
    res.json({ folderId: null, canAdd: false, items: [] });
    return;
  }
  const rows = await prisma.driveNode.findMany({ where: { parentId: folderId, kind: 'FILE', deletedAt: null }, select: itemSelect, orderBy: { name: 'asc' }, take: 200 });
  const items = (await buildItems(ctx, rows)).filter((i) => {
    const k = toolKind(i.name, i.mimeType);
    return k === 'png' || k === 'jpeg';
  });
  res.json({ folderId, canAdd: allows(level, 'EDIT'), items });
});

pdfToolsRouter.post('/stamps', heavy, async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1).max(120), imagePng: z.string().min(10).max(Math.ceil((PDF_LIMITS.maxStampLibraryBytes * 4) / 3) + 100) }), req.body);
  const ctx = ctxOf(req);
  const folder = await targetFolder(ctx, await ensureStampsFolder());
  const raw = Buffer.from(body.imagePng.replace(/^data:image\/png;base64,/, ''), 'base64');
  if (raw.length > PDF_LIMITS.maxStampLibraryBytes) throw new HttpError(413, 'IMAGE_TOO_LARGE');
  const meta = await sharp(raw).metadata().catch(() => null);
  if (!meta || meta.format !== 'png') throw badRequest('PNG_REQUIRED');
  // Trim fully transparent borders, cap the size (transparency stays).
  const png = await sharp(raw)
    .trim({ threshold: 1 })
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer()
    .catch(() => sharp(raw).png().toBuffer());
  const c = await createResult(req, folder, outName(body.name, 'Stempel', '', '.png'), png, 'image/png', 'stamp_library', {});
  res.status(201).json({ item: (await itemsOf(req, [c.id]))[0] });
});

// ─── errors ──────────────────────────────────────────────────────────

pdfToolsRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof VersionConflictError) {
    res.status(409).json({ error: 'VERSION_CONFLICT', currentVersion: err.currentVersion });
    return;
  }
  next(err);
});
