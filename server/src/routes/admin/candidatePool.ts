import { Router } from 'express';
import { z } from 'zod';
import type { Locale, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { notifyUser } from '../../lib/notifications.js';
import { FINAL_STATUSES } from '../../lib/caseFlow.js';
import { POOL_INTEREST_STATUSES, POOL_LIMITS } from '../../lib/pool/constants.js';
import { isVisible, poolCard, poolUserSelect, strList, visibleProfileWhere } from '../../lib/pool/anonymous.js';
import { ensurePoolProfile, notifyEmployerInterestStatus } from '../../lib/pool/service.js';

/**
 * Staff side of the anonymous candidate pool — mounted at /api/admin/candidate-pool (STAFF+):
 *
 *   GET   /                  pool overview: who is visible, consent date / version, staff flags, views, interests
 *   GET   /interests         employer interest requests (linked to the client 360 page and active case)
 *   PATCH /interests/:id     { status?, staffNote? } — NEW → CONTACTED → INTERVIEW → CLOSED (employer is notified)
 *   GET   /views             view log per company (24 h / 7 d / 30 d), so scraping is visible
 *   GET   /:userId           one client's pool entry, the exact employer card, consent log, interests, views
 *   PUT   /:userId           { staffReady?, hidden?, hiddenReason?, summary?, skills?, professions? }
 *
 * Staff can recommend (staffReady) and hide, but never switch the client's consent on.
 */
export const adminCandidatePoolRouter = Router();

const DAY = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 50;
const nameSel = { id: true, firstName: true, lastName: true, email: true } as const;

const STATES = ['visible', 'awaiting', 'hidden', 'withdrawn', 'all'] as const;

const stateWhere = (s: (typeof STATES)[number]): Prisma.CandidatePoolProfileWhereInput => {
  switch (s) {
    case 'visible':
      return visibleProfileWhere;
    case 'awaiting': // recommended by staff, no consent yet
      return { staffReady: true, consentAt: null };
    case 'hidden':
      return { hidden: true };
    case 'withdrawn':
      return { consentAt: null, withdrawnAt: { not: null } };
    default:
      return {};
  }
};

const activeCases = async (userIds: string[]) => {
  const rows = userIds.length
    ? await prisma.case.findMany({ where: { clientId: { in: userIds }, status: { notIn: FINAL_STATUSES } }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, clientId: true } })
    : [];
  const out = new Map<string, { id: string; number: string; status: string }>();
  for (const c of rows) if (!out.has(c.clientId)) out.set(c.clientId, { id: c.id, number: c.number, status: c.status });
  return out;
};

adminCandidatePoolRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({ state: z.enum(STATES).default('visible'), search: z.string().trim().max(120).optional(), page: z.coerce.number().int().min(1).max(1000).default(1) }),
    req.query,
  );
  const and: Prisma.CandidatePoolProfileWhereInput[] = [stateWhere(q.state)];
  if (q.search) {
    and.push({
      OR: [
        { code: { contains: q.search } },
        { user: { firstName: { contains: q.search } } },
        { user: { lastName: { contains: q.search } } },
        { user: { email: { contains: q.search } } },
        { user: { profession: { contains: q.search } } },
      ],
    });
  }
  const where: Prisma.CandidatePoolProfileWhereInput = { AND: and };
  const since = new Date(Date.now() - 30 * DAY);
  const [rows, total, counts] = await Promise.all([
    prisma.candidatePoolProfile.findMany({
      where,
      orderBy: [{ consentAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { ...poolUserSelect, ...nameSel } }, _count: { select: { interests: true } } },
    }),
    prisma.candidatePoolProfile.count({ where }),
    Promise.all(STATES.filter((s) => s !== 'all').map(async (s) => [s, await prisma.candidatePoolProfile.count({ where: stateWhere(s) })] as const)),
  ]);
  const views = rows.length
    ? await prisma.candidatePoolView.groupBy({ by: ['profileId'], where: { profileId: { in: rows.map((r) => r.id) }, kind: 'DETAIL', createdAt: { gte: since } }, _count: { _all: true } })
    : [];
  const viewsBy = new Map(views.map((v) => [v.profileId, v._count._all]));
  const cases = await activeCases(rows.map((r) => r.userId));
  res.json({
    items: rows.map((r) => ({
      userId: r.userId,
      code: r.code,
      name: `${r.user.firstName} ${r.user.lastName}`.trim(),
      email: r.user.email,
      profession: r.user.profession,
      germanLevel: r.user.germanLevel,
      visible: isVisible(r),
      consentAt: r.consentAt,
      consentVersion: r.consentVersion,
      withdrawnAt: r.withdrawnAt,
      staffReady: r.staffReady,
      hidden: r.hidden,
      hasSummary: !!r.summary?.trim(),
      interests: r._count.interests,
      views30d: viewsBy.get(r.id) ?? 0,
      activeCase: cases.get(r.userId) ?? null,
    })),
    total,
    page: q.page,
    pageSize: PAGE_SIZE,
    counts: Object.fromEntries(counts),
  });
});

