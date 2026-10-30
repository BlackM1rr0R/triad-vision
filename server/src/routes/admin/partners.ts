import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { hasMinRole, requireMinRole } from '../../middleware/auth.js';
import { HttpError, badRequest, conflict, forbidden, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { XLSX_MIME } from '../../lib/clientsExcel.js';
import { buildPartnerWorkbook, partnerCaseRows, partnerCounts, syncFoldersLater } from '../../lib/partners/index.js';
import { refusalCsv, refusalQuery, refusalReport } from '../../lib/partners/refusals.js'; // Ablehnung by partner / company
import { ensurePartnerFolder, partnerFolderId, partnerFolderIds, syncPartnerFolder } from '../../lib/drive/caseFolders.js';
import { PARTNER_COMMISSION_TRIGGERS, partnerCommissionTotals } from '../../lib/partners/commissions.js';
import { PARTNER_VISIBILITY, codeInUse, partnerLinks, setClientOwner, suggestPartnerCode } from '../../lib/partners/owned.js';
import { normaliseAgentCode } from '../../lib/agents/referral.js';
import { assignCases, deletePartner } from '../../lib/partners/manage.js';
import { partnerLoginRouter, partnerLoginView } from '../../lib/partners/adminLoginRoutes.js';
import { partnerCommissionsRouter } from '../../lib/partners/adminCommissionRoutes.js';
import { requestMaskGroups } from '../../lib/privacy/mask.js';

/**
 * Referral partners (middlemen who bring visa clients) — /api/admin/partners.
 * Staff read, create, edit and assign cases (the team manages partners from the shared drive); only
 * admins delete partners. Not to be confused with the
 * public-site partner logos (/admin/content/partners) or the AGENT programme (/admin/agents).
 */
export const adminPartnersRouter = Router();

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

const partnerBody = z.object({
  name: z.string().trim().min(1).max(120),
  phone: opt(40),
  email: z
    .union([z.literal(''), z.string().trim().email().max(191)])
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
  note: opt(5000),
  active: z.boolean().optional(),
  /** Default commission per client in cents (null = no automatic commission). */
  commissionCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  /** Personal sign-up code (null removes it; existing owned clients stay with the partner). */
  code: z
    .string()
    .trim()
    .max(32)
    .transform((v) => normaliseAgentCode(v))
    .refine((v) => v.length >= 3, 'CODE_TOO_SHORT')
    .nullable()
    .optional(),
  commissionTrigger: z.enum(PARTNER_COMMISSION_TRIGGERS).optional(),
  visibility: z.enum(PARTNER_VISIBILITY).optional(),
});

/** Codes are unique across partners, agents and client "bring a friend" codes. */
const assertCodeFree = async (code: string | null | undefined, exceptId?: string) => {
  if (code && (await codeInUse(code, exceptId))) throw conflict('PARTNER_CODE_TAKEN');
};

/** Names are unique regardless of case/whitespace (the drive folder is named after the partner). */
const assertNameFree = async (name: string, exceptId?: string) => {
  const clash = await prisma.referralPartner.findFirst({ where: { name, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (clash) throw conflict('PARTNER_NAME_TAKEN');
};

adminPartnersRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({
      search: z.string().trim().max(120).optional(),
      active: z.enum(['true', 'false', 'all']).default('all'),
    }),
    req.query,
  );
  const where: Prisma.ReferralPartnerWhereInput = {
    ...(q.active !== 'all' ? { active: q.active === 'true' } : {}),
    ...(q.search
      ? { OR: [{ name: { contains: q.search } }, { phone: { contains: q.search } }, { email: { contains: q.search } }] }
      : {}),
  };
  const partners = await prisma.referralPartner.findMany({ where, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  const [counts, totals, folders] = await Promise.all([partnerCounts(partners.map((p) => p.id)), partnerCommissionTotals(partners.map((p) => p.id)), partnerFolderIds(partners)]);
  // folderId: the partner's live folder below "Partner" (null when it was deleted in the drive — the card offers to recreate it).
  res.json({ items: partners.map((p) => ({ ...p, counts: counts.get(p.id), commissionTotals: totals.get(p.id), folderId: folders.get(p.id) ?? null })) });
});

/**
 * GET /clients/:userId/owner — the client's owning partner and the history of changes (staff).
 * PATCH /clients/:userId/owner { partnerId | null, note } — ADMIN+ reassign (audited, history kept;
 * open cases of the old owner follow, lib/partners/owned.ts).
 */
adminPartnersRouter.get('/clients/:userId/owner', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: String(req.params.userId) },
    select: { id: true, ownerPartnerAt: true, ownerPartner: { select: { id: true, name: true, code: true } } },
  });
  if (!user) throw notFound('USER_NOT_FOUND');
  const history = await prisma.partnerClientChange.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  const ids = [...new Set(history.flatMap((h) => [h.fromPartnerId, h.toPartnerId]).filter((x): x is string => !!x))];
  const actorIds = [...new Set(history.map((h) => h.actorId).filter((x): x is string => !!x))];
  const [partners, actors] = await Promise.all([
    prisma.referralPartner.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const pName = new Map(partners.map((p) => [p.id, p.name]));
  const aName = new Map(actors.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]));
  res.json({
    owner: user.ownerPartner,
    ownedSince: user.ownerPartnerAt,
    history: history.map((h) => ({
      id: h.id,
      source: h.source,
      from: h.fromPartnerId ? { id: h.fromPartnerId, name: pName.get(h.fromPartnerId) ?? null } : null,
      to: h.toPartnerId ? { id: h.toPartnerId, name: pName.get(h.toPartnerId) ?? null } : null,
      actor: h.actorId ? (aName.get(h.actorId) ?? null) : null,
      note: h.note,
      createdAt: h.createdAt,
    })),
  });
});

