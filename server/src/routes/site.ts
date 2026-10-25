import fs from 'node:fs';
import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { badRequest, forbidden, HttpError, limiter, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { notifyUser } from '../lib/notifications.js';
import { renderEmail, sendMail } from '../lib/mailer.js';
import { endpointHash, isAllowedEndpoint, sendWebPush, vapidKeys } from '../lib/site/webPush.js';
import {
  buildView,
  findByNumberAndBirthDate,
  findByToken,
  hashIp,
  lockedFor,
  newShareToken,
  normaliseCaseNumber,
  recordAttempt,
  sha256,
} from '../lib/site/publicStatus.js';
import {
  canHandleProblems,
  createProblemTask,
  getProblemSettings,
  PROBLEM_DIR,
  PROBLEM_HOURLY_LIMIT,
  PROBLEM_IMAGE_MAX_BYTES,
  PROBLEM_IMAGE_MIME,
  PROBLEM_SETTING,
  problemInputSchema,
  problemSettingsSchema,
  repliesOf,
  storeProblemImage,
  taskRef,
  type ProblemReply,
} from '../lib/site/problems.js';
import { SITE_TEXTS, siteLocale } from '../lib/site/texts.js';
import { deriveTheme, getSiteTheme, saveSiteTheme, THEME_DEFAULTS, THEME_KEY, themeSchema } from '../lib/site/theme.js';

/**
 * Site features (PWA stream):
 *   /api/site/push/*            Web Push subscriptions of the installed site
 *   /api/site/status/*          public status check (no login) + the client's privacy switch / family link
 *   /api/site/problems          "Problem bildir" (anyone) and /api/site/admin/problems (admins)
 */
export const siteRouter = Router();

// ─── Web Push ─────────────────────────────────────────────────────────

/** The VAPID public key the browser subscribes with (null: web push is not configured). */
siteRouter.get('/push/key', (_req, res) => {
  res.json({ publicKey: vapidKeys()?.publicKey ?? null });
});

const b64u = (min: number, max: number) => z.string().min(min).max(max).regex(/^[A-Za-z0-9_-]+=*$/);
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine(isAllowedEndpoint, 'UNSUPPORTED_PUSH_SERVICE'),
  keys: z.object({ p256dh: b64u(80, 100), auth: b64u(16, 40) }),
});

/** Keeps at most this many browsers per user (oldest are dropped). */
const MAX_SUBSCRIPTIONS = 10;

siteRouter.post('/push/subscriptions', requireAuth, async (req, res) => {
  const body = parse(subscriptionSchema, req.body);
  const hash = endpointHash(body.endpoint);
  const userAgent = (req.get('user-agent') ?? '').slice(0, 300) || null;
  // The same browser may have belonged to someone else before (shared computer): it now follows this user.
  await prisma.webPushSubscription.upsert({
    where: { endpointHash: hash },
    create: { endpointHash: hash, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, userId: req.user!.id, userAgent },
    update: { endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, userId: req.user!.id, userAgent, lastSeenAt: new Date(), lastError: null },
  });
  const all = await prisma.webPushSubscription.findMany({ where: { userId: req.user!.id }, orderBy: { lastSeenAt: 'desc' }, select: { id: true } });
  if (all.length > MAX_SUBSCRIPTIONS) {
    await prisma.webPushSubscription.deleteMany({ where: { id: { in: all.slice(MAX_SUBSCRIPTIONS).map((s) => s.id) } } });
  }
  void audit(req, 'WEB_PUSH_SUBSCRIBED', `user:${req.user!.id}`);
  res.status(201).json({ ok: true });
});

/** On logout / when the user turns browser notifications off. */
siteRouter.delete('/push/subscriptions', requireAuth, async (req, res) => {
  const { endpoint } = parse(z.object({ endpoint: z.string().max(1000) }), req.body);
  const { count } = await prisma.webPushSubscription.deleteMany({ where: { endpointHash: endpointHash(endpoint), userId: req.user!.id } });
  res.json({ ok: true, removed: count });
});

const pushTestLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 5 });
siteRouter.post('/push/test', requireAuth, pushTestLimiter, async (req, res) => {
  const t = SITE_TEXTS[siteLocale(req.user!.locale)];
  const result = await sendWebPush([req.user!.id], { title: t.testTitle, body: t.testBody, link: '/', tag: 'test' });
  res.json(result);
});

