import type { ReportFrequency, ReportSchedule, SavedReport } from '@prisma/client';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { hasMinRole } from '../../middleware/auth.js';
import { renderEmail, sendMail } from '../mailer.js';
import { getProfitSettings } from '../profitability/settings.js';
import { bakuDay, bakuParts, bakuTime, lastDayOfMonth } from './dates.js';
import { datasetFor, runReport, type ReportResult } from './engine.js';
import { buildXlsx, MIME, reportFilename, summaryLines } from './export.js';
import { maskerFor } from './mask.js';
import { getReportSettings, isAllowedExternal } from './settings.js';
import { L, pickLang, type Lang } from './types.js';

/**
 * Scheduled reports ("Send this report"): daily / weekly / monthly at HH:mm Asia/Baku. The job runs every few
 * minutes; for each active schedule it takes the latest occurrence that is due, and sends it once — the
 * (scheduleId, periodKey) unique row of ReportDelivery is the claim, so restarts and parallel instances never
 * send a period twice. An occurrence before the schedule was created is never sent (no catch-up mail on
 * creation). The report runs with the owner's rights (owner must still be an active ADMIN+); staff recipients
 * need the dataset's role; external addresses must be on the allow-list at send time and receive a copy with
 * every sensitive and personal column masked.
 */

const DAY = 24 * 60 * 60 * 1000;

type Sched = Pick<ReportSchedule, 'frequency' | 'weekday' | 'monthDay' | 'time'>;

const hm = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return { h: h || 0, m: m || 0 };
};

const monthOcc = (y: number, m: number, monthDay: number, time: string) => {
  const { h, m: min } = hm(time);
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return bakuTime(yy, mm, Math.min(Math.max(1, monthDay), lastDayOfMonth(yy, mm)), h, min);
};

/** The latest occurrence at or before `now`. */
export const latestOccurrence = (s: Sched, now: Date): Date => {
  const p = bakuParts(now);
  const { h, m } = hm(s.time);
  if (s.frequency === 'DAILY') {
    const t = bakuTime(p.y, p.m, p.d, h, m);
    return t <= now ? t : new Date(t.getTime() - DAY);
  }
  if (s.frequency === 'WEEKLY') {
    const wd = s.weekday ?? 1;
    const back = (p.wd - wd + 7) % 7;
    const t = bakuTime(p.y, p.m, p.d - back, h, m);
    return t <= now ? t : new Date(t.getTime() - 7 * DAY);
  }
  const t = monthOcc(p.y, p.m, s.monthDay ?? 1, s.time);
  return t <= now ? t : monthOcc(p.y, p.m - 1, s.monthDay ?? 1, s.time);
};

/** The next occurrence after `now`. */
export const nextOccurrence = (s: Sched, now: Date): Date => {
  const latest = latestOccurrence(s, now);
  if (s.frequency === 'DAILY') return new Date(latest.getTime() + DAY);
  if (s.frequency === 'WEEKLY') return new Date(latest.getTime() + 7 * DAY);
  const p = bakuParts(latest);
  return monthOcc(p.y, p.m + 1, s.monthDay ?? 1, s.time);
};

/** Period key of an occurrence (its Baku day; monthly: YYYY-MM). */
export const periodKey = (frequency: ReportFrequency, at: Date) => (frequency === 'MONTHLY' ? bakuDay(at).slice(0, 7) : bakuDay(at));

const TEXT = {
  subject: L('Hesabat: {name}', 'Bericht: {name}', 'Report: {name}', 'Отчёт: {name}'),
  intro: L(
    '"{name}" hesabatı ({date}) əlavədə Excel faylı kimi göndərilir.',
    'Im Anhang finden Sie den Bericht „{name}“ ({date}) als Excel-Datei.',
    'Attached is the report "{name}" ({date}) as an Excel file.',
    'Во вложении — отчёт «{name}» ({date}) в формате Excel.',
  ),
  summary: L('Qısa xülasə:', 'Kurzüberblick:', 'Summary:', 'Кратко:'),
  open: L('Hesabatı aç', 'Bericht öffnen', 'Open report', 'Открыть отчёт'),
  footer: L(
    'Bu məktub Triad Vision hesabat cədvəli ilə avtomatik göndərilib.',
    'Diese E-Mail wurde automatisch über einen Berichtsplan von Triad Vision versendet.',
    'This e-mail was sent automatically by a Triad Vision report schedule.',
    'Это письмо отправлено автоматически по расписанию отчётов Triad Vision.',
  ),
};

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

export const asIdList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export class DeliveryError extends Error {}

