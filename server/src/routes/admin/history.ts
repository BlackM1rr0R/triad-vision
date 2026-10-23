import { Router, type Response } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { parse } from '../../lib/http.js';
import { requireMinRole } from '../../middleware/auth.js';
import { CHANGE_SOURCES } from '../../lib/history/context.js';
import { HISTORY_ENTITIES } from '../../lib/history/fields.js';
import { assertCanRead, listHistory, revertChange, RevertError, revertRequest } from '../../lib/history/service.js';

/**
 * Field-level change history (mounted at /api/admin/history; the admin router already requires STAFF).
 *   GET  /                          ADMIN+ (STAFF: only ?entity=CASE&entityId=<a case assigned to them>)
 *   POST /:changeId/revert          ADMIN+ (sensitive fields: SUPER_ADMIN) — { force?, dryRun?, note? }
 *   POST /requests/:requestId/revert ADMIN+ — every change of one request / batch
 */
export const adminHistoryRouter = Router();

const listQuery = z.object({
  entity: z.enum(HISTORY_ENTITIES as [string, ...string[]]).optional(),
  entityId: z.string().max(40).optional(),
  actorId: z.string().max(40).optional(),
  field: z.string().max(120).optional(),
  source: z.enum(CHANGE_SOURCES as [string, ...string[]]).optional(),
  requestId: z.string().max(64).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

adminHistoryRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const viewer = { id: req.user!.id, role: req.user!.role };
  await assertCanRead(viewer, { entity: q.entity as never, entityId: q.entityId });
  res.json(await listHistory(viewer, { ...q, entity: q.entity as never }));
});

const revertBody = z.object({
  force: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  note: z.string().trim().max(2000).optional(),
});

const sendRevertError = (res: Response, err: unknown) => {
  if (err instanceof RevertError) {
    res.status(err.status).json({ error: err.code, message: err.message, ...err.details });
    return true;
  }
  return false;
};

adminHistoryRouter.post('/:changeId/revert', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(revertBody, req.body ?? {});
  const viewer = { id: req.user!.id, role: req.user!.role };
  try {
    const out = await revertChange(viewer, String(req.params.changeId), body);
    if (!body.dryRun) {
      await audit(req, 'HISTORY_REVERTED', `${out.plan.entity.toLowerCase()}:${out.plan.entityId}`, {
        changeId: out.plan.changeId,
        field: out.plan.field,
        forced: out.plan.forced,
        ...(out.plan.via ? { via: out.plan.via } : {}),
        revertChangeId: out.revertChangeId,
      });
    }
    res.json({ ok: true, dryRun: !!body.dryRun, plan: out.plan, revertChangeId: out.revertChangeId });
  } catch (err) {
    if (!sendRevertError(res, err)) throw err;
  }
});

const requestScope = z.object({
  entity: z.enum(HISTORY_ENTITIES as [string, ...string[]]).optional(),
  entityId: z.string().max(40).optional(),
});

adminHistoryRouter.post('/requests/:requestId/revert', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(revertBody.merge(requestScope), req.body ?? {});
  const viewer = { id: req.user!.id, role: req.user!.role };
  const requestId = String(req.params.requestId).slice(0, 64);
  try {
    const out = await revertRequest(viewer, requestId, { entity: body.entity as never, entityId: body.entityId }, body);
    if (!body.dryRun && out.reverted) {
      await audit(req, 'HISTORY_REVERTED', `request:${requestId}`, {
        batch: true,
        reverted: out.results.filter((r) => r.ok).map((r) => ({ changeId: r.changeId, entity: r.entity, entityId: r.entityId, field: r.field })),
        failed: out.failed,
        forced: !!body.force,
      });
    }
    res.status(out.reverted || body.dryRun ? 200 : 409).json({ ok: out.failed === 0, dryRun: !!body.dryRun, ...out, ...(out.reverted || body.dryRun ? {} : { error: 'NOTHING_REVERTED' }) });
  } catch (err) {
    if (!sendRevertError(res, err)) throw err;
  }
});