// ─── Theme (design tokens on top of client/src/index.css) ──────────────

/** Public: the site theme as CSS variables (cached 5 minutes; the client also keeps a copy in localStorage). */
siteRouter.get('/theme', async (_req, res) => {
  const theme = await getSiteTheme();
  const { vars } = deriveTheme(theme);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ theme, vars });
});

const themeUpdateSchema = z.object({
  brandPrimary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  radiusScale: z.enum(['sm', 'md', 'lg']).optional(),
  defaultDensity: z.enum(['comfortable', 'compact']).optional(),
  /** adjust (default): failing colours are corrected and reported; strict: refused with 400 THEME_CONTRAST. */
  mode: z.enum(['adjust', 'strict']).default('adjust'),
});

siteRouter.put('/theme', requireAuth, requireMinRole('SUPER_ADMIN'), async (req, res) => {
  const { mode, ...patch } = parse(themeUpdateSchema, req.body);
  const next = themeSchema.parse({ ...(await getSiteTheme()), ...patch });
  const { issues } = deriveTheme(next);
  if (issues.length && mode === 'strict') {
    res.status(400).json({ error: 'THEME_CONTRAST', issues });
    return;
  }
  for (const i of issues) if (i.adjustedTo) next[i.field] = i.adjustedTo;
  await saveSiteTheme(next);
  void audit(req, 'SITE_THEME_UPDATED', THEME_KEY, next);
  res.json({ theme: next, vars: deriveTheme(next).vars, adjustments: issues });
});

siteRouter.delete('/theme', requireAuth, requireMinRole('SUPER_ADMIN'), async (req, res) => {
  await saveSiteTheme(THEME_DEFAULTS);
  void audit(req, 'SITE_THEME_RESET', THEME_KEY);
  res.json({ theme: THEME_DEFAULTS, vars: deriveTheme(THEME_DEFAULTS).vars });
});

// ─── Public status check ──────────────────────────────────────────────

// Cheap per-IP shield in front of the database lockout (lib/site/publicStatus.ts).
const statusLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 40 });

const sendLocked = (res: Response, minutes: number) => {
  res.setHeader('Retry-After', String(minutes * 60));
  res.status(429).json({ error: 'STATUS_LOCKED', minutes });
};

siteRouter.post('/status/lookup', statusLimiter, async (req, res) => {
  const body = parse(
    z.object({
      caseNumber: z.string().min(3).max(60),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      website: z.string().max(500).optional(),
    }),
    req.body,
  );
  const caseNumber = normaliseCaseNumber(body.caseNumber);
  const ipHash = hashIp(req.ip);
  const minutes = await lockedFor(ipHash, caseNumber);
  if (minutes) return sendLocked(res, minutes);
  // Honeypot: bots get the ordinary "not found" (and it counts as a wrong try).
  const found = body.website ? null : await findByNumberAndBirthDate(caseNumber, body.birthDate);
  await recordAttempt({ caseNumber, ipHash, success: !!found, via: 'DOB' });
  void audit(req, 'PUBLIC_STATUS_LOOKUP', found ? `case:${found.id}` : undefined, { caseNumber, via: 'DOB', ok: !!found, ...(body.website ? { honeypot: true } : {}) });
  if (!found) throw notFound('STATUS_NOT_FOUND');
  res.json({ status: await buildView(found, caseNumber) });
});

siteRouter.post('/status/link', statusLimiter, async (req, res) => {
  const body = parse(z.object({ token: z.string().min(16).max(100), website: z.string().max(500).optional() }), req.body);
  const ipHash = hashIp(req.ip);
  const minutes = await lockedFor(ipHash, null);
  if (minutes) return sendLocked(res, minutes);
  const found = body.website || !/^[A-Za-z0-9_-]+$/.test(body.token) ? null : await findByToken(body.token);
  await recordAttempt({ caseNumber: found?.number ?? '-', ipHash, success: !!found, via: 'LINK' });
  void audit(req, 'PUBLIC_STATUS_LOOKUP', found ? `case:${found.id}` : undefined, { via: 'LINK', ok: !!found });
  if (!found) throw notFound('STATUS_NOT_FOUND');
  res.json({ status: await buildView(found, null) });
});

