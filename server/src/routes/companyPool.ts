import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Company } from '@prisma/client';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireRole } from '../middleware/auth.js';
import { conflict, forbidden, limiter, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { notifyStaff } from '../lib/notifications.js';
import { FINAL_STATUSES } from '../lib/caseFlow.js';
import { GERMAN_LEVELS, RECOGNITION_STATUSES } from '../lib/matching.js';
import { POOL_LIMITS, POOL_PAGE_SIZE, POOL_REGIONS, POOL_SCAN_LIMIT } from '../lib/pool/constants.js';
import { matchesFilters, normaliseCode, poolCard, poolUserSelect, visibleProfileWhere, type PoolFilters } from '../lib/pool/anonymous.js';
import { logPoolView } from '../lib/pool/service.js';

/**
 * Employer side of the anonymous candidate pool — mounted at /api/company/pool (COMPANY users of an ACTIVE
 * company; suspended → 403 COMPANY_SUSPENDED, pending → 403 COMPANY_NOT_APPROVED):
 *
 *   GET    /options               filter values (regions, professions in the pool)
 *   GET    /                      search (deterministic filters), anonymous cards; logged as SEARCH
 *   GET    /saved                 the company's shortlist
 *   GET    /interests             the company's interest requests and their status (set by staff)
 *   GET    /:code                 one anonymous profile; logged as DETAIL
 *   PUT    /:code/saved           add to the shortlist      DELETE /:code/saved  remove
 *   POST   /:code/interest        { message?, positions } → request for staff (notification + e-mail, audit)
 *
 * Only the whitelisted card of lib/pool/anonymous.ts is ever sent (no personal data). Per-user rate limit plus
 * per-company daily caps; every search page and opened profile is logged so scraping is visible to staff.
 */
export const companyPoolRouter = Router();
companyPoolRouter.use(requireRole('COMPANY'));
companyPoolRouter.use(async (req, res, next) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { company: true } });
  if (!u?.company) return next(forbidden('NO_COMPANY'));
  if (u.company.status === 'SUSPENDED') return next(forbidden('COMPANY_SUSPENDED'));
  if (u.company.status !== 'ACTIVE') return next(forbidden('COMPANY_NOT_APPROVED'));
  res.locals.company = u.company;
  next();
});
companyPoolRouter.use(limiter({ windowMs: 60 * 1000, limit: 60, keyGenerator: (req) => req.user?.id ?? 'anonymous', skip: () => config.isTest }));
companyPoolRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});

const co = (res: Response) => res.locals.company as Company;

const loadVisible = () =>
  prisma.candidatePoolProfile.findMany({ where: visibleProfileWhere, orderBy: { consentAt: 'desc' }, take: POOL_SCAN_LIMIT, include: { user: { select: poolUserSelect } } });

const findVisible = async (code: string) => {
  const p = await prisma.candidatePoolProfile.findFirst({ where: { ...visibleProfileWhere, code: normaliseCode(code) }, include: { user: { select: poolUserSelect } } });
  if (!p) throw notFound('CANDIDATE_NOT_FOUND');
  return p;
};

const savedSet = async (companyId: string) => new Set((await prisma.candidatePoolSaved.findMany({ where: { companyId }, select: { profileId: true } })).map((s) => s.profileId));

companyPoolRouter.get('/options', async (_req, res) => {
  const rows = await loadVisible();
  const counts = new Map<string, number>();
  for (const r of rows) {
    const p = r.user.profession?.trim();
    if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const professions = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40).map(([name, count]) => ({ name, count }));
  res.json({ total: rows.length, professions, regions: POOL_REGIONS.filter((r) => r !== 'ANY'), germanLevels: GERMAN_LEVELS, recognitionStatuses: RECOGNITION_STATUSES });
});

