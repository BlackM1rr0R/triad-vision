import fs from 'node:fs/promises';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { categoryFolderName, docFilePath, STAGE_FOLDER, VISA_TYPE_FOLDER } from './cases.js';
import { cleanName, freeNameIn, safeUploadName } from './names.js';
import { ensureSection, FAMILY_FOLDER, NO_CATEGORY_FOLDER } from './roots.js';
import { copyIntoStore, removeStored } from './storage.js';
import { purgeNodes } from './trash.js';

/**
 * Real client folders in the shared workspace. Every case gets one folder ("Vorname Nachname · Pass-Nr.
 * C01234567", or "… · TV-2026-0012" while the passport number is unknown):
 *
 *   Anträge/<Visumart>/<Kategorie | Ohne Kategorie>/<client folder>     cases without a partner
 *   Partner/<Partner name>/<client folder>                              cases a referral partner brought
 *   <main applicant's folder>/Familie/<Vorname Nachname>                family-member cases
 *
 * Inside it, stage folders (Erstdokumente, Botschaftsunterlagen, …) appear when a file goes there. Accepted
 * case documents are COPIED into them as ordinary drive files (DriveNode.documentId links back): staff move,
 * rename, replace or delete them like any file; the case document itself never changes.
 *
 * All writes go through one queue, so a case created and a document accepted at the same moment never
 * produce two folders.
 */

let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

const lower = (s: string) => s.toLocaleLowerCase('en');

const caseSelect = {
  id: true,
  number: true,
  visaType: true,
  parentCaseId: true,
  driveFolderId: true,
  relation: true,
  partner: { select: { name: true } },
  visaCategory: { select: { title: true, visaLabel: true } },
  client: { select: { firstName: true, lastName: true, passportNumber: true } },
} satisfies Prisma.CaseSelect;
type CaseRow = Prisma.CaseGetPayload<{ select: typeof caseSelect }>;

/** A live folder with this name below `parentId` (ignoring case), created when missing. */
const ensureChild = async (parentId: string, name: string) => {
  const rows = await prisma.driveNode.findMany({ where: { parentId, name, kind: 'FOLDER', deletedAt: null }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
  const hit = rows.find((r) => lower(r.name) === lower(name));
  if (hit) return hit.id;
  return (await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name, parentId }, select: { id: true } })).id;
};

/** Names of live children of `parentId`, the node `exceptId` left out. */
const takenNames = async (parentId: string, exceptId?: string | null) => {
  const rows = await prisma.driveNode.findMany({ where: { parentId, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true } });
  return new Set(rows.map((r) => lower(r.name)));
};

/** Name of a family member (stored as JSON in the FAMILY_MEMBER event of the member case). */
const memberName = async (caseId: string) => {
  const ev = await prisma.caseEvent.findFirst({ where: { caseId, type: 'FAMILY_MEMBER' }, orderBy: { createdAt: 'desc' }, select: { note: true } });
  try {
    const v = JSON.parse(ev?.note ?? '') as { firstName?: unknown; lastName?: unknown };
    const n = `${typeof v.firstName === 'string' ? v.firstName : ''} ${typeof v.lastName === 'string' ? v.lastName : ''}`.trim();
    return n || null;
  } catch {
    return null;
  }
};

const RELATION_DE: Record<string, string> = { spouse: 'Ehepartner', child: 'Kind', parent: 'Elternteil' };

/**
 * The wanted name of a client folder (before collision handling): "Vorname Nachname · Pass-Nr. X",
 * "Vorname Nachname · TV-…" without a passport number; family members by their own name.
 */
export const clientFolderBaseName = (c: { number: string; client: { firstName: string; lastName: string; passportNumber: string | null } }, member?: { name: string | null; relation: string | null } | null) => {
  if (member) return cleanName(member.name ?? `${RELATION_DE[member.relation ?? ''] ?? 'Familienmitglied'} · ${c.number}`);
  const name = `${c.client.firstName} ${c.client.lastName}`.trim();
  const passport = c.client.passportNumber?.trim();
  return cleanName(passport ? `${name} · Pass-Nr. ${passport}` : `${name} · ${c.number}`);
};

/** The base name if free among the siblings, else with the case number appended, else "… (2)". */
const uniqueName = async (parentId: string, base: string, number: string, exceptId?: string | null) => {
  const taken = await takenNames(parentId, exceptId);
  if (!taken.has(lower(base))) return base;
  const withNumber = base.includes(number) ? base : cleanName(`${base} · ${number}`);
  if (!taken.has(lower(withNumber))) return withNumber;
  for (let i = 2; i < 10_000; i++) {
    const n = `${withNumber} (${i})`;
    if (!taken.has(lower(n))) return n;
  }
  return `${withNumber} (${Date.now()})`;
};

