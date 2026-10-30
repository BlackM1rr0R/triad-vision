import { Router, type Request } from 'express';
import { z } from 'zod';
import type { InterviewInviteStatus, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { hasMinRole, requireAuth } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { interviewInclude, interviewView, newMeetingUrl } from '../lib/ops/interviews.js';
import { DAY_RE, TIME_RE, generateSlots, isBookable, slotView, validRule } from '../lib/ops/interviewSlots.js';
import {
  SETTINGS_LIMITS,
  busyTimes,
  hasAvailability,
  horizonEnd,
  inviteInclude,
  inviteView,
  loadRules,
  loadSettings,
  moveRules,
  notifyInvite,
  broadcastBooking,
  slotOptions,
  type InviteFull,
  type SchedulingSettings,
} from '../lib/ops/interviewBooking.js';

/**
 * Interview calendar — mounted at /api/interview-calendar.
 *   COMPANY  keeps its free hours (weekly + one-off, German time) and booking rules, invites a
 *            presented applicant to "pick a time", sees and cancels its invites
 *   CLIENT   sees their invites, lists free slots (Baku + German time), books, moves within the rules
 *   staff    everything for any company (?companyId=), and may book outside the free hours (force)
 * Hand-proposed times stay in routes/interviews.ts; a booked slot is an ordinary CONFIRMED Interview.
 */
export const interviewCalendarRouter = Router();
interviewCalendarRouter.use(requireAuth);

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

type Audience = 'staff' | 'company' | 'candidate';
const audienceOf = (req: Request): Audience => (hasMinRole(req.user!.role, 'STAFF') ? 'staff' : req.user!.role === 'COMPANY' ? 'company' : 'candidate');

/** The employer's own (active) company, or for staff the ?companyId / body companyId. */
const companyIdOf = async (req: Request, explicit?: string | null) => {
  const audience = audienceOf(req);
  if (audience === 'staff') {
    if (!explicit) throw badRequest('COMPANY_REQUIRED');
    if (!(await prisma.company.count({ where: { id: explicit } }))) throw notFound('COMPANY_NOT_FOUND');
    return explicit;
  }
  if (audience !== 'company') throw forbidden();
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { company: { select: { id: true, status: true } } } });
  if (!u?.company) throw forbidden('NO_COMPANY');
  if (u.company.status === 'SUSPENDED') throw forbidden('COMPANY_SUSPENDED');
  return u.company.id;
};

// ─── Availability and rules ─────────────────────────────────────────────

const ruleSchema = z.object({
  weekday: z.coerce.number().int().min(1).max(7).optional(),
  day: z.string().regex(DAY_RE).optional(),
  startTime: z.string().regex(TIME_RE).nullable().optional(),
  endTime: z.string().regex(TIME_RE).nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
});

const settingsSchema = z.object(
  Object.fromEntries(Object.entries(SETTINGS_LIMITS).map(([k, [min, max]]) => [k, z.coerce.number().int().min(min).max(max).optional()])) as Record<keyof SchedulingSettings, z.ZodOptional<z.ZodNumber>>,
);

const availabilitySchema = z.object({
  companyId: z.string().max(64).optional(),
  settings: settingsSchema.optional(),
  weekly: z.array(ruleSchema).max(100).optional(),
  dates: z.array(ruleSchema).max(200).optional(),
  blocks: z.array(ruleSchema).max(200).optional(),
});

const availabilityView = async (companyId: string) => {
  const [settings, rules] = await Promise.all([loadSettings(companyId), loadRules(companyId)]);
  const pick = (r: (typeof rules)[number]) => ({ id: r.id, weekday: r.weekday, day: r.day, startTime: r.startTime, endTime: r.endTime, note: r.note });
  return {
    companyId,
    timezone: 'Europe/Berlin',
    settings,
    weekly: rules.filter((r) => r.kind === 'WEEKLY').map(pick),
    dates: rules.filter((r) => r.kind === 'DATE').map(pick),
    blocks: rules.filter((r) => r.kind === 'BLOCK').map(pick),
  };
};

interviewCalendarRouter.get('/availability', async (req, res) => {
  const companyId = await companyIdOf(req, typeof req.query.companyId === 'string' ? req.query.companyId : null);
  res.json(await availabilityView(companyId));
});

