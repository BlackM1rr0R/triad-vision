import fs from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { conflict, gone, notFound, parse } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { cvPath } from '../lib/germanyJobs/apply.js';
import { buildTimeline, linkApplicationsByEmail, readStatus } from '../lib/germanyJobs/applicationStatus.js';
import { COVER_JOB_TYPES } from '../lib/coverLetters/fill.js';
import { coverLetterInput, coverLetterPdf, draftCoverLetter } from '../lib/coverLetters/index.js';
import { attachmentHeader } from '../lib/cv/pdf.js';
import { readMissing } from '../lib/germanyJobs/autoCheck.js';
import { FIX_PATH } from '../lib/germanyJobs/autoTexts.js';
import { latestLebenslauf, lebenslaufFileName, lebenslaufPath } from '../lib/cv/versions.js';
import JSZip from 'jszip';

/**
 * "My applications" for listings of other job sites — mounted at /api/external-applications (clients, own rows only).
 * "Apply via Triad Vision" for external listings is retired (owner decision): the candidate applies to the employer
 * directly. Earlier applications stay readable here (history); nothing is processed or sent any more, so the
 * endpoints that moved an application on answer 410 EXTERNAL_APPLY_DIRECT.
 *   GET  /                          list with status timeline (earlier applications with the verified e-mail are linked first)
 *   GET  /:id/cv                    the CV sent with the application
 *   GET  /:id/cover-letter          Anschreiben draft from the template of the job type (?jobType=) + the letter staff attached
 *   POST /:id/cover-letter/pdf      { subject, body } → PDF (DIN 5008 layout)
 *   POST /:id/cover-letter/save     { subject, body } → stored with the client's letters (Learn › Cover letters)
 *   POST /:id/forward-consent       retired → 410
 * The prepared package of an earlier application (read-only GETs, nothing is generated and stored):
 *   GET  /:id/package/cover-letter.pdf   the Anschreiben (German) as PDF
 *   GET  /:id/package/cv                 the CV / Lebenslauf of the application
 *   GET  /:id/package.zip                both in one ZIP
 *   POST /:id/sent, /:id/help            retired → 410
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
  const user = await prisma.user.findUniqueOrThrow({ where: { id: uid(req) }, select: { id: true, email: true, emailVerifiedAt: true, role: true, firstName: true, lastName: true, phone: true } });
  const linked = await linkApplicationsByEmail(user);
  if (linked) await audit(req, 'EXTERNAL_JOB_APPLICATIONS_LINKED', `user:${user.id}`, { count: linked });
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
        // Automatic sending (retired; shown as history): what was missing / the state it stopped in.
        auto: {
          state: r.autoState,
          consent: !!r.forwardConsentAt,
          missing: r.autoState === 'NEEDS_DATA' ? readMissing(r.autoMissing).map((code) => ({ code, path: FIX_PATH[code] })) : [],
          requiredGerman: r.requiredGerman,
          sentMode: r.autoSentMode,
          clientSend: null,
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

/** Retired: nothing is forwarded or sent for external listings any more (the candidate applies directly). */
const retired = () => {
  throw gone('EXTERNAL_APPLY_DIRECT');
};
externalApplicationsRouter.post('/:id/forward-consent', retired);
externalApplicationsRouter.post('/:id/sent', retired);
externalApplicationsRouter.post('/:id/help', retired);

// ─── The package of an earlier application (read-only downloads) ─────────────

/** The CV file of the application: its own file, else the newest saved Lebenslauf (read only). */
const packageCv = async (app: Awaited<ReturnType<typeof ownApplication>>) => {
  if (app.cvStoredName && fs.existsSync(cvPath(app.cvStoredName))) return { path: cvPath(app.cvStoredName), name: app.cvOriginalName ?? 'Lebenslauf.pdf', mime: app.cvMime ?? 'application/pdf' };
  const v = await latestLebenslauf(app.userId!);
  if (v && fs.existsSync(lebenslaufPath(v.storageKey))) return { path: lebenslaufPath(v.storageKey), name: await lebenslaufFileName(app.userId!, v), mime: 'application/pdf' };
  return null;
};

/** The attached Anschreiben, else the template draft (generated for the download only, not stored). */
const packageLetter = async (app: Awaited<ReturnType<typeof ownApplication>>) =>
  coverLetterPdf(app, app.coverLetterBody ? { subject: app.coverLetterSubject ?? 'Bewerbung', body: app.coverLetterBody } : await draftCoverLetter(app));

externalApplicationsRouter.get('/:id/package/cover-letter.pdf', async (req, res) => {
  const app = await ownApplication(uid(req), String(req.params.id));
  const out = await packageLetter(app);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', attachmentHeader(out.filename, req.query.inline === '1'));
  res.send(out.pdf);
});

externalApplicationsRouter.get('/:id/package/cv', async (req, res) => {
  const app = await ownApplication(uid(req), String(req.params.id));
  const cv = await packageCv(app);
  if (!cv) throw notFound('CV_NOT_FOUND');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', cv.mime);
  res.setHeader('Content-Disposition', attachmentHeader(cv.name, false));
  res.sendFile(cv.path);
});

externalApplicationsRouter.get('/:id/package.zip', async (req, res) => {
  const app = await ownApplication(uid(req), String(req.params.id));
  const zip = new JSZip();
  const letter = await packageLetter(app);
  zip.file(letter.filename, letter.pdf);
  const cv = await packageCv(app);
  if (cv) zip.file(cv.name, fs.readFileSync(cv.path));
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', attachmentHeader('Bewerbung.zip', false));
  res.send(buf);
});
