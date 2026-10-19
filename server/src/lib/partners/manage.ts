import { prisma } from '../../db.js';
import { revokeUserSessions } from '../../middleware/auth.js';
import { ensurePartnerFolder, partnerFolderId, syncCaseFolder } from '../drive/caseFolders.js';
import { softDelete } from '../drive/trash.js';
import { syncCommission } from '../settlement/service.js';
import { syncCaseCommissions } from './commissions.js';
import { syncFoldersLater } from './index.js';

/**
 * Assigning cases to a referral partner and deleting a partner — shared by the admin routes and the drive.
 */

/**
 * Links (partnerId) or unlinks (null) cases: case events, automatic commissions (PENDING row for the new
 * partner, the old partner's PENDING row cancelled) and the client folders (moved into the partner's folder
 * or back to "Anträge/<Visumart>/<Kategorie>"). With `awaitFolders` the folders are moved before it returns
 * (otherwise in the background). Unknown case ids are skipped.
 */
export const assignCases = async (caseIds: string[], partnerId: string | null, actorId: string | null, opts: { awaitFolders?: boolean } = {}) => {
  const ids = [...new Set(caseIds)];
  const existing = await prisma.case.findMany({ where: { id: { in: ids } }, select: { id: true, partnerId: true, parentCaseId: true } });
  const changedRows = existing.filter((c) => c.partnerId !== partnerId);
  const changed = changedRows.map((c) => c.id);
  let commissionsCreated = 0;
  if (changed.length) {
    await prisma.case.updateMany({ where: { id: { in: changed } }, data: { partnerId } });
    await prisma.caseEvent.createMany({
      data: changed.map((caseId) => ({ caseId, type: 'CASE_UPDATED' as const, actorId, visibleToClient: false })),
    });
    if (opts.awaitFolders) {
      // Main applicants first: family members live inside the main applicant's folder.
      for (const c of [...changedRows.filter((x) => !x.parentCaseId), ...changedRows.filter((x) => x.parentCaseId)]) await syncCaseFolder(c.id);
    } else syncFoldersLater(changed);
    commissionsCreated = await syncCaseCommissions(
      changedRows.map((c) => ({ caseId: c.id, from: c.partnerId, to: partnerId })),
      actorId,
    );
  }
  return { found: existing.length, changed, commissionsCreated };
};

export interface PartnerDeleteSummary {
  name: string;
  cases: number;
  commissionsCancelled: number;
  settlements: number;
  loginDeactivated: boolean;
  loginUnlinked: boolean;
  /** What happened to the partner's drive folder. */
  folder: 'trashed' | 'kept' | 'none';
  folderId: string | null;
}

/**
 * Deletes a referral partner for good, keeping the accounts history consistent:
 *  1. a partner folder that is in the drive's recycle bin is restored first, so the client folders inside are
 *     not lost;
 *  2. every case is unassigned like PATCH /assign does (automatic PENDING commissions cancelled, client folders
 *     moved back to "Anträge/<Visumart>/<Kategorie>");
 *  3. settlement (Hesablaşma) rows stay but lose the partner; their ledger-owned commissions are removed through
 *     the settlement sync;
 *  4. a portal login is unlinked (an account that is not also an agent is deactivated and logged out);
 *  5. the partner folder goes to the bin when it is empty now (or was in the bin already), otherwise it stays as
 *     an ordinary folder;
 *  6. the record is deleted (remaining approved / paid commission rows go with it).
 * Returns null when the partner does not exist.
 */
export const deletePartner = async (partnerId: string, actorId: string): Promise<PartnerDeleteSummary | null> => {
  const partner = await prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { id: true, name: true, userId: true } });
  if (!partner) return null;

  // 1. Folder: live, or back from the bin (it is trashed again at the end).
  let folderId = await partnerFolderId(partner);
  let wasTrashed = false;
  if (!folderId) {
    const r = await ensurePartnerFolder(partner.id, { restore: true });
    if (r?.restored) {
      folderId = r.folderId;
      wasTrashed = true;
    } else if (r?.created) {
      // Nothing was there: no need for a new empty folder.
      await prisma.driveNode.delete({ where: { id: r.folderId } }).catch(() => undefined);
    }
  }

  // 2. Cases.
  const cases = await prisma.case.findMany({ where: { partnerId: partner.id }, select: { id: true } });
  const pendingBefore = await prisma.partnerCommission.count({ where: { partnerId: partner.id, status: 'PENDING', settlementEntryId: null, caseId: { in: cases.map((c) => c.id) } } });
  if (cases.length) await assignCases(cases.map((c) => c.id), null, actorId, { awaitFolders: true });

  // 3. Settlement rows keep their data; the partner share no longer belongs to anybody.
  const entries = await prisma.settlementEntry.findMany({ where: { partnerId: partner.id }, select: { id: true } });
  if (entries.length) {
    await prisma.settlementEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { partnerId: null } });
    for (const e of entries) await syncCommission(e.id);
  }

  // 4. Portal login.
  let loginDeactivated = false;
  if (partner.userId) {
    await prisma.referralPartner.update({ where: { id: partner.id }, data: { userId: null } });
    const agent = await prisma.agent.findUnique({ where: { userId: partner.userId }, select: { id: true } });
    if (!agent) {
      await prisma.user.update({ where: { id: partner.userId }, data: { isActive: false } });
      await revokeUserSessions(partner.userId);
      loginDeactivated = true;
    }
  }

  // 5. Folder.
  let folder: PartnerDeleteSummary['folder'] = 'none';
  if (folderId) {
    const left = await prisma.driveNode.count({ where: { parentId: folderId, deletedAt: null } });
    if (left === 0 || wasTrashed) {
      await softDelete(folderId, actorId);
      folder = 'trashed';
    } else folder = 'kept';
  }

  // 6. Record.
  await prisma.referralPartner.delete({ where: { id: partner.id } });
  return {
    name: partner.name,
    cases: cases.length,
    commissionsCancelled: pendingBefore,
    settlements: entries.length,
    loginDeactivated,
    loginUnlinked: !!partner.userId,
    folder,
    folderId,
  };
};
