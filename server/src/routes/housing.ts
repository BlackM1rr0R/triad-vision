import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { buildIcs } from '../lib/ics.js';
import {
  approvedCaseFor,
  completeAnmeldung,
  ensureHousing,
  housingView,
  listingClientView,
  listingMatchesCase,
  caseCity,
  listingsForCase,
  notifyHousingClient,
  notifyHousingStaff,
  tickOnboarding,
  type HousingCase,
} from '../lib/housing/core.js';
import { housingPatchData, housingPatchSchema } from '../lib/housing/input.js';
import { housingUpload, removeUpload, storeInVault } from '../lib/housing/files.js';
import { icsLabels } from '../lib/housing/texts.js';

/**
 * Client side of housing search + Anmeldung (/api/housing). Only clients, only their own APPROVED cases
 * (404 / 409 otherwise). Files go to the client's vault; staff answer through /api/admin/housing.
 */
export const housingRouter = Router();
housingRouter.use(requireAuth);
housingRouter.use((req, _res, next) => {
  if (req.user!.role !== 'CLIENT') throw forbidden('CLIENTS_ONLY');
  next();
});

const caseIdOf = (req: Request) => {
  const v = (req.body && typeof req.body === 'object' ? (req.body as { caseId?: unknown }).caseId : undefined) ?? req.query.caseId;
  return typeof v === 'string' && v ? v.slice(0, 40) : null;
};

const myCase = async (req: Request) => {
  const c = await approvedCaseFor(req.user!.id, caseIdOf(req));
  if (!c) throw conflict('NO_APPROVED_CASE');
  return c;
};

const clientTasks = (caseId: string) =>
  prisma.clientTask.findMany({
    where: { caseId, template: { in: ['STEUER_ID', 'BANK_ACCOUNT', 'HEALTH_CARD'] }, status: { not: 'CANCELLED' } },
    select: { id: true, template: true, status: true, dueAt: true, completedAt: true },
    orderBy: { createdAt: 'asc' },
  });

const fullResponse = async (c: HousingCase) => {
  const h = await ensureHousing(c.id);
  const [housing, listings, followUps] = await Promise.all([housingView(h, c), listingsForCase(c, h), clientTasks(c.id)]);
  return {
    case: { id: c.id, number: c.number, employer: c.company?.name ?? null, arrivalStatus: c.arrivalPlan?.status ?? null },
    housing,
    listings: { proposed: listings.proposed, matching: listings.matching },
    followUps,
  };
};

/** GET /api/housing?caseId → everything for the page; { case: null } before any visa approval. */
housingRouter.get('/', async (req, res) => {
  const c = await approvedCaseFor(req.user!.id, caseIdOf(req));
  if (!c) {
    if (caseIdOf(req)) throw notFound('CASE_NOT_FOUND');
    res.json({ case: null, housing: null, listings: { proposed: [], matching: [] }, followUps: [] });
    return;
  }
  res.json(await fullResponse(c));
});

/** PATCH /api/housing → city, budget, move-in date, checklist ticks, Bürgeramt appointment. */
housingRouter.patch('/', async (req, res) => {
  const { caseId: _ignored, ...body } = parse(housingPatchSchema, req.body ?? {});
  const c = await myCase(req);
  const h = await ensureHousing(c.id);
  const { data, appointmentChanged } = housingPatchData(h, body, req.user!.id);
  if (Object.keys(data).length) {
    const fresh = await prisma.caseHousing.update({ where: { id: h.id }, data });
    await audit(req, 'HOUSING_UPDATED', fresh.id, { caseId: c.id, fields: Object.keys(body) });
    if (body.steps?.handover) await tickOnboarding(c.id, 'mietvertrag');
    if (appointmentChanged && fresh.appointmentAt) await notifyHousingStaff(c, fresh, 'STAFF_APPT_SET');
  }
  res.json(await fullResponse(c));
});

