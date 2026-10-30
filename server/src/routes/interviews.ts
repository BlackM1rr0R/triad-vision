import { Router, type Request } from 'express';
import { z } from 'zod';
import type { InterviewStatus, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { hasMinRole, requireAuth } from '../middleware/auth.js';
import { HttpError, badRequest, conflict, forbidden, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import {
  INTERVIEW_STATUSES,
  MAX_MINUTES,
  MIN_MINUTES,
  broadcastInterview,
  interviewIcs,
  interviewInclude,
  interviewView,
  loadInterview,
  newMeetingUrl,
  type InterviewFull,
} from '../lib/ops/interviews.js';
import { closeInviteOf, loadSettings } from '../lib/ops/interviewBooking.js';
import { canEvaluate, evaluationInput, evaluationSummary, evaluationsOfInterview, notifyEvaluation, saveEvaluation } from '../lib/placement/evaluations.js';

/**
 * Employer ↔ candidate interviews — mounted at /api/interviews.
 *   staff      create / edit / cancel anything, list everything
 *   COMPANY    propose slots for applicants presented to them, confirm / cancel / reschedule their own
 *   CLIENT     see their own, confirm or decline
 */
export const interviewsRouter = Router();
interviewsRouter.use(requireAuth);

const MIN = 60 * 1000;

type Audience = 'staff' | 'company' | 'candidate';

const audienceOf = (req: Request): Audience => (hasMinRole(req.user!.role, 'STAFF') ? 'staff' : req.user!.role === 'COMPANY' ? 'company' : 'candidate');

/** The employer's company (must be active). */
const companyOf = async (req: Request) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { company: { select: { id: true, status: true, name: true } } } });
  if (!u?.company) throw forbidden('NO_COMPANY');
  if (u.company.status === 'SUSPENDED') throw forbidden('COMPANY_SUSPENDED');
  return u.company;
};

const timeSchema = z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date().optional(), minutes: z.coerce.number().int().min(MIN_MINUTES).max(MAX_MINUTES).optional() });

const resolveTimes = (t: z.infer<typeof timeSchema>) => {
  const endsAt = t.endsAt ?? new Date(t.startsAt.getTime() + (t.minutes ?? 45) * MIN);
  const len = endsAt.getTime() - t.startsAt.getTime();
  if (len < MIN_MINUTES * MIN || len > MAX_MINUTES * MIN) throw badRequest('INVALID_DURATION');
  if (t.startsAt.getTime() < Date.now() - 5 * MIN) throw badRequest('TIME_IN_PAST');
  if (t.startsAt.getTime() > Date.now() + 366 * 24 * 60 * MIN) throw badRequest('TIME_TOO_FAR');
  return { startsAt: t.startsAt, endsAt };
};

/** No two live interviews of one candidate may overlap. */
const candidateOverlap = (candidateId: string, startsAt: Date, endsAt: Date, exceptId?: string) =>
  prisma.interview.findFirst({
    where: { candidateId, status: { in: ['PROPOSED', 'CONFIRMED'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });

/** Loads an interview the caller may see; 404 for anything outside their scope. */
const loadVisible = async (req: Request) => {
  const i = await loadInterview(String(req.params.id));
  if (!i) throw notFound('INTERVIEW_NOT_FOUND');
  const audience = audienceOf(req);
  if (audience === 'company') {
    const company = await companyOf(req);
    if (i.companyId !== company.id) throw notFound('INTERVIEW_NOT_FOUND');
  } else if (audience === 'candidate' && i.candidateId !== req.user!.id) {
    throw notFound('INTERVIEW_NOT_FOUND');
  }
  return { interview: i, audience };
};

// ─── Lists ──────────────────────────────────────────────────────────────

const listQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(INTERVIEW_STATUSES as [InterviewStatus, ...InterviewStatus[]]).optional(),
  companyId: z.string().max(64).optional(),
  candidateId: z.string().max(64).optional(),
  applicationId: z.string().max(64).optional(),
});

interviewsRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const audience = audienceOf(req);
  const where: Prisma.InterviewWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.candidateId ? { candidateId: q.candidateId } : {}),
    ...(q.applicationId ? { applicationId: q.applicationId } : {}),
    ...(q.from || q.to ? { startsAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } } : {}),
  };
  if (audience === 'company') where.companyId = (await companyOf(req)).id;
  else if (audience === 'candidate') where.candidateId = req.user!.id;
  else if (q.companyId) where.companyId = q.companyId;
  const items = await prisma.interview.findMany({ where, include: interviewInclude, orderBy: { startsAt: 'asc' }, take: 1000 });
  res.json({ items: items.map((i) => interviewView(i, audience)) });
});

