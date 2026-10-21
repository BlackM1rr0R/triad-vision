import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../audit.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { collectSubtree } from '../drive/items.js';
import { freeNameIn } from '../drive/names.js';
import { ensureSharedRoot } from '../drive/roots.js';
import { getRetentionSettings } from '../legalSettings.js';
import { notifyUser } from '../notifications.js';

/**
 * DSGVO retention for the client folders in the shared drive (the case documents themselves are handled
 * by jobs/retention.ts). Once a case (main applicant; family members live inside its folder) has been
 * closed for N months its client folder moves to "Gemeinsame Dokumente/Archiv/<year closed>/" and gets
 * `archivedAt`; after M months it goes to the recycle bin (the bin's own purge deletes it for good later).
 * ADMIN+ are warned 30 and 7 days before. Folders marked Final, folders containing Final files (purge only)
 * and folders on the legal-hold list are never touched.
 */

const DAY = 24 * 60 * 60 * 1000;

export const DRIVE_RETENTION_DEFAULTS = { archiveMonths: 6, deleteMonths: 36 };
const SETTINGS_KEY = 'retentionDrive';
const HOLD_KEY = 'retentionDrive.legalHold';
const WARNED_KEY = 'retentionDrive.warned';
const ARCHIVE_KEY = 'drive.archiveFolder';
export const ARCHIVE_FOLDER_NAME = 'Archiv';
export const WARN_DAYS = [30, 7] as const;

export const driveRetentionSchema = z
  .object({
    archiveMonths: z.number().int().min(1).max(120),
    deleteMonths: z.number().int().min(2).max(240),
  })
  .refine((v) => v.deleteMonths > v.archiveMonths, { message: 'DELETE_BEFORE_ARCHIVE', path: ['deleteMonths'] });
export type DriveRetentionSettings = z.infer<typeof driveRetentionSchema>;

export const getDriveRetentionSettings = async (): Promise<DriveRetentionSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
  const parsed = driveRetentionSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : { ...DRIVE_RETENTION_DEFAULTS };
};

export const setDriveRetentionSettings = async (s: DriveRetentionSettings) => {
  await prisma.setting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: s }, update: { value: s } });
  return s;
};

const readList = async (key: string): Promise<string[]> => {
  const row = await prisma.setting.findUnique({ where: { key } });
  return Array.isArray(row?.value) ? (row!.value as unknown[]).filter((v): v is string => typeof v === 'string') : [];
};

export const getLegalHolds = () => readList(HOLD_KEY);

export const setLegalHold = async (folderId: string, hold: boolean) => {
  const set = new Set(await getLegalHolds());
  if (hold) set.add(folderId);
  else set.delete(folderId);
  const value = [...set];
  await prisma.setting.upsert({ where: { key: HOLD_KEY }, create: { key: HOLD_KEY, value }, update: { value } });
  return value;
};

/** Calendar months after `d` (end-of-month safe). */
export const addMonths = (d: Date, months: number) => {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
};

export interface RetentionItem {
  caseId: string;
  caseNumber: string;
  clientName: string;
  folderId: string;
  folderName: string;
  closedAt: Date;
  archiveAt: Date;
  purgeAt: Date;
  archivedAt: Date | null;
  deleted: boolean;
  legalHold: boolean;
  final: boolean;
  /** Final files somewhere inside (blocks the purge). */
  finalInside: boolean;
  daysToPurge: number;
}

/** Closed main cases with a client folder, with their archive / purge dates and the blocking flags. */
const candidates = async (now: Date, settings: DriveRetentionSettings) => {
  const cases = await prisma.case.findMany({
    where: { status: { in: FINAL_STATUSES }, closedAt: { not: null }, parentCaseId: null, driveFolderId: { not: null } },
    select: {
      id: true,
      number: true,
      closedAt: true,
      driveFolderId: true,
      client: { select: { firstName: true, lastName: true } },
      familyMembers: { select: { closedAt: true } },
    },
    orderBy: { closedAt: 'asc' },
    take: 5000,
  });
  const usable = cases.filter((c) => c.familyMembers.every((m) => m.closedAt));
  const folderIds = usable.map((c) => c.driveFolderId!);
  const [folders, holds] = await Promise.all([
    prisma.driveNode.findMany({ where: { id: { in: folderIds }, kind: 'FOLDER' }, select: { id: true, name: true, archivedAt: true, deletedAt: true, finalAt: true } }),
    getLegalHolds(),
  ]);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const hold = new Set(holds);
  const out: RetentionItem[] = [];
  for (const c of usable) {
    const f = byId.get(c.driveFolderId!);
    if (!f) continue;
    const purgeAt = addMonths(c.closedAt!, settings.deleteMonths);
    out.push({
      caseId: c.id,
      caseNumber: c.number,
      clientName: `${c.client.firstName} ${c.client.lastName}`.trim(),
      folderId: f.id,
      folderName: f.name,
      closedAt: c.closedAt!,
      archiveAt: addMonths(c.closedAt!, settings.archiveMonths),
      purgeAt,
      archivedAt: f.archivedAt,
      deleted: !!f.deletedAt,
      legalHold: hold.has(f.id),
      final: !!f.finalAt,
      finalInside: false,
      daysToPurge: Math.ceil((purgeAt.getTime() - now.getTime()) / DAY),
    });
  }
  return out;
};

