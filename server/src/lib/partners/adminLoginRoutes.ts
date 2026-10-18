import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { requireMinRole, revokeUserSessions } from '../../middleware/auth.js';
import { badRequest, conflict, notFound, parse } from '../http.js';
import { audit } from '../audit.js';
import { sendPartnerInvite } from '../partnerPortal/notify.js';

/**
 * Portal logins of referral partners — mounted inside /api/admin/partners (ADMIN and above).
 * A partner login is a User with role AGENT linked as ReferralPartner.userId; the partner sets the
 * password through the regular reset-token invitation link.
 */
export const partnerLoginRouter = Router();

/** Login summary shown on the admin partner page (null when the partner has no login). */
export const partnerLoginView = async (userId: string | null) => {
  if (!userId) return null;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      locale: true,
      isActive: true,
      createdAt: true,
      agentProfile: { select: { id: true, code: true } },
      sessions: { orderBy: { lastSeenAt: 'desc' }, take: 1, select: { lastSeenAt: true } },
    },
  });
  if (!u) return null;
  const { sessions, agentProfile, ...rest } = u;
  return { ...rest, lastSeenAt: sessions[0]?.lastSeenAt ?? null, agentCode: agentProfile?.code ?? null };
};

/** "İlqar Məmmədov" → first "İlqar", last "Məmmədov"; a single word stays the first name. */
export const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? name.trim(), lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1]! };
};

const loadPartner = async (id: string) => {
  const partner = await prisma.referralPartner.findUnique({ where: { id } });
  if (!partner) throw notFound('PARTNER_NOT_FOUND');
  return partner;
};

/** POST /:id/login — creates (or links an existing AGENT user as) the partner's portal login. */
partnerLoginRouter.post('/:id/login', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(
    z.object({
      email: z.string().trim().toLowerCase().email().max(191).optional(),
      phone: z
        .string()
        .trim()
        .max(40)
        .nullable()
        .optional()
        .transform((v) => (v === '' ? null : v)),
      firstName: z.string().trim().min(1).max(80).optional(),
      lastName: z.string().trim().max(80).optional(),
      locale: z.enum(['az', 'de', 'en', 'ru']).default('az'),
      /** For an existing account: also e-mail a set-password link (new accounts always get one). */
      sendInvite: z.boolean().optional(),
    }),
    req.body,
  );
  const partner = await loadPartner(String(req.params.id));
  if (partner.userId) throw conflict('PARTNER_HAS_LOGIN');
  const email = body.email ?? partner.email?.toLowerCase() ?? null;
  if (!email) throw badRequest('EMAIL_REQUIRED');

  const existing = await prisma.user.findUnique({ where: { email }, include: { referralPartner: { select: { id: true } } } });
  let userId: string;
  let created = false;
  if (existing) {
    // Only an AGENT account can be linked (staff, clients and employers keep their own areas).
    if (existing.role !== 'AGENT') throw conflict('EMAIL_TAKEN');
    if (existing.referralPartner) throw conflict('USER_LINKED_TO_OTHER_PARTNER');
    userId = existing.id;
    await prisma.$transaction([
      prisma.user.update({ where: { id: existing.id }, data: { isActive: true, ...(body.phone !== undefined && !existing.phone ? { phone: body.phone } : {}) } }),
      prisma.referralPartner.update({ where: { id: partner.id }, data: { userId: existing.id, ...(partner.email ? {} : { email }) } }),
    ]);
  } else {
    const name = splitName(partner.name);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          // Unusable random password: the partner sets their own through the invitation link.
          passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
          role: 'AGENT',
          firstName: body.firstName ?? name.firstName,
          lastName: body.lastName ?? name.lastName,
          phone: body.phone ?? partner.phone ?? null,
          locale: body.locale,
        },
      });
      await tx.referralPartner.update({ where: { id: partner.id }, data: { userId: u.id, ...(partner.email ? {} : { email }) } });
      return u;
    });
    userId = user.id;
    created = true;
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const invited = created || body.sendInvite === true;
  if (invited) await sendPartnerInvite(user);
  await audit(req, created ? 'PARTNER_LOGIN_CREATED' : 'PARTNER_LOGIN_LINKED', partner.id, { userId, email, invited });
  res.status(created ? 201 : 200).json({ login: await partnerLoginView(userId), created, invited });
});

/** POST /:id/login/invite — e-mails a fresh set-password link. */
partnerLoginRouter.post('/:id/login/invite', requireMinRole('ADMIN'), async (req, res) => {
  const partner = await loadPartner(String(req.params.id));
  if (!partner.userId) throw conflict('PARTNER_HAS_NO_LOGIN');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: partner.userId } });
  if (!user.isActive) await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
  await sendPartnerInvite(user);
  await audit(req, 'PARTNER_LOGIN_INVITED', partner.id, { userId: user.id, email: user.email });
  res.json({ ok: true });
});

/**
 * DELETE /:id/login — unlinks the login. An account that is not also an agent (Agent row) is
 * deactivated and logged out everywhere; an agent keeps their agent portal.
 */
partnerLoginRouter.delete('/:id/login', requireMinRole('ADMIN'), async (req, res) => {
  const partner = await loadPartner(String(req.params.id));
  if (!partner.userId) throw conflict('PARTNER_HAS_NO_LOGIN');
  const userId = partner.userId;
  await prisma.referralPartner.update({ where: { id: partner.id }, data: { userId: null } });
  const agent = await prisma.agent.findUnique({ where: { userId }, select: { id: true } });
  let deactivated = false;
  if (!agent) {
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    await revokeUserSessions(userId);
    deactivated = true;
  }
  await audit(req, 'PARTNER_LOGIN_UNLINKED', partner.id, { userId, deactivated });
  res.json({ ok: true, deactivated });
});
