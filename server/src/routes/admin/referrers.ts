import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { hasMinRole, requireMinRole } from '../../middleware/auth.js';
import { HttpError, badRequest, conflict, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { suggestPartnerCode } from '../../lib/partners/owned.js';
import { createPartnerLogin } from '../../lib/partners/adminLoginRoutes.js';
import { loadReferrers, treeWithStats, type ReferrerRow } from '../../lib/referrers/service.js';
import { MAX_DEPTH, canAddChild, depthOf, moveError, type NodeStats } from '../../lib/referrers/tree.js';

/**
 * Baku referrers (pyramid, no commissions) — /api/admin/referrers, permission area `partners` (lib/access/routeMap).
 * Staff with partners:view read the tree; creating, approving / rejecting sub-referrer requests, moving and
 * (de)activating are ADMIN and above (like the isReferrer flag and portal logins on the partner page). The rest of a
 * referrer (clients, stages, payments, login) is managed in the partner hub (/admin/partners/:id).
 */
export const adminReferrersRouter = Router();

/** Money of the referrers' clients only for ADMIN+ (as the partner hub's client payments). */
const shape = (s: NodeStats, money: boolean) => (money ? s : { ...s, paidCents: null, outstandingCents: null });

const nodeView = (n: Awaited<ReturnType<typeof treeWithStats>>[number], rows: ReferrerRow[], money: boolean) => {
  const createdBy = n.row.createdByPartnerId ? rows.find((r) => r.id === n.row.createdByPartnerId) : undefined;
  return {
    id: n.row.id,
    name: n.row.name,
    phone: n.row.phone,
    email: n.row.email,
    note: n.row.note,
    active: n.row.active,
    parentPartnerId: n.row.parentPartnerId,
    approvalStatus: n.row.approvalStatus,
    approvalNote: n.row.approvalNote,
    approvalDecidedAt: n.row.approvalDecidedAt,
    createdBy: createdBy ? { id: createdBy.id, name: createdBy.name } : null,
    createdAt: n.row.createdAt,
    hasLogin: !!n.row.userId,
    lastLoginAt: n.lastLoginAt,
    depth: depthOf(rows, n.row.id),
    own: shape(n.own, money),
    total: shape(n.total, money),
    subReferrers: n.subReferrers,
    descendants: n.descendants,
  };
};

/** GET / — the whole tree (flat; parentPartnerId links) with own + subtree figures, and the pending requests. */
adminReferrersRouter.get('/', async (req, res) => {
  const rows = await loadReferrers();
  const money = hasMinRole(req.user!.role, 'ADMIN');
  const items = (await treeWithStats(rows)).map((n) => nodeView(n, rows, money));
  res.json({ maxDepth: MAX_DEPTH, canManage: money, items, pending: items.filter((i) => i.approvalStatus === 'PENDING') });
});

const loadReferrer = async (id: string) => {
  const p = await prisma.referralPartner.findUnique({ where: { id } });
  if (!p || !p.isReferrer) throw notFound('REFERRER_NOT_FOUND');
  return p;
};

/** A referrer may hang only under an approved referrer, inside MAX_DEPTH, without cycles. */
const assertParent = async (parentId: string) => {
  const parent = await prisma.referralPartner.findUnique({ where: { id: parentId }, select: { isReferrer: true, approvalStatus: true } });
  if (!parent || !parent.isReferrer) throw badRequest('PARENT_NOT_FOUND');
  if (parent.approvalStatus !== 'APPROVED') throw conflict('PARENT_NOT_APPROVED');
};

/** POST / (ADMIN+) — a referrer created by staff: approved at once, top level or under `parentPartnerId`; optional portal login. */
adminReferrersRouter.post('/', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(2).max(120),
      phone: z.string().trim().max(40).nullable().optional().transform((v) => v || null),
      email: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(191)]).nullable().optional().transform((v) => v || null),
      note: z.string().trim().max(5000).nullable().optional().transform((v) => v || null),
      parentPartnerId: z.string().min(1).max(40).nullable().optional(),
      /** Create the portal login and e-mail the set-password link right away (needs an e-mail). */
      createLogin: z.boolean().optional(),
    }),
    req.body,
  );
  if (body.parentPartnerId) {
    await assertParent(body.parentPartnerId);
    if (!canAddChild(await loadReferrers(), body.parentPartnerId)) throw conflict('REFERRER_TOO_DEEP');
  }
  if (await prisma.referralPartner.findFirst({ where: { name: body.name }, select: { id: true } })) throw conflict('PARTNER_NAME_TAKEN');
  const partner = await prisma.referralPartner.create({
    data: {
      name: body.name,
      phone: body.phone,
      email: body.email,
      note: body.note,
      isReferrer: true,
      approvalStatus: 'APPROVED',
      approvalDecidedAt: new Date(),
      parentPartnerId: body.parentPartnerId ?? null,
      code: await suggestPartnerCode(body.name),
    },
  });
  // Referrer permissions: clients, stage, payment state, registering clients; no documents, no drive.
  await prisma.partnerAccess.upsert({ where: { partnerId: partner.id }, create: { partnerId: partner.id, template: 'REFERRER', updatedById: req.user!.id }, update: {} });
  await audit(req, 'REFERRER_CREATED', partner.id, { name: partner.name, parentPartnerId: partner.parentPartnerId });
  let login: { invited: boolean; error: string | null } | null = null;
  if (body.createLogin) login = await loginFor(req, partner.id);
  res.status(201).json({ referrer: { id: partner.id, name: partner.name }, login });
});