const hasFinalInside = async (folderId: string) => {
  const nodes = await collectSubtree([folderId], { finalAt: true });
  return nodes.some((n) => n.id !== folderId && !!(n as { finalAt: Date | null }).finalAt);
};

/** Folders a retention purge already moved to the bin (restored by hand afterwards → never purged again). */
const purgedBefore = async (folderIds: string[]) => {
  if (!folderIds.length) return new Set<string>();
  const rows = await prisma.auditLog.findMany({ where: { action: 'DRIVE_RETENTION_PURGE', target: { in: folderIds.map((id) => `drive:${id}`) } }, select: { target: true } });
  return new Set(rows.map((r) => r.target!.slice('drive:'.length)));
};

/** "Gemeinsame Dokumente/Archiv" (system folder, id remembered in Setting) and its year folder. */
export const ensureArchiveYearFolder = async (year: number) => {
  const sharedId = await ensureSharedRoot();
  const stored = await prisma.setting.findUnique({ where: { key: ARCHIVE_KEY } });
  let archiveId = typeof (stored?.value as { id?: unknown } | null)?.id === 'string' ? (stored!.value as { id: string }).id : null;
  if (archiveId) {
    const live = await prisma.driveNode.findFirst({ where: { id: archiveId, deletedAt: null, kind: 'FOLDER' }, select: { id: true } });
    if (!live) archiveId = null;
  }
  if (!archiveId) {
    const byName = await prisma.driveNode.findFirst({ where: { parentId: sharedId, name: ARCHIVE_FOLDER_NAME, kind: 'FOLDER', deletedAt: null }, select: { id: true } });
    archiveId = byName?.id ?? (await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: ARCHIVE_FOLDER_NAME, parentId: sharedId, system: true, color: 'slate' }, select: { id: true } })).id;
    await prisma.setting.upsert({ where: { key: ARCHIVE_KEY }, create: { key: ARCHIVE_KEY, value: { id: archiveId } }, update: { value: { id: archiveId } } });
  }
  const yearName = String(year);
  const hit = await prisma.driveNode.findFirst({ where: { parentId: archiveId, name: yearName, kind: 'FOLDER', deletedAt: null }, select: { id: true } });
  return hit?.id ?? (await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: yearName, parentId: archiveId }, select: { id: true } })).id;
};

const archiveFolder = async (item: RetentionItem, now: Date) => {
  const parentId = await ensureArchiveYearFolder(item.closedAt.getUTCFullYear());
  const name = await freeNameIn(parentId, item.folderName, false);
  await prisma.driveNode.update({ where: { id: item.folderId }, data: { parentId, name, archivedAt: now } });
};

/** Moves the folder and its live subtree to the recycle bin (deleted by the system, not by a user). */
const trashFolder = async (folderId: string, now: Date) => {
  const ids = (await collectSubtree([folderId], { id: true })).map((n) => n.id);
  const res = await prisma.driveNode.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: now, deletedById: null } });
  return res.count;
};

type Warned = Record<string, number[]>;
const readWarned = async (): Promise<Warned> => {
  const row = await prisma.setting.findUnique({ where: { key: WARNED_KEY } });
  return row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? (row.value as Warned) : {};
};

const fmt = (d: Date) => d.toISOString().slice(0, 10);

const notifyAdmins = async (threshold: number, items: RetentionItem[]) => {
  const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true, locale: true } });
  const list = items.map((i) => `• ${i.clientName} · ${i.caseNumber} — ${fmt(i.purgeAt)}`).join('\n');
  const title: Record<string, string> = {
    az: `Saxlama müddəti: ${items.length} müştəri qovluğu ${threshold} gün ərzində silinəcək`,
    de: `Aufbewahrung: ${items.length} Kundenordner werden in ${threshold} Tagen gelöscht`,
    en: `Retention: ${items.length} client folder(s) will be deleted within ${threshold} days`,
    ru: `Срок хранения: ${items.length} папок клиентов будут удалены через ${threshold} дн.`,
  };
  const intro: Record<string, string> = {
    az: 'Aşağıdakı qovluqlar zibil qutusuna köçürüləcək. Saxlamaq lazımdırsa, "Saxla (legal hold)" seçin.',
    de: 'Diese Ordner werden in den Papierkorb verschoben. Zum Aufbewahren "Legal Hold" setzen.',
    en: 'These folders will be moved to the recycle bin. Set "legal hold" to keep one.',
    ru: 'Эти папки будут перемещены в корзину. Чтобы сохранить папку, включите «legal hold».',
  };
  for (const a of admins) {
    await notifyUser(a.id, { type: 'DRIVE_RETENTION_WARNING', title: title[a.locale] ?? title.az, body: `${intro[a.locale] ?? intro.az}\n\n${list}`, link: '/admin/storage#retention', email: false });
  }
};

