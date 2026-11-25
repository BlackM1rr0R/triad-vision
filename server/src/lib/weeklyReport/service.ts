import { prisma } from '../../db.js';
import { renderEmail, sendMail } from '../mailer.js';
import { getBrand } from '../brand/index.js';
import { pickLang, type Lang } from '../reports/types.js';
import { isSendTime, previousWeek, reminderKey, reportWeek, weekKpis } from './kpis.js';
import { WEEKLY_TEXT, buildWeeklyReportPdf } from './pdf.js';

export const buildWeeklyPdfFor = async (now: Date, lang: Lang = 'az') => {
  const week = reportWeek(now);
  const [current, previous, brand] = await Promise.all([weekKpis(week), weekKpis(previousWeek(week)), getBrand()]);
  const pdf = await buildWeeklyReportPdf({ weekKey: week.key, start: week.start, end: week.end, current, previous, lang, brandName: brand.name });
  return { pdf, week, current, previous };
};

const mailTo = async (u: { email: string; locale: string | null }, pdfByLang: Map<string, Buffer>, now: Date, weekKey: string) => {
  const lang = pickLang(u.locale);
  let pdf = pdfByLang.get(lang);
  if (!pdf) pdfByLang.set(lang, (pdf = (await buildWeeklyPdfFor(now, lang)).pdf));
  const subject = `${WEEKLY_TEXT.subject[lang]} ${weekKey}`;
  await sendMail(u.email, `Triad Vision · ${subject}`, renderEmail(subject, WEEKLY_TEXT.body[lang]), [{ filename: `weekly-report-${weekKey}.pdf`, content: pdf, contentType: 'application/pdf' }]);
};

/** Job body: Monday from 07:00 Berlin, once per report week (ReminderLog claim `weekly-report:<ISO week>`). */
export const runWeeklyReport = async (now = new Date()) => {
  if (!isSendTime(now)) return { sent: 0, reason: 'NOT_DUE' as const };
  const week = reportWeek(now);
  const key = reminderKey(week.key);
  try {
    await prisma.reminderLog.create({ data: { key, sentAt: now } });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return { sent: 0, reason: 'ALREADY_SENT' as const };
    throw err;
  }
  try {
    const admins = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { email: true, locale: true } });
    const cache = new Map<string, Buffer>();
    let sent = 0;
    for (const a of admins) {
      try {
        await mailTo(a, cache, now, week.key);
        sent++;
      } catch (err) {
        console.error('[weekly-report] mail failed', err);
      }
    }
    if (admins.length && sent === 0) throw new Error('NOTHING_SENT');
    return { sent, reason: 'OK' as const };
  } catch (err) {
    await prisma.reminderLog.deleteMany({ where: { key } }); // nothing went out: the next run retries
    throw err;
  }
};

/** "Send now": the report to one address (the requesting super admin); no week marker. */
export const sendWeeklyNow = async (to: { email: string; locale: string | null }, now = new Date()) => {
  await mailTo(to, new Map(), now, reportWeek(now).key);
};
