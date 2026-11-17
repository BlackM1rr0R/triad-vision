import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import type { Locale } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { revokeUserSessions } from '../../middleware/auth.js';
import { audit } from '../audit.js';
import { HttpError, conflict, notFound } from '../http.js';
import { renderEmail, sendMail } from '../mailer.js';
import { CLIENT_LIST_LEVELS, DOCUMENT_LEVELS, DRIVE_LEVELS, exceedingKeys, intersectPerms, parsePerms, type PartnerPerms } from './permissions.js';
import { PARTNER_ACCESS_TEXT } from './texts.js';

/**
 * Partner team members: AGENT logins linked to a referral partner through PartnerMember, each with a permission
 * subset of the partner's. The partner's own login (owner) and staff manage them; every change is audited
 * (PARTNER_MEMBER_*). Members never manage the team, the profile or contracts (lib/partnerAccess/context.ts).
 */

export const permsInput = z
  .object({
    clientList: z.enum(CLIENT_LIST_LEVELS),
    caseStage: z.boolean(),
    documents: z.enum(DOCUMENT_LEVELS),
    payments: z.boolean(),
    addClients: z.boolean(),
    messaging: z.boolean(),
    vacancies: z.boolean(),
    drive: z.enum(DRIVE_LEVELS),
  })
  .strict();

export const memberInviteInput = z.object({
  email: z.string().trim().toLowerCase().email().max(191),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(''),
  locale: z.enum(['az', 'de', 'en', 'ru']).default('az'),
  /** Omitted: the same as the partner (owner). */
  perms: permsInput.optional(),
});

export const memberPatchInput = z.object({ perms: permsInput.optional(), active: z.boolean().optional() }).refine((b) => b.perms !== undefined || b.active !== undefined, 'NOTHING_TO_CHANGE');

/** A member may never get more than the partner: 400 PERMS_EXCEED_PARTNER (with the offending keys). */
export const assertWithinPartner = (partnerPerms: PartnerPerms, perms: PartnerPerms) => {
  const keys = exceedingKeys(partnerPerms, perms);
  if (keys.length) throw new HttpError(400, 'PERMS_EXCEED_PARTNER', keys.join(','));
};

export const listMembers = async (partnerId: string, partnerPerms: PartnerPerms) => {
  const rows = await prisma.partnerMember.findMany({ where: { partnerId }, orderBy: { createdAt: 'asc' } });
  if (!rows.length) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, email: true, firstName: true, lastName: true, isActive: true, emailVerifiedAt: true, totpEnabledAt: true, emailOtpEnabledAt: true, sessions: { orderBy: { lastSeenAt: 'desc' }, take: 1, select: { lastSeenAt: true } } },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => {
    const u = byId.get(r.userId);
    const perms = parsePerms(r.perms);
    return {
      id: r.id,
      userId: r.userId,
      email: u?.email ?? null,
      firstName: u?.firstName ?? '',
      lastName: u?.lastName ?? '',
      active: r.active && !!u?.isActive,
      invitedAt: r.createdAt,
      deactivatedAt: r.deactivatedAt,
      lastSeenAt: u?.sessions[0]?.lastSeenAt ?? null,
      twoFactor: !!u?.totpEnabledAt || !!u?.emailOtpEnabledAt,
      perms,
      /** What actually applies (the partner's set may have shrunk since the member was saved). */
      effective: intersectPerms(partnerPerms, perms),
    };
  });
};

const sendMemberInvite = async (user: { id: string; email: string; locale: Locale; firstName: string }, partnerName: string) => {
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });
  const t = PARTNER_ACCESS_TEXT[user.locale] ?? PARTNER_ACCESS_TEXT.az;
  void sendMail(
    user.email,
    `Triad Vision · ${t.memberInviteTitle}`,
    renderEmail(t.memberInviteTitle, t.memberInviteBody(user.firstName, partnerName), { label: t.memberInviteCta, url: `${config.clientUrl}/reset-password?token=${token}` }),
  );
};

/**
 * Invites a team member: a new AGENT login (unusable password, set through the e-mailed link) or an existing AGENT
 * login that is not linked to any partner yet. 409 EMAIL_TAKEN for any other account.
 */