/** Candidate shortcut: upcoming first, then past. */
interviewsRouter.get('/mine', async (req, res) => {
  const items = await prisma.interview.findMany({ where: { candidateId: req.user!.id }, include: interviewInclude, orderBy: { startsAt: 'asc' } });
  const now = Date.now();
  const view = items.map((i) => interviewView(i, 'candidate'));
  res.json({
    upcoming: view.filter((i) => i.endsAt.getTime() >= now && i.status !== 'CANCELLED'),
    past: view.filter((i) => i.endsAt.getTime() < now || i.status === 'CANCELLED').reverse(),
  });
});

/** Employers pick from applicants presented to them (anonymised), to propose an interview. */
interviewsRouter.get('/applicants', async (req, res) => {
  if (audienceOf(req) !== 'company') throw forbidden();
  const company = await companyOf(req);
  const apps = await prisma.vacancyApplication.findMany({
    where: { vacancy: { companyId: company.id }, status: { in: ['PROPOSED', 'INTERVIEW', 'ACCEPTED'] } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, status: true, userId: true, user: { select: { firstName: true, lastName: true, profession: true } }, vacancy: { select: { id: true, title: true } } },
    take: 300,
  });
  res.json({
    items: apps.map((a) => ({
      applicationId: a.id,
      status: a.status,
      candidateId: a.userId,
      name: `${a.user.firstName.trim()}${a.user.lastName.trim() ? ` ${a.user.lastName.trim()[0].toUpperCase()}.` : ''}`,
      profession: a.user.profession,
      vacancy: a.vacancy,
    })),
  });
});

interviewsRouter.get('/:id', async (req, res) => {
  const { interview, audience } = await loadVisible(req);
  res.json({ interview: interviewView(interview, audience) });
});

interviewsRouter.get('/:id/ics', async (req, res) => {
  const { interview } = await loadVisible(req);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="triad-vision-interview.ics"');
  res.send(interviewIcs(interview, req.user!.locale as 'az' | 'de' | 'en' | 'ru'));
});

// ─── Create ─────────────────────────────────────────────────────────────

const createSchema = timeSchema.extend({
  candidateId: z.string().max(64).optional(),
  applicationId: z.string().max(64).optional(),
  companyId: z.string().max(64).nullable().optional(),
  staffId: z.string().max(64).nullable().optional(),
  notes: z.string().trim().max(4000).optional(),
});

