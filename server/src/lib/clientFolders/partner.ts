import { prisma } from '../../db.js';
import { badRequest, notFound } from '../http.js';
import { assignCases } from '../partners/manage.js';
import { notifyPartner } from '../partners/owned.js';
import { nextOwner } from './logic.js';

/**
 * "Partnyor təyin et / dəyiş / partnyorluqdan çıxart" on a client folder of the documents section, without opening
 * the folder. The same assignment as PATCH /admin/partners/assign (lib/partners/manage.assignCases: case event,
 * automatic commission of the new partner, the old one's pending commission cancelled, the client folder moved
 * into "Partner/<name>" or back to "Anträge/…") — here with the folder moved before the answer, so the listing
 * the user returns to is up to date. On top of it:
 *
 *  - the client's owning partner (User.ownerPartnerId) follows when the client belonged to nobody or to the case's
 *    previous partner; that change is kept in PartnerClientChange (source ADMIN, like PATCH /clients/:id/owner);
 *  - a case event PARTNER_CHANGED with "from → to" (staff only);
 *  - the new partner hears about the application in the partner portal (PARTNER_NEW_CASE, as when a case is created).
 */

export interface PartnerChange {
  changed: boolean;
  from: { id: string; name: string } | null;
  to: { id: string; name: string } | null;
  ownerChanged: boolean;
  folderId: string | null;
  /** Automatic commissions created for the new partner (lib/partners/manage.syncCaseCommissions). */
  commissionsCreated: number;
}

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

export const setCasePartner = async (
  caseId: string,
  partnerId: string | null,
  actorId: string,
  note?: string | null,
  /** awaitFolders false: the client folder moves in the background (bulk assignment of many cases). */
  opts: { awaitFolders?: boolean } = {},
): Promise<PartnerChange> => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      number: true,
      partnerId: true,
      partner: { select: { id: true, name: true } },
      client: { select: { id: true, role: true, firstName: true, lastName: true, ownerPartnerId: true } },
    },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const to = partnerId ? await prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { id: true, name: true, active: true, userId: true } }) : null;
  if (partnerId && !to) throw badRequest('INVALID_PARTNER');
  if (to && !to.active && c.partnerId !== to.id) throw badRequest('PARTNER_INACTIVE');
  // A partner's own login is never the partner's client.
  if (to?.userId && to.userId === c.client.id) throw badRequest('PARTNER_OWN_LOGIN');
  const from = c.partner;
  if ((from?.id ?? null) === (to?.id ?? null)) {
    const folder = await prisma.case.findUnique({ where: { id: caseId }, select: { driveFolderId: true } });
    return { changed: false, from, to: from, ownerChanged: false, folderId: folder?.driveFolderId ?? null, commissionsCreated: 0 };
  }

  const { commissionsCreated } = await assignCases([caseId], to?.id ?? null, actorId, { awaitFolders: opts.awaitFolders ?? true });
  const cleanNote = note?.trim().slice(0, 500) || null;
  await prisma.caseEvent.create({
    data: {
      caseId,
      type: 'PARTNER_CHANGED',
      note: `${from?.name ?? '—'} → ${to?.name ?? '—'}${cleanNote ? `: ${cleanNote}` : ''}`.slice(0, 2000),
      actorId,
      visibleToClient: false,
    },
  });

  let ownerChanged = false;
  const owner = c.client.role === 'CLIENT' ? nextOwner(c.client.ownerPartnerId, from?.id ?? null, to?.id ?? null) : undefined;
  if (owner !== undefined) {
    // Conditional on the owner still being what was read (a parallel change wins).
    const { count } = await prisma.user.updateMany({
      where: { id: c.client.id, ownerPartnerId: c.client.ownerPartnerId },
      data: { ownerPartnerId: owner, ownerPartnerAt: owner ? new Date() : null },
    });
    if (count) {
      ownerChanged = true;
      await prisma.partnerClientChange.create({
        data: { userId: c.client.id, fromPartnerId: c.client.ownerPartnerId, toPartnerId: owner, source: 'ADMIN', actorId, note: (cleanNote ?? `Sənədlər · ${c.number}`).slice(0, 500) },
      });
    }
  }

  if (to) {
    const client = fullName(c.client);
    await notifyPartner(to.id, (t) => ({ type: 'PARTNER_NEW_CASE', title: t.newCaseTitle(client), body: t.newCaseBody(client, c.number), link: `/partner/clients/${caseId}` }));
  }
  const after = await prisma.case.findUnique({ where: { id: caseId }, select: { driveFolderId: true } });
  return { changed: true, from, to: to ? { id: to.id, name: to.name } : null, ownerChanged, folderId: after?.driveFolderId ?? null, commissionsCreated };
};

/**
 * PATCH /admin/partners/assign (partner page "add clients", partner folder "Müştəri əlavə et", cases list, case
 * page): the same per-case assignment as the drive tiles (setCasePartner: PARTNER_CHANGED history, owner follows,
 * partner notified, inactive partner / own login refused) for many cases. All cases are checked first, so the
 * request is all-or-nothing for the validation errors (400 INVALID_PARTNER / INVALID_CASE / PARTNER_INACTIVE /
 * PARTNER_OWN_LOGIN) as before; the client folders move in the background.
 */
export const assignPartnerToCases = async (caseIds: string[], partnerId: string | null, actorId: string) => {
  const ids = [...new Set(caseIds)];
  const to = partnerId ? await prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { id: true, active: true, userId: true } }) : null;
  if (partnerId && !to) throw badRequest('INVALID_PARTNER');
  const rows = await prisma.case.findMany({ where: { id: { in: ids } }, select: { id: true, partnerId: true, clientId: true, parentCaseId: true } });
  if (rows.length !== ids.length) throw badRequest('INVALID_CASE');
  // Main applicants first: family members' folders live inside the main applicant's folder.
  const moving = rows.filter((r) => r.partnerId !== (to?.id ?? null)).sort((a, b) => Number(!!a.parentCaseId) - Number(!!b.parentCaseId));
  if (to && !to.active && moving.length) throw badRequest('PARTNER_INACTIVE');
  if (to?.userId && moving.some((r) => r.clientId === to.userId)) throw badRequest('PARTNER_OWN_LOGIN');
  const changed: string[] = [];
  let commissionsCreated = 0;
  for (const r of moving) {
    const x = await setCasePartner(r.id, to?.id ?? null, actorId, null, { awaitFolders: false });
    if (x.changed) changed.push(r.id);
    commissionsCreated += x.commissionsCreated;
  }
  return { changed, commissionsCreated };
};