/** Replaces the lists that are sent (weekly / dates / blocks) and merges the settings. */
interviewCalendarRouter.put('/availability', async (req, res) => {
  const body = parse(availabilitySchema, req.body);
  const companyId = await companyIdOf(req, body.companyId);
  const lists = [
    ['WEEKLY', body.weekly],
    ['DATE', body.dates],
    ['BLOCK', body.blocks],
  ] as const;
  const rows: Prisma.InterviewAvailabilityCreateManyInput[] = [];
  for (const [kind, list] of lists) {
    for (const r of list ?? []) {
      const rule = { kind, weekday: kind === 'WEEKLY' ? (r.weekday ?? null) : null, day: kind === 'WEEKLY' ? null : (r.day ?? null), startTime: r.startTime || null, endTime: r.endTime || null };
      if (!validRule(rule)) throw badRequest('INVALID_AVAILABILITY');
      rows.push({ companyId, ...rule, note: r.note || null });
    }
  }
  await prisma.$transaction(async (tx) => {
    const kinds = lists.filter(([, l]) => l !== undefined).map(([k]) => k);
    if (kinds.length) {
      await tx.interviewAvailability.deleteMany({ where: { companyId, kind: { in: [...kinds] } } });
      if (rows.length) await tx.interviewAvailability.createMany({ data: rows });
    }
    if (body.settings && Object.keys(body.settings).length) {
      await tx.interviewSchedulingSettings.upsert({ where: { companyId }, create: { companyId, ...body.settings }, update: body.settings });
    }
  });
  await audit(req, 'INTERVIEW_AVAILABILITY_UPDATED', `company:${companyId}`, { rules: rows.length, settings: body.settings ?? null });
  res.json(await availabilityView(companyId));
});

const rangeQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), companyId: z.string().max(64).optional() });

/** Window clamped to [now, now + horizon]; at most 31 days per request. */
const windowOf = (q: { from?: Date; to?: Date }, s: SchedulingSettings, now: Date) => {
  const from = q.from && q.from > now ? q.from : now;
  const limit = horizonEnd(s, now);
  let to = q.to && q.to < limit ? q.to : limit;
  if (to.getTime() - from.getTime() > 31 * DAY) to = new Date(from.getTime() + 31 * DAY);
  return { from, to };
};

/** Employer preview: the free slots a candidate would see (default slot length, employer busy times). */
interviewCalendarRouter.get('/availability/preview', async (req, res) => {
  const q = parse(rangeQuery, req.query);
  const companyId = await companyIdOf(req, q.companyId);
  const now = new Date();
  const [s, rules] = await Promise.all([loadSettings(companyId), loadRules(companyId)]);
  const { from, to } = windowOf(q, s, now);
  const busy = await busyTimes(companyId, null, new Date(from.getTime() - DAY), new Date(to.getTime() + DAY));
  const slots = from < to ? generateSlots(rules, busy, { ...slotOptions(s, s.slotMinutes, now), from, to }) : [];
  res.json({ from, to, slots: slots.slice(0, 500).map(slotView) });
});

// ─── Invites ────────────────────────────────────────────────────────────

const loadInvite = async (req: Request) => {
  const i = await prisma.interviewInvite.findUnique({ where: { id: String(req.params.id) }, include: inviteInclude });
  if (!i) throw notFound('INVITE_NOT_FOUND');
  const audience = audienceOf(req);
  if (audience === 'candidate' && i.candidateId !== req.user!.id) throw notFound('INVITE_NOT_FOUND');
  if (audience === 'company' && i.companyId !== (await companyIdOf(req))) throw notFound('INVITE_NOT_FOUND');
  return { invite: i, audience };
};

const listQuery = z.object({ status: z.enum(['OPEN', 'BOOKED', 'CANCELLED']).optional(), companyId: z.string().max(64).optional() });

interviewCalendarRouter.get('/invites', async (req, res) => {
  const q = parse(listQuery, req.query);
  const audience = audienceOf(req);
  const where: Prisma.InterviewInviteWhereInput = q.status ? { status: q.status as InterviewInviteStatus } : { status: { in: ['OPEN', 'BOOKED'] } };
  if (audience === 'candidate') where.candidateId = req.user!.id;
  else if (audience === 'company') where.companyId = await companyIdOf(req);
  else if (q.companyId) where.companyId = q.companyId;
  const items = await prisma.interviewInvite.findMany({ where, include: inviteInclude, orderBy: { createdAt: 'desc' }, take: 500 });
  const settings = new Map<string, SchedulingSettings>();
  for (const id of new Set(items.map((i) => i.companyId))) settings.set(id, await loadSettings(id));
  const now = new Date();
  res.json({ items: items.map((i) => inviteView(i, audience, settings.get(i.companyId)!, now)) });
});

