import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { hasMinRole, requireMinRole } from '../../middleware/auth.js';
import { HttpError, badRequest, conflict, forbidden, notFound, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { kanbanBoard, staffWorkload } from '../../lib/ops/kanban.js';
import { articleSelect, normaliseTags, searchArticles } from '../../lib/ops/kb.js';
import { API_SCOPES, generateApiKey } from '../../lib/ops/apiKeys.js';
import { WEBHOOK_EVENTS, isAcceptableWebhookUrl, newWebhookSecret, postDelivery, type WebhookEvent } from '../../lib/ops/webhooks.js';

/**
 * admin/ops — operations module: Kanban board, workload, knowledge base, API keys and webhooks.
 * Mounted at /api/admin/ops (STAFF+; admin-only parts are marked below).
 */
export const adminOpsRouter = Router();
adminOpsRouter.use(requireMinRole('STAFF'));

const isAdmin = (req: Request) => hasMinRole(req.user!.role, 'ADMIN');
const admin = requireMinRole('ADMIN');

// ─── Kanban ─────────────────────────────────────────────────────────────

adminOpsRouter.get('/kanban', async (req, res) => {
  const q = parse(
    z.object({
      mine: z.enum(['true', 'false']).optional(),
      staff: z.string().max(64).optional(),
      visa: z.string().max(64).optional(),
      final: z.enum(['true', 'false']).optional(),
    }),
    req.query,
  );
  const board = await kanbanBoard({
    staffId: q.mine === 'true' ? req.user!.id : q.staff || undefined,
    visaCategoryId: q.visa || undefined,
    includeFinal: q.final === 'true',
  });
  const [staff, visas] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    prisma.visaCategory.findMany({ select: { id: true, visaLabel: true, title: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  res.json({ ...board, staff, visas, generatedAt: new Date() });
});

adminOpsRouter.post('/kanban/assign', async (req, res) => {
  const { caseId, staffId } = parse(z.object({ caseId: z.string().max(64), staffId: z.string().max(64).nullable() }), req.body);
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, assignedStaffId: true } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  if (staffId) {
    const staff = await prisma.user.findUnique({ where: { id: staffId }, select: { role: true, isActive: true } });
    if (!staff || !staff.isActive || !hasMinRole(staff.role, 'STAFF')) throw badRequest('INVALID_STAFF');
  }
  if (c.assignedStaffId === staffId) {
    res.json({ ok: true, changed: false });
    return;
  }
  await prisma.case.update({ where: { id: c.id }, data: { assignedStaffId: staffId } });
  await prisma.caseEvent.create({
    data: { caseId: c.id, type: 'CASE_UPDATED', actorId: req.user!.id, visibleToClient: false, note: staffId ? `assigned:${staffId}` : 'unassigned' },
  });
  await audit(req, 'CASE_REASSIGNED', `case:${c.id}`, { from: c.assignedStaffId, to: staffId });
  res.json({ ok: true, changed: true });
});

adminOpsRouter.get('/workload', async (_req, res) => {
  res.json(await staffWorkload());
});

// ─── Knowledge base ─────────────────────────────────────────────────────

adminOpsRouter.get('/kb/categories', async (_req, res) => {
  const categories = await prisma.kbCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { articles: true } } },
  });
  res.json({ categories: categories.map(({ _count, ...c }) => ({ ...c, articles: _count.articles })) });
});

const categoryBody = z.object({ name: z.string().trim().min(1).max(80), sortOrder: z.number().int().min(0).max(10_000).optional() });

adminOpsRouter.post('/kb/categories', admin, async (req, res) => {
  const body = parse(categoryBody, req.body);
  const max = await prisma.kbCategory.aggregate({ _max: { sortOrder: true } });
  const category = await prisma.kbCategory.create({ data: { name: body.name, sortOrder: body.sortOrder ?? (max._max.sortOrder ?? -1) + 1 } });
  res.status(201).json({ category });
});

adminOpsRouter.patch('/kb/categories/:id', admin, async (req, res) => {
  const body = parse(categoryBody.partial(), req.body);
  const category = await prisma.kbCategory.update({ where: { id: String(req.params.id) }, data: body });
  res.json({ category });
});

adminOpsRouter.delete('/kb/categories/:id', admin, async (req, res) => {
  // Articles keep existing without a category (SetNull).
  await prisma.kbCategory.delete({ where: { id: String(req.params.id) } });
  res.json({ ok: true });
});

