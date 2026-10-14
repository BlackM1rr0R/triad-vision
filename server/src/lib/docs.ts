import fs from 'node:fs/promises';
import path from 'node:path';
import type { DocAccess, DocFolder, Role } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import type { AuthUser } from '../middleware/auth.js';
import { HttpError, badRequest, conflict, notFound } from './http.js';

/**
 * Staff document workspaces. Every staff member owns one folder on disk, <DOCS_DIR>/<slug>/, and
 * files keep their real names there so the folder is usable directly on the server as well.
 * Other staff see a workspace only through a grant (VIEW < DOWNLOAD < EDIT); the super admin
 * and the owner always have EDIT.
 */

export type EffectiveAccess = DocAccess | 'OWNER';

export const ACCESS_RANK: Record<DocAccess, number> = { VIEW: 1, DOWNLOAD: 2, EDIT: 3 };
export const allows = (have: EffectiveAccess | null, need: DocAccess) =>
  have !== null && (have === 'OWNER' || ACCESS_RANK[have] >= ACCESS_RANK[need]);

// ─── Names and paths ───────────────────────────────────────────────────

const TRANSLIT: Record<string, string> = {
  ə: 'e', ı: 'i', ş: 's', ğ: 'g', ö: 'o', ü: 'u', ç: 'c', ä: 'a', ß: 'ss',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** "Nəriman" → "neriman": safe as a directory name on any file system. Workspaces are named by first name. */
export const slugify = (s: string) =>
  [...s.toLowerCase().replace(/i̇/g, 'i')]
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'user';

/** Windows reserved device names cannot be used as file or directory names. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * A single path segment (file or directory name) as typed by a user. Rejects anything that could
 * escape the workspace or break on a file system: separators, "..", control chars, leading dots.
 */
export const checkSegment = (name: string, kind: 'FILE' | 'DIR') => {
  const n = name.normalize('NFC');
  if (n.length === 0 || n.length > 150) throw badRequest(`INVALID_${kind}_NAME`);
  if (n !== n.trim() || n.startsWith('.') || n.endsWith('.')) throw badRequest(`INVALID_${kind}_NAME`);
  // eslint-disable-next-line no-control-regex
  if (/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(n)) throw badRequest(`INVALID_${kind}_NAME`);
  if (RESERVED.test(n)) throw badRequest(`INVALID_${kind}_NAME`);
  return n;
};

/** Normalises a relative directory path ("a/b/c" or "") and validates each segment. */
export const normalizePath = (p: string | undefined) => {
  if (!p) return '';
  const parts = p.replace(/\\/g, '/').split('/').filter((x) => x.length > 0);
  if (parts.length > 10) throw badRequest('PATH_TOO_DEEP');
  return parts.map((seg) => checkSegment(seg, 'DIR')).join('/');
};

/** Takes an uploaded file name and makes it storable (keeps the extension, drops dangerous chars). */
export const safeFileName = (original: string) => {
  const base = path.basename(original.normalize('NFC').replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  // U+FFFD only appears when the client sent undecodable bytes; keep the name readable.
  let n = base.replace(/[\\/:*?"<>|\u0000-\u001f\u007f�]/g, '_').replace(/^\.+/, '').trim();
  if (RESERVED.test(n)) n = `_${n}`;
  if (n.length > 150) {
    const ext = path.extname(n);
    n = n.slice(0, 150 - ext.length) + ext;
  }
  return n || 'file';
};

export const folderDir = (folder: Pick<DocFolder, 'slug'>) => path.join(config.docs.dir, folder.slug);

/** Absolute path inside a workspace; the resolved path is asserted to stay under the workspace root. */
export const absPath = (folder: Pick<DocFolder, 'slug'>, rel: string, name = '') => {
  const root = folderDir(folder);
  const full = path.resolve(root, rel, name);
  if (full !== root && !full.startsWith(root + path.sep)) throw badRequest('INVALID_PATH');
  return full;
};

// ─── Folders and access ────────────────────────────────────────────────

const STAFF_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];

/** Returns the user's workspace, creating it (and its directory) on first use. */
export const ensureFolder = async (userId: string) => {
  const existing = await prisma.docFolder.findUnique({ where: { ownerId: userId } });
  if (existing) {
    await fs.mkdir(folderDir(existing), { recursive: true });
    if (!(await dirExists(existing, config.docs.rootDir))) await ensureDir(existing, config.docs.rootDir);
    return existing;
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!STAFF_ROLES.includes(user.role)) throw badRequest('NOT_STAFF');
  // First name only (as in /docs/tofig/…); the surname is appended only when two people share a first name.
  const base = slugify(user.firstName);
  const alt = slugify(`${user.firstName} ${user.lastName}`);
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : i === 1 && alt !== base ? alt : `${base}-${i + 1}`;
    try {
      const folder = await prisma.docFolder.create({ data: { ownerId: userId, slug } });
      await fs.mkdir(folderDir(folder), { recursive: true });
      await ensureDir(folder, config.docs.rootDir);
      return folder;
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      // Slug taken (or created concurrently for this user): retry / return the concurrent one.
      const again = await prisma.docFolder.findUnique({ where: { ownerId: userId } });
      if (again) return again;
    }
  }
  throw conflict('FOLDER_SLUG_RACE');
};

/** Creates workspaces for staff members who do not have one yet (super admin overview). */
export const ensureAllStaffFolders = async () => {
  const missing = await prisma.user.findMany({
    where: { role: { in: STAFF_ROLES }, docFolder: null },
    select: { id: true },
  });
  for (const u of missing) await ensureFolder(u.id);
};

/** What `user` may do in `folder`, or null when the folder must look like it does not exist. */
export const accessFor = async (folder: DocFolder, user: AuthUser): Promise<EffectiveAccess | null> => {
  if (user.role === 'SUPER_ADMIN' || folder.ownerId === user.id) return 'OWNER';
  const grant = await prisma.docGrant.findUnique({ where: { folderId_userId: { folderId: folder.id, userId: user.id } } });
  return grant?.access ?? null;
};

/** Loads a folder and asserts the caller has at least `need`; unknown or inaccessible → 404. */
export const loadFolder = async (folderId: string, user: AuthUser, need: DocAccess) => {
  const folder = await prisma.docFolder.findUnique({ where: { id: folderId }, include: { owner: { select: ownerSelect } } });
  if (!folder) throw notFound('FOLDER_NOT_FOUND');
  const access = await accessFor(folder, user);
  if (access === null) throw notFound('FOLDER_NOT_FOUND');
  if (!allows(access, need)) throw new HttpError(403, 'INSUFFICIENT_ACCESS');
  return { folder, access };
};

export const ownerSelect = { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true } as const;

/** Every workspace the user can open, with the effective access level. */
export const listFolders = async (user: AuthUser) => {
  if (user.role === 'SUPER_ADMIN') await ensureAllStaffFolders();
  else await ensureFolder(user.id);

  const where =
    user.role === 'SUPER_ADMIN'
      ? {}
      : { OR: [{ ownerId: user.id }, { grants: { some: { userId: user.id } } }] };
  const folders = await prisma.docFolder.findMany({
    where,
    include: {
      owner: { select: ownerSelect },
      grants: { where: { userId: user.id }, select: { access: true } },
      _count: { select: { files: true } },
    },
    orderBy: { owner: { firstName: 'asc' } },
  });
  const sizes = await prisma.docFile.groupBy({ by: ['folderId'], _sum: { size: true }, _max: { updatedAt: true }, where: { folderId: { in: folders.map((f) => f.id) } } });
  const sizeOf = new Map(sizes.map((s) => [s.folderId, s._sum.size ?? 0]));
  const lastOf = new Map(sizes.map((s) => [s.folderId, s._max.updatedAt ?? null]));
  return folders.map((f) => ({
    id: f.id,
    slug: f.slug,
    owner: f.owner,
    access: (user.role === 'SUPER_ADMIN' || f.ownerId === user.id ? 'OWNER' : f.grants[0]?.access ?? 'VIEW') as EffectiveAccess,
    fileCount: f._count.files,
    totalSize: sizeOf.get(f.id) ?? 0,
    lastUploadAt: lastOf.get(f.id) ?? null,
    createdAt: f.createdAt,
  }));
};

// ─── Directory helpers ─────────────────────────────────────────────────

/** Makes sure `rel` and all its parents exist on disk and in the DocDir table. */
export const ensureDir = async (folder: DocFolder, rel: string) => {
  if (!rel) return;
  const parts = rel.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const p = parts.slice(0, i).join('/');
    await prisma.docDir.upsert({ where: { folderId_path: { folderId: folder.id, path: p } }, create: { folderId: folder.id, path: p }, update: {} });
  }
  await fs.mkdir(absPath(folder, rel), { recursive: true });
};

export const dirExists = async (folder: DocFolder, rel: string) =>
  rel === '' || (await prisma.docDir.count({ where: { folderId: folder.id, path: rel } })) > 0;

export const childPrefix = (rel: string) => (rel ? `${rel}/` : '');

// ─── Companies: <workspace>/senedleri/<company>/senedler ───────────────

export const companyPath = (name: string) => `${config.docs.rootDir}/${name}`;
export const companyDocsPath = (name: string) => `${config.docs.rootDir}/${name}/${config.docs.companyDocsDir}`;

/** Company folders of a workspace (direct children of the root dir) with their document counts. */
export const listCompanies = async (folder: DocFolder) => {
  const prefix = `${config.docs.rootDir}/`;
  const dirs = await prisma.docDir.findMany({ where: { folderId: folder.id, path: { startsWith: prefix } }, orderBy: { path: 'asc' } });
  const companies = dirs.filter((d) => !d.path.slice(prefix.length).includes('/'));
  if (!companies.length) return [];
  const files = await prisma.docFile.findMany({ where: { folderId: folder.id, path: { startsWith: prefix } }, select: { path: true, size: true, updatedAt: true } });
  return companies.map((d) => {
    const own = files.filter((f) => f.path === d.path || f.path.startsWith(`${d.path}/`));
    return {
      name: d.path.slice(prefix.length),
      path: d.path,
      docsPath: `${d.path}/${config.docs.companyDocsDir}`,
      files: own.length,
      bytes: own.reduce((a, f) => a + f.size, 0),
      lastUploadAt: own.reduce<Date | null>((m, f) => (!m || f.updatedAt > m ? f.updatedAt : m), null),
      createdAt: d.createdAt,
    };
  });
};

/** Creates <root>/<company>/<docs> (both levels); returns the company entry. */
export const createCompany = async (folder: DocFolder, name: string) => {
  const safe = checkSegment(name, 'DIR');
  if (await dirExists(folder, companyPath(safe))) throw conflict('DIR_EXISTS');
  await ensureDir(folder, companyDocsPath(safe));
  return { name: safe, path: companyPath(safe), docsPath: companyDocsPath(safe) };
};
