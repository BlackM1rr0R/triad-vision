import type { Request } from 'express';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { HttpError, badRequest, notFound } from '../http.js';
import { audit } from '../audit.js';
import { DriveAccessCtx, requireNode, type NodeLite } from '../drive/access.js';
import { createFileIn, readNodeBuffer, saveFileVersion } from '../drive/files.js';
import { ensureSection } from '../drive/roots.js';
import { logDriveActivity } from '../driveCollab/activity.js';
import { assertNotLockedByOther } from '../driveCollab/lock.js';
import { assertNotFinal, finalError } from '../drive/org/finalCheck.js';
import { toolKind, type ToolKind } from './images.js';

/**
 * Drive side of the PDF tools: loading sources with the right access level, the "Final" and edit-lock
 * checks, and saving a result either as a new version of the file or as a new file next to it.
 */

export const ctxOf = (req: Request) => new DriveAccessCtx({ id: req.user!.id, role: req.user!.role });

/** 409 with the version the client should reload. */
export class VersionConflictError extends HttpError {
  constructor(public currentVersion: number | null) {
    super(409, 'VERSION_CONFLICT');
  }
}


export interface ToolFile {
  node: NodeLite;
  version: number;
  mimeType: string | null;
  size: number;
  kind: ToolKind | null;
  final: boolean;
}

/** A file the caller may use with `need` access (404 / 403 like the drive). */
export const loadFile = async (ctx: DriveAccessCtx, id: string, need: 'VIEW' | 'DOWNLOAD' | 'EDIT'): Promise<ToolFile> => {
  if (!id || id.length > 120) throw notFound('NODE_NOT_FOUND');
  const { node } = await requireNode(ctx, id, need);
  if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
  const row = await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: { version: true, mimeType: true, size: true, finalAt: true } });
  if ((row.size ?? 0) > config.drive.maxFileSize) throw new HttpError(413, 'FILE_TOO_LARGE');
  return { node, version: row.version, mimeType: row.mimeType, size: row.size ?? 0, kind: toolKind(node.name, row.mimeType), final: !!row.finalAt };
};

export const loadPdfFile = async (ctx: DriveAccessCtx, id: string, need: 'VIEW' | 'DOWNLOAD' | 'EDIT') => {
  const f = await loadFile(ctx, id, need);
  if (f.kind !== 'pdf') throw badRequest('NOT_A_PDF');
  return f;
};

export const readBytes = async (id: string) => (await readNodeBuffer(id, config.drive.maxFileSize)).buf;

/** The target folder of a new file (EDIT). */
export const targetFolder = async (ctx: DriveAccessCtx, id: string | null | undefined): Promise<NodeLite> => {
  if (!id) throw badRequest('NOT_A_FOLDER');
  const { node } = await requireNode(ctx, id, 'EDIT');
  if (node.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
  return node;
};

/** "Brief.pdf" + " (gizlədilmiş)" → "Brief (gizlədilmiş).pdf"; a typed name gets the extension. */
export const outName = (raw: string | undefined, fallbackBase: string, suffix: string, ext: string) => {
  const clean = (s: string) =>
    s
      .normalize('NFC')
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '');
  const typed = raw ? clean(raw) : '';
  const base = typed ? (typed.toLowerCase().endsWith(ext) ? typed.slice(0, -ext.length).trim() : typed) : `${clean(fallbackBase.replace(/\.[^.]+$/, '')) || 'Dokument'}${suffix}`;
  return `${(base || 'Dokument').slice(0, 180)}${ext}`;
};

export type SaveAs = 'version' | 'copy';

export interface SaveTarget {
  req: Request;
  ctx: DriveAccessCtx;
  src: ToolFile;
  bytes: Buffer;
  mime: string;
  saveAs: SaveAs;
  /** Required for versions (conflict check). */
  baseVersion?: number;
  /** New file: name and folder (default: next to the source). */
  name: string;
  parentId?: string | null;
  /** Audit action and activity details. */
  op: string;
  meta?: Record<string, unknown>;
}

/** Checks before changing the file itself: EDIT, not Final, not locked by someone else, base version. */
export const assertVersionable = async (req: Request, ctx: DriveAccessCtx, src: ToolFile, baseVersion: number | undefined) => {
  await requireNode(ctx, src.node.id, 'EDIT');
  // The drive's "Final" lock (signed contract, sent embassy package): 423 FILE_FINAL.
  if (src.final) throw finalError();
  await assertNotFinal(src.node.id);
  await assertNotLockedByOther(src.node.id, req.user!.id);
  if (baseVersion !== undefined && baseVersion !== src.version) throw new VersionConflictError(src.version);
};