adminOpsRouter.get('/kb/articles', async (req, res) => {
  const q = parse(
    z.object({ categoryId: z.string().max(64).optional(), pinned: z.enum(['true']).optional(), tag: z.string().trim().max(40).optional() }),
    req.query,
  );
  const items = await prisma.kbArticle.findMany({
    where: {
      ...(q.categoryId === 'none' ? { categoryId: null } : q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.pinned ? { pinned: true } : {}),
      ...(isAdmin(req) ? {} : { OR: [{ published: true }, { updatedById: req.user!.id }] }),
    },
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    take: 500,
    select: { ...articleSelect, body: false },
  });
  const tag = q.tag?.toLowerCase();
  res.json({
    items: items
      .map((a) => ({ ...a, tags: normaliseTags(a.tags) }))
      .filter((a) => !tag || a.tags.includes(tag)),
  });
});

adminOpsRouter.get('/kb/search', async (req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().min(1).max(120) }), req.query);
  res.json(await searchArticles(q, { includeUnpublished: isAdmin(req) }));
});

const loadArticle = async (req: Request) => {
  const a = await prisma.kbArticle.findUnique({ where: { id: String(req.params.id) }, select: articleSelect });
  if (!a) throw notFound('ARTICLE_NOT_FOUND');
  if (!a.published && !isAdmin(req) && a.updatedBy?.id !== req.user!.id) throw notFound('ARTICLE_NOT_FOUND');
  return a;
};

adminOpsRouter.get('/kb/articles/:id', async (req, res) => {
  const a = await loadArticle(req);
  res.json({ article: { ...a, tags: normaliseTags(a.tags) } });
});

const articleBody = z.object({
  title: z.string().trim().min(2).max(200),
  body: z.string().max(100_000),
  categoryId: z.string().max(64).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  published: z.boolean().optional(),
  pinned: z.boolean().optional(),
});

adminOpsRouter.post('/kb/articles', async (req, res) => {
  const body = parse(articleBody, req.body);
  if (body.categoryId && !(await prisma.kbCategory.count({ where: { id: body.categoryId } }))) throw badRequest('INVALID_CATEGORY');
  if (body.pinned && !isAdmin(req)) throw forbidden();
  const article = await prisma.kbArticle.create({
    data: {
      title: body.title,
      body: body.body,
      categoryId: body.categoryId ?? null,
      tags: normaliseTags(body.tags),
      published: body.published ?? true,
      pinned: body.pinned ?? false,
      updatedById: req.user!.id,
    },
    select: articleSelect,
  });
  res.status(201).json({ article: { ...article, tags: normaliseTags(article.tags) } });
});

adminOpsRouter.patch('/kb/articles/:id', async (req, res) => {
  const body = parse(articleBody.partial(), req.body);
  const a = await loadArticle(req);
  // Staff edit what they wrote; admins edit, pin and unpublish anything.
  if (!isAdmin(req)) {
    if (a.updatedBy?.id !== req.user!.id) throw forbidden('NOT_YOUR_ARTICLE');
    if (body.pinned !== undefined && body.pinned !== a.pinned) throw forbidden();
  }
  if (body.categoryId && !(await prisma.kbCategory.count({ where: { id: body.categoryId } }))) throw badRequest('INVALID_CATEGORY');
  const article = await prisma.kbArticle.update({
    where: { id: a.id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      ...(body.tags !== undefined ? { tags: normaliseTags(body.tags) } : {}),
      ...(body.published !== undefined ? { published: body.published } : {}),
      ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
      updatedById: req.user!.id,
    },
    select: articleSelect,
  });
  res.json({ article: { ...article, tags: normaliseTags(article.tags) } });
});

adminOpsRouter.delete('/kb/articles/:id', admin, async (req, res) => {
  await prisma.kbArticle.delete({ where: { id: String(req.params.id) } });
  res.json({ ok: true });
});

// ─── API keys (ADMIN+) ─────────────────────────────────────────────────

