import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole } from '../../middleware/auth.js';
import { badRequest, limiter, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { notifyUser } from '../../lib/notifications.js';
import { requireManageAccess, requirePerm } from '../../lib/access/index.js'; // SUPER_ADMIN, or ADMIN with "manage access"; staff permissions
import { loadPartnerPerms } from '../../lib/partnerAccess/context.js';
import {
  CLIENT_LIST_LEVELS,
  DEFAULT_PERMS,
  DOCUMENT_LEVELS,
  DRIVE_LEVELS,
  PERM_KEYS,
  TEMPLATES,
  TEMPLATE_PERMS,
  exceedingKeys,
  legacyPerms,
  parsePerms,
  partnerPermsOf,
  portalAreas,
  samePerms,
  shapeCaseDetail,
  shapeClientRow,
  visibilityFor,
  type PartnerPerms,
  type PartnerTemplate,
} from '../../lib/partnerAccess/permissions.js';
import { inviteMember, listMembers, memberInviteInput, memberPatchInput, permsInput, resendMemberInvite, updateMember } from '../../lib/partnerAccess/members.js';
import { MESSAGE_KINDS } from '../../lib/partnerAccess/messages.js';
import { PARTNER_ACCESS_TEXT } from '../../lib/partnerAccess/texts.js';
import { listPartnerClients } from '../../lib/partners/owned.js';
import { partnerCaseDetail } from '../../lib/partnerPortal/cases.js';

/**
 * Access Center › Partners — mounted at /api/admin/access/partners.
 *
 *  SUPER_ADMIN, or an ADMIN granted "manage access":
 *   GET  /meta                       templates (with their permissions), levels
 *   GET  /                           partners with template, permissions, team size, contract
 *   GET  /:id                        one partner: permissions, members, what changes for members
 *   PUT  /:id/permissions            { template, perms? (CUSTOM) } — audited before → after (ACCESS_PARTNER_PERMISSIONS_CHANGED)
 *   GET  /:id/preview[?template&perms]  "what this partner sees": areas + a sample client row and case, shaped
 *  Staff with partners:view / partners:edit (team members, like the partner's own login on the portal):
 *   GET  /:id/members, POST /:id/members, PATCH /:id/members/:mid, POST /:id/members/:mid/invite
 *   GET  /:id/messages, POST /:id/messages   portal messages of the partner; a reply notifies the partner's logins
 */
export const adminAccessPartnersRouter = Router();

const managers = [requireMinRole('ADMIN'), requireManageAccess];

const loadPartner = async (id: string) => {
  const p = await prisma.referralPartner.findUnique({ where: { id } });
  if (!p) throw notFound('PARTNER_NOT_FOUND');
  return p;
};

adminAccessPartnersRouter.get('/meta', ...managers, (_req, res) => {
  res.json({
    templates: TEMPLATES,
    templatePerms: { ...TEMPLATE_PERMS, LEGACY_MINIMAL: legacyPerms('MINIMAL'), LEGACY_EXTENDED: legacyPerms('EXTENDED') },
    defaultPerms: DEFAULT_PERMS,
    keys: PERM_KEYS,
    levels: { clientList: CLIENT_LIST_LEVELS, documents: DOCUMENT_LEVELS, drive: DRIVE_LEVELS },
  });
});

adminAccessPartnersRouter.get('/', ...managers, async (req, res) => {
  const q = parse(z.object({ q: z.string().trim().max(100).optional() }), req.query).q;
  const partners = await prisma.referralPartner.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { companyName: { contains: q } }, { code: { contains: q } }] } : {},
    orderBy: { name: 'asc' },
    take: 500,
    select: { id: true, name: true, active: true, category: true, visibility: true, userId: true, contractEnd: true },
  });
  const ids = partners.map((p) => p.id);
  const [access, members] = await Promise.all([
    ids.length ? prisma.partnerAccess.findMany({ where: { partnerId: { in: ids } } }) : [],
    ids.length ? prisma.partnerMember.groupBy({ by: ['partnerId'], where: { partnerId: { in: ids }, active: true }, _count: { _all: true } }) : [],
  ]);
  const accessOf = new Map(access.map((a) => [a.partnerId, a]));
  const membersOf = new Map(members.map((m) => [m.partnerId, m._count._all]));
  res.json({
    items: partners.map((p) => {
      const { template, perms } = partnerPermsOf(p, accessOf.get(p.id) ?? null);
      return {
        id: p.id,
        name: p.name,
        active: p.active,
        category: p.category,
        hasLogin: !!p.userId,
        contractEnd: p.contractEnd,
        template,
        perms,
        members: membersOf.get(p.id) ?? 0,
      };
    }),
  });
});

