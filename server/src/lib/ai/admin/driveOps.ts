import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../db.js';
import { config } from '../../../config.js';
import { HttpError, badRequest, conflict, notFound } from '../../http.js';
import { audit } from '../../audit.js';
import { notifyUser } from '../../notifications.js';
import { allows } from '../../drive/levels.js';
import { DriveAccessCtx, nodeLiteSelect, requireNode, type NodeLite } from '../../drive/access.js';
import { collectSubtree } from '../../drive/items.js';
import { checkName, findSibling, freeNameIn, pickFreeName, siblingNames } from '../../drive/names.js';
import { copyIntoStore, removeStored, storagePath } from '../../drive/storage.js';
import { restoreSubtree, softDelete } from '../../drive/trash.js';
import { createFileIn, readNodeBuffer } from '../../drive/files.js';
import { ensureCaseFolder } from '../../drive/caseFolders.js';
import { STAGE_FOLDER } from '../../drive/cases.js';
import { logDriveActivity } from '../../driveCollab/activity.js';
import { assertNotLockedByOther } from '../../driveCollab/lock.js';
import { assertNoFinalInside } from '../../drive/org/final.js';
import { publishDrive } from '../../driveCollab/realtime.js';
import { MAX_LINK_DAYS, maxExpiry, newShareToken, sha256, shareUrl } from '../../driveCollab/share.js';
import { collabTexts } from '../../driveCollab/texts.js';
import { mentionedIds, plainText } from '../../tasks/core.js';
import { textToBlocks, type Block } from '../../docCreate/doc.js';
import { loadLetterhead } from '../../docCreate/letterhead.js';
import { renderDocPdf } from '../../docCreate/pdf.js';
import { parseText, rowsToXlsx, type Delimiter } from '../../docCreate/table.js';
import { PDF_MIME, XLSX_MIME, convertToPdf, convertToXlsx, mergeToPdf, sourceKind, tableToPdf, type Source } from '../../docCreate/convert.js';
import { caseValues, fillDocx, fillPdfForm, inspectTemplate, templateFormat, type TemplateFormat } from '../../driveIntel/template.js';
import { rememberDriveEsign } from '../../driveIntel/signedCopy.js';
import { DEFAULT_EXPIRY_DAYS, MAX_PDF_BYTES, createRequest, sendRequest, type Actor } from '../../esign/service.js';
import type { AiToolContext } from '../types.js';
import { actorReq, driveCtx } from './common.js';
import { foldName } from './paths.js';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Drive actions for the assistant, done exactly like the drive's own routes (routes/drive.ts,
 * driveCreate.ts, driveCollab.ts, driveIntel.ts): same permission engine, system-node protection, lock
 * checks, name handling, audit entries and activity journal rows. Those routes keep their logic inline,
 * so the few steps are repeated here on top of the same lib/drive* helpers.
 */

const via = { via: 'ai' } as const;

/** System nodes: only super admins may rename / move / delete them; the shared root never. */
const assertNotProtected = (ctx: DriveAccessCtx, n: NodeLite) => {
  if (!n.parentId) throw badRequest('SYSTEM_NODE');
  if (n.system && !ctx.isSuper) throw badRequest('SYSTEM_NODE');
};

export const targetFolder = async (ctx: DriveAccessCtx, id: string): Promise<NodeLite> => {
  const { node } = await requireNode(ctx, id, 'EDIT');
  if (node.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
  return node;
};

const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i <= 0 ? '' : name.slice(i).toLowerCase();
};

/** "Brief" → "Brief.pdf" (same cleaning as routes/driveCreate.ts). */
export const withExt = (raw: string, ext: string, fallback: string) => {
  // eslint-disable-next-line no-control-regex
  const n = raw.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '') || fallback;
  const base = n.toLowerCase().endsWith(ext) ? n.slice(0, -ext.length).trim() || fallback : n;
  return `${base.slice(0, 180)}${ext}`;
};
const baseOf = (name: string) => name.replace(/\.[^.]+$/, '') || name;

const assertSize = (buf: Buffer) => {
  if (buf.length > config.drive.maxFileSize) throw new HttpError(413, 'FILE_TOO_LARGE');
};

// ─── Folders, rename, move, copy, trash, restore ─────────────────────

