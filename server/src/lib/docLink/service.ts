import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Prisma, type DocStage } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { followReview, isLinkStage, matchingRequirements, needsDocument, pickSource, shouldLinkInto } from './match.js';

/**
 * Linked case documents: a document the initial list and the embassy list of one case both ask for is uploaded
 * once and attached to both requirements (rules in ./match.ts).
 *
 * Storage model: the linked copy is a Document row of its own with its OWN stored file (a byte copy under a new
 * random name; Document.storedName is unique). Deleting either row removes only its own file, so a shared file is
 * never deleted twice or pulled from under the other row. The copy points back to its source (linkedFromId,
 * linkedFromStage) for the "added automatically" chip, follows the source's review (syncLinkedReview) unless staff
 * reviewed the copy on its own (linkDetached), and gets no second file in the drive client folder
 * (drive/caseFolders copyInner skips a copy whose source is not rejected).
 *
 * Case status and hand-in rules are untouched: a linked embassy document simply counts as uploaded for its
 * requirement; the embassy hand-in still happens in its own step. Every function here never throws and does
 * nothing while staff "view as client" (impersonation is read-only).
 */

const filePath = (storedName: string) => path.join(config.uploads.privateDir, path.basename(storedName));
const newStoredName = (old: string) =>
  `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${path.extname(old).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8)}`;

const SOURCE_SELECT = {
  id: true,
  caseId: true,
  requirementId: true,
  stage: true,
  originalName: true,
  storedName: true,
  mimeType: true,
  size: true,
  status: true,
  reviewNote: true,
  reviewMarks: true,
  ocr: true,
  ocrAt: true,
  checks: true,
  checkedAt: true,
  expiresAt: true,
  photoCheck: true,
  uploadedById: true,
  linkedFromId: true,
  createdAt: true,
} satisfies Prisma.DocumentSelect;
type SourceDoc = Prisma.DocumentGetPayload<{ select: typeof SOURCE_SELECT }>;

const REQ_SELECT = {
  id: true,
  stage: true,
  key: true,
  documents: { select: { id: true, status: true, linkedFromId: true, createdAt: true } },
} satisfies Prisma.DocumentRequirementSelect;

const json = (v: Prisma.JsonValue | null): Prisma.InputJsonValue | undefined => (v === null ? undefined : (v as Prisma.InputJsonValue));

/** Calls on the same case run one after the other (upload, review and requirement creation can overlap). */
const chains = new Map<string, Promise<unknown>>();
const perCase = <T>(caseId: string, fn: () => Promise<T>): Promise<T> => {
  const next = (chains.get(caseId) ?? Promise.resolve()).catch(() => undefined).then(fn);
  const tail = next.catch(() => undefined);
  chains.set(caseId, tail);
  void tail.then(() => {
    if (chains.get(caseId) === tail) chains.delete(caseId);
  });
  return next;
};

/** Creates the linked copy of `src` for `target` (file copied first). Null when the source file is gone. */
const createCopy = async (src: SourceDoc, target: { id: string; stage: string }): Promise<string | null> => {
  const storedName = newStoredName(src.storedName);
  try {
    await fs.copyFile(filePath(src.storedName), filePath(storedName));
  } catch {
    return null;
  }
  try {
    const rejected = src.status === 'REJECTED';
    const doc = await prisma.document.create({
      data: {
        caseId: src.caseId,
        requirementId: target.id,
        stage: target.stage as DocStage,
        originalName: src.originalName,
        storedName,
        mimeType: src.mimeType,
        size: src.size,
        status: src.status,
        reviewNote: rejected ? src.reviewNote : null,
        reviewMarks: rejected ? json(src.reviewMarks) : undefined,
        // Same file: the automatic check, OCR and photo results are the same too (no second OCR / AI run needed).
        ocr: json(src.ocr),
        ocrAt: src.ocrAt,
        checks: json(src.checks),
        checkedAt: src.checkedAt,
        expiresAt: src.expiresAt,
        photoCheck: json(src.photoCheck),
        uploadedById: src.uploadedById,
        linkedFromId: src.id,
        linkedFromStage: src.stage,
      },
      select: { id: true },
    });
    return doc.id;
  } catch (err) {
    await fs.unlink(filePath(storedName)).catch(() => undefined);
    throw err;
  }
};

/** Internal case event (staff timeline only): which file was attached to the other list. */
const logLinked = async (src: Pick<SourceDoc, 'caseId' | 'originalName' | 'stage'>, count: number, actorId: string | null) => {
  if (!count) return;
  const to = src.stage === 'INITIAL' ? 'Səfirlik sənədləri' : 'İlkin sənədlər';
  await prisma.caseEvent
    .create({ data: { caseId: src.caseId, type: 'DOCUMENT_LINKED', note: `${src.originalName} → ${to}`.slice(0, 1000), actorId, visibleToClient: false } })
    .catch(() => undefined);
};

const caseRequirements = (caseId: string) =>
  prisma.documentRequirement.findMany({ where: { caseId, stage: { in: ['INITIAL', 'EMBASSY'] } }, select: REQ_SELECT, orderBy: { sortOrder: 'asc' } });

/**
 * A document was uploaded for a requirement (client, staff, vault, scan, upload link …): the same file is attached to
 * every matching requirement of the other stage that the client has not handled on their own. Whether that stage
 * is open yet does not matter (the embassy list exists early). Returns the number of copies made.
 */
