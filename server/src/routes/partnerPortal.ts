import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { decodeOriginalName, documentUpload, verifyUploadedFile } from '../middleware/upload.js';
import { badRequest, conflict, forbidden, HttpError, limiter, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { FINAL_STATUSES, createCase } from '../lib/caseFlow.js';
import { checkedVacancy, vacancyCaseFields } from '../lib/vacancyPlaces/application.js'; // same vacancy checks as the client's own application
import { partnerTrend } from '../lib/partnerPortal/trend.js';
import { caseLabels, commissionTotals, monthRange, settlementClientNames } from '../lib/partners/commissions.js';
import { buildCommissionWorkbook } from '../lib/partners/report.js';
import { ACTIVE_FILTER, listPartnerCases, partnerCaseDetail, storePartnerUpload, visaFacets } from '../lib/partnerPortal/cases.js';
import { isRefused } from '../lib/caseProcessing/index.js';
import { attachPartnerOwner, extendedContact, listPartnerClients, partnerLinks, sendClientInvite, suggestPartnerCode } from '../lib/partners/owned.js';
import { XLSX_MIME, markClientsExcelDirty } from '../lib/clientsExcel.js';
import { scanUserDuplicates } from '../lib/duplicates/detect.js';
import { intlPhone, passportNo } from './auth.js';
import { partnerPortalProfileRouter } from '../lib/partners/portalProfileRoutes.js'; // own legal data, change requests, own contracts
import { partnerSchoolRouter } from '../lib/partners/schoolPortalRoutes.js'; // colleges / language schools: students, attendance + exam records
import { partnerAccessPortalRouter } from '../lib/partnerAccess/portalRoutes.js'; // team, own drive folder, messages, vacancies, document download
import { partnerContextOf, partnerTeamUserIds, requireClientList, requireDocuments, requireFlag } from '../lib/partnerAccess/context.js';
import { portalAreas, shapeCaseDetail, shapeCaseRow, shapeClientRow, type PartnerPerms } from '../lib/partnerAccess/permissions.js';
import type { VisaFacet } from '../lib/partnerPortal/cases.js';

/**
 * Referral-partner portal API — mounted at /api/partner. The login is a user with role AGENT that is
 * linked as `ReferralPartner.userId` (owner) or an active partner team member (PartnerMember); anyone else
 * gets 403 (an AGENT without the link: NO_PARTNER_PROFILE). Partners see only cases with their partnerId, in
 * minimised form (lib/partnerPortal/cases.ts), further limited by the partner's permission set
 * (lib/partnerAccess: checked on every endpoint, 403 PARTNER_PERMISSION_DENIED).
 */
export const partnerPortalRouter = Router();
partnerPortalRouter.use(requireRole('AGENT'));
partnerPortalRouter.use('/', partnerPortalProfileRouter); // GET/PATCH /profile, POST /profile/change-request, GET /contracts[/:id/file]
partnerPortalRouter.use('/', partnerSchoolRouter); // schools: GET /students[/:clientId], POST /students/:clientId/records, /student-records/:id[/certificate]
partnerPortalRouter.use('/', partnerAccessPortalRouter); // /team, /drive, /messages, /vacancies, /cases/:id/documents/:docId/file

/** Visa chips: the status breakdown only with the case-stage permission. */
const facetsFor = (facets: VisaFacet[], perms: PartnerPerms) =>
  perms.caseStage ? facets : facets.map(({ key, visaType, visaCategory, count }) => ({ key, visaType, visaCategory, count }));

partnerPortalRouter.get('/me', async (req, res) => {
  const ctx = await partnerContextOf(req);
  let partner = ctx.partner;
  // Partners created before sign-up codes existed (or by the settlement import) get one on first visit.
  if (!partner.code && ctx.role === 'OWNER') {
    const code = await suggestPartnerCode(partner.name, partner.id);
    const saved = await prisma.referralPartner.update({ where: { id: partner.id }, data: { code } }).catch(() => null);
    if (saved) partner = { ...partner, code: saved.code };
  }
  const [user, agent] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { firstName: true, lastName: true, email: true, phone: true, locale: true } }),
    prisma.agent.findUnique({ where: { userId: req.user!.id }, select: { id: true } }),
  ]);
  const { perms } = ctx;
  res.json({
    partner: {
      id: partner.id,
      name: partner.name,
      phone: partner.phone,
      email: partner.email,
      active: partner.active,
      commissionCents: perms.payments ? partner.commissionCents : null,
      currency: partner.currency,
      // Personal sign-up code and links: clients who use them belong to the partner (lib/partners/owned.ts).
      code: perms.addClients ? partner.code : null,
      ...(partner.code && perms.addClients ? partnerLinks(partner.code) : { shareLink: null, shortLink: null }),
      commissionTrigger: partner.commissionTrigger,
      visibility: partner.visibility,
      // AGENCY | SCHOOL | LANGUAGE_SCHOOL: schools get the Students view (lib/partners/schools.ts).
      category: partner.category,
    },
    user,
    // The same login may also take part in the agent programme: the portal then links to /agent.
    alsoAgent: !!agent,
    // What this login may do (lib/partnerAccess); the server checks every request anyway.
    access: { role: ctx.role, template: ctx.template, permissions: perms, areas: portalAreas(perms, { owner: ctx.role === 'OWNER' }) },
  });
});