adminPartnersRouter.patch('/clients/:userId/owner', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(z.object({ partnerId: z.string().min(1).max(40).nullable(), note: z.string().trim().max(500).optional() }), req.body);
  const user = await prisma.user.findUnique({ where: { id: String(req.params.userId) }, select: { id: true, role: true } });
  if (!user) throw notFound('USER_NOT_FOUND');
  if (user.role !== 'CLIENT') throw badRequest('NOT_A_CLIENT');
  if (body.partnerId && !(await prisma.referralPartner.findUnique({ where: { id: body.partnerId }, select: { id: true } }))) throw badRequest('INVALID_PARTNER');
  const result = await setClientOwner(user.id, body.partnerId, req.user!.id, body.note ?? null);
  await audit(req, 'PARTNER_CLIENT_OWNER_CHANGED', `user:${user.id}`, { from: result?.from ?? null, to: body.partnerId, casesMoved: result?.casesMoved ?? 0, note: body.note ?? null });
  res.json({ ok: true, ...result });
});

// Commissions (all partners) and portal logins live in their own routers; mounted before "/:id".
adminPartnersRouter.use('/commissions', partnerCommissionsRouter);
adminPartnersRouter.use('/', partnerLoginRouter);

/**
 * GET /refusals — visa refusals ("Ablehnung") per partner or per employer company: cases, visas, refusals,
 * refusal rate (?group=partner|company, ?from, ?to, ?basis=created|decision, ?partnerId, ?withPartner=0).
 * GET /refusals.csv — the same as CSV.
 */
adminPartnersRouter.get('/refusals', async (req, res) => {
  res.json(await refusalReport(parse(refusalQuery, req.query)));
});

