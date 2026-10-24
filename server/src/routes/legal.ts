import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { hasMinRole, requireAuth } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, limiter, notFound, parse } from '../lib/http.js';
import { recordConsent } from '../lib/privacy/consents.js';
import {
  ACCEPT_KINDS,
  CONSENT_TYPE_FOR_KIND,
  currentDocument,
  currentRef,
  fallbackContent,
  LEGAL_KINDS,
  pendingAcceptances,
  publicDocument,
  type LegalKind,
} from '../lib/legal/documents.js';

/**
 * Versioned legal texts and cookie consent — mounted at /api/legal.
 *
 *   GET  /me/pending                 signed in: current versions still to accept (+ whether it blocks the portal)
 *   POST /me/accept                  { ids } → TERMS / PRIVACY_POLICY consent for those versions (source REACCEPT)
 *   POST /cookie-consent             public, rate-limited: { analytics, marketing, visitorId?, source? } → COOKIES consent log
 *   GET  /:kind                      public: current version (or the built-in fallback, `fallback: true`)
 *   GET  /:kind/versions             public: published + archived versions (archive list, no bodies)
 *   GET  /:kind/versions/:version    public: one published / archived version with its text
 */
export const legalRouter = Router();

const kindParam = z.string().transform((v) => v.toUpperCase()).pipe(z.enum(LEGAL_KINDS));

// ─── Signed-in user: re-acceptance ─────────────────────────────────────

/** Portal users (clients, employers, agents) are blocked until they accept; staff only see a banner. */
const blocksFor = (role: Parameters<typeof hasMinRole>[0]) => !hasMinRole(role, 'STAFF');

legalRouter.get('/me/pending', requireAuth, async (req, res) => {
  const pending = await pendingAcceptances(req.user!.id);
  res.json({ pending, blocking: pending.length > 0 && blocksFor(req.user!.role) });
});

legalRouter.post('/me/accept', requireAuth, async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(ACCEPT_KINDS.length) }), req.body ?? {});
  const userId = req.user!.id;
  const pending = await pendingAcceptances(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const accepted: { kind: LegalKind; version: string }[] = [];
  for (const p of pending) {
    if (!ids.includes(p.id)) continue;
    await recordConsent({ userId, email: user.email, type: CONSENT_TYPE_FOR_KIND[p.kind], granted: true, source: 'REACCEPT', version: p.version, legalDocumentId: p.id, req });
    accepted.push({ kind: p.kind, version: p.version });
  }
  if (accepted.length) await audit(req, 'LEGAL_ACCEPTED', `user:${userId}`, { accepted });
  const left = await pendingAcceptances(userId);
  res.json({ accepted, pending: left, blocking: left.length > 0 && blocksFor(req.user!.role) });
});

// ─── Cookie consent (public) ───────────────────────────────────────────

const cookieLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30, skip: () => config.isTest });

legalRouter.post('/cookie-consent', cookieLimiter, async (req, res) => {
  const body = parse(
    z.object({
      analytics: z.boolean(),
      marketing: z.boolean(),
      // Random id the browser keeps in localStorage (only for visitors without an account).
      visitorId: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/).optional(),
      // Banner (first choice) or the settings dialog opened from the footer.
      source: z.enum(['COOKIE_BANNER', 'COOKIE_SETTINGS']).optional(),
    }),
    req.body ?? {},
  );
  const userId = req.user?.id ?? null;
  if (!userId && !body.visitorId) throw badRequest('VISITOR_ID_REQUIRED');
  const ref = await currentRef('COOKIES');
  const email = userId ? ((await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email ?? null) : null;
  const common = { userId, email, source: body.source ?? 'COOKIE_BANNER', version: ref.version, legalDocumentId: ref.id, visitorId: userId ? null : body.visitorId, req };
  await recordConsent({ ...common, type: 'COOKIES', granted: body.analytics || body.marketing });
  await recordConsent({ ...common, type: 'COOKIES_ANALYTICS', granted: body.analytics });
  await recordConsent({ ...common, type: 'COOKIES_MARKETING', granted: body.marketing });
  res.status(201).json({ ok: true, version: ref.version });
});

// ─── Public texts ──────────────────────────────────────────────────────

legalRouter.get('/:kind', async (req, res) => {
  const kind = parse(kindParam, req.params.kind);
  const doc = await currentDocument(kind);
  res.setHeader('Cache-Control', 'public, max-age=60');
  if (doc) {
    res.json({ document: publicDocument(doc), fallback: false });
    return;
  }
  const ref = await currentRef(kind);
  const content = await fallbackContent(kind);
  res.json({
    document: { id: null, kind, version: ref.version, title: content.title, body: content.body, changeSummary: null, requiresReacceptance: false, status: 'PUBLISHED', publishedAt: null, effectiveAt: null },
    fallback: true,
  });
});

legalRouter.get('/:kind/versions', async (req, res) => {
  const kind = parse(kindParam, req.params.kind);
  const items = await prisma.legalDocument.findMany({
    where: { kind, status: { in: ['PUBLISHED', 'ARCHIVED'] } },
    orderBy: { publishedAt: 'desc' },
    select: { id: true, version: true, title: true, status: true, publishedAt: true, effectiveAt: true, changeSummary: true },
  });
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ items });
});

legalRouter.get('/:kind/versions/:version', async (req, res) => {
  const kind = parse(kindParam, req.params.kind);
  const version = parse(z.string().trim().min(1).max(40), req.params.version);
  const doc = await prisma.legalDocument.findFirst({ where: { kind, version, status: { in: ['PUBLISHED', 'ARCHIVED'] } } });
  if (!doc) throw notFound('LEGAL_DOCUMENT_NOT_FOUND');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ document: publicDocument(doc) });
});
