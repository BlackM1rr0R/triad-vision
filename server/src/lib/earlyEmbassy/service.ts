import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { createRequirements } from '../docsIntel/requirementTemplates.js';
import { EARLY_EMBASSY_STATUSES, earlyEmbassyOpen } from './rules.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { linkCaseRequirements } from '../docLink/service.js';

/**
 * Early embassy documents (rules in ./rules.ts): creates a case's EMBASSY requirement rows as soon as it waits for the
 * work contract, with the same sources as at the embassy step (family member list → visa-category templates → global
 * templates → built-in defaults: docsIntel/requirementTemplates.createRequirements).
 *
 * Idempotent and race-safe: the case row is locked (SELECT … FOR UPDATE, first statement of a READ COMMITTED
 * transaction) and the rows are only created when the case has no EMBASSY requirement yet. The later steps
 * (staffConfirmContract → EMBASSY_DOCUMENTS, staffReopen) keep their own "create when there are none" check, so a case
 * that got its rows early never gets a second set.
 *
 * Called when the case enters the waiting state (contract sent, initial documents submitted / accepted) and, lazily,
 * when the client opens the case or the overview (older cases already waiting). Never throws.
 */
export const ensureEarlyEmbassyRequirements = async (caseId: string): Promise<boolean> => {
  // "View as client" is read-only: no rows (and no row lock); the list appears on the client's own next visit.
  if (isImpersonating()) return false;
  try {
    // Cheap pre-check without a lock (most calls: wrong status or rows already there).
    const quick = await prisma.case.findUnique({ where: { id: caseId }, select: { status: true, _count: { select: { requirements: { where: { stage: 'EMBASSY' } } } } } });
    if (!quick || !EARLY_EMBASSY_STATUSES.includes(quick.status) || quick._count.requirements > 0) return false;
    // DOCUMENTS_REVIEW is only "open" once every required initial document is accepted: the common waiting state
    // (still under review) must not take a row lock on every portal read. Re-checked under the lock below.
    if (quick.status === 'DOCUMENTS_REVIEW') {
      const initial = await prisma.documentRequirement.findMany({ where: { caseId, stage: 'INITIAL' }, select: { required: true, documents: { select: { status: true } } } });
      if (!earlyEmbassyOpen(quick.status, initial)) return false;
    }
    const created = await prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM \`Case\` WHERE id = ${caseId} FOR UPDATE`;
        if (!locked.length) return false;
        const c = await tx.case.findUnique({
          where: { id: caseId },
          select: {
            status: true,
            visaCategoryId: true,
            requirements: { where: { stage: { in: ['INITIAL', 'EMBASSY'] } }, select: { stage: true, required: true, documents: { select: { status: true } } } },
          },
        });
        if (!c || c.requirements.some((r) => r.stage === 'EMBASSY')) return false;
        if (!earlyEmbassyOpen(c.status, c.requirements.filter((r) => r.stage === 'INITIAL'))) return false;
        await createRequirements(tx, caseId, 'EMBASSY', c.visaCategoryId);
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 },
    );
    // Documents the initial list already has for the same need (passport, photo …) are attached right away (lib/docLink).
    if (created) await linkCaseRequirements(caseId);
    return created;
  } catch (err) {
    console.error('[early-embassy] could not create the embassy requirements', err);
    return false;
  }
};

/** Whether the case is in the early embassy state right now (loads its initial requirements). */
export const earlyEmbassyOpenFor = async (c: { id: string; status: string }) => {
  if (!(EARLY_EMBASSY_STATUSES as string[]).includes(c.status)) return false;
  if (c.status !== 'DOCUMENTS_REVIEW') return true;
  const initial = await prisma.documentRequirement.findMany({ where: { caseId: c.id, stage: 'INITIAL' }, select: { required: true, documents: { select: { status: true } } } });
  return earlyEmbassyOpen(c.status, initial);
};
