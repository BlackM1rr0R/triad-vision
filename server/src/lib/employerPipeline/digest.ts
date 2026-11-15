import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { renderEmail, sendMail } from '../mailer.js';
import { bakuDay, bakuMidnight, bakuParts } from '../reports/dates.js';
import { buildPipeline, type BlockerCode, type Pipeline } from './service.js';
import { PIPELINE_STAGES, type PipelineStage } from './stages.js';

/**
 * Weekly pipeline digest (opt-in per employer portal user, Setting `employerPipelineDigest:<userId>`):
 * job `employer-pipeline-digest` (hourly) sends it on Mondays from 08:00 Asia/Baku to every opted-in active
 * portal user of an ACTIVE company (suspended companies get nothing) who keeps e-mail notifications on.
 * The claim row `employerPipelineDigestSent:<userId>:<monday>` (unique Setting key) makes a restart or a second
 * instance never send twice; older claim rows are removed by the next run.
 * Content: counts per stage, expected arrivals of the next 30 days and the employer's open items — the same
 * anonymised data as the portal (lib/employerPipeline/service).
 */

export const DIGEST_PREFIX = 'employerPipelineDigest:';
export const DIGEST_SENT_PREFIX = 'employerPipelineDigestSent:';
const SEND_FROM_HOUR = 8;
const DAY = 24 * 60 * 60 * 1000;

export type DigestLang = 'de' | 'en' | 'az' | 'ru';
export const digestLangOf = (l: string | null | undefined): DigestLang => (l === 'en' || l === 'az' || l === 'ru' ? l : 'de');

const TAGS: Record<DigestLang, string> = { de: 'de-DE', en: 'en-GB', az: 'az-Latn-AZ', ru: 'ru-RU' };
const fmtDay = (lang: DigestLang, d: Date) => new Intl.DateTimeFormat(TAGS[lang], { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }).format(d);

interface DigestTexts {
  subject: string;
  title: string;
  hello: (name: string) => string;
  intro: (total: number) => string;
  stage: Record<PipelineStage, string>;
  arrivals: string;
  noArrivals: string;
  estimated: string;
  todo: string;
  noTodo: string;
  blocker: Record<BlockerCode, string>;
  cta: string;
  footer: string;
}

