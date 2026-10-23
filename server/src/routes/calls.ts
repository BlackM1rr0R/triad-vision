import { Router, type Request } from 'express';
import { Readable } from 'node:stream';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { requireMinRole } from '../middleware/auth.js';
import { badRequest, forbidden, limiter, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { config } from '../config.js';
import { createAutomationTask } from '../lib/automation/tasks.js';
import { getCallsSettings, providerReady, publicSettings, saveCallsSettings, settingsInput } from '../lib/calls/settings.js';
import { canEdit, logManual, setOutcome, startCall, toDto } from '../lib/calls/service.js';
import { summarizeCall } from '../lib/calls/summary.js';
import { providerFor } from '../lib/calls/providers/index.js';
import { normalizePhone } from '../lib/messaging/providers.js';

/**
 * Staff telephony API (/api/calls):
 *   GET    /status              provider configured?, recording + legal notice, own phone set?
 *   GET    /settings  PUT /settings   (ADMIN) provider, credentials (sealed), caller ID, recording, office hours
 *   GET    /                    call log (?clientId= &caseId= &inquiryId= &mine=1)
 *   POST   /                    click-to-call (rings the staff member's phone, then the client)
 *   POST   /log                 a call made outside the provider, logged by hand (outcome + note)
 *   GET    /:id   PATCH /:id    detail; outcome / note / transcript after the call
 *   POST   /:id/summarize       AI summary + follow-ups from the transcript
 *   POST   /:id/tasks           follow-up → team task
 *   GET    /:id/recording       streams the provider recording (call's staff member or ADMIN+, audited)
 *   GET    /callbacks   PATCH /callbacks/:id     "call me back" requests: list, mark outcome / cancel
 * Provider webhooks live in routes/callWebhooks.ts (no session, signature-checked).
 */
export const callsRouter = Router();
callsRouter.use(requireMinRole('STAFF'));

const isAdmin = (req: Request) => req.user!.role === 'ADMIN' || req.user!.role === 'SUPER_ADMIN';
const requireAdmin = (req: Request) => {
  if (!isAdmin(req)) throw forbidden('ADMIN_ONLY');
};
const idParam = (req: Request) => {
  const id = String(req.params.id ?? '');
  if (!id || id.length > 40) throw notFound('CALL_NOT_FOUND');
  return id;
};
const loadCall = async (req: Request) => {
  const call = await prisma.call.findUnique({ where: { id: idParam(req) } });
  if (!call) throw notFound('CALL_NOT_FOUND');
  return call;
};

const OUTCOMES = ['REACHED', 'NO_ANSWER', 'WRONG_NUMBER', 'CALL_BACK'] as const;
const optId = z.string().trim().min(1).max(40).optional();
const targetSchema = z
  .object({ clientId: optId, caseId: optId, inquiryId: optId, callbackId: optId, liveChatId: optId, phone: z.string().trim().max(40).optional() })
  .strict()
  .refine((t) => t.clientId || t.caseId || t.inquiryId || t.callbackId || t.liveChatId || t.phone, { message: 'TARGET_REQUIRED' });
const noteText = z
  .string()
  .max(4000)
  .transform((s) => s.replace(/\r\n/g, '\n').trim() || null)
  .nullable();

// ─── Status + settings ─────────────────────────────────────────────────

callsRouter.get('/status', async (req, res) => {
  const [s, me] = await Promise.all([getCallsSettings(), prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { phone: true } })]);
  res.json({
    configured: providerReady(s),
    provider: s.provider,
    recording: s.recording,
    recordingNotice: s.recordingNotice,
    staffPhone: normalizePhone(me.phone ?? '') ? me.phone : null,
    canConfigure: isAdmin(req),
  });
});

callsRouter.get('/settings', async (req, res) => {
  requireAdmin(req);
  res.json({ settings: publicSettings(await getCallsSettings()) });
});

