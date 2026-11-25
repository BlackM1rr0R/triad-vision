import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, gone, notFound, parse } from '../../lib/http.js';
import { EXTERNAL_APP_STATUSES, buildTimeline, notifyStatusChange, readStatus } from '../../lib/germanyJobs/applicationStatus.js';
import { COVER_JOB_TYPES } from '../../lib/coverLetters/fill.js';
import { coverLetterInput, coverLetterPdf, draftCoverLetter } from '../../lib/coverLetters/index.js';
import { attachmentHeader } from '../../lib/cv/pdf.js';
import fs from 'node:fs';
import { latestLebenslauf, lebenslaufFileName, lebenslaufPath, lebenslaufView } from '../../lib/cv/versions.js';
import JSZip from 'jszip';
import { requireMinRole } from '../../middleware/auth.js';
import { cvPath } from '../../lib/germanyJobs/apply.js';
import { autoView, markSentByStaff, sentToday, stopAutomation } from '../../lib/germanyJobs/autoSend.js';
import { autoSendSettingsSchema, getAutoSendSettings, replyToAddress, setAutoSendSettings } from '../../lib/germanyJobs/autoSettings.js';
import { replyView } from '../../lib/germanyJobs/replies.js';
import { effectiveDailyLimit } from '../../lib/deliverability/health.js';
import { getSendHealth } from '../../lib/deliverability/service.js';

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
 * Automatic sending (lib/germanyJobs/autoSend.ts) is RETIRED (owner decision: for external listings the candidate
 * applies directly). Reading stays for earlier applications; whatever would send or search answers 410
 * EXTERNAL_APPLY_DIRECT (employer-email, send, resume); settings keep enabled / discovery false.
 *   GET    /auto/overview            today's count / limit, kill switch, "Göndərməyə hazır" queue (READY + QUEUED)
 *   GET    /auto/settings            PUT (ADMIN+, settings area): { enabled, dailyLimit, perDomainLimit, replyTo, discovery } (audited)
 *   POST   /auto/mark-sent           { ids: inquiry ids } → "Göndərildi" bulk: FORWARDED + client notice (audited)
 *   PUT    /:id/auto/employer-email  { email | null } → set by staff; a READY / QUEUED application continues (may send)
 *   POST   /:id/auto/send            staff "send now" (no limits / kill switch; consent + CV required; audited)
 *   POST   /:id/auto/stop            no automatic sending for this application
 *   POST   /:id/auto/resume          check and continue again
 *   POST   /:id/auto/mark-sent       sent outside the system
 *   GET    /:id/package.zip          Anschreiben PDF + CV + listing info (audited)
 * Employer answers (lib/germanyJobs/replies: matched in the agency mailbox, keyword suggestion, staff decide):
 *   POST   /:id/replies/:replyId     { action: APPLY | KEEP } → APPLY sets the suggested status (event + client notice,
 *                                    audited), KEEP leaves the status; the reply is marked done either way
 */
export const adminExternalApplicationsRouter = Router();

const appInclude = {
  inquiry: { select: { contactName: true, email: true, phone: true, locale: true, anonymizedAt: true } },
  events: { orderBy: { createdAt: 'asc' } },
  replies: { orderBy: { receivedAt: 'desc' }, take: 20 },
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
    listingUrl: app.listingUrl,
    auto: autoView(app),
    // Staff only: employer answers found in the agency mailbox with the suggested status.
    replies: app.replies.map(replyView),
  };
};

// ─── Automatic sending: overview, settings, queue ───────────────────────────

adminExternalApplicationsRouter.get('/auto/overview', async (_req, res) => {
  const settings = await getAutoSendSettings();
  const today = await sentToday();
  const health = await getSendHealth();
  const rows = await prisma.externalJobApplication.findMany({
    where: { autoState: { in: ['READY', 'QUEUED'] }, status: 'SUBMITTED', inquiry: { anonymizedAt: null } },
    orderBy: { createdAt: 'asc' },
    take: 200,
    include: { inquiry: { select: { contactName: true } } },
  });
  const counts = await prisma.externalJobApplication.groupBy({ by: ['autoState'], where: { status: 'SUBMITTED', autoState: { not: null } }, _count: { _all: true } });
  res.json({
    settings: { ...settings, replyToEffective: replyToAddress(settings) },
    // limit = what applies today: lowered automatically after bounces / failures (lib/deliverability/health.ts).
    today: { sent: today.total, limit: effectiveDailyLimit(settings.dailyLimit, health.factor), configured: settings.dailyLimit },
    health: { factor: health.factor, reason: health.reason, changedAt: health.changedAt, last: health.last },
    counts: Object.fromEntries(counts.map((c) => [c.autoState ?? '', c._count._all])),
    queue: rows.map((r) => ({
      inquiryId: r.inquiryId,
      name: r.inquiry.contactName,
      listingTitle: r.listingTitle,
      listingCompany: r.listingCompany,
      listingUrl: r.listingUrl,
      createdAt: r.createdAt,
      state: r.autoState,
      reason: r.autoReason,
      nextAt: r.autoNextAt,
      employerEmail: r.employerEmail,
      employerPageUrl: r.employerPageUrl,
      clientHelpAt: r.clientHelpAt,
      hasCoverLetter: !!r.coverLetterBody,
    })),
  });
});

