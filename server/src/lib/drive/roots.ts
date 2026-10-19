import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { cleanName, findSibling } from './names.js';

/**
 * ONE shared workspace for the whole team ("Gemeinsame Dokumente"): every staff member (STAFF and above)
 * can open and edit everything in it — the root carries the role grant STAFF = EDIT and everything below
 * inherits it. Grants on sub-folders still work for the rare folder that should be restricted.
 *
 *   Gemeinsame Dokumente             (system root, role grant STAFF = EDIT; never deleted)
 *   ├─ Anträge                       section "cases": client folders of applications without a partner
 *   │  └─ <Visumart>/<Kategorie>/<Vorname Nachname · Pass-Nr. …>/<Stage folders>
 *   ├─ Partner                       section "partners": one folder per referral partner
 *   ├─ Mitarbeiter                   section "staff": former "My files" of each employee
 *   ├─ Vorlagen                      section "templates": templates and forms
 *   ├─ Alle Kunden                   section "clients": the auto-updated clients workbook (super admin only)
 *   └─ Aufgabendateien               section "tasks": files uploaded into tasks (lib/tasks/files.ts)
 *
 * Sections are found by a stable marker, not by name: their ids live in the Setting row `drive.sections`
 * ({ cases: id, partners: id, … }). A super admin may rename, move or delete any section; a renamed or moved
 * section keeps working, and a deleted one only comes back when something needs it (a new client folder
 * needs "Anträge", a partner needs "Partner", the clients workbook needs "Alle Kunden", …) — never by the
 * periodic layout job. A section still in the recycle bin is restored (with what was deleted together with
 * it); only a purged one is created anew. The initial layout is created once, the first time the drive is used.
 *
 * Folder names are German everywhere (the team works with German documents and authorities).
 */
export const SHARED_ROOT_NAME = 'Gemeinsame Dokumente';
/** Name of the shared root before the single-workspace layout (renamed once, see ensureSharedRoot). */
export const OLD_SHARED_ROOT_NAME = 'Firmenlaufwerk';
export const CASES_FOLDER_NAME = 'Anträge';
/** @deprecated the cases area is the "Anträge" folder inside the shared root now. */
export const CASES_ROOT_NAME = CASES_FOLDER_NAME;
export const PARTNERS_FOLDER_NAME = 'Partner';
export const STAFF_FOLDER_NAME = 'Mitarbeiter';
/** The former "In Bearbeitung" section (removed; lib/drive/layout.ts cleans up old copies). */
export const LEGACY_WORK_FOLDER_NAME = 'In Bearbeitung';
export const TEMPLATES_FOLDER_NAME = 'Vorlagen';
export const CLIENTS_FOLDER_NAME = 'Alle Kunden';
export const TASKS_FOLDER_NAME = 'Aufgabendateien';
export const NO_CATEGORY_FOLDER = 'Ohne Kategorie';
export const FAMILY_FOLDER = 'Familie';

export type SectionKey = 'cases' | 'partners' | 'staff' | 'templates' | 'clients' | 'tasks';

interface SectionDef {
  name: string;
  color: string;
  /** Part of the initial layout (created the first time the drive is used). */
  initial: boolean;
  extra?: Partial<Prisma.DriveNodeUncheckedCreateInput>;
}

export const SECTIONS: Record<SectionKey, SectionDef> = {
  cases: { name: CASES_FOLDER_NAME, color: 'violet', initial: true },
  partners: { name: PARTNERS_FOLDER_NAME, color: 'teal', initial: true },
  staff: { name: STAFF_FOLDER_NAME, color: 'blue', initial: true },
  templates: { name: TEMPLATES_FOLDER_NAME, color: 'pink', initial: true },
  // Inheritance off and no grants: only super admins see the clients workbook.
  clients: { name: CLIENTS_FOLDER_NAME, color: 'green', initial: true, extra: { inheritPermissions: false } },
  // Every staff member may download task files (every staff member can open every task).
  tasks: { name: TASKS_FOLDER_NAME, color: 'amber', initial: false, extra: { grants: { create: { role: 'STAFF', access: 'DOWNLOAD' } } } },
};
export const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];

const SETTING_KEY = 'drive.sections';
type Stored = Partial<Record<SectionKey, string>>;

export interface DriveRoots {
  sharedId: string;
  /** "Anträge" inside the shared root. */
  casesId: string;
  /** "Partner" inside the shared root. */
  partnersId: string;
  /** "Mitarbeiter" inside the shared root. */
  staffId: string;
  /** "Vorlagen": templates and forms. */
  templatesId: string;
  /** "Alle Kunden": the clients workbook (inheritance off: super admins only). */
  clientsId: string;
}

// All layout writes go through one queue, so concurrent first requests never create a section twice.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

const lower = (s: string) => s.toLocaleLowerCase('en');

