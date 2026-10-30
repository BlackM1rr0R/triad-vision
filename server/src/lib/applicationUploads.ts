import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import type { Prisma, VaultDocKind, VaultDocument } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { clientDocFilter, decodeOriginalName, verifyUploadedFile } from '../middleware/upload.js';
import { nameMatches, scheduleAiDocCheck } from './aiDocs/docCheck.js';
import { CLIENT_UPLOAD_STAGE, FINAL_STATUSES } from './caseFlow.js';
import { checkCaseDocument, runChecks, targetForVaultKind, vaultDir } from './docCheck/index.js';
import { vaultKindsFor } from './docCheck/vault.js';
import { STAGE_FOLDER } from './drive/cases.js';
import { copyDocumentToDrive, ensureCaseFolder } from './drive/caseFolders.js';
import { freeNameIn, safeUploadName } from './drive/names.js';
import { hashStored } from './drive/org/hash.js';
import { copyIntoStore, removeStored } from './drive/storage.js';
import { ensureTypeFolder, VAULT_KIND_TYPE } from './drive/typeFolders.js';
import { badRequest, notFound } from './http.js';
import { prepareCaseDocument, prepareDriveFile, scheduleUploadAnalysis } from './uploadAi/index.js';
import { FILE_LABEL } from './uploadAi/types.js';

/**
 * Documents a candidate uploads while applying (vacancy application on the jobs pages): Reisepass, CV,
 * diploma … They are kept in the client's document vault (the place for files without a case) and marked as
 * application uploads; as soon as the client has a case — already, or when one is created later (portal
 * "start application", staff opening a case from the application) — each file is attached to the case:
 *
 *   matching DocumentRequirement (vault kind ↔ requirement key)  → a PENDING case document of that requirement
 *                                                                  (admin case "Sənədlər" tab) + its copy in
 *                                                                  "<client folder>/<type folder>" ("Reisepass" …)
 *   no matching requirement                                       → a plain file in the type folder of the client
 *                                                                  folder (the upload AI proposes where it belongs)
 *
 * Expired files and files of another person (vault "owner" ≠ client) stay in the vault. Nothing here throws into
 * the application itself except invalid files (400).
 */

/** Marker stored in VaultDocument.checks (JSON; no schema change). */
export interface ApplicationOrigin {
  kind: 'application';
  vacancyId: string | null;
  applicationId: string | null;
  at: string;
  /** Set once the file was attached to a case (never attached twice). */
  attachedCaseId?: string | null;
}

export const originOf = (v: Pick<VaultDocument, 'checks'>): ApplicationOrigin | null => {
  const o = (v.checks as { origin?: ApplicationOrigin } | null)?.origin;
  return o && o.kind === 'application' ? o : null;
};

/** An existing vault document the candidate picked for an application (VaultDocument.checks.applicationPicks). */
export interface ApplicationPick {
  vacancyId: string | null;
  applicationId: string | null;
  at: string;
}

export const picksOf = (v: Pick<VaultDocument, 'checks'>): ApplicationPick[] => {
  const p = (v.checks as { applicationPicks?: unknown } | null)?.applicationPicks;
  return Array.isArray(p) ? (p as ApplicationPick[]).filter((x) => x && typeof x.at === 'string') : [];
};

/** Uploaded with an application or picked from the vault for one: staff may see / download it. */
export const isApplicationDocument = (v: Pick<VaultDocument, 'checks'>) => !!originOf(v) || picksOf(v).length > 0;

/** Kinds a candidate can pick for an application upload. */
export const APPLICATION_KINDS = ['PASSPORT', 'CV', 'DIPLOMA', 'TRANSCRIPT', 'CERTIFICATE', 'LANGUAGE_CERT', 'EMPLOYMENT_REF', 'DRIVING_LICENCE', 'PHOTO', 'OTHER'] as const satisfies readonly VaultDocKind[];
export const MAX_APPLICATION_FILES = 6;

