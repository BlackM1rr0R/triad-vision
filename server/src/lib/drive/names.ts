import path from 'node:path';
import { prisma } from '../../db.js';
import { badRequest } from '../http.js';

/** Windows reserved device names cannot be used as file or folder names (the drive must stay exportable). */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
export const MAX_NAME = 200;

/**
 * A file or folder name typed by a user. Names are only labels (files are stored under random keys),
 * but they still end up in ZIP exports and downloads, so anything a file system would choke on is refused.
 */
export const checkName = (raw: string, kind: 'FILE' | 'FOLDER' = 'FOLDER') => {
  const n = raw.normalize('NFC');
  const code = `INVALID_${kind}_NAME`;
  if (n.length === 0 || n.length > MAX_NAME) throw badRequest(code);
  if (n !== n.trim() || n === '.' || n === '..' || n.endsWith('.')) throw badRequest(code);
  // eslint-disable-next-line no-control-regex
  if (/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(n)) throw badRequest(code);
  if (RESERVED.test(n)) throw badRequest(code);
  return n;
};

/** Makes an uploaded file name storable: keeps the extension, replaces dangerous characters. */
export const safeUploadName = (original: string) => {
  const base = path.posix.basename(original.normalize('NFC').replace(/\\/g, '/'));
  // U+FFFD only appears when the client sent undecodable bytes.
  // eslint-disable-next-line no-control-regex
  let n = base.replace(/[\\/:*?"<>|\u0000-\u001f\u007f�]/g, '_').replace(/^\.+/, '').replace(/[. ]+$/, '').trim();
  if (RESERVED.test(n)) n = `_${n}`;
  if (n.length > MAX_NAME) {
    const ext = path.extname(n).slice(0, 20);
    n = n.slice(0, MAX_NAME - ext.length) + ext;
  }
  return n || 'file';
};

/** "report.final.pdf" → ["report.final", ".pdf"]; folders have no extension. */
export const splitExt = (name: string, isFile: boolean): [string, string] => {
  if (!isFile) return [name, ''];
  const ext = path.extname(name);
  return ext && ext.length < name.length ? [name.slice(0, -ext.length), ext] : [name, ''];
};

const lower = (s: string) => s.toLocaleLowerCase('en');

/** Names of live children of `parentId` (lower-cased: names are unique ignoring case, like Windows). */
export const siblingNames = async (parentId: string) => {
  const rows = await prisma.driveNode.findMany({ where: { parentId, deletedAt: null }, select: { name: true } });
  return new Set(rows.map((r) => lower(r.name)));
};

/** `name` if free in `taken`, else "name (2).ext", "name (3).ext"… The chosen name is added to `taken`. */
export const pickFreeName = (taken: Set<string>, name: string, isFile: boolean) => {
  let candidate = name;
  if (taken.has(lower(candidate))) {
    const [base, ext] = splitExt(name, isFile);
    const stem = base.replace(/ \(\d+\)$/, '');
    for (let i = 2; i < 10_000; i++) {
      candidate = `${stem.slice(0, MAX_NAME - ext.length - 8)} (${i})${ext}`;
      if (!taken.has(lower(candidate))) break;
    }
  }
  taken.add(lower(candidate));
  return candidate;
};

export const freeNameIn = async (parentId: string, name: string, isFile: boolean) => pickFreeName(await siblingNames(parentId), name, isFile);

/**
 * The live sibling with this name, ignoring case only (the database collation also ignores accents,
 * so its matches are re-checked here: "Resume" and "Résumé" may live side by side).
 */
export const findSibling = async (parentId: string, name: string, exceptId?: string) => {
  const rows = await prisma.driveNode.findMany({
    where: { parentId, name, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, kind: true, name: true },
  });
  return rows.find((r) => lower(r.name) === lower(name)) ?? null;
};
