import { z } from 'zod';
import { prisma } from '../../db.js';
import { HttpError } from '../http.js';
import { caseRowInScope } from '../access/resolve.js';
import { loadAccess } from '../access/store.js';
import type { AccessUser } from '../access/types.js';
import { PROCESSING_STAGES, effectiveStage, moveStage } from '../caseProcessing/index.js';
import type { CaseResult } from './logic.js';

/**
 * Bulk runner of the client folder actions: every case is tried on its own (one failure never stops the rest)
 * and answered with ok / skipped / error code. The staff case scope (lib/access) is checked per case here — the
 * body names the cases as `cases` (not `caseIds`), so the guard does not reject the whole request when one folder
 * the drive shows lies outside the scope; that case simply fails with OUT_OF_SCOPE.
 */

export const caseList = z.array(z.string().trim().min(1).max(40)).min(1).max(200);

const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

export const runForCases = async (
  user: AccessUser,
  ids: string[],
  fn: (caseId: string) => Promise<Partial<CaseResult> | void>,
): Promise<CaseResult[]> => {
  const unique = [...new Set(ids)];
  const access = await loadAccess(user);
  const rows = await prisma.case.findMany({
    where: { id: { in: unique } },
    select: { id: true, number: true, assignedStaffId: true, processingAssigneeId: true, client: { select: { firstName: true, lastName: true } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: CaseResult[] = [];
  for (const caseId of unique) {
    const c = byId.get(caseId);
    if (!c) {
      out.push({ caseId, ok: false, error: 'CASE_NOT_FOUND' });
      continue;
    }
    const base = { caseId, number: c.number, name: fullName(c.client) || c.number };
    if (!caseRowInScope(access, c)) {
      out.push({ ...base, ok: false, error: 'OUT_OF_SCOPE' });
      continue;
    }
    try {
      out.push({ ...base, ok: true, ...((await fn(caseId)) ?? {}) });
    } catch (err) {
      if (err instanceof HttpError) out.push({ ...base, ok: false, error: err.code });
      else throw err;
    }
  }
  return out;
};

export const bulkStageSchema = z.object({
  cases: caseList,
  stage: z.enum(PROCESSING_STAGES),
  assigneeId: z.string().trim().min(1).max(40).nullish(),
  note: z.string().trim().max(2000).nullish(),
});

/**
 * "Schon geschrieben kimi işarələ" (or any stage) for several client folders: the same move as one case
 * (lib/caseProcessing.moveStage: allowed transitions, history, notifications) per case; a case already in the
 * stage without a new assignee / note is skipped.
 */
export const bulkMoveStage = async (user: AccessUser & { firstName: string; lastName: string }, input: z.infer<typeof bulkStageSchema>) =>
  runForCases(user, input.cases, async (caseId) => {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { status: true, processingStage: true, processingAssigneeId: true } });
    const from = effectiveStage(c?.processingStage, c?.status);
    // Already there: nothing to do unless a new next admin or a note comes along (an empty assignee keeps the current one).
    if (from === input.stage && !input.note && (!input.assigneeId || input.assigneeId === c?.processingAssigneeId)) return { skipped: true };
    await moveStage(caseId, user, { stage: input.stage, assigneeId: input.assigneeId ?? null, note: input.note ?? null, origin: 'drive' });
    return {};
  });
