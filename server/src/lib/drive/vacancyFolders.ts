import fs from 'node:fs/promises';
import path from 'node:path';
import type { Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict } from '../http.js';
import { originOf, picksOf } from '../applicationUploads.js';
import { vaultDir } from '../docCheck/index.js';
import { FILE_LABEL } from '../uploadAi/types.js';
import { createDoc, Flow, INK, MUTED, BRAND, MM } from '../cv/pdfKit.js';
import { DriveAccessCtx, requireNode } from './access.js';
import { saveFileVersion, storeBuffer } from './files.js';
import { checkName, cleanName, findSibling, freeNameIn, safeUploadName } from './names.js';
import { hashBuffer, hashFile } from './org/hash.js';
import { ensureSharedRoot } from './roots.js';
import { newStorageKey, removeStored, storagePath } from './storage.js';
import { VAULT_KIND_TYPE } from './typeFolders.js';

/**
 * Vacancy folders in the shared drive (staff only, like the whole drive):
 *
 *   <folder the admin chose for the vacancy>                       Vacancy.driveFolderId (default parent "Stellenangebote")
 *   └─ <Nachname Vorname – YYYY-MM-DD>                             one per application (VacancyApplication.driveFolderId)
 *      ├─ Bewerbung.pdf                                            application summary (re-written as a new version on re-apply)
 *      ├─ Lebenslauf.pdf                                           the candidate's CV from the CV builder (when they made one)
 *      ├─ Reisepass – scan.pdf, …                                  the files sent with the application (vault uploads / picks)
 *      └─ <Vorname Nachname · Pass-Nr. …>                          the client folder of the case, once a case is opened from it
 *
 * Application files are placed as HARD LINKS of the vault file where the file system allows it (same bytes, no
 * second copy on disk; drive files are never changed in place — new versions get new keys), else copied.
 * A staff override per application (VacancyApplication.targetFolderId) puts the applicant folder elsewhere; a
 * case created for a vacancy gets Case.driveParentId, and lib/drive/caseFolders.ts puts its client folder there.
 *
 * Nothing is created for vacancies without a folder: folders only appear when an admin links / creates one.
 */

export const VACANCY_ROOT_NAME = 'Stellenangebote';
const ROOT_SETTING = 'drive.vacancyRoot';
const lower = (s: string) => s.toLocaleLowerCase('en');

// All writes go through one queue (an application and a folder change at the same moment never make two folders).
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

// Background work tracker (tests wait for it).
const running = new Set<Promise<unknown>>();
const track = <T>(p: Promise<T>) => {
  running.add(p);
  void p.finally(() => running.delete(p)).catch(() => undefined);
  return p;
};
export const waitForVacancyFolders = async () => {
  while (running.size) await Promise.allSettled([...running]);
};

/** The folder if it is a live (not trashed) folder, else null. */
export const liveFolderId = async (id: string | null | undefined) => {
  if (!id) return null;
  const n = await prisma.driveNode.findUnique({ where: { id }, select: { id: true, kind: true, deletedAt: true } });
  return n && n.kind === 'FOLDER' && !n.deletedAt ? n.id : null;
};

// ─── Staff input ──────────────────────────────────────────────────────

export interface Actor {
  id: string;
  role: Role;
}

/** A folder the caller may put content into (EDIT); anything else 404 / 403 / 400 NOT_A_FOLDER. */
export const requireEditableFolder = async (actor: Actor, id: string) => {
  const ctx = new DriveAccessCtx({ id: actor.id, role: actor.role });
  const { node } = await requireNode(ctx, id, 'EDIT');
  if (node.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
  return node;
};

/**
 * A folder staff chose to hold something (a vacancy's applicants, one application, a case's client folder): editable
 * by the caller and not inside `notInside` (a client folder cannot go into itself). Returns the id.
 */
export const checkTargetFolder = async (actor: Actor, id: string, notInside?: string | null) => {
  const ctx = new DriveAccessCtx({ id: actor.id, role: actor.role });
  const { node } = await requireNode(ctx, id, 'EDIT');
  if (node.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
  if (notInside && ctx.chain(id).some((n) => n.id === notInside)) throw badRequest('FOLDER_INSIDE_ITSELF');
  return node.id;
};

/** "Stellenangebote" below the shared root: found by its stored id, else by name, else created. */
export const ensureVacancyRoot = (): Promise<string> =>
  serial(async () => {
    const row = await prisma.setting.findUnique({ where: { key: ROOT_SETTING } });
    const stored = (row?.value as { id?: unknown } | null)?.id;
    const live = await liveFolderId(typeof stored === 'string' ? stored : null);
    if (live) return live;
    const sharedId = await ensureSharedRoot();
    const hit = await findSibling(sharedId, VACANCY_ROOT_NAME);
    const id =
      hit?.kind === 'FOLDER'
        ? hit.id
        : (await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: await freeNameIn(sharedId, VACANCY_ROOT_NAME, false), parentId: sharedId, color: 'amber' }, select: { id: true } })).id;
    await prisma.setting.upsert({ where: { key: ROOT_SETTING }, create: { key: ROOT_SETTING, value: { id } }, update: { value: { id } } });
    return id;
  });

