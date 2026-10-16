import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { conflict, HttpError, limiter, notFound, parse } from '../lib/http.js';
import { renderEmail, sendMail } from '../lib/mailer.js';
import {
  TOKEN_RE,
  currentTurn,
  declineAsSigner,
  expireIfDue,
  logEvent,
  markViewed,
  sha256,
  signAsSigner,
  signerView,
} from '../lib/esign/service.js';
import { issueSignOtp, maskEmail, signSessionValid, verifySignOtp, SIGN_SESSION_TTL_MS } from '../lib/esign/otp.js';
import { esignText } from '../lib/esign/texts.js';
import { metaOf, sendPdf } from '../lib/esign/http.js';

/**
 * Signing endpoints for the parties:
 *  - /api/sign/:token/*   public, for the personal email link (identity confirmed with an emailed code)
 *  - /api/signatures/*    portal users (candidate, employer, staff) signing from their account
 * Signers only ever see names and statuses of the other parties, never their emails or IPs.
 */

const signBody = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('DRAW'), signature: z.string().max(1_500_000), agree: z.literal(true) }),
  z.object({ mode: z.literal('TYPE'), typedName: z.string().trim().min(2).max(160), agree: z.literal(true) }),
]);
const declineBody = z.object({ reason: z.string().trim().min(3).max(1000) });

const sessionCookie = 'tv_sign';
const cookiePath = (token: string) => `/api/sign/${token}`;

// ─── Public: personal link ─────────────────────────────────────────────

export const signRouter = Router();

// Per-IP ceilings on top of the per-signer code limits (tests drive one app from one address).
signRouter.use(limiter({ windowMs: 60 * 1000, limit: 60, skip: () => config.isTest }));
const otpLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 10, skip: () => config.isTest });

/** Resolves the signer of a link token, or 404 (never reveals whether a request exists). */
const signerByToken = async (token: string) => {
  if (!TOKEN_RE.test(token)) throw notFound('SIGN_LINK_INVALID');
  const s = await prisma.signatureSigner.findUnique({ where: { tokenHash: sha256(token) } });
  if (!s) throw notFound('SIGN_LINK_INVALID');
  const r = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: s.requestId }, select: { id: true, status: true, expiresAt: true } });
  // The link lives as long as the request runs (and stays usable to fetch the signed copy afterwards).
  if (r.status === 'DRAFT') throw notFound('SIGN_LINK_INVALID');
  return { s, r };
};

const verified = (req: Request, s: Parameters<typeof signSessionValid>[0]) => signSessionValid(s, req.cookies?.[sessionCookie] as string | undefined);

const requireVerified = (req: Request, s: Parameters<typeof signSessionValid>[0]) => {
  if (!verified(req, s)) throw new HttpError(403, 'IDENTITY_NOT_VERIFIED');
};

/** Before the code is confirmed the link only reveals what the email already said. */
const limitedView = (v: Awaited<ReturnType<typeof signerView>>) => ({
  request: {
    id: v.request.id,
    title: v.request.title,
    status: v.request.status,
    expiresAt: v.request.expiresAt,
    sender: v.request.sender,
    pages: v.request.pages,
    hasFinal: v.request.hasFinal,
    message: null,
    order: v.request.order,
    completedAt: v.request.completedAt,
    originalName: null,
    originalSha256: null,
    finalSha256: null,
    case: null,
    company: null,
  },
  me: { ...v.me, declinedReason: null },
  signers: [],
  auth: v.auth,
});

signRouter.get('/:token', async (req, res) => {
  const { s } = await signerByToken(String(req.params.token));
  const isVerified = verified(req, s);
  if (isVerified) await markViewed(s.id, metaOf(req));
  const view = await signerView(s.id, { method: 'token', verified: isVerified });
  res.json(isVerified ? view : limitedView(view));
});

signRouter.post('/:token/otp', otpLimiter, async (req, res) => {
  const { s, r } = await signerByToken(String(req.params.token));
  await expireIfDue(r);
  const fresh = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: r.id }, select: { status: true, title: true } });
  if (fresh.status !== 'SENT' && fresh.status !== 'COMPLETED') throw conflict('REQUEST_NOT_ACTIVE');
  const issued = await issueSignOtp(s);
  if (!issued.ok) {
    res.status(429).json({ error: issued.error, retryAfter: issued.retryAfter });
    return;
  }
  const t = esignText(s.locale);
  // The code is only in the body; the subject goes to the EmailLog.
  void sendMail(s.email, t.otpSubject, renderEmail(t.otpTitle, t.otpBody(issued.code, fresh.title)));
  await logEvent(r.id, 'OTP_SENT', { ...metaOf(req), signerId: s.id });
  res.json({ ok: true, email: maskEmail(s.email), retryAfter: issued.retryAfter });
});

signRouter.post('/:token/otp/verify', otpLimiter, async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().max(12) }), req.body);
  const token = String(req.params.token);
  const { s, r } = await signerByToken(token);
  const result = await verifySignOtp(s.id, code.replace(/\s/g, ''));
  if (!result.ok) {
    res.status(400).json({ error: result.reason, attemptsLeft: result.attemptsLeft });
    return;
  }
  await logEvent(r.id, 'OTP_VERIFIED', { ...metaOf(req), signerId: s.id });
  res.cookie(sessionCookie, result.session, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProd,
    path: cookiePath(token),
    maxAge: SIGN_SESSION_TTL_MS,
  });
  await markViewed(s.id, metaOf(req));
  res.json(await signerView(s.id, { method: 'token', verified: true }));
});