interviewsRouter.post('/', async (req, res) => {
  const body = parse(createSchema, req.body);
  const audience = audienceOf(req);
  if (audience === 'candidate') throw forbidden();
  const times = resolveTimes(body);

  // An employer only ever schedules inside their own company (whatever the body says), and only
  // with applicants presented to them.
  const ownCompany = audience === 'company' ? await companyOf(req) : null;
  let companyId = ownCompany ? ownCompany.id : (body.companyId ?? null);
  let candidateId = body.candidateId ?? null;
  let application: { id: string; userId: string; vacancy: { companyId: string | null } } | null = null;
  if (body.applicationId) {
    application = await prisma.vacancyApplication.findUnique({ where: { id: body.applicationId }, select: { id: true, userId: true, status: true, vacancy: { select: { companyId: true } } } });
    if (!application) throw badRequest('INVALID_APPLICATION');
    if (ownCompany && application.vacancy.companyId !== ownCompany.id) throw notFound('APPLICATION_NOT_FOUND');
    if (candidateId && candidateId !== application.userId) throw badRequest('APPLICATION_CANDIDATE_MISMATCH');
    candidateId = application.userId;
    if (companyId === null) companyId = application.vacancy.companyId;
    else if (application.vacancy.companyId && application.vacancy.companyId !== companyId) throw badRequest('APPLICATION_COMPANY_MISMATCH');
  }
  if (ownCompany) {
    if (!application) throw badRequest('APPLICATION_REQUIRED');
    const visible = await prisma.vacancyApplication.count({ where: { id: application.id, status: { in: ['PROPOSED', 'INTERVIEW', 'ACCEPTED'] } } });
    if (!visible) throw notFound('APPLICATION_NOT_FOUND');
  }
  if (!candidateId) throw badRequest('CANDIDATE_REQUIRED');
  const candidate = await prisma.user.findUnique({ where: { id: candidateId }, select: { role: true, isActive: true } });
  if (!candidate || candidate.role !== 'CLIENT' || !candidate.isActive) throw badRequest('INVALID_CANDIDATE');
  if (companyId && !(await prisma.company.count({ where: { id: companyId } }))) throw badRequest('INVALID_COMPANY');
  let staffId: string | null = null;
  if (audience === 'staff') {
    staffId = body.staffId === undefined ? req.user!.id : body.staffId;
    if (staffId) {
      const s = await prisma.user.findUnique({ where: { id: staffId }, select: { role: true, isActive: true } });
      if (!s || !s.isActive || !hasMinRole(s.role, 'STAFF')) throw badRequest('INVALID_STAFF');
    }
  }
  if (await candidateOverlap(candidateId, times.startsAt, times.endsAt)) throw conflict('CANDIDATE_BUSY');

  const interview = await prisma.interview.create({
    data: {
      applicationId: application?.id ?? null,
      companyId,
      candidateId,
      staffId,
      startsAt: times.startsAt,
      endsAt: times.endsAt,
      meetingUrl: newMeetingUrl(),
      status: 'PROPOSED',
      notes: body.notes || null,
      createdById: req.user!.id,
    },
    include: interviewInclude,
  });
  // The employer wants to talk: the application moves along with it.
  if (application) await prisma.vacancyApplication.updateMany({ where: { id: application.id, status: 'PROPOSED' }, data: { status: 'INTERVIEW' } });
  await audit(req, 'INTERVIEW_CREATED', `interview:${interview.id}`, { candidateId, companyId, applicationId: application?.id ?? null });
  await broadcastInterview(interview, 'scheduled', { actorId: req.user!.id, webhook: 'interview.scheduled' });
  res.status(201).json({ interview: interviewView(interview, audience) });
});

// ─── Update ─────────────────────────────────────────────────────────────

const patchSchema = z.object({
  status: z.enum(INTERVIEW_STATUSES as [InterviewStatus, ...InterviewStatus[]]).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  minutes: z.coerce.number().int().min(MIN_MINUTES).max(MAX_MINUTES).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  staffId: z.string().max(64).nullable().optional(),
  reason: z.string().trim().max(2000).optional(),
});

const COMPANY_STATUSES: InterviewStatus[] = ['CONFIRMED', 'CANCELLED', 'DONE', 'NO_SHOW'];

