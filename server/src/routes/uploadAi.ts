import { Router, type Request } from 'express';
import { z } from 'zod';
import type { DocumentInsight } from '@prisma/client';
import { prisma } from '../db.js';
import { hasMinRole, isStaff, requireAuth, requireMinRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, HttpError, notFound, parse } from '../lib/http.js';
import { DriveAccessCtx, requireNode } from '../lib/drive/access.js';
import {
  DOC_TYPES,
  analyzeInsight,
  applyInsight,
  changeInsightType,
  clientView,
  getUploadAiSettings,
  rejectInsight,
  requestReupload,
  saveUploadAiSettings,
  staffView,
  uploadAiSettingsUpdate,
  type DocType,
} from '../lib/uploadAi/index.js';
import { proposalsOf } from '../lib/uploadAi/apply.js';
import { ACTIONS } from '../lib/uploadAi/types.js';

/**
 * Smart uploads (/api/upload-ai):
 *   client (own case)   GET  /cases/:caseId                 recognition + quality of the own uploads
 *                       POST /documents/:docId/ack          "upload anyway" on a wrong-document warning
 *   staff (2FA)         GET  /cases/:caseId                 every insight of the case (documents + drive files)
 *                       GET  /documents/:docId, /nodes/:nodeId, /folders/:folderId
 *                       POST /insights/:id/accept|reject|type|reanalyze
 *                       POST /cases/:caseId/accept-all, /folders/:folderId/accept-all
 *                       POST /documents/:docId/request-reupload
 *   super admin         GET/PUT /settings
 * Drive files additionally need the caller's drive access (VIEW to look, EDIT to change).
 */
export const uploadAiRouter = Router();
uploadAiRouter.use(requireAuth);

const staffWith2fa = (req: Request) => isStaff(req.user) && !!req.user!.twoFactorEnabled;
const ctxOf = (req: Request) => new DriveAccessCtx({ id: req.user!.id, role: req.user!.role });
const actorOf = (req: Request) => ({ id: req.user!.id, ip: req.ip });
const id = (v: unknown) => {
  const s = String(v ?? '');
  if (!s || s.length > 120) throw notFound('NOT_FOUND');
  return s;
};

/** Only insights the caller may see: case documents for staff, drive files through drive access. */
const visibleDriveIds = async (req: Request, rows: DocumentInsight[]) => {
  const nodeIds = rows.map((r) => r.driveNodeId).filter((x): x is string => !!x);
  if (!nodeIds.length) return new Set<string>();
  const ctx = ctxOf(req);
  const ok = new Set<string>();
  for (const n of nodeIds) {
    try {
      await requireNode(ctx, n, 'VIEW');
      ok.add(n);
    } catch {
      /* not visible */
    }
  }
  return ok;
};

const filterVisible = async (req: Request, rows: DocumentInsight[]) => {
  const drive = await visibleDriveIds(req, rows);
  return rows.filter((r) => !r.driveNodeId || drive.has(r.driveNodeId));
};

/** Loads an insight and checks the caller may change it (staff; drive files: EDIT on the file). */
const editableInsight = async (req: Request) => {
  const insight = await prisma.documentInsight.findUnique({ where: { id: id(req.params.id) } });
  if (!insight) throw notFound('INSIGHT_NOT_FOUND');
  if (insight.driveNodeId) await requireNode(ctxOf(req), insight.driveNodeId, 'EDIT');
  return insight;
};

const assertMoveAllowed = async (req: Request, insight: DocumentInsight, actions?: string[]) => {
  const p = proposalsOf(insight);
  const moving = (actions ?? p.actions).includes('move') && p.actions.includes('move');
  if (moving && p.folder) await requireNode(ctxOf(req), p.folder.parentId, 'EDIT');
};

// ─── Case view (client or staff) ───────────────────────────────────────

uploadAiRouter.get('/cases/:caseId', async (req, res) => {
  const caseId = id(req.params.caseId);
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  if (staffWith2fa(req)) {
    const rows = await filterVisible(req, await prisma.documentInsight.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' }, take: 500 }));
    const insights = rows.map(staffView);
    res.json({ insights, open: insights.filter((i) => i.status === 'PROPOSED' && i.proposals.actions.length).length });
    return;
  }
  if (c.clientId !== req.user!.id) throw notFound('CASE_NOT_FOUND');
  const docs = await prisma.document.findMany({ where: { caseId, uploadedById: req.user!.id }, select: { id: true } });
  const rows = await prisma.documentInsight.findMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
  res.json({ insights: rows.map(clientView) });
});

uploadAiRouter.post('/documents/:docId/ack', async (req, res) => {
  const doc = await prisma.document.findUnique({ where: { id: id(req.params.docId) }, select: { id: true, uploadedById: true, case: { select: { clientId: true } } } });
  if (!doc || doc.case.clientId !== req.user!.id || doc.uploadedById !== req.user!.id) throw notFound('DOCUMENT_NOT_FOUND');
  const insight = await prisma.documentInsight.findUnique({ where: { documentId: doc.id } });
  if (!insight) throw notFound('INSIGHT_NOT_FOUND');
  const updated = await prisma.documentInsight.update({ where: { id: insight.id }, data: { clientAckAt: new Date() } });
  res.json({ insight: clientView(updated) });
});

// ─── Settings (super admin) ────────────────────────────────────────────

uploadAiRouter.get('/settings', requireMinRole('SUPER_ADMIN'), async (_req, res) => {
  res.json({ settings: await getUploadAiSettings() });
});

uploadAiRouter.put('/settings', requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const patch = parse(uploadAiSettingsUpdate, req.body);
  const settings = await saveUploadAiSettings(patch);
  await audit(req, 'UPLOAD_AI_SETTINGS_SAVED', 'uploadAi', patch);
  res.json({ settings });
});

