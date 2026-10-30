import fs from 'node:fs/promises';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { STORED_NAME, filesOfUrl, publicDir, safeUnlink } from './publicImages.js';

/**
 * Which public upload files are still referenced, and the deletion of the ones that are not.
 *
 * References are found generically: every String / Json column of every model (from the Prisma schema) is searched
 * for "/uploads/…" paths. So a new column holding an image URL is covered without touching this file, and a URL
 * staff pasted somewhere unexpected (a post body, a landing section, a setting) keeps its file.
 *
 * Used by the nightly orphan sweep (jobs/publicUploads.ts) and right after a vacancy image / company logo is replaced
 * or removed (cleanupRemovedImages).
 */

/** Rows matching "/uploads/" per column above this → the scan is treated as incomplete and nothing is deleted. */
const ROW_CAP = 50_000;
const SCAN_CONCURRENCY = 4;

interface Column {
  table: string;
  column: string;
  json: boolean;
}

let columnCache: Column[] | null = null;

/** Logs, not live references: the audit trail of an old upload must not keep its file forever. */
const SKIP_MODELS = new Set(['AuditLog']);

/** String (≥ 40 chars wide) and Json columns of every model. */
export const referenceColumns = (): Column[] => {
  if (columnCache) return columnCache;
  const out: Column[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    if (SKIP_MODELS.has(model.name)) continue;
    for (const f of model.fields) {
      if (f.kind !== 'scalar' || f.isId || (f.type !== 'String' && f.type !== 'Json')) continue;
      const native = f.nativeType as [string, string[]] | null | undefined;
      // Short VarChars (ids, codes, statuses) can never hold an upload path.
      if (native && /char/i.test(native[0]) && Number(native[1]?.[0]) > 0 && Number(native[1][0]) < 40) continue;
      out.push({ table: model.dbName ?? model.name, column: f.dbName ?? f.name, json: f.type === 'Json' });
    }
  }
  columnCache = out;
  return out;
};

const PATH_RE = /\/uploads\/([A-Za-z0-9._\-/]+)/g;

/** "vacancies/<hex>-480.webp" → "vacancies/<hex>.webp" (variants live and die with their main file). */
export const canonicalRel = (rel: string) => rel.replace(/^(vacancies\/[a-f0-9]{32})-\d{2,4}(\.webp)$/, '$1$2');

/** Relative paths under /uploads that some DB value mentions. `complete` = false → do not delete anything. */
export const collectUploadRefs = async (): Promise<{ refs: Set<string>; complete: boolean }> => {
  const refs = new Set<string>();
  const byTable = new Map<string, Column[]>();
  for (const c of referenceColumns()) byTable.set(c.table, [...(byTable.get(c.table) ?? []), c]);
  let complete = true;
  const scanTable = async (table: string, cols: Column[]) => {
    const expr = (c: Column) => (c.json ? `CAST(\`${c.column}\` AS CHAR)` : `\`${c.column}\``);
    const select = cols.map((c, i) => `${expr(c)} AS c${i}`).join(', ');
    const where = cols.map((c) => `${expr(c)} LIKE '%/uploads/%'`).join(' OR ');
    let rows: Record<string, unknown>[];
    try {
      rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT ${select} FROM \`${table}\` WHERE ${where} LIMIT ${ROW_CAP + 1}`);
    } catch (err) {
      // A table that does not exist (yet) cannot reference anything; any other error makes the scan unsafe.
      if ((err as { meta?: { code?: string } })?.meta?.code === '1146') return;
      console.error(`[uploads] reference scan failed on ${table}`, err);
      complete = false;
      return;
    }
    if (rows.length > ROW_CAP) complete = false;
    for (const row of rows) {
      for (const v of Object.values(row)) {
        if (typeof v !== 'string') continue;
        for (const m of v.matchAll(PATH_RE)) refs.add(canonicalRel(m[1].replace(/[.]+$/, '')));
      }
    }
  };
  // A few tables at a time (one round trip each), leaving the rest of the connection pool to the requests.
  const queue = [...byTable];
  const worker = async () => {
    for (let next = queue.shift(); next && complete; next = queue.shift()) await scanTable(next[0], next[1]);
  };
  await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker));
  return { refs, complete };
};

