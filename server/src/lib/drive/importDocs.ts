import fs from 'node:fs/promises';
import path from 'node:path';
import type { DocAccess, DriveAccess } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { ensurePersonalRoot, ensureRoots } from './roots.js';
import { copyIntoStore } from './storage.js';

/**
 * One-time import of the old staff workspaces (/docs: DocFolder / DocDir / DocFile / DocGrant) into
 * the team drive. Every workspace becomes the owner's "My files"; directories become folders; files are
 * COPIED (never moved) from <DOCS_DIR>/<slug>/<path>/<name> into <DOCS_DIR>/drive/<new key>; grants
 * become grants on the personal root (VIEW→VIEW, DOWNLOAD→EXPORT, EDIT→EDIT).
 *
 * Idempotent: a folder is matched by parent + name, a file by parent + name + size, so a re-run only
 * adds what is missing. With `dryRun` nothing is written (neither rows nor files).
 */

export const GRANT_MAP: Record<DocAccess, DriveAccess> = { VIEW: 'VIEW', DOWNLOAD: 'EXPORT', EDIT: 'EDIT' };

export interface ImportSummary {
  dryRun: boolean;
  workspaces: number;
  foldersCreated: number;
  foldersExisting: number;
  filesImported: number;
  filesSkipped: number;
  filesMissing: string[];
  bytesCopied: number;
  grantsUpserted: number;
  errors: string[];
}

const resolveInside = (root: string, ...parts: string[]) => {
  const full = path.resolve(root, ...parts);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`path escapes the workspace: ${parts.join('/')}`);
  return full;
};

export const importDocsToDrive = async (opts: { dryRun?: boolean; log?: (line: string) => void } = {}): Promise<ImportSummary> => {
  const dryRun = !!opts.dryRun;
  const log = opts.log ?? (() => undefined);
  const s: ImportSummary = {
    dryRun,
    workspaces: 0,
    foldersCreated: 0,
    foldersExisting: 0,
    filesImported: 0,
    filesSkipped: 0,
    filesMissing: [],
    bytesCopied: 0,
    grantsUpserted: 0,
    errors: [],
  };
  if (!dryRun) await ensureRoots();

  const folders = await prisma.docFolder.findMany({
    include: { owner: { select: { id: true, firstName: true, lastName: true, role: true } }, dirs: true, files: true, grants: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const folder of folders) {
    s.workspaces++;
    const who = `${folder.owner.firstName} ${folder.owner.lastName}`;
    log(`workspace /docs/${folder.slug} (${who}): ${folder.dirs.length} dirs, ${folder.files.length} files, ${folder.grants.length} grants`);
    const rootId = dryRun
      ? (await prisma.driveNode.findFirst({ where: { space: 'PERSONAL', ownerId: folder.ownerId, parentId: null }, select: { id: true } }))?.id ?? null
      : await ensurePersonalRoot(folder.ownerId);
    if (!dryRun && !rootId) {
      s.errors.push(`/docs/${folder.slug}: owner ${who} is not a staff member any more, skipped`);
      continue;
    }

    // Directory path ("a/b") → drive folder id. In a dry run, unknown folders get a placeholder id.
    const dirIds = new Map<string, string | null>([['', rootId]]);
    const ensureDir = async (rel: string): Promise<string | null> => {
      if (dirIds.has(rel)) return dirIds.get(rel)!;
      const cut = rel.lastIndexOf('/');
      const parentRel = cut === -1 ? '' : rel.slice(0, cut);
      const name = cut === -1 ? rel : rel.slice(cut + 1);
      const parentId = await ensureDir(parentRel);
      const existing = parentId
        ? await prisma.driveNode.findFirst({ where: { parentId, name, kind: 'FOLDER', deletedAt: null }, select: { id: true } })
        : null;
      let id: string | null = existing?.id ?? null;
      if (existing) s.foldersExisting++;
      else {
        s.foldersCreated++;
        if (!dryRun && parentId) {
          const created = await prisma.driveNode.create({
            data: { space: 'PERSONAL', kind: 'FOLDER', name, parentId, ownerId: folder.ownerId, createdById: folder.ownerId, createdAt: folder.createdAt },
            select: { id: true },
          });
          id = created.id;
        }
      }
      dirIds.set(rel, id);
      return id;
    };

    const dirs = [...folder.dirs].sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
    for (const d of dirs) await ensureDir(d.path);

    for (const f of folder.files) {
      const label = `/docs/${folder.slug}/${f.path ? `${f.path}/` : ''}${f.name}`;
      try {
        const parentId = await ensureDir(f.path);
        const src = resolveInside(path.join(config.docs.dir, folder.slug), f.path, f.name);
        const stat = await fs.stat(src).catch(() => null);
        const existing = parentId
          ? await prisma.driveNode.findFirst({ where: { parentId, name: f.name, kind: 'FILE', size: stat?.size ?? f.size, deletedAt: null }, select: { id: true } })
          : null;
        if (existing) {
          s.filesSkipped++;
          continue;
        }
        if (!stat?.isFile()) {
          s.filesMissing.push(label);
          continue;
        }
        if (!dryRun && parentId) {
          const storageKey = await copyIntoStore(src);
          await prisma.driveNode.create({
            data: {
              space: 'PERSONAL',
              kind: 'FILE',
              name: f.name,
              parentId,
              ownerId: folder.ownerId,
              storageKey,
              mimeType: f.mimeType,
              size: stat.size,
              version: f.version,
              createdById: f.uploadedById,
              createdAt: f.createdAt,
            },
          });
        }
        s.filesImported++;
        s.bytesCopied += stat.size;
      } catch (err) {
        s.errors.push(`${label}: ${(err as Error).message}`);
      }
    }

    for (const g of folder.grants) {
      if (g.userId === folder.ownerId) continue;
      s.grantsUpserted++;
      if (dryRun || !rootId) continue;
      await prisma.driveGrant.upsert({
        where: { nodeId_userId: { nodeId: rootId, userId: g.userId } },
        create: { nodeId: rootId, userId: g.userId, access: GRANT_MAP[g.access], grantedById: g.grantedById, createdAt: g.createdAt },
        update: { access: GRANT_MAP[g.access] },
      });
    }
  }
  return s;
};
