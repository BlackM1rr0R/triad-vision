import type { Request } from 'express';
import type { ReferralPartner } from '@prisma/client';
import { prisma } from '../../db.js';
import { forbidden } from '../http.js';
import {
  atLeast,
  DEFAULT_PERMS,
  intersectPerms,
  parsePerms,
  partnerPermsOf,
  visibilityFor,
  type ClientListLevel,
  type DocumentLevel,
  type DriveLevel,
  type PartnerPerms,
  type PartnerTemplate,
} from './permissions.js';

/**
 * Who is using the partner portal and what they may do. Every /api/partner endpoint resolves it first:
 *   - the partner's own login (ReferralPartner.userId)            → OWNER, the partner's permission set
 *   - an active team member (PartnerMember.userId, same partner)  → MEMBER, member set ∩ partner set
 *   - anyone else                                                 → 403 NO_PARTNER_PROFILE (as before)
 * `partner.visibility` is replaced by the level the permission set allows, so older helpers (lib/partners/owned.ts,
 * schools.ts) that read it stay in line with the matrix.
 */
export interface PartnerCtx {
  partner: ReferralPartner;
  perms: PartnerPerms;
  /** The partner's own (owner) set, for the team page (members ≤ this). */
  partnerPerms: PartnerPerms;
  template: PartnerTemplate;
  role: 'OWNER' | 'MEMBER';
  memberId: string | null;
}

const cache = new WeakMap<Request, Promise<PartnerCtx>>();

/** The partner's (owner's) permission set from the database. */
export const loadPartnerPerms = async (partner: Pick<ReferralPartner, 'id' | 'visibility'>) => {
  const access = await prisma.partnerAccess.findUnique({ where: { partnerId: partner.id }, select: { template: true, perms: true } });
  return partnerPermsOf(partner, access);
};

const resolve = async (userId: string): Promise<PartnerCtx> => {
  const own = await prisma.referralPartner.findUnique({ where: { userId } });
  if (own) {
    const { template, perms } = await loadPartnerPerms(own);
    return { partner: { ...own, visibility: visibilityFor(perms) }, perms, partnerPerms: perms, template, role: 'OWNER', memberId: null };
  }
  const member = await prisma.partnerMember.findUnique({ where: { userId } });
  if (!member || !member.active) throw forbidden('NO_PARTNER_PROFILE');
  const partner = await prisma.referralPartner.findUnique({ where: { id: member.partnerId } });
  if (!partner) throw forbidden('NO_PARTNER_PROFILE');
  const { template, perms: partnerPerms } = await loadPartnerPerms(partner);
  const perms = intersectPerms(partnerPerms, parsePerms(member.perms));
  return { partner: { ...partner, visibility: visibilityFor(perms) }, perms, partnerPerms, template, role: 'MEMBER', memberId: member.id };
};

/** Resolved once per request (several sub-routers ask). */
export const partnerContextOf = (req: Request): Promise<PartnerCtx> => {
  const hit = cache.get(req);
  if (hit) return hit;
  const p = resolve(req.user!.id);
  cache.set(req, p);
  return p;
};

/** Shorthand used by the older sub-routers that only need the partner row. */
export const partnerOfRequest = async (req: Request) => (await partnerContextOf(req)).partner;

// ─── Checks (403 PARTNER_PERMISSION_DENIED; the portal hides what it may not use) ─────

const denied = () => forbidden('PARTNER_PERMISSION_DENIED');

export const requireClientList = (ctx: PartnerCtx, level: ClientListLevel = 'masked') => {
  if (!atLeast.clientList(ctx.perms.clientList, level)) throw denied();
};
export const requireDocuments = (ctx: PartnerCtx, level: DocumentLevel) => {
  if (!atLeast.documents(ctx.perms.documents, level)) throw denied();
};
export const requireDrive = (ctx: PartnerCtx, level: DriveLevel) => {
  if (!atLeast.drive(ctx.perms.drive, level)) throw denied();
};
export const requireFlag = (ctx: PartnerCtx, flag: 'caseStage' | 'payments' | 'addClients' | 'messaging' | 'vacancies') => {
  if (!ctx.perms[flag]) throw denied();
};
/** Profile, contracts and the team are the partner's own business (members: 403 PARTNER_OWNER_ONLY). */
export const requireOwner = (ctx: PartnerCtx) => {
  if (ctx.role !== 'OWNER') throw forbidden('PARTNER_OWNER_ONLY');
};

/** User ids of everyone who works in the partner's portal (owner + active members) — e.g. "uploaded by us". */
export const partnerTeamUserIds = async (partner: Pick<ReferralPartner, 'id' | 'userId'>) => {
  const members = await prisma.partnerMember.findMany({ where: { partnerId: partner.id }, select: { userId: true } });
  return [...(partner.userId ? [partner.userId] : []), ...members.map((m) => m.userId)];
};

// ─── Hooks called by the admin partner routes ─────────────────────────

/**
 * A partner just created in the admin panel: DEFAULT permissions (the client list follows the visibility the
 * admin picked). Never throws.
 */
export const initNewPartnerAccess = async (partner: Pick<ReferralPartner, 'id' | 'visibility'>, actorId: string | null) => {
  try {
    const extended = partner.visibility === 'EXTENDED';
    await prisma.partnerAccess.upsert({
      where: { partnerId: partner.id },
      create: extended
        ? { partnerId: partner.id, template: 'CUSTOM', perms: { ...DEFAULT_PERMS, clientList: 'full' }, updatedById: actorId }
        : { partnerId: partner.id, template: 'DEFAULT', updatedById: actorId },
      update: {},
    });
  } catch (err) {
    console.error('[partnerAccess] init failed', partner.id, err);
  }
};

/**
 * The visibility field was changed on the admin partner page (ADMIN+, as before): the client-list level of the
 * permission set follows it. LEGACY derives it anyway; other templates become CUSTOM with the new level.
 * Never throws.
 */
export const syncClientListFromVisibility = async (partner: Pick<ReferralPartner, 'id' | 'visibility'>, actorId: string | null) => {
  try {
    const access = await prisma.partnerAccess.findUnique({ where: { partnerId: partner.id } });
    if (!access) return;
    const { template, perms } = partnerPermsOf(partner, access);
    if (template === 'LEGACY') return;
    const level: ClientListLevel = partner.visibility === 'EXTENDED' ? 'full' : 'masked';
    if (perms.clientList === level) return;
    await prisma.partnerAccess.update({ where: { partnerId: partner.id }, data: { template: 'CUSTOM', perms: { ...perms, clientList: level }, updatedById: actorId } });
  } catch (err) {
    console.error('[partnerAccess] visibility sync failed', partner.id, err);
  }
};
