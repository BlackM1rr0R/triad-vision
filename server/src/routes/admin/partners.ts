import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { HttpError, badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { XLSX_MIME } from '../../lib/clientsExcel.js';
import { buildPartnerWorkbook, partnerCases, partnerCounts, syncFoldersLater } from '../../lib/partners/index.js';
import { ensurePartnerFolder, partnerFolderId, partnerFolderIds, syncPartnerFolder } from '../../lib/drive/caseFolders.js';
import { partnerCommissionTotals } from '../../lib/partners/commissions.js';
import { assignCases, deletePartner } from '../../lib/partners/manage.js';
import { partnerLoginRouter, partnerLoginView } from '../../lib/partners/adminLoginRoutes.js';
import { partnerCommissionsRouter } from '../../lib/partners/adminCommissionRoutes.js';

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
});

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

// Commissions (all partners) and portal logins live in their own routers; mounted before "/:id".
adminPartnersRouter.use('/commissions', partnerCommissionsRouter);
adminPartnersRouter.use('/', partnerLoginRouter);

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
  const [cases, counts, totals, login] = await Promise.all([
    partnerCases(partner.id),
    partnerCounts([partner.id]),
    partnerCommissionTotals([partner.id]),
    partnerLoginView(partner.userId),
  ]);
  res.json({ partner: { ...partner, counts: counts.get(partner.id), commissionTotals: totals.get(partner.id), login, folderId: await partnerFolderId(partner) }, cases });
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
  const data = await buildPartnerWorkbook(partner);
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
  const partner = await prisma.referralPartner.create({
    data: {
      name: body.name,
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
