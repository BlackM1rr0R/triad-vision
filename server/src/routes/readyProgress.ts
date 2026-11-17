import { Router, type Response } from 'express';
import type { Company } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth, requireMinRole, requireRole } from '../middleware/auth.js';
import { HttpError, forbidden, limiter, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { visibleProfileWhere } from '../lib/pool/anonymous.js';
import { CHALLENGE_KEYS, MAX_POINTS } from '../lib/readyProgress/logic.js';
import { readyCertificatePdf } from '../lib/readyProgress/pdf.js';
import { READY_LOCALES, asReadyLocale } from '../lib/readyProgress/texts.js';
import {
  ALL_CHALLENGES,
  certificateForPdf,
  challengePreview,
  readChallengeOrder,
  readinessBands,
  readinessProfile,
  readyOverview,
  readySummary,
  readyVerifyUrl,
  setChallengeOrder,
  setReadyRevoked,
  staffCertificateView,
  syncResults,
  verifyReadyCertificate,
} from '../lib/readyProgress/service.js';

/**
 * "Germany Ready" (lib/readyProgress).
 *
 * Client — /api/account/ready (CLIENT only, own data):
 *   GET  /                 activities with progress, points, level, suggestions, weekly challenge, certificate
 *   GET  /summary          points + level + weekly challenge (dashboard card)
 *   POST /results          { results: [{ activityId, item?, score, max, completedAt? }] } (1–50) — self-reported
 *                          practice results; validated against the registry, clamped, idempotent per completion;
 *                          rate-limited (30/min) and capped per day
 *   GET  /certificate.pdf  ?lang=az|de|en|ru → the practice certificate (404 none yet, 410 revoked)
 *
 * Public — /api/ready-certificates/:code: { valid, number, holder: "A. M.", date, level, activities } only.
 *
 * Company — /api/company/readiness-profile (COMPANY, active company; ONLY with the client's READINESS_PROFILE consent):
 *   GET /workers/:caseId   full card for the company's own worker (null without consent; another company's case 404)
 *   GET /pool/:code        anonymous bands for a visible pool candidate (null without consent)
 *
 * Staff — /api/admin/ready (admin router, STAFF+; challenge order ADMIN+):
 *   GET  /certificates?userId=|number=   one certificate (or null)
 *   POST /certificates/:id/revoke {reason?} · POST /certificates/:id/restore
 *   GET  /challenges       pool, current order and the next weeks · PUT /challenges { order: [...] }
 */

// ─── Client ─────────────────────────────────────────────────────────────

export const accountReadyRouter = Router();
accountReadyRouter.use(requireAuth);
accountReadyRouter.use((req, _res, next) => next(req.user!.role === 'CLIENT' ? undefined : forbidden('CLIENTS_ONLY')));
accountReadyRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});

accountReadyRouter.get('/', async (req, res) => {
  res.json(await readyOverview(req.user!.id));
});

accountReadyRouter.get('/summary', async (req, res) => {
  res.json(await readySummary(req.user!.id));
});

const resultSchema = z.object({
  activityId: z.string().min(1).max(40),
  item: z.string().max(40).nullable().optional(),
  score: z.number().finite(),
  max: z.number().finite(),
  completedAt: z.string().datetime({ offset: true }).optional(),
});
const syncSchema = z.object({ results: z.array(resultSchema).min(1).max(50) }).strict();
const syncLimiter = limiter({ windowMs: 60 * 1000, limit: 30, keyGenerator: (req) => req.user?.id ?? 'anonymous', skip: () => config.isTest });

accountReadyRouter.post('/results', syncLimiter, async (req, res) => {
  const { results } = parse(syncSchema, req.body ?? {});
  res.json(await syncResults(req.user!.id, results));
});

