import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole } from '../../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import {
  LISTING_TYPES,
  caseCity,
  completeAnmeldung,
  deadlineInfo,
  ensureHousing,
  housingView,
  listingMatchesCase,
  listingStaffView,
  loadCase,
  notifyHousingClient,
  dateToDay,
} from '../../lib/housing/core.js';
import { housingPatchData, housingPatchSchema } from '../../lib/housing/input.js';
import { sendVaultFile } from '../../lib/housing/files.js';

/**
 * Staff side of housing + Anmeldung — mounted at /api/admin/housing (STAFF+ via the admin router):
 * the case card (progress, deadline, appointment, contract review, Anmeldung done), partner landlord
 * listings (ADMIN+ edits, STAFF+ reads / proposes / introduces) and the open Anmeldung deadlines.
 */
export const adminHousingRouter = Router();

const adminOnly = (req: Request, _res: Response, next: NextFunction) => {
  if (!hasMinRole(req.user!.role, 'ADMIN')) throw forbidden('ADMIN_ONLY');
  next();
};

const approvedCase = async (caseId: string) => {
  const c = await loadCase(caseId);
  if (!c) throw notFound('CASE_NOT_FOUND');
  if (c.status !== 'APPROVED') throw conflict('CASE_NOT_APPROVED');
  return c;
};

const proposalInclude = { listing: { include: { company: { select: { id: true, name: true } } } } } satisfies Prisma.HousingProposalInclude;

const caseResponse = async (caseId: string) => {
  const c = await loadCase(caseId);
  if (!c) throw notFound('CASE_NOT_FOUND');
  if (c.status !== 'APPROVED') return { case: { id: c.id, number: c.number, status: c.status }, housing: null, proposals: [], suggestions: [] };
  const h = await ensureHousing(c.id);
  const city = caseCity(c, h);
  const [housing, proposals, active] = await Promise.all([
    housingView(h, c, new Date(), true),
    prisma.housingProposal.findMany({ where: { caseId: c.id }, include: proposalInclude, orderBy: { createdAt: 'desc' } }),
    prisma.partnerHousing.findMany({ where: { active: true }, include: { company: { select: { id: true, name: true } } }, orderBy: { city: 'asc' }, take: 500 }),
  ]);
  const proposed = new Set(proposals.filter((p) => !p.withdrawnAt).map((p) => p.listingId));
  return {
    case: { id: c.id, number: c.number, status: c.status, companyId: c.companyId, employer: c.company?.name ?? null, client: { id: c.client.id, firstName: c.client.firstName, lastName: c.client.lastName } },
    housing,
    proposals: proposals.map((p) => ({ ...p, listing: listingStaffView(p.listing) })),
    // Matching listings not proposed yet (employer listings of this employer first).
    suggestions: active
      .filter((l) => !proposed.has(l.id) && listingMatchesCase(l, { city, companyId: c.companyId }))
      .sort((a, b) => Number(!!b.companyId) - Number(!!a.companyId))
      .slice(0, 30)
      .map(listingStaffView),
  };
};

// ─── Case card ─────────────────────────────────────────────────────────

adminHousingRouter.get('/cases/:caseId', async (req, res) => {
  res.json(await caseResponse(String(req.params.caseId)));
});

