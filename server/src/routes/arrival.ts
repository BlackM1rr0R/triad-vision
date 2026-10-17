import { Router, type Request } from 'express';
import type { Locale, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, conflict, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { buildIcs } from '../lib/ics.js';
import { config } from '../config.js';
import { CLIENT_EDITABLE, clientView, ensurePlans, loadPlan, notifyPlanStaff, planInclude } from '../lib/arrival/core.js';
import { icsLabels } from '../lib/arrival/texts.js';

/**
 * Arrival planning for clients (/api/arrival): flight, airport pickup and first accommodation for
 * every case whose visa was APPROVED. A client only ever sees their own plans.
 */
export const arrivalRouter = Router();

arrivalRouter.use(requireAuth);

const DAY = 24 * 60 * 60 * 1000;
const MAX_AHEAD_DAYS = 400;

/** The caller's own plan for an APPROVED case (404 otherwise, so case ids cannot be probed). */
const ownPlan = async (req: Request) => {
  const caseId = String(req.params.caseId);
  const c = await prisma.case.findFirst({ where: { id: caseId, clientId: req.user!.id }, select: { status: true } });
  if (!c) throw notFound('PLAN_NOT_FOUND');
  if (c.status === 'APPROVED') await ensurePlans(req.user!.id);
  const plan = await loadPlan(caseId);
  if (!plan || plan.clientId !== req.user!.id) throw notFound('PLAN_NOT_FOUND');
  return plan;
};

/** GET /api/arrival → plans for my APPROVED cases (DRAFTs are created on first visit). */
arrivalRouter.get('/', async (req, res) => {
  const caseIds = await ensurePlans(req.user!.id);
  const plans = caseIds.length
    ? await prisma.arrivalPlan.findMany({ where: { caseId: { in: caseIds }, clientId: req.user!.id }, include: planInclude, orderBy: { createdAt: 'asc' } })
    : [];
  res.json({ items: plans.map(clientView) });
});

arrivalRouter.get('/:caseId', async (req, res) => {
  res.json({ plan: clientView(await ownPlan(req)) });
});

/** IATA (2 characters, e.g. J2 / LH) or ICAO (3 letters) airline code + 1–4 digits (+ optional suffix). */
const FLIGHT_RE = /^([A-Z]{3}|[A-Z0-9]{2}) ?(\d{1,4}[A-Z]?)$/;

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const isoDate = z.union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).nullable().optional();

const patchSchema = z
  .object({
    flightDate: isoDate,
    flightNumber: z
      .union([z.literal(''), z.string().trim().toUpperCase().regex(FLIGHT_RE, 'INVALID_FLIGHT_NUMBER')])
      .nullable()
      .optional(),
    departureAirport: text(80),
    arrivalAirport: text(80),
    arrivalTime: z.string().datetime({ offset: true }).nullable().optional(),
    travellers: z.coerce.number().int().min(1).max(10).optional(),
    luggageNote: text(300),
    pickupRequested: z.boolean().optional(),
    housingRequested: z.boolean().optional(),
    housingCity: text(80),
    housingBudget: z.coerce.number().int().min(100).max(10000).nullable().optional(),
    housingFrom: isoDate,
    housingNote: text(2000),
    clientNote: text(2000),
  })
  .strict();

const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v));
const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() ? v.trim() : null);

/** Fields whose change matters to staff once the plan was submitted. */
const MATERIAL: (keyof Prisma.ArrivalPlanUpdateInput)[] = ['flightDate', 'flightNumber', 'departureAirport', 'arrivalAirport', 'arrivalTime', 'travellers', 'pickupRequested', 'housingStatus', 'housingCity', 'housingFrom', 'housingBudget'];