export const DIGEST_TEXTS: Record<DigestLang, DigestTexts> = {
  de: {
    subject: 'Wochenübersicht Ihrer Kandidaten',
    title: 'Ihre Kandidaten – Wochenübersicht',
    hello: (n) => `Guten Tag ${n},`,
    intro: (t) => `hier ist der aktuelle Stand Ihrer ${t} Kandidaten bei Triad Vision.`,
    stage: { CONTRACT: 'Vertrag', RECOGNITION: 'Anerkennung', EMBASSY: 'Botschaftsunterlagen', DECISION: 'Visumentscheidung', FLIGHT: 'Anreise', ARRIVED: 'Angekommen', FIRST_DAY: 'Erster Arbeitstag' },
    arrivals: 'Ankünfte in den nächsten 30 Tagen:',
    noArrivals: 'In den nächsten 30 Tagen ist keine Ankunft geplant.',
    estimated: 'geschätzt',
    todo: 'Von Ihnen zu erledigen:',
    noTodo: 'Aktuell ist nichts von Ihnen zu erledigen.',
    blocker: {
      CONTRACT_UNSIGNED: 'Arbeitsvertrag unterschreiben',
      SIGN_DOCUMENT: 'Dokument unterschreiben',
      COMPLETE_FORM: 'Formular ausfüllen',
      ACCELERATED_STEP: 'Schritt im beschleunigten Fachkräfteverfahren',
      ANSWER_CHECKIN: 'Check-in beantworten',
      ARRIVAL_CHECKLIST: 'Ankunfts-Checkliste vervollständigen',
    },
    cta: 'Pipeline öffnen',
    footer: 'Sie erhalten diese E-Mail, weil Sie die Wochenübersicht im Unternehmensbereich eingeschaltet haben. Abschalten: Unternehmensbereich → Pipeline → Wochenübersicht per E-Mail.',
  },
  en: {
    subject: 'Weekly overview of your candidates',
    title: 'Your candidates – weekly overview',
    hello: (n) => `Hello ${n},`,
    intro: (t) => `here is the current status of your ${t} candidates with Triad Vision.`,
    stage: { CONTRACT: 'Contract', RECOGNITION: 'Recognition', EMBASSY: 'Embassy documents', DECISION: 'Visa decision', FLIGHT: 'Travel', ARRIVED: 'Arrived', FIRST_DAY: 'First work day' },
    arrivals: 'Arrivals in the next 30 days:',
    noArrivals: 'No arrival planned in the next 30 days.',
    estimated: 'estimated',
    todo: 'Waiting for you:',
    noTodo: 'Nothing is waiting for you at the moment.',
    blocker: {
      CONTRACT_UNSIGNED: 'Sign the employment contract',
      SIGN_DOCUMENT: 'Sign a document',
      COMPLETE_FORM: 'Complete a form',
      ACCELERATED_STEP: 'Step in the accelerated skilled-worker procedure',
      ANSWER_CHECKIN: 'Answer a check-in',
      ARRIVAL_CHECKLIST: 'Complete the arrival checklist',
    },
    cta: 'Open pipeline',
    footer: 'You receive this e-mail because you switched on the weekly overview in the employer portal. Switch it off: employer portal → Pipeline → weekly e-mail overview.',
  },
  az: {
    subject: 'Namizədlərinizin həftəlik icmalı',
    title: 'Namizədləriniz – həftəlik icmal',
    hello: (n) => `Salam, ${n}!`,
    intro: (t) => `Triad Vision-dakı ${t} namizədinizin cari vəziyyəti.`,
    stage: { CONTRACT: 'Müqavilə', RECOGNITION: 'Tanınma', EMBASSY: 'Səfirlik sənədləri', DECISION: 'Viza qərarı', FLIGHT: 'Səfər', ARRIVED: 'Gəlib', FIRST_DAY: 'İlk iş günü' },
    arrivals: 'Növbəti 30 gündə gəlişlər:',
    noArrivals: 'Növbəti 30 gündə gəliş planlaşdırılmayıb.',
    estimated: 'təxmini',
    todo: 'Sizdən gözlənilir:',
    noTodo: 'Hazırda sizdən heç nə gözlənilmir.',
    blocker: {
      CONTRACT_UNSIGNED: 'Əmək müqaviləsini imzalayın',
      SIGN_DOCUMENT: 'Sənədi imzalayın',
      COMPLETE_FORM: 'Formu doldurun',
      ACCELERATED_STEP: 'Sürətləndirilmiş prosedurda addım',
      ANSWER_CHECKIN: 'Check-in-ə cavab verin',
      ARRIVAL_CHECKLIST: 'Gəliş yoxlama siyahısını tamamlayın',
    },
    cta: 'Pipeline-ı aç',
    footer: 'Bu e-poçtu işəgötürən kabinetində həftəlik icmalı aktiv etdiyiniz üçün alırsınız. Söndürmək: kabinet → Pipeline → həftəlik e-poçt icmalı.',
  },
  ru: {
    subject: 'Еженедельный обзор ваших кандидатов',
    title: 'Ваши кандидаты – обзор за неделю',
    hello: (n) => `Здравствуйте, ${n}!`,
    intro: (t) => `текущий статус ваших кандидатов в Triad Vision: ${t}.`,
    stage: { CONTRACT: 'Договор', RECOGNITION: 'Признание', EMBASSY: 'Документы для посольства', DECISION: 'Решение по визе', FLIGHT: 'Поездка', ARRIVED: 'Прибыл', FIRST_DAY: 'Первый рабочий день' },
    arrivals: 'Приезды в ближайшие 30 дней:',
    noArrivals: 'В ближайшие 30 дней приездов не запланировано.',
    estimated: 'ориентировочно',
    todo: 'Ожидает вас:',
    noTodo: 'Сейчас от вас ничего не требуется.',
    blocker: {
      CONTRACT_UNSIGNED: 'Подписать трудовой договор',
      SIGN_DOCUMENT: 'Подписать документ',
      COMPLETE_FORM: 'Заполнить форму',
      ACCELERATED_STEP: 'Шаг ускоренной процедуры',
      ANSWER_CHECKIN: 'Ответить на check-in',
      ARRIVAL_CHECKLIST: 'Заполнить чек-лист приезда',
    },
    cta: 'Открыть pipeline',
    footer: 'Вы получаете это письмо, потому что включили еженедельный обзор в кабинете работодателя. Отключить: кабинет → Pipeline → еженедельный обзор по e-mail.',
  },
};