export const createFolder = async (ai: AiToolContext, parentId: string, rawName: string) => {
  const ctx = driveCtx(ai);
  const parent = await targetFolder(ctx, parentId);
  const name = checkName(rawName.trim(), 'FOLDER');
  if (ctx.chain(parentId).length >= 40) throw badRequest('TOO_DEEP');
  const existing = await findSibling(parentId, name);
  if (existing) {
    if (existing.kind === 'FOLDER') return { id: existing.id, name: existing.name, created: false };
    throw conflict('NAME_EXISTS');
  }
  const created = await prisma.driveNode.create({
    data: { space: parent.space, ownerId: parent.ownerId, kind: 'FOLDER', name, parentId, createdById: ai.user.id },
    select: { id: true },
  });
  await logDriveActivity({ nodeId: created.id, folderId: parentId, actorId: ai.user.id, action: 'CREATE_FOLDER', name, meta: { kind: 'FOLDER', ...via } });
  return { id: created.id, name, created: true };
};

export const renameNode = async (ai: AiToolContext, id: string, rawName: string) => {
  const ctx = driveCtx(ai);
  const { node } = await requireNode(ctx, id, 'EDIT');
  const name = checkName(rawName.trim(), node.kind === 'FILE' ? 'FILE' : 'FOLDER');
  if (name === node.name) return { id, name, renamed: false };
  assertNotProtected(ctx, node);
  if (node.kind === 'FILE' && extOf(name) !== extOf(node.name)) throw badRequest('EXTENSION_CHANGE_NOT_ALLOWED');
  if (node.parentId && (await findSibling(node.parentId, name, id))) throw conflict('NAME_EXISTS');
  await assertNotLockedByOther(id, ai.user.id);
  await prisma.driveNode.update({ where: { id }, data: { name } });
  await audit(actorReq(ai), 'DRIVE_RENAMED', `drive:${id}`, { from: node.name, to: name, ...via });
  await logDriveActivity({ nodeId: id, folderId: node.parentId, actorId: ai.user.id, action: 'RENAME', name, meta: { from: node.name, to: name, kind: node.kind, ...via } });
  return { id, name, from: node.name, renamed: true };
};

/** Moves one node into the target (routes/drive.ts `mover`). */
const mover = async (ai: AiToolContext, ctx: DriveAccessCtx, targetId: string) => {
  const target = await targetFolder(ctx, targetId);
  const taken = await siblingNames(targetId);
  const targetChain = new Set(ctx.chain(targetId).map((n) => n.id));
  return async (id: string) => {
    const { node } = await requireNode(ctx, id, 'EDIT');
    assertNotProtected(ctx, node);
    if (targetChain.has(id)) throw badRequest('INTO_ITSELF');
    if (node.parentId === targetId) return { name: node.name, moved: false };
    await assertNotLockedByOther(id, ai.user.id);
    if (node.kind === 'FOLDER') await assertNoFinalInside(id);
    const name = pickFreeName(taken, node.name, node.kind === 'FILE');
    await prisma.driveNode.update({ where: { id }, data: { parentId: targetId, name } });
    await logDriveActivity({
      nodeId: id,
      folderId: targetId,
      actorId: ai.user.id,
      action: 'MOVE',
      name,
      meta: { fromId: node.parentId, fromName: node.parentId ? (ctx.nodes.get(node.parentId)?.name ?? null) : null, toId: targetId, toName: target.name, kind: node.kind, ...(name !== node.name ? { oldName: node.name } : {}), ...via },
    });
    if (node.space !== target.space || node.ownerId !== target.ownerId) {
      const sub = await collectSubtree([id], { id: true }, { includeDeleted: true });
      await prisma.driveNode.updateMany({ where: { id: { in: sub.map((s) => s.id) } }, data: { space: target.space, ownerId: target.ownerId } });
    }
    await audit(actorReq(ai), 'DRIVE_MOVED', `drive:${id}`, { name, from: node.parentId, to: targetId, ...via });
    return { name, moved: true };
  };
};

type BatchRow = { id: string; ok: boolean; error?: string; name?: string };
const batch = async (ids: string[], fn: (id: string) => Promise<Partial<BatchRow> | void>) => {
  const results: BatchRow[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      results.push({ id, ok: true, ...((await fn(id)) ?? {}) });
    } catch (err) {
      if (err instanceof HttpError) results.push({ id, ok: false, error: err.code });
      else throw err;
    }
  }
  return results;
};
const counts = (r: BatchRow[]) => ({ ok: r.filter((x) => x.ok).length, failed: r.filter((x) => !x.ok).length });

