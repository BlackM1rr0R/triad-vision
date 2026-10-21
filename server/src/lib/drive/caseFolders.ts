import fs from 'node:fs/promises';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { categoryFolderName, docFilePath, STAGE_FOLDER, VISA_TYPE_FOLDER } from './cases.js';
import { cleanName, freeNameIn, safeUploadName } from './names.js';
import { ensureSection, FAMILY_FOLDER, NO_CATEGORY_FOLDER, peekSection } from './roots.js';
import { copyIntoStore, removeStored } from './storage.js';
import { purgeNodes, restoreSubtree } from './trash.js';
import { hashStored } from './org/hash.js';
import { autoNameFor, caseNaming, requirementTitle } from './org/naming.js';
import { applyTemplateToCaseFolder } from './org/templates.js';

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
  visaCategoryId: true,
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
  const n = await prisma.driveNode.findUnique({ where: { id }, select: { id: true, name: true, parentId: true, kind: true, deletedAt: true, archivedAt: true } });
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
  // Sub-folders of the best matching folder template (lib/drive/org/templates.ts); never fails the folder.
  await applyTemplateToCaseFolder(c, created.id);
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
    // An archived client folder (moved to "Archiv/<Jahr>" by the retention policy) stays where it is; only its name follows.
    if (folder.archivedAt && folder.parentId) {
      const name = await uniqueName(folder.parentId, c.parentCaseId ? (await canonical(c)).base : clientFolderBaseName(c), c.number, folder.id);
      if (folder.name !== name) await prisma.driveNode.update({ where: { id: folder.id }, data: { name } });
      return;
    }
    const { parentId, base } = await canonical(c);
    const name = await uniqueName(parentId, base, c.number, folder.id);
    if (folder.parentId !== parentId || folder.name !== name) {
      await prisma.driveNode.update({ where: { id: folder.id }, data: { parentId, name } });
    }
  }).catch((err) => console.error(`[drive] client folder of case ${caseId} could not be synced`, err));
}

export interface PartnerFolderResult {
  folderId: string;
  /** The folder came back from the recycle bin (with the client folders that were deleted with it). */
  restored: boolean;
  /** A new, empty folder was created. */
  created: boolean;
}

/** Live folder below `parentId` with this name (ignoring case only). */
const liveChildFolder = async (parentId: string, name: string) => {
  const rows = await prisma.driveNode.findMany({ where: { parentId, name, kind: 'FOLDER', deletedAt: null }, select: { id: true, name: true } });
  return rows.find((r) => lower(r.name) === lower(name)) ?? null;
};

/** The newest folder with this name below `parentId` that sits in the bin (its parent is alive, so it is a trash root). */
const trashedChildFolder = async (parentId: string, name: string) => {
  const rows = await prisma.driveNode.findMany({
    where: { parentId, name, kind: 'FOLDER', deletedAt: { not: null } },
    select: { id: true, name: true, deletedAt: true },
    orderBy: { deletedAt: 'desc' },
  });
  return rows.find((r) => lower(r.name) === lower(name)) ?? null;
};

const partnerFolderInner = async (partnerId: string, opts: { previousName?: string; restore?: boolean }): Promise<PartnerFolderResult | null> => {
  const partner = await prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { name: true } });
  if (!partner) return null;
  const partnersId = await ensureSection('partners');
  const name = cleanName(partner.name, 'Partner');
  const current = await liveChildFolder(partnersId, name);
  if (current) return { folderId: current.id, restored: false, created: false };
  const old = opts.previousName ? await liveChildFolder(partnersId, cleanName(opts.previousName, 'Partner')) : null;
  if (old) {
    await prisma.driveNode.update({ where: { id: old.id }, data: { name } });
    return { folderId: old.id, restored: false, created: false };
  }
  if (opts.restore !== false) {
    // The folder was deleted in the drive: bring it back (files and client folders inside come with it).
    const trashed = await trashedChildFolder(partnersId, name);
    if (trashed?.deletedAt) {
      await restoreSubtree(trashed.id, trashed.deletedAt);
      if (trashed.name !== name) await prisma.driveNode.update({ where: { id: trashed.id }, data: { name } });
      return { folderId: trashed.id, restored: true, created: false };
    }
  }
  const created = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name, parentId: partnersId }, select: { id: true } });
  return { folderId: created.id, restored: false, created: true };
};

/**
 * The folder of a referral partner below "Partner" — created right away, even before the partner has a
 * client. After a rename (`previousName`) the old folder is renamed, so its files and client folders stay.
 * A folder that was deleted in the drive (still in the bin) is restored instead of creating an empty one.
 * Never throws (null when the partner does not exist or the drive failed).
 */
export async function ensurePartnerFolder(partnerId: string, opts: { previousName?: string; restore?: boolean } = {}): Promise<PartnerFolderResult | null> {
  return serial(() => partnerFolderInner(partnerId, opts)).catch((err) => {
    console.error(`[drive] folder of partner ${partnerId} could not be synced`, err);
    return null;
  });
}

/** ensurePartnerFolder, returning only the folder id (null when the partner does not exist). Never throws. */
export async function syncPartnerFolder(partnerId: string, opts: { previousName?: string } = {}): Promise<string | null> {
  return (await ensurePartnerFolder(partnerId, opts))?.folderId ?? null;
}