callsRouter.put('/settings', async (req, res) => {
  requireAdmin(req);
  const body = parse(settingsInput, req.body);
  const s = await saveCallsSettings(body);
  await audit(req, 'CALLS_SETTINGS_UPDATED', 'setting:calls', {
    provider: s.provider,
    recording: s.recording,
    twilioTokenChanged: !!body.twilio.authToken,
    sipgateTokenChanged: !!body.sipgate.token,
  });
  res.json({ settings: publicSettings(s) });
});

// ─── Call log ──────────────────────────────────────────────────────────

const listQuery = z.object({
  clientId: optId,
  caseId: optId,
  inquiryId: optId,
  mine: z.enum(['1', 'true']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

callsRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const or: Prisma.CallWhereInput[] = [];
  if (q.clientId) or.push({ clientId: q.clientId });
  if (q.caseId) or.push({ caseId: q.caseId });
  if (q.inquiryId) or.push({ inquiryId: q.inquiryId });
  const where: Prisma.CallWhereInput = { ...(or.length ? { OR: or } : {}), ...(q.mine ? { staffId: req.user!.id } : {}) };
  const rows = await prisma.call.findMany({ where, orderBy: { startedAt: 'desc' }, take: q.limit });
  res.json({ calls: await toDto(rows) });
});

const startLimiter = limiter({ windowMs: 60 * 1000, limit: 20, keyGenerator: (req) => `call:${req.user?.id ?? req.ip}`, skip: () => config.isTest });

callsRouter.post('/', startLimiter, async (req, res) => {
  const t = parse(targetSchema, req.body);
  const call = await startCall(req.user!.id, t);
  await audit(req, 'CALL_STARTED', `call:${call.id}`, { clientId: call.client?.id ?? null, caseId: call.case?.id ?? null, inquiryId: call.inquiry?.id ?? null });
  res.status(201).json({ call });
});

const manualSchema = z
  .object({
    target: targetSchema,
    direction: z.enum(['OUTBOUND', 'INBOUND']).default('OUTBOUND'),
    outcome: z.enum(OUTCOMES),
    note: noteText.optional(),
    durationSec: z.number().int().min(0).max(36_000).nullable().optional(),
  })
  .strict();

callsRouter.post('/log', async (req, res) => {
  const body = parse(manualSchema, req.body);
  const call = await logManual(req.user!.id, body.target, { direction: body.direction, outcome: body.outcome, note: body.note ?? null, durationSec: body.durationSec ?? null });
  res.status(201).json({ call });
});

// ─── Callback requests ─────────────────────────────────────────────────

callsRouter.get('/callbacks', async (req, res) => {
  const q = parse(z.object({ status: z.enum(['PENDING', 'DONE', 'CANCELLED', 'ALL']).default('PENDING'), mine: z.enum(['1', 'true']).optional() }), req.query);
  const rows = await prisma.callbackRequest.findMany({
    where: q.status === 'ALL' ? {} : { status: q.status },
    orderBy: q.status === 'PENDING' ? { windowStart: 'asc' } : { createdAt: 'desc' },
    take: 200,
  });
  const filtered = q.mine ? rows.filter((r) => Array.isArray(r.assigneeIds) && (r.assigneeIds as string[]).includes(req.user!.id)) : rows;
  const ids = [...new Set(filtered.flatMap((r) => (Array.isArray(r.assigneeIds) ? (r.assigneeIds as string[]) : [])))];
  const staff = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const byId = new Map(staff.map((s) => [s.id, s]));
  res.json({
    callbacks: filtered.map((r) => ({
      ...r,
      assignees: (Array.isArray(r.assigneeIds) ? (r.assigneeIds as string[]) : []).map((id) => byId.get(id)).filter(Boolean),
    })),
  });
});

const callbackPatch = z
  .object({ outcome: z.enum(OUTCOMES).optional(), note: noteText.optional(), cancel: z.boolean().optional() })
  .strict()
  .refine((b) => b.outcome || b.cancel, { message: 'OUTCOME_REQUIRED' });

callsRouter.patch('/callbacks/:id', async (req, res) => {
  const body = parse(callbackPatch, req.body);
  const cb = await prisma.callbackRequest.findUnique({ where: { id: idParam(req) } });
  if (!cb) throw notFound('CALLBACK_NOT_FOUND');
  if (body.cancel) {
    const updated = await prisma.callbackRequest.update({ where: { id: cb.id }, data: { status: 'CANCELLED', note: body.note ?? cb.note, doneAt: new Date(), doneById: req.user!.id } });
    if (cb.taskId) await prisma.task.updateMany({ where: { id: cb.taskId, status: { notIn: ['DONE', 'CANCELLED'] } }, data: { status: 'CANCELLED' } });
    await audit(req, 'CALLBACK_CANCELLED', `callback:${cb.id}`);
    res.json({ callback: updated, call: null });
    return;
  }
  // The outcome is logged as a (manual) call so it shows in the client's call log; it closes the request.
  const call = await logManual(req.user!.id, { callbackId: cb.id }, { direction: 'OUTBOUND', outcome: body.outcome!, note: body.note ?? null });
  res.json({ callback: await prisma.callbackRequest.findUnique({ where: { id: cb.id } }), call });
});

// ─── One call ──────────────────────────────────────────────────────────

callsRouter.get('/:id', async (req, res) => {
  const [call] = await toDto([await loadCall(req)]);
  res.json({ call });
});

const patchSchema = z
  .object({ outcome: z.enum(OUTCOMES).nullable().optional(), note: noteText.optional(), transcript: z.string().max(60_000).nullable().optional() })
  .strict();

callsRouter.patch('/:id', async (req, res) => {
  const body = parse(patchSchema, req.body);
  const call = await loadCall(req);
  if (!canEdit(call, req.user!)) throw forbidden('NOT_YOUR_CALL');
  const dto = await setOutcome(call, req.user!.id, { outcome: body.outcome, note: body.note, transcript: body.transcript === undefined ? undefined : body.transcript?.trim() || null });
  res.json({ call: dto });
});

callsRouter.post('/:id/summarize', async (req, res) => {
  const call = await loadCall(req);
  if (!canEdit(call, req.user!)) throw forbidden('NOT_YOUR_CALL');
  const updated = await summarizeCall(call, { id: req.user!.id, locale: req.user!.locale ?? 'az' });
  const [dto] = await toDto([updated]);
  res.json({ call: dto });
});

const taskSchema = z
  .object({ title: z.string().trim().min(2).max(200), dueInDays: z.number().int().min(0).max(60).nullable().optional(), assigneeId: optId })
  .strict();

callsRouter.post('/:id/tasks', async (req, res) => {
  const body = parse(taskSchema, req.body);
  const call = await loadCall(req);
  const days = body.dueInDays ?? 1;
  const due = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const task = await createAutomationTask({
    title: body.title,
    description: [call.summary, call.note, `/admin/calls?call=${call.id}`].filter(Boolean).join('\n\n'),
    assigneeIds: [body.assigneeId ?? req.user!.id],
    dueAt: due,
    priority: 'NORMAL',
    caseId: call.caseId,
    createdById: req.user!.id,
  });
  res.status(201).json({ task });
});

callsRouter.get('/:id/recording', async (req, res) => {
  const call = await loadCall(req);
  if (call.staffId !== req.user!.id && !isAdmin(req)) throw forbidden('NOT_YOUR_CALL');
  if (!call.recordingKey) throw notFound('NO_RECORDING');
  const s = await getCallsSettings();
  const provider = providerFor(call.provider as 'twilio');
  const upstream = provider?.fetchRecording ? await provider.fetchRecording(call.recordingKey, s) : null;
  if (!upstream?.body) throw badRequest('RECORDING_UNAVAILABLE');
  await audit(req, 'CALL_RECORDING_PLAYED', `call:${call.id}`);
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'audio/mpeg');
  res.setHeader('Content-Disposition', `inline; filename="call-${call.id}.mp3"`);
  Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream).pipe(res);
});
