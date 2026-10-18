import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireMinRole } from '../middleware/auth.js';
import { HttpError, badRequest, limiter, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { DriveAccessCtx, requireNode, type NodeLite } from '../lib/drive/access.js';
import { allows } from '../lib/drive/levels.js';
import { buildItems, itemSelect } from '../lib/drive/items.js';
import { createFileIn, readNodeBuffer, saveFileVersion } from '../lib/drive/files.js';
import { LIMITS, docSchema, textToBlocks, type DocModel } from '../lib/docCreate/doc.js';
import { loadLetterhead } from '../lib/docCreate/letterhead.js';
import { readDocSource, renderDocPdf } from '../lib/docCreate/pdf.js';
import { DELIMITERS, parseText, rowsToXlsx } from '../lib/docCreate/table.js';
import { logDriveActivity } from '../lib/driveCollab/activity.js';
import { assertNotLockedByOther } from '../lib/driveCollab/lock.js';
import { PDF_MIME, XLSX_MIME, convertToPdf, convertToXlsx, mergeToPdf, sourceKind, tableToPdf, type Source } from '../lib/docCreate/convert.js';

/**
 * Making documents right in the team drive (/api/drive/create), same access rules as /api/drive:
 *
 *   POST /pdf               { parentId, name, title?, blocks, letterhead?, date? }  → new PDF from the editor
 *   GET  /pdf/:nodeId/source                                                  → the editor source of such a PDF
 *   PUT  /pdf/:nodeId       { title?, blocks, letterhead?, date?, baseVersion } → saves it as a new version
 *   GET  /letterhead                                                           → company letterhead (preview)
 *   POST /preview-text      { text, delimiter? }                               → detected table (preview)
 *   POST /from-text         { parentId, name, text, format: pdf|xlsx, delimiter? } → PDF or Excel from pasted text
 *   POST /convert           { ids, to: pdf|xlsx, merge?, parentId?, name? }   → images / PDFs / sheets converted
 *
 * Creating needs EDIT on the target folder; reading sources needs DOWNLOAD on them (like copying).
 */
export const driveCreateRouter = Router();
driveCreateRouter.use(requireMinRole('STAFF'));

const heavy = limiter({ windowMs: 60 * 1000, limit: 40, skip: () => config.isTest });

const ctxOf = (req: Request) => new DriveAccessCtx({ id: req.user!.id, role: req.user!.role });
const idSchema = z.string().min(1).max(120);

const loadItem = async (req: Request, id: string) => {
  const row = await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: itemSelect });
  const [item] = await buildItems(ctxOf(req), [row]);
  return item ?? null;
};

/** The target folder (EDIT). */
const targetFolder = async (ctx: DriveAccessCtx, id: string): Promise<NodeLite> => {
  const { node } = await requireNode(ctx, id, 'EDIT');
  if (node.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
  return node;
};

const assertSize = (buf: Buffer) => {
  if (buf.length > config.drive.maxFileSize) throw new HttpError(413, 'FILE_TOO_LARGE');
};

/** "Brief" → "Brief.pdf"; an existing ".pdf" stays. */
const withExt = (raw: string, ext: string, fallback: string) => {
  const n = raw.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '') || fallback;
  const base = n.toLowerCase().endsWith(ext) ? n.slice(0, -ext.length).trim() || fallback : n;
  return `${base.slice(0, 180)}${ext}`;
};

const baseOf = (name: string) => name.replace(/\.[^.]+$/, '') || name;

// ─── Documents from the editor ───────────────────────────────────────

const docBody = docSchema.extend({ title: z.string().trim().max(300).optional() });

const render = async (doc: DocModel) => {
  const buf = await renderDocPdf(doc, { letterhead: doc.letterhead ? await loadLetterhead() : null });
  assertSize(buf);
  return buf;
};

driveCreateRouter.get('/letterhead', async (_req, res) => {
  res.json({ letterhead: await loadLetterhead() });
});

driveCreateRouter.post('/pdf', heavy, async (req, res) => {
  const body = parse(docBody.extend({ parentId: idSchema, name: z.string().max(300) }), req.body);
  const ctx = ctxOf(req);
  const parent = await targetFolder(ctx, body.parentId);
  const name = withExt(body.name, '.pdf', 'Dokument');
  const doc: DocModel = { title: body.title ?? '', letterhead: body.letterhead, date: body.date ?? null, blocks: body.blocks };
  const buf = await render(doc);
  const created = await createFileIn(parent, name, buf, PDF_MIME, req.user!.id);
  await audit(req, 'DRIVE_DOC_CREATED', `drive:${created.id}`, { name: created.name, parentId: parent.id, size: buf.length, blocks: doc.blocks.length });
  await logDriveActivity({ nodeId: created.id, folderId: parent.id, actorId: req.user!.id, action: 'CREATE', name: created.name, meta: { via: 'doc-editor', kind: 'FILE' } });
  res.status(201).json({ item: await loadItem(req, created.id) });
});

