import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../audit.js';
import { conflict, forbidden, limiter, notFound, parse } from '../http.js';
import { notifyStaff } from '../notifications.js';
import { partnerContextOf, requireClientList, requireOwner, type PartnerCtx } from '../partnerAccess/context.js';
import { canAddChild, depthOf, descendantIds, MAX_DEPTH, subtreeIds, type NodeStats } from './tree.js';
import { downlineClients, loadReferrers, treeWithStats, type ReferrerRow } from './service.js';
import { REFERRER_STAFF_TEXT } from './texts.js';

/**
 * "Komandam / Alt-referallar" of a referrer's partner portal — mounted inside /api/partner (AGENT + linked
 * partner, approved; lib/partnerAccess/context.ts). Only partners with `isReferrer` (403 NOT_A_REFERRER).
 *
 *   GET  /referrals      own + whole-subtree figures and the referrers below (never the parent or siblings)
 *   POST /referrals      a new sub-referrer profile → PENDING until an admin approves it (owner login only)
 *   GET  /referrals/:id  one referrer of the own subtree and its clients: name, case number, stage, payment state
 *                        only (anything outside the subtree → 404 REFERRER_NOT_FOUND)
 */
export const referrerPortalRouter = Router();

const requireReferrer = (ctx: PartnerCtx) => {
  if (!ctx.partner.isReferrer) throw forbidden('NOT_A_REFERRER');
};

/** Money figures only with the payments permission; stage figures only with the case stage. */
const shapeStats = (s: NodeStats, ctx: PartnerCtx) => ({
  clients: s.clients,
  activeCases: ctx.perms.caseStage ? s.activeCases : null,
  approvedVisas: ctx.perms.caseStage ? s.approvedVisas : null,
  paidCents: ctx.perms.payments ? s.paidCents : null,
  outstandingCents: ctx.perms.payments ? s.outstandingCents : null,
});

/** What of a downline referrer the upline sees: refused requests only by the one who sent them. */
const visibleTo = (row: ReferrerRow, ctx: PartnerCtx) => row.approvalStatus !== 'REJECTED' || row.createdByPartnerId === ctx.partner.id;

referrerPortalRouter.get('/referrals', async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireReferrer(ctx);
  requireClientList(ctx);
  const rows = await loadReferrers();
  const below = new Set(descendantIds(rows, ctx.partner.id));
  const mine = rows.filter((r) => r.id === ctx.partner.id || (below.has(r.id) && visibleTo(r, ctx)));
  const nodes = await treeWithStats(mine);
  const me = nodes.find((n) => n.row.id === ctx.partner.id);
  const myDepth = depthOf(rows, ctx.partner.id);
  res.json({
    maxDepth: MAX_DEPTH,
    // Owners create sub-referrers while the tree still has room below them.
    canAdd: ctx.role === 'OWNER' && ctx.partner.active && canAddChild(rows, ctx.partner.id),
    currency: ctx.partner.currency,
    me: me ? { own: shapeStats(me.own, ctx), total: shapeStats(me.total, ctx), subReferrers: me.subReferrers, descendants: me.descendants } : null,
    items: nodes
      .filter((n) => n.row.id !== ctx.partner.id)
      .map((n) => ({
        id: n.row.id,
        name: n.row.name,
        // Relative to the viewer: a direct sub-referrer has parentId null.
        parentId: n.row.parentPartnerId === ctx.partner.id ? null : n.row.parentPartnerId,
        level: depthOf(rows, n.row.id) - myDepth,
        approvalStatus: n.row.approvalStatus,
        active: n.row.active,
        createdAt: n.row.createdAt,
        // Contacts only of the profiles this referrer entered itself (to check the request).
        ...(n.row.createdByPartnerId === ctx.partner.id ? { phone: n.row.phone, email: n.row.email, createdByMe: true } : { phone: null, email: null, createdByMe: false }),
        own: shapeStats(n.own, ctx),
        total: shapeStats(n.total, ctx),
        subReferrers: n.subReferrers,
      })),
  });
});

const createLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 20, keyGenerator: (req) => `referrer-create:${req.user?.id ?? 'anon'}` });