accountReadyRouter.get('/certificate.pdf', async (req, res) => {
  const q = parse(z.object({ lang: z.enum(READY_LOCALES).optional() }), req.query);
  await readyOverview(req.user!.id); // issues / upgrades it when a level was just reached
  const data = await certificateForPdf(req.user!.id);
  if (!data) throw notFound('CERTIFICATE_NOT_FOUND');
  if (data.cert.revokedAt) throw new HttpError(410, 'CERTIFICATE_REVOKED');
  const locale = q.lang ?? asReadyLocale(req.user!.locale);
  const pdf = await readyCertificatePdf({
    fullName: data.fullName,
    level: data.cert.level as 'BRONZE' | 'SILVER' | 'GOLD',
    points: data.cert.points,
    maxPoints: MAX_POINTS,
    activities: data.cert.activities,
    date: data.cert.levelAt,
    number: data.cert.number,
    verifyUrl: readyVerifyUrl(data.cert.code),
    locale,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="germany-ready-${data.cert.number}-${locale}.pdf"`);
  res.send(pdf);
});

// ─── Public verification ───────────────────────────────────────────────

export const publicReadyCertificateRouter = Router();
const verifyLimiter = limiter({ windowMs: 60 * 1000, limit: 30, skip: () => config.isTest });

publicReadyCertificateRouter.get('/:code', verifyLimiter, async (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', 'no-store');
  const r = await verifyReadyCertificate(String(req.params.code).toUpperCase().slice(0, 32));
  if (!r) throw notFound('CERTIFICATE_NOT_FOUND');
  if (r.revoked) throw new HttpError(410, 'CERTIFICATE_REVOKED');
  res.json(r);
});

// ─── Company ────────────────────────────────────────────────────────────

export const companyReadinessRouter = Router();
companyReadinessRouter.use(requireRole('COMPANY'));
companyReadinessRouter.use(async (req, res, next) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { company: true } });
  if (!u?.company) return next(forbidden('NO_COMPANY'));
  if (u.company.status === 'SUSPENDED') return next(forbidden('COMPANY_SUSPENDED'));
  res.locals.company = u.company;
  next();
});
companyReadinessRouter.use(limiter({ windowMs: 60 * 1000, limit: 60, keyGenerator: (req) => req.user?.id ?? 'anonymous', skip: () => config.isTest }));
companyReadinessRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});
const co = (res: Response) => res.locals.company as Company;
const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;

companyReadinessRouter.get('/workers/:caseId', async (req, res) => {
  const caseId = String(req.params.caseId);
  if (!ID_RE.test(caseId)) throw notFound('WORKER_NOT_FOUND');
  const c = await prisma.case.findFirst({ where: { id: caseId, companyId: co(res).id }, select: { clientId: true } });
  if (!c) throw notFound('WORKER_NOT_FOUND');
  res.json({ profile: await readinessProfile(c.clientId) });
});

companyReadinessRouter.get('/pool/:code', async (req, res) => {
  if (co(res).status !== 'ACTIVE') throw forbidden('COMPANY_NOT_APPROVED');
  const code = String(req.params.code).trim().toUpperCase().slice(0, 20);
  const p = await prisma.candidatePoolProfile.findFirst({ where: { ...visibleProfileWhere, code }, select: { userId: true } });
  if (!p) throw notFound('CANDIDATE_NOT_FOUND');
  res.json({ bands: await readinessBands(p.userId) });
});

// ─── Staff ──────────────────────────────────────────────────────────────

export const adminReadyRouter = Router();

adminReadyRouter.get('/certificates', async (req, res) => {
  const q = parse(z.object({ userId: z.string().min(1).max(40).optional(), number: z.string().min(1).max(40).optional() }), req.query);
  if (!q.userId && !q.number) return res.json({ certificate: null });
  const cert = await prisma.readyCertificate.findFirst({ where: q.userId ? { userId: q.userId } : { number: q.number!.trim().toUpperCase() } });
  res.json({ certificate: staffCertificateView(cert) });
});

const revokeSchema = z.object({ reason: z.string().trim().max(300).optional() }).strict();

adminReadyRouter.post('/certificates/:id/revoke', async (req, res) => {
  const { reason } = parse(revokeSchema, req.body ?? {});
  const cert = await setReadyRevoked(String(req.params.id).slice(0, 40), true, req.user!.id, reason);
  if (!cert) throw notFound('CERTIFICATE_NOT_FOUND');
  await audit(req, 'READY_CERTIFICATE_REVOKED', cert.id, { userId: cert.userId, number: cert.number, reason: reason ?? null });
  res.json({ certificate: staffCertificateView(cert) });
});

adminReadyRouter.post('/certificates/:id/restore', async (req, res) => {
  const cert = await setReadyRevoked(String(req.params.id).slice(0, 40), false, req.user!.id);
  if (!cert) throw notFound('CERTIFICATE_NOT_FOUND');
  await audit(req, 'READY_CERTIFICATE_RESTORED', cert.id, { userId: cert.userId, number: cert.number });
  res.json({ certificate: staffCertificateView(cert) });
});

adminReadyRouter.get('/challenges', async (_req, res) => {
  const order = await readChallengeOrder();
  res.json({ challenges: ALL_CHALLENGES, order, upcoming: challengePreview(order) });
});

adminReadyRouter.put('/challenges', requireMinRole('ADMIN'), async (req, res) => {
  const { order } = parse(z.object({ order: z.array(z.enum(CHALLENGE_KEYS as [string, ...string[]])).max(50) }).strict(), req.body ?? {});
  const saved = await setChallengeOrder(order);
  await audit(req, 'READY_CHALLENGE_ORDER', 'readyProgress', { order: saved });
  res.json({ challenges: ALL_CHALLENGES, order: saved, upcoming: challengePreview(saved) });
});