adminAccessPartnersRouter.get('/:id', ...managers, async (req, res) => {
  const p = await loadPartner(String(req.params.id));
  const { template, perms } = await loadPartnerPerms(p);
  res.json({
    partner: { id: p.id, name: p.name, active: p.active, category: p.category, visibility: p.visibility, hasLogin: !!p.userId, contractEnd: p.contractEnd },
    template,
    perms,
    areas: portalAreas(perms, { owner: true }),
    members: await listMembers(p.id, perms),
  });
});

const permissionsBody = z.object({ template: z.enum(TEMPLATES), perms: permsInput.optional() });

/** The permission set a template choice stands for (LEGACY follows the partner's visibility). */
const permsForChoice = (template: PartnerTemplate, perms: PartnerPerms | undefined, visibility: string): PartnerPerms => {
  if (template === 'LEGACY') return legacyPerms(visibility);
  if (template === 'CUSTOM') {
    if (!perms) throw badRequest('PERMS_REQUIRED');
    return parsePerms(perms);
  }
  return { ...TEMPLATE_PERMS[template] };
};

adminAccessPartnersRouter.put('/:id/permissions', ...managers, async (req, res) => {
  const body = parse(permissionsBody, req.body);
  const p = await loadPartner(String(req.params.id));
  const before = await loadPartnerPerms(p);
  const after = permsForChoice(body.template, body.perms, p.visibility);
  await prisma.partnerAccess.upsert({
    where: { partnerId: p.id },
    create: { partnerId: p.id, template: body.template, perms: body.template === 'CUSTOM' ? { ...after } : undefined, updatedById: req.user!.id },
    update: { template: body.template, perms: body.template === 'CUSTOM' ? { ...after } : undefined, updatedById: req.user!.id },
  });
  // The old visibility field follows the client-list level (LEGACY derives it from that field anyway).
  if (body.template !== 'LEGACY' && p.visibility !== visibilityFor(after)) {
    await prisma.referralPartner.update({ where: { id: p.id }, data: { visibility: visibilityFor(after) } });
  }
  const members = await prisma.partnerMember.findMany({ where: { partnerId: p.id, active: true }, select: { id: true, perms: true } });
  // Members whose saved set is now above the partner's: they are capped automatically (shown in the UI).
  const capped = members.filter((m) => exceedingKeys(after, parsePerms(m.perms)).length > 0).map((m) => m.id);
  await audit(req, 'ACCESS_PARTNER_PERMISSIONS_CHANGED', `partner:${p.id}`, {
    before: { template: before.template, perms: { ...before.perms } },
    after: { template: body.template, perms: { ...after } },
    unchanged: before.template === body.template && samePerms(before.perms, after),
    membersCapped: capped,
  });
  res.json({ template: body.template, perms: after, membersCapped: capped });
});

/** A small, real sample of what the portal returns for this permission set (super admins see the data anyway). */
adminAccessPartnersRouter.get('/:id/preview', ...managers, async (req, res) => {
  const p = await loadPartner(String(req.params.id));
  const q = parse(z.object({ template: z.enum(TEMPLATES).optional(), perms: z.string().max(2000).optional() }), req.query);
  let perms: PartnerPerms;
  if (q.template) {
    let raw: unknown;
    try {
      raw = q.perms ? JSON.parse(q.perms) : undefined;
    } catch {
      throw badRequest('INVALID_PERMS');
    }
    perms = permsForChoice(q.template, raw ? parse(permsInput, raw) : undefined, p.visibility);
  } else {
    perms = (await loadPartnerPerms(p)).perms;
  }
  const partner = { ...p, visibility: visibilityFor(perms) };
  const [clients, caseCount, latest] = await Promise.all([
    perms.clientList !== 'none' ? listPartnerClients(partner) : Promise.resolve([]),
    prisma.case.count({ where: { partnerId: p.id } }),
    prisma.case.findFirst({ where: { partnerId: p.id }, orderBy: { updatedAt: 'desc' }, select: { id: true } }),
  ]);
  const sampleCase =
    latest && perms.clientList !== 'none'
      ? shapeCaseDetail(await partnerCaseDetail(p.id, latest.id, p.userId ? [p.userId] : []), perms)
      : null;
  res.json({
    perms,
    areas: portalAreas(perms, { owner: true }),
    counts: { clients: perms.clientList !== 'none' ? clients.length : null, cases: caseCount },
    sampleClient: clients[0] ? shapeClientRow(clients[0], perms) : null,
    sampleCase,
  });
});

