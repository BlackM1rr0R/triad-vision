import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { DocumentInsight, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { publish } from '../messaging/realtime.js';
import { applyInsight, proposalsOf } from './apply.js';
import { caseOfFolder, loadCaseContext, loadDocumentSubject, loadDriveSubject, type CaseContext, type Subject } from './context.js';
import { buildProposals, type ProposalResult } from './proposals.js';
import { analyzeQuality, type QualityReport } from './quality.js';
import { recognise } from './recognise.js';
import { getUploadAiSettings } from './settings.js';
import { isDocType, type DocType, type InsightAction, type InsightFields } from './types.js';

/**
 * Smart-upload pipeline.
 *
 *   In the upload request (never failing it):  sha256 + scan quality (< 1 s) → DocumentInsight row (PENDING)
 *                                              → the quality goes back in the upload response.
 *   In the background (one at a time, queued): recognition (recognise.ts) → proposals (proposals.ts) → row
 *                                              PROPOSED → optional auto-apply → realtime "upload-ai.ready".
 *
 * A sweep job picks up rows left PENDING by a restart. Nothing here throws into a route.
 */

export const REALTIME_EVENT = 'upload-ai.ready';

/** Background analysis switch: off in the test environment unless a test turns it on (like the AI doc check). */
export const uploadAiDeps = { autoEnabled: () => !config.isTest };

const sha256Of = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');

const qualityTarget = (requirementKey: string | null | undefined) => (requirementKey === 'PHOTO' || requirementKey === 'PHOTO_2' ? 'photo' : 'document');

const json = (v: unknown) => v as Prisma.InputJsonValue;

// ─── In the request ─────────────────────────────────────────────────────

/** Quality + PENDING insight of a case document that was just stored. Returns the quality (or null). Never throws. */
export const prepareCaseDocument = async (documentId: string): Promise<QualityReport | null> => {
  try {
    const settings = await getUploadAiSettings();
    if (!settings.enabled && !settings.qualityEnabled) return null;
    const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true, caseId: true, storedName: true, mimeType: true, uploadedById: true, requirement: { select: { key: true } } } });
    if (!doc) return null;
    const loaded = await loadDocumentSubject(doc.id);
    if (!loaded) return null;
    const buf = await fs.readFile(loaded.subject.path);
    const quality = settings.qualityEnabled ? await analyzeQuality(buf, doc.mimeType, { target: qualityTarget(doc.requirement?.key) }) : null;
    const data = {
      caseId: doc.caseId,
      uploadedById: doc.uploadedById,
      sha256: sha256Of(buf),
      quality: quality ? json(quality) : undefined,
      qualityLevel: quality?.level ?? null,
      status: 'PENDING',
      fields: json({}),
      docType: 'OTHER',
      confidence: 0,
      source: 'NONE',
      proposals: json({ actions: [], currentName: loaded.subject.name }),
      applied: json([]),
      flags: json([]),
      error: null,
      decidedById: null,
      decidedAt: null,
      clientAckAt: null,
    };
    await prisma.documentInsight.upsert({ where: { documentId: doc.id }, create: { documentId: doc.id, ...data }, update: data });
    return quality;
  } catch (err) {
    console.error('[uploadAi] could not prepare the document insight', err);
    return null;
  }
};

/**
 * Quality + PENDING insight of a drive file just uploaded (or replaced by a new version). Only files inside a
 * client folder are tracked (others: null); `quality` is null when the check is switched off. Never throws.
 */