partnerPortalRouter.get('/dashboard', async (req, res) => {
  const ctx = await partnerContextOf(req);
  const { partner, perms } = ctx;
  const [cases, commissions, events] = await Promise.all([
    prisma.case.findMany({ where: { partnerId: partner.id }, select: { clientId: true, status: true, processingStage: true, createdAt: true, decisionAt: true } }),
    prisma.partnerCommission.findMany({ where: { partnerId: partner.id }, select: { amountCents: true, status: true, createdAt: true, paidAt: true } }),
    prisma.caseEvent.findMany({
      where: { visibleToClient: true, case: { partnerId: partner.id } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, type: true, toStatus: true, createdAt: true, case: { select: { id: true, number: true, client: { select: { firstName: true, lastName: true } } } } },
    }),
  ]);
  const { start, end } = monthRange();
  const all = commissionTotals(commissions);
  res.json({
    currency: partner.currency,
    counts: {
      clients: new Set(cases.map((c) => c.clientId)).size,
      cases: cases.length,
      // Stage figures only with the case-stage permission.
      activeCases: perms.caseStage ? cases.filter((c) => !FINAL_STATUSES.includes(c.status) && !isRefused(c)).length : null,
      approvedVisas: perms.caseStage ? cases.filter((c) => c.status === 'APPROVED').length : null,
      // Visa refused ("rədd"): REJECTED, or marked "Ablehnung" by the team.
      rejected: perms.caseStage ? cases.filter((c) => isRefused(c)).length : null,
    },
    byVisa: facetsFor(await visaFacets({ partnerId: partner.id }), perms),
    // Monthly trend of the partner's own clients / cases; the visa series only with the case-stage permission.
    trend: (({ approved, ...rest }) => ({ ...rest, approved: perms.caseStage ? approved : null }))(partnerTrend(cases, new Date())),
    commissions: perms.payments ? { ...all, thisMonthCents: commissionTotals(commissions, start, end).totalCents } : null,
    // Client names and stage changes: only with the client list and the case stage.
    recent:
      perms.clientList !== 'none' && perms.caseStage
        ? events.map((e) => ({
            id: e.id,
            type: e.type,
            toStatus: e.toStatus,
            createdAt: e.createdAt,
            caseId: e.case.id,
            caseNumber: e.case.number,
            client: `${e.case.client.firstName} ${e.case.client.lastName}`.trim(),
          }))
        : [],
  });
});

