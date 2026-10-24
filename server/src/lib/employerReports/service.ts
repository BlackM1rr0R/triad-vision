import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { EmployerReport, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { renderEmail, sendMail } from '../mailer.js';
import { loadLetterhead } from '../docCreate/letterhead.js';
import { storedPath } from '../esign/service.js';
import { bakuParts } from '../reports/dates.js';
import { buildEmployerReportPdf } from './pdf.js';
import { computeReportStats, previousMonth, type ReportStats } from './stats.js';
import { REPORT_TEXTS, reportLangOf, type ReportLang } from './texts.js';

/**
 * Monthly employer report (EmployerReport, one per company and month):
 *  - job `employer-monthly-report` (hourly): from the 1st of each month 08:00 Asia/Baku (the time zone of every
 *    scheduled job) until the 5th, every ACTIVE company with at least one worker gets the report of the previous
 *    month. The unique (companyId, month) row is the claim — a restart or a second instance never sends twice;
 *    a failed generation releases the claim so the next hour retries.
 *  - language: German, English when the company's primary contact (oldest active portal user) uses English.
 *  - e-mail with the PDF attached and a link to the portal (login required) to every active portal user of the
 *    company who did not switch it off (Setting `employerReportOptOut:<userId>`) and keeps e-mail notifications
 *    on; the company's general address only when the company has no portal user.
 *  - staff can preview (not stored), regenerate (overwrites stats + file) and (re)send from the company page.
 * The PDF is stored in the private upload directory (never public), served only through authorised endpoints.
 */

export const OPT_OUT_PREFIX = 'employerReportOptOut:';
const SEND_FROM_HOUR = 8;
const LAST_SEND_DAY = 5;

const newKey = () => `${Date.now()}-employer-report-${crypto.randomBytes(12).toString('hex')}.pdf`;
const removeFile = (key: string | null | undefined) => (key ? fs.unlink(storedPath(key)).catch(() => undefined) : Promise.resolve());

/** Report language of a company: its primary contact's locale (de unless English). */
export const companyReportLang = async (companyId: string): Promise<ReportLang> => {
  const u = await prisma.user.findFirst({ where: { companyId, role: 'COMPANY', isActive: true }, orderBy: { createdAt: 'asc' }, select: { locale: true } });
  return reportLangOf(u?.locale);
};

/** Builds stats + PDF without storing anything (staff preview). */
export const renderReport = async (companyId: string, month: string, lang?: ReportLang, now = new Date()) => {
  const stats = await computeReportStats(companyId, month, lang ?? (await companyReportLang(companyId)), now);
  const pdf = await buildEmployerReportPdf(stats, await loadLetterhead());
  return { stats, pdf };
};

/** Companies the monthly job reports on: ACTIVE, with at least one worker that is not rejected / cancelled. */
export const reportableCompanies = async () =>
  prisma.company.findMany({ where: { status: 'ACTIVE', cases: { some: { status: { notIn: ['CANCELLED', 'REJECTED'] } } } }, select: { id: true, name: true } });

/**
 * Generates (or with `force` regenerates) the stored report of a month. Without force an existing report is
 * returned unchanged (idempotent); `created` tells whether this call produced it.
 */
export const generateReport = async (companyId: string, month: string, opts: { force?: boolean; lang?: ReportLang; now?: Date } = {}) => {
  const existing = await prisma.employerReport.findUnique({ where: { companyId_month: { companyId, month } } });
  if (existing && !opts.force) return { report: existing, created: false };
  const { stats, pdf } = await renderReport(companyId, month, opts.lang, opts.now);
  const key = newKey();
  await fs.mkdir(config.uploads.privateDir, { recursive: true });
  await fs.writeFile(storedPath(key), pdf);
  const data = { fileKey: key, stats: stats as unknown as Prisma.InputJsonValue };
  if (existing) {
    const report = await prisma.employerReport.update({ where: { id: existing.id }, data });
    await removeFile(existing.fileKey);
    return { report, created: false };
  }
  try {
    const report = await prisma.employerReport.create({ data: { companyId, month, ...data } });
    return { report, created: true };
  } catch (err) {
    await removeFile(key);
    // Another run created it in the meantime: keep theirs.
    if ((err as { code?: string }).code === 'P2002') return { report: await prisma.employerReport.findUniqueOrThrow({ where: { companyId_month: { companyId, month } } }), created: false };
    throw err;
  }
};

export const isOptedOut = async (userId: string) => !!(await prisma.setting.findUnique({ where: { key: `${OPT_OUT_PREFIX}${userId}` } }));

export const setOptOut = async (userId: string, optOut: boolean) => {
  const key = `${OPT_OUT_PREFIX}${userId}`;
  if (optOut) await prisma.setting.upsert({ where: { key }, create: { key, value: { at: new Date().toISOString() } }, update: {} });
  else await prisma.setting.deleteMany({ where: { key } });
};

/** Who gets the e-mail: active portal users with e-mail notifications on and no opt-out; else the company address. */
export const reportRecipients = async (companyId: string) => {
  const [company, users] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { email: true } }),
    prisma.user.findMany({ where: { companyId, role: 'COMPANY', isActive: true }, select: { id: true, email: true, locale: true, emailNotifications: true } }),
  ]);
  const optedOut = new Set(
    users.length
      ? (await prisma.setting.findMany({ where: { key: { in: users.map((u) => `${OPT_OUT_PREFIX}${u.id}`) } }, select: { key: true } })).map((s) => s.key.slice(OPT_OUT_PREFIX.length))
      : [],
  );
  const out = users.filter((u) => u.emailNotifications !== false && !optedOut.has(u.id)).map((u) => ({ email: u.email, lang: reportLangOf(u.locale) }));
  if (!users.length && company?.email) out.push({ email: company.email, lang: 'de' });
  return out;
};