adminExternalApplicationsRouter.get('/auto/settings', async (_req, res) => {
  const settings = await getAutoSendSettings();
  res.json({ settings: { ...settings, replyToEffective: replyToAddress(settings) } });
});

adminExternalApplicationsRouter.put('/auto/settings', requireMinRole('ADMIN'), async (req, res) => {
  const body = parse(autoSendSettingsSchema.partial(), req.body ?? {});
  const before = await getAutoSendSettings();
  const settings = await setAutoSendSettings(body);
  await audit(req, 'EXTERNAL_JOB_AUTO_SETTINGS_UPDATED', 'setting:externalAutoSend', { from: before, to: settings });
  // enabled / discovery stay false (retired, lib/germanyJobs/autoSettings.ts).
  res.json({ settings: { ...settings, replyToEffective: replyToAddress(settings) } });
});

const idsInput = z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(100) }).strict();

adminExternalApplicationsRouter.post('/auto/mark-sent', async (req, res) => {
  const body = parse(idsInput, req.body);
  const rows = await prisma.externalJobApplication.findMany({ where: { inquiryId: { in: body.ids } }, select: { id: true, inquiryId: true } });
  let done = 0;
  for (const r of rows) {
    if (await markSentByStaff(r.id, req.user!.id)) {
      done++;
      await audit(req, 'EXTERNAL_JOB_MARKED_SENT', `inquiry:${r.inquiryId}`, { bulk: true });
    }
  }
  res.json({ ok: true, done });
});

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

/** Staff status change: event + audit + client notice (also used by "apply the suggestion" of an employer answer). */
const setStatus = async (req: import('express').Request, app: Awaited<ReturnType<typeof load>>, status: (typeof EXTERNAL_APP_STATUSES)[number], note: string | null, extra: Record<string, unknown> = {}) => {
  const from = readStatus(app.status);
  const now = new Date();
  await prisma.$transaction([
    prisma.externalJobApplication.update({ where: { id: app.id }, data: { status, statusNote: note, statusChangedAt: now } }),
    prisma.externalJobApplicationEvent.create({ data: { applicationId: app.id, status, note, staffId: req.user!.id, createdAt: now } }),
  ]);
  await audit(req, 'EXTERNAL_JOB_APPLICATION_STATUS', `inquiry:${app.inquiryId}`, { from, to: status, note: !!note, ...extra });
  await notifyStatusChange(app, status, note);
};

adminExternalApplicationsRouter.post('/:id/status', async (req, res) => {
  const body = parse(statusInput, req.body);
  const app = await load(String(req.params.id));
  if (app.inquiry.anonymizedAt) throw badRequest('INQUIRY_ANONYMIZED');
  if (readStatus(app.status) === body.status && !body.note) throw badRequest('STATUS_UNCHANGED');
  await setStatus(req, app, body.status, body.note);
  res.json(await view(await load(app.inquiryId)));
});

const replyInput = z.object({ action: z.enum(['APPLY', 'KEEP']) }).strict();