/**
 * Creates a folder for a vacancy: in `parentId` (must be editable by the caller) or, without one, in
 * "Stellenangebote". A live folder with that name is re-used (the admin meant that one); a file with it → 409.
 */
export const createFolder = async (actor: Actor, input: { parentId?: string | null; name: string }) => {
  const parent = input.parentId ? await requireEditableFolder(actor, input.parentId) : null;
  const parentId = parent?.id ?? (await ensureVacancyRoot());
  const name = checkName(cleanName(input.name, ''), 'FOLDER');
  const hit = await findSibling(parentId, name);
  if (hit) {
    if (hit.kind !== 'FOLDER') throw conflict('NAME_EXISTS');
    return { id: hit.id, created: false };
  }
  const created = await prisma.driveNode.create({
    data: { space: parent?.space ?? 'SHARED', ownerId: parent?.ownerId ?? null, kind: 'FOLDER', name, parentId, createdById: actor.id },
    select: { id: true },
  });
  return { id: created.id, created: true };
};

/** Default folder name of a vacancy: "<German title> – <city>". */
export const vacancyFolderName = (v: { title: unknown; city?: string | null }) => {
  const t = (v.title ?? {}) as Record<string, string | undefined>;
  const title = t.de || t.en || t.az || t.ru || 'Stelle';
  return cleanName(v.city ? `${title} – ${v.city}` : title, 'Stelle');
};

/** Profession stored on a case created for a vacancy (the vacancy's profession, else its German title). */
export const vacancyProfession = (v: { profession: string | null; title: unknown }) => {
  const t = (v.title ?? {}) as Record<string, string | undefined>;
  const p = (v.profession || t.de || t.en || t.az || t.ru || 'Worker').trim().slice(0, 120);
  return p.length >= 2 ? p : `${p} worker`;
};

// ─── Folder info for the admin UI ─────────────────────────────────────

export interface FolderInfo {
  id: string;
  name: string;
  /** "Gemeinsame Dokumente / Stellenangebote / LKW-Fahrer – Berlin" */
  path: string;
}

/** Name and path of each live folder (missing / trashed ones are left out). */
export const folderInfos = async (ids: (string | null | undefined)[]): Promise<Map<string, FolderInfo>> => {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, FolderInfo>();
  if (!want.length) return out;
  const ctx = new DriveAccessCtx({ id: 'system', role: 'SUPER_ADMIN' });
  await ctx.load(want);
  for (const id of want) {
    const chain = ctx.chain(id);
    const node = chain[chain.length - 1];
    if (!node || node.id !== id || node.kind !== 'FOLDER' || chain.some((n) => n.deletedAt)) continue;
    out.set(id, { id, name: node.name, path: chain.map((n) => n.name).join(' / ') });
  }
  return out;
};

export const folderInfo = async (id: string | null | undefined) => (id ? ((await folderInfos([id])).get(id) ?? null) : null);

// ─── Where a case's client folder goes ───────────────────────────────

/**
 * Parent folder for the client folder of a case opened for a vacancy: an explicit (already checked) override,
 * else the applicant's folder of that vacancy (so everything of the applicant stays together), else the vacancy
 * folder. Null = the usual place (Anträge / Partner).
 */
export const caseParentFor = async (input: { vacancyId?: string | null; userId?: string | null; override?: string | null }) => {
  if (input.override) return input.override;
  if (!input.vacancyId) return null;
  if (input.userId) {
    const app = await prisma.vacancyApplication.findUnique({ where: { vacancyId_userId: { vacancyId: input.vacancyId, userId: input.userId } }, select: { driveFolderId: true } });
    const own = await liveFolderId(app?.driveFolderId);
    if (own) return own;
  }
  const v = await prisma.vacancy.findUnique({ where: { id: input.vacancyId }, select: { driveFolderId: true } });
  return liveFolderId(v?.driveFolderId);
};

// ─── Applicant folder ────────────────────────────────────────────────

const day = (d: Date) => d.toISOString().slice(0, 10);