/** PATCH /cases/:caseId → staff record the move-in date / appointment / city, tick steps, mark Anmeldung done. */
adminHousingRouter.patch('/cases/:caseId', async (req, res) => {
  const raw = (req.body ?? {}) as Record<string, unknown>;
  const { anmeldungDone, ...rest } = raw;
  const done = parse(z.boolean().optional(), anmeldungDone);
  const { caseId: _ignored, ...body } = parse(housingPatchSchema, rest);
  const c = await approvedCase(String(req.params.caseId));
  const h = await ensureHousing(c.id);
  const { data, appointmentChanged } = housingPatchData(h, body, req.user!.id);
  let fresh = h;
  if (Object.keys(data).length) {
    fresh = await prisma.caseHousing.update({ where: { id: h.id }, data });
    await audit(req, 'HOUSING_UPDATED', h.id, { caseId: c.id, fields: Object.keys(body), by: 'staff' });
    if (appointmentChanged && fresh.appointmentAt) await notifyHousingClient(c, fresh, 'APPT_SET');
  }
  if (done === true) {
    if (await completeAnmeldung(c, 'STAFF', req.user!.id)) {
      await audit(req, 'HOUSING_ANMELDUNG_DONE', h.id, { caseId: c.id, via: 'STAFF' });
      await notifyHousingClient(c, fresh, 'ANMELDUNG_DONE');
    }
  } else if (done === false && h.anmeldungDoneAt) {
    // Undo a mistaken "done" (the Meldebescheinigung, follow-on tasks and the onboarding tick stay).
    await prisma.caseHousing.update({ where: { id: h.id }, data: { anmeldungDoneAt: null, anmeldungDoneVia: null } });
    await audit(req, 'HOUSING_ANMELDUNG_REOPENED', h.id, { caseId: c.id });
  }
  res.json(await caseResponse(c.id));
});

/** POST /cases/:caseId/contract-review { reply } → answers the client's review request. */
adminHousingRouter.post('/cases/:caseId/contract-review', async (req, res) => {
  const { reply } = parse(z.object({ reply: z.string().trim().min(2).max(4000) }), req.body ?? {});
  const c = await approvedCase(String(req.params.caseId));
  const h = await ensureHousing(c.id);
  if (!h.contractVaultDocId) throw conflict('NO_CONTRACT');
  const fresh = await prisma.caseHousing.update({ where: { id: h.id }, data: { contractReview: 'REVIEWED', contractReply: reply, contractReviewedAt: new Date(), contractReviewedById: req.user!.id } });
  await audit(req, 'HOUSING_CONTRACT_REVIEWED', h.id, { caseId: c.id });
  await notifyHousingClient(c, fresh, 'CONTRACT_REVIEWED', { note: reply });
  res.json(await caseResponse(c.id));
});

/** GET /cases/:caseId/files/:which (contract | melde) → the client's vault file linked to the case. */
adminHousingRouter.get('/cases/:caseId/files/:which', async (req, res) => {
  const which = String(req.params.which);
  if (which !== 'contract' && which !== 'melde') throw notFound('FILE_NOT_FOUND');
  const c = await loadCase(String(req.params.caseId));
  const h = c ? await prisma.caseHousing.findUnique({ where: { caseId: c.id } }) : null;
  if (!c || !h) throw notFound('FILE_NOT_FOUND');
  const d = await sendVaultFile(res, which === 'contract' ? h.contractVaultDocId : h.meldeVaultDocId, c.clientId, !!req.query.download);
  await audit(req, 'HOUSING_FILE_VIEWED', d.id, { caseId: c.id, which });
});

// ─── Anmeldung deadlines across cases ─────────────────────────────────

/** GET /deadlines → approved cases with a move-in date and no Anmeldung yet, nearest deadline first. */
adminHousingRouter.get('/deadlines', async (_req, res) => {
  const rows = await prisma.caseHousing.findMany({
    where: { anmeldungDoneAt: null, moveInDate: { not: null }, case: { status: 'APPROVED' } },
    include: { case: { select: { id: true, number: true, client: { select: { firstName: true, lastName: true } }, assignedStaff: { select: { id: true, firstName: true, lastName: true } } } } },
    orderBy: { moveInDate: 'asc' },
    take: 200,
  });
  const now = new Date();
  res.json({
    items: rows.map((h) => ({
      caseId: h.caseId,
      number: h.case.number,
      client: `${h.case.client.firstName} ${h.case.client.lastName}`.trim(),
      assignedStaff: h.case.assignedStaff,
      moveInDate: dateToDay(h.moveInDate!),
      appointmentAt: h.appointmentAt,
      ...deadlineInfo(h, now),
    })),
  });
});

// ─── Partner listings ─────────────────────────────────────────────────

const optText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v === undefined ? undefined : v ? v : null));
const photoUrl = z.string().trim().max(500).regex(/^(\/uploads\/[A-Za-z0-9._-]+|https:\/\/[^\s]+)$/, 'INVALID_PHOTO');

