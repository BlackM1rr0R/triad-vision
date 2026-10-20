import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { CaseAiKind, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { hasMinRole, requireMinRole } from '../../middleware/auth.js';
import { decodeOriginalName } from '../../middleware/upload.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, HttpError, limiter, notFound, parse } from '../../lib/http.js';
import { DriveAccessCtx, requireNode } from '../../lib/drive/access.js';
import { readNodeBuffer } from '../../lib/drive/files.js';
import {
  caseAiSettingsUpdateSchema,
  getCaseAiSettings,
  publicCaseAiSettings,
  saveCaseAiSettings,
} from '../../lib/ai/features/caseAi/config.js';
import { loadCaseContext, readDoc } from '../../lib/ai/features/caseAi/data.js';
import { aiAvailability, findingStates, latestRuns, loadRun, runDto, saveRun, setFindingState, caseEvent, type Finding } from '../../lib/ai/features/caseAi/runs.js';
import { runConsistencyCheck, type ConsistencyResult } from '../../lib/ai/features/caseAi/consistency.js';
import { MAX_CONTRACT_BYTES, runContractCheck, type ContractResult } from '../../lib/ai/features/caseAi/contract.js';
import { FIELD_DEFS, FIELD_KEYS, runVidex, videxFileName, videxPdf, type VidexResult } from '../../lib/ai/features/caseAi/videx.js';
import { applyFieldValue, askClientForFields, createCaseTask, requestDocument } from '../../lib/ai/features/caseAi/actions.js';
import { dmy } from '../../lib/ai/features/caseAi/texts.js';

/**
 * Case AI checks — mounted on the admin router (STAFF+, 2FA enforced there):
 *
 *   GET    /cases/:id/ai                               overview: availability, latest run per kind, finding states, contract PDFs
 *   POST   /cases/:id/ai/consistency                   cross-document consistency check (rules + AI)
 *   POST   /cases/:id/ai/contract                      contract check; JSON { documentId? | nodeId? } or multipart "file" (PDF); default: the case contract
 *   POST   /cases/:id/ai/contract/:runId/override      "send for signature anyway" (audited, timeline)
 *   POST   /cases/:id/ai/videx                         VIDEX data sheet + embassy checklist
 *   PATCH  /cases/:id/ai/videx/:runId/fields           { key, value } staff edit of one field
 *   GET    /cases/:id/ai/videx/:runId/pdf              data sheet as PDF (German labels)
 *   POST   /cases/:id/ai/videx/:runId/ask              { keys[] } case message asking the client for the answers
 *   PUT    /cases/:id/ai/findings/state                { kind, key, status: OK|FIXED|IGNORED|null }
 *   POST   /cases/:id/ai/findings/apply                { runId, key, value? } writes the proposed profile / case value
 *   POST   /cases/:id/ai/findings/request-document     { runId, key } | { runId, checklistKey }
 *   POST   /cases/:id/ai/tasks                         { runId, key?, target: finding|contractIssue|employer|checklist }
 *   GET    /case-ai/settings                           thresholds + embassy checklists;  PUT (ADMIN+)
 *
 * The model never writes: runs only store proposals; each write above is a staff click, audited as AI_CASE_*.
 * AI failures (limits, timeout, not configured) come back as `reason` with HTTP 200 so the UI can explain them.
 */
export const adminCaseAiRouter = Router();

const runLimiter = limiter({ windowMs: 60 * 1000, limit: 12, skip: () => config.isTest });
const ESTIMATE_USD: Record<CaseAiKind, number> = { CONSISTENCY: 0.01, CONTRACT: 0.04, VIDEX: 0.005 };

const ensureCase = async (id: string) => {
  const c = await prisma.case.findUnique({ where: { id }, select: { id: true, number: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  return c;
};

const staffName = (req: Request) => `${req.user!.firstName} ${req.user!.lastName}`.trim();
const actorOf = (req: Request) => ({ id: req.user!.id, firstName: req.user!.firstName, lastName: req.user!.lastName });

/** PDFs of the case that can be checked as a contract (current contract first). */
const contractCandidates = async (caseId: string) => {
  const [docs, contract] = await Promise.all([
    prisma.document.findMany({
      where: { caseId, mimeType: 'application/pdf', stage: { in: ['CONTRACT', 'OTHER', 'EMBASSY', 'INITIAL'] } },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { id: true, originalName: true, stage: true, createdAt: true },
    }),
    prisma.contract.findUnique({ where: { caseId }, select: { fileDocumentId: true } }),
  ]);
  return docs
    .map((d) => ({ id: d.id, name: d.originalName, stage: d.stage, createdAt: d.createdAt, current: d.id === contract?.fileDocumentId }))
    .sort((a, b) => Number(b.current) - Number(a.current) || Number(b.stage === 'CONTRACT') - Number(a.stage === 'CONTRACT'));
};

adminCaseAiRouter.get('/cases/:id/ai', async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  const [avail, own, runs, states, contracts] = await Promise.all([aiAvailability(req.user!.id), getCaseAiSettings(), latestRuns(c.id), findingStates(c.id), contractCandidates(c.id)]);
  res.json({
    ai: { ...avail, enabled: own.enabled },
    runs,
    states,
    contracts,
    estimatesUsd: ESTIMATE_USD,
    canEditSettings: hasMinRole(req.user!.role, 'ADMIN'),
  });
});

// ─── 1. Consistency ────────────────────────────────────────────────

adminCaseAiRouter.post('/cases/:id/ai/consistency', runLimiter, async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  const ctx = await loadCaseContext(c.id);
  const result = await runConsistencyCheck(ctx, req.user!.id);
  const run = await saveRun({ caseId: c.id, kind: 'CONSISTENCY', result, model: result.ai.model, costUsd: result.ai.costUsd, createdById: req.user!.id });
  await audit(req, 'AI_CASE_CONSISTENCY_RUN', c.id, { runId: run.id, findings: result.findings.length, blockers: result.findings.filter((f) => f.severity === 'BLOCKER').length, ai: result.ai.status, reason: result.ai.reason ?? null });
  res.status(201).json({ run: runDto(run), states: await findingStates(c.id) });
});

// ─── 2. Contract ───────────────────────────────────────────────────

const contractUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CONTRACT_BYTES, files: 1 } }).single('file');
const receiveContract = (req: Request, res: Response, next: NextFunction) =>
  contractUpload(req, res, (err: unknown) => {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'FILE_TOO_LARGE'));
    if (code) return next(badRequest('INVALID_UPLOAD'));
    next(err);
  });