const appSelect = {
  id: true,
  status: true,
  message: true,
  matchScore: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  targetFolderId: true,
  driveFolderId: true,
  vacancy: { select: { id: true, slug: true, title: true, city: true, profession: true, driveFolderId: true, company: { select: { name: true } } } },
  user: {
    select: {
      firstName: true, lastName: true, email: true, phone: true, birthDate: true, nationality: true, city: true,
      profession: true, germanLevel: true, experienceYears: true, education: true, drivingLicence: true,
    },
  },
} as const;
type AppRow = NonNullable<Awaited<ReturnType<typeof loadApp>>>;
const loadApp = (id: string) => prisma.vacancyApplication.findUnique({ where: { id }, select: appSelect });

/** Application summary ("Bewerbung.pdf"), German like every document of the drive. */
const summaryPdf = async (a: AppRow, files: string[]) => {
  const t = (a.vacancy.title ?? {}) as Record<string, string | undefined>;
  const { pdf, fonts } = await createDoc({ title: `Bewerbung – ${a.user.lastName} ${a.user.firstName}`, lang: 'de' });
  const left = 20 * MM;
  const width = 595.28 - 40 * MM;
  const f = new Flow(pdf, fonts, { top: 841.89 - 22 * MM, bottom: 20 * MM });
  f.draw('Bewerbung', left, { size: 18, bold: true, color: BRAND });
  f.gap(22);
  f.para(`${t.de || t.en || t.az || ''}${a.vacancy.city ? ` · ${a.vacancy.city}` : ''}${a.vacancy.company ? ` · ${a.vacancy.company.name}` : ''}`, left, width, { size: 11, color: MUTED });
  f.gap(8);
  const rows: [string, string | null | undefined][] = [
    ['Name', `${a.user.firstName} ${a.user.lastName}`],
    ['E-Mail', a.user.email],
    ['Telefon', a.user.phone],
    ['Geburtsdatum', a.user.birthDate ? day(a.user.birthDate) : null],
    ['Staatsangehörigkeit', a.user.nationality],
    ['Wohnort', a.user.city],
    ['Beruf', a.user.profession],
    ['Berufserfahrung', a.user.experienceYears != null ? `${a.user.experienceYears} Jahre` : null],
    ['Deutschkenntnisse', a.user.germanLevel],
    ['Ausbildung', a.user.education],
    ['Führerschein', a.user.drivingLicence],
    ['Beworben am', day(a.createdAt)],
    ['Status', a.status],
    ['Passung', a.matchScore != null ? `${a.matchScore} %` : null],
  ];
  for (const [k, v] of rows) {
    if (!v) continue;
    f.need(16);
    f.draw(k, left, { size: 10, color: MUTED });
    f.para(String(v), left + 45 * MM, width - 45 * MM, { size: 10, color: INK });
    f.gap(2);
  }
  if (a.message) {
    f.gap(10);
    f.draw('Nachricht des Bewerbers', left, { size: 11, bold: true });
    f.gap(16);
    f.para(a.message, left, width, { size: 10 });
  }
  if (files.length) {
    f.gap(10);
    f.draw('Unterlagen', left, { size: 11, bold: true });
    f.gap(16);
    for (const n of files) f.bullet(n, left, width, { size: 10 });
  }
  return Buffer.from(await pdf.save());
};

/** Creates a file node from bytes (or replaces the content of a same-named file as a new version). */
const putFile = async (folderId: string, name: string, buf: Buffer, mime: string, userId: string | null, replace: boolean) => {
  const hit = await findSibling(folderId, name);
  if (hit?.kind === 'FILE') {
    if (!replace) return hit.id;
    const n = await prisma.driveNode.findUniqueOrThrow({ where: { id: hit.id }, select: { version: true, contentHash: true, finalAt: true } });
    if (n.finalAt || n.contentHash === hashBuffer(buf)) return hit.id;
    await saveFileVersion(hit.id, buf, mime, n.version);
    return hit.id;
  }
  const key = await storeBuffer(buf);
  try {
    const created = await prisma.driveNode.create({
      data: { space: 'SHARED', kind: 'FILE', name: await freeNameIn(folderId, name, true), parentId: folderId, storageKey: key, mimeType: mime, size: buf.length, createdById: userId, contentHash: hashBuffer(buf) },
      select: { id: true },
    });
    return created.id;
  } catch (err) {
    await removeStored([key]).catch(() => undefined);
    throw err;
  }
};

/** Same bytes under a new drive key: a hard link where possible, else a copy. */
const linkIntoStore = async (src: string) => {
  const key = newStorageKey();
  try {
    await fs.link(src, storagePath(key));
  } catch {
    await fs.copyFile(src, storagePath(key), fs.constants.COPYFILE_EXCL);
  }
  return key;
};