/** Portal login + invitation; a failure (e-mail missing / taken) does not undo the approval, the answer names it. */
const loginFor = async (req: Parameters<typeof audit>[0], partnerId: string) => {
  const partner = await prisma.referralPartner.findUniqueOrThrow({ where: { id: partnerId } });
  try {
    const r = await createPartnerLogin(partner, { locale: partner.preferredLanguage === 'de' || partner.preferredLanguage === 'en' || partner.preferredLanguage === 'ru' ? partner.preferredLanguage : 'az', sendInvite: true });
    await audit(req, r.created ? 'PARTNER_LOGIN_CREATED' : 'PARTNER_LOGIN_LINKED', partner.id, { userId: r.userId, email: r.email, invited: r.invited });
    return { invited: r.invited, error: null };
  } catch (err) {
    if (err instanceof HttpError) return { invited: false, error: err.code };
    throw err;
  }
};

/** POST /:id/approve (ADMIN+) — a pending sub-referrer becomes active: sign-up code, portal login + invitation. */
adminReferrersRouter.post('/:id/approve', requireMinRole('ADMIN'), async (req, res) => {
  const p = await loadReferrer(String(req.params.id));
  if (p.approvalStatus !== 'PENDING') throw conflict('REFERRER_NOT_PENDING');
  const code = p.code ?? (await suggestPartnerCode(p.name, p.id));
  // Conditional: two admins clicking at once approve (and invite) once.
  const { count } = await prisma.referralPartner.updateMany({
    where: { id: p.id, approvalStatus: 'PENDING' },
    data: { approvalStatus: 'APPROVED', approvalDecidedAt: new Date(), approvalNote: null, active: true, code },
  });
  if (!count) throw conflict('REFERRER_NOT_PENDING');
  await audit(req, 'REFERRER_APPROVED', p.id, { name: p.name, parentPartnerId: p.parentPartnerId, createdByPartnerId: p.createdByPartnerId });
  const login = p.userId ? { invited: false, error: null } : await loginFor(req, p.id);
  res.json({ ok: true, login });
});

/** POST /:id/reject { note? } (ADMIN+) — the request is refused; the profile stays (inactive) for the record. */
adminReferrersRouter.post('/:id/reject', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(z.object({ note: z.string().trim().max(500).optional() }), req.body ?? {});
  const p = await loadReferrer(String(req.params.id));
  if (p.approvalStatus !== 'PENDING') throw conflict('REFERRER_NOT_PENDING');
  const { count } = await prisma.referralPartner.updateMany({
    where: { id: p.id, approvalStatus: 'PENDING' },
    data: { approvalStatus: 'REJECTED', approvalDecidedAt: new Date(), approvalNote: body.note || null, active: false },
  });
  if (!count) throw conflict('REFERRER_NOT_PENDING');
  await audit(req, 'REFERRER_REJECTED', p.id, { name: p.name, note: body.note ?? null });
  res.json({ ok: true });
});

/** PATCH /:id/parent { parentPartnerId | null } (ADMIN+) — move a referrer (with its subtree) under another or to the top. */
adminReferrersRouter.patch('/:id/parent', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(z.object({ parentPartnerId: z.string().min(1).max(40).nullable() }), req.body);
  const p = await loadReferrer(String(req.params.id));
  if (body.parentPartnerId) await assertParent(body.parentPartnerId);
  const err = moveError(await loadReferrers(), p.id, body.parentPartnerId);
  if (err === 'PARENT_NOT_FOUND' || err === 'REFERRER_NOT_FOUND') throw badRequest(err);
  if (err) throw conflict(err);
  await prisma.referralPartner.update({ where: { id: p.id }, data: { parentPartnerId: body.parentPartnerId } });
  await audit(req, 'REFERRER_MOVED', p.id, { from: p.parentPartnerId, to: body.parentPartnerId });
  res.json({ ok: true });
});

/** PATCH /:id/active { active } (ADMIN+) — deactivate / reactivate (an inactive referrer cannot register clients). */
adminReferrersRouter.patch('/:id/active', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(z.object({ active: z.boolean() }), req.body);
  const p = await loadReferrer(String(req.params.id));
  if (body.active && p.approvalStatus !== 'APPROVED') throw conflict('REFERRER_NOT_APPROVED');
  await prisma.referralPartner.update({ where: { id: p.id }, data: { active: body.active } });
  await audit(req, body.active ? 'REFERRER_ACTIVATED' : 'REFERRER_DEACTIVATED', p.id, { name: p.name });
  res.json({ ok: true });
});
