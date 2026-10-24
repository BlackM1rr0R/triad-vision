import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { limiter, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { buildCvPdf } from '../lib/cv/load.js';
import { attachmentHeader } from '../lib/cv/pdf.js';
import { CV_LANGS } from '../lib/cv/schema.js';
import { sendIntroVideo } from '../lib/placement/introVideo.js';
import { SHARE_DECISIONS, cvShared, decideShareLink, markShareViewed, publicShareView, resolveShareLink } from '../lib/placement/shareLinks.js';

/**
 * Public side of employer share links (/api/candidate-share/:token), no account needed:
 *
 *   GET  /:token            anonymised profile, match, document status, video / CV availability, decision
 *   GET  /:token/cv.pdf     anonymised CV (only when the candidate shares the CV with employers)
 *   GET  /:token/video      the intro video (range requests for seeking)
 *   POST /:token/decision   { decision: INTERESTED | REJECTED, name, note? } — once per link
 *
 * Unknown, revoked and expired links all answer 404. Never indexed. Design: lib/placement/shareLinks.ts.
 */
export const candidateShareRouter = Router();

candidateShareRouter.use(limiter({ windowMs: 60 * 1000, limit: 60, skip: () => config.isTest }));
candidateShareRouter.use((_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
const decisionLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 10, skip: () => config.isTest });

const token = (req: Request) => String(req.params.token ?? '');

candidateShareRouter.get('/:token', async (req, res) => {
  const r = await resolveShareLink(token(req));
  await markShareViewed(r.link.id);
  res.json({ share: await publicShareView(r) });
});

candidateShareRouter.get('/:token/cv.pdf', async (req, res) => {
  const q = parse(z.object({ lang: z.enum(CV_LANGS).default('de'), inline: z.enum(['0', '1']).optional() }), req.query);
  const r = await resolveShareLink(token(req));
  if (!(await cvShared(r.candidate.id))) throw notFound('CV_NOT_SHARED');
  const out = await buildCvPdf(r.candidate.id, { lang: q.lang, anonymised: true });
  if (!out) throw notFound('SHARE_NOT_FOUND');
  await audit(req, 'CV_DOWNLOADED_VIA_SHARE_LINK', `candidateShare:${r.link.id}`, { candidateId: r.candidate.id, companyId: r.link.companyId });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', attachmentHeader(out.filename, q.inline === '1'));
  res.send(out.pdf);
});

candidateShareRouter.get('/:token/video', async (req, res) => {
  const r = await resolveShareLink(token(req));
  await sendIntroVideo(res, r.candidate.introVideoKey);
});

candidateShareRouter.post('/:token/decision', decisionLimiter, async (req, res) => {
  const body = parse(
    z.object({ decision: z.enum(SHARE_DECISIONS), name: z.string().trim().min(2).max(160), note: z.string().trim().max(2000).nullable().optional() }),
    req.body,
  );
  const r = await resolveShareLink(token(req));
  await decideShareLink(r, body);
  await audit(req, 'CANDIDATE_SHARE_DECISION', `candidateShare:${r.link.id}`, { decision: body.decision, name: body.name, candidateId: r.candidate.id, applicationId: r.link.applicationId });
  res.json({ share: await publicShareView(await resolveShareLink(token(req))) });
});