export const moveNodes = async (ai: AiToolContext, ids: string[], targetId: string) => {
  const ctx = driveCtx(ai);
  const moveOne = await mover(ai, ctx, targetId);
  const results = await batch(ids, async (id) => ({ name: (await moveOne(id)).name }));
  const c = counts(results);
  if (ids.length > 1) await audit(actorReq(ai), 'DRIVE_BULK_MOVED', `drive:${targetId}`, { requested: results.length, moved: c.ok, failed: c.failed, ids: ids.slice(0, 50), ...via });
  return { results, ...c };
};

const copySelect = { ...nodeLiteSelect, storageKey: true, mimeType: true, size: true } satisfies Prisma.DriveNodeSelect;

/** Copies nodes into a folder (routes/drive.ts POST /copy). */
export const copyNodes = async (ai: AiToolContext, ids: string[], targetId: string) => {
  const ctx = driveCtx(ai);
  const target = await targetFolder(ctx, targetId);
  const taken = await siblingNames(targetId);
  const targetChain = new Set(ctx.chain(targetId).map((n) => n.id));
  const base = { space: target.space, ownerId: target.ownerId, createdById: ai.user.id };
  const copyFile = async (parentId: string, name: string, src: string, mimeType: string, size: number) => {
    const key = await copyIntoStore(src);
    try {
      return (await prisma.driveNode.create({ data: { ...base, kind: 'FILE', name, parentId, storageKey: key, mimeType, size }, select: { id: true } })).id;
    } catch (err) {
      await removeStored([key]);
      throw err;
    }
  };
  const newFolder = async (parentId: string, name: string) => (await prisma.driveNode.create({ data: { ...base, kind: 'FOLDER', name, parentId }, select: { id: true } })).id;
  const results = await batch(ids, async (id) => {
    const { node, level } = await requireNode(ctx, id, 'VIEW');
    if (!allows(level, node.kind === 'FILE' ? 'DOWNLOAD' : 'EXPORT')) throw new HttpError(403, 'INSUFFICIENT_ACCESS');
    if (node.kind === 'FOLDER' && targetChain.has(id)) throw badRequest('INTO_ITSELF');
    const sub = await collectSubtree([id], copySelect, { limit: 5000 });
    ctx.add(sub as NodeLite[]);
    const newIds = new Map<string, string>();
    let rootCopy: string | null = null;
    let rootName = node.name;
    for (const n of sub) {
      const isRoot = n.id === id;
      const parentNew = isRoot ? targetId : newIds.get(n.parentId!);
      if (!parentNew) continue;
      const name = isRoot ? pickFreeName(taken, n.name, n.kind === 'FILE') : n.name;
      if (isRoot) rootName = name;
      if (n.kind === 'FOLDER') {
        if (!allows(ctx.level(n.id), 'VIEW')) continue;
        const nid = await newFolder(parentNew, name);
        newIds.set(n.id, nid);
        if (isRoot) rootCopy = nid;
      } else if (allows(ctx.level(n.id), 'DOWNLOAD') && n.storageKey) {
        const nid = await copyFile(parentNew, name, storagePath(n.storageKey), n.mimeType ?? 'application/octet-stream', n.size ?? 0).catch((err) => {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
          return null;
        });
        if (isRoot) rootCopy = nid;
      }
    }
    await audit(actorReq(ai), 'DRIVE_COPIED', `drive:${id}`, { name: node.name, to: targetId, nodes: sub.length, ...via });
    await logDriveActivity({ nodeId: rootCopy, folderId: targetId, actorId: ai.user.id, action: 'COPY', name: node.name, meta: { sourceId: id, fromId: node.parentId, toId: targetId, toName: target.name, kind: node.kind, ...via } });
    return { name: rootName, copyId: rootCopy ?? undefined } as Partial<BatchRow>;
  });
  return { results, ...counts(results) };
};

/** Moves nodes to the recycle bin (routes/drive.ts trashOne + bulk/delete). */
export const trashNodes = async (ai: AiToolContext, ids: string[]) => {
  const ctx = driveCtx(ai);
  const at = new Date();
  let nodes = 0;
  const results = await batch(ids, async (id) => {
    const { node } = await requireNode(ctx, id, 'EDIT', { allowDeleted: true });
    if (node.deletedAt) return { name: node.name };
    assertNotProtected(ctx, node);
    await assertNotLockedByOther(id, ai.user.id);
    if (node.kind === 'FOLDER') await assertNoFinalInside(id);
    const n = await softDelete(id, ai.user.id, at);
    nodes += n;
    if (n) {
      await logDriveActivity({ nodeId: id, folderId: node.parentId, actorId: ai.user.id, action: 'DELETE', name: node.name, meta: { kind: node.kind, nodes: n, ...via } });
      await audit(actorReq(ai), 'DRIVE_TRASHED', `drive:${id}`, { name: node.name, kind: node.kind, nodes: n, ...via });
    }
    return { name: node.name };
  });
  const c = counts(results);
  if (ids.length > 1) await audit(actorReq(ai), 'DRIVE_BULK_TRASHED', undefined, { requested: results.length, deleted: c.ok, failed: c.failed, nodes, ids: ids.slice(0, 50), ...via });
  return { results, ...c, nodes };
};