const ensureSharedRootInner = async () => {
  const existing = await prisma.driveNode.findFirst({
    where: { space: 'SHARED', parentId: null, system: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
  if (!existing) {
    const created = await prisma.driveNode.create({
      data: { space: 'SHARED', kind: 'FOLDER', name: SHARED_ROOT_NAME, system: true, inheritPermissions: false, grants: { create: { role: 'STAFF', access: 'EDIT' } } },
      select: { id: true },
    });
    return created.id;
  }
  if (existing.name === OLD_SHARED_ROOT_NAME) {
    // One-time switch to the single shared workspace: everybody on the team edits everything.
    await prisma.$transaction([
      prisma.driveNode.update({ where: { id: existing.id }, data: { name: SHARED_ROOT_NAME } }),
      prisma.driveGrant.upsert({
        where: { nodeId_role: { nodeId: existing.id, role: 'STAFF' } },
        create: { nodeId: existing.id, role: 'STAFF', access: 'EDIT' },
        update: { access: 'EDIT' },
      }),
    ]);
  }
  return existing.id;
};

/** The shared root "Gemeinsame Dokumente" (created on first use). Creates no section. */
export const ensureSharedRoot = (): Promise<string> => serial(ensureSharedRootInner);

const readStored = async (): Promise<Stored | null> => {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return null;
  const v = (row.value && typeof row.value === 'object' ? row.value : {}) as Record<string, unknown>;
  const out: Stored = {};
  for (const k of SECTION_KEYS) if (typeof v[k] === 'string') out[k] = v[k] as string;
  return out;
};

const writeStored = (s: Stored) =>
  prisma.setting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: s }, update: { value: s } });