/** POST /api/housing/contract (multipart "file", optional "question" + "requestReview") → vault + link. */
housingRouter.post('/contract', housingUpload.single('file'), async (req, res) => {
  const file = req.file;
  try {
    if (!file) throw badRequest('FILE_REQUIRED');
    const body = parse(z.object({ caseId: z.string().max(40).optional(), question: z.string().trim().max(2000).optional(), requestReview: z.enum(['true', 'false']).optional() }), req.body ?? {});
    const c = await myCase(req);
    const h = await ensureHousing(c.id);
    const doc = await storeInVault(file, req.user!.id, 'contract', c.client.locale);
    const review = body.requestReview === 'true';
    const now = new Date();
    const fresh = await prisma.caseHousing.update({
      where: { id: h.id },
      data: {
        contractVaultDocId: doc.id,
        contractUploadedAt: now,
        ...(review ? { contractReview: 'REQUESTED', contractQuestion: body.question || null, contractReviewRequestedAt: now, contractReply: null, contractReviewedAt: null, contractReviewedById: null } : {}),
      },
    });
    await audit(req, 'HOUSING_CONTRACT_UPLOADED', fresh.id, { caseId: c.id, vaultDocumentId: doc.id, review });
    if (review) await notifyHousingStaff(c, fresh, 'STAFF_CONTRACT_REVIEW', { note: body.question || null });
    res.status(201).json(await fullResponse(c));
  } catch (err) {
    await removeUpload(file);
    throw err;
  }
});

/** POST /api/housing/contract/review { question } → asks the team to look at the uploaded contract. */
housingRouter.post('/contract/review', async (req, res) => {
  const body = parse(z.object({ caseId: z.string().max(40).optional(), question: z.string().trim().max(2000).optional() }), req.body ?? {});
  const c = await myCase(req);
  const h = await ensureHousing(c.id);
  if (!h.contractVaultDocId) throw conflict('NO_CONTRACT');
  if (h.contractReview === 'REQUESTED') throw conflict('REVIEW_ALREADY_REQUESTED');
  const fresh = await prisma.caseHousing.update({
    where: { id: h.id },
    data: { contractReview: 'REQUESTED', contractQuestion: body.question || null, contractReviewRequestedAt: new Date(), contractReply: null, contractReviewedAt: null, contractReviewedById: null },
  });
  await audit(req, 'HOUSING_CONTRACT_REVIEW_REQUESTED', fresh.id, { caseId: c.id });
  await notifyHousingStaff(c, fresh, 'STAFF_CONTRACT_REVIEW', { note: body.question || null });
  res.json(await fullResponse(c));
});

/** POST /api/housing/meldebescheinigung (multipart "file") → vault, Anmeldung done, follow-on tasks. */
housingRouter.post('/meldebescheinigung', housingUpload.single('file'), async (req, res) => {
  const file = req.file;
  try {
    if (!file) throw badRequest('FILE_REQUIRED');
    const c = await myCase(req);
    const h = await ensureHousing(c.id);
    const doc = await storeInVault(file, req.user!.id, 'melde', c.client.locale);
    const first = await completeAnmeldung(c, 'UPLOAD', req.user!.id, { meldeVaultDocId: doc.id });
    await audit(req, 'HOUSING_MELDE_UPLOADED', h.id, { caseId: c.id, vaultDocumentId: doc.id, completed: first });
    if (first) {
      await notifyHousingStaff(c, h, 'STAFF_MELDE_UPLOADED');
      await notifyHousingClient(c, h, 'ANMELDUNG_DONE');
    }
    res.status(201).json(await fullResponse(c));
  } catch (err) {
    await removeUpload(file);
    throw err;
  }
});

const respondSchema = z.object({ interested: z.boolean(), note: z.string().trim().max(1000).optional() });