const loadPdfNode = async (req: Request, need: 'VIEW' | 'EDIT') => {
  const ctx = ctxOf(req);
  const id = String(req.params.nodeId ?? '');
  if (!id || id.length > 120) throw notFound('NODE_NOT_FOUND');
  const { node, level } = await requireNode(ctx, id, need);
  if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
  const meta = await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: { mimeType: true } });
  if (meta.mimeType !== PDF_MIME && !/\.pdf$/i.test(node.name)) throw badRequest('NOT_A_PDF');
  return { node, level };
};

driveCreateRouter.get('/pdf/:nodeId/source', async (req, res) => {
  const { node, level } = await loadPdfNode(req, 'VIEW');
  const { row, buf } = await readNodeBuffer(node.id, config.drive.maxFileSize);
  const doc = await readDocSource(buf);
  if (!doc) throw notFound('NO_SOURCE');
  res.json({ id: row.id, name: row.name, version: row.version, parentId: row.parentId, canEdit: allows(level, 'EDIT'), doc });
});

driveCreateRouter.put('/pdf/:nodeId', heavy, async (req, res) => {
  const { node } = await loadPdfNode(req, 'EDIT');
  await assertNotLockedByOther(node.id, req.user!.id);
  const body = parse(docBody.extend({ baseVersion: z.number().int().min(1) }), req.body);
  const doc: DocModel = { title: body.title ?? '', letterhead: body.letterhead, date: body.date ?? null, blocks: body.blocks };
  const buf = await render(doc);
  let saved: { version: number; size: number };
  try {
    saved = await saveFileVersion(node.id, buf, PDF_MIME, body.baseVersion);
  } catch (err) {
    if (err instanceof HttpError && err.code === 'VERSION_CONFLICT') {
      const cur = await prisma.driveNode.findUnique({ where: { id: node.id }, select: { version: true } });
      res.status(409).json({ error: 'VERSION_CONFLICT', currentVersion: cur?.version ?? null });
      return;
    }
    throw err;
  }
  // Same action as a replace-upload, so the version history names who saved each version.
  await audit(req, 'DRIVE_FILE_VERSION_ADDED', `drive:${node.id}`, { name: node.name, version: saved.version, size: saved.size, source: 'doc-editor' });
  await logDriveActivity({ nodeId: node.id, folderId: node.parentId, actorId: req.user!.id, action: 'NEW_VERSION', name: node.name, meta: { version: saved.version, size: saved.size, source: 'doc-editor', kind: 'FILE' } });
  res.json({ item: await loadItem(req, node.id), version: saved.version });
});

// ─── Text → PDF / Excel ──────────────────────────────────────────────

const delimiter = z.enum(['auto', ...DELIMITERS] as [string, ...string[]]).optional();
const textField = z.string().max(LIMITS.textChars);

driveCreateRouter.post('/preview-text', async (req, res) => {
  const body = parse(z.object({ text: textField, delimiter }), req.body);
  const p = parseText(body.text, body.delimiter as Parameters<typeof parseText>[1]);
  res.json({ delimiter: p.delimiter, columns: p.columns, totalRows: p.rows.length, rows: p.rows.slice(0, 30).map((r) => r.map((c) => c.slice(0, 200))) });
});

driveCreateRouter.post('/from-text', heavy, async (req, res) => {
  const body = parse(
    z.object({ parentId: idSchema, name: z.string().max(300), text: textField.refine((t) => t.trim().length > 0, 'EMPTY'), format: z.enum(['pdf', 'xlsx']), delimiter }),
    req.body,
  );
  const ctx = ctxOf(req);
  const parent = await targetFolder(ctx, body.parentId);
  const parsed = parseText(body.text, body.delimiter as Parameters<typeof parseText>[1]);
  const isTable = parsed.delimiter !== 'none' && parsed.columns >= 2;
  let buf: Buffer;
  let name: string;
  let mime: string;
  if (body.format === 'xlsx') {
    name = withExt(body.name, '.xlsx', 'Tabelle');
    buf = await rowsToXlsx(parsed.rows, baseOf(name));
    mime = XLSX_MIME;
  } else {
    name = withExt(body.name, '.pdf', 'Dokument');
    buf = isTable
      ? await tableToPdf(baseOf(name), parsed.rows.slice(0, 5000).map((r) => r.slice(0, 30)))
      : await renderDocPdf({ title: baseOf(name), letterhead: false, date: null, blocks: textToBlocks(body.text) });
    mime = PDF_MIME;
  }
  assertSize(buf);
  const created = await createFileIn(parent, name, buf, mime, req.user!.id);
  await audit(req, 'DRIVE_FILE_FROM_TEXT', `drive:${created.id}`, { name: created.name, parentId: parent.id, format: body.format, table: isTable, rows: parsed.rows.length, size: buf.length });
  await logDriveActivity({ nodeId: created.id, folderId: parent.id, actorId: req.user!.id, action: 'CREATE', name: created.name, meta: { via: 'text', format: body.format, kind: 'FILE' } });
  res.status(201).json({ item: await loadItem(req, created.id), table: isTable, delimiter: parsed.delimiter });
});