partnerPortalRouter.get('/cases', async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireClientList(ctx);
  const q = parse(
    z.object({ search: z.string().trim().max(120).optional(), filter: z.enum(ACTIVE_FILTER).default('all'), visa: z.string().trim().max(60).optional() }),
    req.query,
  );
  // Without the case stage the active / closed filter would reveal it: everything is listed.
  const query = ctx.perms.caseStage ? q : { ...q, filter: 'all' as const };
  // visaFacets: counts per visa kind over all of the partner's cases (the filter chips).
  const [items, facets] = await Promise.all([listPartnerCases(ctx.partner.id, query), visaFacets({ partnerId: ctx.partner.id })]);
  res.json({ items: items.map((r) => shapeCaseRow(r, ctx.perms)), visaFacets: facetsFor(facets, ctx.perms) });
});

partnerPortalRouter.get('/cases/:id', async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireClientList(ctx);
  const { partner, perms } = ctx;
  // "Uploaded by us": the partner's own login and its team (a member sees what the team uploaded).
  const detail = shapeCaseDetail(await partnerCaseDetail(partner.id, String(req.params.id), await partnerTeamUserIds(partner)), perms);
  // Download level: every file of the requirement (names + ids for GET /cases/:id/documents/:docId/file).
  const requirements =
    perms.documents === 'download' && detail.requirements.length
      ? await (async () => {
          const docs = await prisma.document.findMany({
            where: { caseId: detail.id, requirementId: { in: detail.requirements.map((r) => r.id) } },
            orderBy: { createdAt: 'desc' },
            select: { id: true, requirementId: true, originalName: true, status: true, createdAt: true },
          });
          return detail.requirements.map((r) => ({ ...r, files: docs.filter((d) => d.requirementId === r.id).map(({ requirementId: _r, originalName, ...d }) => ({ ...d, name: originalName })) }));
        })()
      : detail.requirements;
  // Contacts only with extended visibility and the client's consent (lib/partners/owned.ts).
  res.json({ case: { ...detail, requirements, contact: await extendedContact(partner, detail.id) } });
});

/** Upload on behalf of the client (multipart: file + requirementId); goes to the normal staff review. */
partnerPortalRouter.post(
  '/cases/:id/documents',
  async (req, _res, next) => {
    // Rights are checked before a single byte is spooled to disk (like the drive upload).
    const ctx = await partnerContextOf(req);
    requireClientList(ctx);
    requireDocuments(ctx, 'upload');
    next();
  },
  documentUpload.single('file'),
  async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('FILE_REQUIRED');
    try {
      const ctx = await partnerContextOf(req);
      requireClientList(ctx);
      requireDocuments(ctx, 'upload');
      const { partner } = ctx;
      await verifyUploadedFile(file);
      const { requirementId } = parse(z.object({ requirementId: z.string().min(1).max(40) }), req.body);
      const out = await storePartnerUpload({
        partnerId: partner.id,
        caseId: String(req.params.id),
        requirementId,
        userId: req.user!.id,
        file: { originalName: decodeOriginalName(file.originalname), storedName: file.filename, mimeType: file.mimetype, size: file.size },
      });
      await audit(req, 'PARTNER_DOCUMENT_UPLOADED', `case:${req.params.id}`, { partnerId: partner.id, documentId: out.document.id });
      res.status(201).json({ document: out.document, checks: out.checks });
    } catch (err) {
      await fs.unlink(path.join(config.uploads.privateDir, file.filename)).catch(() => undefined);
      throw err;
    }
  },
);

const commissionQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'PAID', 'CANCELLED']).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