/** Builds and sends one delivery; returns the addresses mailed and the row count. */
export const deliverSchedule = async (s: ReportSchedule & { report: SavedReport }, now: Date) => {
  // The schedule runs with its creator's rights (a shared report may be scheduled by any admin who sees it).
  const ownerId = s.createdById ?? s.report.ownerId;
  const owner = ownerId ? await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, role: true, isActive: true, locale: true } }) : null;
  if (!owner || !owner.isActive || !hasMinRole(owner.role, 'ADMIN')) throw new DeliveryError('OWNER_NOT_ALLOWED');
  const def = datasetFor(s.report.dataset, owner.role);
  const { eurAzn } = await getProfitSettings();
  const ctx = { eurAzn, userId: owner.id, role: owner.role, now };

  const staffIds = asIdList(s.recipientUserIds);
  const staff = staffIds.length
    ? await prisma.user.findMany({ where: { id: { in: staffIds }, isActive: true }, select: { email: true, role: true, locale: true } })
    : [];
  const internal = staff.filter((u) => hasMinRole(u.role, def.minRole));
  const allow = (await getReportSettings()).externalAllowList;
  const external = asIdList(s.externalEmails).filter((e) => isAllowedExternal(e, allow));
  if (!internal.length && !external.length) throw new DeliveryError('NO_RECIPIENTS');

  const date = bakuDay(now).split('-').reverse().join('.');
  const sent: string[] = [];
  let rows = 0;
  // One run per audience (team / external, masked) and one workbook per language.
  const results = new Map<boolean, Promise<ReportResult>>();
  const files = new Map<string, Promise<Buffer>>();
  const resultFor = (ext: boolean) => {
    let p = results.get(ext);
    if (!p) results.set(ext, (p = maskerFor({ role: owner.role }, { external: ext }).then((m) => runReport(def, s.report.config, ctx, m))));
    return p;
  };
  const send = async (to: string, lang: Lang, ext: boolean) => {
    const r = await resultFor(ext);
    rows = r.grouped ? r.total : r.records;
    const fk = `${ext}:${lang}`;
    let f = files.get(fk);
    if (!f) files.set(fk, (f = buildXlsx(r, s.report.name, lang)));
    const file = await f;
    const name = s.report.name;
    const body = [fill(TEXT.intro[lang], { name, date }), [TEXT.summary[lang], ...summaryLines(r, lang).map((l) => `• ${l}`)].join('\n'), TEXT.footer[lang]].join('\n\n');
    const html = renderEmail(fill(TEXT.subject[lang], { name }), body, ext ? undefined : { label: TEXT.open[lang], url: `${config.clientUrl}/admin/reports?report=${s.report.id}` });
    await sendMail(to, `Triad Vision · ${fill(TEXT.subject[lang], { name })}`, html, [{ filename: reportFilename(name, 'xlsx', now), content: file, contentType: MIME.xlsx }]);
    sent.push(to);
  };
  for (const u of internal) await send(u.email, pickLang(u.locale), false);
  for (const e of external) await send(e, pickLang(owner.locale), true);
  return { sent, rows };
};

/** Job body: sends every due period once. Returns what happened (tests). */
export const runReportSchedules = async (now = new Date()) => {
  const result = { sent: 0, failed: 0, skipped: 0 };
  const schedules = await prisma.reportSchedule.findMany({ where: { active: true }, include: { report: true } });
  for (const s of schedules) {
    const at = latestOccurrence(s, now);
    if (at < s.createdAt) {
      result.skipped++;
      continue;
    }
    const key = periodKey(s.frequency, at);
    if (s.lastPeriodKey === key) continue;
    let deliveryId: string;
    try {
      deliveryId = (await prisma.reportDelivery.create({ data: { scheduleId: s.id, periodKey: key, status: 'PENDING' } })).id;
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') continue; // another run claimed this period
      throw err;
    }
    try {
      const { sent, rows } = await deliverSchedule(s, now);
      await prisma.reportDelivery.update({ where: { id: deliveryId }, data: { status: 'SENT', rows, recipients: sent } });
      result.sent++;
    } catch (err) {
      const code = err instanceof DeliveryError ? err.message : ((err as { code?: string }).code ?? String(err)).slice(0, 2000);
      if (!(err instanceof DeliveryError)) console.error('[reports] schedule failed', s.id, err);
      await prisma.reportDelivery.update({ where: { id: deliveryId }, data: { status: 'FAILED', error: code } });
      result.failed++;
    }
    await prisma.reportSchedule.update({ where: { id: s.id }, data: { lastPeriodKey: key, lastRunAt: now } });
  }
  return result;
};