referrerPortalRouter.post('/referrals', createLimiter, async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireReferrer(ctx);
  requireOwner(ctx);
  if (!ctx.partner.active) throw forbidden('PARTNER_INACTIVE');
  const body = parse(
    z.object({
      name: z.string().trim().min(2).max(120),
      phone: z
        .string()
        .trim()
        .max(40)
        .nullable()
        .optional()
        .transform((v) => v || null),
      email: z.string().trim().toLowerCase().email().max(191),
      note: z.string().trim().max(1000).nullable().optional(),
    }),
    req.body,
  );
  const rows = await loadReferrers();
  if (!canAddChild(rows, ctx.partner.id)) throw conflict('REFERRER_TOO_DEEP');
  if (await prisma.referralPartner.findFirst({ where: { name: body.name }, select: { id: true } })) throw conflict('PARTNER_NAME_TAKEN');
  // The login is created on approval: an e-mail that belongs to staff, a client or an employer would fail then.
  const user = await prisma.user.findUnique({ where: { email: body.email }, select: { role: true } });
  if (user && user.role !== 'AGENT') throw conflict('EMAIL_TAKEN');
  const created = await prisma.referralPartner
    .create({
      data: {
        name: body.name,
        phone: body.phone ?? null,
        email: body.email,
        note: body.note ?? null,
        isReferrer: true,
        active: true,
        approvalStatus: 'PENDING',
        parentPartnerId: ctx.partner.id,
        createdByPartnerId: ctx.partner.id,
        currency: ctx.partner.currency,
        preferredLanguage: ctx.partner.preferredLanguage,
        // No sign-up code until approved (a pending referrer must not collect clients yet).
        code: null,
      },
      select: { id: true, name: true, approvalStatus: true, createdAt: true },
    })
    .catch((err: unknown) => {
      if ((err as { code?: string }).code === 'P2002') throw conflict('PARTNER_NAME_TAKEN');
      throw err;
    });
  // Referrer permissions from the start (clients + stage + payment state; no documents, no drive).
  await prisma.partnerAccess.upsert({ where: { partnerId: created.id }, create: { partnerId: created.id, template: 'REFERRER', updatedById: req.user!.id }, update: {} });
  await audit(req, 'REFERRER_SUB_REQUESTED', created.id, { parentPartnerId: ctx.partner.id, name: created.name });
  void notifyStaff(REFERRER_STAFF_TEXT.requestTitle(created.name), REFERRER_STAFF_TEXT.requestBody(created.name, ctx.partner.name), { link: '/admin/referrers', type: 'REFERRER_REQUEST' }).catch(() => undefined);
  res.status(201).json({ referrer: created });
});

referrerPortalRouter.get('/referrals/:id', async (req, res) => {
  const ctx = await partnerContextOf(req);
  requireReferrer(ctx);
  requireClientList(ctx);
  const rows = await loadReferrers();
  const id = String(req.params.id);
  const row = descendantIds(rows, ctx.partner.id).includes(id) ? rows.find((r) => r.id === id) : undefined;
  // Outside the own subtree (parent, sibling, another branch, unknown) looks the same: not found.
  if (!row || !visibleTo(row, ctx)) throw notFound('REFERRER_NOT_FOUND');
  const sub = new Set(subtreeIds(rows, id));
  const node = (await treeWithStats(rows.filter((r) => sub.has(r.id)))).find((n) => n.row.id === id)!;
  const clients = row.approvalStatus === 'APPROVED' ? await downlineClients(row.id) : [];
  res.json({
    referrer: {
      id: row.id,
      name: row.name,
      approvalStatus: row.approvalStatus,
      active: row.active,
      createdAt: row.createdAt,
      own: shapeStats(node.own, ctx),
      total: shapeStats(node.total, ctx),
      subReferrers: node.subReferrers,
    },
    // Name, case number, stage and payment state only (lib/referrers/service.ts → downlineClients).
    clients: clients.map((c) => ({
      name: c.name,
      caseNumber: c.caseNumber,
      status: ctx.perms.caseStage ? c.status : null,
      refused: ctx.perms.caseStage ? c.refused : null,
      paymentState: ctx.perms.payments ? c.paymentState : null,
    })),
  });
});
