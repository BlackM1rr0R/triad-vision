import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, HttpError, limiter, notFound, parse } from '../lib/http.js';
import { getRetentionSettings } from '../lib/legalSettings.js';
import { notifyUser } from '../lib/notifications.js';
import { renderEmail, sendMail } from '../lib/mailer.js';
import { effectiveConsents, recordConsent, TOGGLE_TYPES, type ToggleType } from '../lib/privacy/consents.js';
import { ACCEPT_KINDS, CONSENT_TYPE_FOR_KIND, currentRef } from '../lib/legal/documents.js';
import { buildUserExport, exportFilename } from '../lib/privacy/export.js';
import { dataOverview, dueFrom, notifyAdminsNewRequest, notifyRequestReceived, OPEN_STATUSES } from '../lib/privacy/requests.js';
import { exportedText } from '../lib/privacy/texts.js';

/**
 * Privacy centre (DSGVO / GDPR) for every signed-in portal user, plus one public form for people
 * without an account.
 *
 *   GET  /                      consents, consent history, own requests, data overview, policy, retention
 *   PUT  /consents              switch MARKETING_EMAIL / WHATSAPP / SMS / EMPLOYER_SHARING (append-only log)
 *   POST /requests              Art. 16 / 17 / 18 / 21 request (one open per type; deletion needs the password)
 *   POST /requests/:id/cancel   own, OPEN only
 *   GET  /export                Art. 15 / 20 self-service download (recorded as a completed EXPORT request)
 *   POST /public-request        no account: rate-limited, honeypot, identity is verified by an admin
 */
export const privacyRouter = Router();

// ─── Public form (before requireAuth) ──────────────────────────────────

const publicLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 3 });

privacyRouter.post('/public-request', publicLimiter, async (req, res) => {
  const body = parse(
    z.object({
      email: z.string().trim().toLowerCase().email().max(200),
      type: z.enum(['EXPORT', 'DELETION', 'RECTIFICATION', 'RESTRICTION', 'OBJECTION']),
      message: z.string().trim().min(5).max(3000),
      // honeypot: real people never fill this hidden field
      website: z.string().max(200).optional(),
    }),
    req.body ?? {},
  );
  if (body.website) {
    // A bot filled the hidden field: answer like a success so it learns nothing.
    res.status(201).json({ ok: true });
    return;
  }
  const r = await prisma.privacyRequest.create({
    data: { email: body.email, type: body.type, message: body.message, dueAt: dueFrom() },
  });
  await audit(req, 'PRIVACY_REQUEST_PUBLIC', `privacy-request:${r.id}`, { type: r.type, email: r.email });
  await notifyAdminsNewRequest(r, { public: true });
  await notifyRequestReceived(r);
  res.status(201).json({ ok: true });
});

privacyRouter.use(requireAuth);

// ─── Overview ──────────────────────────────────────────────────────────

const requestSelect = {
  id: true,
  type: true,
  status: true,
  message: true,
  decisionNote: true,
  dueAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const loadState = async (userId: string) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, whatsappOptIn: true, smsNotifications: true, emailNotifications: true, phone: true },
  });
  const [consents, history, requests, overview, retention] = await Promise.all([
    effectiveConsents(user),
    prisma.consentRecord.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: { id: true, type: true, granted: true, version: true, source: true, legalDocumentId: true, createdAt: true },
    }),
    prisma.privacyRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: requestSelect }),
    dataOverview(userId),
    getRetentionSettings(),
  ]);
  // Current AGB / privacy version and the version this user last accepted (versioned legal texts).
  const legal = await Promise.all(
    ACCEPT_KINDS.map(async (kind) => {
      const current = await currentRef(kind);
      const last = history.find((h) => h.type === CONSENT_TYPE_FOR_KIND[kind] && h.granted);
      return { kind, current, accepted: last ? { version: last.version, legalDocumentId: last.legalDocumentId, at: last.createdAt } : null };
    }),
  );
  return {
    policyVersion: legal.find((l) => l.kind === 'PRIVACY')!.current.version,
    legal,
    retention: { months: retention.months, includeMessages: retention.includeMessages },
    consents,
    history,
    requests,
    overview,
    // Service email (case updates, security notices) is a setting, not a consent: shown for context.
    emailNotifications: user.emailNotifications,
    hasPhone: !!user.phone,
  };
};

privacyRouter.get('/', async (req, res) => {
  res.json(await loadState(req.user!.id));
});

// ─── Consents ──────────────────────────────────────────────────────────

const consentsSchema = z
  .object({
    MARKETING_EMAIL: z.boolean().optional(),
    WHATSAPP: z.boolean().optional(),
    SMS: z.boolean().optional(),
    EMPLOYER_SHARING: z.boolean().optional(),
  })
  .strict();

/**
 * Appends one log row per value that actually changed. WHATSAPP / SMS also update the settings
 * fields the senders read. MARKETING_EMAIL is consent-only: it does not touch `emailNotifications`,
 * which governs service mail about the user's own case (not advertising).
 */