adminPartnersRouter.get('/refusals.csv', async (req, res) => {
  const q = parse(refusalQuery, req.query);
  const report = await refusalReport(q);
  await audit(req, 'PARTNER_REFUSALS_EXPORTED', q.partnerId, { group: q.group, from: q.from ?? null, to: q.to ?? null, basis: q.basis });
  const name = `Ablehnung-${q.group === 'partner' ? 'partnyorlar' : 'sirketler'}${q.from ? `-${q.from}` : ''}${q.to ? `_${q.to}` : ''}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(refusalCsv(report));
});

/** PATCH /assign { caseIds, partnerId | null } — staff link (or unlink) cases to a partner in bulk. */
adminPartnersRouter.patch('/assign', async (req, res) => {
  const body = parse(
    z.object({ caseIds: z.array(z.string().min(1).max(40)).min(1).max(500), partnerId: z.string().min(1).max(40).nullable() }),
    req.body,
  );
  const ids = [...new Set(body.caseIds)];
  if (body.partnerId) {
    const p = await prisma.referralPartner.findUnique({ where: { id: body.partnerId }, select: { id: true } });
    if (!p) throw badRequest('INVALID_PARTNER');
  }
  if ((await prisma.case.count({ where: { id: { in: ids } } })) !== ids.length) throw badRequest('INVALID_CASE');
  // Folders move in the background; automatic commissions follow (lib/partners/manage.ts).
  const { changed, commissionsCreated } = await assignCases(ids, body.partnerId, req.user!.id);
  await audit(req, body.partnerId ? 'PARTNER_CASES_ASSIGNED' : 'PARTNER_CASES_UNASSIGNED', body.partnerId ?? undefined, {
    caseIds: ids,
    changed: changed.length,
    commissionsCreated,
  });
  res.json({ ok: true, updated: changed.length, commissionsCreated });
});

adminPartnersRouter.get('/:id', async (req, res) => {
  const partner = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) } });
  if (!partner) throw notFound('PARTNER_NOT_FOUND');
  const [cases, counts, totals, login, ownedClients] = await Promise.all([
    partnerCaseRows(partner.id),
    partnerCounts([partner.id]),
    partnerCommissionTotals([partner.id]),
    partnerLoginView(partner.userId),
    prisma.user.findMany({
      where: { ownerPartnerId: partner.id },
      orderBy: { ownerPartnerAt: 'desc' },
      take: 1000,
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true, ownerPartnerAt: true },
    }),
  ]);
  res.json({
    partner: {
      ...partner,
      ...(partner.code ? partnerLinks(partner.code) : { shareLink: null, shortLink: null }),
      counts: counts.get(partner.id),
      commissionTotals: totals.get(partner.id),
      login,
      folderId: await partnerFolderId(partner),
    },
    cases,
    // Clients who belong to the partner (sign-up link, partner portal, admin) — with or without a case.
    ownedClients,
  });
});

/** POST /:id/code (ADMIN+) — a fresh suggested code from the partner's name (stored at once). */
adminPartnersRouter.post('/:id/code', requireMinRole('ADMIN'), async (req, res) => {
  const current = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) }, select: { id: true, name: true, code: true } });
  if (!current) throw notFound('PARTNER_NOT_FOUND');
  const code = await suggestPartnerCode(current.name, current.id);
  const partner = await prisma.referralPartner.update({ where: { id: current.id }, data: { code } });
  await audit(req, 'PARTNER_CODE_GENERATED', partner.id, { from: current.code, to: code });
  res.json({ partner: { ...partner, ...partnerLinks(code) } });
});

/**
 * POST /:id/folder — the partner's drive folder, made available again: the live one, else the one in the
 * recycle bin (restored with its client folders), else a new one. Staff and above.
 */
adminPartnersRouter.post('/:id/folder', async (req, res) => {
  const partner = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) }, select: { id: true, name: true } });
  if (!partner) throw notFound('PARTNER_NOT_FOUND');
  const r = await ensurePartnerFolder(partner.id, { restore: true });
  if (!r) throw new HttpError(500, 'PARTNER_FOLDER_FAILED');
  if (r.restored || r.created) {
    await audit(req, r.restored ? 'PARTNER_FOLDER_RESTORED' : 'PARTNER_FOLDER_CREATED', partner.id, { name: partner.name, folderId: r.folderId });
    // Client folders that ended up elsewhere move (back) into the partner's folder.
    const cases = await prisma.case.findMany({ where: { partnerId: partner.id }, select: { id: true } });
    syncFoldersLater(cases.map((c) => c.id));
  }
  res.json(r);
});

adminPartnersRouter.get('/:id/export.xlsx', async (req, res) => {
  const partner = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) }, select: { id: true, name: true } });
  if (!partner) throw notFound('PARTNER_NOT_FOUND');
  const data = await buildPartnerWorkbook(partner, requestMaskGroups(res)); // masked for STAFF per settings
  await audit(req, 'PARTNER_EXPORTED', partner.id, { format: 'xlsx' });
  const ascii = partner.name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'partner';
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="Partnyor-${ascii}.xlsx"; filename*=UTF-8''${encodeURIComponent(`Partnyor-${partner.name}.xlsx`)}`,
  );
  res.send(data);
});

