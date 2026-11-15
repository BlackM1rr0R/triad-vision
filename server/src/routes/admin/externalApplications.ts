import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { EXTERNAL_APP_STATUSES, buildTimeline, notifyStatusChange, readStatus } from '../../lib/germanyJobs/applicationStatus.js';
import { COVER_JOB_TYPES } from '../../lib/coverLetters/fill.js';
import { coverLetterInput, coverLetterPdf, draftCoverLetter } from '../../lib/coverLetters/index.js';
import { attachmentHeader } from '../../lib/cv/pdf.js';
import fs from 'node:fs';
import { latestLebenslauf, lebenslaufFileName, lebenslaufPath, lebenslaufView } from '../../lib/cv/versions.js';

/**
 * "Apply via Triad Vision" applications, staff side — mounted at /api/admin/external-applications (STAFF+);
 * `:id` is the inquiry id (like /api/admin/germany-jobs/applications/:id/cv):
 *   GET    /:id                      status, timeline with notes, attached Anschreiben, templates, client's Lebenslauf
 *   POST   /:id/status               { status, note? } → event + client notification / e-mail (audited)
 *   GET    /:id/cover-letter/draft   ?jobType= → Anschreiben filled from the template, profile, CV and listing
 *   PUT    /:id/cover-letter         { subject, body } → attached to the application (audited)
 *   DELETE /:id/cover-letter         detach
 *   POST   /:id/cover-letter/pdf     { subject, body } → PDF of the text being edited
 *   GET    /:id/cover-letter.pdf     PDF of the attached letter
 *   GET    /:id/lebenslauf.pdf       the client's newest saved Lebenslauf (audited)
 */
export const adminExternalApplicationsRouter = Router();

const appInclude = {
  inquiry: { select: { contactName: true, email: true, phone: true, locale: true, anonymizedAt: true } },
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ExternalJobApplicationInclude;

const load = async (inquiryId: string) => {
  const app = await prisma.externalJobApplication.findUnique({ where: { inquiryId }, include: appInclude });
  if (!app) throw notFound('APPLICATION_NOT_FOUND');
  return app;
};

const view = async (app: Awaited<ReturnType<typeof load>>) => {
  const staffIds = Array.from(new Set(app.events.map((e) => e.staffId).filter((v): v is string => !!v)));
  const staff = staffIds.length ? await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const name = (id: string | null) => {
    const s = staff.find((x) => x.id === id);
    return s ? `${s.firstName} ${s.lastName}`.trim() : null;
  };
  const latest = app.userId ? await prisma.lebenslaufVersion.findFirst({ where: { userId: app.userId }, orderBy: { version: 'desc' } }) : null;
  const status = readStatus(app.status);
  return {
    inquiryId: app.inquiryId,
    userId: app.userId,
    status,
    statusNote: app.statusNote,
    statusChangedAt: app.statusChangedAt,
    statuses: EXTERNAL_APP_STATUSES,
    timeline: buildTimeline(app.createdAt, status, app.events),
    events: app.events.map((e) => ({ id: e.id, status: readStatus(e.status), note: e.note, at: e.createdAt, by: name(e.staffId) })),
    coverLetter: app.coverLetterBody ? { subject: app.coverLetterSubject ?? '', body: app.coverLetterBody, at: app.coverLetterAt } : null,
    cvFromLebenslauf: !!app.lebenslaufVersionId,
    lebenslauf: latest ? lebenslaufView(latest) : null,
    anonymized: !!app.inquiry.anonymizedAt,
  };
};

adminExternalApplicationsRouter.get('/:id', async (req, res) => {
  res.json(await view(await load(String(req.params.id))));
});

const statusInput = z
  .object({
    status: z.enum(EXTERNAL_APP_STATUSES),
    /** Shown to the client in the portal and in the notification. */
    note: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => v || null),
  })
  .strict();