/** E-mails the stored report (PDF attached + portal link). Returns the number of recipients; sets sentAt when ≥ 1. */
export const sendReport = async (report: EmployerReport) => {
  if (!report.fileKey) return 0;
  const stats = report.stats as unknown as ReportStats;
  const recipients = await reportRecipients(report.companyId);
  if (!recipients.length) return 0;
  let pdf: Buffer;
  try {
    pdf = await fs.readFile(storedPath(report.fileKey));
  } catch {
    return 0;
  }
  const fileName = REPORT_TEXTS[stats.lang ?? 'de'].fileName(report.month);
  for (const r of recipients) {
    const T = REPORT_TEXTS[r.lang];
    const body = T.mailBody({
      company: stats.company?.name ?? '',
      month: report.month,
      working: stats.totals?.working ?? 0,
      inProcess: stats.totals?.inProcess ?? 0,
      arrivals: stats.period?.arrivals ?? 0,
      openItems: stats.totals?.openItems ?? 0,
      atRisk: stats.totals?.atRisk ?? 0,
    });
    await sendMail(r.email, `Triad Vision · ${T.mailSubject(report.month)}`, renderEmail(T.mailTitle(report.month), body, { label: T.mailCta, url: `${config.clientUrl}/company/workers?view=reports` }), [
      { filename: fileName, content: pdf, contentType: 'application/pdf' },
    ]);
  }
  await prisma.employerReport.update({ where: { id: report.id }, data: { sentAt: new Date() } });
  return recipients.length;
};

/** Is the monthly send window open? (1st 08:00 → 5th, Asia/Baku) */
export const sendWindowOpen = (now = new Date()) => {
  const p = bakuParts(now);
  return p.d <= LAST_SEND_DAY && (p.d > 1 || p.h >= SEND_FROM_HOUR);
};

/** Hourly job: the previous month's report for every reportable company, once. */
export const runMonthlyEmployerReports = async (now = new Date()) => {
  if (!sendWindowOpen(now)) return { generated: 0, sent: 0, skipped: 'NOT_DUE' as const };
  const month = previousMonth(now);
  const companies = await reportableCompanies();
  let generated = 0;
  let sent = 0;
  for (const c of companies) {
    try {
      const { report, created } = await generateReport(c.id, month, { now });
      if (!created) continue;
      generated++;
      if (await sendReport(report)) sent++;
    } catch (err) {
      console.error('[job:employer-monthly-report] failed for', c.id, err);
    }
  }
  return { generated, sent, skipped: null };
};

/** List row (no file key). */
export const reportView = (r: EmployerReport) => {
  const s = r.stats as unknown as Partial<ReportStats>;
  return { id: r.id, month: r.month, lang: s.lang ?? 'de', createdAt: r.createdAt, sentAt: r.sentAt, hasFile: !!r.fileKey, totals: s.totals ?? null, period: s.period ?? null };
};

export const reportFileName = (r: EmployerReport) => REPORT_TEXTS[((r.stats as unknown as Partial<ReportStats>).lang ?? 'de') as ReportLang].fileName(r.month);