const interestInclude = {
  company: { select: { id: true, name: true, status: true, city: true } },
  profile: { select: { code: true, userId: true, consentAt: true, hidden: true, user: { select: { ...nameSel, profession: true, isActive: true, role: true } } } },
} as const;

adminCandidatePoolRouter.get('/interests', async (req, res) => {
  const q = parse(z.object({ status: z.enum(POOL_INTEREST_STATUSES).optional(), page: z.coerce.number().int().min(1).max(1000).default(1) }), req.query);
  const where: Prisma.CandidatePoolInterestWhereInput = q.status ? { status: q.status } : {};
  const [rows, total, counts] = await Promise.all([
    prisma.candidatePoolInterest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: interestInclude }),
    prisma.candidatePoolInterest.count({ where }),
    prisma.candidatePoolInterest.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const employerIds = [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))];
  const employers = new Map((employerIds.length ? await prisma.user.findMany({ where: { id: { in: employerIds } }, select: nameSel }) : []).map((u) => [u.id, u]));
  const cases = await activeCases(rows.map((r) => r.profile.userId));
  res.json({
    items: rows.map(({ profile, ...r }) => ({
      ...r,
      createdBy: r.createdById ? (employers.get(r.createdById) ?? null) : null,
      candidate: {
        userId: profile.userId,
        code: profile.code,
        name: `${profile.user.firstName} ${profile.user.lastName}`.trim(),
        profession: profile.user.profession,
        stillVisible: !!profile.consentAt && !profile.hidden && profile.user.isActive,
      },
      activeCase: cases.get(profile.userId) ?? null,
    })),
    total,
    page: q.page,
    pageSize: PAGE_SIZE,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  });
});

adminCandidatePoolRouter.patch('/interests/:id', async (req, res) => {
  const body = parse(z.object({ status: z.enum(POOL_INTEREST_STATUSES).optional(), staffNote: z.string().trim().max(5000).nullable().optional() }), req.body ?? {});
  const r = await prisma.candidatePoolInterest.findUnique({ where: { id: String(req.params.id) }, include: { profile: { select: { code: true } } } });
  if (!r) throw notFound('INTEREST_NOT_FOUND');
  const changed = !!body.status && body.status !== r.status;
  const data: Prisma.CandidatePoolInterestUpdateInput = {};
  if (body.staffNote !== undefined) data.staffNote = body.staffNote || null;
  if (changed) Object.assign(data, { status: body.status, statusChangedAt: new Date(), handledById: req.user!.id });
  const updated = await prisma.candidatePoolInterest.update({ where: { id: r.id }, data });
  if (changed) {
    await notifyEmployerInterestStatus(r.createdById, r.profile.code, updated.status);
    await audit(req, 'CANDIDATE_POOL_INTEREST_STATUS', `candidatePoolInterest:${r.id}`, { from: r.status, to: updated.status });
  } else if (body.staffNote !== undefined) {
    await audit(req, 'CANDIDATE_POOL_INTEREST_NOTE', `candidatePoolInterest:${r.id}`);
  }
  res.json({ interest: updated });
});

adminCandidatePoolRouter.get('/views', async (_req, res) => {
  const now = Date.now();
  const windows = { d1: new Date(now - DAY), d7: new Date(now - 7 * DAY), d30: new Date(now - 30 * DAY) };
  const grouped = await Promise.all(
    Object.entries(windows).map(async ([key, since]) => [key, await prisma.candidatePoolView.groupBy({ by: ['companyId', 'kind'], where: { createdAt: { gte: since } }, _count: { _all: true } })] as const),
  );
  const stats = new Map<string, Record<string, number>>();
  for (const [key, rows] of grouped) {
    for (const r of rows) {
      const s = stats.get(r.companyId) ?? {};
      s[`${r.kind === 'DETAIL' ? 'details' : 'searches'}_${key}`] = r._count._all;
      stats.set(r.companyId, s);
    }
  }
  const companies = stats.size ? await prisma.company.findMany({ where: { id: { in: [...stats.keys()] } }, select: { id: true, name: true, status: true } }) : [];
  const items = companies
    .map((c) => {
      const s = stats.get(c.id) ?? {};
      const n = (k: string) => s[k] ?? 0;
      return {
        company: c,
        details: { d1: n('details_d1'), d7: n('details_d7'), d30: n('details_d30') },
        searches: { d1: n('searches_d1'), d7: n('searches_d7'), d30: n('searches_d30') },
      };
    })
    .sort((a, b) => b.details.d1 - a.details.d1 || b.details.d7 - a.details.d7 || b.searches.d7 - a.searches.d7);
  const recent = await prisma.candidatePoolView.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, kind: true, results: true, createdAt: true, userId: true, company: { select: { id: true, name: true } }, profile: { select: { code: true, userId: true } } },
  });
  const viewerIds = [...new Set(recent.map((r) => r.userId))];
  const viewers = new Map((viewerIds.length ? await prisma.user.findMany({ where: { id: { in: viewerIds } }, select: nameSel }) : []).map((u) => [u.id, u]));
  res.json({ items, recent: recent.map((r) => ({ ...r, viewer: viewers.get(r.userId) ?? null })) });
});