partnerPortalRouter.get('/commissions', async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireFlag(ctx, 'payments');
  const { partner } = ctx;
  // Client names next to the amounts only with the client list.
  const names = ctx.perms.clientList !== 'none';
  const q = parse(commissionQuery, req.query);
  const range = q.month ? monthRange(q.month) : null;
  const rows = await prisma.partnerCommission.findMany({
    where: {
      partnerId: partner.id,
      ...(q.status ? { status: q.status } : {}),
      ...(range ? { OR: [{ createdAt: { gte: range.start, lt: range.end } }, { paidAt: { gte: range.start, lt: range.end } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });
  const [labels, settlementNames] = await Promise.all([caseLabels(rows.map((r) => r.caseId)), settlementClientNames(rows)]);
  res.json({
    currency: partner.currency,
    totals: commissionTotals(rows, range?.start, range?.end),
    items: rows.map((r) => {
      const c = r.caseId ? labels.get(r.caseId) : undefined;
      return {
        id: r.id,
        amountCents: r.amountCents,
        currency: r.currency,
        status: r.status,
        createdAt: r.createdAt,
        dueAt: r.dueAt,
        paidAt: r.paidAt,
        // Only the payout note of paid rows; other notes are internal.
        note: r.status === 'PAID' ? r.note : null,
        case: c ? { id: c.id, number: c.number, client: names ? `${c.client.firstName} ${c.client.lastName}`.trim() : null } : null,
        // Settlement-ledger rows of clients not in the system yet: the name from the settlement sheet.
        clientName: !names ? null : c ? `${c.client.firstName} ${c.client.lastName}`.trim() : r.settlementEntryId ? (settlementNames.get(r.settlementEntryId) ?? null) : null,
      };
    }),
  });
});

partnerPortalRouter.get('/commissions/export.xlsx', async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireFlag(ctx, 'payments');
  requireClientList(ctx); // the workbook lists client names
  const { partner } = ctx;
  const q = parse(commissionQuery.omit({ status: true }), req.query);
  const { buffer, rows } = await buildCommissionWorkbook({ partnerId: partner.id, month: q.month, forPartner: true });
  await audit(req, 'PARTNER_COMMISSIONS_EXPORTED', partner.id, { month: q.month ?? null, rows });
  const name = `Komissiyalar${q.month ? `-${q.month}` : ''}.xlsx`;
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buffer);
});

// ─── Own clients (partner-owned clients, lib/partners/owned.ts) ─────────

partnerPortalRouter.get('/clients', async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireClientList(ctx);
  const { partner } = ctx;
  const q = parse(z.object({ search: z.string().trim().max(120).optional() }), req.query);
  res.json({ items: (await listPartnerClients(partner, q)).map((r) => shapeClientRow(r, ctx.perms)), visibility: partner.visibility });
});

const registerLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30, keyGenerator: (req) => `partner-clients:${req.user?.id ?? 'anon'}` });

/**
 * Opens the application of an OWN client for a vacancy on the partner's behalf: the vacancy must be open with a free
 * place (lib/vacancyPlaces/application, same as the client's own application), the client may have only one active
 * application (409 ACTIVE_CASE_EXISTS). The partner vouches for the client, so the client's e-mail need not be
 * verified. The case belongs to the partner; staff get the usual "new application" notice (createCase).
 */
const registerCaseFor = async (req: Request, ctx: Awaited<ReturnType<typeof partnerContextOf>>, clientId: string, vacancyId: string) => {
  const { partner } = ctx;
  if (!partner.active) throw forbidden('PARTNER_INACTIVE');
  const client = await prisma.user.findFirst({ where: { id: clientId, ownerPartnerId: partner.id, role: 'CLIENT', isActive: true }, select: { id: true } });
  if (!client) throw notFound('CLIENT_NOT_FOUND');
  const fields = await vacancyCaseFields(await checkedVacancy(vacancyId), client.id);
  const created = await createCase(client.id, { ...fields, partnerId: partner.id, actorId: req.user!.id });
  await audit(req, 'PARTNER_CASE_REGISTERED', `case:${created.id}`, { partnerId: partner.id, clientId: client.id, vacancyId: fields.vacancyId, role: ctx.role });
  return created;
};

/**
 * POST /clients — the partner registers a client on their behalf. The client gets an e-mail to set their
 * password and belongs to the partner from now on. The partner confirms the client asked for it; the
 * client's own consent to share data with the partner (PARTNER_SHARING) is asked in the client's account.
 */
