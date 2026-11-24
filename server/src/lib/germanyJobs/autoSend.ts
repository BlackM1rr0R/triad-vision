import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { Locale, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { audit } from '../audit.js';
import { brandSync } from '../brand/index.js';
import { renderEmail, sendMail, sendMailDetailed, type MailAttachment } from '../mailer.js';
import { notifyUser } from '../notifications.js';
import { isImpersonating } from '../privacy/impersonationContext.js';
import { germanRank } from '../matching.js';
import { coverLetterPdf, draftCoverLetter } from '../coverLetters/index.js';
import { latestLebenslauf } from '../cv/versions.js';
import { readCv } from '../cv/schema.js';
import { SEO_LOCALES, type SeoLocale } from '../seoCatalogue.js';
import { cvPath, hostOf } from './apply.js';
import { notifyStatusChange } from './applicationStatus.js';
import { attachLebenslaufCopy } from './lebenslaufAttach.js';
import { baseDomain, checkExternalApplication, isGermanLevel, missingKey, parseGermanRequirement, readMissing, type AutoCheckResult } from './autoCheck.js';
import { dayStart, getAutoSendSettings, limitReason, nextDayStart, replyToAddress, type AutoSendSettings } from './autoSettings.js';
import { employerMail, localePath, needsMessage, readyMessage } from './autoTexts.js';

/**
 * Automatic handling of "apply via Triad Vision" applications (owner decision: full automatic sending with checks):
 *
 *   new application with forward consent ─► check (lib/germanyJobs/autoCheck.ts)
 *     ├─ data missing → NEEDS_DATA: status stays SUBMITTED with a note; the client is told exactly what is missing
 *     │                 (in-app + e-mail, links to profile / CV builder); re-checked on profile / CV changes and by
 *     │                 the scheduler, then it continues by itself
 *     └─ ok → Anschreiben from the template (no AI) is attached, then
 *          ├─ employer e-mail known → e-mail "in our name" (From: brand, Reply-To: agency inbox) with Anschreiben +
 *          │                          CV as PDF → FORWARDED (+ timeline event, client notification, audit)
 *          │                          limits: daily total + per employer domain; over a limit → QUEUED for the next
 *          │                          day; admin kill switch → QUEUED until switched on again
 *          └─ no e-mail → READY: staff queue "Göndərməyə hazır" (package download, "sent" bulk action); the client
 *                         reads "prepared, being sent to the employer"
 *   without forward consent → NO_CONSENT: nothing is sent automatically (the client can agree later in the portal).
 *
 * Never sends twice: one claim per row (autoState → SENDING in one conditional update) and no second send for the
 * same client + listing. Everything here never throws to its caller (apply route, profile save, scheduler).
 */

export const AUTO_STATES = ['NO_CONSENT', 'NEEDS_DATA', 'READY', 'QUEUED', 'SENDING', 'SENT', 'STOPPED', 'DUPLICATE'] as const;
export type AutoState = (typeof AUTO_STATES)[number];
/** States the automation may still move on from. */
const OPEN_STATES: AutoState[] = ['NEEDS_DATA', 'READY', 'QUEUED'];

const appInclude = { inquiry: { select: { contactName: true, email: true, phone: true, locale: true, anonymizedAt: true } } } satisfies Prisma.ExternalJobApplicationInclude;
type App = Prisma.ExternalJobApplicationGetPayload<{ include: typeof appInclude }>;

const loadApp = (id: string) => prisma.externalJobApplication.findUnique({ where: { id }, include: appInclude });

const systemReq = { user: undefined, ip: undefined };
type AuditReq = Parameters<typeof audit>[0];
const systemReqTyped = systemReq as AuditReq;
const staffReq = (staffId: string | null): AuditReq => (staffId ? ({ user: { id: staffId }, ip: undefined } as unknown as AuditReq) : systemReqTyped);

const jobName = (app: Pick<App, 'listingTitle' | 'listingCompany' | 'listingUrl'>) => app.listingTitle ?? app.listingCompany ?? hostOf(app.listingUrl);

const asSeo = (s: string | null | undefined): SeoLocale | null => ((SEO_LOCALES as readonly string[]).includes(s ?? '') ? (s as SeoLocale) : null);

/** Language of the texts to the client: the account's language, else the language of the apply form. */
const clientLocale = (app: App, user: { locale: Locale } | null): SeoLocale => (user ? user.locale : (asSeo(app.siteLocale) ?? asSeo(app.inquiry.locale) ?? 'az'));

const clientUser = (userId: string | null) =>
  userId
    ? prisma.user.findFirst({
        where: { id: userId, role: 'CLIENT', isActive: true },
        select: { id: true, email: true, phone: true, locale: true, germanLevel: true, profession: true, passportNumber: true },
      })
    : Promise.resolve(null);

const hasPassportDocument = async (userId: string) =>
  (await prisma.document.count({ where: { case: { clientId: userId }, requirement: { key: 'PASSPORT' }, status: { not: 'REJECTED' } } })) > 0;

/** The CV builder holds enough for a Lebenslauf (built when the application is sent). */
const cvBuilderFilled = async (userId: string) => {
  const row = await prisma.candidateCv.findUnique({ where: { userId }, select: { data: true } });
  if (!row) return false;
  const cv = readCv(row.data);
  return cv.experience.length > 0 && !!cv.headline.trim();
};

/** A CV can be sent: the application's own file, a saved Lebenslauf or a filled CV builder. */
const cvAvailable = async (app: Pick<App, 'cvStoredName' | 'userId'>, hasAccount: boolean) =>
  (!!app.cvStoredName && fs.existsSync(cvPath(app.cvStoredName))) ||
  (hasAccount && !!app.userId && (!!(await latestLebenslauf(app.userId)) || (await cvBuilderFilled(app.userId))));

/** Inputs of the check from the application, the account and its documents. */
const runCheck = async (app: App) => {
  const user = await clientUser(app.userId);
  const levels = [user?.germanLevel, app.germanLevel].filter((l): l is string => !!l);
  const best = levels.sort((a, b) => germanRank(b) - germanRank(a))[0] ?? null;
  const required = isGermanLevel(app.requiredGerman) ? app.requiredGerman : parseGermanRequirement(app.listingTitle);
  const result = checkExternalApplication({
    hasAccount: !!user,
    hasCv: await cvAvailable(app, !!user),
    germanLevel: best,
    requiredGerman: required,
    professions: [app.profession, user?.profession],
    listingTitle: app.listingTitle,
    passport: !!user && (!!user.passportNumber?.trim() || (await hasPassportDocument(user.id))),
    phone: user?.phone || app.inquiry.phone,
    email: user?.email || app.inquiry.email,
  });
  return { result, user, germanLevel: best };
};

/** Another application of the same person for the same listing already went to the employer. */
const alreadySent = async (app: App) => {
  const same: Prisma.ExternalJobApplicationWhereInput[] = [{ listingUrl: app.listingUrl }];
  if (app.externalId) same.push({ externalId: app.externalId, provider: app.provider });
  const person: Prisma.ExternalJobApplicationWhereInput = app.userId ? { userId: app.userId } : { inquiry: { email: app.inquiry.email } };
  return (
    (await prisma.externalJobApplication.count({
      where: { id: { not: app.id }, AND: [person, { OR: same }, { OR: [{ autoSentAt: { not: null } }, { status: { not: 'SUBMITTED' } }] }] },
    })) > 0
  );
};

/**
 * "autoState is not one of …" including rows without a state. SQL `NOT IN` / `<>` are never true for NULL, so a bare
 * `{ notIn }` would silently skip new rows (autoState null) — the claim would then never succeed.
 */
const stateNotIn = (states: AutoState[]): Prisma.ExternalJobApplicationWhereInput => ({ OR: [{ autoState: null }, { autoState: { notIn: states } }] });

const setState = (id: string, data: Prisma.ExternalJobApplicationUpdateInput) => prisma.externalJobApplication.update({ where: { id }, data });

// ─── Client notices ───────────────────────────────────────────────────────

const tellClientMissing = async (app: App, check: AutoCheckResult, user: Awaited<ReturnType<typeof clientUser>>, germanLevel: string | null) => {
  const lng = clientLocale(app, user);
  const vars = { job: jobName(app), have: germanLevel && germanLevel !== 'none' ? germanLevel : '—', need: check.requiredGerman };
  const now = new Date();
  // The note in the timeline, in the client's language (status stays SUBMITTED).
  const note = needsMessage(check.missing, lng, vars).note;
  const key = missingKey(check.missing);
  // Conditional update: two checks running at once (profile save + scheduler) tell the client only once.
  const claimed = await prisma.externalJobApplication.updateMany({
    where: { id: app.id, OR: [{ autoNotifiedKey: null }, { autoNotifiedKey: { not: key } }] },
    data: { statusNote: note, statusChangedAt: now, autoNotifiedKey: key },
  });
  if (!claimed.count) return;
  await prisma.externalJobApplicationEvent.create({ data: { applicationId: app.id, status: 'SUBMITTED', note, createdAt: now } });
  if (user) {
    const m = needsMessage(check.missing, lng, vars);
    await notifyUser(user.id, { type: 'EXTERNAL_APPLICATION_NEEDS', title: m.title, body: m.body, link: m.path, ctaLabel: m.cta, forceEmail: true });
    return;
  }
  if (app.inquiry.anonymizedAt) return;
  const m = needsMessage(check.missing, lng, vars, config.clientUrl);
  await sendMail(app.inquiry.email, `Triad Vision · ${m.title}`, renderEmail(m.title, m.body, { label: m.cta, url: `${config.clientUrl}${localePath(lng, m.path)}` }));
};

const tellClientReady = async (app: App, user: Awaited<ReturnType<typeof clientUser>>) => {
  const lng = clientLocale(app, user);
  const m = readyMessage(lng, jobName(app));
  if (user) {
    await notifyUser(user.id, { type: 'EXTERNAL_APPLICATION_READY', title: m.title, body: m.body, link: '/account/job-applications', ctaLabel: m.cta, forceEmail: true });
    return;
  }
  if (app.inquiry.anonymizedAt) return;
  await sendMail(app.inquiry.email, `Triad Vision · ${m.title}`, renderEmail(m.title, m.body, { label: m.cta, url: `${config.clientUrl}/account/job-applications` }));
};

// ─── Sending ──────────────────────────────────────────────────────────────

/** Anschreiben from the template when none is attached yet (staff edits are kept). */
const ensureCoverLetter = async (app: App) => {
  if (app.coverLetterBody) return { subject: app.coverLetterSubject ?? 'Bewerbung', body: app.coverLetterBody };
  const draft = await draftCoverLetter(app);
  await setState(app.id, { coverLetterSubject: draft.subject.slice(0, 300), coverLetterBody: draft.body, coverLetterAt: new Date() });
  return { subject: draft.subject, body: draft.body };
};

/** The CV file sent along: the one of the application, else a snapshot of the newest saved Lebenslauf. */
const ensureCvFile = async (app: App) => {
  if (app.cvStoredName && fs.existsSync(cvPath(app.cvStoredName))) return { path: cvPath(app.cvStoredName), name: app.cvOriginalName ?? 'Lebenslauf.pdf', mime: app.cvMime ?? 'application/pdf' };
  if (!app.userId || !(await cvAvailable({ cvStoredName: null, userId: app.userId }, true))) return null;
  const cv = await attachLebenslaufCopy(app.userId); // newest saved Lebenslauf, or one built from the CV builder now
  await setState(app.id, { cvStoredName: cv.storedName, cvOriginalName: cv.originalName.slice(0, 255), cvMime: cv.mime, cvSize: cv.size, lebenslaufVersionId: cv.lebenslaufVersionId ?? null });
  return { path: cvPath(cv.storedName), name: cv.originalName, mime: cv.mime };
};

/** Employer e-mails sent today (all, and to one employer domain). */
export const sentToday = async (domain?: string, now = new Date()) => {
  const since = dayStart(now);
  const total = await prisma.externalJobApplication.count({ where: { autoSentAt: { gte: since }, autoSentMode: { in: ['AUTO', 'STAFF'] } } });
  const toDomain = domain
    ? await prisma.externalJobApplication.count({
        where: { autoSentAt: { gte: since }, autoSentMode: { in: ['AUTO', 'STAFF'] }, OR: [{ employerEmail: { endsWith: `@${domain}` } }, { employerEmail: { endsWith: `.${domain}` } }] },
      })
    : 0;
  return { total, toDomain };
};

export type SendOutcome = 'SENT' | 'QUEUED' | 'FAILED' | 'BUSY' | 'NO_EMAIL' | 'NO_CV' | 'NO_CONSENT';

/**
 * Sends the application to `app.employerEmail`. `staffId` = staff pressed "send now": the limits and the kill switch
 * do not apply (consent, CV and the one-send rule do).
 */
const sendToEmployer = async (app: App, settings: AutoSendSettings, staffId: string | null, now = new Date()): Promise<SendOutcome> => {
  if (!app.forwardConsentAt) return 'NO_CONSENT';
  const to = app.employerEmail;
  if (!to) return 'NO_EMAIL';
  const domain = baseDomain(to.split('@')[1] ?? '');
  if (!staffId) {
    if (!settings.enabled) {
      await setState(app.id, { autoState: 'QUEUED', autoReason: 'DISABLED', autoNextAt: null });
      return 'QUEUED';
    }
    const counts = await sentToday(domain, now);
    const reason = limitReason(settings, counts.total, counts.toDomain);
    if (reason) {
      await setState(app.id, { autoState: 'QUEUED', autoReason: reason, autoNextAt: nextDayStart(now) });
      return 'QUEUED';
    }
  }
  // One claim per row: only one caller (route, scheduler, staff) gets past this line.
  const claim = await prisma.externalJobApplication.updateMany({ where: { id: app.id, autoSentAt: null, ...stateNotIn(['SENDING', 'SENT']) }, data: { autoState: 'SENDING', autoNextAt: now } }); // autoNextAt = claim time (stuck check)
  if (!claim.count) return 'BUSY';
  try {
    const letter = await ensureCoverLetter(app);
    const cv = await ensureCvFile(app);
    if (!cv) {
      await setState(app.id, { autoState: 'NEEDS_DATA', autoMissing: 'CV' });
      return 'NO_CV';
    }
    const pdf = await coverLetterPdf(app, letter);
    const attachments: MailAttachment[] = [
      { filename: pdf.filename, content: pdf.pdf, contentType: 'application/pdf' },
      { filename: cv.name, content: await fsp.readFile(cv.path), contentType: cv.mime },
    ];
    const brand = brandSync();
    const mail = employerMail({ applicant: app.inquiry.contactName, title: app.listingTitle, company: app.listingCompany, listingUrl: app.listingUrl, subject: letter.subject, brandName: brand.name, phone: brand.phone, domain: brand.domain });
    const result = await sendMailDetailed({ to, subject: mail.subject, html: renderEmail(mail.subject, mail.body), attachments, replyTo: replyToAddress(settings) || undefined });
    const mode = staffId ? 'STAFF' : 'AUTO';
    if (result.status === 'FAILED') {
      // 5xx = the address does not exist: staff take over (READY queue); otherwise try again in an hour.
      const permanent = !!result.responseCode && result.responseCode >= 500;
      await setState(app.id, permanent ? { autoState: 'READY', autoReason: 'EMAIL_REJECTED', autoNextAt: null } : { autoState: 'QUEUED', autoReason: 'SEND_FAILED', autoNextAt: new Date(now.getTime() + 60 * 60 * 1000) });
      await audit(staffReq(staffId), 'EXTERNAL_JOB_AUTO_SEND_FAILED', `inquiry:${app.inquiryId}`, { to, mode, error: (result.error ?? '').slice(0, 300), permanent });
      return 'FAILED';
    }
    const at = new Date();
    await prisma.$transaction([
      prisma.externalJobApplication.update({
        where: { id: app.id },
        data: { autoState: 'SENT', autoSentAt: at, autoSentMode: mode, autoReason: null, autoNextAt: null, status: 'FORWARDED', statusNote: null, statusChangedAt: at },
      }),
      prisma.externalJobApplicationEvent.create({ data: { applicationId: app.id, status: 'FORWARDED', staffId, createdAt: at } }),
    ]);
    await audit(staffReq(staffId), 'EXTERNAL_JOB_AUTO_SENT', `inquiry:${app.inquiryId}`, { to, mode, source: app.employerEmailSource, attachments: attachments.map((a) => a.filename) });
    await notifyStatusChange(app, 'FORWARDED', null);
    return 'SENT';
  } catch (err) {
    console.error('[germany-jobs] automatic sending failed', err);
    await setState(app.id, { autoState: 'QUEUED', autoReason: 'SEND_FAILED', autoNextAt: new Date(now.getTime() + 60 * 60 * 1000) }).catch(() => undefined);
    return 'FAILED';
  }
};

// ─── The pipeline ─────────────────────────────────────────────────────────

/**
 * Check → note / notice → Anschreiben → send or READY. Runs for new applications, after the client changed data,
 * from the scheduler and after staff actions. Returns the new state (null = not handled automatically).
 */
export const processExternalApplication = async (id: string, opts: { now?: Date } = {}): Promise<AutoState | null> => {
  if (isImpersonating()) return null; // "view as client" never writes
  try {
    const app = await loadApp(id);
    if (!app || app.inquiry.anonymizedAt) return null;
    if (app.status !== 'SUBMITTED') return (app.autoState as AutoState | null) ?? null; // staff took over / already forwarded
    if (!app.forwardConsentAt) {
      if (app.autoState !== 'NO_CONSENT') await setState(app.id, { autoState: 'NO_CONSENT' });
      return 'NO_CONSENT';
    }
    const state = app.autoState as AutoState | null;
    if (state && !OPEN_STATES.includes(state) && state !== 'NO_CONSENT') return state; // SENT / SENDING / STOPPED / DUPLICATE
    const now = opts.now ?? new Date();
    const { result, user, germanLevel } = await runCheck(app);
    // Conditional writes: a parallel run may already be sending this row; its result must not be overwritten.
    const stillOpen: Prisma.ExternalJobApplicationWhereInput = { id: app.id, autoSentAt: null, OR: [{ autoState: null }, { autoState: { in: [...OPEN_STATES, 'NO_CONSENT'] } }] };
    await prisma.externalJobApplication.updateMany({ where: stillOpen, data: { autoMissing: missingKey(result.missing) || null, autoCheckedAt: now } });
    if (!result.ok) {
      const moved = await prisma.externalJobApplication.updateMany({ where: stillOpen, data: { autoState: 'NEEDS_DATA', autoReason: null, autoNextAt: null } });
      if (!moved.count) return null;
      if (app.autoNotifiedKey !== missingKey(result.missing)) await tellClientMissing(app, result, user, germanLevel);
      return 'NEEDS_DATA';
    }
    if (await alreadySent(app)) {
      await setState(app.id, { autoState: 'DUPLICATE' });
      await audit(systemReqTyped, 'EXTERNAL_JOB_AUTO_DUPLICATE', `inquiry:${app.inquiryId}`, { listingUrl: app.listingUrl });
      return 'DUPLICATE';
    }
    // The "needs" note goes once everything is there.
    if (app.statusNote && app.autoNotifiedKey) await setState(app.id, { statusNote: null, autoNotifiedKey: null });
    await ensureCoverLetter(app);
    // No address, or the employer's server refused it (staff check the address in the READY queue).
    if (!app.employerEmail || app.autoReason === 'EMAIL_REJECTED') {
      // Conditional update: only the call that moves the row to READY tells the client.
      const moved = await prisma.externalJobApplication.updateMany({ where: { id: app.id, OR: [{ autoState: null }, { autoState: { not: 'READY' } }] }, data: { autoState: 'READY', autoReason: null, autoNextAt: null } });
      if (moved.count) {
        await audit(systemReqTyped, 'EXTERNAL_JOB_AUTO_READY', `inquiry:${app.inquiryId}`, {});
        await tellClientReady(app, user);
      }
      return 'READY';
    }
    const fresh = (await loadApp(app.id))!;
    const out = await sendToEmployer(fresh, await getAutoSendSettings(), null, now);
    return out === 'SENT' ? 'SENT' : out === 'NO_CV' ? 'NEEDS_DATA' : ((await prisma.externalJobApplication.findUnique({ where: { id }, select: { autoState: true } }))?.autoState as AutoState | null) ?? null;
  } catch (err) {
    console.error('[germany-jobs] automatic processing failed', id, err);
    return null;
  }
};

/** The client changed profile / CV / documents: re-check their open applications (never throws). */
export const recheckUserApplications = async (userId: string) => {
  if (isImpersonating()) return;
  try {
    const rows = await prisma.externalJobApplication.findMany({ where: { userId, status: 'SUBMITTED', autoState: { in: ['NEEDS_DATA', 'NO_CONSENT'] }, forwardConsentAt: { not: null } }, select: { id: true }, take: 20 });
    for (const r of rows) await processExternalApplication(r.id);
  } catch (err) {
    console.error('[germany-jobs] re-check failed', err);
  }
};

/**
 * Scheduler (jobs/germanyJobs.ts): queued applications that are due (next day / retry / sending switched on
 * again), periodic re-check of NEEDS_DATA (data changed outside the profile, e.g. passport OCR), and rows stuck in
 * SENDING after a crash (handed to staff instead of a second send).
 */
export const runExternalAutoSend = async (now = new Date()) => {
  const settings = await getAutoSendSettings();
  const stuck = await prisma.externalJobApplication.updateMany({
    where: { autoState: 'SENDING', autoSentAt: null, autoNextAt: { lt: new Date(now.getTime() - 30 * 60 * 1000) } },
    data: { autoState: 'READY', autoReason: 'SEND_FAILED', autoNextAt: null },
  });
  const due = await prisma.externalJobApplication.findMany({
    where: {
      autoState: 'QUEUED',
      status: 'SUBMITTED',
      OR: [{ autoNextAt: { lte: now } }, ...(settings.enabled ? [{ autoNextAt: null }] : [])],
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
    take: 100,
  });
  let sent = 0;
  for (const r of due) {
    const app = await loadApp(r.id);
    if (!app) continue;
    const out = await sendToEmployer(app, settings, null, now);
    if (out === 'SENT') sent++;
    if (out === 'QUEUED' && settings.enabled) {
      const after = await prisma.externalJobApplication.findUnique({ where: { id: r.id }, select: { autoReason: true } });
      if (after?.autoReason === 'DAILY_LIMIT') break; // the rest waits for tomorrow too
    }
  }
  const needs = await prisma.externalJobApplication.findMany({
    where: { autoState: 'NEEDS_DATA', status: 'SUBMITTED', createdAt: { gte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) } },
    orderBy: { autoCheckedAt: 'asc' },
    select: { id: true },
    take: 200,
  });
  for (const r of needs) await processExternalApplication(r.id, { now });
  return { sent, rechecked: needs.length, stuck: stuck.count };
};

// ─── Staff overrides (routes/admin/externalApplications.ts) ───────────────

export const staffSendNow = async (applicationId: string, staffId: string): Promise<SendOutcome> => {
  const app = await loadApp(applicationId);
  if (!app) return 'FAILED';
  if (app.autoSentAt) return 'BUSY';
  await ensureCoverLetter(app);
  const fresh = (await loadApp(applicationId))!;
  return sendToEmployer(fresh, await getAutoSendSettings(), staffId);
};

/** Staff sent the package outside the system ("Göndərildi"): FORWARDED + notice; never sends an e-mail. */
export const markSentByStaff = async (applicationId: string, staffId: string) => {
  const app = await loadApp(applicationId);
  if (!app || app.autoSentAt || app.inquiry.anonymizedAt) return false;
  const at = new Date();
  const claimed = await prisma.externalJobApplication.updateMany({ where: { id: app.id, autoSentAt: null, ...stateNotIn(['SENDING']) }, data: { autoState: 'SENT', autoSentAt: at, autoSentMode: 'MANUAL', autoReason: null, autoNextAt: null } });
  if (!claimed.count) return false;
  const forward = app.status === 'SUBMITTED';
  if (forward) {
    await prisma.$transaction([
      prisma.externalJobApplication.update({ where: { id: app.id }, data: { status: 'FORWARDED', statusNote: null, statusChangedAt: at } }),
      prisma.externalJobApplicationEvent.create({ data: { applicationId: app.id, status: 'FORWARDED', staffId, createdAt: at } }),
    ]);
    await notifyStatusChange(app, 'FORWARDED', null);
  }
  return true;
};

export const stopAutomation = (applicationId: string) =>
  prisma.externalJobApplication.updateMany({ where: { id: applicationId, ...stateNotIn(['SENDING']), autoSentAt: null }, data: { autoState: 'STOPPED', autoNextAt: null } });

/** Staff switch the automation on again for a stopped / duplicate row: runs the pipeline from the start. */
export const resumeAutomation = async (applicationId: string) => {
  await prisma.externalJobApplication.updateMany({ where: { id: applicationId, autoSentAt: null, autoState: { in: ['STOPPED', 'DUPLICATE', 'READY', 'QUEUED'] } }, data: { autoState: null, autoReason: null, autoNextAt: null } });
  return processExternalApplication(applicationId);
};

/** Client gave the forward consent later (portal). */
export const grantForwardConsent = async (applicationId: string) => {
  await prisma.externalJobApplication.updateMany({ where: { id: applicationId, forwardConsentAt: null }, data: { forwardConsentAt: new Date(), autoState: null } });
  return processExternalApplication(applicationId);
};

/** Staff view of the automation of one application. */
export const autoView = (app: {
  autoState: string | null;
  autoMissing: string | null;
  autoCheckedAt: Date | null;
  autoReason: string | null;
  autoNextAt: Date | null;
  autoSentAt: Date | null;
  autoSentMode: string | null;
  employerEmail: string | null;
  employerEmailSource: string | null;
  forwardConsentAt: Date | null;
  requiredGerman: string | null;
}) => ({
  state: (app.autoState as AutoState | null) ?? null,
  missing: readMissing(app.autoMissing),
  checkedAt: app.autoCheckedAt,
  reason: app.autoReason,
  nextAt: app.autoNextAt,
  sentAt: app.autoSentAt,
  sentMode: app.autoSentMode,
  employerEmail: app.employerEmail,
  employerEmailSource: app.employerEmailSource,
  forwardConsentAt: app.forwardConsentAt,
  requiredGerman: app.requiredGerman,
});