// The client's own switch (portal → privacy) and the "for my family" link.
const requireClient = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new HttpError(401, req.authFailure ?? 'UNAUTHENTICATED'));
  if (req.user.role !== 'CLIENT') return next(forbidden());
  next();
};

const ownCase = async (req: Request) => {
  const c = await prisma.case.findFirst({ where: { id: String(req.params.caseId), clientId: req.user!.id }, select: { id: true, number: true } });
  if (!c) throw notFound();
  return c;
};

const settingView = (c: { id: string; number: string }, s: { enabled: boolean; tokenHash: string | null; tokenCreatedAt: Date | null } | null) => ({
  caseId: c.id,
  number: c.number,
  enabled: s?.enabled ?? false,
  hasLink: !!s?.tokenHash,
  linkCreatedAt: s?.tokenCreatedAt?.toISOString() ?? null,
});

siteRouter.get('/status/mine', requireClient, async (req, res) => {
  const cases = await prisma.case.findMany({ where: { clientId: req.user!.id }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true } });
  const settings = await prisma.casePublicStatus.findMany({ where: { caseId: { in: cases.map((c) => c.id) } } });
  const byId = new Map(settings.map((s) => [s.caseId, s]));
  res.json({ items: cases.map((c) => settingView(c, byId.get(c.id) ?? null)) });
});

siteRouter.put('/status/mine/:caseId', requireClient, async (req, res) => {
  const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
  const c = await ownCase(req);
  const s = await prisma.casePublicStatus.upsert({
    where: { caseId: c.id },
    create: { caseId: c.id, enabled },
    // Turning it off also invalidates the family link.
    update: enabled ? { enabled } : { enabled, tokenHash: null, tokenCreatedAt: null },
  });
  void audit(req, enabled ? 'PUBLIC_STATUS_ENABLED' : 'PUBLIC_STATUS_DISABLED', `case:${c.id}`);
  res.json({ item: settingView(c, s) });
});

/** Creates (or replaces) the family link; the token is returned once and only its hash is stored. */
siteRouter.post('/status/mine/:caseId/link', requireClient, async (req, res) => {
  const c = await ownCase(req);
  const token = newShareToken();
  const data = { enabled: true, tokenHash: sha256(token), tokenCreatedAt: new Date() };
  const s = await prisma.casePublicStatus.upsert({ where: { caseId: c.id }, create: { caseId: c.id, ...data }, update: data });
  void audit(req, 'PUBLIC_STATUS_LINK_CREATED', `case:${c.id}`);
  res.status(201).json({ item: settingView(c, s), token, path: `/status#k=${token}` });
});

siteRouter.delete('/status/mine/:caseId/link', requireClient, async (req, res) => {
  const c = await ownCase(req);
  const s = await prisma.casePublicStatus.upsert({
    where: { caseId: c.id },
    create: { caseId: c.id, enabled: false },
    update: { tokenHash: null, tokenCreatedAt: null },
  });
  void audit(req, 'PUBLIC_STATUS_LINK_REVOKED', `case:${c.id}`);
  res.json({ item: settingView(c, s) });
});

// ─── Problem reports ──────────────────────────────────────────────────

const problemLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30 });
const problemUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROBLEM_IMAGE_MAX_BYTES, files: 1, fields: 20, fieldSize: 64 * 1024 },
});