const keyView = (k: { id: string; name: string; prefix: string; scopes: unknown; companyId: string | null; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date; company?: { name: string } | null; createdBy?: { firstName: string; lastName: string } | null }) => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  scopes: Array.isArray(k.scopes) ? k.scopes : [],
  companyId: k.companyId,
  company: k.company ?? null,
  createdBy: k.createdBy ? `${k.createdBy.firstName} ${k.createdBy.lastName}`.trim() : null,
  lastUsedAt: k.lastUsedAt,
  revokedAt: k.revokedAt,
  createdAt: k.createdAt,
});

const keyInclude = { company: { select: { name: true } }, createdBy: { select: { firstName: true, lastName: true } } } as const;

adminOpsRouter.get('/api-keys', admin, async (_req, res) => {
  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' }, include: keyInclude, take: 200 });
  res.json({ keys: keys.map(keyView), scopes: API_SCOPES });
});

adminOpsRouter.post('/api-keys', admin, async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(2).max(80),
      scopes: z.array(z.enum(API_SCOPES)).min(1),
      companyId: z.string().max(64).nullable().optional(),
    }),
    req.body,
  );
  if (body.companyId && !(await prisma.company.count({ where: { id: body.companyId } }))) throw badRequest('INVALID_COMPANY');
  const { key, keyHash, prefix } = generateApiKey();
  const row = await prisma.apiKey.create({
    data: { name: body.name, prefix, keyHash, scopes: [...new Set(body.scopes)], companyId: body.companyId ?? null, createdById: req.user!.id },
    include: keyInclude,
  });
  await audit(req, 'API_KEY_CREATED', `apikey:${row.id}`, { name: row.name, scopes: body.scopes, companyId: row.companyId });
  // The only moment the full key is ever shown.
  res.status(201).json({ key: keyView(row), secret: key });
});

adminOpsRouter.post('/api-keys/:id/revoke', admin, async (req, res) => {
  const row = await prisma.apiKey.findUnique({ where: { id: String(req.params.id) } });
  if (!row) throw notFound('API_KEY_NOT_FOUND');
  if (row.revokedAt) throw conflict('ALREADY_REVOKED');
  const updated = await prisma.apiKey.update({ where: { id: row.id }, data: { revokedAt: new Date() }, include: keyInclude });
  await audit(req, 'API_KEY_REVOKED', `apikey:${row.id}`);
  res.json({ key: keyView(updated) });
});

// ─── Webhooks (ADMIN+) ─────────────────────────────────────────────────

const hookView = (h: { id: string; url: string; events: unknown; companyId: string | null; active: boolean; createdAt: Date; company?: { name: string } | null; _count?: { deliveries: number } }) => ({
  id: h.id,
  url: h.url,
  events: Array.isArray(h.events) ? h.events : [],
  companyId: h.companyId,
  company: h.company ?? null,
  active: h.active,
  createdAt: h.createdAt,
  deliveries: h._count?.deliveries ?? 0,
});

const hookInclude = { company: { select: { name: true } }, _count: { select: { deliveries: true } } } as const;

adminOpsRouter.get('/webhooks', admin, async (_req, res) => {
  const hooks = await prisma.webhook.findMany({ orderBy: { createdAt: 'desc' }, include: hookInclude, take: 200 });
  const ids = hooks.map((h) => h.id);
  const [failed, pending] = ids.length
    ? await Promise.all([
        prisma.webhookDelivery.groupBy({ by: ['webhookId'], where: { webhookId: { in: ids }, status: 'FAILED' }, _count: { _all: true } }),
        prisma.webhookDelivery.groupBy({ by: ['webhookId'], where: { webhookId: { in: ids }, status: 'PENDING' }, _count: { _all: true } }),
      ])
    : [[], []];
  const failedBy = new Map(failed.map((f) => [f.webhookId, f._count._all]));
  const pendingBy = new Map(pending.map((f) => [f.webhookId, f._count._all]));
  res.json({ webhooks: hooks.map((h) => ({ ...hookView(h), failed: failedBy.get(h.id) ?? 0, pending: pendingBy.get(h.id) ?? 0 })), events: WEBHOOK_EVENTS });
});

const hookBody = z.object({
  url: z.string().trim().url().max(1000),
  events: z.array(z.enum(WEBHOOK_EVENTS as [WebhookEvent, ...WebhookEvent[]])).min(1),
  companyId: z.string().max(64).nullable().optional(),
  active: z.boolean().optional(),
});