/** POST /api/housing/proposals/:id/respond { interested, note } → the client's answer to a proposal. */
housingRouter.post('/proposals/:id/respond', async (req, res) => {
  const body = parse(respondSchema, req.body ?? {});
  const p = await prisma.housingProposal.findUnique({ where: { id: String(req.params.id) }, include: { listing: true, case: { select: { clientId: true, status: true } } } });
  if (!p || p.case.clientId !== req.user!.id || p.withdrawnAt || p.case.status !== 'APPROVED' || (!p.listing.active && !p.introducedAt)) throw notFound('PROPOSAL_NOT_FOUND');
  const updated = await prisma.housingProposal.update({
    where: { id: p.id },
    data: { response: body.interested ? 'INTERESTED' : 'NOT_INTERESTED', clientNote: body.note || null, respondedAt: new Date() },
  });
  await audit(req, 'HOUSING_PROPOSAL_RESPONDED', p.id, { caseId: p.caseId, listingId: p.listingId, response: updated.response });
  const c = (await approvedCaseFor(req.user!.id, p.caseId))!;
  if (p.response !== updated.response) {
    await notifyHousingStaff(c, null, body.interested ? 'STAFF_PROPOSAL_INTERESTED' : 'STAFF_PROPOSAL_DECLINED', { listing: `${p.listing.name} (${p.listing.city})`, note: body.note || null });
  }
  res.json({ listing: listingClientView(p.listing, updated) });
});

/** POST /api/housing/listings/:id/interest { note } → the client asks about a matching listing. */
housingRouter.post('/listings/:id/interest', async (req, res) => {
  const body = parse(z.object({ caseId: z.string().max(40).optional(), note: z.string().trim().max(1000).optional() }), req.body ?? {});
  const c = await myCase(req);
  const l = await prisma.partnerHousing.findUnique({ where: { id: String(req.params.id) }, include: { company: { select: { id: true, name: true } } } });
  const existing = l ? await prisma.housingProposal.findUnique({ where: { listingId_caseId: { listingId: l.id, caseId: c.id } } }) : null;
  const h = await ensureHousing(c.id);
  const visible = !!l && (listingMatchesCase(l, { city: caseCity(c, h), companyId: c.companyId }) || (!!existing && !existing.withdrawnAt && l.active));
  if (!l || !visible) throw notFound('LISTING_NOT_FOUND');
  const p = await prisma.housingProposal.upsert({
    where: { listingId_caseId: { listingId: l.id, caseId: c.id } },
    create: { listingId: l.id, caseId: c.id, source: 'CLIENT', response: 'INTERESTED', clientNote: body.note || null, respondedAt: new Date() },
    update: { response: 'INTERESTED', clientNote: body.note || null, respondedAt: new Date(), ...(existing?.withdrawnAt ? { withdrawnAt: null, source: 'CLIENT', introducedAt: null, introducedById: null } : {}) },
  });
  await audit(req, 'HOUSING_LISTING_INTEREST', p.id, { caseId: c.id, listingId: l.id });
  if (existing?.response !== 'INTERESTED' || existing?.withdrawnAt) await notifyHousingStaff(c, null, 'STAFF_CLIENT_INTEREST', { listing: `${l.name} (${l.city})`, note: body.note || null });
  res.status(existing ? 200 : 201).json({ listing: listingClientView(l, p) });
});

/** GET /api/housing/appointment.ics → the Bürgeramt appointment as a calendar entry. */
housingRouter.get('/appointment.ics', async (req, res) => {
  const c = await myCase(req);
  const h = await prisma.caseHousing.findUnique({ where: { caseId: c.id } });
  if (!h?.appointmentAt) throw notFound('NO_APPOINTMENT');
  const L = icsLabels[c.client.locale];
  const ics = buildIcs({
    uid: `anmeldung-${h.id}@triad-vision.de`,
    start: h.appointmentAt,
    end: new Date(h.appointmentAt.getTime() + 30 * 60 * 1000),
    summary: L.summary,
    description: [L.bring, h.appointmentNote].filter(Boolean).join('\n'),
    location: h.appointmentAddress ?? undefined,
    url: `${config.clientUrl.replace(/\/$/, '')}/account/housing`,
    status: 'CONFIRMED',
    stamp: h.updatedAt,
  });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="anmeldung-${c.number}.ics"`);
  res.send(ics);
});
