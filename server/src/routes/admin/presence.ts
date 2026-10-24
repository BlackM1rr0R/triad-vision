import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { notFound, parse } from '../../lib/http.js';
import { PRESENCE_KINDS, heartbeat, leave, startPresenceSweep, viewers, type PresenceKind } from '../../lib/presence/viewers.js';

/**
 * Live presence on staff records (mounted on /api/admin/presence, STAFF+):
 *   GET    /:kind/:id   { viewers }                           who is viewing the case / inquiry now
 *   POST   /:kind/:id   { editing?: string | null } → { viewers }   join + heartbeat (every ~15 s); editing = open form section
 *   DELETE /:kind/:id   { viewers }                           leave (page closed)
 * kind = case | inquiry. Changes go out as the realtime event `viewers.updated` (lib/presence/viewers.ts).
 */
export const adminPresenceRouter = Router();
startPresenceSweep();

const params = z.object({ kind: z.enum(PRESENCE_KINDS), id: z.string().trim().min(1).max(40) });
const SECTION_RE = /^[a-zA-Z][a-zA-Z0-9_.-]{0,39}$/;

const exists = async (kind: PresenceKind, id: string) =>
  kind === 'case' ? (await prisma.case.count({ where: { id } })) > 0 : (await prisma.inquiry.count({ where: { id } })) > 0;

adminPresenceRouter.get('/:kind/:id', async (req, res) => {
  const p = parse(params, req.params);
  res.json({ viewers: viewers(p.kind, p.id) });
});

adminPresenceRouter.post('/:kind/:id', async (req, res) => {
  const p = parse(params, req.params);
  const { editing } = parse(z.object({ editing: z.string().regex(SECTION_RE).nullable().optional() }), req.body ?? {});
  const me = req.user!;
  // Only check the record on the first beat of this viewer (later beats are cheap, in memory).
  if (!viewers(p.kind, p.id).some((v) => v.userId === me.id) && !(await exists(p.kind, p.id))) throw notFound('NOT_FOUND');
  res.json({ viewers: heartbeat(p.kind, p.id, { id: me.id, firstName: me.firstName, lastName: me.lastName }, editing ?? null) });
});

adminPresenceRouter.delete('/:kind/:id', async (req, res) => {
  const p = parse(params, req.params);
  res.json({ viewers: leave(p.kind, p.id, req.user!.id) });
});