const listingSchema = z.object({
  name: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(80),
  type: z.enum(LISTING_TYPES),
  priceMin: z.coerce.number().int().min(0).max(20000).nullable().optional(),
  priceMax: z.coerce.number().int().min(0).max(20000).nullable().optional(),
  description: optText(4000),
  contactName: optText(160),
  contactPhone: optText(60),
  contactEmail: z.union([z.literal(''), z.string().trim().email().max(190)]).nullable().optional().transform((v) => (v === undefined ? undefined : v || null)),
  address: optText(300),
  notes: optText(4000),
  photos: z.array(photoUrl).max(8).optional(),
  active: z.boolean().optional(),
  companyId: z.string().trim().max(40).nullable().optional(),
});

const checkListing = async (body: Partial<z.infer<typeof listingSchema>>, current?: { priceMin: number | null; priceMax: number | null }) => {
  const min = body.priceMin !== undefined ? body.priceMin : current?.priceMin;
  const max = body.priceMax !== undefined ? body.priceMax : current?.priceMax;
  if (min != null && max != null && min > max) throw badRequest('PRICE_RANGE');
  if (body.companyId && !(await prisma.company.count({ where: { id: body.companyId } }))) throw badRequest('INVALID_COMPANY');
};

adminHousingRouter.get('/listings', async (req, res) => {
  const q = parse(z.object({ q: z.string().trim().max(100).optional(), city: z.string().trim().max(80).optional(), active: z.enum(['all', 'active', 'inactive']).default('all') }), req.query);
  const where: Prisma.PartnerHousingWhereInput = {
    ...(q.active === 'active' ? { active: true } : q.active === 'inactive' ? { active: false } : {}),
    ...(q.city ? { city: { contains: q.city } } : {}),
    ...(q.q ? { OR: [{ name: { contains: q.q } }, { city: { contains: q.q } }, { contactName: { contains: q.q } }] } : {}),
  };
  const items = await prisma.partnerHousing.findMany({
    where,
    include: { company: { select: { id: true, name: true } }, _count: { select: { proposals: { where: { withdrawnAt: null } } } } },
    orderBy: [{ active: 'desc' }, { city: 'asc' }, { name: 'asc' }],
    take: 500,
  });
  res.json({ items: items.map(listingStaffView), canEdit: hasMinRole(req.user!.role, 'ADMIN') });
});

adminHousingRouter.post('/listings', adminOnly, async (req, res) => {
  const body = parse(listingSchema, req.body ?? {});
  await checkListing(body);
  const l = await prisma.partnerHousing.create({ data: { ...body, photos: body.photos ?? [], createdById: req.user!.id }, include: { company: { select: { id: true, name: true } } } });
  await audit(req, 'HOUSING_LISTING_CREATED', l.id, { name: l.name, city: l.city });
  res.status(201).json({ listing: listingStaffView(l) });
});

adminHousingRouter.patch('/listings/:id', adminOnly, async (req, res) => {
  const body = parse(listingSchema.partial(), req.body ?? {});
  const current = await prisma.partnerHousing.findUnique({ where: { id: String(req.params.id) } });
  if (!current) throw notFound('LISTING_NOT_FOUND');
  await checkListing(body, current);
  const l = await prisma.partnerHousing.update({ where: { id: current.id }, data: body, include: { company: { select: { id: true, name: true } } } });
  await audit(req, 'HOUSING_LISTING_UPDATED', l.id, { fields: Object.keys(body) });
  res.json({ listing: listingStaffView(l) });
});

adminHousingRouter.delete('/listings/:id', adminOnly, async (req, res) => {
  const current = await prisma.partnerHousing.findUnique({ where: { id: String(req.params.id) } });
  if (!current) throw notFound('LISTING_NOT_FOUND');
  await prisma.partnerHousing.delete({ where: { id: current.id } });
  await audit(req, 'HOUSING_LISTING_DELETED', current.id, { name: current.name, city: current.city });
  res.json({ ok: true });
});