// ─── Team members (staff with partners permissions) ────────────────────

adminAccessPartnersRouter.get('/:id/members', requirePerm('partners', 'view'), async (req, res) => {
  const p = await loadPartner(String(req.params.id));
  const { perms } = await loadPartnerPerms(p);
  res.json({ partnerPerms: perms, items: await listMembers(p.id, perms) });
});

const inviteLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 60, keyGenerator: (req: Request) => `staff-partner-team:${req.user?.id ?? 'anon'}` });

adminAccessPartnersRouter.post('/:id/members', inviteLimiter, requirePerm('partners', 'edit'), async (req, res) => {
  const p = await loadPartner(String(req.params.id));
  const { perms } = await loadPartnerPerms(p);
  const m = await inviteMember(req, p, perms, parse(memberInviteInput, req.body), 'STAFF');
  res.status(201).json({ member: (await listMembers(p.id, perms)).find((x) => x.id === m.id) });
});

adminAccessPartnersRouter.patch('/:id/members/:mid', requirePerm('partners', 'edit'), async (req, res) => {
  const p = await loadPartner(String(req.params.id));
  const { perms } = await loadPartnerPerms(p);
  await updateMember(req, p.id, perms, String(req.params.mid), parse(memberPatchInput, req.body), 'STAFF');
  res.json({ member: (await listMembers(p.id, perms)).find((x) => x.id === String(req.params.mid)) });
});

adminAccessPartnersRouter.post('/:id/members/:mid/invite', inviteLimiter, requirePerm('partners', 'edit'), async (req, res) => {
  const p = await loadPartner(String(req.params.id));
  await resendMemberInvite(req, p, String(req.params.mid), 'STAFF');
  res.json({ ok: true });
});

// ─── Portal messages (staff side) ─────────────────────────────────────

adminAccessPartnersRouter.get('/:id/messages', requirePerm('partners', 'view'), async (req, res) => {
  const p = await loadPartner(String(req.params.id));
  const rows = await prisma.partnerActivity.findMany({ where: { referralPartnerId: p.id, kind: { in: [...MESSAGE_KINDS] } }, orderBy: { at: 'desc' }, take: 200 });
  const ids = [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const name = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  res.json({ items: rows.map((r) => ({ id: r.id, from: r.kind === 'PORTAL_IN' ? 'PARTNER' : 'TEAM', author: r.createdById ? (name.get(r.createdById) ?? null) : null, text: r.body, at: r.at })) });
});

adminAccessPartnersRouter.post('/:id/messages', requirePerm('partners', 'edit'), async (req, res) => {
  const p = await loadPartner(String(req.params.id));
  const { text } = parse(z.object({ text: z.string().trim().min(1).max(4000) }), req.body);
  const row = await prisma.partnerActivity.create({ data: { referralPartnerId: p.id, kind: 'PORTAL_OUT', body: text, createdById: req.user!.id } });
  await audit(req, 'PARTNER_MESSAGE_REPLIED', `partner:${p.id}`, { activityId: row.id });
  // The partner's own login and the members who may read messages.
  const { perms } = await loadPartnerPerms(p);
  const members = await prisma.partnerMember.findMany({ where: { partnerId: p.id, active: true }, select: { userId: true, perms: true } });
  const recipients = [
    ...(p.userId && perms.messaging ? [p.userId] : []),
    ...members.filter((m) => perms.messaging && parsePerms(m.perms).messaging).map((m) => m.userId),
  ];
  for (const userId of recipients) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { locale: true, isActive: true } });
    if (!u?.isActive) continue;
    const t = PARTNER_ACCESS_TEXT[u.locale] ?? PARTNER_ACCESS_TEXT.az;
    void notifyUser(userId, { type: 'PARTNER_MESSAGE_REPLY', title: t.replyTitle, body: t.replyBody(text.slice(0, 500)), link: '/partner/messages', ctaLabel: t.replyCta, push: false }).catch(() => undefined);
  }
  res.status(201).json({ message: { id: row.id, from: 'TEAM', author: `${req.user!.firstName} ${req.user!.lastName}`.trim(), text: row.body, at: row.at } });
});