/** Ids among `ids` that are live folders. */
const liveIds = async (ids: string[]) => {
  if (!ids.length) return new Set<string>();
  const rows = await prisma.driveNode.findMany({ where: { id: { in: ids }, kind: 'FOLDER', deletedAt: null }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
};

/** A live system folder directly below the shared root carrying the section's default name (older layouts). */
const findByName = async (sharedId: string, key: SectionKey) => {
  const name = SECTIONS[key].name;
  const rows = await prisma.driveNode.findMany({ where: { parentId: sharedId, system: true, kind: 'FOLDER', name, deletedAt: null }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
  return rows.find((r) => lower(r.name) === lower(name))?.id ?? null;
};

/** The old virtual CASES root becomes the "Anträge" folder (same id, so links keep working). */
const adoptOldCasesRoot = async (sharedId: string, current: string | null) => {
  const oldRoot = await prisma.driveNode.findFirst({ where: { space: 'CASES', parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!oldRoot) return current;
  if (!current) {
    await prisma.$transaction([
      prisma.driveGrant.deleteMany({ where: { nodeId: oldRoot.id } }),
      prisma.driveNode.update({
        where: { id: oldRoot.id },
        data: { space: 'SHARED', parentId: sharedId, name: CASES_FOLDER_NAME, system: true, inheritPermissions: true, color: 'violet', deletedAt: null },
      }),
      prisma.driveNode.updateMany({ where: { space: 'CASES' }, data: { space: 'SHARED' } }),
    ]);
    return oldRoot.id;
  }
  // Both exist (should not happen): anything below the old root moves over, the old root goes.
  await prisma.driveNode.updateMany({ where: { parentId: oldRoot.id }, data: { parentId: current, space: 'SHARED' } });
  await prisma.driveNode.delete({ where: { id: oldRoot.id } }).catch(() => undefined);
  return current;
};

/** Finds (older layouts: by name) or creates the folder of a section. */
const adoptOrCreate = async (sharedId: string, key: SectionKey) => {
  let id = await findByName(sharedId, key);
  if (key === 'cases') id = await adoptOldCasesRoot(sharedId, id);
  if (id) return id;
  const def = SECTIONS[key];
  const created = await prisma.driveNode.create({
    data: { space: 'SHARED', kind: 'FOLDER', name: def.name, parentId: sharedId, system: true, color: def.color, ...def.extra },
    select: { id: true },
  });
  return created.id;
};

/**
 * The stored section ids; the first time ever (no Setting row yet) the layout is set up: sections of an
 * older layout are adopted by name, the missing initial ones are created.
 */
const storedOrInit = async (sharedId: string): Promise<Stored> => {
  const stored = await readStored();
  if (stored) return stored;
  const s: Stored = {};
  for (const key of SECTION_KEYS) {
    if (SECTIONS[key].initial) s[key] = await adoptOrCreate(sharedId, key);
    else {
      const old = await findByName(sharedId, key);
      if (old) s[key] = old;
    }
  }
  await writeStored(s);
  return s;
};

export interface SectionIds {
  sharedId: string;
  /** Live sections only (a section a super admin deleted is missing until something needs it again). */
  sections: Stored;
}

/** The shared root and the live sections. Creates the initial layout once; never re-creates a deleted section. */
export const sectionIds = (): Promise<SectionIds> =>
  serial(async () => {
    const sharedId = await ensureSharedRootInner();
    const stored = await storedOrInit(sharedId);
    const alive = await liveIds(Object.values(stored));
    const sections: Stored = {};
    for (const k of SECTION_KEYS) if (stored[k] && alive.has(stored[k]!)) sections[k] = stored[k];
    return { sharedId, sections };
  });

/** The id of a live section, without creating anything (null when missing or not set up yet). */
export const peekSection = async (key: SectionKey): Promise<string | null> => {
  const id = (await readStored())?.[key];
  if (!id) return null;
  return (await liveIds([id])).has(id) ? id : null;
};

/**
 * A section folder that sits in the recycle bin as a trash root (its parent is alive) comes back with
 * everything that was deleted together with it (same `deletedAt`), so the partner and client folders inside
 * are not lost and no second "Partner" appears next to the trashed one. A name clash with a live sibling gets
 * " (2)". Returns false when the node cannot be restored (purged, no folder, parent in the bin too).
 */
const restoreTrashedSection = async (id: string) => {
  const node = await prisma.driveNode.findUnique({ where: { id }, select: { id: true, kind: true, name: true, parentId: true, deletedAt: true, parent: { select: { deletedAt: true } } } });
  if (!node || node.kind !== 'FOLDER' || !node.deletedAt || !node.parentId || node.parent?.deletedAt) return false;
  const at = node.deletedAt;
  const ids = [node.id];
  let frontier = [node.id];
  for (let depth = 0; frontier.length && depth < 100; depth++) {
    const rows = await prisma.driveNode.findMany({ where: { parentId: { in: frontier }, deletedAt: at }, select: { id: true, kind: true } });
    ids.push(...rows.map((r) => r.id));
    frontier = rows.filter((r) => r.kind === 'FOLDER').map((r) => r.id);
  }
  const clash = await findSibling(node.parentId, node.name, node.id);
  let name = node.name;
  if (clash) {
    const taken = new Set((await prisma.driveNode.findMany({ where: { parentId: node.parentId, deletedAt: null }, select: { name: true } })).map((r) => lower(r.name)));
    for (let i = 2; taken.has(lower(name)); i++) name = `${node.name} (${i})`;
  }
  await prisma.$transaction([
    prisma.driveNode.updateMany({ where: { id: { in: ids }, deletedAt: at }, data: { deletedAt: null, deletedById: null } }),
    prisma.driveNode.update({ where: { id: node.id }, data: { name } }),
  ]);
  return true;
};

const ensureSectionInner = async (key: SectionKey) => {
  const sharedId = await ensureSharedRootInner();
  const stored = await storedOrInit(sharedId);
  const id = stored[key];
  if (id && (await liveIds([id])).has(id)) return id;
  // The section was moved to the recycle bin: bring it back instead of creating a second one.
  if (id && (await restoreTrashedSection(id))) return id;
  const fresh = await adoptOrCreate(sharedId, key);
  await writeStored({ ...stored, [key]: fresh });
  return fresh;
};

/** The folder of a section; restored from the bin or created again (below the shared root) when it is missing — call it when you need it. */
export const ensureSection = (key: SectionKey): Promise<string> => serial(() => ensureSectionInner(key));

/**
 * Shared root and every initial section, creating what is missing. Only for callers that really need all of
 * them (tests, imports); everything else uses ensureSection / sectionIds so deleted sections stay deleted.
 */
export const ensureRoots = (): Promise<DriveRoots> =>
  serial(async () => {
    const sharedId = await ensureSharedRootInner();
    return {
      sharedId,
      casesId: await ensureSectionInner('cases'),
      partnersId: await ensureSectionInner('partners'),
      staffId: await ensureSectionInner('staff'),
      templatesId: await ensureSectionInner('templates'),
      clientsId: await ensureSectionInner('clients'),
    };
  });

/** Display name of a staff member's folder below "Mitarbeiter". */
export const staffFolderName = (u: { firstName: string; lastName: string }) => cleanName(`${u.firstName} ${u.lastName}`, 'Mitarbeiter');

/**
 * "Mitarbeiter/<Vorname Nachname>" for a staff member (found by name, created on first use). Only the
 * import of old files and the one-time move of the personal spaces use it — nobody gets a private area.
 */
export const ensureStaffFolder = async (userId: string): Promise<string | null> => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, firstName: true, lastName: true } });
  if (!user || !hasMinRole(user.role, 'STAFF')) return null;
  const staffId = await ensureSection('staff');
  const name = staffFolderName(user);
  const hit = await findSibling(staffId, name);
  if (hit?.kind === 'FOLDER') return hit.id;
  const created = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name, parentId: staffId }, select: { id: true } });
  return created.id;
};

/**
 * @deprecated There is no personal space any more ("My files" was merged into the shared workspace).
 * Kept so older callers compile; it does nothing.
 */
export const ensurePersonalRoot = async (_userId: string): Promise<string | null> => null;