/** Restores trash roots (routes/drive.ts POST /restore). */
export const restoreNodes = async (ai: AiToolContext, ids: string[]) => {
  const ctx = driveCtx(ai);
  const results = await batch(ids, async (id) => {
    const { node } = await requireNode(ctx, id, 'EDIT', { allowDeleted: true });
    if (!node.deletedAt) throw badRequest('NOT_IN_TRASH');
    const parent = node.parentId ? ctx.nodes.get(node.parentId) : undefined;
    if (parent?.deletedAt) throw conflict(parent.deletedAt.getTime() === node.deletedAt.getTime() ? 'NOT_A_TRASH_ROOT' : 'PARENT_IN_TRASH');
    let name = node.name;
    if (node.parentId && (await findSibling(node.parentId, node.name, id))) {
      name = await freeNameIn(node.parentId, node.name, node.kind === 'FILE');
      await prisma.driveNode.update({ where: { id }, data: { name } });
    }
    const count = await restoreSubtree(id, node.deletedAt);
    await audit(actorReq(ai), 'DRIVE_RESTORED', `drive:${id}`, { name, nodes: count, ...via });
    await logDriveActivity({ nodeId: id, folderId: node.parentId, actorId: ai.user.id, action: 'RESTORE', name, meta: { kind: node.kind, nodes: count, ...via } });
    return { name };
  });
  return { results, ...counts(results) };
};

// ─── New documents ───────────────────────────────────────────────────

const created = async (ai: AiToolContext, parent: NodeLite, name: string, buf: Buffer, mime: string, auditAction: string, meta: Record<string, unknown>) => {
  assertSize(buf);
  const c = await createFileIn(parent, name, buf, mime, ai.user.id);
  await audit(actorReq(ai), auditAction, `drive:${c.id}`, { name: c.name, parentId: parent.id, size: buf.length, ...meta, ...via });
  await logDriveActivity({ nodeId: c.id, folderId: parent.id, actorId: ai.user.id, action: auditAction === 'DRIVE_FILE_CONVERTED' ? 'CONVERT' : 'CREATE', name: c.name, meta: { kind: 'FILE', ...meta, ...via } });
  return { id: c.id, name: c.name, parentId: parent.id, size: buf.length };
};

/** A PDF from a title and markdown-ish text ("# ", "- ", "1. ", blank-line paragraphs, "| a | b |" tables). */
export const createPdf = async (ai: AiToolContext, a: { parentId: string; name: string; title?: string; text: string; letterhead?: boolean; date?: string | null }) => {
  const parent = await targetFolder(driveCtx(ai), a.parentId);
  const blocks = markdownBlocks(a.text);
  const buf = await renderDocPdf({ title: a.title ?? '', letterhead: !!a.letterhead, date: a.date ?? null, blocks }, { letterhead: a.letterhead ? await loadLetterhead() : null });
  return created(ai, parent, withExt(a.name, '.pdf', 'Dokument'), buf, PDF_MIME, 'DRIVE_DOC_CREATED', { blocks: blocks.length, source: 'ai' });
};

/**
 * Markdown-ish text → document blocks: the editor's own textToBlocks, plus pipe tables ("| a | b |"
 * lines, a "|---|" separator marks the header), "---" rules and **bold** runs.
 */
export const markdownBlocks = (text: string): Block[] => {
  const out: Block[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) out.push(...textToBlocks(buf.join('\n')).map(boldRuns));
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      const rows: string[][] = [];
      let header = false;
      for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) {
        const cells = lines[i].trim().slice(1, -1).split('|').map((c) => c.trim());
        if (cells.every((c) => /^:?-{2,}:?$/.test(c))) {
          header = rows.length === 1;
          continue;
        }
        rows.push(cells.slice(0, 20).map((c) => c.replace(/\*\*/g, '').slice(0, 4000)));
      }
      i--;
      if (rows.length) out.push({ type: 'table', header, rows: rows.slice(0, 2000) });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      out.push({ type: 'hr' });
      continue;
    }
    buf.push(line);
  }
  flush();
  return out.slice(0, 3000);
};