/** Places the files sent with the application (vault uploads + picks) once each (matched by content). */
const placeFiles = async (a: AppRow, folderId: string) => {
  const docs = (await prisma.vaultDocument.findMany({ where: { userId: a.userId }, orderBy: { createdAt: 'asc' } })).filter(
    (d) => originOf(d)?.applicationId === a.id || picksOf(d).some((p) => p.applicationId === a.id),
  );
  const have = new Set(
    (await prisma.driveNode.findMany({ where: { parentId: folderId, kind: 'FILE', deletedAt: null, contentHash: { not: null } }, select: { contentHash: true } })).map((n) => n.contentHash!),
  );
  const names: string[] = [];
  for (const d of docs) {
    const src = path.join(vaultDir(), path.basename(d.storageKey));
    const st = await fs.stat(src).catch(() => null);
    if (!st?.isFile()) continue;
    const label = FILE_LABEL[VAULT_KIND_TYPE[d.kind]];
    const fileName = safeUploadName(d.kind === 'OTHER' || !label ? d.filename : `${label} – ${d.filename}`);
    names.push(fileName);
    const hash = await hashFile(src);
    if (have.has(hash)) continue;
    const key = await linkIntoStore(src);
    try {
      await prisma.driveNode.create({
        data: { space: 'SHARED', kind: 'FILE', name: await freeNameIn(folderId, fileName, true), parentId: folderId, storageKey: key, mimeType: d.mimeType, size: st.size, createdById: a.userId, contentHash: hash },
      });
      have.add(hash);
    } catch (err) {
      await removeStored([key]).catch(() => undefined);
      throw err;
    }
  }
  return names;
};

const syncInner = async (applicationId: string, opts: { summary?: boolean }) => {
  const a = await loadApp(applicationId);
  if (!a) return null;
  const targetId = (await liveFolderId(a.targetFolderId)) ?? (await liveFolderId(a.vacancy.driveFolderId));
  if (!targetId) return null; // no folder chosen for this vacancy / application: nothing is created
  let folderId = await liveFolderId(a.driveFolderId);
  let fresh = false;
  if (!folderId) {
    const name = await freeNameIn(targetId, cleanName(`${a.user.lastName} ${a.user.firstName} – ${day(a.createdAt)}`, 'Bewerber'), false);
    folderId = (await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name, parentId: targetId }, select: { id: true } })).id;
    await prisma.vacancyApplication.update({ where: { id: a.id }, data: { driveFolderId: folderId } });
    fresh = true;
  } else {
    const node = await prisma.driveNode.findUniqueOrThrow({ where: { id: folderId }, select: { parentId: true, name: true } });
    if (node.parentId !== targetId) {
      // The folder of the vacancy / the override changed: the applicant folder moves along (files inside untouched).
      const taken = await prisma.driveNode.findMany({ where: { parentId: targetId, deletedAt: null }, select: { name: true } });
      let name = node.name;
      const set = new Set(taken.map((r) => lower(r.name)));
      for (let i = 2; set.has(lower(name)); i++) name = `${node.name} (${i})`;
      await prisma.driveNode.update({ where: { id: folderId }, data: { parentId: targetId, name } });
    }
  }
  const files = await placeFiles(a, folderId);
  if (fresh || opts.summary) await putFile(folderId, 'Bewerbung.pdf', await summaryPdf(a, files), 'application/pdf', null, true);
  if (fresh) {
    // The CV from the CV builder, when the candidate made one.
    if (await prisma.candidateCv.count({ where: { userId: a.userId } })) {
      const cv = await import('../cv/load.js').then((m) => m.buildCvPdf(a.userId, { photo: true })).catch(() => null);
      if (cv) await putFile(folderId, 'Lebenslauf.pdf', cv.pdf, 'application/pdf', a.userId, false);
    }
  }
  return folderId;
};

/**
 * Creates / moves / fills the applicant folder of an application (see the module comment). `summary` re-writes
 * "Bewerbung.pdf" (new application, re-application). Fire-and-forget: never throws, returns the folder id or null.
 */
export const syncApplicationFolder = (applicationId: string, opts: { summary?: boolean } = {}): Promise<string | null> =>
  track(
    serial(() => syncInner(applicationId, opts)).catch((err) => {
      console.error(`[drive] applicant folder of application ${applicationId} could not be synced`, err);
      return null;
    }),
  );

/** After a vacancy got (another) folder: every application of it is collected there. Fire-and-forget. */
export const syncVacancyApplications = (vacancyId: string) =>
  track(
    (async () => {
      const apps = await prisma.vacancyApplication.findMany({ where: { vacancyId, status: { not: 'WITHDRAWN' } }, select: { id: true }, orderBy: { createdAt: 'asc' } });
      for (const a of apps) await syncApplicationFolder(a.id);
    })().catch((err) => console.error(`[drive] applications of vacancy ${vacancyId} could not be synced`, err)),
  );