/** Plain-text body (paragraphs separated by blank lines, as renderEmail expects). */
export const digestBody = (p: Pipeline, lang: DigestLang, name: string, now = new Date()) => {
  const T = DIGEST_TEXTS[lang];
  const parts: string[] = [`${T.hello(name)}\n${T.intro(p.summary.total)}`];
  parts.push(PIPELINE_STAGES.filter((s) => p.summary.byStage[s] > 0).map((s) => `${T.stage[s]}: ${p.summary.byStage[s]}`).join('\n'));
  const until = now.getTime() + 30 * DAY;
  const arrivals = p.cards
    .filter((c) => c.expectedArrival && c.expectedArrival.source !== 'ACTUAL' && c.expectedArrival.at.getTime() >= now.getTime() && c.expectedArrival.at.getTime() <= until)
    .sort((a, b) => a.expectedArrival!.at.getTime() - b.expectedArrival!.at.getTime());
  parts.push(
    arrivals.length
      ? [T.arrivals, ...arrivals.map((c) => `• ${c.name} (${c.position}) – ${fmtDay(lang, c.expectedArrival!.at)}${c.expectedArrival!.source === 'ESTIMATE' ? ` (${T.estimated})` : ''}`)].join('\n')
      : T.noArrivals,
  );
  const todo = p.cards.flatMap((c) => c.blockers.map((b) => `• ${c.name}: ${T.blocker[b.code]}${b.title && b.code !== 'ACCELERATED_STEP' ? ` – ${b.title}` : ''}`));
  parts.push(todo.length ? [T.todo, ...todo.slice(0, 30)].join('\n') : T.noTodo);
  parts.push(T.footer);
  return parts.filter(Boolean).join('\n\n');
};

export const isDigestOn = async (userId: string) => !!(await prisma.setting.findUnique({ where: { key: `${DIGEST_PREFIX}${userId}` } }));

export const setDigest = async (userId: string, on: boolean) => {
  const key = `${DIGEST_PREFIX}${userId}`;
  if (on) await prisma.setting.upsert({ where: { key }, create: { key, value: { at: new Date().toISOString() } }, update: {} });
  else await prisma.setting.deleteMany({ where: { key } });
};

/** Monday of the Baku week of `now` (YYYY-MM-DD) and whether the send window (Monday ≥ 08:00) is open. */
export const digestWeek = (now = new Date()) => {
  const p = bakuParts(now);
  const monday = bakuDay(bakuMidnight(p.y, p.m, p.d - (p.wd - 1)));
  return { monday, open: p.wd === 1 && p.h >= SEND_FROM_HOUR };
};

/** Sends one user's digest now (also used by the job). Returns false when nothing was sent. */
export const sendDigest = async (user: { id: string; email: string; firstName: string; lastName: string; locale: string | null; companyId: string }, now = new Date()) => {
  const p = await buildPipeline(user.companyId, now, user.id);
  if (!p.cards.length) return false;
  const lang = digestLangOf(user.locale);
  const T = DIGEST_TEXTS[lang];
  const name = `${user.firstName} ${user.lastName}`.trim();
  await sendMail(user.email, `Triad Vision · ${T.subject}`, renderEmail(T.title, digestBody(p, lang, name, now), { label: T.cta, url: `${config.clientUrl}/company/pipeline` }));
  return true;
};

/** Hourly job: on Monday from 08:00 Baku, one digest per opted-in user and week. */
export const runPipelineDigests = async (now = new Date()) => {
  const week = digestWeek(now);
  if (!week.open) return { sent: 0, skipped: 'NOT_DUE' as const };
  await prisma.setting.deleteMany({ where: { key: { startsWith: DIGEST_SENT_PREFIX }, NOT: { key: { endsWith: `:${week.monday}` } } } });
  const optIns = await prisma.setting.findMany({ where: { key: { startsWith: DIGEST_PREFIX } }, select: { key: true } });
  const ids = optIns.map((s) => s.key.slice(DIGEST_PREFIX.length)).filter(Boolean);
  if (!ids.length) return { sent: 0, skipped: null };
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, role: 'COMPANY', isActive: true, emailNotifications: true, company: { status: 'ACTIVE' } },
    select: { id: true, email: true, firstName: true, lastName: true, locale: true, companyId: true },
  });
  let sent = 0;
  for (const u of users) {
    if (!u.companyId) continue;
    const key = `${DIGEST_SENT_PREFIX}${u.id}:${week.monday}`;
    try {
      await prisma.setting.create({ data: { key, value: { at: now.toISOString() } } });
    } catch {
      continue; // already claimed this week
    }
    try {
      if (await sendDigest({ ...u, companyId: u.companyId }, now)) sent++;
    } catch (err) {
      console.error('[job:employer-pipeline-digest] failed for', u.id, err);
    }
  }
  return { sent, skipped: null };
};
