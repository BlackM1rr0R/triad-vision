import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireMinRole } from '../middleware/auth.js';
import { HttpError, badRequest, limiter, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { DriveAccessCtx, requireNode, type NodeLite } from '../lib/drive/access.js';
import { buildItems, itemSelect } from '../lib/drive/items.js';
import { createFileIn, readNodeBuffer } from '../lib/drive/files.js';
import { ensureCaseFolder } from '../lib/drive/caseFolders.js';
import { STAGE_FOLDER } from '../lib/drive/cases.js';
import { findSibling } from '../lib/drive/names.js';
import { compareVersions, resolveVersion } from '../lib/driveIntel/compare.js';
import { caseValues, fillDocx, fillPdfForm, inspectTemplate, templateFormat, valueFor, type TemplateFormat } from '../lib/driveIntel/template.js';
import { rememberDriveEsign, requestIdsOfNodes } from '../lib/driveIntel/signedCopy.js';
import { DEFAULT_EXPIRY_DAYS, MAX_PDF_BYTES, MAX_SIGNERS, createRequest, sendRequest, staffDetail, type Actor } from '../lib/esign/service.js';
import { metaOf } from '../lib/esign/http.js';

/**
 * Document intelligence of the team drive (/api/drive/intel), same access rules as /api/drive (STAFF + 2FA,
 * every node checked with the drive permission engine):
 *
 *   GET  /compare/:nodeId?a=<versionId|current>&b=<versionId|current>   version comparison (VIEW)
 *   GET  /template/:nodeId/fields?caseId=                               placeholders / form fields (VIEW)
 *   POST /template/:nodeId/fill       { caseId, inputs?, targetFolderId?, lang? }   filled copy (DOWNLOAD + EDIT on target)
 *   POST /template/:nodeId/fill-bulk  { caseIds, inputs?, lang? }        one copy per case, each in the client's folder
 *   POST /esign/:nodeId               { title, signers, message?, expiresInDays?, order?, caseId?, companyId? }
 *   GET  /esign-status?ids=a,b                                          signature requests of drive files
 *
 * Full-text search lives in the normal drive search (GET /api/drive/search), fed by jobs/driveIndex.ts.
 */
export const driveIntelRouter = Router();
driveIntelRouter.use(requireMinRole('STAFF'));

const heavy = limiter({ windowMs: 60 * 1000, limit: 30, skip: () => config.isTest });
const ctxOf = (req: Request) => new DriveAccessCtx({ id: req.user!.id, role: req.user!.role });
const idSchema = z.string().trim().min(1).max(120);
const nodeParam = (req: Request) => {
  const id = String(req.params.nodeId ?? '');
  if (!id || id.length > 120) throw notFound('NODE_NOT_FOUND');
  return id;
};

const loadItem = async (req: Request, id: string) => {
  const row = await prisma.driveNode.findUniqueOrThrow({ where: { id }, select: itemSelect });
  const [item] = await buildItems(ctxOf(req), [row]);
  return item ?? null;
};

const fileNode = async (req: Request, need: 'VIEW' | 'DOWNLOAD') => {
  const ctx = ctxOf(req);
  const { node } = await requireNode(ctx, nodeParam(req), need);
  if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
  const meta = await prisma.driveNode.findUniqueOrThrow({ where: { id: node.id }, select: { mimeType: true, size: true } });
  return { ctx, node, mimeType: meta.mimeType, size: meta.size ?? 0 };
};

// ─── Version comparison ──────────────────────────────────────────────

driveIntelRouter.get('/compare/:nodeId', heavy, async (req, res) => {
  const { node } = await fileNode(req, 'VIEW');
  const q = parse(z.object({ a: z.string().trim().min(1).max(60).default('current'), b: z.string().trim().min(1).max(60).default('current') }), req.query);
  const [a, b] = await Promise.all([resolveVersion(node.id, q.a), resolveVersion(node.id, q.b)]);
  // left = older, right = newer
  const [older, newer] = a.version <= b.version ? [a, b] : [b, a];
  const result = await compareVersions(node, older, newer);
  const side = (v: typeof a) => ({ ref: v.ref, version: v.version, createdAt: v.createdAt, size: v.size, mimeType: v.mimeType, url: v.url });
  res.json({ node: { id: node.id, name: node.name }, a: side(older), b: side(newer), result });
});

// ─── Templates ───────────────────────────────────────────────────────

const staffOf = (req: Request) => ({ firstName: req.user!.firstName, lastName: req.user!.lastName });
const langSchema = z.enum(['de', 'en', 'az', 'ru']).default('de');

const templateSource = async (req: Request) => {
  const f = await fileNode(req, 'VIEW');
  const format = templateFormat(f.node.name, f.mimeType);
  const { buf } = await readNodeBuffer(f.node.id, config.drive.maxFileSize);
  return { ...f, format, buf };
};

driveIntelRouter.get('/template/:nodeId/fields', async (req, res) => {
  const q = parse(z.object({ caseId: idSchema.optional(), lang: langSchema }), req.query);
  const { node, format, buf } = await templateSource(req);
  const info = await inspectTemplate(buf, format);
  let values: Record<string, string> | null = null;
  let clientName: string | null = null;
  if (q.caseId && info.supported) {
    const cv = await caseValues(q.caseId, staffOf(req), q.lang);
    values = cv.values;
    clientName = cv.clientName;
  }
  res.json({
    node: { id: node.id, name: node.name },
    ...info,
    clientName,
    fields: info.fields.map((f) => {
      const value = values ? valueFor(f.key, values, {}) : null;
      return { ...f, value: value || null, status: values ? (value ? 'filled' : f.optional ? 'optional' : 'missing') : f.known && !f.input ? 'known' : 'input' };
    }),
  });
});

const inputsSchema = z.record(z.string().min(1).max(120), z.string().max(2000)).default({});

/** The client's folder of a case → its "Sonstiges" stage folder (created when missing). */
const clientTargetFolder = async (ctx: DriveAccessCtx, caseId: string): Promise<NodeLite> => {
  const folderId = await ensureCaseFolder(caseId);
  if (!folderId) throw notFound('CASE_NOT_FOUND');
  const name = STAGE_FOLDER.OTHER;
  let stage = await findSibling(folderId, name);
  if (!stage || stage.kind !== 'FOLDER') {
    const parent = await prisma.driveNode.findUniqueOrThrow({ where: { id: folderId }, select: { space: true, ownerId: true } });
    try {
      stage = await prisma.driveNode.create({ data: { space: parent.space, ownerId: parent.ownerId, kind: 'FOLDER', name, parentId: folderId }, select: { id: true, kind: true, name: true } });
    } catch {
      stage = await findSibling(folderId, name);
    }
  }
  const { node } = await requireNode(ctx, stage!.id, 'EDIT');
  return node;
};

const targetFolder = async (ctx: DriveAccessCtx, id: string) => {
  const { node } = await requireNode(ctx, id, 'EDIT');
  if (node.kind !== 'FOLDER') throw badRequest('NOT_A_FOLDER');
  return node;
};

const MIME: Record<TemplateFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

const outName = (templateName: string, clientName: string, format: TemplateFormat) => {
  const base = templateName.replace(/\.(docx|pdf)$/i, '') || 'Dokument';
  const clean = `${base} – ${clientName}`.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 190);
  return `${clean}.${format}`;
};