/** The PDF: the original while signing, the final copy once completed. Needs the confirmed identity. */
signRouter.get('/:token/document', async (req, res) => {
  const { s } = await signerByToken(String(req.params.token));
  requireVerified(req, s);
  await serveSignerDocument(req, res, s.id, s.requestId);
});

signRouter.post('/:token/sign', async (req, res) => {
  const body = parse(signBody, req.body);
  const { s } = await signerByToken(String(req.params.token));
  requireVerified(req, s);
  await signAsSigner(s.id, body.mode === 'DRAW' ? { mode: 'DRAW', signature: body.signature } : { mode: 'TYPE', typedName: body.typedName }, 'EMAIL_OTP', metaOf(req));
  res.json(await signerView(s.id, { method: 'token', verified: true }));
});

signRouter.post('/:token/decline', async (req, res) => {
  const { reason } = parse(declineBody, req.body);
  const { s } = await signerByToken(String(req.params.token));
  requireVerified(req, s);
  await declineAsSigner(s.id, reason, 'EMAIL_OTP', metaOf(req));
  res.json(await signerView(s.id, { method: 'token', verified: true }));
});

const serveSignerDocument = async (req: Request, res: Response, signerId: string, requestId: string) => {
  const r = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: requestId } });
  const useFinal = r.status === 'COMPLETED' && !!r.finalKey;
  if (!useFinal && r.status !== 'SENT') throw conflict('REQUEST_NOT_ACTIVE');
  await logEvent(r.id, 'DOWNLOADED', { ...metaOf(req), signerId, note: useFinal ? 'final' : 'original' });
  const base = r.originalName.replace(/\.pdf$/i, '');
  sendPdf(res, useFinal ? r.finalKey! : r.originalKey, useFinal ? `${base}-signed.pdf` : r.originalName, !!req.query.download);
};

// ─── Portal: signing from the account ──────────────────────────────────

export const signaturesRouter = Router();
signaturesRouter.use(requireAuth);

/** The caller's own signer row, or 404 (other people's requests are invisible). */
const ownSigner = async (req: Request) => {
  const s = await prisma.signatureSigner.findUnique({ where: { id: String(req.params.signerId) } });
  if (!s || !s.userId || s.userId !== req.user!.id) throw notFound('SIGNER_NOT_FOUND');
  const r = await prisma.signatureRequest.findUniqueOrThrow({ where: { id: s.requestId }, select: { status: true } });
  if (r.status === 'DRAFT') throw notFound('SIGNER_NOT_FOUND');
  return s;
};

/** Requests where the caller is a party ("Documents to sign" / "Contracts to sign"). */
signaturesRouter.get('/my', async (req, res) => {
  const q = parse(z.object({ caseId: z.string().max(40).optional() }), req.query);
  const rows = await prisma.signatureSigner.findMany({
    where: { userId: req.user!.id, request: { status: { not: 'DRAFT' }, ...(q.caseId ? { caseId: q.caseId } : {}) } },
    include: {
      request: {
        include: {
          signers: { select: { id: true, name: true, role: true, order: true, status: true, signedAt: true } },
          case: { select: { id: true, number: true } },
          company: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const now = new Date();
  res.json({
    items: rows.map((s) => {
      const r = s.request;
      const status = r.status === 'SENT' && r.expiresAt && r.expiresAt <= now ? 'EXPIRED' : r.status;
      return {
        signerId: s.id,
        requestId: r.id,
        title: r.title,
        status,
        myStatus: s.status,
        myTurn: status === 'SENT' && currentTurn(r.signers, r.order).some((x) => x.id === s.id),
        expiresAt: r.expiresAt,
        sentAt: r.sentAt,
        completedAt: r.completedAt,
        case: r.case,
        company: r.company,
        signers: [...r.signers].sort((a, b) => a.order - b.order).map((x) => ({ name: x.name, role: x.role, status: x.status, signedAt: x.signedAt, isMe: x.id === s.id })),
      };
    }),
  });
});

signaturesRouter.get('/my/:signerId', async (req, res) => {
  const s = await ownSigner(req);
  await markViewed(s.id, metaOf(req));
  res.json(await signerView(s.id, { method: 'portal', verified: true }));
});

signaturesRouter.get('/my/:signerId/document', async (req, res) => {
  const s = await ownSigner(req);
  await serveSignerDocument(req, res, s.id, s.requestId);
});

signaturesRouter.post('/my/:signerId/sign', async (req, res) => {
  const body = parse(signBody, req.body);
  const s = await ownSigner(req);
  await signAsSigner(s.id, body.mode === 'DRAW' ? { mode: 'DRAW', signature: body.signature } : { mode: 'TYPE', typedName: body.typedName }, 'PORTAL', metaOf(req));
  res.json(await signerView(s.id, { method: 'portal', verified: true }));
});

signaturesRouter.post('/my/:signerId/decline', async (req, res) => {
  const { reason } = parse(declineBody, req.body);
  const s = await ownSigner(req);
  await declineAsSigner(s.id, reason, 'PORTAL', metaOf(req));
  res.json(await signerView(s.id, { method: 'portal', verified: true }));
});