const loadClient = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { ...poolUserSelect, ...nameSel, locale: true } });
  if (!user || user.role !== 'CLIENT') throw notFound('CANDIDATE_NOT_FOUND');
  return user;
};

const detail = async (userId: string) => {
  const user = await loadClient(userId);
  const p = await ensurePoolProfile(userId);
  const [consentLog, interests, views30d, recentViews, cases] = await Promise.all([
    prisma.consentRecord.findMany({ where: { userId, type: 'CANDIDATE_POOL' }, orderBy: { createdAt: 'desc' }, take: 50, select: { granted: true, version: true, source: true, createdAt: true } }),
    prisma.candidatePoolInterest.findMany({ where: { profileId: p.id }, orderBy: { createdAt: 'desc' }, include: { company: { select: { id: true, name: true } } } }),
    prisma.candidatePoolView.count({ where: { profileId: p.id, kind: 'DETAIL', createdAt: { gte: new Date(Date.now() - 30 * DAY) } } }),
    prisma.candidatePoolView.findMany({ where: { profileId: p.id }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, createdAt: true, company: { select: { id: true, name: true } } } }),
    activeCases([userId]),
  ]);
  const { user: _u, ...profile } = { ...p, user };
  return {
    user: { id: user.id, name: `${user.firstName} ${user.lastName}`.trim(), email: user.email, profession: user.profession },
    profile: { ...profile, visible: isVisible({ ...p, user }) },
    card: poolCard(p, user),
    consentLog,
    interests,
    views30d,
    recentViews,
    activeCase: cases.get(userId) ?? null,
  };
};

adminCandidatePoolRouter.get('/:userId', async (req, res) => {
  res.json(await detail(String(req.params.userId)));
});

const READY_TEXT: Record<Locale, { title: string; body: string }> = {
  az: { title: 'İşəgötürənlər üçün anonim profil', body: 'Məsləhətçiniz profilinizi anonim namizəd bazasına əlavə etməyi tövsiyə edir. Razılığınızı profil səhifəsində verə bilərsiniz.' },
  de: { title: 'Anonymes Profil für Arbeitgeber', body: 'Ihr Berater empfiehlt, Ihr Profil anonym im Kandidatenpool zu zeigen. Ihre Zustimmung können Sie im Profil geben.' },
  en: { title: 'Anonymous profile for employers', body: 'Your advisor recommends showing your profile anonymously in our candidate pool. You can give your consent in your profile.' },
  ru: { title: 'Анонимный профиль для работодателей', body: 'Ваш консультант рекомендует показать ваш профиль анонимно в базе кандидатов. Согласие можно дать в профиле.' },
};

adminCandidatePoolRouter.put('/:userId', async (req, res) => {
  const body = parse(
    z
      .object({
        staffReady: z.boolean().optional(),
        hidden: z.boolean().optional(),
        hiddenReason: z.string().trim().max(300).nullable().optional(),
        summary: z.string().trim().max(POOL_LIMITS.summary).nullable().optional(),
        skills: z.array(z.string().trim().min(1).max(POOL_LIMITS.skillLength)).max(POOL_LIMITS.skills).optional(),
        professions: z.array(z.string().trim().min(1).max(POOL_LIMITS.professionLength)).max(POOL_LIMITS.professions).optional(),
      })
      .strict(),
    req.body ?? {},
  );
  const userId = String(req.params.userId);
  const user = await loadClient(userId);
  const p = await ensurePoolProfile(userId);
  const data: Prisma.CandidatePoolProfileUpdateInput = { staffUpdatedById: req.user!.id, staffUpdatedAt: new Date() };
  if (body.staffReady !== undefined) data.staffReady = body.staffReady;
  if (body.hidden !== undefined) data.hidden = body.hidden;
  if (body.hiddenReason !== undefined) data.hiddenReason = body.hiddenReason || null;
  if (body.summary !== undefined) data.summary = body.summary || null;
  if (body.skills) data.skills = strList(body.skills, POOL_LIMITS.skills, POOL_LIMITS.skillLength);
  if (body.professions) data.professions = strList(body.professions, POOL_LIMITS.professions, POOL_LIMITS.professionLength);
  await prisma.candidatePoolProfile.update({ where: { id: p.id }, data });
  // Hiding removes the candidate from employers' shortlists as well.
  if (body.hidden === true && !p.hidden) await prisma.candidatePoolSaved.deleteMany({ where: { profileId: p.id } });
  if (body.staffReady === true && !p.staffReady && !p.consentAt) {
    const t = READY_TEXT[user.locale];
    await notifyUser(userId, { type: 'CANDIDATE_POOL_READY', title: t.title, body: t.body, link: '/account/profile?tab=professional' });
  }
  await audit(req, 'CANDIDATE_POOL_STAFF_UPDATED', `user:${userId}`, { code: p.code, fields: Object.keys(body), ...(body.hidden !== undefined ? { hidden: body.hidden } : {}) });
  res.json(await detail(userId));
});
