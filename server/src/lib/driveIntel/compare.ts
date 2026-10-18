import fsp from 'node:fs/promises';
import { prisma } from '../../db.js';
import { HttpError, badRequest, notFound } from '../http.js';
import { storagePath } from '../drive/storage.js';
import { diffStats, diffText, type DiffOp } from './diff.js';
import { MAX_EXTRACT_BYTES, extractText, intelKind, xlsxCells, type IntelKind } from './extract.js';
import { tidyText } from './normalize.js';

/**
 * Comparison of two versions of a drive file ("current" or a DriveFileVersion id):
 *   PDF / DOCX / TXT  text of both, word diff (line diff for long texts), page by page for PDFs
 *   XLSX              cell diff per sheet (added / removed / changed with old → new)
 *   images            just both URLs
 */

export interface VersionRef {
  ref: string;
  version: number;
  storageKey: string;
  mimeType: string | null;
  size: number;
  createdAt: Date;
  url: string;
}

const enc = encodeURIComponent;

/** Resolves "current" or a version id of the node. */
export const resolveVersion = async (nodeId: string, ref: string): Promise<VersionRef> => {
  if (ref === 'current') {
    const n = await prisma.driveNode.findUniqueOrThrow({ where: { id: nodeId }, select: { version: true, storageKey: true, mimeType: true, size: true, updatedAt: true } });
    if (!n.storageKey) throw notFound('FILE_MISSING_ON_DISK');
    return { ref, version: n.version, storageKey: n.storageKey, mimeType: n.mimeType, size: n.size ?? 0, createdAt: n.updatedAt, url: `/api/drive/nodes/${enc(nodeId)}/content` };
  }
  const v = await prisma.driveFileVersion.findFirst({ where: { id: ref, nodeId } });
  if (!v) throw notFound('VERSION_NOT_FOUND');
  return { ref, version: v.version, storageKey: v.storageKey, mimeType: v.mimeType, size: v.size, createdAt: v.createdAt, url: `/api/drive/nodes/${enc(nodeId)}/versions/${enc(v.id)}/content` };
};

const read = async (v: VersionRef) => {
  if (v.size > MAX_EXTRACT_BYTES) throw new HttpError(413, 'FILE_TOO_LARGE');
  try {
    return await fsp.readFile(storagePath(v.storageKey));
  } catch {
    throw notFound('FILE_MISSING_ON_DISK');
  }
};

export interface TextChunkDiff {
  /** 1-based page (PDF) or null */
  page: number | null;
  ops: DiffOp[];
  changed: boolean;
}

export interface CellChange {
  cell: string;
  type: 'added' | 'removed' | 'changed';
  old: string | null;
  new: string | null;
}

export type CompareResult =
  | { kind: 'text'; mode: 'words' | 'lines'; chunks: TextChunkDiff[]; stats: { added: number; removed: number }; truncated: boolean }
  | { kind: 'sheet'; sheets: { name: string; status: 'same' | 'changed' | 'added' | 'removed'; changes: CellChange[] }[]; stats: { added: number; removed: number; changed: number }; truncated: boolean }
  | { kind: 'image' };

/** Text chunks diffed in total at most (beyond: line mode / truncated). */
const MAX_PAGES = 300;
const MAX_CELL_CHANGES = 5000;

const colRow = (addr: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(addr);
  if (!m) return [0, 0];
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]), col];
};
const byAddress = (a: string, b: string) => {
  const [ra, ca] = colRow(a);
  const [rb, cb] = colRow(b);
  return ra - rb || ca - cb;
};

export const compareSheets = async (aBuf: Buffer, bBuf: Buffer): Promise<Extract<CompareResult, { kind: 'sheet' }>> => {
  const [a, b] = await Promise.all([xlsxCells(aBuf), xlsxCells(bBuf)]);
  const names = [...a.map((s) => s.name), ...b.map((s) => s.name).filter((n) => !a.some((s) => s.name === n))];
  const stats = { added: 0, removed: 0, changed: 0 };
  let total = 0;
  let truncated = false;
  const sheets = names.map((name) => {
    const sa = a.find((s) => s.name === name)?.cells;
    const sb = b.find((s) => s.name === name)?.cells;
    const changes: CellChange[] = [];
    const addrs = [...new Set([...(sa?.keys() ?? []), ...(sb?.keys() ?? [])])].sort(byAddress);
    for (const cell of addrs) {
      const o = sa?.get(cell) ?? null;
      const n = sb?.get(cell) ?? null;
      if (o === n) continue;
      const type = o === null ? 'added' : n === null ? 'removed' : 'changed';
      stats[type]++;
      if (total >= MAX_CELL_CHANGES) {
        truncated = true;
        continue;
      }
      total++;
      changes.push({ cell, type, old: o, new: n });
    }
    const status: 'same' | 'changed' | 'added' | 'removed' = !sa ? 'added' : !sb ? 'removed' : changes.length ? 'changed' : 'same';
    return { name, status, changes };
  });
  return { kind: 'sheet', sheets, stats, truncated };
};

export const compareTexts = (aChunks: string[], bChunks: string[], paged: boolean): Extract<CompareResult, { kind: 'text' }> => {
  const A = aChunks.map(tidyText);
  const B = bChunks.map(tidyText);
  const chunks: TextChunkDiff[] = [];
  let mode: 'words' | 'lines' = 'words';
  const stats = { added: 0, removed: 0 };
  const n = Math.max(A.length, B.length);
  const truncated = n > MAX_PAGES;
  for (let i = 0; i < Math.min(n, MAX_PAGES); i++) {
    const r = diffText(A[i] ?? '', B[i] ?? '');
    if (r.mode === 'lines') mode = 'lines';
    const s = diffStats(r.ops);
    stats.added += s.added;
    stats.removed += s.removed;
    chunks.push({ page: paged ? i + 1 : null, ops: r.ops, changed: r.ops.some((o) => o.t !== 'eq') });
  }
  return { kind: 'text', mode, chunks, stats, truncated };
};

/** Compares two versions of a file node by its type. */
export const compareVersions = async (node: { id: string; name: string }, a: VersionRef, b: VersionRef): Promise<CompareResult> => {
  const kindA = intelKind(node.name, a.mimeType);
  const kindB = intelKind(node.name, b.mimeType);
  const kind: IntelKind | null = kindA === kindB ? kindA : null;
  if (!kind) throw badRequest('COMPARE_UNSUPPORTED');
  if (kind === 'image') return { kind: 'image' };
  const [aBuf, bBuf] = await Promise.all([read(a), read(b)]);
  if (kind === 'xlsx') return compareSheets(aBuf, bBuf);
  try {
    const [ea, eb] = await Promise.all([extractText(aBuf, kind, { ocr: false }), extractText(bBuf, kind, { ocr: false })]);
    return compareTexts(ea.chunks, eb.chunks, kind === 'pdf');
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw badRequest('COMPARE_UNREADABLE');
  }
};