siteRouter.post('/problems', problemLimiter, problemUpload.single('image'), async (req, res) => {
  const body = parse(problemInputSchema, req.body ?? {});
  // Honeypot: pretend it worked, store nothing.
  if (body.website) return void res.status(201).json({ ok: true });
  const ipHash = hashIp(req.ip);
  const recent = await prisma.problemReport.count({ where: { ipHash, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= PROBLEM_HOURLY_LIMIT) throw new HttpError(429, 'TOO_MANY_REQUESTS');

  let image: { file: string; mime: string } | null = null;
  if (req.file) {
    if (!PROBLEM_IMAGE_MIME.has(req.file.mimetype)) throw badRequest('UNSUPPORTED_FILE_TYPE');
    image = await storeProblemImage(req.file.buffer);
    if (!image) throw badRequest('INVALID_IMAGE');
  }
  const report = await prisma.problemReport.create({
    data: {
      message: body.message,
      pageUrl: body.pageUrl,
      appVersion: body.appVersion,
      userAgent: body.userAgent ?? ((req.get('user-agent') ?? '').slice(0, 400) || null),
      platform: body.platform,
      screen: body.screen,
      language: body.language,
      consoleErrors: body.consoleErrors.slice(-20).map((s) => s.slice(0, 500)),
      lastApiError: (body.lastApiError ?? undefined) as Prisma.InputJsonValue | undefined,
      userId: req.user?.id ?? null,
      userRole: req.user?.role ?? null,
      contactEmail: req.user ? null : body.email,
      ipHash,
      imageFile: image?.file ?? null,
      imageMime: image?.mime ?? null,
    },
  });
  try {
    await createProblemTask(report);
  } catch (err) {
    console.error('[problems] task failed', err);
  }
  void audit(req, 'PROBLEM_REPORTED', `problem:${report.id}`, { pageUrl: report.pageUrl });
  res.status(201).json({ ok: true, id: report.id });
});

// Admin page "Problem bildirişləri".
const admin = Router();
siteRouter.use('/admin/problems', admin);
admin.use(requireMinRole('STAFF'), async (req, _res, next) => {
  try {
    if (!(await canHandleProblems(req.user))) return next(forbidden());
    next();
  } catch (err) {
    next(err);
  }
});

const STATUSES = ['NEW', 'IN_PROGRESS', 'DONE', 'WONT_FIX'] as const;
const personSelect = { id: true, firstName: true, lastName: true, role: true, email: true, locale: true } satisfies Prisma.UserSelect;
const name = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

admin.get('/settings', requireMinRole('ADMIN'), async (_req, res) => {
  const settings = await getProblemSettings();
  const candidates = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, role: true },
  });
  res.json({ settings, candidates: candidates.map((u) => ({ id: u.id, name: name(u), role: u.role })) });
});

admin.put('/settings', requireMinRole('ADMIN'), async (req, res) => {
  const settings = parse(problemSettingsSchema, req.body);
  if (settings.assigneeId) {
    const u = await prisma.user.findFirst({ where: { id: settings.assigneeId, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true } });
    if (!u) throw badRequest('INVALID_ASSIGNEE');
  }
  await prisma.setting.upsert({ where: { key: PROBLEM_SETTING }, create: { key: PROBLEM_SETTING, value: settings }, update: { value: settings } });
  void audit(req, 'PROBLEM_SETTINGS_UPDATED', PROBLEM_SETTING, settings);
  res.json({ settings });
});

admin.get('/', async (req, res) => {
  const q = parse(
    z.object({ status: z.enum(STATUSES).optional(), q: z.string().max(100).optional(), page: z.coerce.number().int().min(1).max(1000).default(1) }),
    req.query,
  );
  const where: Prisma.ProblemReportWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.q?.trim() ? { OR: [{ message: { contains: q.q.trim() } }, { pageUrl: { contains: q.q.trim() } }] } : {}),
  };
  const PAGE = 50;
  const [rows, total, grouped] = await Promise.all([
    prisma.problemReport.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * PAGE, take: PAGE }),
    prisma.problemReport.count({ where }),
    prisma.problemReport.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId).filter((v): v is string => !!v) } }, select: personSelect });
  const byId = new Map(users.map((u) => [u.id, u]));
  const counts = Object.fromEntries(STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0]));
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      status: r.status,
      message: r.message.slice(0, 300),
      pageUrl: r.pageUrl,
      createdAt: r.createdAt.toISOString(),
      reporter: r.userId ? { id: r.userId, name: name(byId.get(r.userId)), role: r.userRole } : null,
      contactEmail: r.contactEmail,
      hasImage: !!r.imageFile,
      replies: repliesOf(r.replies).length,
    })),
    total,
    page: q.page,
    pageSize: PAGE,
    counts,
  });
});

const loadReport = async (id: string) => {
  const r = await prisma.problemReport.findUnique({ where: { id } });
  if (!r) throw notFound();
  return r;
};