adminExternalApplicationsRouter.post('/:id/replies/:replyId', async (req, res) => {
  const body = parse(replyInput, req.body);
  const app = await load(String(req.params.id));
  const reply = await prisma.externalJobApplicationReply.findFirst({ where: { id: String(req.params.replyId), applicationId: app.id } });
  if (!reply) throw notFound('REPLY_NOT_FOUND');
  if (reply.resolution) throw badRequest('REPLY_ALREADY_HANDLED');
  const status = reply.suggestedStatus === 'INTERVIEW' || reply.suggestedStatus === 'REJECTED' ? reply.suggestedStatus : null;
  if (body.action === 'APPLY') {
    if (!status) throw badRequest('NO_SUGGESTED_STATUS');
    if (app.inquiry.anonymizedAt) throw badRequest('INQUIRY_ANONYMIZED');
  }
  // Conditional: two staff members clicking at once change the status only once.
  const claimed = await prisma.externalJobApplicationReply.updateMany({
    where: { id: reply.id, resolution: null },
    data: { resolution: body.action === 'APPLY' ? 'APPLIED' : 'KEPT', resolvedById: req.user!.id, resolvedAt: new Date() },
  });
  if (!claimed.count) throw badRequest('REPLY_ALREADY_HANDLED');
  if (body.action === 'APPLY' && status && readStatus(app.status) !== status) await setStatus(req, app, status, null, { fromReply: reply.id });
  else await audit(req, 'EXTERNAL_JOB_REPLY_HANDLED', `inquiry:${app.inquiryId}`, { reply: reply.id, action: body.action, classification: reply.classification });
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

// ─── Automatic sending: per application ─────────────────────────────────────

/** Retired: nothing is searched or sent for external listings any more. */
const retired = () => {
  throw gone('EXTERNAL_APPLY_DIRECT');
};
adminExternalApplicationsRouter.put('/:id/auto/employer-email', retired);
adminExternalApplicationsRouter.post('/:id/auto/send', retired);

adminExternalApplicationsRouter.post('/:id/auto/stop', async (req, res) => {
  const app = await load(String(req.params.id));
  await stopAutomation(app.id);
  await audit(req, 'EXTERNAL_JOB_AUTO_STOPPED', `inquiry:${app.inquiryId}`, {});
  res.json(await view(await load(app.inquiryId)));
});

adminExternalApplicationsRouter.post('/:id/auto/resume', retired);

adminExternalApplicationsRouter.post('/:id/auto/mark-sent', async (req, res) => {
  const app = await load(String(req.params.id));
  if (app.inquiry.anonymizedAt) throw badRequest('INQUIRY_ANONYMIZED');
  if (!(await markSentByStaff(app.id, req.user!.id))) throw badRequest('ALREADY_SENT');
  await audit(req, 'EXTERNAL_JOB_MARKED_SENT', `inquiry:${app.inquiryId}`, {});
  res.json(await view(await load(app.inquiryId)));
});

/** One-click package for the "Göndərməyə hazır" queue: what the e-mail to the employer would carry. */
adminExternalApplicationsRouter.get('/:id/package.zip', async (req, res) => {
  const app = await load(String(req.params.id));
  if (app.inquiry.anonymizedAt) throw badRequest('INQUIRY_ANONYMIZED');
  const zip = new JSZip();
  const letter = app.coverLetterBody ? { subject: app.coverLetterSubject ?? 'Bewerbung', body: app.coverLetterBody } : await draftCoverLetter(app);
  const pdf = await coverLetterPdf(app, letter);
  zip.file(pdf.filename, pdf.pdf);
  if (app.cvStoredName && fs.existsSync(cvPath(app.cvStoredName))) zip.file(app.cvOriginalName ?? 'CV', fs.readFileSync(cvPath(app.cvStoredName)));
  else {
    const v = app.userId ? await latestLebenslauf(app.userId) : null;
    if (v && fs.existsSync(lebenslaufPath(v.storageKey))) zip.file(await lebenslaufFileName(app.userId!, v), fs.readFileSync(lebenslaufPath(v.storageKey)));
  }
  const info = [
    `Stelle: ${app.listingTitle ?? '-'}`,
    `Arbeitgeber: ${app.listingCompany ?? '-'}`,
    `Ort: ${app.listingLocation ?? '-'}`,
    `Anzeige: ${app.listingUrl}`,
    `Bewerber: ${app.inquiry.contactName}`,
    `Betreff: ${letter.subject}`,
    `Weitergabe an Arbeitgeber erlaubt (DSGVO): ${app.forwardConsentAt ? app.forwardConsentAt.toISOString() : 'nein'}`,
  ];
  zip.file('Stellenanzeige.txt', info.join('\r\n'));
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  await audit(req, 'EXTERNAL_JOB_PACKAGE_DOWNLOADED', `inquiry:${app.inquiryId}`, {});
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', attachmentHeader(`Bewerbung_${app.inquiryId}.zip`, false));
  res.send(buf);
});