adminOpsRouter.post('/webhooks', admin, async (req, res) => {
  const body = parse(hookBody, req.body);
  if (!isAcceptableWebhookUrl(body.url)) throw badRequest('INVALID_URL');
  if (body.companyId && !(await prisma.company.count({ where: { id: body.companyId } }))) throw badRequest('INVALID_COMPANY');
  const secret = newWebhookSecret();
  const hook = await prisma.webhook.create({
    data: { url: body.url, secret, events: [...new Set(body.events)], companyId: body.companyId ?? null, active: body.active ?? true, createdById: req.user!.id },
    include: hookInclude,
  });
  await audit(req, 'WEBHOOK_CREATED', `webhook:${hook.id}`, { url: hook.url, events: body.events });
  // The signing secret is shown once.
  res.status(201).json({ webhook: hookView(hook), secret });
});

adminOpsRouter.patch('/webhooks/:id', admin, async (req, res) => {
  const body = parse(hookBody.partial(), req.body);
  if (body.url && !isAcceptableWebhookUrl(body.url)) throw badRequest('INVALID_URL');
  const hook = await prisma.webhook.update({
    where: { id: String(req.params.id) },
    data: {
      ...(body.url !== undefined ? { url: body.url } : {}),
      ...(body.events !== undefined ? { events: [...new Set(body.events)] } : {}),
      ...(body.companyId !== undefined ? { companyId: body.companyId } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    },
    include: hookInclude,
  });
  await audit(req, 'WEBHOOK_UPDATED', `webhook:${hook.id}`, { fields: Object.keys(body) });
  res.json({ webhook: hookView(hook) });
});

adminOpsRouter.post('/webhooks/:id/rotate-secret', admin, async (req, res) => {
  const secret = newWebhookSecret();
  const hook = await prisma.webhook.update({ where: { id: String(req.params.id) }, data: { secret }, include: hookInclude });
  await audit(req, 'WEBHOOK_SECRET_ROTATED', `webhook:${hook.id}`);
  res.json({ webhook: hookView(hook), secret });
});

adminOpsRouter.delete('/webhooks/:id', admin, async (req, res) => {
  await prisma.webhook.delete({ where: { id: String(req.params.id) } });
  await audit(req, 'WEBHOOK_DELETED', `webhook:${req.params.id}`);
  res.json({ ok: true });
});

/** Sends a `ping` right away (not through the queue) so the admin sees the receiver's answer. */
adminOpsRouter.post('/webhooks/:id/test', admin, async (req, res) => {
  const hook = await prisma.webhook.findUnique({ where: { id: String(req.params.id) } });
  if (!hook) throw notFound('WEBHOOK_NOT_FOUND');
  const delivery = await prisma.webhookDelivery.create({
    data: { webhookId: hook.id, event: 'ping', payload: { event: 'ping', at: new Date().toISOString(), data: { webhookId: hook.id, by: req.user!.email } }, status: 'PENDING', nextAttemptAt: null },
  });
  const result = await postDelivery(hook, { id: delivery.id, event: 'ping', payload: delivery.payload });
  const updated = await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: result.ok
      ? { status: 'DELIVERED', attempts: 1, responseCode: result.status, deliveredAt: new Date(), lastError: null }
      : { status: 'FAILED', attempts: 1, responseCode: result.status ?? null, lastError: result.error },
  });
  res.json({ ok: result.ok, delivery: updated });
});

adminOpsRouter.get('/webhooks/:id/deliveries', admin, async (req, res) => {
  const q = parse(z.object({ status: z.enum(['PENDING', 'DELIVERED', 'FAILED']).optional() }), req.query);
  const deliveries = await prisma.webhookDelivery.findMany({
    where: { webhookId: String(req.params.id), ...(q.status ? { status: q.status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ deliveries });
});

adminOpsRouter.post('/webhooks/deliveries/:id/retry', admin, async (req, res) => {
  const d = await prisma.webhookDelivery.findUnique({ where: { id: String(req.params.id) } });
  if (!d) throw notFound('DELIVERY_NOT_FOUND');
  if (d.status === 'DELIVERED') throw new HttpError(409, 'ALREADY_DELIVERED');
  const delivery = await prisma.webhookDelivery.update({
    where: { id: d.id },
    data: { status: 'PENDING', nextAttemptAt: new Date(), lastError: null, attempts: Math.min(d.attempts, 1) },
  });
  res.json({ delivery });
});

