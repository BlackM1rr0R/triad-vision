import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireRole } from '../middleware/auth.js';
import { forbidden, limiter, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { metaOf } from '../lib/esign/http.js';
import {
  OPEN_STATUSES,
  TOKEN_RE,
  acceptQuote,
  customerView,
  declineQuote,
  expireIfDue,
  loadQuote,
  markViewed,
  pdfName,
  renderQuotePdf,
  sha256,
  type QuoteWithCompany,
} from '../lib/quotes/service.js';

/**
 * Quotes on the employer side:
 *  - /api/angebot/:token/*      public, for the secret e-mail link (no account needed)
 *  - /api/company/quotes/*      the signed-in employer, own company only
 * Both show the same document and offer the same accept / decline actions.
 */

const acceptBody = z.object({ name: z.string().trim().min(2).max(160), confirm: z.literal(true) });
const declineBody = z.object({ reason: z.string().trim().min(3).max(1000) });

const sendPdf = async (res: Response, q: QuoteWithCompany, inline: boolean) => {
  const pdf = await renderQuotePdf(q);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${pdfName(q)}"`);
  res.send(pdf);
};

// ─── Public link ─────────────────────────────────────────────────────

export const quotePublicRouter = Router();
quotePublicRouter.use(limiter({ windowMs: 60 * 1000, limit: 60, skip: () => config.isTest }));
quotePublicRouter.use((_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

/** The quote of a link token, or 404 (never reveals whether a quote exists). Drafts have no link. */
const byToken = async (token: string) => {
  if (!TOKEN_RE.test(token)) throw notFound('QUOTE_LINK_INVALID');
  const q = await prisma.quote.findUnique({ where: { tokenHash: sha256(token) }, include: { company: true } });
  if (!q || q.status === 'DRAFT') throw notFound('QUOTE_LINK_INVALID');
  return q;
};

const linkMeta = (req: Request, actorName?: string) => ({ ...metaOf(req), actorName: actorName ?? null, meta: { via: 'link' } });

quotePublicRouter.get('/:token', async (req, res) => {
  let q = await byToken(String(req.params.token));
  await expireIfDue(q);
  await markViewed(q, linkMeta(req));
  q = await loadQuote(q.id);
  res.json({ quote: await customerView(q) });
});

quotePublicRouter.get('/:token/pdf', async (req, res) => {
  const q = await byToken(String(req.params.token));
  await sendPdf(res, q, req.query.inline === '1');
});

quotePublicRouter.post('/:token/accept', async (req, res) => {
  const body = parse(acceptBody, req.body);
  const q = await byToken(String(req.params.token));
  const fresh = await acceptQuote(q, body.name, linkMeta(req, body.name));
  await audit(req, 'QUOTE_ACCEPT', q.id, { number: q.number, name: body.name, via: 'link', userAgent: req.get('user-agent')?.slice(0, 300) ?? null });
  res.json({ quote: await customerView(fresh) });
});

quotePublicRouter.post('/:token/decline', async (req, res) => {
  const body = parse(declineBody, req.body);
  const q = await byToken(String(req.params.token));
  const fresh = await declineQuote(q, body.reason, linkMeta(req));
  await audit(req, 'QUOTE_DECLINE', q.id, { number: q.number, via: 'link' });
  res.json({ quote: await customerView(fresh) });
});

// ─── Employer portal ─────────────────────────────────────────────────

export const companyQuotesRouter = Router();
companyQuotesRouter.use(requireRole('COMPANY'));

const companyOf = async (req: Request) => {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true, company: { select: { id: true, status: true } } } });
  if (!u?.company) throw forbidden('NO_COMPANY');
  if (u.company.status === 'SUSPENDED') throw forbidden('COMPANY_SUSPENDED');
  return { companyId: u.company.id, userName: `${u.firstName} ${u.lastName}`.trim() };
};

/** Another company's quote (or a draft) answers exactly like a missing one. */
const ownQuote = async (req: Request) => {
  const { companyId, userName } = await companyOf(req);
  const q = await prisma.quote.findUnique({ where: { id: String(req.params.id) }, include: { company: true } });
  if (!q || q.companyId !== companyId || q.status === 'DRAFT') throw notFound('QUOTE_NOT_FOUND');
  return { q, userName };
};

const portalMeta = (req: Request, userName: string) => ({ ...metaOf(req), actorId: req.user!.id, actorName: userName, meta: { via: 'portal' } });

companyQuotesRouter.get('/', async (req, res) => {
  const { companyId } = await companyOf(req);
  const quotes = await prisma.quote.findMany({ where: { companyId, status: { not: 'DRAFT' } }, orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }], take: 300 });
  const now = Date.now();
  res.json({
    quotes: quotes.map((q) => {
      const expired = q.status === 'EXPIRED' || (OPEN_STATUSES.includes(q.status) && q.validUntil.getTime() + 12 * 3600_000 < now);
      return {
        id: q.id,
        number: q.number,
        title: q.title,
        status: expired ? 'EXPIRED' : q.status,
        sentAt: q.sentAt,
        validUntil: q.validUntil,
        netCents: q.netCents,
        grossCents: q.grossCents,
        currency: q.currency,
        acceptedAt: q.acceptedAt,
        declinedAt: q.declinedAt,
      };
    }),
  });
});

companyQuotesRouter.get('/:id', async (req, res) => {
  const { q, userName } = await ownQuote(req);
  await expireIfDue(q);
  await markViewed(q, portalMeta(req, userName));
  res.json({ quote: { id: q.id, ...(await customerView(await loadQuote(q.id))) } });
});

companyQuotesRouter.get('/:id/pdf', async (req, res) => {
  const { q } = await ownQuote(req);
  await sendPdf(res, q, false);
});

companyQuotesRouter.post('/:id/accept', async (req, res) => {
  const body = parse(acceptBody, req.body);
  const { q, userName } = await ownQuote(req);
  const fresh = await acceptQuote(q, body.name, portalMeta(req, userName));
  await audit(req, 'QUOTE_ACCEPT', q.id, { number: q.number, name: body.name, via: 'portal' });
  res.json({ quote: { id: fresh.id, ...(await customerView(fresh)) } });
});

companyQuotesRouter.post('/:id/decline', async (req, res) => {
  const body = parse(declineBody, req.body);
  const { q, userName } = await ownQuote(req);
  const fresh = await declineQuote(q, body.reason, portalMeta(req, userName));
  await audit(req, 'QUOTE_DECLINE', q.id, { number: q.number, via: 'portal' });
  res.json({ quote: { id: fresh.id, ...(await customerView(fresh)) } });
});
