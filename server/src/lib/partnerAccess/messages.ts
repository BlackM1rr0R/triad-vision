import type { PartnerActivity } from '@prisma/client';
import { prisma } from '../../db.js';

/**
 * Messages between a partner (and its team) and the Triad Vision team, stored as partner timeline entries
 * (PartnerActivity, so staff also see them on the partner's timeline): PORTAL_IN = from the partner,
 * PORTAL_OUT = the team's reply.
 */
export const MESSAGE_KINDS = ['PORTAL_IN', 'PORTAL_OUT'] as const;

/** Partner side: the author's first name only for the team (never staff surnames or e-mails). */
export const messageView = async (rows: PartnerActivity[]) => {
  const ids = [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => {
    const u = r.createdById ? byId.get(r.createdById) : undefined;
    const fromPartner = r.kind === 'PORTAL_IN';
    return {
      id: r.id,
      from: fromPartner ? ('PARTNER' as const) : ('TEAM' as const),
      author: u ? (fromPartner ? `${u.firstName} ${u.lastName}`.trim() : u.firstName) : null,
      text: r.body,
      at: r.at,
    };
  });
};