/**
 * The live folder of each partner below "Partner" (matched by name, like the drive listing), without
 * creating anything. Map partnerId → folder id; partners without a live folder are missing.
 */
export const partnerFolderIds = async (partners: { id: string; name: string }[]) => {
  const out = new Map<string, string>();
  if (!partners.length) return out;
  const partnersId = await peekSection('partners');
  if (!partnersId) return out;
  const rows = await prisma.driveNode.findMany({ where: { parentId: partnersId, kind: 'FOLDER', deletedAt: null }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
  const byName = new Map<string, string>();
  for (const r of rows) if (!byName.has(lower(r.name))) byName.set(lower(r.name), r.id);
  for (const p of partners) {
    const id = byName.get(lower(cleanName(p.name, 'Partner')));
    if (id) out.set(p.id, id);
  }
  return out;
};

/** The live folder of one partner below "Partner" (null when there is none). */
export const partnerFolderId = async (partner: { id: string; name: string }) => (await partnerFolderIds([partner])).get(partner.id) ?? null;

const SUFFIX = / \(\d+\)$/;

/**
 * After a folder directly below "Partner" was restored from the bin: when it belongs to a partner but came
 * back under another name ("Ilqar (2)", because a new "Ilqar" folder had been created meanwhile), its content
 * moves into the partner's live folder and the empty copy goes, so the partner keeps exactly one folder.
 * Returns the partner id (null when the folder is no partner folder). Never throws.
 */
export async function relinkRestoredPartnerFolder(nodeId: string): Promise<string | null> {
  return serial(async () => {
    const partnersId = await peekSection('partners');
    if (!partnersId) return null;
    const node = await prisma.driveNode.findUnique({ where: { id: nodeId }, select: { id: true, name: true, parentId: true, kind: true, deletedAt: true } });
    if (!node || node.kind !== 'FOLDER' || node.deletedAt || node.parentId !== partnersId) return null;
    const partners = await prisma.referralPartner.findMany({ select: { id: true, name: true } });
    const byName = new Map(partners.map((p) => [lower(cleanName(p.name, 'Partner')), p]));
    const partner = byName.get(lower(node.name)) ?? byName.get(lower(node.name.replace(SUFFIX, '')));
    if (!partner) return null;
    const name = cleanName(partner.name, 'Partner');
    if (lower(node.name) === lower(name)) return partner.id;
    const live = await liveChildFolder(partnersId, name);
    if (!live) {
      await prisma.driveNode.update({ where: { id: node.id }, data: { name } });
      return partner.id;
    }
    // Merge: the restored content joins the partner's folder; names that clash get " (2)".
    const children = await prisma.driveNode.findMany({ where: { parentId: node.id, deletedAt: null }, select: { id: true, name: true, kind: true } });
    const taken = await takenNames(live.id);
    for (const ch of children) {
      let n = ch.name;
      if (taken.has(lower(n))) {
        const dot = ch.kind === 'FILE' ? n.lastIndexOf('.') : -1;
        const [stem, ext] = dot > 0 ? [n.slice(0, dot), n.slice(dot)] : [n, ''];
        for (let i = 2; taken.has(lower(n)); i++) n = `${stem} (${i})${ext}`;
      }
      taken.add(lower(n));
      await prisma.driveNode.update({ where: { id: ch.id }, data: { parentId: live.id, name: n } });
    }
    const left = await prisma.driveNode.count({ where: { parentId: node.id } });
    if (left === 0) await prisma.driveNode.delete({ where: { id: node.id } });
    else await prisma.driveNode.update({ where: { id: node.id }, data: { deletedAt: new Date() } });
    return partner.id;
  }).catch((err) => {
    console.error(`[drive] restored partner folder ${nodeId} could not be relinked`, err);
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
    select: { id: true, caseId: true, stage: true, originalName: true, storedName: true, mimeType: true, size: true, status: true, uploadedById: true, createdAt: true, requirement: { select: { title: true } } },
  });
  if (!doc || doc.status !== 'ACCEPTED') return 'skipped';
  if (await prisma.driveNode.findUnique({ where: { documentId: doc.id }, select: { id: true } })) return 'exists';
  const src = docFilePath(doc.storedName);
  const stat = await fs.stat(src).catch(() => null);
  if (!stat?.isFile()) return 'missing';
  const folderId = await ensureFolderInner(doc.caseId);
  if (!folderId) return 'skipped';
  const stageId = await ensureChild(folderId, STAGE_FOLDER[doc.stage]);
  // Automatic name "<Nachname>_<Vorname>_<requirement title>_<date>.pdf" when it is switched on.
  const naming = await caseNaming(doc.caseId);
  const auto = naming ? await autoNameFor(naming, { typ: requirementTitle(doc.requirement?.title), date: doc.createdAt, originalName: doc.originalName }) : null;
  const name = await freeNameIn(stageId, auto ?? safeUploadName(doc.originalName), true);
  const key = await copyIntoStore(src);
  try {
    const contentHash = await hashStored(key);
    await prisma.driveNode.create({
      data: {
        space: 'SHARED',
        kind: 'FILE',
        name,
        parentId: stageId,
        storageKey: key,
        mimeType: doc.mimeType,
        size: stat.size,
        createdById: doc.uploadedById,
        documentId: doc.id,
        contentHash,
        // New case documents start on the workflow board in "Gələn".
        workflowStage: 'INCOMING',
        workflowAt: new Date(),
      },
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