privacyRouter.put('/consents', async (req, res) => {
  const body = parse(consentsSchema, req.body ?? {});
  const userId = req.user!.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, whatsappOptIn: true, smsNotifications: true } });
  const current = await effectiveConsents(user);
  const changed: { type: ToggleType; granted: boolean }[] = [];
  for (const type of TOGGLE_TYPES) {
    const next = body[type];
    if (next === undefined || current[type].granted === next) continue;
    changed.push({ type, granted: next });
  }
  const fields: { whatsappOptIn?: boolean; smsNotifications?: boolean; marketingOptIn?: boolean; marketingOptInAt?: Date; marketingOptInSource?: string } = {};
  for (const c of changed) {
    if (c.type === 'WHATSAPP') fields.whatsappOptIn = c.granted;
    if (c.type === 'SMS') fields.smsNotifications = c.granted;
    // Campaigns read the marketing consent from the user row (kept in sync with the log).
    if (c.type === 'MARKETING_EMAIL') Object.assign(fields, { marketingOptIn: c.granted, marketingOptInAt: new Date(), marketingOptInSource: 'PRIVACY_CENTER' });
  }
  if (Object.keys(fields).length) await prisma.user.update({ where: { id: userId }, data: fields });
  for (const c of changed) await recordConsent({ userId, email: user.email, type: c.type, granted: c.granted, source: 'PRIVACY_CENTER', req });
  if (changed.length) await audit(req, 'CONSENTS_CHANGED', `user:${userId}`, { changed });
  res.json({ changed: changed.length, ...(await loadState(userId)) });
});

// ─── Requests ──────────────────────────────────────────────────────────

const requestLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10, keyGenerator: (req) => req.user?.id ?? 'anonymous', skip: () => config.isTest });

privacyRouter.post('/requests', requestLimiter, async (req, res) => {
  const body = parse(
    z.object({
      type: z.enum(['DELETION', 'RECTIFICATION', 'RESTRICTION', 'OBJECTION']),
      message: z.string().trim().max(3000).optional(),
      currentPassword: z.string().max(200).optional(),
    }),
    req.body ?? {},
  );
  const userId = req.user!.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, passwordHash: true } });
  if (body.type === 'RECTIFICATION' && (body.message ?? '').length < 5) throw badRequest('MESSAGE_REQUIRED');
  if (body.type === 'DELETION') {
    if (!body.currentPassword) throw badRequest('PASSWORD_REQUIRED');
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) throw new HttpError(400, 'WRONG_PASSWORD');
  }
  const open = await prisma.privacyRequest.findFirst({ where: { userId, type: body.type, status: { in: [...OPEN_STATUSES] } } });
  if (open) throw conflict('REQUEST_ALREADY_OPEN');

  const r = await prisma.privacyRequest.create({
    data: { userId, email: user.email, type: body.type, message: body.message || null, dueAt: dueFrom() },
  });
  await audit(req, 'PRIVACY_REQUEST_CREATED', `privacy-request:${r.id}`, { type: r.type });
  await notifyAdminsNewRequest(r);
  await notifyRequestReceived(r);
  const { userId: _u, email: _e, handledById: _h, ...item } = r;
  res.status(201).json({ item });
});

privacyRouter.post('/requests/:id/cancel', async (req, res) => {
  const r = await prisma.privacyRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!r || r.userId !== req.user!.id) throw notFound('REQUEST_NOT_FOUND');
  if (r.status !== 'OPEN') throw conflict('REQUEST_NOT_CANCELLABLE');
  const item = await prisma.privacyRequest.update({ where: { id: r.id }, data: { status: 'CANCELLED', completedAt: new Date() }, select: requestSelect });
  await audit(req, 'PRIVACY_REQUEST_CANCELLED', `privacy-request:${r.id}`, { type: r.type });
  res.json({ item });
});

// ─── Self-service export ───────────────────────────────────────────────

privacyRouter.get('/export', async (req, res) => {
  const userId = req.user!.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, locale: true } });
  const now = new Date();
  // Fulfilled instantly: kept as proof that the Art. 15 / 20 request was answered.
  const r = await prisma.privacyRequest.create({
    data: { userId, email: user.email, type: 'EXPORT', status: 'COMPLETED', dueAt: dueFrom(now), completedAt: now, decisionNote: 'Self-service download' },
  });
  const data = await buildUserExport(userId);
  await audit(req, 'PRIVACY_EXPORT', `privacy-request:${r.id}`);
  const texts = exportedText(user.locale);
  await notifyUser(userId, { type: 'PRIVACY_EXPORT', title: texts.title, body: texts.body, link: '/account/privacy', email: false });
  void sendMail(user.email, `Triad Vision · ${texts.title}`, renderEmail(texts.title, texts.body));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename()}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(data, null, 2));
});