export const prepareDriveFile = async (nodeId: string): Promise<{ quality: QualityReport | null } | null> => {
  try {
    const settings = await getUploadAiSettings();
    if (!settings.enabled && !settings.qualityEnabled) return null;
    const loaded = await loadDriveSubject(nodeId);
    if (!loaded || !loaded.caseId || loaded.subject.kind !== 'drive') return null;
    const buf = await fs.readFile(loaded.subject.path);
    const quality = settings.qualityEnabled ? await analyzeQuality(buf, loaded.subject.mimeType) : null;
    const data = {
      caseId: loaded.caseId,
      folderId: loaded.subject.parentId,
      uploadedById: loaded.subject.uploadedById,
      sha256: sha256Of(buf),
      quality: quality ? json(quality) : undefined,
      qualityLevel: quality?.level ?? null,
      status: 'PENDING',
      fields: json({}),
      docType: 'OTHER',
      confidence: 0,
      source: 'NONE',
      proposals: json({ actions: [], currentName: loaded.subject.name }),
      applied: json([]),
      flags: json([]),
      error: null,
      decidedById: null,
      decidedAt: null,
    };
    await prisma.documentInsight.upsert({ where: { driveNodeId: nodeId }, create: { driveNodeId: nodeId, ...data }, update: data });
    return { quality };
  } catch (err) {
    console.error('[uploadAi] could not prepare the drive insight', err);
    return null;
  }
};

// ─── Background analysis ───────────────────────────────────────────────

export type InsightRef = { documentId: string } | { driveNodeId: string } | { insightId: string };

const findInsight = (ref: InsightRef) =>
  'insightId' in ref
    ? prisma.documentInsight.findUnique({ where: { id: ref.insightId } })
    : 'documentId' in ref
      ? prisma.documentInsight.findUnique({ where: { documentId: ref.documentId } })
      : prisma.documentInsight.findUnique({ where: { driveNodeId: ref.driveNodeId } });

const recipients = (insight: Pick<DocumentInsight, 'uploadedById'>, ctx: CaseContext | null, subject: Subject) => {
  const ids = new Set<string>();
  if (insight.uploadedById) ids.add(insight.uploadedById);
  if (ctx?.assignedStaffId) ids.add(ctx.assignedStaffId);
  if (ctx && subject.kind === 'document' && subject.uploadedById === ctx.clientId) ids.add(ctx.clientId);
  return [...ids];
};

const storeProposals = async (insightId: string, p: ProposalResult, extra: Prisma.DocumentInsightUpdateInput = {}) =>
  prisma.documentInsight.update({
    where: { id: insightId },
    data: {
      proposedName: p.proposedName,
      proposedRequirementId: p.proposedRequirementId,
      proposedFolderId: p.proposedFolderId,
      proposals: json(p.proposals),
      expiryDate: p.expiryDate,
      flags: json(p.flags),
      ...extra,
    },
  });

const loadSubject = async (insight: DocumentInsight) => {
  if (insight.driveNodeId) {
    const d = await loadDriveSubject(insight.driveNodeId);
    return d ? { subject: d.subject, caseId: d.caseId ?? insight.caseId, clientFolderId: d.clientFolderId } : null;
  }
  if (insight.documentId) {
    const d = await loadDocumentSubject(insight.documentId);
    return d ? { subject: d.subject, caseId: d.caseId, clientFolderId: null } : null;
  }
  return null;
};

/** Auto-apply per the super admin's settings: confident enough, only the allowed kinds of change. */
const autoApply = async (insight: DocumentInsight) => {
  const s = await getUploadAiSettings();
  if (!s.autoApply.enabled || insight.confidence < s.autoApply.threshold) return null;
  const allowed = proposalsOf(insight).actions.filter((a) => s.autoApply[a as InsightAction]);
  if (!allowed.length) return null;
  try {
    return await applyInsight(insight.id, { id: null }, { actions: allowed, auto: true });
  } catch (err) {
    console.error('[uploadAi] auto-apply failed', err);
    return null;
  }
};