const randomName = (original: string) => `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${path.extname(original).toLowerCase().replace(/[^.a-z0-9]/g, '')}`;

/** Multipart "files" of an application: vault storage, case-document rules (size, types; magic bytes checked later). */
export const applicationUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => fs.mkdir(vaultDir(), { recursive: true }, (err) => cb(err ?? null, vaultDir())),
    filename: (_req, file, cb) => cb(null, randomName(file.originalname)),
  }),
  limits: { fileSize: config.uploads.maxFileSize, files: MAX_APPLICATION_FILES, fields: 20, fieldSize: 4000 },
  // Case-document types + HEIC/HEIF photos (converted to JPEG by verifyUploadedFile).
  fileFilter: clientDocFilter,
});

/** Removes uploaded multipart files (request failed before they were stored). */
export const discardUploads = async (files: Express.Multer.File[] | undefined) => {
  for (const f of files ?? []) await fsp.unlink(f.path).catch(() => undefined);
};

/** `kinds` from the form (one per file, same order); unknown / missing → OTHER. */
export const parseKinds = (raw: unknown, count: number): VaultDocKind[] => {
  const list = (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []).map((k) => String(k).trim().toUpperCase());
  return Array.from({ length: count }, (_, i) => ((APPLICATION_KINDS as readonly string[]).includes(list[i]) ? (list[i] as VaultDocKind) : 'OTHER'));
};

// ─── Background work tracker (tests wait for it) ───────────────────────

const running = new Set<Promise<unknown>>();
const track = <T>(p: Promise<T>) => {
  running.add(p);
  void p.finally(() => running.delete(p)).catch(() => undefined);
  return p;
};
export const waitForApplicationUploads = async () => {
  while (running.size) await Promise.allSettled([...running]);
};

// ─── Store ──────────────────────────────────────────────────────────────

/**
 * Stores the files of an application in the vault (marked as application uploads) and attaches them to the
 * client's active case when there is one. The files must come from `applicationUpload`; invalid content → 400
 * (all files of the request are removed then).
 */