const isPdf = (buf: Buffer) => buf.subarray(0, 1024).includes('%PDF');

adminCaseAiRouter.post('/cases/:id/ai/contract', runLimiter, receiveContract, async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  const body = parse(z.object({ documentId: z.string().trim().min(1).max(40).optional(), nodeId: z.string().trim().min(1).max(120).optional() }), req.body ?? {});
  let file: { buf: Buffer; name: string; documentId?: string | null; nodeId?: string | null };
  if (req.file) {
    if (!isPdf(req.file.buffer)) throw badRequest('CONTRACT_MUST_BE_PDF');
    file = { buf: req.file.buffer, name: decodeOriginalName(req.file.originalname).slice(0, 200) || 'contract.pdf' };
  } else if (body.nodeId) {
    const ctx = new DriveAccessCtx({ id: req.user!.id, role: req.user!.role });
    const { node } = await requireNode(ctx, body.nodeId, 'DOWNLOAD');
    if (node.kind !== 'FILE') throw badRequest('NOT_A_FILE');
    const { row, buf } = await readNodeBuffer(node.id, MAX_CONTRACT_BYTES);
    if (!isPdf(buf)) throw badRequest('CONTRACT_MUST_BE_PDF');
    file = { buf, name: row.name, nodeId: node.id };
  } else {
    const docId = body.documentId ?? (await contractCandidates(c.id)).find((d) => d.current || d.stage === 'CONTRACT')?.id;
    if (!docId) throw conflict('NO_CONTRACT');
    const doc = await prisma.document.findUnique({ where: { id: docId }, select: { id: true, caseId: true, mimeType: true, storedName: true, originalName: true } });
    if (!doc || doc.caseId !== c.id) throw notFound('DOCUMENT_NOT_FOUND');
    if (doc.mimeType !== 'application/pdf') throw badRequest('CONTRACT_MUST_BE_PDF');
    const buf = await readDoc(doc.storedName);
    if (!buf) throw notFound('FILE_NOT_FOUND');
    file = { buf, name: doc.originalName, documentId: doc.id };
  }
  const avail = await aiAvailability(req.user!.id);
  if (!avail.available) {
    res.json({ run: null, reason: avail.reason });
    return;
  }
  const [ctx, settings] = await Promise.all([loadCaseContext(c.id), getCaseAiSettings()]);
  const out = await runContractCheck(ctx, settings, file, { id: req.user!.id, name: staffName(req) });
  if (!out.ok) {
    await audit(req, 'AI_CASE_CONTRACT_RUN', c.id, { failed: out.reason, documentId: file.documentId ?? null });
    res.json({ run: null, reason: out.reason });
    return;
  }
  const run = await saveRun({ caseId: c.id, kind: 'CONTRACT', result: out.result, model: out.result.ai.model, costUsd: out.result.ai.costUsd, createdById: req.user!.id, subjectId: file.documentId ?? file.nodeId ?? null });
  await audit(req, 'AI_CASE_CONTRACT_RUN', c.id, { runId: run.id, light: out.result.light, issues: out.result.issues.map((i) => i.code), documentId: file.documentId ?? null, nodeId: file.nodeId ?? null });
  res.status(201).json({ run: runDto(run), states: await findingStates(c.id) });
});