// ─── Staff ──────────────────────────────────────────────────────────────

const staff = Router();
staff.use(requireMinRole('STAFF'));

staff.get('/documents/:docId', async (req, res) => {
  const row = await prisma.documentInsight.findUnique({ where: { documentId: id(req.params.docId) } });
  if (!row) throw notFound('INSIGHT_NOT_FOUND');
  res.json({ insight: staffView(row) });
});

staff.get('/nodes/:nodeId', async (req, res) => {
  const nodeId = id(req.params.nodeId);
  await requireNode(ctxOf(req), nodeId, 'VIEW');
  const row = await prisma.documentInsight.findUnique({ where: { driveNodeId: nodeId } });
  if (!row) throw notFound('INSIGHT_NOT_FOUND');
  res.json({ insight: staffView(row) });
});

/** Insights of the files directly inside a folder (the drive's bulk bar). */
const folderInsights = async (req: Request, folderId: string) => {
  await requireNode(ctxOf(req), folderId, 'VIEW');
  const files = await prisma.driveNode.findMany({ where: { parentId: folderId, kind: 'FILE', deletedAt: null }, select: { id: true } });
  if (!files.length) return [];
  return filterVisible(req, await prisma.documentInsight.findMany({ where: { driveNodeId: { in: files.map((f) => f.id) } } }));
};

staff.get('/folders/:folderId', async (req, res) => {
  const insights = (await folderInsights(req, id(req.params.folderId))).map(staffView);
  res.json({ insights, open: insights.filter((i) => i.status === 'PROPOSED' && i.proposals.actions.length).length });
});

const acceptBody = z.object({ actions: z.array(z.enum(ACTIONS)).min(1).max(4).optional() }).strict();

staff.post('/insights/:id/accept', async (req, res) => {
  const { actions } = parse(acceptBody, req.body ?? {});
  const insight = await editableInsight(req);
  await assertMoveAllowed(req, insight, actions);
  const { insight: updated, changes } = await applyInsight(insight.id, actorOf(req), { actions });
  res.json({ insight: staffView(updated), changes });
});

staff.post('/insights/:id/reject', async (req, res) => {
  const insight = await editableInsight(req);
  res.json({ insight: staffView(await rejectInsight(insight.id, actorOf(req))) });
});

staff.post('/insights/:id/type', async (req, res) => {
  const { docType } = parse(z.object({ docType: z.enum(DOC_TYPES) }).strict(), req.body);
  const insight = await editableInsight(req);
  if (insight.status === 'PENDING') throw badRequest('INSIGHT_PENDING');
  const updated = await changeInsightType(insight.id, docType as DocType);
  if (!updated) throw notFound('FILE_NOT_FOUND');
  await audit(req, 'UPLOAD_AI_TYPE_CHANGED', `insight:${insight.id}`, { from: insight.docType, to: docType, documentId: insight.documentId, driveNodeId: insight.driveNodeId });
  res.json({ insight: staffView(updated) });
});

staff.post('/insights/:id/reanalyze', async (req, res) => {
  const insight = await editableInsight(req);
  await prisma.documentInsight.update({ where: { id: insight.id }, data: { status: 'PENDING', sha256: insight.sha256 } });
  const updated = await analyzeInsight({ insightId: insight.id }, { force: true });
  if (!updated) throw new HttpError(422, 'ANALYSIS_FAILED');
  res.json({ insight: staffView(updated) });
});

/** Accepts every open proposal of a list; per-item results (a failing item does not stop the others). */
const acceptAll = async (req: Request, rows: DocumentInsight[]) => {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const r of rows.filter((x) => x.status === 'PROPOSED' && proposalsOf(x).actions.length)) {
    try {
      if (r.driveNodeId) await requireNode(ctxOf(req), r.driveNodeId, 'EDIT');
      await assertMoveAllowed(req, r);
      await applyInsight(r.id, actorOf(req));
      results.push({ id: r.id, ok: true });
    } catch (err) {
      if (err instanceof HttpError) results.push({ id: r.id, ok: false, error: err.code });
      else throw err;
    }
  }
  return results;
};

staff.post('/cases/:caseId/accept-all', async (req, res) => {
  const caseId = id(req.params.caseId);
  const rows = await filterVisible(req, await prisma.documentInsight.findMany({ where: { caseId, status: 'PROPOSED' }, orderBy: { createdAt: 'asc' } }));
  const results = await acceptAll(req, rows);
  res.json({ results, accepted: results.filter((r) => r.ok).length });
});

staff.post('/folders/:folderId/accept-all', async (req, res) => {
  const rows = await folderInsights(req, id(req.params.folderId));
  const results = await acceptAll(req, rows);
  res.json({ results, accepted: results.filter((r) => r.ok).length });
});

staff.post('/documents/:docId/request-reupload', async (req, res) => {
  const docId = id(req.params.docId);
  if (!hasMinRole(req.user!.role, 'STAFF')) throw notFound('DOCUMENT_NOT_FOUND');
  const { note } = await requestReupload(docId, actorOf(req));
  res.json({ ok: true, note });
});

uploadAiRouter.use(staff);