export const storeApplicationFiles = async (
  userId: string,
  files: Express.Multer.File[],
  kinds: VaultDocKind[],
  ctx: { vacancyId?: string | null; applicationId?: string | null },
) => {
  const created: VaultDocument[] = [];
  try {
    for (const f of files) await verifyUploadedFile(f);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const kind = kinds[i] ?? 'OTHER';
      const { checks, scan } = await runChecks({ path: f.path, mimeType: f.mimetype, target: targetForVaultKind(kind) });
      const origin: ApplicationOrigin = { kind: 'application', vacancyId: ctx.vacancyId ?? null, applicationId: ctx.applicationId ?? null, at: new Date().toISOString() };
      const filename = decodeOriginalName(f.originalname).slice(0, 200);
      let expiresAt: Date | null = null;
      let ownerName: string | null = null;
      if (scan && kind === 'PASSPORT') {
        if (scan.fields.expiryDate) expiresAt = new Date(`${scan.fields.expiryDate}T00:00:00Z`);
        ownerName = `${scan.fields.firstName} ${scan.fields.lastName}`.trim() || null;
      }
      created.push(
        await prisma.vaultDocument.create({
          data: {
            userId,
            kind,
            title: (VAULT_KIND_TYPE[kind] === 'OTHER' ? filename : FILE_LABEL[VAULT_KIND_TYPE[kind]]).slice(0, 200),
            ownerName,
            storageKey: path.basename(f.path),
            filename,
            mimeType: f.mimetype,
            size: f.size,
            expiresAt,
            checks: { ...(checks as unknown as Record<string, unknown>), origin } as unknown as Prisma.InputJsonValue,
            ocr: scan ? ({ fields: scan.fields, valid: scan.checks.valid } as unknown as Prisma.InputJsonValue) : undefined,
          },
        }),
      );
    }
  } catch (err) {
    // Nothing half-stored: rows created so far go, every file of the request is removed.
    if (created.length) await prisma.vaultDocument.deleteMany({ where: { id: { in: created.map((c) => c.id) } } }).catch(() => undefined);
    await discardUploads(files);
    throw err;
  }
  const active = await prisma.case.findFirst({ where: { clientId: userId, parentCaseId: null, status: { notIn: FINAL_STATUSES } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  const attached = active ? await attachVaultDocsToCase(active.id, created.map((c) => c.id)) : null;
  return { documents: created, caseId: active?.id ?? null, attached };
};

// ─── Pick from the vault ────────────────────────────────────────────────

/** `vaultIds` from JSON (array) or multipart (repeated field / comma list); unique, trimmed. */
export const parseVaultIds = (raw: unknown): string[] => {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? raw.split(',') : [];
  return [...new Set(list.map((x) => String(x).trim()).filter((x) => /^[A-Za-z0-9_-]{1,40}$/.test(x)))];
};

/**
 * The candidate's own, not expired vault documents with these ids — or an error before anything is created:
 * someone else's (or an unknown) id → 404 VAULT_DOCUMENT_NOT_FOUND, an expired one → 400 VAULT_DOCUMENT_EXPIRED.
 */
export const ownPickableVaultDocs = async (userId: string, ids: string[]) => {
  if (!ids.length) return [];
  const docs = await prisma.vaultDocument.findMany({ where: { id: { in: ids }, userId } });
  if (docs.length !== ids.length) throw notFound('VAULT_DOCUMENT_NOT_FOUND');
  const now = Date.now();
  if (docs.some((d) => d.expiresAt && d.expiresAt.getTime() <= now)) throw badRequest('VAULT_DOCUMENT_EXPIRED');
  return ids.map((id) => docs.find((d) => d.id === id)!);
};

/**
 * Links picked vault documents to the application (no copy in the vault: the marker lists the applications the
 * document was sent with) and attaches them to the active case like fresh application uploads — except documents
 * already in that case (a document of the case was copied from them before).
 */
export const linkPickedVaultDocs = async (userId: string, docs: VaultDocument[], ctx: { vacancyId?: string | null; applicationId?: string | null }) => {
  const at = new Date().toISOString();
  for (const d of docs) {
    const picks = picksOf(d).filter((p) => p.applicationId !== (ctx.applicationId ?? null));
    picks.push({ vacancyId: ctx.vacancyId ?? null, applicationId: ctx.applicationId ?? null, at });
    const checks = { ...((d.checks ?? {}) as Record<string, unknown>), applicationPicks: picks.slice(-20) };
    await prisma.vaultDocument.update({ where: { id: d.id }, data: { checks: checks as unknown as Prisma.InputJsonValue } });
  }
  const active = await prisma.case.findFirst({ where: { clientId: userId, parentCaseId: null, status: { notIn: FINAL_STATUSES } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  if (!active || !docs.length) return { caseId: active?.id ?? null, attached: null };
  const inCase = await prisma.document.findMany({ where: { caseId: active.id, vaultDocumentId: { in: docs.map((d) => d.id) } }, select: { vaultDocumentId: true } });
  const already = new Set(inCase.map((x) => x.vaultDocumentId));
  const attached = await attachVaultDocsToCase(active.id, docs.filter((d) => !already.has(d.id)).map((d) => d.id));
  return { caseId: active.id, attached };
};

// ─── Attach to a case ──────────────────────────────────────────────────

export interface AttachSummary {
  /** Case documents created (requirement matched). */
  linked: { vaultId: string; documentId: string; requirementId: string }[];
  /** Plain files placed in the client folder (no matching requirement). */
  filed: { vaultId: string; nodeId: string }[];
  /** Left in the vault: expired, another person's document, file missing. */
  skipped: { vaultId: string; reason: 'EXPIRED' | 'OTHER_PERSON' | 'FILE_MISSING' | 'NOT_OWNER' }[];
}

const markAttached = async (v: VaultDocument, caseId: string) => {
  const origin = originOf(v);
  if (!origin) return;
  const checks = { ...((v.checks ?? {}) as Record<string, unknown>), origin: { ...origin, attachedCaseId: caseId } };
  await prisma.vaultDocument.update({ where: { id: v.id }, data: { checks: checks as Prisma.InputJsonValue } }).catch(() => undefined);
};

/** A plain drive file in "<client folder>/<type folder>" (or the "Sonstiges" stage folder). Returns its id. */
const fileIntoClientFolder = async (caseId: string, v: VaultDocument, uploadedById: string): Promise<string | null> => {
  const folderId = await ensureCaseFolder(caseId);
  if (!folderId) return null;
  let parentId = await ensureTypeFolder(folderId, VAULT_KIND_TYPE[v.kind]);
  if (!parentId) {
    const name = STAGE_FOLDER.OTHER;
    const rows = await prisma.driveNode.findMany({ where: { parentId: folderId, name, kind: 'FOLDER', deletedAt: null }, select: { id: true } });
    parentId = rows[0]?.id ?? (await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name, parentId: folderId }, select: { id: true } })).id;
  }
  const key = await copyIntoStore(path.join(vaultDir(), path.basename(v.storageKey)));
  try {
    const contentHash = await hashStored(key);
    const node = await prisma.driveNode.create({
      data: {
        space: 'SHARED',
        kind: 'FILE',
        name: await freeNameIn(parentId, safeUploadName(v.filename), true),
        parentId,
        storageKey: key,
        mimeType: v.mimeType,
        size: v.size,
        createdById: uploadedById,
        contentHash,
        workflowStage: 'INCOMING',
        workflowAt: new Date(),
      },
      select: { id: true },
    });
    // Smart uploads: recognition + "attach to requirement / move" proposals for staff.
    if (await prepareDriveFile(node.id)) scheduleUploadAnalysis({ driveNodeId: node.id });
    return node.id;
  } catch (err) {
    await removeStored([key]);
    throw err;
  }
};

/**
 * Attaches vault documents of the case's client to the case (see the module comment). Only requirements without
 * a live (not rejected) upload are filled; each vault document is used once. Never throws.
 */
export const attachVaultDocsToCase = async (caseId: string, vaultIds: string[]): Promise<AttachSummary> => {
  const out: AttachSummary = { linked: [], filed: [], skipped: [] };
  if (!vaultIds.length) return out;
  try {
    const c = await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        status: true,
        clientId: true,
        client: { select: { firstName: true, lastName: true } },
        requirements: { orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }], select: { id: true, key: true, stage: true, documents: { select: { status: true } } } },
      },
    });
    if (!c) return out;
    const docs = await prisma.vaultDocument.findMany({ where: { id: { in: vaultIds } }, orderBy: { createdAt: 'desc' } });
    const taken = new Set(c.requirements.filter((r) => r.documents.some((d) => d.status !== 'REJECTED')).map((r) => r.id));
    const stageOrder = [CLIENT_UPLOAD_STAGE[c.status] ?? 'INITIAL', 'INITIAL', 'EMBASSY'];
    const now = Date.now();
    for (const v of docs) {
      if (v.userId !== c.clientId) {
        out.skipped.push({ vaultId: v.id, reason: 'NOT_OWNER' });
        continue;
      }
      if (v.expiresAt && v.expiresAt.getTime() <= now) {
        out.skipped.push({ vaultId: v.id, reason: 'EXPIRED' });
        continue;
      }
      if (v.ownerName && !nameMatches(v.ownerName, c.client)) {
        out.skipped.push({ vaultId: v.id, reason: 'OTHER_PERSON' });
        continue;
      }
      const src = path.join(vaultDir(), path.basename(v.storageKey));
      if (!(await fsp.stat(src).catch(() => null))?.isFile()) {
        out.skipped.push({ vaultId: v.id, reason: 'FILE_MISSING' });
        continue;
      }
      const req = c.requirements
        .filter((r) => !taken.has(r.id) && vaultKindsFor(r.key).includes(v.kind))
        .sort((a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage) || vaultKindsFor(a.key).indexOf(v.kind) - vaultKindsFor(b.key).indexOf(v.kind))[0];
      try {
        if (req) {
          const storedName = randomName(v.filename);
          await fsp.copyFile(src, path.join(config.uploads.privateDir, storedName));
          const doc = await prisma.document.create({
            data: {
              caseId: c.id,
              requirementId: req.id,
              stage: req.stage,
              originalName: v.filename.slice(0, 200),
              storedName,
              mimeType: v.mimeType,
              size: v.size,
              uploadedById: c.clientId,
              vaultDocumentId: v.id,
              expiresAt: v.expiresAt,
            },
          });
          taken.add(req.id);
          await prisma.caseEvent.create({ data: { caseId: c.id, type: 'DOCUMENT_UPLOADED', note: `${doc.originalName} (müraciət)`, actorId: c.clientId, visibleToClient: false } });
          await copyDocumentToDrive(doc.id, { pending: true }); // "<client folder>/Reisepass/…"
          await checkCaseDocument(doc.id);
          await prepareCaseDocument(doc.id);
          scheduleAiDocCheck(doc.id);
          scheduleUploadAnalysis({ documentId: doc.id });
          out.linked.push({ vaultId: v.id, documentId: doc.id, requirementId: req.id });
        } else {
          const nodeId = await fileIntoClientFolder(c.id, v, c.clientId);
          if (!nodeId) continue;
          out.filed.push({ vaultId: v.id, nodeId });
        }
        await markAttached(v, c.id);
      } catch (err) {
        console.error(`[application-uploads] vault document ${v.id} could not be attached to case ${c.id}`, err);
      }
    }
  } catch (err) {
    console.error(`[application-uploads] attaching to case ${caseId} failed`, err);
  }
  return out;
};

