import { Router, type Request } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { limiter, notFound, parse } from '../lib/http.js';
import { answerCheckIn, answerSchema, hashToken, isExpired, publicView, TOKEN_RE } from '../lib/checkIns/service.js';

/**
 * Post-arrival check-ins, answer side (mounted at /api/check-ins):
 *
 *   GET  /mine     signed-in worker (CLIENT) or employer (COMPANY): open check-ins (web home card, mobile app)
 *   GET  /:key     the e-mailed token (no login) or the check-in id (only for the logged-in worker / employer)
 *   POST /:key     { answer: OK | ISSUE, topics?, comment? } — one answer per check-in
 */
export const checkInsRouter = Router();

const readLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 60, skip: () => config.isTest });
const answerLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 30, skip: () => config.isTest });
const ID_RE = /^[a-z0-9]{20,40}$/;

/** May the signed-in user answer this check-in by id? Worker: own case; employer: a case of their company. */
const ownsCheckIn = async (req: Request, c: { caseId: string; audience: string }) => {
  if (!req.user) return false;
  const kase = await prisma.case.findUnique({ where: { id: c.caseId }, select: { clientId: true, companyId: true } });
  if (!kase) return false;
  if (c.audience === 'WORKER') return kase.clientId === req.user.id;
  if (req.user.role !== 'COMPANY' || !kase.companyId) return false;
  const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { companyId: true } });
  return !!u?.companyId && u.companyId === kase.companyId;
};

const findCheckIn = async (req: Request, key: string) => {
  if (TOKEN_RE.test(key)) {
    const c = await prisma.arrivalCheckIn.findUnique({ where: { tokenHash: hashToken(key) } });
    if (c) return c;
  } else if (ID_RE.test(key) && req.user) {
    const c = await prisma.arrivalCheckIn.findUnique({ where: { id: key } });
    if (c && (await ownsCheckIn(req, c))) return c;
  }
  throw notFound('CHECKIN_NOT_FOUND');
};

checkInsRouter.get('/mine', requireAuth, async (req, res) => {
  const now = new Date();
  let where;
  if (req.user!.role === 'CLIENT') {
    where = { audience: 'WORKER' as const, followUp: { clientId: req.user!.id } };
  } else if (req.user!.role === 'COMPANY') {
    const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { companyId: true } });
    if (!u?.companyId) {
      res.json({ items: [] });
      return;
    }
    const caseIds = (await prisma.case.findMany({ where: { companyId: u.companyId }, select: { id: true }, take: 2000 })).map((c) => c.id);
    where = { audience: 'EMPLOYER' as const, caseId: { in: caseIds } };
  } else {
    res.json({ items: [] });
    return;
  }
  const rows = await prisma.arrivalCheckIn.findMany({ where: { ...where, answeredAt: null, sentAt: { not: null } }, orderBy: { sentAt: 'desc' }, take: 10 });
  const open = rows.filter((c) => !isExpired(c, now));
  res.json({ items: await Promise.all(open.map((c) => publicView(c, now))) });
});

checkInsRouter.get('/:key', readLimiter, async (req, res) => {
  const c = await findCheckIn(req, String(req.params.key));
  res.json({ checkIn: await publicView(c) });
});

checkInsRouter.post('/:key', answerLimiter, async (req, res) => {
  const c = await findCheckIn(req, String(req.params.key));
  const body = parse(answerSchema, req.body ?? {});
  const saved = await answerCheckIn(c, body, req.user?.id ?? null);
  await audit(req, 'CHECKIN_ANSWERED', `checkin:${c.id}`, { caseId: c.caseId, audience: c.audience, offsetDays: c.offsetDays, answer: saved.answer, topics: (saved.topics as string[] | null) ?? [] });
  res.json({ checkIn: await publicView(saved) });
});
