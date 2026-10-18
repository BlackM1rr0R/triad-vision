import express, { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireMinRole } from '../middleware/auth.js';
import { HttpError, badRequest, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { DriveAccessCtx, requireNode } from '../lib/drive/access.js';
import { allows } from '../lib/drive/levels.js';
import { breadcrumb } from '../lib/drive/items.js';
import { checkName, freeNameIn } from '../lib/drive/names.js';
import { removeStored } from '../lib/drive/storage.js';
import { readCurrent, saveNewVersion, storeBuffer } from '../lib/sheets/store.js';
import { LIMITS, XLSX_MIME, applySheets, emptyWorkbook, loadWorkbook, savePayloadSchema, workbookJson } from '../lib/sheets/workbook.js';

/**
 * Spreadsheet editor for .xlsx files of the team drive (/api/drive/sheets).
 *
 *   GET  /:nodeId   workbook as JSON (VIEW)
 *   PUT  /:nodeId   { baseVersion, sheets, force? } → new version of the same drive file (EDIT)
 *   POST /          { parentId, name } → new empty .xlsx in a folder (EDIT on the folder)
 *
 * Access is the drive's own (lib/drive/access.ts); staff only, with the staff 2FA gate.
 * Large saves are sent as application/vnd.triad.sheet+json so they are not cut by the global 3 MB JSON limit.
 */
export const sheetsRouter = Router();
sheetsRouter.use(requireMinRole('STAFF'));
sheetsRouter.use(express.json({ type: 'application/vnd.triad.sheet+json', limit: '20mb' }));

const ctxOf = (req: Request) => new DriveAccessCtx({ id: req.user!.id, role: req.user!.role });

const nodeIdOf = (req: Request) => {
  const id = String(req.params.nodeId ?? '');
  // Virtual nodes of the Cases area (case:…, doc:…) are read-only case documents, never spreadsheets here.
  if (!id || id.length > 120 || id.includes(':')) throw notFound('NODE_NOT_FOUND');
  return id;
};

const isXlsx = (name: string, mime: string | null) => mime === XLSX_MIME || /\.xlsx$/i.test(name);

const loadSheetNode = async (req: Request, need: 'VIEW' | 'EDIT') => {
  const ctx = ctxOf(req);
  const id = nodeIdOf(req);
  const { node, level } = await requireNode(ctx, id, need);
  if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
  if (node.space === 'CASES') throw badRequest('READ_ONLY');
  const meta = await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: { mimeType: true } });
  if (!isXlsx(node.name, meta.mimeType)) throw badRequest('NOT_A_SPREADSHEET');
  return { ctx, node, level };
};

sheetsRouter.get('/:nodeId', async (req, res) => {
  const { ctx, node, level } = await loadSheetNode(req, 'VIEW');
  const { row, buf } = await readCurrent(node.id);
  const wb = await loadWorkbook(buf);
  const sheets = workbookJson(wb);
  res.json({
    id: row.id,
    name: row.name,
    version: row.version,
    size: row.size,
    parentId: row.parentId,
    myAccess: level,
    canEdit: allows(level, 'EDIT'),
    canDownload: allows(level, 'DOWNLOAD'),
    ...breadcrumb(ctx, node.id),
    limits: { cellsPerSheet: LIMITS.cellsPerSheet, fileBytes: LIMITS.fileBytes, sheets: LIMITS.sheets },
    sheets,
  });
});

sheetsRouter.put('/:nodeId', async (req, res) => {
  const { node } = await loadSheetNode(req, 'EDIT');
  const body = parse(savePayloadSchema, req.body);
  const { row, buf } = await readCurrent(node.id);
  if (!body.force && row.version !== body.baseVersion) {
    res.status(409).json({ error: 'VERSION_CONFLICT', currentVersion: row.version });
    return;
  }
  const out = await applySheets(buf, body.sheets);
  let saved: { version: number; size: number };
  try {
    saved = await saveNewVersion(node.id, out, XLSX_MIME, { baseVersion: row.version, force: body.force });
  } catch (err) {
    if (err instanceof HttpError && err.code === 'VERSION_CONFLICT') {
      res.status(409).json({ error: 'VERSION_CONFLICT', currentVersion: (err as HttpError & { currentVersion?: number }).currentVersion });
      return;
    }
    throw err;
  }
  const cells = body.sheets.reduce((n, s) => n + Object.values(s.rows).reduce((m, r) => m + Object.keys(r).length, 0), 0);
  // Same action as a replace-upload, so the drive's version history names who saved each version.
  await audit(req, 'DRIVE_FILE_VERSION_ADDED', `drive:${node.id}`, {
    name: node.name,
    version: saved.version,
    size: saved.size,
    source: 'sheet-editor',
    sheets: body.sheets.length,
    cells,
    forced: !!body.force && body.baseVersion !== row.version,
  });
  res.json({ id: node.id, version: saved.version, size: saved.size });
});

sheetsRouter.post('/', async (req, res) => {
  const body = parse(z.object({ parentId: z.string().min(1).max(120), name: z.string().max(200).optional() }), req.body ?? {});
  if (body.parentId.includes(':')) throw badRequest('READ_ONLY');
  const ctx = ctxOf(req);
  const { node: parent } = await requireNode(ctx, body.parentId, 'EDIT');
  if (parent.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
  if (parent.space === 'CASES') throw badRequest('READ_ONLY');
  let name = (body.name ?? '').trim() || 'Tabelle';
  if (!/\.xlsx$/i.test(name)) name = `${name}.xlsx`;
  name = await freeNameIn(parent.id, checkName(name, 'FILE'), true);
  const buf = await emptyWorkbook();
  const key = await storeBuffer(buf);
  try {
    const created = await prisma.driveNode.create({
      data: {
        space: parent.space,
        ownerId: parent.ownerId,
        kind: 'FILE',
        name,
        parentId: parent.id,
        storageKey: key,
        mimeType: XLSX_MIME,
        size: buf.length,
        createdById: req.user!.id,
      },
      select: { id: true, name: true, version: true },
    });
    await audit(req, 'DRIVE_FILE_UPLOADED', `drive:${created.id}`, { name, size: buf.length, parentId: parent.id, source: 'sheet-editor' });
    res.status(201).json(created);
  } catch (err) {
    await removeStored([key]).catch(() => undefined);
    throw err;
  }
});
