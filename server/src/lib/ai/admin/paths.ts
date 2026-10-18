import { prisma } from '../../../db.js';
import { HttpError, badRequest, notFound } from '../../http.js';
import { foldQuery } from '../../driveIntel/normalize.js';
import { SECTIONS, SECTION_KEYS, SHARED_ROOT_NAME, sectionIds, type SectionKey } from '../../drive/roots.js';
import { nameScore, normaliseName } from '../../settlement/parse.js';
import type { AiToolContext } from '../types.js';

/**
 * Drive paths for the assistant: "Partner/İlqar/Aysel Məmmədova · Pass-Nr. C123" or a node id.
 * Matching ignores case, accents and Azerbaijani / German special letters (ə = e, ı = i, ü = u, ä = a,
 * ß = s …), so "Antrage/Arbeit" finds "Anträge/Arbeitsvisum" only when it is unique; real names are
 * always shown back.
 */

/** Folded comparison key of a name (same fold as the drive's full-text search). */
export const foldName = (s: string) => foldQuery(s.normalize('NFC'));

const ROOT_ALIASES = new Set([SHARED_ROOT_NAME, 'Firmenlaufwerk', 'root', 'drive', '~'].map(foldName));

/** Section aliases (English keys, German names, a few Azerbaijani words) → section key. */
const SECTION_ALIASES: Record<string, SectionKey> = (() => {
  const out: Record<string, SectionKey> = {};
  const add = (k: SectionKey, ...names: string[]) => names.forEach((n) => (out[foldName(n)] = k));
  for (const k of SECTION_KEYS) add(k, k, SECTIONS[k].name);
  add('cases', 'Antraege', 'müraciətlər', 'muracietler', 'applications');
  add('partners', 'partnyorlar', 'partners');
  add('staff', 'əməkdaşlar', 'emekdaslar', 'employees');
  add('templates', 'şablonlar', 'sablonlar');
  add('clients', 'bütün müştərilər', 'butun musteriler', 'all clients');
  add('tasks', 'tapşırıqlar', 'tapsiriqlar');
  return out;
})();

/** Path segments without the root name and empty parts. */
export const splitPath = (p: string) => {
  const parts = p
    .normalize('NFC')
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.');
  if (parts.length && ROOT_ALIASES.has(foldName(parts[0]))) parts.shift();
  return parts;
};

/** Looks like a node id (cuid) rather than a path. */
export const looksLikeId = (s: string) => /^c[a-z0-9]{20,32}$/.test(s.trim());

export interface Named {
  id: string;
  name: string;
}

export type SegmentMatch<T extends Named> = { match: T } | { ambiguous: T[] } | null;

/**
 * Best child for one path segment: exact name (ignoring case) → same folded name → the only child whose
 * folded name starts with / contains the segment. Several candidates = ambiguous (the caller asks).
 */
export const matchSegment = <T extends Named>(segment: string, children: T[]): SegmentMatch<T> => {
  const lower = segment.toLocaleLowerCase('en');
  const exact = children.filter((c) => c.name.toLocaleLowerCase('en') === lower);
  if (exact.length === 1) return { match: exact[0] };
  const f = foldName(segment);
  if (!f) return null;
  const folded = children.filter((c) => foldName(c.name) === f);
  if (folded.length === 1) return { match: folded[0] };
  if (folded.length > 1) return { ambiguous: folded };
  const starts = children.filter((c) => foldName(c.name).startsWith(f));
  if (starts.length === 1) return { match: starts[0] };
  if (starts.length > 1) return { ambiguous: starts };
  const contains = children.filter((c) => foldName(c.name).includes(f));
  if (contains.length === 1) return { match: contains[0] };
  if (contains.length > 1) return { ambiguous: contains };
  // Latin transliterations of Azerbaijani names (Mammadov / Məmmədov, Aliyev / Əliyev, Xalid / Khalid).
  const t = normaliseName(segment);
  if (!t) return null;
  const translit = children.filter((c) => normaliseName(c.name) === t);
  if (translit.length === 1) return { match: translit[0] };
  const within = translit.length ? translit : children.filter((c) => ` ${normaliseName(c.name)} `.includes(` ${t} `) || nameScore(segment, c.name) >= 0.8);
  if (within.length === 1) return { match: within[0] };
  if (within.length > 1) return { ambiguous: within };
  return null;
};