/** PATCH /api/arrival/:caseId → edit flight / pickup / housing wishes while DRAFT or SUBMITTED. */
arrivalRouter.patch('/:caseId', async (req, res) => {
  const body = parse(patchSchema, req.body);
  const plan = await ownPlan(req);
  if (!CLIENT_EDITABLE.includes(plan.status)) throw conflict('PLAN_LOCKED');
  const now = new Date();

  const data: Prisma.ArrivalPlanUpdateInput = {};
  const arrivalTime = toDate(body.arrivalTime);
  if (arrivalTime !== undefined) {
    if (arrivalTime && arrivalTime.getTime() <= now.getTime()) throw badRequest('ARRIVAL_IN_PAST');
    if (arrivalTime && arrivalTime.getTime() > now.getTime() + MAX_AHEAD_DAYS * DAY) throw badRequest('ARRIVAL_TOO_FAR');
    data.arrivalTime = arrivalTime;
  }
  const flightDate = toDate(body.flightDate);
  if (flightDate !== undefined) data.flightDate = flightDate;
  // The departure day must fit the arrival: same day, or up to 3 days earlier (long connections).
  const effArrival = arrivalTime !== undefined ? arrivalTime : plan.arrivalTime;
  const effFlight = flightDate !== undefined ? flightDate : plan.flightDate;
  if (effFlight && (flightDate !== undefined || arrivalTime !== undefined)) {
    if (effArrival) {
      if (effFlight.getTime() > effArrival.getTime() + DAY || effFlight.getTime() < effArrival.getTime() - 3 * DAY) throw badRequest('FLIGHT_DATE_MISMATCH');
    } else if (flightDate && flightDate.getTime() < now.getTime() - DAY) {
      throw badRequest('FLIGHT_DATE_IN_PAST');
    }
  }
  if (body.flightNumber !== undefined) data.flightNumber = body.flightNumber ? body.flightNumber.replace(FLIGHT_RE, '$1 $2') : null;
  if (body.departureAirport !== undefined) data.departureAirport = blankToNull(body.departureAirport);
  if (body.arrivalAirport !== undefined) data.arrivalAirport = blankToNull(body.arrivalAirport);
  if (body.travellers !== undefined) data.travellers = body.travellers;
  if (body.luggageNote !== undefined) data.luggageNote = blankToNull(body.luggageNote);
  if (body.pickupRequested !== undefined) data.pickupRequested = body.pickupRequested;
  if (body.housingRequested !== undefined) {
    // Turning the request on/off only touches the status while staff have not started on it.
    if (body.housingRequested && plan.housingStatus === 'NONE') data.housingStatus = 'REQUESTED';
    if (!body.housingRequested && plan.housingStatus !== 'NONE') {
      if (plan.housingStatus !== 'REQUESTED') throw conflict('HOUSING_IN_PROGRESS');
      data.housingStatus = 'NONE';
    }
  }
  if (body.housingCity !== undefined) data.housingCity = blankToNull(body.housingCity);
  if (body.housingBudget !== undefined) data.housingBudget = body.housingBudget;
  const housingFrom = toDate(body.housingFrom);
  if (housingFrom !== undefined) {
    if (housingFrom && housingFrom.getTime() < now.getTime() - DAY) throw badRequest('HOUSING_FROM_IN_PAST');
    data.housingFrom = housingFrom;
  }
  if (body.housingNote !== undefined) data.housingNote = blankToNull(body.housingNote);
  if (body.clientNote !== undefined) data.clientNote = blankToNull(body.clientNote);

  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => {
    const before = (plan as unknown as Record<string, unknown>)[k];
    const after = (data as Record<string, unknown>)[k];
    return before instanceof Date || after instanceof Date ? (before as Date | null)?.getTime() !== (after as Date | null)?.getTime() : before !== after;
  });

  if (changed.length) {
    await prisma.arrivalPlan.update({ where: { id: plan.id }, data });
    await audit(req, 'ARRIVAL_PLAN_EDITED', plan.id, { caseId: plan.caseId, fields: changed });
  }
  const fresh = (await loadPlan(plan.caseId))!;
  if (plan.status === 'SUBMITTED' && changed.some((k) => MATERIAL.includes(k))) {
    await notifyPlanStaff(fresh, 'CLIENT_UPDATED', 'responsible');
  }
  res.json({ plan: clientView(fresh) });
});

