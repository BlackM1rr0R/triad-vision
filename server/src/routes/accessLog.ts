import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { notFound, parse } from '../lib/http.js';
import { accessQuery, buildAccessLog } from '../lib/privacy/accessLog.js';

/**
 * "Who viewed my documents?"
 *   GET /api/privacy/access-log            the signed-in user's own log (privacy centre)   ?from&to&kind
 *   GET /api/admin/access-log/:clientId    ADMIN+: the same view for one client (full staff names)
 */
export const accessLogRouter = Router();

accessLogRouter.get('/', requireAuth, async (req, res) => {
  res.json(await buildAccessLog(req.user!.id, parse(accessQuery, req.query)));
});

export const adminAccessLogRouter = Router();

adminAccessLogRouter.get('/:clientId', requireMinRole('ADMIN'), async (req, res) => {
  const client = await prisma.user.findUnique({ where: { id: String(req.params.clientId) }, select: { id: true, role: true, firstName: true, lastName: true } });
  if (!client || client.role !== 'CLIENT') throw notFound('USER_NOT_FOUND');
  const q = parse(accessQuery, req.query);
  await audit(req, 'ACCESS_LOG_VIEWED', `user:${client.id}`, { from: q.from ?? null, to: q.to ?? null });
  res.json({ client: { id: client.id, name: `${client.firstName} ${client.lastName}`.trim() }, ...(await buildAccessLog(client.id, q, { fullNames: true })) });
});