adminExternalApplicationsRouter.post('/:id/status', async (req, res) => {
  const body = parse(statusInput, req.body);
  const app = await load(String(req.params.id));
  if (app.inquiry.anonymizedAt) throw badRequest('INQUIRY_ANONYMIZED');
  const from = readStatus(app.status);
  if (from === body.status && !body.note) throw badRequest('STATUS_UNCHANGED');
  const now = new Date();
  await prisma.$transaction([
    prisma.externalJobApplication.update({ where: { id: app.id }, data: { status: body.status, statusNote: body.note, statusChangedAt: now } }),
    prisma.externalJobApplicationEvent.create({ data: { applicationId: app.id, status: body.status, note: body.note, staffId: req.user!.id, createdAt: now } }),
  ]);
  await audit(req, 'EXTERNAL_JOB_APPLICATION_STATUS', `inquiry:${app.inquiryId}`, { from, to: body.status, note: !!body.note });
  await notifyStatusChange(app, body.status, body.note);
  res.json(await view(await load(app.inquiryId)));
});

const draftQuery = z.object({ jobType: z.enum(COVER_JOB_TYPES).optional() });

adminExternalApplicationsRouter.get('/:id/cover-letter/draft', async (req, res) => {
  const q = parse(draftQuery, req.query);
  const app = await load(String(req.params.id));
  if (app.inquiry.anonymizedAt) throw badRequest('INQUIRY_ANONYMIZED');
  res.json({ draft: await draftCoverLetter(app, q.jobType) });
});

adminExternalApplicationsRouter.put('/:id/cover-letter', async (req, res) => {
  const body = parse(coverLetterInput, req.body);
  const app = await load(String(req.params.id));
  if (app.inquiry.anonymizedAt) throw badRequest('INQUIRY_ANONYMIZED');
  await prisma.externalJobApplication.update({ where: { id: app.id }, data: { coverLetterSubject: body.subject, coverLetterBody: body.body, coverLetterAt: new Date() } });
  await audit(req, 'EXTERNAL_JOB_COVER_LETTER_SAVED', `inquiry:${app.inquiryId}`, {});
  res.json(await view(await load(app.inquiryId)));
});

adminExternalApplicationsRouter.delete('/:id/cover-letter', async (req, res) => {
  const app = await load(String(req.params.id));
  await prisma.externalJobApplication.update({ where: { id: app.id }, data: { coverLetterSubject: null, coverLetterBody: null, coverLetterAt: null } });
  await audit(req, 'EXTERNAL_JOB_COVER_LETTER_REMOVED', `inquiry:${app.inquiryId}`, {});
  res.json(await view(await load(app.inquiryId)));
});

const sendPdf = (res: import('express').Response, out: { pdf: Buffer; filename: string }, inline: boolean) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', attachmentHeader(out.filename, inline));
  res.send(out.pdf);
};

adminExternalApplicationsRouter.post('/:id/cover-letter/pdf', async (req, res) => {
  const body = parse(coverLetterInput, req.body);
  const app = await load(String(req.params.id));
  if (app.inquiry.anonymizedAt) throw badRequest('INQUIRY_ANONYMIZED');
  sendPdf(res, await coverLetterPdf(app, body), req.query.inline === '1');
});

adminExternalApplicationsRouter.get('/:id/cover-letter.pdf', async (req, res) => {
  const app = await load(String(req.params.id));
  if (!app.coverLetterBody) throw notFound('COVER_LETTER_NOT_FOUND');
  await audit(req, 'EXTERNAL_JOB_COVER_LETTER_DOWNLOADED', `inquiry:${app.inquiryId}`, {});
  sendPdf(res, await coverLetterPdf(app, { subject: app.coverLetterSubject ?? 'Bewerbung', body: app.coverLetterBody }), req.query.inline === '1');
});

adminExternalApplicationsRouter.get('/:id/lebenslauf.pdf', async (req, res) => {
  const app = await load(String(req.params.id));
  const v = app.userId ? await latestLebenslauf(app.userId) : null;
  if (!v || !fs.existsSync(lebenslaufPath(v.storageKey))) throw notFound('LEBENSLAUF_NOT_FOUND');
  await audit(req, 'LEBENSLAUF_DOWNLOADED_BY_STAFF', `user:${app.userId}`, { version: v.version });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', attachmentHeader(await lebenslaufFileName(app.userId!, v), req.query.inline === '1'));
  res.sendFile(lebenslaufPath(v.storageKey));
});