/** POST /api/arrival/:caseId/submit → DRAFT → SUBMITTED (needs an arrival time and airport). */
arrivalRouter.post('/:caseId/submit', async (req, res) => {
  const plan = await ownPlan(req);
  if (plan.status !== 'DRAFT') throw conflict('PLAN_NOT_DRAFT');
  const missing: string[] = [];
  if (!plan.arrivalTime) missing.push('arrivalTime');
  if (!plan.arrivalAirport) missing.push('arrivalAirport');
  if (plan.housingStatus !== 'NONE') {
    if (!plan.housingCity) missing.push('housingCity');
    if (!plan.housingFrom) missing.push('housingFrom');
  }
  if (missing.length) {
    res.status(400).json({ error: 'PLAN_INCOMPLETE', fields: missing });
    return;
  }
  if (plan.arrivalTime!.getTime() <= Date.now()) throw badRequest('ARRIVAL_IN_PAST');
  const updated = await prisma.arrivalPlan.updateMany({ where: { id: plan.id, status: 'DRAFT' }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
  if (!updated.count) throw conflict('PLAN_NOT_DRAFT');
  await audit(req, 'ARRIVAL_PLAN_SUBMITTED', plan.id, { caseId: plan.caseId });
  const fresh = (await loadPlan(plan.caseId))!;
  await notifyPlanStaff(fresh, 'SUBMITTED', 'responsible');
  res.json({ plan: clientView(fresh) });
});

/** POST /api/arrival/:caseId/cancel → CANCELLED (not once the arrival was completed). */
arrivalRouter.post('/:caseId/cancel', async (req, res) => {
  const plan = await ownPlan(req);
  if (plan.status === 'CANCELLED' || plan.status === 'COMPLETED') throw conflict('PLAN_CLOSED');
  await prisma.arrivalPlan.update({ where: { id: plan.id }, data: { status: 'CANCELLED' } });
  await audit(req, 'ARRIVAL_PLAN_CANCELLED', plan.id, { caseId: plan.caseId, from: plan.status });
  const fresh = (await loadPlan(plan.caseId))!;
  if (plan.status !== 'DRAFT') await notifyPlanStaff(fresh, 'CLIENT_CANCELLED', 'responsible');
  res.json({ plan: clientView(fresh) });
});

/** POST /api/arrival/:caseId/reopen → a cancelled plan back to DRAFT (to plan a new trip). */
arrivalRouter.post('/:caseId/reopen', async (req, res) => {
  const plan = await ownPlan(req);
  if (plan.status !== 'CANCELLED') throw conflict('PLAN_NOT_CANCELLED');
  await prisma.arrivalPlan.update({ where: { id: plan.id }, data: { status: 'DRAFT', submittedAt: null, pickupConfirmed: false } });
  await audit(req, 'ARRIVAL_PLAN_REOPENED', plan.id, { caseId: plan.caseId });
  res.json({ plan: clientView((await loadPlan(plan.caseId))!) });
});

/** GET /api/arrival/:caseId/ics → the arrival as a calendar event. */
arrivalRouter.get('/:caseId/ics', async (req, res) => {
  const plan = await ownPlan(req);
  if (!plan.arrivalTime) throw badRequest('NO_ARRIVAL_TIME');
  const locale = (plan.client.locale ?? 'az') as Locale;
  const L = icsLabels(locale);
  const description = [
    plan.flightNumber ? `${plan.flightNumber}` : null,
    plan.departureAirport ? `${L.from}: ${plan.departureAirport}` : null,
    `${L.travellers}: ${plan.travellers}`,
    plan.pickupConfirmed && plan.pickupDetails ? `${L.pickup}: ${plan.pickupDetails}` : null,
    (plan.housingStatus === 'OFFERED' || plan.housingStatus === 'ARRANGED') && plan.housingDetails ? `${L.housing}: ${plan.housingDetails}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const ics = buildIcs({
    uid: `arrival-${plan.id}@triad-vision.de`,
    start: plan.arrivalTime,
    end: new Date(plan.arrivalTime.getTime() + 60 * 60 * 1000),
    summary: `${L.summary}${plan.flightNumber ? ` · ${plan.flightNumber}` : ''}`,
    description,
    location: plan.arrivalAirport ?? undefined,
    url: `${config.clientUrl.replace(/\/$/, '')}/account/arrival`,
    status: plan.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED',
    stamp: plan.updatedAt,
  });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="arrival-${plan.case.number}.ics"`);
  res.send(ics);
});