/** "**bold** text" inside a text block → runs with b: true. */
const boldRuns = (b: Block): Block => {
  if (!('runs' in b)) return b;
  const runs = b.runs.flatMap((r) => r.t.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((t) => (t.startsWith('**') && t.endsWith('**') && t.length > 4 ? { t: t.slice(2, -2), b: true } : { t })));
  return { ...b, runs: runs.length ? runs : b.runs };
};

/** Table text (TSV / CSV / pipes) or rows → .xlsx (or a table PDF). */
export const textToFile = async (ai: AiToolContext, a: { parentId: string; name: string; text?: string; rows?: string[][]; format: 'xlsx' | 'pdf'; delimiter?: Delimiter | 'auto' }) => {
  const parent = await targetFolder(driveCtx(ai), a.parentId);
  let rows: string[][];
  let isTable = true;
  if (a.rows?.length) rows = a.rows.map((r) => r.map((c) => String(c ?? '')));
  else {
    const p = parseText(a.text ?? '', a.delimiter);
    rows = p.rows;
    isTable = p.delimiter !== 'none' && p.columns >= 2;
  }
  if (!rows.length) throw badRequest('EMPTY');
  if (a.format === 'xlsx') {
    const name = withExt(a.name, '.xlsx', 'Tabelle');
    return { ...(await created(ai, parent, name, await rowsToXlsx(rows, baseOf(name).slice(0, 31)), XLSX_MIME, 'DRIVE_FILE_FROM_TEXT', { format: 'xlsx', rows: rows.length })), rows: rows.length };
  }
  const name = withExt(a.name, '.pdf', 'Dokument');
  const buf = isTable
    ? await tableToPdf(baseOf(name), rows.slice(0, 5000).map((r) => r.slice(0, 30)))
    : await renderDocPdf({ title: baseOf(name), letterhead: false, date: null, blocks: textToBlocks(a.text ?? '') });
  return { ...(await created(ai, parent, name, buf, PDF_MIME, 'DRIVE_FILE_FROM_TEXT', { format: 'pdf', rows: rows.length })), rows: rows.length };
};

/** Conversions (routes/driveCreate.ts POST /convert): images / PDFs → PDF (merge optional), csv → xlsx. */
export const convertFiles = async (ai: AiToolContext, a: { ids: string[]; to: 'pdf' | 'xlsx'; merge?: boolean; parentId?: string; name?: string }) => {
  const ctx = driveCtx(ai);
  const ids = [...new Set(a.ids)];
  const metas: { id: string; name: string; parentId: string | null; kind: Source['kind'] | null; size: number }[] = [];
  for (const id of ids) {
    const { node } = await requireNode(ctx, id, 'DOWNLOAD');
    if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
    const row = await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: { mimeType: true, size: true } });
    if ((row.size ?? 0) > config.drive.maxFileSize) throw new HttpError(413, 'FILE_TOO_LARGE');
    metas.push({ id, name: node.name, parentId: node.parentId, kind: sourceKind(node.name, row.mimeType), size: row.size ?? 0 });
  }
  if (metas.reduce((s, m) => s + m.size, 0) > 200 * 1024 * 1024) throw new HttpError(413, 'FILE_TOO_LARGE');
  const targetId = a.parentId ?? metas[0]?.parentId;
  if (!targetId) throw badRequest('NOT_A_FOLDER');
  const target = await targetFolder(ctx, targetId);
  const read = async (m: (typeof metas)[number]): Promise<Source> => {
    if (!m.kind) throw badRequest('UNSUPPORTED_CONVERSION');
    return { name: m.name, kind: m.kind, bytes: (await readNodeBuffer(m.id, config.drive.maxFileSize)).buf };
  };
  const meta = { to: a.to, merge: !!a.merge, sources: ids.slice(0, 50) };
  const results: { id: string; ok: boolean; error?: string; itemId?: string; name?: string }[] = [];
  if (a.to === 'pdf' && a.merge && metas.length > 1) {
    if (metas.some((m) => !m.kind)) throw badRequest('UNSUPPORTED_CONVERSION');
    const sources: Source[] = [];
    for (const m of metas) sources.push(await read(m));
    const name = withExt(a.name ?? `${baseOf(metas[0].name)} (zusammengeführt)`, '.pdf', 'Dokument');
    const c = await created(ai, target, name, await mergeToPdf(sources, baseOf(name)), PDF_MIME, 'DRIVE_FILE_CONVERTED', meta);
    for (const m of metas) results.push({ id: m.id, ok: true, itemId: c.id, name: c.name });
  } else {
    for (const m of metas) {
      try {
        const src = await read(m);
        const c =
          a.to === 'pdf'
            ? await created(ai, target, withExt(baseOf(m.name), '.pdf', 'Dokument'), await convertToPdf(src), PDF_MIME, 'DRIVE_FILE_CONVERTED', meta)
            : await created(ai, target, withExt(baseOf(m.name), '.xlsx', 'Tabelle'), await convertToXlsx(src), XLSX_MIME, 'DRIVE_FILE_CONVERTED', meta);
        results.push({ id: m.id, ok: true, itemId: c.id, name: c.name });
      } catch (err) {
        if (err instanceof HttpError) results.push({ id: m.id, ok: false, error: err.code });
        else throw err;
      }
    }
  }
  return { targetId: target.id, results };
};