/** Fills the template for one case and stores the result. */
const fillOne = async (
  req: Request,
  ctx: DriveAccessCtx,
  tpl: { node: NodeLite; format: TemplateFormat; buf: Buffer },
  caseId: string,
  inputs: Record<string, string>,
  lang: 'de' | 'en' | 'az' | 'ru',
  targetFolderId?: string,
) => {
  const { values, clientName } = await caseValues(caseId, staffOf(req), lang);
  const parent = targetFolderId ? await targetFolder(ctx, targetFolderId) : await clientTargetFolder(ctx, caseId);
  const result = tpl.format === 'docx' ? await fillDocx(tpl.buf, values, inputs) : await fillPdfForm(tpl.buf, values, inputs);
  if (result.buf.length > config.drive.maxFileSize) throw new HttpError(413, 'FILE_TOO_LARGE');
  const created = await createFileIn(parent, outName(tpl.node.name, clientName, tpl.format), result.buf, MIME[tpl.format], req.user!.id);
  await audit(req, 'DRIVE_TEMPLATE_FILLED', `drive:${created.id}`, { templateId: tpl.node.id, caseId, name: created.name, parentId: parent.id, filled: result.filled.length, missing: result.missing });
  return { id: created.id, name: created.name, parentId: parent.id, filled: result.filled, missing: result.missing };
};

const fillableTemplate = async (req: Request) => {
  const t = await templateSource(req);
  await requireNode(t.ctx, t.node.id, 'DOWNLOAD');
  if (!t.format) throw badRequest('NOT_A_TEMPLATE');
  const info = await inspectTemplate(t.buf, t.format);
  if (!info.supported) throw badRequest(info.reason ?? 'NOT_A_TEMPLATE');
  return { ...t, format: t.format };
};

driveIntelRouter.post('/template/:nodeId/fill', heavy, async (req, res) => {
  const body = parse(z.object({ caseId: idSchema, inputs: inputsSchema, targetFolderId: idSchema.optional(), lang: langSchema }), req.body);
  const tpl = await fillableTemplate(req);
  const out = await fillOne(req, tpl.ctx, tpl, body.caseId, body.inputs, body.lang, body.targetFolderId);
  res.status(201).json({ ...out, item: await loadItem(req, out.id) });
});

