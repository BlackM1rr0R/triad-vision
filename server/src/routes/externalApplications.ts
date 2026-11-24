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
import { clientConfirmSent, clientMaySend, clientNeedsHelp, grantForwardConsent, recheckUserApplications } from '../lib/germanyJobs/autoSend.js';
import { readMissing } from '../lib/germanyJobs/autoCheck.js';
import { FIX_PATH, clientCoverEmail, clientSubject } from '../lib/germanyJobs/autoTexts.js';
import { latestLebenslauf, lebenslaufFileName, lebenslaufPath } from '../lib/cv/versions.js';
import JSZip from 'jszip';

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
 * The client sends the prepared package themselves (autoState CLIENT_SEND; read-only GETs, nothing is generated and
 * stored there — the pipeline prepared the letter and the CV file):
 *   GET  /:id/package/cover-letter.pdf   the Anschreiben (German) as PDF
 *   GET  /:id/package/cv                 the CV / Lebenslauf of the application
 *   GET  /:id/package.zip                both in one ZIP
 *   POST /:id/sent                       "Göndərdim" → FORWARDED (mode CLIENT, audited)
 *   POST /:id/help                       { note? } "Alınmadı" → staff queue + staff notified (audited)
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

/** What the client needs to send it themselves: direct link, address (if usable), texts to copy. */
const clientSendView = (r: Prisma.ExternalJobApplicationGetPayload<{ include: typeof appInclude }>, user: { firstName: string; lastName: string; email: string; phone: string | null }) => {
  if (!clientMaySend(r) || !['CLIENT_SEND', 'READY'].includes(r.autoState ?? '')) return null;
  const pageUrl = r.employerPageUrl ?? r.listingUrl;
  const subject = clientSubject(r.listingTitle, r.coverLetterSubject);
  return {
    pageUrl,
    direct: !!r.employerPageUrl,
    // A refused address is not offered again.
    employerEmail: r.employerEmail && r.autoReason !== 'EMAIL_REJECTED' ? r.employerEmail : null,
    subject,
    letter: r.coverLetterBody ?? null,
    emailText: clientCoverEmail({ title: r.listingTitle, company: r.listingCompany, pageUrl, name: `${user.firstName} ${user.lastName}`.trim() || r.inquiry.contactName, phone: user.phone, email: user.email }),
    hasCv: !!r.cvStoredName || !!r.lebenslaufVersionId,
    since: r.clientSendAt,
    helpAt: r.clientHelpAt,
  };
};

externalApplicationsRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: uid(req) }, select: { id: true, email: true, emailVerifiedAt: true, role: true, firstName: true, lastName: true, phone: true } });
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
          sentMode: r.autoSentMode,
          clientSend: clientSendView(r, user),
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

// ─── The client sends the package themselves ────────────────────────────────

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

externalApplicationsRouter.post('/:id/sent', async (req, res) => {
  const app = await ownApplication(uid(req), String(req.params.id));
  if (!(await clientConfirmSent(app.id, uid(req)))) throw conflict('ALREADY_SENT');
  await audit(req, 'EXTERNAL_JOB_CLIENT_SENT', `inquiry:${app.inquiryId}`, {});
  res.json({ ok: true });
});

const helpInput = z
  .object({
    note: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => v || null),
  })
  .strict();

externalApplicationsRouter.post('/:id/help', async (req, res) => {
  const body = parse(helpInput, req.body ?? {});
  const app = await ownApplication(uid(req), String(req.params.id));
  if (!(await clientNeedsHelp(app.id, uid(req), body.note))) throw conflict('ALREADY_SENT');
  await audit(req, 'EXTERNAL_JOB_CLIENT_HELP', `inquiry:${app.inquiryId}`, { note: !!body.note });
  res.json({ ok: true });
});