const loadCase = (caseId: string) => prisma.case.findUnique({ where: { id: caseId }, select: caseSelect });

const liveFolder = async (id: string | null) => {
  if (!id) return null;
  const n = await prisma.driveNode.findUnique({ where: { id }, select: { id: true, name: true, parentId: true, kind: true, deletedAt: true } });
  return n && !n.deletedAt && n.kind === 'FOLDER' ? n : null;
};

/** Where the client folder of a case belongs, and its wanted name. */
const canonical = async (c: CaseRow): Promise<{ parentId: string; base: string }> => {
  if (c.parentCaseId) {
    const mainFolder = await ensureFolderInner(c.parentCaseId);
    if (mainFolder) {
      return { parentId: await ensureChild(mainFolder, FAMILY_FOLDER), base: clientFolderBaseName(c, { name: await memberName(c.id), relation: c.relation }) };
    }
  }
  const base = clientFolderBaseName(c);
  // The sections are created again here when a super admin had deleted them (a client folder needs them).
  if (c.partner) return { parentId: await ensureChild(await ensureSection('partners'), cleanName(c.partner.name, 'Partner')), base };
  const typeId = await ensureChild(await ensureSection('cases'), VISA_TYPE_FOLDER[c.visaType]);
  const catName = c.visaCategory ? cleanName(categoryFolderName(c.visaCategory), NO_CATEGORY_FOLDER) : NO_CATEGORY_FOLDER;
  return { parentId: await ensureChild(typeId, catName), base };
};

const createFolder = async (c: CaseRow) => {
  const { parentId, base } = await canonical(c);
  const name = await uniqueName(parentId, base, c.number);
  const created = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name, parentId }, select: { id: true } });
  await prisma.case.update({ where: { id: c.id }, data: { driveFolderId: created.id } });
  return created.id;
};

/** The case's folder if it is alive, else a new one in the canonical place (never moves an existing one). */
const ensureFolderInner = async (caseId: string): Promise<string | null> => {
  const c = await loadCase(caseId);
  if (!c) return null;
  const folder = await liveFolder(c.driveFolderId);
  return folder ? folder.id : createFolder(c);
};

/** Creates the client folder of a case when it has none (or it was deleted). Never moves an existing folder. */
export const ensureCaseFolder = (caseId: string) => serial(() => ensureFolderInner(caseId));

/**
 * Puts the client folder where it belongs: created if missing, otherwise renamed and moved to the canonical
 * place (also when staff had moved it elsewhere — the client data wins). Files inside are never touched.
 * Call it (fire-and-forget) after a case is created or its client name, passport number, application
 * type, visa category or partner changed. Never throws.
 */
export async function syncCaseFolder(caseId: string): Promise<void> {
  await serial(async () => {
    const c = await loadCase(caseId);
    if (!c) return;
    const folder = await liveFolder(c.driveFolderId);
    if (!folder) {
      await createFolder(c);
      return;
    }
    const { parentId, base } = await canonical(c);
    const name = await uniqueName(parentId, base, c.number, folder.id);
    if (folder.parentId !== parentId || folder.name !== name) {
      await prisma.driveNode.update({ where: { id: folder.id }, data: { parentId, name } });
    }
  }).catch((err) => console.error(`[drive] client folder of case ${caseId} could not be synced`, err));
}

/**
 * The folder of a referral partner below "Partner" — created right away, even before the partner has a
 * client. After a rename (`previousName`) the old folder is renamed, so its files and client folders stay.
 * Returns the folder id (null when the partner does not exist). Never throws.
 */
export async function syncPartnerFolder(partnerId: string, opts: { previousName?: string } = {}): Promise<string | null> {
  return serial(async () => {
    const partner = await prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { name: true } });
    if (!partner) return null;
    const partnersId = await ensureSection('partners');
    const name = cleanName(partner.name, 'Partner');
    const find = async (n: string) => {
      const rows = await prisma.driveNode.findMany({ where: { parentId: partnersId, name: n, kind: 'FOLDER', deletedAt: null }, select: { id: true, name: true } });
      return rows.find((r) => lower(r.name) === lower(n)) ?? null;
    };
    const current = await find(name);
    if (current) return current.id;
    const old = opts.previousName ? await find(cleanName(opts.previousName, 'Partner')) : null;
    if (old) {
      await prisma.driveNode.update({ where: { id: old.id }, data: { name } });
      return old.id;
    }
    return ensureChild(partnersId, name);
  }).catch((err) => {
    console.error(`[drive] folder of partner ${partnerId} could not be synced`, err);
    return null;
  });
}

