import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../http.js';

/**
 * Owner of a partner record (contract, activity, contact person): an employer (Company) or a referral partner
 * (ReferralPartner). Every partner-records endpoint takes exactly one of the two ids — in the query for reads,
 * in the body (or query) for creates; item routes derive the owner from the stored row.
 */
export type Owner = { companyId: string; referralPartnerId?: undefined } | { referralPartnerId: string; companyId?: undefined };

const id = z.string().trim().min(1).max(40);
export const ownerShape = { companyId: id.optional(), referralPartnerId: id.optional() };

/** Exactly one owner id from a plain object (query or body); 400 OWNER_REQUIRED otherwise. */
export const ownerFrom = (src: unknown): Owner => {
  const o = z.object(ownerShape).safeParse(src ?? {});
  const v = o.success ? o.data : {};
  if (v.companyId && !v.referralPartnerId) return { companyId: v.companyId };
  if (v.referralPartnerId && !v.companyId) return { referralPartnerId: v.referralPartnerId };
  throw badRequest('OWNER_REQUIRED');
};

/** Owner from the request: query first (GET), then the JSON body. */
export const ownerOfRequest = (req: Request): Owner => {
  const q = req.query as Record<string, unknown>;
  if (q.companyId || q.referralPartnerId) return ownerFrom({ companyId: q.companyId, referralPartnerId: q.referralPartnerId });
  return ownerFrom(req.body);
};

export const ownerOfRow = (row: { companyId: string | null; referralPartnerId: string | null }): Owner =>
  row.companyId ? { companyId: row.companyId } : { referralPartnerId: row.referralPartnerId! };

export const ownerWhere = (owner: Owner) => (owner.companyId ? { companyId: owner.companyId } : { referralPartnerId: owner.referralPartnerId! });

/** Columns to write on create (the other id stays null). */
export const ownerData = (owner: Owner) => ({ companyId: owner.companyId ?? null, referralPartnerId: owner.referralPartnerId ?? null });

/** Audit target of the owner ("company:<id>" like the company routes; "partner:<id>" for partners). */
export const ownerTarget = (owner: Owner) => (owner.companyId ? `company:${owner.companyId}` : `partner:${owner.referralPartnerId}`);

/** Audit targets whose entries belong to the owner's timeline (the partner routes audit with the bare id). */
export const ownerAuditTargets = (owner: Owner) => (owner.companyId ? [`company:${owner.companyId}`] : [`partner:${owner.referralPartnerId}`, owner.referralPartnerId!]);

export interface OwnerInfo {
  owner: Owner;
  name: string;
}

/** 404 COMPANY_NOT_FOUND / PARTNER_NOT_FOUND when the owner does not exist. */
export const loadOwner = async (owner: Owner): Promise<OwnerInfo> => {
  if (owner.companyId) {
    const c = await prisma.company.findUnique({ where: { id: owner.companyId }, select: { id: true, name: true } });
    if (!c) throw notFound('COMPANY_NOT_FOUND');
    return { owner, name: c.name };
  }
  const p = await prisma.referralPartner.findUnique({ where: { id: owner.referralPartnerId }, select: { id: true, name: true, companyName: true } });
  if (!p) throw notFound('PARTNER_NOT_FOUND');
  return { owner, name: p.companyName?.trim() || p.name };
};

/** Admin page of the owner (links in notifications / my work). */
export const ownerLink = (owner: Owner, tab?: string) =>
  owner.companyId ? `/admin/companies/${owner.companyId}${tab ? `?tab=${tab}` : ''}` : `/admin/partners/${owner.referralPartnerId}${tab ? `?tab=${tab}` : ''}`;
