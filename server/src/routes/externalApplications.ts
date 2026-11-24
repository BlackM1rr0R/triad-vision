import fs from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { conflict, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { cvPath } from '../lib/germanyJobs/apply.js';
import { buildTimeline, linkApplicationsByEmail, readStatus } from '../lib/germanyJobs/applicationStatus.js';
import { COVER_JOB_TYPES } from '../lib/coverLetters/fill.js';
import { coverLetterInput, coverLetterPdf, draftCoverLetter } from '../lib/coverLetters/index.js';
import { attachmentHeader } from '../lib/cv/pdf.js';
import { recordConsent } from '../lib/privacy/consents.js';
import { grantForwardConsent, recheckUserApplications } from '../lib/germanyJobs/autoSend.js';
import { readMissing } from '../lib/germanyJobs/autoCheck.js';
import { FIX_PATH } from '../lib/germanyJobs/autoTexts.js';

/**
 * "My applications" for listings of other job sites (apply via Triad Vision) — mounted at /api/external-applications
 * (clients, own rows only):
 *   GET  /                          list with status timeline (earlier applications with the verified e-mail are linked first)
 *   GET  /:id/cv                    the CV sent with the application
 *   GET  /:id/cover-letter          Anschreiben draft from the template of the job type (?jobType=) + the letter staff attached
 *   POST /:id/cover-letter/pdf      { subject, body } → PDF (DIN 5008 layout)
 *   POST /:id/cover-letter/save     { subject, body } → stored with the client's letters (Learn › Cover letters)
 *   POST /:id/forward-consent       the client agrees (later) that we forward CV + data to the employer → automatic
 *                                   check and sending start (lib/germanyJobs/autoSend.ts; consent logged)
 */
export const externalApplicationsRouter = Router();
externalApplicationsRouter.use(requireRole('CLIENT'));

const uid = (req: { user?: { id: string } }) => req.user!.id;

const appInclude = {
  inquiry: { select: { contactName: true, email: true, phone: true } },
  events: { orderBy: { createdAt: 'asc' }, select: { status: true, note: true, createdAt: true } },
} satisfies Prisma.ExternalJobApplicationInclude;

const ownApplication = async (userId: string, id: string) => {
  const app = await prisma.externalJobApplication.findFirst({ where: { id, userId, inquiry: { anonymizedAt: null } }, include: appInclude });
  if (!app) throw notFound('APPLICATION_NOT_FOUND');
  return app;
};

externalApplicationsRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: uid(req) }, select: { id: true, email: true, emailVerifiedAt: true, role: true } });
  const linked = await linkApplicationsByEmail(user);
  if (linked) {
    await audit(req, 'EXTERNAL_JOB_APPLICATIONS_LINKED', `user:${user.id}`, { count: linked });
    // Linked applications now have an account to check against (linking never happens while viewing as the client).
    void recheckUserApplications(user.id);
  }
  const rows = await prisma.externalJobApplication.findMany({
    where: { userId: user.id, inquiry: { anonymizedAt: null } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: appInclude,
  });
  res.json({
    items: rows.map((r) => {
      const status = readStatus(r.status);
      return {
        id: r.id,
        provider: r.provider,
        listingUrl: r.listingUrl,
        listingTitle: r.listingTitle,
        listingCompany: r.listingCompany,
        listingLocation: r.listingLocation,
        jobType: r.jobType,
        status,
        statusNote: r.statusNote,
        statusChangedAt: r.statusChangedAt,
        createdAt: r.createdAt,
        cv: r.cvOriginalName ? { name: r.cvOriginalName, size: r.cvSize, lebenslauf: !!r.lebenslaufVersionId } : null,
        coverLetter: r.coverLetterBody ? { subject: r.coverLetterSubject, at: r.coverLetterAt } : null,
        timeline: buildTimeline(r.createdAt, status, r.events),
        // Automatic sending: what is missing (with where to fix it) / prepared / waiting for the consent.
        auto: {
          state: r.autoState,
          consent: !!r.forwardConsentAt,
          missing: r.autoState === 'NEEDS_DATA' ? readMissing(r.autoMissing).map((code) => ({ code, path: FIX_PATH[code] })) : [],
          requiredGerman: r.requiredGerman,
        },
        events: r.events.map((e) => ({ status: readStatus(e.status), note: e.note, at: e.createdAt })),
      };
    }),
    linked,
  });
});

externalApplicationsRouter.get('/:id/cv', async (req, res) => {
  const app = await ownApplication(uid(req), String(req.params.id));
  const full = await prisma.externalJobApplication.findUniqueOrThrow({ where: { id: app.id }, select: { cvStoredName: true } });
  if (!full.cvStoredName) throw notFound('CV_NOT_FOUND');
  const file = cvPath(full.cvStoredName);
  if (!fs.existsSync(file)) throw notFound('FILE_NOT_FOUND');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(file, app.cvOriginalName ?? 'cv', { headers: { 'Content-Type': app.cvMime ?? 'application/octet-stream' } });
});

const draftQuery = z.object({ jobType: z.enum(COVER_JOB_TYPES).optional() });

externalApplicationsRouter.get('/:id/cover-letter', async (req, res) => {
  const q = parse(draftQuery, req.query);
  const app = await ownApplication(uid(req), String(req.params.id));
  const draft = await draftCoverLetter(app, q.jobType);
  res.json({ draft, attached: app.coverLetterBody ? { subject: app.coverLetterSubject ?? '', body: app.coverLetterBody, at: app.coverLetterAt } : null });
});

externalApplicationsRouter.post('/:id/cover-letter/pdf', async (req, res) => {
  const body = parse(coverLetterInput, req.body);
  const app = await ownApplication(uid(req), String(req.params.id));
  const out = await coverLetterPdf(app, body);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', attachmentHeader(out.filename, req.query.inline === '1'));
  res.send(out.pdf);
});

externalApplicationsRouter.post('/:id/cover-letter/save', async (req, res) => {
  const body = parse(coverLetterInput, req.body);
  await ownApplication(uid(req), String(req.params.id));
  if ((await prisma.motivationLetter.count({ where: { userId: uid(req) } })) >= 50) throw conflict('TOO_MANY_LETTERS');
  const letter = await prisma.motivationLetter.create({
    data: { userId: uid(req), kind: 'JOB', language: 'de', title: body.subject.slice(0, 200), body: body.body, answers: {} },
  });
  res.status(201).json({ letter: { id: letter.id, title: letter.title } });
});

externalApplicationsRouter.post('/:id/forward-consent', async (req, res) => {
  const app = await ownApplication(uid(req), String(req.params.id));
  if (app.forwardConsentAt) throw conflict('ALREADY_CONSENTED');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: uid(req) }, select: { email: true } });
  await recordConsent({ userId: uid(req), email: user.email, type: 'EXTERNAL_JOB_FORWARD', granted: true, source: 'PORTAL', req });
  await audit(req, 'EXTERNAL_JOB_FORWARD_CONSENT', `inquiry:${app.inquiryId}`, {});
  const state = await grantForwardConsent(app.id);
  res.json({ ok: true, state });
});