export interface DriveRetentionRun {
  archived: number;
  purged: number;
  warned: number;
  skipped: number;
  failed: number;
}

/** The daily run: archive, warn, purge. Idempotent. */
export const runDriveRetention = async (now = new Date()): Promise<DriveRetentionRun> => {
  const settings = await getDriveRetentionSettings();
  const items = await candidates(now, settings);
  const result: DriveRetentionRun = { archived: 0, purged: 0, warned: 0, skipped: 0, failed: 0 };
  const live = items.filter((i) => !i.deleted);
  const blocked = (i: RetentionItem) => i.legalHold || i.final;

  // 1. Archive
  for (const i of live) {
    if (i.archivedAt || i.archiveAt > now || i.purgeAt <= now) continue;
    if (blocked(i)) {
      result.skipped++;
      continue;
    }
    try {
      await archiveFolder(i, now);
      result.archived++;
      await audit({ user: undefined, ip: undefined }, 'DRIVE_RETENTION_ARCHIVE', `drive:${i.folderId}`, { caseId: i.caseId, caseNumber: i.caseNumber, months: settings.archiveMonths });
    } catch (err) {
      result.failed++;
      console.error(`[retention-drive] archive of ${i.caseNumber} failed`, err);
    }
  }

  // 2. Purge
  const due = live.filter((i) => i.purgeAt <= now);
  const already = await purgedBefore(due.map((i) => i.folderId));
  for (const i of due) {
    if (blocked(i) || already.has(i.folderId) || (await hasFinalInside(i.folderId))) {
      result.skipped++;
      continue;
    }
    try {
      const nodes = await trashFolder(i.folderId, now);
      result.purged++;
      await audit({ user: undefined, ip: undefined }, 'DRIVE_RETENTION_PURGE', `drive:${i.folderId}`, { caseId: i.caseId, caseNumber: i.caseNumber, months: settings.deleteMonths, nodes });
    } catch (err) {
      result.failed++;
      console.error(`[retention-drive] purge of ${i.caseNumber} failed`, err);
    }
  }

  // 3. Warnings 30 / 7 days before the purge
  const warned = await readWarned();
  const groups = new Map<number, RetentionItem[]>();
  for (const i of live) {
    if (i.purgeAt <= now || blocked(i) || already.has(i.folderId)) continue;
    const threshold = WARN_DAYS.filter((d) => i.daysToPurge <= d).sort((a, b) => a - b)[0];
    if (!threshold || warned[i.folderId]?.includes(threshold)) continue;
    groups.set(threshold, [...(groups.get(threshold) ?? []), i]);
    warned[i.folderId] = [...(warned[i.folderId] ?? []), threshold, ...(threshold === 7 ? [30] : [])];
  }
  for (const [threshold, list] of groups) {
    await notifyAdmins(threshold, list);
    result.warned += list.length;
  }
  // Forget folders that are gone or no longer candidates.
  const keep = new Set(live.filter((i) => i.purgeAt > now).map((i) => i.folderId));
  for (const id of Object.keys(warned)) if (!keep.has(id)) delete warned[id];
  await prisma.setting.upsert({ where: { key: WARNED_KEY }, create: { key: WARNED_KEY, value: warned }, update: { value: warned } });

  return result;
};

/** Dry run for Admin: what will be archived / deleted within `days` (default 30), with the reasons it would be skipped. */
export const previewDriveRetention = async (now = new Date(), days = 30) => {
  const settings = await getDriveRetentionSettings();
  const caseDocs = await getRetentionSettings();
  const items = await candidates(now, settings);
  const horizon = new Date(now.getTime() + days * DAY);
  const live = items.filter((i) => !i.deleted);
  const purge = live.filter((i) => i.purgeAt <= horizon);
  const already = await purgedBefore(purge.map((i) => i.folderId));
  for (const i of purge) i.finalInside = await hasFinalInside(i.folderId);
  const reason = (i: RetentionItem, forPurge: boolean) =>
    i.legalHold ? 'LEGAL_HOLD' : i.final ? 'FINAL' : forPurge && i.finalInside ? 'FINAL_INSIDE' : forPurge && already.has(i.folderId) ? 'RESTORED_AFTER_PURGE' : null;
  const row = (i: RetentionItem, forPurge: boolean) => ({ ...i, skipReason: reason(i, forPurge) });
  return {
    settings,
    caseDocuments: { months: caseDocs.months, includeMessages: caseDocs.includeMessages },
    days,
    archive: live.filter((i) => !i.archivedAt && i.archiveAt <= horizon && i.purgeAt > now).map((i) => row(i, false)),
    purge: purge.map((i) => row(i, true)),
    archivedTotal: live.filter((i) => i.archivedAt).length,
    legalHolds: (await getLegalHolds()).length,
  };
};