partnerPortalRouter.post('/clients', registerLimiter, async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireFlag(ctx, 'addClients');
  const { partner } = ctx;
  const body = parse(
    z.object({
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().min(1).max(80),
      email: z.string().trim().toLowerCase().email().max(191),
      phone: intlPhone,
      passportNumber: passportNo.optional().nullable(),
      locale: z.enum(['az', 'de', 'en', 'ru']).default('az'),
      /** Optional: register the new client for this vacancy right away. */
      vacancyId: z.string().trim().min(1).max(40).optional(),
      /** The partner confirms the client asked to be registered (required). */
      clientAgreed: z.literal(true),
    }),
    req.body,
  );
  if (!partner.active) throw forbidden('PARTNER_INACTIVE');
  if (body.vacancyId) await checkedVacancy(body.vacancyId); // refused before the account exists
  if (await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } })) throw conflict('EMAIL_TAKEN');
  const user = await prisma.user
    .create({
      data: {
        email: body.email,
        // Unusable random password: the client sets their own through the invitation link.
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
        role: 'CLIENT',
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        passportNumber: body.passportNumber ?? null,
        locale: body.locale,
      },
    })
    .catch((err: unknown) => {
      // Two submits at once: the unique e-mail index answers like the check above.
      if ((err as { code?: string }).code === 'P2002') throw conflict('EMAIL_TAKEN');
      throw err;
    });
  await attachPartnerOwner(user.id, partner.id, { source: 'PARTNER_PORTAL', actorId: req.user!.id, notify: false });
  await sendClientInvite(user, partner.name);
  await audit(req, 'PARTNER_CLIENT_REGISTERED', `user:${user.id}`, { partnerId: partner.id, clientAgreed: true });
  markClientsExcelDirty();
  void scanUserDuplicates(user.id);
  // The vacancy may have been taken in the meantime: the client stays registered, the answer names the reason.
  let caseId: string | null = null;
  let caseError: string | null = null;
  if (body.vacancyId) {
    try {
      caseId = (await registerCaseFor(req, ctx, user.id, body.vacancyId)).id;
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      caseError = err.code;
    }
  }
  const row = ctx.perms.clientList !== 'none' ? (await listPartnerClients(partner)).find((c) => c.id === user.id) : undefined;
  res.status(201).json({ client: row ? shapeClientRow(row, ctx.perms) : { id: user.id }, caseId, caseError });
});

/**
 * POST /clients/:id/cases { vacancyId } — the partner registers an own client for a vacancy (addClients). Another
 * partner's client or an unknown id → 404 CLIENT_NOT_FOUND; closed / full vacancy → 409 VACANCY_CLOSED / VACANCY_FULL;
 * the client already has an active application → 409 ACTIVE_CASE_EXISTS.
 */
partnerPortalRouter.post('/clients/:id/cases', registerLimiter, async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireFlag(ctx, 'addClients');
  const body = parse(z.object({ vacancyId: z.string().trim().min(1).max(40) }), req.body);
  const created = await registerCaseFor(req, ctx, String(req.params.id), body.vacancyId);
  res.status(201).json({ case: { id: created.id, number: created.number, status: created.status } });
});

/** POST /clients/:id/invite — a fresh set-password e-mail for an own client who has not signed in yet. */
partnerPortalRouter.post('/clients/:id/invite', registerLimiter, async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireFlag(ctx, 'addClients');
  const { partner } = ctx;
  const user = await prisma.user.findFirst({
    where: { id: String(req.params.id), ownerPartnerId: partner.id, role: 'CLIENT' },
    select: { id: true, email: true, locale: true, firstName: true, emailVerifiedAt: true, isActive: true, _count: { select: { sessions: true } } },
  });
  if (!user || !user.isActive) throw notFound('CLIENT_NOT_FOUND');
  if (user.emailVerifiedAt || user._count.sessions > 0) throw conflict('CLIENT_ALREADY_ACTIVE');
  await sendClientInvite(user, partner.name);
  await audit(req, 'PARTNER_CLIENT_INVITED', `user:${user.id}`, { partnerId: partner.id });
  res.json({ ok: true });
});