// ─── Conversions ─────────────────────────────────────────────────────

const MAX_SOURCES = 50;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

type ConvertResult = { id: string; ok: boolean; error?: string; itemId?: string; name?: string };

driveCreateRouter.post('/convert', heavy, async (req, res) => {
  const body = parse(
    z.object({ ids: z.array(idSchema).min(1).max(MAX_SOURCES), to: z.enum(['pdf', 'xlsx']), merge: z.boolean().optional(), parentId: idSchema.optional(), name: z.string().max(300).optional() }),
    req.body,
  );
  const ctx = ctxOf(req);
  const ids = [...new Set(body.ids)];
  // Sources: DOWNLOAD (their content ends up in a new file), files only, of a convertible type.
  const metas: { id: string; name: string; parentId: string | null; kind: Source['kind'] | null; size: number }[] = [];
  for (const id of ids) {
    const { node } = await requireNode(ctx, id, 'DOWNLOAD');
    if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
    const row = await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: { mimeType: true, size: true } });
    if ((row.size ?? 0) > config.drive.maxFileSize) throw new HttpError(413, 'FILE_TOO_LARGE');
    metas.push({ id, name: node.name, parentId: node.parentId, kind: sourceKind(node.name, row.mimeType), size: row.size ?? 0 });
  }
  if (metas.reduce((a, m) => a + m.size, 0) > MAX_TOTAL_BYTES) throw new HttpError(413, 'FILE_TOO_LARGE');
  const targetId = body.parentId ?? metas[0].parentId;
  if (!targetId) throw badRequest('NOT_A_FOLDER');
  const target = await targetFolder(ctx, targetId);

  const readSource = async (m: (typeof metas)[number]): Promise<Source> => {
    if (!m.kind) throw badRequest('UNSUPPORTED_CONVERSION');
    const { buf } = await readNodeBuffer(m.id, config.drive.maxFileSize);
    return { name: m.name, kind: m.kind, bytes: buf };
  };
  const created: { id: string; name: string }[] = [];
  const save = async (name: string, buf: Buffer, mime: string) => {
    assertSize(buf);
    const c = await createFileIn(target, name, buf, mime, req.user!.id);
    created.push(c);
    return c;
  };

  const results: ConvertResult[] = [];
  if (body.to === 'pdf' && body.merge && metas.length > 1) {
    const bad = metas.find((m) => !m.kind);
    if (bad) throw badRequest('UNSUPPORTED_CONVERSION');
    const sources: Source[] = [];
    for (const m of metas) sources.push(await readSource(m));
    const name = withExt(body.name ?? `${baseOf(metas[0].name)} (zusammengeführt)`, '.pdf', 'Dokument');
    const c = await save(name, await mergeToPdf(sources, baseOf(name)), PDF_MIME);
    for (const m of metas) results.push({ id: m.id, ok: true, itemId: c.id, name: c.name });
  } else {
    for (const m of metas) {
      try {
        const src = await readSource(m);
        const c =
          body.to === 'pdf'
            ? await save(withExt(baseOf(m.name), '.pdf', 'Dokument'), await convertToPdf(src), PDF_MIME)
            : await save(withExt(baseOf(m.name), '.xlsx', 'Tabelle'), await convertToXlsx(src), XLSX_MIME);
        results.push({ id: m.id, ok: true, itemId: c.id, name: c.name });
      } catch (err) {
        if (err instanceof HttpError) results.push({ id: m.id, ok: false, error: err.code });
        else throw err;
      }
    }
  }
  for (const c of created) {
    await audit(req, 'DRIVE_FILE_CONVERTED', `drive:${c.id}`, { name: c.name, to: body.to, merge: !!body.merge, sources: ids.slice(0, 50), parentId: target.id });
    await logDriveActivity({ nodeId: c.id, folderId: target.id, actorId: req.user!.id, action: 'CONVERT', name: c.name, meta: { to: body.to, merge: !!body.merge, sources: ids.length, kind: 'FILE' } });
  }
  const rows = created.length ? await prisma.driveNode.findMany({ where: { id: { in: created.map((c) => c.id) } }, select: itemSelect }) : [];
  res.status(created.length ? 201 : 200).json({ results, items: await buildItems(ctxOf(req), rows) });
});