/** "/uploads/vacancies/x.webp" → "vacancies/x.webp" (null for non-upload URLs). */
const relOfUrl = (url: string) => {
  const m = /\/uploads\/([A-Za-z0-9._\-/]+)/.exec(url.replace(/[?#].*$/, ''));
  return m ? canonicalRel(m[1]) : null;
};

/**
 * Deletes the files of these (just removed) image URLs unless another record still references them. Only URLs of
 * the pipeline's own folders are touched (lib/publicImages.ts filesOfUrl). Never throws.
 */
export const deleteUnreferencedImages = async (urls: (string | null | undefined)[]): Promise<number> => {
  const own = [...new Set(urls.filter((u): u is string => !!u && filesOfUrl(u).length > 0))];
  if (!own.length) return 0;
  try {
    const { refs, complete } = await collectUploadRefs();
    if (!complete) return 0;
    let deleted = 0;
    for (const url of own) {
      const rel = relOfUrl(url);
      if (!rel || refs.has(rel)) continue;
      for (const file of filesOfUrl(url)) if (await safeUnlink(file)) deleted++;
    }
    return deleted;
  } catch (err) {
    console.error('[uploads] cleanup failed', err);
    return 0;
  }
};

const pending = new Set<Promise<unknown>>();

/** Fire-and-forget deletion after the response (the reference scan touches every table). */
export const cleanupRemovedImages = (urls: (string | null | undefined)[]) => {
  if (!urls.some(Boolean)) return;
  const p: Promise<unknown> = deleteUnreferencedImages(urls).finally(() => pending.delete(p));
  pending.add(p);
};

/** Tests: wait until the background deletions have finished. */
export const flushImageCleanups = async () => {
  while (pending.size) await Promise.all([...pending]);
};

// ─── Nightly orphan sweep ───────────────────────────────────────────────

export const ORPHAN_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const ORPHAN_MAX_DELETE = 500;
export const ORPHAN_SETTING_KEY = 'uploads.orphanSweep';

export interface SweepResult {
  dryRun: boolean;
  scanned: number;
  orphans: number;
  deleted: number;
  bytes: number;
  skipped?: 'INCOMPLETE_SCAN';
  sample: string[];
}

/** Folders swept (relative to the public uploads dir) with the file names the pipeline writes there. */
const FOLDERS: { rel: '' | 'vacancies' | 'logos'; name: RegExp }[] = [
  { rel: '', name: STORED_NAME.root },
  { rel: 'vacancies', name: STORED_NAME.vacancies },
  { rel: 'logos', name: STORED_NAME.logos },
];

/**
 * Deletes public upload files no DB record references and older than 7 days: the CMS root folder (not recursive),
 * /uploads/vacancies and /uploads/logos. Only file names the upload pipeline generates are considered, symlinks and
 * directories are skipped, at most ORPHAN_MAX_DELETE files per run. `dryRun` only counts.
 */
export const sweepOrphanUploads = async (opts: { dryRun: boolean; now?: Date; maxDelete?: number } = { dryRun: false }): Promise<SweepResult> => {
  const now = (opts.now ?? new Date()).getTime();
  const max = opts.maxDelete ?? ORPHAN_MAX_DELETE;
  const result: SweepResult = { dryRun: opts.dryRun, scanned: 0, orphans: 0, deleted: 0, bytes: 0, sample: [] };
  const { refs, complete } = await collectUploadRefs();
  if (!complete) return { ...result, skipped: 'INCOMPLETE_SCAN' };
  const root = path.resolve(publicDir());
  for (const folder of FOLDERS) {
    const dir = path.join(root, folder.rel);
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      // Dirent.isFile() is false for symlinks: they are never followed or deleted.
      if (!e.isFile() || e.isSymbolicLink() || !folder.name.test(e.name)) continue;
      result.scanned++;
      const rel = canonicalRel(folder.rel ? `${folder.rel}/${e.name}` : e.name);
      if (refs.has(rel)) continue;
      const file = path.join(dir, e.name);
      let st: import('node:fs').Stats;
      try {
        st = await fs.lstat(file);
      } catch {
        continue;
      }
      if (!st.isFile() || now - st.mtimeMs < ORPHAN_MIN_AGE_MS) continue;
      result.orphans++;
      if (result.sample.length < 20) result.sample.push(folder.rel ? `${folder.rel}/${e.name}` : e.name);
      if (opts.dryRun || result.deleted >= max) continue;
      if (await safeUnlink(file)) {
        result.deleted++;
        result.bytes += st.size;
      }
    }
  }
  return result;
};

/**
 * One nightly run: the very first run on an installation is a dry run (logged + recorded, nothing deleted), later runs
 * delete. The count is written to the audit log.
 */
export const runOrphanSweep = async (now = new Date()): Promise<SweepResult> => {
  const state = await prisma.setting.findUnique({ where: { key: ORPHAN_SETTING_KEY } });
  const dryRun = !state;
  const r = await sweepOrphanUploads({ dryRun, now });
  await prisma.setting.upsert({
    where: { key: ORPHAN_SETTING_KEY },
    create: { key: ORPHAN_SETTING_KEY, value: { firstRunAt: now.toISOString(), lastRunAt: now.toISOString(), last: { ...r, sample: undefined } } as Prisma.InputJsonValue },
    update: { value: { ...((state?.value as object) ?? {}), lastRunAt: now.toISOString(), last: { ...r, sample: undefined } } as Prisma.InputJsonValue },
  });
  if (r.orphans || r.skipped) {
    await prisma.auditLog
      .create({
        data: {
          action: r.dryRun ? 'UPLOADS_ORPHANS_DRY_RUN' : 'UPLOADS_ORPHANS_DELETED',
          target: 'uploads',
          details: { scanned: r.scanned, orphans: r.orphans, deleted: r.deleted, bytes: r.bytes, ...(r.skipped ? { skipped: r.skipped } : {}), sample: r.sample.slice(0, 10) },
        },
      })
      .catch((err) => console.error('[uploads] audit failed', err));
  }
  return r;
};

/** Baku calendar day (UTC+4, no DST) and hour of a moment. */
const baku = (d: Date) => {
  const shifted = new Date(d.getTime() + 4 * 60 * 60 * 1000);
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
};

/** Hourly tick of the nightly job: runs once per Baku day, from 03:00 Baku on. Returns null when not due. */
export const runOrphanSweepIfDue = async (now = new Date()): Promise<SweepResult | null> => {
  const { day, hour } = baku(now);
  if (hour < 3) return null;
  const state = await prisma.setting.findUnique({ where: { key: ORPHAN_SETTING_KEY } });
  const last = (state?.value as { lastRunAt?: string } | null)?.lastRunAt;
  if (last && baku(new Date(last)).day >= day) return null;
  return runOrphanSweep(now);
};
