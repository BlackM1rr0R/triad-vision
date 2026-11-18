import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { conflict, notFound } from '../http.js';
import { notifyUser } from '../notifications.js';
import { effectiveStage } from '../caseProcessing/index.js';
import { peekWorkflowFolders } from '../drive/workflowFolders.js';
import { caseFoldersInStage } from '../drive/workflowLinks.js';
import { storagePath } from '../drive/storage.js';
import { newFiles, parseSentFiles, sendBlocker, type SentFile } from './logic.js';
import { READY_DOCS_TEXT } from './texts.js';

/**
 * "Müştəriyə göndər": the finished documents of a case go to the client's portal.
 *
 * Where finished documents live: the team copies / sends them through the "İş axını" stage folders of the drive
 * (lib/drive/workflowFolders) — "Gemeinsame Dokumente / Arbeitsablauf / Fertig / <client folder name> / …", the
 * case id on that folder (DriveNode.workflowCaseId; the client folder name for legacy copies) being the link. Every file below it (a few levels deep) is
 * copied into the private upload store as a case Document (stage OTHER, ACCEPTED, no requirement), which the client
 * portal lists under "Sizin üçün fayllar" (caseView.otherDocuments) and serves through /api/files/:id.
 *
 * Only cases in Fertig (Case.processingStage DONE) are sent. A send is recorded (CaseReadyDocsSend); a second send
 * needs `resend` (the UI asks first) and copies only files that are new or replaced since (node id + version), so
 * the client never sees the same document twice; the client is notified (in-app, push, e-mail by their settings).
 */

const MAX_FILES = 100;
const MAX_DEPTH = 6;

export interface ReadyFileRow {
  nodeId: string;
  name: string;
  path: string;
  version: number;
  size: number | null;
  mimeType: string | null;
  storageKey: string | null;
  updatedAt: Date;
}

/**
 * The case's folder(s) below "Arbeitsablauf/Fertig" and the files in them: the folders linked to the case
 * (DriveNode.workflowCaseId, set by "İş axınına kopyala") first; a legacy copy found by the client folder's name
 * only when none is linked (and never one linked to another case — lib/drive/workflowLinks).
 */
export const readyFilesOf = async (caseId: string, driveFolderId: string | null): Promise<{ folder: { id: string; name: string } | null; files: ReadyFileRow[] }> => {
  const [wf, client] = await Promise.all([
    peekWorkflowFolders(),
    driveFolderId ? prisma.driveNode.findFirst({ where: { id: driveFolderId, deletedAt: null }, select: { name: true } }) : null,
  ]);
  if (!wf) return { folder: null, files: [] };
  const folders = await caseFoldersInStage(wf.stages.DONE, caseId, client?.name ?? null);
  const folder = folders[0] ? { id: folders[0].id, name: folders[0].name } : null;
  if (!folder) return { folder: null, files: [] };

  const paths = new Map<string, string>(folders.map((f) => [f.id, '']));
  const files: ReadyFileRow[] = [];
  let level = folders.map((f) => f.id);
  for (let depth = 0; depth < MAX_DEPTH && level.length && files.length < MAX_FILES; depth++) {
    const rows = await prisma.driveNode.findMany({
      where: { parentId: { in: level }, deletedAt: null },
      select: { id: true, kind: true, name: true, parentId: true, version: true, size: true, mimeType: true, storageKey: true, updatedAt: true },
      orderBy: { name: 'asc' },
    });
    const next: string[] = [];
    for (const r of rows) {
      const parentPath = paths.get(r.parentId!) ?? '';
      if (r.kind === 'FOLDER') {
        paths.set(r.id, parentPath ? `${parentPath} / ${r.name}` : r.name);
        next.push(r.id);
      } else if (files.length < MAX_FILES && r.storageKey) {
        files.push({ nodeId: r.id, name: r.name, path: parentPath, version: r.version, size: r.size, mimeType: r.mimeType, storageKey: r.storageKey, updatedAt: r.updatedAt });
      }
    }
    level = next;
  }
  return { folder, files };
};

/** Sent files that are still on the case (a document staff deleted since counts as not sent). */
const liveSentFiles = async (caseId: string) => {
  const sends = await prisma.caseReadyDocsSend.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' }, select: { files: true } });
  const sent = sends.flatMap((s) => parseSentFiles(s.files));
  if (!sent.length) return { count: sends.length, sent };
  const alive = new Set((await prisma.document.findMany({ where: { id: { in: sent.map((s) => s.documentId) }, caseId }, select: { id: true } })).map((d) => d.id));
  return { count: sends.length, sent: sent.filter((s) => alive.has(s.documentId)) };
};

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