/**
 * A case was created: the client's application uploads that are not attached anywhere yet join it (main
 * applicant cases only — a family member's case is not the vault owner's). Fire-and-forget; never throws.
 */
export const attachApplicationUploadsOnCaseCreated = (caseId: string) =>
  track(
    (async () => {
      const c = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true, parentCaseId: true } });
      if (!c || c.parentCaseId) return null;
      const docs = await prisma.vaultDocument.findMany({ where: { userId: c.clientId }, select: { id: true, checks: true } });
      const ids = docs.filter((d) => {
        const o = originOf(d);
        return o && !o.attachedCaseId;
      }).map((d) => d.id);
      return ids.length ? attachVaultDocsToCase(caseId, ids) : null;
    })().catch((err) => {
      console.error(`[application-uploads] case ${caseId}: attaching application uploads failed`, err);
      return null;
    }),
  );

/** Application uploads of a candidate (staff view of the candidate / application). */
export const applicationUploadsOf = async (userId: string) => {
  const rows = await prisma.vaultDocument.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  return rows.flatMap((r) => {
    const o = originOf(r);
    const base = { id: r.id, kind: r.kind, title: r.title, filename: r.filename, mimeType: r.mimeType, size: r.size, expiresAt: r.expiresAt, createdAt: r.createdAt };
    if (o) return [{ ...base, vacancyId: o.vacancyId, applicationId: o.applicationId, attachedCaseId: o.attachedCaseId ?? null, fromVault: false }];
    // Picked from the vault: listed with the latest application it was sent with.
    const last = picksOf(r).at(-1);
    return last ? [{ ...base, vacancyId: last.vacancyId, applicationId: last.applicationId, attachedCaseId: null, fromVault: true }] : [];
  });
};