const searchQuery = z.object({
  profession: z.string().trim().max(80).optional(),
  germanLevel: z.enum(GERMAN_LEVELS).optional(),
  minExperience: z.coerce.number().int().min(0).max(50).optional(),
  licence: z.string().trim().max(20).optional(),
  recognition: z.enum(RECOGNITION_STATUSES).optional(),
  region: z.enum(POOL_REGIONS).optional(),
  startBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  track: z.enum(['JOB', 'AUSBILDUNG']).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

companyPoolRouter.get('/', async (req, res) => {
  const q = parse(searchQuery, req.query);
  const company = co(res);
  const filters: PoolFilters = {
    profession: q.profession || undefined,
    germanLevel: q.germanLevel,
    minExperience: q.minExperience,
    licence: q.licence || undefined,
    recognition: q.recognition,
    region: q.region && q.region !== 'ANY' ? q.region : undefined,
    startBy: q.startBy ? new Date(`${q.startBy}T23:59:59Z`) : undefined,
    track: q.track,
  };
  const rows = (await loadVisible()).filter((r) => matchesFilters(r, r.user, filters));
  const page = rows.slice((q.page - 1) * POOL_PAGE_SIZE, q.page * POOL_PAGE_SIZE);
  await logPoolView({ companyId: company.id, companyName: company.name, userId: req.user!.id, kind: 'SEARCH', results: page.length });
  const saved = await savedSet(company.id);
  res.json({ items: page.map((r) => ({ ...poolCard(r, r.user), saved: saved.has(r.id) })), total: rows.length, page: q.page, pageSize: POOL_PAGE_SIZE });
});

companyPoolRouter.get('/saved', async (_req, res) => {
  const rows = await prisma.candidatePoolSaved.findMany({
    where: { companyId: co(res).id, profile: visibleProfileWhere },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { profile: { include: { user: { select: poolUserSelect } } } },
  });
  res.json({ items: rows.map((s) => ({ ...poolCard(s.profile, s.profile.user), saved: true, savedAt: s.createdAt })) });
});

companyPoolRouter.get('/interests', async (_req, res) => {
  const rows = await prisma.candidatePoolInterest.findMany({
    where: { companyId: co(res).id },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { profile: { include: { user: { select: poolUserSelect } } } },
  });
  const visible = new Set((await prisma.candidatePoolProfile.findMany({ where: { ...visibleProfileWhere, id: { in: rows.map((r) => r.profileId) } }, select: { id: true } })).map((p) => p.id));
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      code: r.profile.code,
      // Withdrawn / hidden candidates: only the code stays in the history.
      available: visible.has(r.profileId),
      profession: visible.has(r.profileId) ? (r.profile.user.profession ?? null) : null,
      positions: r.positions,
      message: r.message,
      status: r.status,
      createdAt: r.createdAt,
      statusChangedAt: r.statusChangedAt,
    })),
  });
});

companyPoolRouter.get('/:code', async (req, res) => {
  const company = co(res);
  const p = await findVisible(String(req.params.code));
  await logPoolView({ companyId: company.id, companyName: company.name, userId: req.user!.id, kind: 'DETAIL', profileId: p.id });
  const [saved, interests] = await Promise.all([
    prisma.candidatePoolSaved.findUnique({ where: { companyId_profileId: { companyId: company.id, profileId: p.id } }, select: { id: true } }),
    prisma.candidatePoolInterest.findMany({ where: { companyId: company.id, profileId: p.id }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, positions: true, message: true, createdAt: true } }),
  ]);
  res.json({ candidate: { ...poolCard(p, p.user), saved: !!saved }, interests });
});

companyPoolRouter.put('/:code/saved', async (req, res) => {
  const company = co(res);
  const p = await findVisible(String(req.params.code));
  await prisma.candidatePoolSaved.upsert({
    where: { companyId_profileId: { companyId: company.id, profileId: p.id } },
    update: {},
    create: { companyId: company.id, profileId: p.id, savedById: req.user!.id },
  });
  res.json({ saved: true });
});

companyPoolRouter.delete('/:code/saved', async (req, res) => {
  const company = co(res);
  const p = await prisma.candidatePoolProfile.findUnique({ where: { code: normaliseCode(String(req.params.code)) }, select: { id: true } });
  if (p) await prisma.candidatePoolSaved.deleteMany({ where: { companyId: company.id, profileId: p.id } });
  res.json({ saved: false });
});

const interestLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30, keyGenerator: (req) => req.user?.id ?? 'anonymous', skip: () => config.isTest });

companyPoolRouter.post('/:code/interest', interestLimiter, async (req, res) => {
  const body = parse(
    z.object({ message: z.string().trim().max(POOL_LIMITS.message).optional(), positions: z.coerce.number().int().min(1).max(POOL_LIMITS.positionsMax).default(1) }),
    req.body ?? {},
  );
  const company = co(res);
  const p = await findVisible(String(req.params.code));
  const open = await prisma.candidatePoolInterest.findFirst({ where: { companyId: company.id, profileId: p.id, status: { not: 'CLOSED' } }, select: { id: true } });
  if (open) throw conflict('INTEREST_ALREADY_OPEN');
  const interest = await prisma.candidatePoolInterest.create({
    data: { profileId: p.id, companyId: company.id, createdById: req.user!.id, message: body.message || null, positions: body.positions },
  });
  // Assigned staff of the candidate's active case get it too (admins always do; e-mail to the staff inbox).
  const activeCase = await prisma.case.findFirst({ where: { clientId: p.userId, status: { notIn: FINAL_STATUSES } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  await notifyStaff(
    `Namizəd bazası: ${company.name} ${p.code} ilə maraqlanır`.slice(0, 180),
    `${company.name} anonim namizəd ${p.code} (${p.user.profession ?? '—'}) ilə maraqlanır. Vakansiya sayı: ${body.positions}.${body.message ? `\n\nMesaj: ${body.message}` : ''}`,
    { link: `/admin/candidate-pool?tab=interests&id=${interest.id}`, type: 'CANDIDATE_POOL_INTEREST', ...(activeCase ? { caseId: activeCase.id } : {}) },
  );
  await audit(req, 'CANDIDATE_POOL_INTEREST_CREATED', `candidatePoolInterest:${interest.id}`, { companyId: company.id, code: p.code, positions: body.positions });
  res.status(201).json({ interest: { id: interest.id, status: interest.status, positions: interest.positions, message: interest.message, createdAt: interest.createdAt } });
});
