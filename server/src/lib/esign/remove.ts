import fs from 'node:fs/promises';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { conflict } from '../http.js';

/**
 * Deleting signature requests (Admin → İmzalar, and the cleanup after a user deletion).
 * Removes the request (signers + events cascade) and its stored files: original / final PDF and the drawn signature images.
 * Copies already saved elsewhere (Drive node, case Document) are separate records and stay.
 */

type Db = Prisma.TransactionClient | typeof prisma;

const CLOSED_CASE = ['APPROVED', 'REJECTED', 'CANCELLED'];
const OPEN_PACKAGE = ['CANCELLED'];

/** Why a request must not be deleted (null = free to delete). Live case contracts and open AVV / package orders are protected. */
export const deleteBlocker = async (id: string, db: Db = prisma): Promise<string | null> => {
  const r = await db.signatureRequest.findUnique({
    where: { id },
    select: { id: true, caseId: true, isCaseContract: true, contractKind: true, case: { select: { status: true } } },
  });
  if (!r) return null;
  if (r.caseId && r.case && !CLOSED_CASE.includes(r.case.status)) {
    const linked = r.isCaseContract || r.contractKind !== null || !!(await db.contract.findFirst({ where: { caseId: r.caseId, signatureRequestId: id }, select: { id: true } }));
    if (linked) return 'CASE_CONTRACT_ACTIVE';
  }
  const avv = await db.avvAgreement.findFirst({ where: { signatureRequestId: id, status: { not: 'CANCELLED' } }, select: { id: true } });
  if (avv) return 'AVV_ACTIVE';
  const order = await db.packageOrder.findFirst({ where: { signatureRequestId: id, status: { notIn: OPEN_PACKAGE } }, select: { id: true } });
  if (order) return 'PACKAGE_ORDER_ACTIVE';
  return null;
};

const unlinkStored = async (keys: (string | null | undefined)[]) => {
  for (const k of keys) {
    if (!k) continue;
    await fs.unlink(path.join(config.uploads.privateDir, path.basename(k))).catch(() => undefined);
  }
};

/** Deletes one request and its files. Throws conflict(code) when protected, unless `force` (orphan cleanup / user deletion). */
export const removeSignatureRequest = async (id: string, opts: { force?: boolean } = {}) => {
  const r = await prisma.signatureRequest.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, caseId: true, originalKey: true, finalKey: true, signers: { select: { signatureImageKey: true } } },
  });
  if (!r) return null;
  if (!opts.force) {
    const blocker = await deleteBlocker(id);
    if (blocker) throw conflict(blocker, 'This signature request is in use and cannot be deleted');
  }
  await prisma.$transaction(async (tx) => {
    // Plain-id references (no foreign keys): drop the link so nothing points at a vanished request.
    await tx.contract.updateMany({ where: { signatureRequestId: id }, data: { signatureRequestId: null } });
    await tx.officialFormFill.updateMany({ where: { signatureRequestId: id }, data: { signatureRequestId: null } });
    await tx.packageOrder.updateMany({ where: { signatureRequestId: id }, data: { signatureRequestId: null } });
    await tx.avvAgreement.updateMany({ where: { signatureRequestId: id }, data: { signatureRequestId: null } });
    await tx.signatureRequest.delete({ where: { id } });
  });
  await unlinkStored([r.originalKey, r.finalKey, ...r.signers.map((s) => s.signatureImageKey)]);
  return { id: r.id, title: r.title, status: r.status, caseId: r.caseId };
};

/**
 * Requests left behind by deleted accounts: case contracts whose case is gone (Case → SetNull), and requests titled with a case
 * number whose candidate signer lost the account (signer.userId SetNull) while no user with that address exists any more.
 */
export const findOrphanRequestIds = async (): Promise<string[]> => {
  const ids = new Set<string>();
  const noCase = await prisma.signatureRequest.findMany({
    where: { caseId: null, OR: [{ isCaseContract: true }, { contractKind: { not: null } }] },
    select: { id: true },
  });
  for (const r of noCase) ids.add(r.id);
  const lost = await prisma.signatureSigner.findMany({
    // A case number in the title ("… · TV-2026-0015") marks a case request; plain external requests stay untouched.
    where: { role: 'CANDIDATE', userId: null, request: { caseId: null, title: { contains: 'TV-' } } },
    select: { requestId: true, email: true },
  });
  if (lost.length) {
    const emails = [...new Set(lost.map((s) => s.email.toLowerCase()))];
    const alive = new Set((await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } })).map((u) => u.email.toLowerCase()));
    for (const s of lost) if (!alive.has(s.email.toLowerCase())) ids.add(s.requestId);
  }
  return [...ids];
};

export const removeOrphanRequests = async () => {
  const ids = await findOrphanRequestIds();
  let removed = 0;
  for (const id of ids) {
    // Orphans are never live contracts (their case is gone), but external links (AVV / orders) still protect them.
    const blocker = await deleteBlocker(id);
    if (blocker && blocker !== 'CASE_CONTRACT_ACTIVE') continue;
    if (await removeSignatureRequest(id, { force: true })) removed++;
  }
  return { found: ids.length, removed };
};
