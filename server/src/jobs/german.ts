import type { GermanExamProvider, Locale } from '@prisma/client';
import { prisma } from '../db.js';
import { registerJob } from '../lib/scheduler.js';
import { notifyUser } from '../lib/notifications.js';
import { claimReminder } from './reminders.js';

/**
 * German language reminders, run hourly (each sent once; the ReminderLog key carries the date, so a
 * moved exam / course gets fresh reminders):
 *  - exam registration deadline within 3 days while the exam is still PLANNED (not registered yet);
 *  - the day before the exam (exam within the next 24 h) while PLANNED / REGISTERED;
 *  - a PLANNED course starting within 2 days.
 * Takes `now` so tests can drive time.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const DEADLINE_DAYS = 3;
export const COURSE_DAYS = 2;

const PROVIDER: Record<GermanExamProvider, string> = { GOETHE: 'Goethe', TELC: 'telc', OESD: 'ÖSD', TESTDAF: 'TestDaF', OTHER: '' };
const fmt = (d: Date, locale: Locale) =>
  new Intl.DateTimeFormat(locale === 'az' ? 'az-Latn-AZ' : locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Baku' }).format(d);

type Kind = 'deadline' | 'exam' | 'course';
const TEXTS: Record<Locale, Record<Kind, (p: { what: string; date: string }) => { title: string; body: string }>> = {
  az: {
    deadline: (p) => ({ title: 'İmtahan qeydiyyatı bitir', body: `${p.what} imtahanına qeydiyyatın son tarixi: ${p.date}. Qeydiyyatdan keçməyi unutmayın.` }),
    exam: (p) => ({ title: 'Sabah imtahanınız var', body: `${p.what} — ${p.date}. Pasportunuzu və qeydiyyat təsdiqini götürün. Uğurlar!` }),
    course: (p) => ({ title: 'Kursunuz tezliklə başlayır', body: `${p.what} — başlama tarixi: ${p.date}.` }),
  },
  de: {
    deadline: (p) => ({ title: 'Anmeldeschluss für Ihre Prüfung', body: `Anmeldeschluss für ${p.what}: ${p.date}. Bitte melden Sie sich rechtzeitig an.` }),
    exam: (p) => ({ title: 'Morgen ist Ihre Prüfung', body: `${p.what} — ${p.date}. Bitte bringen Sie Ihren Reisepass und die Anmeldebestätigung mit. Viel Erfolg!` }),
    course: (p) => ({ title: 'Ihr Kurs beginnt bald', body: `${p.what} — Beginn: ${p.date}.` }),
  },
  en: {
    deadline: (p) => ({ title: 'Exam registration closes soon', body: `Registration deadline for ${p.what}: ${p.date}. Please register in time.` }),
    exam: (p) => ({ title: 'Your exam is tomorrow', body: `${p.what} — ${p.date}. Bring your passport and the registration confirmation. Good luck!` }),
    course: (p) => ({ title: 'Your course starts soon', body: `${p.what} — starts on ${p.date}.` }),
  },
  ru: {
    deadline: (p) => ({ title: 'Скоро закончится регистрация на экзамен', body: `Последний день регистрации на ${p.what}: ${p.date}. Пожалуйста, зарегистрируйтесь вовремя.` }),
    exam: (p) => ({ title: 'Завтра ваш экзамен', body: `${p.what} — ${p.date}. Возьмите паспорт и подтверждение регистрации. Удачи!` }),
    course: (p) => ({ title: 'Ваш курс скоро начнётся', body: `${p.what} — начало: ${p.date}.` }),
  },
};

const safe = (p: Promise<unknown>) => p.catch((e) => console.error('[job:german] notification failed', e));

const send = async (userId: string, locale: Locale, kind: Kind, what: string, date: Date) => {
  const t = (TEXTS[locale] ?? TEXTS.az)[kind]({ what, date: fmt(date, locale) });
  await safe(notifyUser(userId, { type: `GERMAN_${kind.toUpperCase()}_REMINDER`, title: t.title, body: t.body, link: '/account/german' }));
};

export const runGermanReminders = async (now = new Date()) => {
  let sent = 0;
  const user = { select: { id: true, locale: true, isActive: true } } as const;

  const deadlines = await prisma.germanExam.findMany({
    where: { status: 'PLANNED', registrationDeadline: { gt: now, lte: new Date(now.getTime() + DEADLINE_DAYS * DAY) } },
    include: { user },
  });
  for (const e of deadlines) {
    if (!e.user.isActive) continue;
    if (!(await claimReminder(`german-deadline:${e.id}:${e.registrationDeadline!.toISOString()}`, now))) continue;
    await send(e.userId, e.user.locale, 'deadline', `${PROVIDER[e.provider]} ${e.level}`.trim(), e.registrationDeadline!);
    sent++;
  }

  const exams = await prisma.germanExam.findMany({
    where: { status: { in: ['PLANNED', 'REGISTERED'] }, examDate: { gt: now, lte: new Date(now.getTime() + DAY) } },
    include: { user },
  });
  for (const e of exams) {
    if (!e.user.isActive) continue;
    if (!(await claimReminder(`german-exam:${e.id}:${e.examDate!.toISOString()}`, now))) continue;
    await send(e.userId, e.user.locale, 'exam', [`${PROVIDER[e.provider]} ${e.level}`.trim(), e.location].filter(Boolean).join(', '), e.examDate!);
    sent++;
  }

  const courses = await prisma.germanCourse.findMany({
    where: { status: 'PLANNED', startsAt: { gt: now, lte: new Date(now.getTime() + COURSE_DAYS * DAY) } },
    include: { user },
  });
  for (const c of courses) {
    if (!c.user.isActive) continue;
    if (!(await claimReminder(`german-course:${c.id}:${c.startsAt!.toISOString()}`, now))) continue;
    await send(c.userId, c.user.locale, 'course', `${c.school} (${c.level})`, c.startsAt!);
    sent++;
  }
  return sent;
};

registerJob({ name: 'german-reminders', everyMs: HOUR, run: async () => void (await runGermanReminders()) });
