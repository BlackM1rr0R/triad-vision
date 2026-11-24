import { typeForRequirementKey } from '../uploadAi/types.js';

/**
 * Linked case documents (pure part). A client uploads a document once: when the initial list and the embassy list
 * of the same case both ask for it (passport, photo, language certificate …), the file is attached to both
 * requirements. Two requirements "need the same document" when they belong to the two different upload stages
 * (INITIAL ↔ EMBASSY) and either carry the same template key or both keys map to the same document type
 * (PHOTO ↔ PHOTO_2, LANGUAGE_CERT ↔ GERMAN_CERT — the recogniser's REQUIREMENT_KEYS table). Requirements
 * without a key (typed by staff for one case) never match: there is nothing reliable to compare.
 */

export const LINK_STAGES = ['INITIAL', 'EMBASSY'] as const;
export type LinkStage = (typeof LINK_STAGES)[number];

export const isLinkStage = (s: string | null | undefined): s is LinkStage => s === 'INITIAL' || s === 'EMBASSY';

export interface ReqLike {
  id: string;
  stage: string;
  key: string | null;
}

/** The document type a requirement key asks for; null for no key, unknown keys and the catch-all OTHER. */
export const requirementDocType = (key: string | null | undefined): string | null => {
  const t = typeForRequirementKey(key);
  return t && t !== 'OTHER' ? t : null;
};

/** Keys that ask for a number of items: only an identical key matches them. */
const QUANTITY_KEYS = new Set(['PHOTO_2']);

/** Do the two requirements ask for the same document (one initial, one embassy)? */
export const sameDocumentNeeded = (a: ReqLike, b: ReqLike): boolean => {
  if (a.id === b.id || a.stage === b.stage || !isLinkStage(a.stage) || !isLinkStage(b.stage)) return false;
  const ka = a.key?.trim().toUpperCase() || null;
  const kb = b.key?.trim().toUpperCase() || null;
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  // Different counts of the same thing are not the same document (one photo does not fill "2 biometric photos").
  if (QUANTITY_KEYS.has(ka) || QUANTITY_KEYS.has(kb)) return false;
  const ta = requirementDocType(ka);
  return !!ta && ta === requirementDocType(kb);
};

/** The requirements of the other stage that need the same document as `source`. */
export const matchingRequirements = <R extends ReqLike>(source: ReqLike, all: readonly R[]): R[] => all.filter((r) => sameDocumentNeeded(source, r));

export interface DocLike {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  linkedFromId: string | null;
  createdAt: Date;
}

/**
 * Should a copy of `sourceId` be attached to a target requirement holding `targetDocs`? Not when the target already
 * has a copy of that very document (any status: a copy staff rejected stays rejected, the backfill never re-adds
 * it), nor when the client handled the target slot themselves (an own upload waiting or accepted there).
 */
export const shouldLinkInto = (sourceId: string, targetDocs: readonly Pick<DocLike, 'status' | 'linkedFromId'>[]): boolean => {
  if (targetDocs.some((d) => d.linkedFromId === sourceId)) return false;
  return !targetDocs.some((d) => !d.linkedFromId && d.status !== 'REJECTED');
};

/**
 * The document to link into an empty requirement (requirement created later, backfill): the newest ACCEPTED own
 * upload of the matching requirements, else (when `pending` is allowed) the newest PENDING one. Linked copies are
 * never a source (no copy of a copy).
 */
export const pickSource = <D extends DocLike>(docs: readonly D[], opts: { pending: boolean }): D | null => {
  const own = docs.filter((d) => !d.linkedFromId);
  const newest = (list: D[]) => list.reduce<D | null>((best, d) => (!best || d.createdAt > best.createdAt ? d : best), null);
  return newest(own.filter((d) => d.status === 'ACCEPTED')) ?? (opts.pending ? newest(own.filter((d) => d.status === 'PENDING')) : null);
};

/** A requirement needs a linked document when it has nothing waiting or accepted yet. */
export const needsDocument = (docs: readonly Pick<DocLike, 'status'>[]): boolean => !docs.some((d) => d.status !== 'REJECTED');

/**
 * The review a linked copy takes over from its source: accepted → accepted, rejected → rejected with the same note
 * (and marks), back to pending → pending. Null when the copy keeps its own review (staff reviewed it separately).
 */
export const followReview = (
  copy: { linkDetached: boolean },
  source: { status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; reviewNote: string | null },
): { status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; reviewNote: string | null } | null => {
  if (copy.linkDetached) return null;
  return { status: source.status, reviewNote: source.status === 'REJECTED' ? source.reviewNote : null };
};