driveIntelRouter.post('/template/:nodeId/fill-bulk', heavy, async (req, res) => {
  const body = parse(z.object({ caseIds: z.array(idSchema).min(1).max(50), inputs: inputsSchema, lang: langSchema }), req.body);
  const tpl = await fillableTemplate(req);
  const results: { caseId: string; ok: boolean; id?: string; name?: string; parentId?: string; missing?: string[]; error?: string }[] = [];
  for (const caseId of [...new Set(body.caseIds)]) {
    try {
      const out = await fillOne(req, tpl.ctx, tpl, caseId, body.inputs, body.lang);
      results.push({ caseId, ok: true, id: out.id, name: out.name, parentId: out.parentId, missing: out.missing });
    } catch (err) {
      if (err instanceof HttpError) results.push({ caseId, ok: false, error: err.code });
      else throw err;
    }
  }
  res.status(201).json({ results });
});

// ─── E-signature from the drive ──────────────────────────────────────

const signerSchema = z.object({
  role: z.enum(['CANDIDATE', 'COMPANY', 'STAFF', 'OTHER']),
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().toLowerCase().email().max(191),
  phone: z.string().trim().max(32).nullish(),
  userId: z.string().trim().min(1).max(40).nullish(),
  locale: z.enum(['az', 'de', 'en', 'ru']).nullish(),
  order: z.number().int().min(1).max(99).nullish(),
});

const esignSchema = z.object({
  title: z.string().trim().min(2).max(200),
  caseId: z.string().trim().min(1).max(40).nullish(),
  companyId: z.string().trim().min(1).max(40).nullish(),
  message: z.string().trim().max(4000).nullish(),
  expiresInDays: z.number().int().min(1).max(90).default(DEFAULT_EXPIRY_DAYS),
  order: z.enum(['SEQUENTIAL', 'PARALLEL']).default('SEQUENTIAL'),
  signers: z.array(signerSchema).min(1).max(MAX_SIGNERS),
});

driveIntelRouter.post('/esign/:nodeId', heavy, async (req, res) => {
  const body = parse(esignSchema, req.body);
  const { node, mimeType, size } = await fileNode(req, 'DOWNLOAD');
  if (mimeType !== 'application/pdf' && !/\.pdf$/i.test(node.name)) throw badRequest('INVALID_PDF');
  if (size > MAX_PDF_BYTES) throw new HttpError(413, 'FILE_TOO_LARGE');
  const { buf } = await readNodeBuffer(node.id, MAX_PDF_BYTES);
  const actor: Actor = { id: req.user!.id, role: req.user!.role, firstName: req.user!.firstName, lastName: req.user!.lastName };
  const meta = { ...metaOf(req), actorId: actor.id };
  const created = await createRequest(
    {
      title: body.title,
      caseId: body.caseId ?? null,
      companyId: body.companyId ?? null,
      message: body.message ?? null,
      expiresAt: new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000),
      order: body.order,
      caseContract: false,
      signers: body.signers,
      pdf: buf,
      fileName: node.name,
    },
    actor,
    meta,
  );
  try {
    await sendRequest(created.id, actor, meta);
  } catch (err) {
    // Nothing was sent: do not leave a half-made draft behind (same as POST /api/admin/signatures).
    await prisma.signatureRequest.delete({ where: { id: created.id } }).catch(() => undefined);
    await fsp.unlink(path.join(config.uploads.privateDir, created.originalKey)).catch(() => undefined);
    throw err;
  }
  await rememberDriveEsign(created.id, { nodeId: node.id, parentId: node.parentId, name: node.name, userId: actor.id });
  void audit(req, 'signature.create', created.id, { title: created.title, caseId: created.caseId, sent: true, driveNodeId: node.id });
  await audit(req, 'DRIVE_ESIGN_SENT', `drive:${node.id}`, { requestId: created.id, signers: body.signers.length });
  res.status(201).json({ request: await staffDetail(created.id) });
});

driveIntelRouter.get('/esign-status', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.string().max(12_000).default('') }), req.query);
  const list = [...new Set(ids.split(',').map((s) => s.trim()).filter((s) => s && s.length <= 120))].slice(0, 300);
  const statuses: Record<string, { requestId: string; status: string; signed: number; total: number; open: boolean }> = {};
  if (list.length) {
    const ctx = ctxOf(req);
    await ctx.load(list);
    const visible = list.filter((id) => ctx.level(id));
    const byNode = await requestIdsOfNodes(visible);
    const reqIds = [...byNode.values()].flatMap((x) => x.slice(-3));
    const reqs = reqIds.length
      ? await prisma.signatureRequest.findMany({ where: { id: { in: reqIds } }, select: { id: true, status: true, signers: { select: { status: true } } } })
      : [];
    const byId = new Map(reqs.map((r) => [r.id, r]));
    for (const [nodeId, rids] of byNode) {
      // the newest request that still exists
      const r = [...rids].reverse().map((id) => byId.get(id)).find(Boolean);
      if (!r) continue;
      statuses[nodeId] = {
        requestId: r.id,
        status: r.status,
        signed: r.signers.filter((s) => s.status === 'SIGNED').length,
        total: r.signers.length,
        open: r.status === 'SENT' || r.status === 'DRAFT',
      };
    }
  }
  res.json({ statuses });
});