export const inviteMember = async (
  req: Request,
  partner: { id: string; name: string },
  partnerPerms: PartnerPerms,
  body: z.infer<typeof memberInviteInput>,
  by: 'PARTNER' | 'STAFF',
) => {
  const perms = body.perms ?? partnerPerms;
  assertWithinPartner(partnerPerms, perms);
  const existing = await prisma.user.findUnique({ where: { email: body.email }, include: { referralPartner: { select: { id: true } } } });
  let userId: string;
  if (existing) {
    if (existing.role !== 'AGENT' || existing.referralPartner) throw conflict('EMAIL_TAKEN');
    if (await prisma.partnerMember.findUnique({ where: { userId: existing.id }, select: { id: true } })) throw conflict('ALREADY_A_MEMBER');
    userId = existing.id;
    await prisma.user.update({ where: { id: existing.id }, data: { isActive: true } });
  } else {
    const user = await prisma.user
      .create({
        data: {
          email: body.email,
          passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
          role: 'AGENT',
          firstName: body.firstName,
          lastName: body.lastName,
          locale: body.locale,
        },
      })
      .catch((err: unknown) => {
        if ((err as { code?: string }).code === 'P2002') throw conflict('EMAIL_TAKEN');
        throw err;
      });
    userId = user.id;
  }
  const member = await prisma.partnerMember
    .create({ data: { partnerId: partner.id, userId, perms: { ...perms }, invitedById: req.user!.id } })
    .catch((err: unknown) => {
      if ((err as { code?: string }).code === 'P2002') throw conflict('ALREADY_A_MEMBER');
      throw err;
    });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, locale: true, firstName: true } });
  await sendMemberInvite(user, partner.name);
  await audit(req, 'PARTNER_MEMBER_INVITED', `partner:${partner.id}`, { memberId: member.id, userId, email: user.email, by, perms: { ...perms }, existingAccount: !!existing });
  return member;
};

const loadMember = async (partnerId: string, memberId: string) => {
  const m = await prisma.partnerMember.findFirst({ where: { id: memberId, partnerId } });
  if (!m) throw notFound('MEMBER_NOT_FOUND');
  return m;
};

/** Deactivating logs the member out everywhere; the login itself is switched off unless it is also an agent. */
const setLoginActive = async (userId: string, active: boolean) => {
  const agent = await prisma.agent.findUnique({ where: { userId }, select: { id: true } });
  if (!active) {
    if (!agent) await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    await revokeUserSessions(userId);
  } else {
    await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
  }
};

export const updateMember = async (req: Request, partnerId: string, partnerPerms: PartnerPerms, memberId: string, body: z.infer<typeof memberPatchInput>, by: 'PARTNER' | 'STAFF') => {
  const m = await loadMember(partnerId, memberId);
  const before = { perms: parsePerms(m.perms), active: m.active };
  if (body.perms) assertWithinPartner(partnerPerms, body.perms);
  await prisma.partnerMember.update({
    where: { id: m.id },
    data: {
      ...(body.perms ? { perms: { ...body.perms } } : {}),
      ...(body.active !== undefined ? { active: body.active, deactivatedAt: body.active ? null : new Date() } : {}),
    },
  });
  if (body.active !== undefined && body.active !== m.active) await setLoginActive(m.userId, body.active);
  // Narrower rights take effect at once: the member's open sessions keep working but every request re-reads them.
  await audit(req, body.active === false ? 'PARTNER_MEMBER_DEACTIVATED' : 'PARTNER_MEMBER_UPDATED', `partner:${partnerId}`, {
    memberId: m.id,
    userId: m.userId,
    by,
    before: { ...before, perms: { ...before.perms } },
    after: { perms: body.perms ? { ...body.perms } : { ...before.perms }, active: body.active ?? m.active },
  });
};

export const resendMemberInvite = async (req: Request, partner: { id: string; name: string }, memberId: string, by: 'PARTNER' | 'STAFF') => {
  const m = await loadMember(partner.id, memberId);
  if (!m.active) throw conflict('MEMBER_INACTIVE');
  const user = await prisma.user.findUnique({ where: { id: m.userId }, select: { id: true, email: true, locale: true, firstName: true } });
  if (!user) throw notFound('MEMBER_NOT_FOUND');
  await sendMemberInvite(user, partner.name);
  await audit(req, 'PARTNER_MEMBER_INVITE_RESENT', `partner:${partner.id}`, { memberId: m.id, userId: m.userId, by });
};

/** Partner deleted: every member is switched off and logged out (rows go, the logins stay for history). Never throws. */
export const removeMembersOfPartner = async (partnerId: string) => {
  try {
    const rows = await prisma.partnerMember.findMany({ where: { partnerId }, select: { userId: true } });
    for (const r of rows) await setLoginActive(r.userId, false);
    await prisma.partnerMember.deleteMany({ where: { partnerId } });
    await prisma.partnerAccess.deleteMany({ where: { partnerId } });
  } catch (err) {
    console.error('[partnerAccess] cleanup failed', partnerId, err);
  }
};