// ─── Templates ───────────────────────────────────────────────────────

const TEMPLATE_MIME: Record<TemplateFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

/** The "Sonstiges" stage folder of the client's case folder (routes/driveIntel.ts clientTargetFolder). */
const clientTargetFolder = async (ctx: DriveAccessCtx, caseId: string): Promise<NodeLite> => {
  const folderId = await ensureCaseFolder(caseId);
  if (!folderId) throw notFound('CASE_NOT_FOUND');
  const name = STAGE_FOLDER.OTHER;
  let stage = await findSibling(folderId, name);
  if (!stage || stage.kind !== 'FOLDER') {
    const parent = await prisma.driveNode.findUniqueOrThrow({ where: { id: folderId }, select: { space: true, ownerId: true } });
    try {
      stage = await prisma.driveNode.create({ data: { space: parent.space, ownerId: parent.ownerId, kind: 'FOLDER', name, parentId: folderId }, select: { id: true, kind: true, name: true } });
    } catch {
      stage = await findSibling(folderId, name);
    }
  }
  return (await requireNode(ctx, stage!.id, 'EDIT')).node;
};

export const fillTemplate = async (ai: AiToolContext, a: { templateId: string; caseId: string; inputs?: Record<string, string>; targetFolderId?: string; lang?: 'de' | 'en' | 'az' | 'ru' }) => {
  const ctx = driveCtx(ai);
  const { node } = await requireNode(ctx, a.templateId, 'DOWNLOAD');
  if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
  const meta = await prisma.driveNode.findUniqueOrThrow({ where: { id: node.id }, select: { mimeType: true } });
  const format = templateFormat(node.name, meta.mimeType);
  if (!format) throw badRequest('NOT_A_TEMPLATE');
  const { buf } = await readNodeBuffer(node.id, config.drive.maxFileSize);
  const info = await inspectTemplate(buf, format);
  if (!info.supported) throw badRequest(info.reason ?? 'NOT_A_TEMPLATE');
  const { values, clientName } = await caseValues(a.caseId, { firstName: ai.user.firstName, lastName: ai.user.lastName }, a.lang ?? 'de');
  const parent = a.targetFolderId ? await targetFolder(ctx, a.targetFolderId) : await clientTargetFolder(ctx, a.caseId);
  const result = format === 'docx' ? await fillDocx(buf, values, a.inputs ?? {}) : await fillPdfForm(buf, values, a.inputs ?? {});
  assertSize(result.buf);
  const base = node.name.replace(/\.(docx|pdf)$/i, '') || 'Dokument';
  // eslint-disable-next-line no-control-regex
  const outName = `${`${base} – ${clientName}`.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 190)}.${format}`;
  const c = await createFileIn(parent, outName, result.buf, TEMPLATE_MIME[format], ai.user.id);
  await audit(actorReq(ai), 'DRIVE_TEMPLATE_FILLED', `drive:${c.id}`, { templateId: node.id, caseId: a.caseId, name: c.name, parentId: parent.id, filled: result.filled.length, missing: result.missing, ...via });
  await logDriveActivity({ nodeId: c.id, folderId: parent.id, actorId: ai.user.id, action: 'CREATE', name: c.name, meta: { via: 'ai', template: node.id, kind: 'FILE' } });
  return { id: c.id, name: c.name, parentId: parent.id, filled: result.filled, missing: result.missing };
};