export const linkUploadedDocument = async (documentId: string, opts: { actorId?: string | null } = {}): Promise<number> => {
  if (isImpersonating()) return 0;
  try {
    const head = await prisma.document.findUnique({ where: { id: documentId }, select: { caseId: true } });
    if (!head) return 0;
    return await perCase(head.caseId, async () => {
      const src = await prisma.document.findUnique({ where: { id: documentId }, select: SOURCE_SELECT });
      if (!src || src.linkedFromId || !src.requirementId || !isLinkStage(src.stage) || src.status === 'REJECTED') return 0;
      const reqs = await caseRequirements(src.caseId);
      const source = reqs.find((r) => r.id === src.requirementId);
      if (!source) return 0;
      let n = 0;
      for (const target of matchingRequirements(source, reqs)) {
        if (!shouldLinkInto(src.id, target.documents)) continue;
        if (await createCopy(src, target)) n++;
      }
      await logLinked(src, n, opts.actorId ?? null);
      return n;
    });
  } catch (err) {
    console.error(`[doc-link] document ${documentId} could not be linked`, err);
    return 0;
  }
};

/**
 * Fills the requirements of a case that have no document yet with the newest matching document of the other stage
 * (accepted first; with `pending`, else the newest one waiting for review). Used right after requirements are
 * created (embassy list at the embassy step / early, staff adds one) and by the backfill. Idempotent.
 */
export const linkCaseRequirements = async (caseId: string, opts: { pending?: boolean; actorId?: string | null } = {}): Promise<number> => {
  if (isImpersonating()) return 0;
  try {
    return await perCase(caseId, async () => {
      const reqs = await caseRequirements(caseId);
      if (!reqs.some((r) => r.stage === 'INITIAL') || !reqs.some((r) => r.stage === 'EMBASSY')) return 0;
      let n = 0;
      for (const target of reqs) {
        if (!needsDocument(target.documents)) continue;
        const candidates = matchingRequirements(target, reqs).flatMap((r) => r.documents);
        const pick = pickSource(candidates, { pending: opts.pending ?? true });
        if (!pick || !shouldLinkInto(pick.id, target.documents)) continue;
        const src = await prisma.document.findUnique({ where: { id: pick.id }, select: SOURCE_SELECT });
        if (!src || src.linkedFromId || src.status === 'REJECTED') continue;
        if (await createCopy(src, target)) {
          n++;
          await logLinked(src, 1, opts.actorId ?? null);
        }
      }
      return n;
    });
  } catch (err) {
    console.error(`[doc-link] requirements of case ${caseId} could not be linked`, err);
    return 0;
  }
};

/**
 * Staff reviewed a document. A source passes its review on to its linked copies (accepted → accepted; rejected →
 * rejected with the same note and marks; back to pending → pending) unless staff reviewed a copy separately. A
 * linked copy reviewed on its own keeps its own review from now on. Returns the ids of the copies that changed.
 */
export const syncLinkedReview = async (documentId: string): Promise<string[]> => {
  if (isImpersonating()) return [];
  try {
    const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true, status: true, reviewNote: true, reviewMarks: true, linkedFromId: true } });
    if (!doc) return [];
    if (doc.linkedFromId) {
      await prisma.document.update({ where: { id: doc.id }, data: { linkDetached: true } });
      return [];
    }
    const copies = await prisma.document.findMany({ where: { linkedFromId: doc.id }, select: { id: true, status: true, linkDetached: true } });
    const changed: string[] = [];
    for (const c of copies) {
      const next = followReview(c, doc);
      if (!next) continue;
      await prisma.document.update({
        where: { id: c.id },
        data: { status: next.status, reviewNote: next.reviewNote, reviewMarks: next.status === 'REJECTED' ? (json(doc.reviewMarks) ?? Prisma.DbNull) : Prisma.DbNull },
      });
      if (c.status !== next.status) changed.push(c.id);
    }
    return changed;
  } catch (err) {
    console.error(`[doc-link] review of document ${documentId} could not be passed on`, err);
    return [];
  }
};

/**
 * The client deletes their own pending upload: its linked copies that are still pending (and not reviewed on
 * their own) go with it — rows first, then their own files. Call BEFORE deleting the source row.
 */
export const removeLinkedPendingCopies = async (documentId: string): Promise<number> => {
  if (isImpersonating()) return 0;
  try {
    const copies = await prisma.document.findMany({ where: { linkedFromId: documentId, status: 'PENDING', linkDetached: false }, select: { id: true, storedName: true } });
    if (!copies.length) return 0;
    await prisma.document.deleteMany({ where: { id: { in: copies.map((c) => c.id) } } });
    for (const c of copies) await fs.unlink(filePath(c.storedName)).catch(() => undefined);
    return copies.length;
  } catch (err) {
    console.error(`[doc-link] linked copies of document ${documentId} could not be removed`, err);
    return 0;
  }
};

/** Cases the backfill looks at: open ones (no decision, not cancelled) that have an embassy list. */
const OPEN_STATUSES = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'] as const;

/**
 * One-off (idempotent) backfill for existing cases: every open case with both lists gets the matching ACCEPTED
 * documents linked into its empty requirements. Safe to repeat: filled requirements and copies made before are
 * skipped, so later runs only do something for cases that changed outside the upload paths.
 */
export const backfillLinkedDocuments = async (opts: { batch?: number } = {}): Promise<{ cases: number; linked: number }> => {
  const take = opts.batch ?? 200;
  let cursor: string | undefined;
  const out = { cases: 0, linked: 0 };
  for (;;) {
    const rows = await prisma.case.findMany({
      where: { status: { in: [...OPEN_STATUSES] }, requirements: { some: { stage: 'EMBASSY' } } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    for (const r of rows) {
      const n = await linkCaseRequirements(r.id, { pending: false });
      if (n) {
        out.cases++;
        out.linked += n;
      }
    }
    cursor = rows[rows.length - 1].id;
  }
  return out;
};