/** Runs recognition + proposals for one insight. Never throws; returns the stored row (or null). */
export const analyzeInsight = async (ref: InsightRef, opts: { force?: boolean } = {}): Promise<DocumentInsight | null> => {
  let insight = await findInsight(ref).catch(() => null);
  if (!insight) return null;
  if (!opts.force && insight.status !== 'PENDING') return insight;
  try {
    const settings = await getUploadAiSettings();
    const loaded = await loadSubject(insight);
    if (!loaded) {
      await prisma.documentInsight.update({ where: { id: insight.id }, data: { status: 'FAILED', error: 'FILE_GONE' } });
      return null;
    }
    const { subject } = loaded;
    const ctx = await loadCaseContext(loaded.caseId);
    const buf = await fs.readFile(subject.path);
    const sha256 = sha256Of(buf);
    if (!settings.enabled) {
      return await prisma.documentInsight.update({ where: { id: insight.id }, data: { status: 'FAILED', error: 'DISABLED', sha256 } });
    }
    // A file the quality check could not even open is not sent to the AI (it could not read it either).
    const unreadable = ((insight.quality ?? null) as { reasons?: { code: string }[] } | null)?.reasons?.some((r) => r.code === 'UNREADABLE' || r.code === 'PDF_UNREADABLE') ?? false;
    const rec = await recognise({ subject, buf, sha256, insightId: insight.id, ctx, allowAi: settings.aiEnabled && !unreadable });
    const p = await buildProposals({ docType: rec.docType, confidence: rec.confidence, fields: rec.fields, subject, ctx, clientFolderId: loaded.clientFolderId });
    insight = await storeProposals(insight.id, p, {
      sha256,
      caseId: ctx?.id ?? insight.caseId,
      docType: rec.docType,
      confidence: rec.confidence,
      source: rec.source,
      fields: json(rec.fields),
      model: rec.model ?? null,
      costMicros: rec.costMicros,
      error: rec.aiFailure ? rec.aiFailure.slice(0, 120) : null,
      status: 'PROPOSED',
      ...(subject.kind === 'drive' ? { folderId: subject.parentId } : {}),
    });
    const applied = await autoApply(insight);
    if (applied) insight = applied.insight;
    publish(recipients(insight, ctx, subject), REALTIME_EVENT, {
      insightId: insight.id,
      documentId: insight.documentId,
      driveNodeId: insight.driveNodeId,
      caseId: insight.caseId,
      folderId: insight.folderId,
      docType: insight.docType,
      status: insight.status,
      // Name check for the uploader's screen (staff uploads on a client's behalf get the same warning as clients).
      flags: Array.isArray(insight.flags) ? insight.flags : [],
      uploadedById: insight.uploadedById,
      fileName: subject.name,
      holder: proposalsOf(insight).holder ?? null,
    });
    return insight;
  } catch (err) {
    console.error('[uploadAi] analysis failed', err);
    await prisma.documentInsight.update({ where: { id: insight.id }, data: { status: 'FAILED', error: String((err as Error).message ?? 'ERROR').slice(0, 120) } }).catch(() => undefined);
    return null;
  }
};

/**
 * Staff "Change type": the proposals are rebuilt for the chosen type from the fields already read (no AI),
 * the type counts as certain.
 */
export const changeInsightType = async (insightId: string, docType: DocType) => {
  const insight = await prisma.documentInsight.findUnique({ where: { id: insightId } });
  if (!insight) return null;
  const loaded = await loadSubject(insight);
  if (!loaded) return null;
  const ctx = await loadCaseContext(loaded.caseId);
  const fields = (insight.fields ?? {}) as InsightFields;
  const p = await buildProposals({ docType, confidence: 1, fields, subject: loaded.subject, ctx, clientFolderId: loaded.clientFolderId });
  return storeProposals(insight.id, p, { docType, confidence: 1, source: 'STAFF', status: 'PROPOSED' });
};

// ─── Queue ──────────────────────────────────────────────────────────────

let chain: Promise<unknown> = Promise.resolve();
const running = new Set<Promise<unknown>>();

/** Queues the background analysis (call it after the upload response was sent). */
export const scheduleUploadAnalysis = (ref: InsightRef) => {
  if (!uploadAiDeps.autoEnabled()) return;
  const p = chain.then(async () => {
    await new Promise((r) => setImmediate(r));
    await analyzeInsight(ref);
  });
  chain = p.catch(() => undefined);
  running.add(p);
  void p.catch((err) => console.error('[uploadAi] scheduled analysis failed', err)).finally(() => running.delete(p));
};