// ─── Share links, comments, e-signature ──────────────────────────────

export const createShareLink = async (ai: AiToolContext, a: { nodeId: string; expiresInDays?: number; password?: string | null; label?: string | null; maxDownloads?: number | null; allowUpload?: boolean }) => {
  const ctx = driveCtx(ai);
  const { node, level } = await requireNode(ctx, a.nodeId, 'EDIT');
  if (!node.parentId || (node.system && !ctx.isSuper)) throw badRequest('SYSTEM_NODE');
  if (node.kind === 'FILE' && !allows(level, 'DOWNLOAD')) throw new HttpError(403, 'INSUFFICIENT_ACCESS');
  if (a.allowUpload && node.kind !== 'FOLDER') throw badRequest('UPLOAD_ONLY_FOR_FOLDERS');
  const days = Math.min(Math.max(1, a.expiresInDays ?? 7), MAX_LINK_DAYS);
  const now = Date.now();
  const expiresAt = new Date(Math.min(now + days * 24 * 60 * 60 * 1000, maxExpiry(now).getTime()));
  const token = newShareToken();
  const link = await prisma.driveShareLink.create({
    data: {
      nodeId: node.id,
      tokenHash: sha256(token),
      passwordHash: a.password ? await bcrypt.hash(a.password, 10) : null,
      label: a.label?.trim() || null,
      expiresAt,
      maxDownloads: a.maxDownloads ?? null,
      allowUpload: !!a.allowUpload,
      createdById: ai.user.id,
    },
    select: { id: true, label: true, allowUpload: true },
  });
  await audit(actorReq(ai), 'DRIVE_SHARE_LINK_CREATED', `drive:${node.id}`, { name: node.name, linkId: link.id, expiresAt, password: !!a.password, maxDownloads: a.maxDownloads ?? null, allowUpload: !!a.allowUpload, ...via });
  await logDriveActivity({ nodeId: node.id, actorId: ai.user.id, action: 'SHARE_LINK_CREATED', name: node.name, meta: { linkId: link.id, label: link.label, expiresAt, allowUpload: link.allowUpload, kind: node.kind, ...via } });
  return { linkId: link.id, url: shareUrl(token), expiresAt: expiresAt.toISOString(), hasPassword: !!a.password, name: node.name };
};

const STAFF_ROLES = ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;

/** Staff by id or by name ("Ilqar", "Aysel Məmmədova") who can see the node (routes/driveCollab.ts mentionTargets). */
export const resolveMentions = async (refs: string[], nodeId: string) => {
  const out: { id: string; role: (typeof STAFF_ROLES)[number]; firstName: string; lastName: string; locale: import('@prisma/client').Locale }[] = [];
  const staff = await prisma.user.findMany({ where: { isActive: true, role: { in: [...STAFF_ROLES] } }, select: { id: true, role: true, firstName: true, lastName: true, locale: true, email: true } });
  for (const ref of [...new Set(refs)].slice(0, 30)) {
    const r = ref.replace(/^@/, '').trim();
    const f = foldName(r);
    const hit =
      staff.find((s) => s.id === r) ??
      staff.find((s) => s.email.toLowerCase() === r.toLowerCase()) ??
      (() => {
        const m = staff.filter((s) => foldName(`${s.firstName} ${s.lastName}`) === f || foldName(s.firstName) === f);
        return m.length === 1 ? m[0] : undefined;
      })();
    if (hit && !out.some((o) => o.id === hit.id)) out.push(hit as (typeof out)[number]);
  }
  const visible: typeof out = [];
  for (const u of out) {
    const c = new DriveAccessCtx({ id: u.id, role: u.role });
    await c.load([nodeId]);
    if (allows(c.level(nodeId), 'VIEW')) visible.push(u);
  }
  return visible;
};