adminPartnersRouter.post('/', async (req, res) => {
  const body = parse(partnerBody, req.body);
  await assertNameFree(body.name);
  // Code, commission rule and visibility decide ownership, money and data access: ADMIN and above.
  if ((body.code || body.commissionTrigger || body.visibility) && !hasMinRole(req.user!.role, 'ADMIN')) throw forbidden('ADMIN_REQUIRED');
  await assertCodeFree(body.code);
  const partner = await prisma.referralPartner.create({
    data: {
      name: body.name,
      // Every new partner gets a sign-up code right away (editable later).
      code: body.code ?? (await suggestPartnerCode(body.name)),
      ...(body.commissionTrigger ? { commissionTrigger: body.commissionTrigger } : {}),
      ...(body.visibility ? { visibility: body.visibility } : {}),
      phone: body.phone ?? null,
      email: body.email ?? null,
      note: body.note ?? null,
      active: body.active ?? true,
      commissionCents: body.commissionCents ?? null,
      ...(body.currency ? { currency: body.currency } : {}),
    },
  });
  await audit(req, 'PARTNER_CREATED', partner.id, { name: partner.name });
  // The partner's folder in "Gemeinsame Dokumente/Partner" exists from the start, even without clients.
  const folderId = await syncPartnerFolder(partner.id);
  res.status(201).json({ partner, folderId });
});

adminPartnersRouter.patch('/:id', async (req, res) => {
  const body = parse(partnerBody.partial(), req.body);
  const current = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) } });
  if (!current) throw notFound('PARTNER_NOT_FOUND');
  if (body.name !== undefined && body.name !== current.name) await assertNameFree(body.name, current.id);
  // Code, commission rule and visibility decide ownership, money and data access: ADMIN and above.
  const sensitive =
    (body.code !== undefined && body.code !== current.code) ||
    (body.commissionTrigger !== undefined && body.commissionTrigger !== current.commissionTrigger) ||
    (body.visibility !== undefined && body.visibility !== current.visibility);
  if (sensitive && !hasMinRole(req.user!.role, 'ADMIN')) throw forbidden('ADMIN_REQUIRED');
  if (body.code !== undefined && body.code !== current.code) await assertCodeFree(body.code, current.id);
  const partner = await prisma.referralPartner.update({ where: { id: current.id }, data: body });
  await audit(req, 'PARTNER_UPDATED', partner.id, { fields: Object.keys(body), ...(partner.name !== current.name ? { from: current.name, to: partner.name } : {}) });
  if (partner.name !== current.name) {
    // The partner's drive folder is renamed (files stay); the client folders inside follow.
    await syncPartnerFolder(partner.id, { previousName: current.name });
    const cases = await prisma.case.findMany({ where: { partnerId: partner.id }, select: { id: true } });
    syncFoldersLater(cases.map((c) => c.id));
  }
  res.json({ partner });
});

/**
 * DELETE /:id (admins) — without `?force=1` a partner with cases answers 409 PARTNER_HAS_CASES (with the
 * counts, so the UI can ask first). With force the partner is deleted anyway: cases unassigned (client
 * folders back to "Anträge", automatic commissions cancelled), settlement rows kept without the partner,
 * portal login unlinked, empty partner folder to the recycle bin (lib/partners/manage.ts).
 */
adminPartnersRouter.delete('/:id', requireMinRole('ADMIN'), async (req, res) => {
  const { force } = parse(z.object({ force: z.enum(['1', 'true', '0', 'false']).optional() }), req.query);
  const partner = await prisma.referralPartner.findUnique({ where: { id: String(req.params.id) }, include: { _count: { select: { cases: true, settlements: true } } } });
  if (!partner) throw notFound('PARTNER_NOT_FOUND');
  if (partner._count.cases > 0 && force !== '1' && force !== 'true') {
    const clients = (await partnerCounts([partner.id])).get(partner.id)?.clients ?? 0;
    res.status(409).json({ error: 'PARTNER_HAS_CASES', message: 'PARTNER_HAS_CASES', cases: partner._count.cases, clients, settlements: partner._count.settlements });
    return;
  }
  const summary = await deletePartner(partner.id, req.user!.id);
  if (!summary) throw notFound('PARTNER_NOT_FOUND');
  await audit(req, 'PARTNER_DELETED', partner.id, { ...summary, force: partner._count.cases > 0 });
  res.json({ ok: true, ...summary });
});