/** syncCaseFolder for every case of one client (after the name or passport number changed). */
export async function syncClientFolders(clientId: string): Promise<void> {
  const cases = await prisma.case.findMany({ where: { clientId }, select: { id: true, parentCaseId: true }, orderBy: { createdAt: 'asc' } }).catch(() => []);
  // Main applicants first, family members (inside the main folder) after.
  for (const c of [...cases.filter((x) => !x.parentCaseId), ...cases.filter((x) => x.parentCaseId)]) await syncCaseFolder(c.id);
}

export type CopyResult = 'copied' | 'exists' | 'missing' | 'skipped';

const copyInner = async (documentId: string): Promise<CopyResult> => {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, caseId: true, stage: true, originalName: true, storedName: true, mimeType: true, size: true, status: true, uploadedById: true },
  });
  if (!doc || doc.status !== 'ACCEPTED') return 'skipped';
  if (await prisma.driveNode.findUnique({ where: { documentId: doc.id }, select: { id: true } })) return 'exists';
  const src = docFilePath(doc.storedName);
  const stat = await fs.stat(src).catch(() => null);
  if (!stat?.isFile()) return 'missing';
  const folderId = await ensureFolderInner(doc.caseId);
  if (!folderId) return 'skipped';
  const stageId = await ensureChild(folderId, STAGE_FOLDER[doc.stage]);
  const name = await freeNameIn(stageId, safeUploadName(doc.originalName), true);
  const key = await copyIntoStore(src);
  try {
    await prisma.driveNode.create({
      data: { space: 'SHARED', kind: 'FILE', name, parentId: stageId, storageKey: key, mimeType: doc.mimeType, size: stat.size, createdById: doc.uploadedById, documentId: doc.id },
    });
  } catch (err) {
    await removeStored([key]);
    if ((err as { code?: string }).code === 'P2002') return 'exists';
    throw err;
  }
  return 'copied';
};

/**
 * Copies an ACCEPTED case document into the client folder's stage folder (idempotent: one copy per
 * document, ever — a copy staff deleted stays deleted until the bin is emptied). Never throws.
 */
export const copyDocumentToDrive = (documentId: string): Promise<CopyResult> =>
  serial(() => copyInner(documentId)).catch((err) => {
    console.error(`[drive] case document ${documentId} could not be copied into the drive`, err);
    return 'skipped' as const;
  });

/** Removes the drive copy of a case document for good (the document itself was deleted). */
export const removeDocumentCopy = async (documentId: string) => {
  const node = await prisma.driveNode.findUnique({ where: { documentId }, select: { id: true } });
  if (!node) return 0;
  return (await purgeNodes([node.id])).nodes;
};

export interface BackfillSummary {
  folders: number;
  copied: number;
  existing: number;
  missing: number;
}

const BATCH = 200;

/**
 * Creates the folders of all cases that have none and (with `docs`) copies every accepted document that
 * has no drive copy yet. Idempotent and safe to run on every start: existing folders and copies are skipped.
 */
export const backfillCaseDrive = async (opts: { docs?: boolean; log?: (line: string) => void } = {}): Promise<BackfillSummary> => {
  const s: BackfillSummary = { folders: 0, copied: 0, existing: 0, missing: 0 };
  for (const members of [false, true]) {
    let cursor: string | undefined;
    for (;;) {
      const rows = await prisma.case.findMany({
        where: { driveFolderId: null, parentCaseId: members ? { not: null } : null },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      for (const r of rows) {
        try {
          if (await ensureCaseFolder(r.id)) s.folders++;
        } catch (err) {
          console.error(`[drive] backfill: folder of case ${r.id} failed`, err);
        }
      }
      cursor = rows[rows.length - 1].id;
    }
  }
  if (opts.docs !== false) {
    const copies = await prisma.driveNode.findMany({ where: { documentId: { not: null } }, select: { documentId: true } });
    const have = new Set(copies.map((c) => c.documentId));
    let cursor: string | undefined;
    for (;;) {
      const docs = await prisma.document.findMany({
        where: { status: 'ACCEPTED' },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!docs.length) break;
      for (const d of docs) {
        if (have.has(d.id)) {
          s.existing++;
          continue;
        }
        const r = await copyDocumentToDrive(d.id);
        if (r === 'copied') s.copied++;
        else if (r === 'exists') s.existing++;
        else if (r === 'missing') s.missing++;
      }
      cursor = docs[docs.length - 1].id;
    }
  }
  if (opts.docs !== false || s.folders) opts.log?.(`[drive] case backfill: ${s.folders} folder(s) created, ${s.copied} document(s) copied, ${s.existing} already there, ${s.missing} missing on disk`);
  return s;
};