const detail = async (r: Awaited<ReturnType<typeof loadReport>>) => {
  const reporter = r.userId ? await prisma.user.findUnique({ where: { id: r.userId }, select: personSelect }) : null;
  return {
    id: r.id,
    status: r.status,
    message: r.message,
    pageUrl: r.pageUrl,
    appVersion: r.appVersion,
    userAgent: r.userAgent,
    platform: r.platform,
    screen: r.screen,
    language: r.language,
    consoleErrors: Array.isArray(r.consoleErrors) ? r.consoleErrors : [],
    lastApiError: r.lastApiError,
    reporter: reporter ? { id: reporter.id, name: name(reporter), role: reporter.role, email: reporter.email } : r.userId ? { id: r.userId, name: '', role: r.userRole, email: null } : null,
    contactEmail: r.contactEmail,
    hasImage: !!r.imageFile,
    task: await taskRef(r.taskId),
    replies: repliesOf(r.replies),
    internalNote: r.internalNote,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
};

admin.get('/:id', async (req, res) => {
  res.json({ report: await detail(await loadReport(String(req.params.id))) });
});

admin.get('/:id/image', async (req, res) => {
  const r = await loadReport(String(req.params.id));
  if (!r.imageFile || !/^[0-9a-f-]+\.jpg$/.test(r.imageFile)) throw notFound();
  const file = path.join(PROBLEM_DIR(), r.imageFile);
  if (!fs.existsSync(file)) throw notFound();
  res.setHeader('Content-Type', r.imageMime ?? 'image/jpeg');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(file).pipe(res);
});

admin.patch('/:id', async (req, res) => {
  const body = parse(z.object({ status: z.enum(STATUSES).optional(), internalNote: z.string().max(5000).nullable().optional() }), req.body);
  const r = await loadReport(String(req.params.id));
  const closing = body.status === 'DONE' || body.status === 'WONT_FIX';
  const updated = await prisma.problemReport.update({
    where: { id: r.id },
    data: {
      ...(body.status ? { status: body.status, resolvedAt: closing ? (r.resolvedAt ?? new Date()) : null } : {}),
      ...(body.internalNote !== undefined ? { internalNote: body.internalNote?.trim() || null } : {}),
    },
  });
  // Closing the report closes its team task too (still open ones only).
  if (closing && r.taskId) {
    await prisma.task.updateMany({
      where: { id: r.taskId, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] } },
      data: { status: body.status === 'DONE' ? 'DONE' : 'CANCELLED', completedAt: new Date() },
    });
  }
  if (body.status && body.status !== r.status) void audit(req, 'PROBLEM_STATUS_CHANGED', `problem:${r.id}`, { from: r.status, to: body.status });
  res.json({ report: await detail(updated) });
});

admin.post('/:id/reply', async (req, res) => {
  const { message } = parse(z.object({ message: z.string().trim().min(2).max(4000) }), req.body);
  const r = await loadReport(String(req.params.id));
  const reporter = r.userId ? await prisma.user.findUnique({ where: { id: r.userId }, select: { ...personSelect, isActive: true } }) : null;
  let channel: ProblemReply['channel'];
  if (reporter?.isActive) {
    const t = SITE_TEXTS[siteLocale(reporter.locale)];
    await notifyUser(reporter.id, {
      type: 'PROBLEM_REPLY',
      title: t.replyTitle,
      body: `${t.replyIntro}\n\n${message}\n\n${t.replyQuote}: «${r.message.slice(0, 300)}»`,
      forceEmail: true,
    });
    channel = 'IN_APP';
  } else if (r.contactEmail) {
    const t = SITE_TEXTS[siteLocale(r.language)];
    void sendMail(r.contactEmail, `Triad Vision · ${t.replyTitle}`, renderEmail(t.replyTitle, `${t.replyIntro}\n\n${message}\n\n${t.replyQuote}: «${r.message.slice(0, 300)}»`));
    channel = 'EMAIL';
  } else {
    throw new HttpError(409, 'NO_CONTACT');
  }
  const reply: ProblemReply = { at: new Date().toISOString(), byId: req.user!.id, byName: name(req.user), message, channel };
  const updated = await prisma.problemReport.update({
    where: { id: r.id },
    data: { replies: [...repliesOf(r.replies), reply] as unknown as Prisma.InputJsonValue, ...(r.status === 'NEW' ? { status: 'IN_PROGRESS' } : {}) },
  });
  void audit(req, 'PROBLEM_REPLIED', `problem:${r.id}`, { channel });
  res.json({ report: await detail(updated) });
});