const applyPatch = async (req: Request, i: InterviewFull, body: z.infer<typeof patchSchema>, audience: Audience) => {
  const data: Prisma.InterviewUncheckedUpdateInput = {};
  let kind: 'rescheduled' | 'confirmed' | 'cancelled' | null = null;
  if (body.startsAt) {
    if (i.status === 'CANCELLED' || i.status === 'DONE') throw conflict('INTERVIEW_CLOSED');
    const times = resolveTimes({ startsAt: body.startsAt, endsAt: body.endsAt, minutes: body.minutes ?? Math.round((i.endsAt.getTime() - i.startsAt.getTime()) / MIN) });
    if (await candidateOverlap(i.candidateId, times.startsAt, times.endsAt, i.id)) throw conflict('CANDIDATE_BUSY');
    data.startsAt = times.startsAt;
    data.endsAt = times.endsAt;
    // A moved interview needs the candidate's confirmation again.
    data.status = 'PROPOSED';
    kind = 'rescheduled';
  }
  if (body.status && body.status !== i.status && !(kind === 'rescheduled' && body.status === 'PROPOSED')) {
    if (audience === 'company' && !COMPANY_STATUSES.includes(body.status)) throw forbidden();
    if (i.status === 'CANCELLED' && audience !== 'staff') throw conflict('INTERVIEW_CLOSED');
    if ((body.status === 'DONE' || body.status === 'NO_SHOW') && i.startsAt.getTime() > Date.now()) throw badRequest('INTERVIEW_NOT_STARTED');
    data.status = body.status;
    if (body.status === 'CONFIRMED') kind = 'confirmed';
    if (body.status === 'CANCELLED') kind = 'cancelled';
  }
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.staffId !== undefined) {
    if (audience !== 'staff') throw forbidden();
    if (body.staffId) {
      const s = await prisma.user.findUnique({ where: { id: body.staffId }, select: { role: true, isActive: true } });
      if (!s || !s.isActive || !hasMinRole(s.role, 'STAFF')) throw badRequest('INVALID_STAFF');
    }
    data.staffId = body.staffId;
  }
  if (!Object.keys(data).length) return { interview: i, kind: null as typeof kind };
  const updated = await prisma.interview.update({ where: { id: i.id }, data, include: interviewInclude });
  await audit(req, 'INTERVIEW_UPDATED', `interview:${i.id}`, { fields: Object.keys(data), status: updated.status });
  return { interview: updated, kind };
};

interviewsRouter.patch('/:id', async (req, res) => {
  const body = parse(patchSchema, req.body);
  const { interview: i, audience } = await loadVisible(req);
  if (audience === 'candidate') throw forbidden();
  const { interview, kind } = await applyPatch(req, i, body, audience);
  if (kind === 'cancelled') await closeInviteOf(i.id);
  if (kind) await broadcastInterview(interview, kind, { actorId: req.user!.id, notes: kind === 'cancelled' ? body.reason : undefined, webhook: 'interview.updated' });
  res.json({ interview: interviewView(interview, audience) });
});

interviewsRouter.delete('/:id', async (req, res) => {
  const { interview: i, audience } = await loadVisible(req);
  if (audience !== 'staff') throw forbidden();
  if (i.status === 'PROPOSED' || i.status === 'CONFIRMED') {
    const cancelled = await prisma.interview.update({ where: { id: i.id }, data: { status: 'CANCELLED' }, include: interviewInclude });
    await broadcastInterview(cancelled, 'cancelled', { actorId: req.user!.id, webhook: 'interview.updated' });
  }
  await closeInviteOf(i.id);
  await prisma.interview.delete({ where: { id: i.id } });
  await audit(req, 'INTERVIEW_DELETED', `interview:${i.id}`);
  res.json({ ok: true });
});

// ─── Candidate answers ──────────────────────────────────────────────────

interviewsRouter.post('/:id/confirm', async (req, res) => {
  const { interview: i, audience } = await loadVisible(req);
  if (audience === 'company') throw forbidden();
  if (i.status !== 'PROPOSED') throw new HttpError(409, 'INVALID_TRANSITION');
  if (i.startsAt.getTime() < Date.now()) throw conflict('INTERVIEW_STARTED');
  const interview = await prisma.interview.update({ where: { id: i.id }, data: { status: 'CONFIRMED' }, include: interviewInclude });
  await audit(req, 'INTERVIEW_CONFIRMED', `interview:${i.id}`);
  await broadcastInterview(interview, 'confirmed', { actorId: req.user!.id, webhook: 'interview.updated' });
  res.json({ interview: interviewView(interview, audience) });
});