/** Saves the result; returns the id of the changed or created node and its version. */
export const saveResult = async (t: SaveTarget): Promise<{ id: string; name: string; version: number; created: boolean }> => {
  if (t.bytes.length > config.drive.maxFileSize) throw new HttpError(413, 'FILE_TOO_LARGE');
  const userId = t.req.user!.id;
  if (t.saveAs === 'version') {
    await assertVersionable(t.req, t.ctx, t.src, t.baseVersion);
    let saved: { version: number; size: number };
    try {
      saved = await saveFileVersion(t.src.node.id, t.bytes, t.mime, t.baseVersion ?? t.src.version);
    } catch (err) {
      if (err instanceof HttpError && err.code === 'VERSION_CONFLICT') {
        const cur = await prisma.driveNode.findUnique({ where: { id: t.src.node.id }, select: { version: true } });
        throw new VersionConflictError(cur?.version ?? null);
      }
      throw err;
    }
    // Same audit action as a replace-upload, so the version history names who saved each version.
    await audit(t.req, 'DRIVE_FILE_VERSION_ADDED', `drive:${t.src.node.id}`, { name: t.src.node.name, version: saved.version, size: saved.size, source: `pdf-tools:${t.op}` });
    await audit(t.req, `DRIVE_PDF_${t.op.toUpperCase()}`, `drive:${t.src.node.id}`, { name: t.src.node.name, saveAs: 'version', version: saved.version, ...(t.meta ?? {}) } as never);
    await logDriveActivity({
      nodeId: t.src.node.id,
      folderId: t.src.node.parentId,
      actorId: userId,
      action: 'NEW_VERSION',
      name: t.src.node.name,
      meta: { version: saved.version, size: saved.size, source: `pdf-tools:${t.op}`, kind: 'FILE', ...(t.meta ?? {}) },
    });
    return { id: t.src.node.id, name: t.src.node.name, version: saved.version, created: false };
  }
  const parent = await targetFolder(t.ctx, t.parentId ?? t.src.node.parentId);
  const created = await createFileIn(parent, t.name, t.bytes, t.mime, userId);
  await audit(t.req, `DRIVE_PDF_${t.op.toUpperCase()}`, `drive:${created.id}`, { name: created.name, saveAs: 'copy', sourceId: t.src.node.id, parentId: parent.id, size: t.bytes.length, ...(t.meta ?? {}) } as never);
  await logDriveActivity({ nodeId: created.id, folderId: parent.id, actorId: userId, action: 'CREATE', name: created.name, meta: { via: 'pdf-tools', op: t.op, sourceId: t.src.node.id, kind: 'FILE', ...(t.meta ?? {}) } });
  return { id: created.id, name: created.name, version: 1, created: true };
};

/** Creates a new file in a folder (merge, split parts): EDIT on the folder, audit + activity. */
export const createResult = async (req: Request, parent: NodeLite, name: string, bytes: Buffer, mime: string, op: string, meta: Record<string, unknown>) => {
  if (bytes.length > config.drive.maxFileSize) throw new HttpError(413, 'FILE_TOO_LARGE');
  const created = await createFileIn(parent, name, bytes, mime, req.user!.id);
  await audit(req, `DRIVE_PDF_${op.toUpperCase()}`, `drive:${created.id}`, { name: created.name, parentId: parent.id, size: bytes.length, ...meta } as never);
  await logDriveActivity({ nodeId: created.id, folderId: parent.id, actorId: req.user!.id, action: 'CREATE', name: created.name, meta: { via: 'pdf-tools', op, kind: 'FILE', ...meta } });
  return created;
};

// ─── stamp & signature library ───────────────────────────────────────

export const STAMPS_FOLDER_NAME = 'Stempel & Unterschriften';

/** "Vorlagen/Stempel & Unterschriften" (created on first use, a system folder inheriting Vorlagen's rights). */
export const ensureStampsFolder = async () => {
  const templatesId = await ensureSection('templates');
  const existing = await prisma.driveNode.findFirst({ where: { parentId: templatesId, kind: 'FOLDER', name: STAMPS_FOLDER_NAME, deletedAt: null }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  if (existing) return existing.id;
  const created = await prisma.driveNode.create({
    data: { space: 'SHARED', kind: 'FOLDER', name: STAMPS_FOLDER_NAME, parentId: templatesId, system: true, color: 'pink', inheritPermissions: true },
    select: { id: true },
  });
  return created.id;
};