const inviteSchema = z.object({
  applicationId: z.string().max(64),
  minutes: z.coerce.number().int().min(15).max(240).optional(),
  notes: z.string().trim().max(4000).optional(),
});

interviewCalendarRouter.post('/invites', async (req, res) => {
  const body = parse(inviteSchema, req.body);
  const audience = audienceOf(req);
  if (audience === 'candidate') throw forbidden();
  const application = await prisma.vacancyApplication.findUnique({ where: { id: body.applicationId }, select: { id: true, userId: true, status: true, vacancy: { select: { companyId: true } } } });
  if (!application) throw notFound('APPLICATION_NOT_FOUND');
  const companyId = application.vacancy.companyId;
  if (!companyId) throw badRequest('APPLICATION_WITHOUT_COMPANY');
  if (audience === 'company') {
    // Employers only see applicants presented to them.
    if ((await companyIdOf(req)) !== companyId || !['PROPOSED', 'INTERVIEW', 'ACCEPTED'].includes(application.status)) throw notFound('APPLICATION_NOT_FOUND');
  }
  const candidate = await prisma.user.findUnique({ where: { id: application.userId }, select: { role: true, isActive: true } });
  if (!candidate || candidate.role !== 'CLIENT' || !candidate.isActive) throw badRequest('INVALID_CANDIDATE');
  if (!hasAvailability(await loadRules(companyId))) throw conflict('NO_AVAILABILITY');
  if (await prisma.interviewInvite.count({ where: { applicationId: application.id, status: 'OPEN' } })) throw conflict('INVITE_EXISTS');
  const s = await loadSettings(companyId);
  const invite = await prisma.interviewInvite.create({
    data: { companyId, applicationId: application.id, candidateId: application.userId, minutes: body.minutes ?? s.slotMinutes, notes: body.notes || null, createdById: req.user!.id },
    include: inviteInclude,
  });
  await prisma.vacancyApplication.updateMany({ where: { id: application.id, status: 'PROPOSED' }, data: { status: 'INTERVIEW' } });
  await audit(req, 'INTERVIEW_INVITE_CREATED', `interviewInvite:${invite.id}`, { companyId, applicationId: application.id });
  await notifyInvite(invite, 'invited').catch((e) => console.error('[interview-calendar] invite notify failed', e));
  res.status(201).json({ invite: inviteView(invite, audience, s) });
});

/** Employer / staff withdraw an open invite (a booked one is cancelled through its interview). */
interviewCalendarRouter.delete('/invites/:id', async (req, res) => {
  const { invite: i, audience } = await loadInvite(req);
  if (audience === 'candidate') throw forbidden();
  if (i.status !== 'OPEN') throw conflict('INVITE_CLOSED');
  await prisma.interviewInvite.update({ where: { id: i.id }, data: { status: 'CANCELLED' } });
  await audit(req, 'INTERVIEW_INVITE_CANCELLED', `interviewInvite:${i.id}`);
  res.json({ ok: true });
});

/** Free slots for this invite (its length; the employer's and the candidate's busy times). */
interviewCalendarRouter.get('/invites/:id/slots', async (req, res) => {
  const q = parse(rangeQuery, req.query);
  const { invite: i } = await loadInvite(req);
  const now = new Date();
  const [s, rules] = await Promise.all([loadSettings(i.companyId), loadRules(i.companyId)]);
  const open = i.status === 'OPEN' || (i.status === 'BOOKED' && !!i.interview && ['PROPOSED', 'CONFIRMED'].includes(i.interview.status));
  const { from, to } = windowOf(q, s, now);
  let slots: ReturnType<typeof slotView>[] = [];
  if (open && from < to) {
    const busy = await busyTimes(i.companyId, i.candidateId, new Date(from.getTime() - DAY), new Date(to.getTime() + DAY), i.interview?.id);
    slots = generateSlots(rules, busy, { ...slotOptions(s, i.minutes, now), from, to }).slice(0, 500).map(slotView);
  }
  res.json({ from, to, minutes: i.minutes, slots });
});