interviewsRouter.post('/:id/decline', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().max(2000).optional() }), req.body ?? {});
  const { interview: i, audience } = await loadVisible(req);
  if (audience !== 'candidate') throw forbidden();
  if (i.status !== 'PROPOSED' && i.status !== 'CONFIRMED') throw new HttpError(409, 'INVALID_TRANSITION');
  // A time the candidate picked themselves can only be given back before the employer's cut-off.
  if (i.invite && i.companyId) {
    const { cancelCutoffHours } = await loadSettings(i.companyId);
    if (Date.now() > i.startsAt.getTime() - cancelCutoffHours * 60 * MIN) throw conflict('CANCEL_TOO_LATE');
  }
  const interview = await prisma.interview.update({ where: { id: i.id }, data: { status: 'CANCELLED', notes: reason ? `${i.notes ? `${i.notes}\n\n` : ''}${reason}` : i.notes }, include: interviewInclude });
  await closeInviteOf(i.id);
  await audit(req, 'INTERVIEW_DECLINED', `interview:${i.id}`, { reason: reason ?? null });
  await broadcastInterview(interview, 'declined', { actorId: req.user!.id, notes: reason, webhook: 'interview.updated' });
  res.json({ interview: interviewView(interview, audience) });
});

// ─── Evaluations (lib/placement/evaluations.ts) ─────────────────────────

/** Staff see every evaluation of the interview, an employer only the employer side; candidates none. */
interviewsRouter.get('/:id/evaluations', async (req, res) => {
  const { interview: i, audience } = await loadVisible(req);
  if (audience === 'candidate') throw forbidden();
  const items = await evaluationsOfInterview(i.id, audience === 'company' ? 'EMPLOYER' : undefined);
  res.json({ items, summary: evaluationSummary(items), canEvaluate: canEvaluate(i), mineId: items.find((e) => e.authorId === req.user!.id)?.id ?? null });
});

/** The caller's own evaluation (created or updated) — after the interview started or was marked DONE. */
interviewsRouter.put('/:id/evaluations/mine', async (req, res) => {
  const body = parse(evaluationInput, req.body);
  const { interview: i, audience } = await loadVisible(req);
  if (audience === 'candidate') throw forbidden();
  if (!canEvaluate(i)) throw conflict('INTERVIEW_NOT_EVALUABLE');
  const company = audience === 'company' ? await companyOf(req) : null;
  const name = `${req.user!.firstName} ${req.user!.lastName}`.trim();
  const author = { kind: company ? ('EMPLOYER' as const) : ('STAFF' as const), id: req.user!.id, name: company ? `${name} (${company.name})` : name };
  const { evaluation, created } = await saveEvaluation(i, author, body);
  await audit(req, created ? 'INTERVIEW_EVALUATED' : 'INTERVIEW_EVALUATION_UPDATED', `interview:${i.id}`, { overall: body.overall, recommendation: body.recommendation, authorKind: author.kind });
  if (created && company) await notifyEvaluation(i, author, body);
  res.status(created ? 201 : 200).json({ evaluation });
});

/** Staff remove any evaluation; others only their own. */
interviewsRouter.delete('/:id/evaluations/:evalId', async (req, res) => {
  const { interview: i, audience } = await loadVisible(req);
  if (audience === 'candidate') throw forbidden();
  const e = await prisma.interviewEvaluation.findFirst({ where: { id: String(req.params.evalId), interviewId: i.id } });
  if (!e || (audience !== 'staff' && e.authorId !== req.user!.id)) throw notFound('EVALUATION_NOT_FOUND');
  await prisma.interviewEvaluation.delete({ where: { id: e.id } });
  await audit(req, 'INTERVIEW_EVALUATION_DELETED', `interview:${i.id}`, { evaluationId: e.id, authorKind: e.authorKind });
  res.json({ ok: true });
});