adminCaseAiRouter.post('/cases/:id/ai/contract/:runId/override', async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  const run = await loadRun(c.id, String(req.params.runId), 'CONTRACT');
  if (!run) throw notFound('RUN_NOT_FOUND');
  const r = run.result as unknown as ContractResult;
  await audit(req, 'AI_CASE_CONTRACT_OVERRIDE', c.id, { runId: run.id, light: r.light, issues: r.issues.map((i) => i.code) });
  await caseEvent(c.id, 'AI_CASE_CONTRACT_OVERRIDE', req.user!.id, `Vertrag trotz KI-Hinweisen zur Unterschrift gesendet (${r.light}, ${r.issues.length} Hinweise): ${r.file.name}`);
  res.json({ ok: true });
});

// ─── 3. VIDEX ──────────────────────────────────────────────────────

adminCaseAiRouter.post('/cases/:id/ai/videx', runLimiter, async (req, res) => {
  const c = await ensureCase(String(req.params.id));
  const [ctx, settings, lastContract] = await Promise.all([
    loadCaseContext(c.id),
    getCaseAiSettings(),
    prisma.caseAiRun.findFirst({ where: { caseId: c.id, kind: 'CONTRACT' }, orderBy: { createdAt: 'desc' } }),
  ]);
  const terms = lastContract ? ((lastContract.result as unknown as ContractResult).terms ?? null) : null;
  const result = await runVidex(ctx, settings, terms, req.user!.id);
  const run = await saveRun({ caseId: c.id, kind: 'VIDEX', result, model: result.ai.model, costUsd: result.ai.costUsd, createdById: req.user!.id });
  await audit(req, 'AI_CASE_VIDEX_RUN', c.id, { runId: run.id, missing: result.fields.filter((f) => !f.value && f.required).map((f) => f.key), ai: result.ai.status, reason: result.ai.reason ?? null });
  res.status(201).json({ run: runDto(run), states: await findingStates(c.id) });
});

const videxRun = async (req: Request) => {
  const c = await ensureCase(String(req.params.id));
  const run = await loadRun(c.id, String(req.params.runId), 'VIDEX');
  if (!run) throw notFound('RUN_NOT_FOUND');
  return { c, run, result: run.result as unknown as VidexResult };
};

adminCaseAiRouter.patch('/cases/:id/ai/videx/:runId/fields', async (req, res) => {
  const body = parse(z.object({ key: z.enum(FIELD_KEYS as [string, ...string[]]), value: z.string().max(200) }), req.body ?? {});
  const { c, run, result } = await videxRun(req);
  const field = result.fields.find((f) => f.key === body.key);
  if (!field) throw notFound('FIELD_NOT_FOUND');
  const before = field.value;
  field.value = body.value.replace(/\s+/g, ' ').trim();
  field.source = field.value ? 'manual' : null;
  field.confidence = field.value ? 'high' : null;
  field.editedAt = new Date().toISOString();
  field.editedById = req.user!.id;
  const updated = await prisma.caseAiRun.update({ where: { id: run.id }, data: { result: result as unknown as Prisma.InputJsonValue } });
  await audit(req, 'AI_CASE_VIDEX_EDIT', c.id, { runId: run.id, key: body.key, before, after: field.value });
  res.json({ run: runDto(updated) });
});