const bookSchema = z.object({ startsAt: z.coerce.date(), force: z.boolean().optional() });

/**
 * Books a free slot (OPEN invite → CONFIRMED interview with a fresh video link) or moves the
 * booked one. Candidates move only before the cut-off and within the reschedule limit; staff may
 * `force` a time outside the free hours (the candidate must still be free). The company row is
 * locked so two candidates cannot take the same slot at once.
 */
interviewCalendarRouter.post('/invites/:id/book', async (req, res) => {
  const body = parse(bookSchema, req.body);
  const { invite: i, audience } = await loadInvite(req);
  if (audience === 'company') throw forbidden();
  const force = body.force === true;
  if (force && audience !== 'staff') throw forbidden();
  const s = await loadSettings(i.companyId);
  const now = new Date();
  const current = i.status === 'BOOKED' && i.interview && ['PROPOSED', 'CONFIRMED'].includes(i.interview.status) ? i.interview : null;
  if (i.status !== 'OPEN' && !current) throw conflict('INVITE_CLOSED');
  if (current && audience === 'candidate') {
    const rules = moveRules(i, s, now);
    if (!rules.canCancel) throw conflict('RESCHEDULE_TOO_LATE');
    if (!rules.canMove) throw conflict('RESCHEDULE_LIMIT');
  }
  const startsAt = body.startsAt;
  const endsAt = new Date(startsAt.getTime() + i.minutes * MIN);
  if (startsAt.getTime() < now.getTime()) throw badRequest('TIME_IN_PAST');
  if (current && current.startsAt.getTime() === startsAt.getTime()) throw badRequest('SAME_TIME');

  const interviewId = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM \`Company\` WHERE id = ${i.companyId} FOR UPDATE`;
    if (force) {
      const clash = await tx.interview.findFirst({
        where: { candidateId: i.candidateId, status: { in: ['PROPOSED', 'CONFIRMED'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, ...(current ? { id: { not: current.id } } : {}) },
        select: { id: true },
      });
      if (clash) throw conflict('CANDIDATE_BUSY');
    } else {
      const rules = await loadRules(i.companyId);
      const busy = await busyTimes(i.companyId, i.candidateId, new Date(startsAt.getTime() - DAY), new Date(endsAt.getTime() + DAY), current?.id);
      if (!isBookable(startsAt, rules, busy, { ...slotOptions(s, i.minutes, now), to: horizonEnd(s, now) })) throw conflict('SLOT_UNAVAILABLE');
    }
    if (current) {
      await tx.interview.update({ where: { id: current.id }, data: { startsAt, endsAt, status: 'CONFIRMED' } });
      await tx.interviewInvite.update({ where: { id: i.id }, data: { reschedules: audience === 'candidate' ? { increment: 1 } : undefined } });
      return current.id;
    }
    const created = await tx.interview.create({
      data: {
        applicationId: i.applicationId,
        companyId: i.companyId,
        candidateId: i.candidateId,
        startsAt,
        endsAt,
        meetingUrl: newMeetingUrl(),
        status: 'CONFIRMED',
        notes: i.notes,
        createdById: i.createdById,
      },
      select: { id: true },
    });
    // The status guard keeps a concurrent second booking of the same invite out.
    const claimed = await tx.interviewInvite.updateMany({ where: { id: i.id, status: 'OPEN' }, data: { status: 'BOOKED', interviewId: created.id } });
    if (!claimed.count) throw conflict('INVITE_CLOSED');
    return created.id;
  });

  const interview = await prisma.interview.findUniqueOrThrow({ where: { id: interviewId }, include: interviewInclude });
  const kind = current ? 'moved' : 'booked';
  await audit(req, current ? 'INTERVIEW_SLOT_MOVED' : 'INTERVIEW_SLOT_BOOKED', `interview:${interview.id}`, { inviteId: i.id, startsAt: startsAt.toISOString(), force });
  await broadcastBooking(interview, kind, req.user!.id, current ? 'interview.updated' : 'interview.scheduled');
  const fresh = await prisma.interviewInvite.findUniqueOrThrow({ where: { id: i.id }, include: inviteInclude });
  res.status(current ? 200 : 201).json({ interview: interviewView(interview, audience), invite: inviteView(fresh as InviteFull, audience, s) });
});