export const addComment = async (ai: AiToolContext, a: { nodeId: string; body: string; mentions?: string[]; parentId?: string | null }) => {
  const ctx = driveCtx(ai);
  const { node } = await requireNode(ctx, a.nodeId, 'VIEW');
  const body = a.body.replace(/\r\n/g, '\n').trim();
  if (!body) throw badRequest('EMPTY');
  let parentId: string | null = null;
  if (a.parentId) {
    const parent = await prisma.driveComment.findUnique({ where: { id: a.parentId }, select: { id: true, nodeId: true, parentId: true } });
    if (!parent || parent.nodeId !== node.id) throw badRequest('INVALID_PARENT');
    parentId = parent.parentId ?? parent.id;
  }
  const targets = await resolveMentions([...mentionedIds(body), ...(a.mentions ?? [])], node.id);
  const c = await prisma.driveComment.create({ data: { nodeId: node.id, authorId: ai.user.id, parentId, body, mentions: targets.map((t) => t.id) }, select: { id: true } });
  if (parentId) await prisma.driveComment.updateMany({ where: { id: parentId, resolvedAt: { not: null } }, data: { resolvedAt: null } });
  const actor = `${ai.user.firstName} ${ai.user.lastName}`.trim();
  const link = node.parentId ? `/workspace/drive/f/${encodeURIComponent(node.parentId)}?${new URLSearchParams({ item: node.id, comment: c.id })}` : `/workspace/drive/f/${encodeURIComponent(node.id)}`;
  for (const u of targets) {
    if (u.id === ai.user.id) continue;
    try {
      const tx = collabTexts(u.locale);
      await notifyUser(u.id, { type: 'DRIVE_MENTION', ...tx.mention({ actor, name: node.name, excerpt: plainText(body) }), link, ctaLabel: tx.cta });
    } catch (err) {
      console.error('[ai] mention notification failed', err);
    }
  }
  await logDriveActivity({ nodeId: node.id, actorId: ai.user.id, action: 'COMMENT', name: node.name, meta: { commentId: c.id, reply: !!parentId, kind: node.kind, ...via } });
  await publishDrive('drive.comment', { nodeId: node.id, commentId: c.id, action: 'created' });
  return { commentId: c.id, mentioned: targets.map((t) => `${t.firstName} ${t.lastName}`.trim()) };
};

export interface SignerIn {
  role: 'CANDIDATE' | 'COMPANY' | 'STAFF' | 'OTHER';
  name: string;
  email: string;
  phone?: string | null;
  locale?: 'az' | 'de' | 'en' | 'ru' | null;
}

/** Sends a drive PDF for e-signature (routes/driveIntel.ts POST /esign/:nodeId). */
export const sendForSignature = async (ai: AiToolContext, a: { nodeId: string; title: string; signers: SignerIn[]; message?: string | null; expiresInDays?: number; order?: 'SEQUENTIAL' | 'PARALLEL'; caseId?: string | null }) => {
  const ctx = driveCtx(ai);
  const { node } = await requireNode(ctx, a.nodeId, 'DOWNLOAD');
  if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
  const meta0 = await prisma.driveNode.findUniqueOrThrow({ where: { id: node.id }, select: { mimeType: true, size: true } });
  if (meta0.mimeType !== 'application/pdf' && !/\.pdf$/i.test(node.name)) throw badRequest('INVALID_PDF');
  if ((meta0.size ?? 0) > MAX_PDF_BYTES) throw new HttpError(413, 'FILE_TOO_LARGE');
  const { buf } = await readNodeBuffer(node.id, MAX_PDF_BYTES);
  const actor: Actor = { id: ai.user.id, role: ai.user.role as Actor['role'], firstName: ai.user.firstName, lastName: ai.user.lastName };
  const meta = { ip: null, userAgent: 'triad-ai-assistant', actorId: actor.id };
  const req = await createRequest(
    {
      title: a.title,
      caseId: a.caseId ?? null,
      companyId: null,
      message: a.message ?? null,
      expiresAt: new Date(Date.now() + (a.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000),
      order: a.order ?? 'SEQUENTIAL',
      caseContract: false,
      signers: a.signers.map((s) => ({ role: s.role, name: s.name, email: s.email.toLowerCase(), phone: s.phone ?? null, locale: s.locale ?? null })),
      pdf: buf,
      fileName: node.name,
    },
    actor,
    meta,
  );
  try {
    await sendRequest(req.id, actor, meta);
  } catch (err) {
    await prisma.signatureRequest.delete({ where: { id: req.id } }).catch(() => undefined);
    await fsp.unlink(path.join(config.uploads.privateDir, req.originalKey)).catch(() => undefined);
    throw err;
  }
  await rememberDriveEsign(req.id, { nodeId: node.id, parentId: node.parentId, name: node.name, userId: actor.id });
  void audit(actorReq(ai), 'signature.create', req.id, { title: req.title, caseId: req.caseId, sent: true, driveNodeId: node.id, ...via });
  await audit(actorReq(ai), 'DRIVE_ESIGN_SENT', `drive:${node.id}`, { requestId: req.id, signers: a.signers.length, ...via });
  return { requestId: req.id, title: req.title, signers: a.signers.length };
};