/** GET /listings/:id/proposals → who got this listing and what they answered. */
adminHousingRouter.get('/listings/:id/proposals', async (req, res) => {
  const rows = await prisma.housingProposal.findMany({
    where: { listingId: String(req.params.id) },
    include: { case: { select: { id: true, number: true, client: { select: { firstName: true, lastName: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: rows });
});

/** POST /listings/:id/propose { caseId, note } → the listing appears in the client's portal. */
adminHousingRouter.post('/listings/:id/propose', async (req, res) => {
  const body = parse(z.object({ caseId: z.string().min(1).max(40), note: z.string().trim().max(1000).optional() }), req.body ?? {});
  const l = await prisma.partnerHousing.findUnique({ where: { id: String(req.params.id) } });
  if (!l) throw notFound('LISTING_NOT_FOUND');
  if (!l.active) throw conflict('LISTING_INACTIVE');
  const c = await approvedCase(body.caseId);
  const existing = await prisma.housingProposal.findUnique({ where: { listingId_caseId: { listingId: l.id, caseId: c.id } } });
  if (existing && !existing.withdrawnAt) throw conflict('ALREADY_PROPOSED');
  const p = await prisma.housingProposal.upsert({
    where: { listingId_caseId: { listingId: l.id, caseId: c.id } },
    create: { listingId: l.id, caseId: c.id, source: 'STAFF', staffNote: body.note || null, proposedById: req.user!.id },
    update: { source: 'STAFF', staffNote: body.note || null, proposedById: req.user!.id, withdrawnAt: null, response: 'PENDING', clientNote: null, respondedAt: null, introducedAt: null, introducedById: null },
  });
  await audit(req, 'HOUSING_LISTING_PROPOSED', p.id, { caseId: c.id, listingId: l.id });
  await notifyHousingClient(c, null, 'PROPOSAL_NEW', { listing: `${l.name} (${l.city})`, note: body.note || null });
  res.status(201).json({ proposal: p });
});

/** PATCH /proposals/:id { introduced?, withdrawn?, note? } → introduced shows the contact to the client. */
adminHousingRouter.patch('/proposals/:id', async (req, res) => {
  const body = parse(z.object({ introduced: z.boolean().optional(), withdrawn: z.boolean().optional(), note: z.string().trim().max(1000).nullable().optional() }), req.body ?? {});
  const p = await prisma.housingProposal.findUnique({ where: { id: String(req.params.id) }, include: { listing: true } });
  if (!p) throw notFound('PROPOSAL_NOT_FOUND');
  const c = await approvedCase(p.caseId);
  const data: Prisma.HousingProposalUpdateInput = {};
  if (body.note !== undefined) data.staffNote = body.note || null;
  if (body.withdrawn === true && !p.withdrawnAt) Object.assign(data, { withdrawnAt: new Date() });
  if (body.withdrawn === false && p.withdrawnAt) Object.assign(data, { withdrawnAt: null });
  const introduce = body.introduced === true && !p.introducedAt;
  if (introduce) {
    if (p.withdrawnAt && body.withdrawn !== false) throw conflict('PROPOSAL_WITHDRAWN');
    Object.assign(data, { introducedAt: new Date(), introducedById: req.user!.id });
  }
  if (body.introduced === false && p.introducedAt) Object.assign(data, { introducedAt: null, introducedById: null });
  const updated = await prisma.housingProposal.update({ where: { id: p.id }, data });
  await audit(req, introduce ? 'HOUSING_PROPOSAL_INTRODUCED' : 'HOUSING_PROPOSAL_UPDATED', p.id, { caseId: p.caseId, listingId: p.listingId, fields: Object.keys(body) });
  if (introduce) await notifyHousingClient(c, null, 'PROPOSAL_INTRODUCED', { listing: `${p.listing.name} (${p.listing.city})` });
  res.json({ proposal: updated });
});

/** GET /companies → employers for the listing form (id + name only). */
adminHousingRouter.get('/companies', async (_req, res) => {
  res.json({ items: await prisma.company.findMany({ select: { id: true, name: true, city: true }, orderBy: { name: 'asc' }, take: 1000 }) });
});