adminCaseAiRouter.get('/cases/:id/ai/videx/:runId/pdf', async (req, res) => {
  const { c, run, result } = await videxRun(req);
  const client = await prisma.case.findUniqueOrThrow({ where: { id: c.id }, select: { client: { select: { firstName: true, lastName: true } } } });
  const pdf = await videxPdf(result, { caseNumber: c.number, clientName: `${client.client.firstName} ${client.client.lastName}`, date: run.updatedAt });
  await audit(req, 'AI_CASE_VIDEX_PDF', c.id, { runId: run.id });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${videxFileName(c.number)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

adminCaseAiRouter.post('/cases/:id/ai/videx/:runId/ask', async (req, res) => {
  const body = parse(z.object({ keys: z.array(z.enum(FIELD_KEYS as [string, ...string[]])).min(1).max(FIELD_DEFS.length) }), req.body ?? {});
  const { c, run } = await videxRun(req);
  const labels = FIELD_DEFS.filter((d) => body.keys.includes(d.key)).map((d) => d.label);
  const message = await askClientForFields(c.id, labels, req.user!.id);
  await audit(req, 'AI_CASE_INFO_REQUESTED', c.id, { runId: run.id, keys: body.keys });
  res.status(201).json({ message });
});

// ─── Findings: state, apply, request document, task ───────────────

const KINDS = ['CONSISTENCY', 'CONTRACT', 'VIDEX'] as const;

adminCaseAiRouter.put('/cases/:id/ai/findings/state', async (req, res) => {
  const body = parse(z.object({ kind: z.enum(KINDS), key: z.string().trim().min(1).max(191), status: z.enum(['OK', 'FIXED', 'IGNORED']).nullable() }), req.body ?? {});
  const c = await ensureCase(String(req.params.id));
  await setFindingState(c.id, body.kind, body.key, body.status, req.user!.id);
  await audit(req, 'AI_CASE_FINDING_STATE', c.id, body);
  res.json({ states: await findingStates(c.id) });
});

const consistencyFinding = async (caseId: string, runId: string, key: string) => {
  const run = await loadRun(caseId, runId, 'CONSISTENCY');
  if (!run) throw notFound('RUN_NOT_FOUND');
  const finding = (run.result as unknown as ConsistencyResult).findings.find((f) => f.key === key);
  if (!finding) throw notFound('FINDING_NOT_FOUND');
  return { run, finding };
};

adminCaseAiRouter.post('/cases/:id/ai/findings/apply', async (req, res) => {
  const body = parse(z.object({ runId: z.string().min(1).max(40), key: z.string().min(1).max(191), value: z.string().max(300).optional() }), req.body ?? {});
  const c = await ensureCase(String(req.params.id));
  const { run, finding } = await consistencyFinding(c.id, body.runId, body.key);
  const fix = finding.suggestedFix;
  if (fix?.kind !== 'PROFILE_FIELD' || !fix.field) throw badRequest('NO_VALUE_TO_APPLY');
  const changed = await applyFieldValue(c.id, fix.field, body.value ?? fix.value, req.user!.id);
  await setFindingState(c.id, 'CONSISTENCY', finding.key, 'FIXED', req.user!.id, `${changed.field}=${changed.after}`);
  await audit(req, 'AI_CASE_APPLY_VALUE', c.id, { runId: run.id, key: finding.key, ...changed, proposed: fix.value ?? null, source: finding.source });
  res.json({ applied: changed, states: await findingStates(c.id) });
});

adminCaseAiRouter.post('/cases/:id/ai/findings/request-document', async (req, res) => {
  const body = parse(
    z.object({ runId: z.string().min(1).max(40), key: z.string().min(1).max(191).optional(), checklistKey: z.string().min(1).max(40).optional() }).refine((b) => !!b.key !== !!b.checklistKey, 'ONE_OF_KEY_OR_CHECKLIST'),
    req.body ?? {},
  );
  const c = await ensureCase(String(req.params.id));
  let input: Parameters<typeof requestDocument>[1];
  let stateKind: CaseAiKind;
  let stateKey: string;
  if (body.key) {
    const { finding } = await consistencyFinding(c.id, body.runId, body.key);
    const fix = finding.suggestedFix;
    input = fix?.kind === 'REQUEST_DOCUMENT' ? { requirementId: fix.requirementId, requirementKey: fix.requirementKey, title: fix.title ?? finding.message } : { title: finding.message };
    stateKind = 'CONSISTENCY';
    stateKey = finding.key;
  } else {
    const run = await loadRun(c.id, body.runId, 'VIDEX');
    if (!run) throw notFound('RUN_NOT_FOUND');
    const item = (run.result as unknown as VidexResult).checklist.find((i) => i.key === body.checklistKey);
    if (!item) throw notFound('CHECKLIST_ITEM_NOT_FOUND');
    input = { requirementKey: item.requirementKey ?? undefined, title: item.label };
    stateKind = 'VIDEX';
    stateKey = `checklist:${item.key}`;
  }
  const out = await requestDocument(c.id, input, req.user!.id);
  await setFindingState(c.id, stateKind, stateKey, 'FIXED', req.user!.id, 'REQUESTED');
  await audit(req, 'AI_CASE_REQUEST_DOCUMENT', c.id, { runId: body.runId, key: stateKey, requirementId: out.requirement.id, created: out.created });
  res.status(201).json({ requirement: out.requirement, created: out.created, states: await findingStates(c.id) });
});

const evidenceLines = (f: Finding) => f.evidence.map((e) => `– ${e.documentName}: ${e.value}`).join('\n');

adminCaseAiRouter.post('/cases/:id/ai/tasks', async (req, res) => {
  const body = parse(
    z.object({ runId: z.string().min(1).max(40), target: z.enum(['finding', 'contractIssue', 'employer', 'checklist']), key: z.string().min(1).max(191).optional() }),
    req.body ?? {},
  );
  const c = await ensureCase(String(req.params.id));
  let title: string;
  let description: string;
  if (body.target === 'finding') {
    if (!body.key) throw badRequest('KEY_REQUIRED');
    const { finding } = await consistencyFinding(c.id, body.runId, body.key);
    title = `[KI] ${c.number}: ${finding.message.de}`;
    description = [finding.message.de, evidenceLines(finding)].filter(Boolean).join('\n\n');
  } else if (body.target === 'checklist') {
    const run = await loadRun(c.id, body.runId, 'VIDEX');
    const item = run ? (run.result as unknown as VidexResult).checklist.find((i) => i.key === body.key) : null;
    if (!item) throw notFound('CHECKLIST_ITEM_NOT_FOUND');
    title = `[KI] ${c.number}: Botschaft – ${item.label.de}`;
    description = `Unterlage für die Botschaft besorgen / prüfen: ${item.label.de}`;
  } else {
    const run = await loadRun(c.id, body.runId, 'CONTRACT');
    if (!run) throw notFound('RUN_NOT_FOUND');
    const r = run.result as unknown as ContractResult;
    if (body.target === 'employer') {
      title = `Arbeitgeber: Vertrag anpassen – ${c.number}`;
      description = `${r.email.to ? `An: ${r.email.to}\n` : ''}Betreff: ${r.email.subject}\n\n${r.email.body}`;
    } else {
      const issue = r.issues.find((i) => i.code === body.key);
      if (!issue) throw notFound('FINDING_NOT_FOUND');
      title = `[KI] Vertrag ${c.number}: ${issue.message.de}`;
      description = [issue.message.de, issue.quote ? `Vertragstext: „${issue.quote}“` : '', `Datei: ${r.file.name} (geprüft ${dmy(r.generatedAt)})`].filter(Boolean).join('\n\n');
    }
  }
  const task = await createCaseTask(c.id, { title, description }, actorOf(req));
  await audit(req, 'AI_CASE_TASK_CREATED', c.id, { runId: body.runId, target: body.target, key: body.key ?? null, taskId: task.id });
  res.status(201).json({ task });
});

// ─── Settings ──────────────────────────────────────────────────────

adminCaseAiRouter.get('/case-ai/settings', async (req, res) => {
  res.json({ settings: publicCaseAiSettings(await getCaseAiSettings()), canEdit: hasMinRole(req.user!.role, 'ADMIN') });
});

adminCaseAiRouter.put('/case-ai/settings', requireMinRole('ADMIN'), async (req, res) => {
  const patch = parse(caseAiSettingsUpdateSchema, req.body ?? {});
  const next = await saveCaseAiSettings(patch);
  await audit(req, 'AI_CASE_SETTINGS', 'ai.caseChecks', { keys: Object.keys(patch) });
  res.json({ settings: publicCaseAiSettings(next), canEdit: true });
});