/** GET …/ready-docs: the Fertig files of the case (sent or not) and the sends so far. */
export const readyDocsView = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, status: true, processingStage: true, driveFolderId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const [{ folder, files }, live, sends] = await Promise.all([
    readyFilesOf(c.id, c.driveFolderId),
    liveSentFiles(caseId),
    prisma.caseReadyDocsSend.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, createdAt: true, actorId: true, fileCount: true, newCount: true, resend: true } }),
  ]);
  const actors = await prisma.user.findMany({ where: { id: { in: [...new Set(sends.map((s) => s.actorId).filter((x): x is string => !!x))] } }, select: { id: true, firstName: true, lastName: true } });
  const actorName = new Map(actors.map((a) => [a.id, fullName(a)]));
  const fresh = new Set(newFiles(files, live.sent).map((f) => f.nodeId));
  return {
    caseId: c.id,
    number: c.number,
    stage: effectiveStage(c.processingStage, c.status),
    folder,
    files: files.map(({ storageKey: _k, ...f }) => ({ ...f, sent: !fresh.has(f.nodeId) })),
    newCount: fresh.size,
    sends: sends.map((s) => ({ id: s.id, at: s.createdAt, by: s.actorId ? (actorName.get(s.actorId) ?? null) : null, fileCount: s.fileCount, newCount: s.newCount, resend: s.resend })),
  };
};

const extOf = (name: string) => /\.[a-z0-9]{1,8}$/i.exec(name)?.[0]?.toLowerCase() ?? '';

export interface SendResult {
  sendId: string;
  total: number;
  sent: number;
  resend: boolean;
  documents: { id: string; name: string }[];
}

/** POST …/ready-docs/send for one case (throws 404 / 409 READY_DOCS_* with the reason). */
export const sendReadyDocs = async (caseId: string, actor: { id: string }, opts: { resend?: boolean } = {}): Promise<SendResult> => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, number: true, status: true, processingStage: true, driveFolderId: true, client: { select: { id: true, firstName: true, locale: true } } },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const { files } = await readyFilesOf(c.id, c.driveFolderId);
  const live = await liveSentFiles(caseId);
  const resend = !!opts.resend;
  const fresh = newFiles(files, live.sent);
  const blocker = sendBlocker({ stage: effectiveStage(c.processingStage, c.status), fileCount: files.length, sentBefore: live.count > 0, resend, newCount: fresh.length });
  if (blocker) throw conflict(blocker);

  // Every source must be readable before anything is written (no half send).
  for (const f of fresh) {
    try {
      await fsp.access(storagePath(f.storageKey!));
    } catch {
      throw conflict('READY_DOCS_FILE_MISSING', f.name);
    }
  }
  await fsp.mkdir(config.uploads.privateDir, { recursive: true });
  const created: SentFile[] = [];
  const written: string[] = [];
  try {
    for (const f of fresh) {
      const storedName = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${extOf(f.name)}`;
      await fsp.copyFile(storagePath(f.storageKey!), path.join(config.uploads.privateDir, storedName));
      written.push(storedName);
      const size = f.size ?? (await fsp.stat(path.join(config.uploads.privateDir, storedName))).size;
      const doc = await prisma.document.create({
        data: { caseId, stage: 'OTHER', originalName: f.name.slice(0, 191), storedName, mimeType: f.mimeType || 'application/octet-stream', size, status: 'ACCEPTED', uploadedById: actor.id },
        select: { id: true },
      });
      created.push({ nodeId: f.nodeId, version: f.version, documentId: doc.id, name: f.name });
    }
  } catch (err) {
    // Undo the copies of this send; nothing is recorded.
    if (created.length) await prisma.document.deleteMany({ where: { id: { in: created.map((x) => x.documentId) } } }).catch(() => undefined);
    for (const n of written) await fsp.unlink(path.join(config.uploads.privateDir, n)).catch(() => undefined);
    throw err;
  }

  const row = await prisma.caseReadyDocsSend.create({
    data: { caseId, actorId: actor.id, fileCount: files.length, newCount: created.length, resend, files: created as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
  await prisma.caseEvent.create({
    data: {
      caseId,
      type: 'READY_DOCS_SENT',
      note: `${resend ? 'Erneut gesendet' : 'An den Kunden gesendet'}: ${created.length}/${files.length} Datei(en)${created.length ? ` — ${created.map((x) => x.name).join(', ')}` : ''}`.slice(0, 2000),
      actorId: actor.id,
      visibleToClient: false,
    },
  });
  // The client's timeline: "a file was added for you" (same event as other staff files of stage OTHER).
  if (created.length) {
    await prisma.caseEvent.create({
      data: { caseId, type: 'STAFF_DOCUMENT_UPLOADED', note: created.map((x) => x.name).join(', ').slice(0, 2000), actorId: actor.id, visibleToClient: true },
    });
  }
  const tx = READY_DOCS_TEXT[c.client.locale ?? 'az'] ?? READY_DOCS_TEXT.az;
  await notifyUser(c.client.id, {
    type: 'READY_DOCS',
    title: tx.title(created.length),
    body: tx.body({ name: c.client.firstName, number: c.number, count: created.length, resend }),
    link: `/account/cases/${c.id}?tab=docs`,
    caseId: c.id,
    ctaLabel: tx.cta,
  }).catch(() => undefined);
  return { sendId: row.id, total: files.length, sent: created.length, resend, documents: created.map((x) => ({ id: x.documentId, name: x.name ?? '' })) };
};

export { lastSentAt } from './sent.js';