export class PathError extends HttpError {
  constructor(
    code: string,
    public detail: { segment: string; at: string; candidates?: string[] },
  ) {
    super(code === 'AMBIGUOUS_PATH' ? 409 : 404, code, `${code}: "${detail.segment}" in "${detail.at}"${detail.candidates ? ` (${detail.candidates.join(' | ')})` : ''}`);
  }
}

const liveChildren = (parentId: string) =>
  prisma.driveNode.findMany({ where: { parentId, deletedAt: null }, select: { id: true, name: true, kind: true }, take: 20_000 });

/**
 * Resolves an id or a path to a node id. Paths start at "Gemeinsame Dokumente" (the name may be left out);
 * the first segment may also be a section alias ("cases", "Partner", "Vorlagen" …). A path starting with
 * "./" is relative to the folder the chat was opened in.
 */
export const resolveNodeRef = async (ref: string, ctx?: AiToolContext): Promise<string> => {
  const raw = ref.trim();
  if (!raw) throw badRequest('PATH_REQUIRED');
  if (looksLikeId(raw)) return raw;
  const relative = raw.startsWith('./') && ctx?.context?.folderId;
  const parts = splitPath(relative ? raw.slice(2) : raw);
  const { sharedId, sections } = await sectionIds();
  let cur = relative ? ctx!.context!.folderId! : sharedId;
  let at = relative ? '.' : SHARED_ROOT_NAME;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    const children = await liveChildren(cur);
    let m = matchSegment(seg, children);
    if (!m && i === 0 && !relative) {
      const key = SECTION_ALIASES[foldName(seg)];
      const id = key ? sections[key] : undefined;
      const hit = id ? children.find((c) => c.id === id) : undefined;
      if (hit) m = { match: hit };
    }
    if (!m) throw new PathError('PATH_NOT_FOUND', { segment: seg, at });
    if ('ambiguous' in m) throw new PathError('AMBIGUOUS_PATH', { segment: seg, at, candidates: m.ambiguous.slice(0, 10).map((c) => c.name) });
    cur = m.match.id;
    at = `${at}/${m.match.name}`;
  }
  return cur;
};

/** Full path of a node (root first), e.g. "Gemeinsame Dokumente/Partner/İlqar". */
export const pathOf = async (nodeId: string) => {
  const names: string[] = [];
  let cur: string | null = nodeId;
  for (let i = 0; cur && i < 60; i++) {
    const n: { name: string; parentId: string | null } | null = await prisma.driveNode.findUnique({ where: { id: cur }, select: { name: true, parentId: true } });
    if (!n) break;
    names.unshift(n.name);
    cur = n.parentId;
  }
  if (!names.length) throw notFound('NODE_NOT_FOUND');
  return names.join('/');
};

/** Paths of many nodes with a shared cache of ancestors. */
export const pathsOf = async (nodeIds: string[]) => {
  const cache = new Map<string, { name: string; parentId: string | null }>();
  let pending = [...new Set(nodeIds)];
  for (let depth = 0; pending.length && depth < 60; depth++) {
    const rows = await prisma.driveNode.findMany({ where: { id: { in: pending } }, select: { id: true, name: true, parentId: true } });
    for (const r of rows) cache.set(r.id, r);
    pending = [...new Set(rows.map((r) => r.parentId).filter((p): p is string => !!p && !cache.has(p)))];
  }
  const out = new Map<string, string>();
  for (const id of nodeIds) {
    const names: string[] = [];
    let cur: string | null = id;
    for (let i = 0; cur && i < 60; i++) {
      const n = cache.get(cur);
      if (!n) break;
      names.unshift(n.name);
      cur = n.parentId;
    }
    out.set(id, names.join('/'));
  }
  return out;
};