/** Resolves once every queued analysis finished (tests, graceful shutdown). */
export const waitForUploadAi = async () => {
  while (running.size) await Promise.allSettled([...running]);
};

/** Picks up insights left PENDING (API restarted mid-queue). Returns the number analysed. */
export const sweepPendingInsights = async (limit = 5) => {
  const rows = await prisma.documentInsight.findMany({ where: { status: 'PENDING', updatedAt: { lt: new Date(Date.now() - 2 * 60_000) } }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: limit });
  for (const r of rows) await analyzeInsight({ insightId: r.id });
  return rows.length;
};

// ─── Hooks for the upload routes ───────────────────────────────────────

/** Is this drive folder (or an ancestor) a client folder? Cheap enough for each upload. */
export const isClientFolder = async (folderId: string) => !!(await caseOfFolder(folderId).catch(() => null));

// ─── Views ──────────────────────────────────────────────────────────────

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Full view for staff (the suggestion card). */
export const staffView = (i: DocumentInsight) => {
  const p = proposalsOf(i);
  const q = (i.quality ?? null) as Pick<QualityReport, 'level' | 'reasons' | 'kind' | 'metrics'> | null;
  return {
    id: i.id,
    documentId: i.documentId,
    driveNodeId: i.driveNodeId,
    caseId: i.caseId,
    folderId: i.folderId,
    docType: isDocType(i.docType) ? i.docType : 'OTHER',
    confidence: Math.round(i.confidence * 100) / 100,
    source: i.source,
    fields: (i.fields ?? {}) as InsightFields,
    proposedName: i.proposedName,
    proposedRequirementId: i.proposedRequirementId,
    proposals: p,
    expiryDate: day(i.expiryDate),
    flags: (Array.isArray(i.flags) ? i.flags : []) as string[],
    quality: q ? { level: q.level, reasons: q.reasons ?? [], kind: q.kind } : null,
    qualityLevel: i.qualityLevel,
    status: i.status,
    applied: Array.isArray(i.applied) ? i.applied : [],
    model: i.model,
    costUsd: i.costMicros / 1e6,
    error: i.error,
    clientAckAt: i.clientAckAt,
    createdAt: i.createdAt,
    decidedAt: i.decidedAt,
  };
};

/** What the client sees about their own upload: the recognised type, validity, warnings, quality. */
export const clientView = (i: DocumentInsight) => {
  const p = proposalsOf(i);
  const q = (i.quality ?? null) as Pick<QualityReport, 'level' | 'reasons'> | null;
  const flags = (Array.isArray(i.flags) ? i.flags : []) as string[];
  const ready = i.status !== 'PENDING'; // FAILED counts as done (nothing recognised)
  return {
    documentId: i.documentId,
    ready,
    docType: ready && i.confidence >= 0.5 && isDocType(i.docType) && i.docType !== 'OTHER' ? i.docType : null,
    expiryDate: ready ? day(i.expiryDate) : null,
    expectedType: p.expected?.docType ?? null,
    flags: ready ? flags.filter((f) => f === 'WRONG_REQUIREMENT' || f === 'EXPIRED' || f === 'EXPIRES_SOON' || f === 'NAME_MISMATCH') : [],
    quality: q ? { level: q.level, reasons: (q.reasons ?? []).map((r) => ({ code: r.code, level: r.level })) } : null,
    acknowledged: !!i.clientAckAt,
  };
};

/** Small summary for drive rows / case document chips. */
export const chipView = (i: DocumentInsight) => ({
  id: i.id,
  docType: isDocType(i.docType) ? i.docType : 'OTHER',
  status: i.status,
  qualityLevel: i.qualityLevel,
  open: i.status === 'PROPOSED' ? proposalsOf(i).actions.length : 0,
  flags: (Array.isArray(i.flags) ? i.flags : []) as string[],
  /** NAME_MISMATCH: name on the document vs. the case person (the drive row shows the warning). */
  holder: proposalsOf(i).holder ?? null,
});
