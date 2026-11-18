import type { Request } from 'express';
import type { JobAlert, Prisma, Vacancy } from '@prisma/client';
import { Prisma as P } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { GERMAN_LEVELS, PROFESSION_KEYS, germanRank } from '../matching.js';
import { openVacancyWhere } from '../vacancies.js';
import { escapeHtml, localizedPath, pick } from '../seo.js';
import { SEO_LOCALES, type SeoLocale } from '../seoCatalogue.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyStaff, notifyUser } from '../notifications.js';
import { recordConsent } from '../privacy/consents.js';
import { onInquiryCreated } from '../assignment/inquiry.js';
import { attachLeadContext, type utmSchema } from '../marketing/leadScoring.js';
import { placesFor } from '../vacancyPlaces/service.js';
import { toCsv } from '../bulk/index.js';
import { ALERT_MAIL, PROFESSION_LABELS, professionLabel } from './texts.js';
import { WAITLIST_MAIL } from './waitlistTexts.js';
import { alertToken, hashToken, manageUrl, maskEmail, vacancyProfession } from './service.js';

/**
 * Vacancy waitlist — "Uyğun vakansiya açılanda xəbər ver". An extension of the job alerts (model JobAlert with
 * waitlist = true), shown where no suitable vacancy with a free place exists (portal start card, /jobs, a full
 * vacancy, the profession hubs /for/*, the start plan):
 *
 *  - one canonical profession (lib/matching.ts), an optional city or Bundesland, an optional German level;
 *  - signed-in clients: tied to the account (no double opt-in, in-app notification + e-mail per the account's
 *    e-mail setting); visitors: e-mail + consent checkbox, double opt-in through the existing job-alert confirmation
 *    link (/job-alert?token=…&action=confirm), and the sign-up becomes a lead (Inquiry, source "waitlist:<profession>");
 *  - when a vacancy is published / opened or has free places again (publish hook + scheduler, see runWaitlistNotices)
 *    every matching entry is told once per vacancy per person (JobAlertNotice, unique recipient + vacancy);
 *  - unsubscribing (link in every e-mail, or deleting the entry in the portal) stops everything; unconfirmed entries are
 *    deleted after 7 days and unsubscribed ones 30 days later with the other job alerts (purgeJobAlerts);
 *  - staff see the demand per profession in admin › Vacancies and export it (contacts masked without the
 *    "clients" export permission).
 */

export const MAX_WAITLIST_PER_PERSON = 5;
const DAY = 24 * 60 * 60 * 1000;

const siteLocale = (raw: unknown): SeoLocale => ((SEO_LOCALES as readonly string[]).includes(String(raw)) ? (raw as SeoLocale) : 'az');
const stringList = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
/** Staff languages are az/de/en/ru: Turkish leads go to the Azerbaijani team, Ukrainian ones to the Russian team. */
const staffLocale = (lng: SeoLocale): string => (lng === 'tr' ? 'az' : lng === 'uk' ? 'ru' : lng);

export const waitlistInputSchema = z.object({
  profession: z.enum(PROFESSION_KEYS as [string, ...string[]]),
  city: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  germanLevel: z.enum(GERMAN_LEVELS).nullable().optional(),
  lng: z.string().optional(),
});
export type WaitlistInput = z.infer<typeof waitlistInputSchema>;

// ─── Place matching (pure) ──────────────────────────────────────────────

/** "München" → "muenchen", "Baden-Württemberg" → "badenwuerttemberg" (umlauts folded, accents and punctuation dropped). */
export const normalizePlace = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * The 16 Bundesländer (German, English and common Azerbaijani / Russian spellings) with their larger cities, so a
 * preference "Bayern" matches a vacancy in Nürnberg. Vacancy cities outside these lists only match by name.
 */
export const GERMAN_STATES: { names: string[]; cities: string[] }[] = [
  { names: ['Baden-Württemberg', 'Baden-Wuerttemberg', 'Баден-Вюртемберг'], cities: ['Stuttgart', 'Mannheim', 'Karlsruhe', 'Freiburg', 'Heidelberg', 'Ulm', 'Heilbronn', 'Pforzheim', 'Reutlingen', 'Esslingen', 'Ludwigsburg', 'Tübingen', 'Konstanz', 'Sindelfingen', 'Böblingen', 'Friedrichshafen', 'Aalen', 'Offenburg', 'Villingen-Schwenningen'] },
  { names: ['Bayern', 'Bavaria', 'Bavariya', 'Бавария'], cities: ['München', 'Munich', 'Nürnberg', 'Nuremberg', 'Augsburg', 'Regensburg', 'Ingolstadt', 'Würzburg', 'Fürth', 'Erlangen', 'Bamberg', 'Bayreuth', 'Landshut', 'Passau', 'Rosenheim', 'Kempten', 'Aschaffenburg', 'Schweinfurt', 'Neu-Ulm'] },
  { names: ['Berlin', 'Берлин'], cities: ['Berlin'] },
  { names: ['Brandenburg', 'Бранденбург'], cities: ['Potsdam', 'Cottbus', 'Brandenburg an der Havel', 'Frankfurt (Oder)', 'Oranienburg', 'Eberswalde'] },
  { names: ['Bremen', 'Бремен'], cities: ['Bremen', 'Bremerhaven'] },
  { names: ['Hamburg', 'Гамбург'], cities: ['Hamburg'] },
  { names: ['Hessen', 'Hesse', 'Гессен'], cities: ['Frankfurt', 'Frankfurt am Main', 'Wiesbaden', 'Kassel', 'Darmstadt', 'Offenbach', 'Hanau', 'Gießen', 'Marburg', 'Fulda', 'Rüsselsheim', 'Bad Homburg'] },
  { names: ['Mecklenburg-Vorpommern', 'Мекленбург-Передняя Померания'], cities: ['Rostock', 'Schwerin', 'Neubrandenburg', 'Stralsund', 'Greifswald', 'Wismar'] },
  { names: ['Niedersachsen', 'Lower Saxony', 'Нижняя Саксония'], cities: ['Hannover', 'Hanover', 'Braunschweig', 'Oldenburg', 'Osnabrück', 'Wolfsburg', 'Göttingen', 'Salzgitter', 'Hildesheim', 'Delmenhorst', 'Wilhelmshaven', 'Lüneburg', 'Celle', 'Emden'] },
  { names: ['Nordrhein-Westfalen', 'North Rhine-Westphalia', 'NRW', 'Северный Рейн-Вестфалия'], cities: ['Köln', 'Cologne', 'Düsseldorf', 'Dortmund', 'Essen', 'Duisburg', 'Bochum', 'Wuppertal', 'Bielefeld', 'Bonn', 'Münster', 'Mönchengladbach', 'Gelsenkirchen', 'Aachen', 'Krefeld', 'Oberhausen', 'Hagen', 'Hamm', 'Mülheim', 'Leverkusen', 'Solingen', 'Herne', 'Neuss', 'Paderborn', 'Recklinghausen', 'Siegen', 'Gütersloh'] },
  { names: ['Rheinland-Pfalz', 'Rhineland-Palatinate', 'Рейнланд-Пфальц'], cities: ['Mainz', 'Ludwigshafen', 'Koblenz', 'Trier', 'Kaiserslautern', 'Worms', 'Neuwied', 'Speyer'] },
  { names: ['Saarland', 'Саар'], cities: ['Saarbrücken', 'Neunkirchen', 'Homburg', 'Völklingen', 'Saarlouis'] },
  { names: ['Sachsen', 'Saxony', 'Саксония'], cities: ['Leipzig', 'Dresden', 'Chemnitz', 'Zwickau', 'Plauen', 'Görlitz', 'Freiberg', 'Bautzen'] },
  { names: ['Sachsen-Anhalt', 'Saxony-Anhalt', 'Саксония-Анхальт'], cities: ['Magdeburg', 'Halle', 'Halle (Saale)', 'Dessau', 'Dessau-Roßlau', 'Wittenberg'] },
  { names: ['Schleswig-Holstein', 'Шлезвиг-Гольштейн'], cities: ['Kiel', 'Lübeck', 'Flensburg', 'Neumünster', 'Norderstedt', 'Elmshorn'] },
  { names: ['Thüringen', 'Thuringia', 'Тюрингия'], cities: ['Erfurt', 'Jena', 'Gera', 'Weimar', 'Gotha', 'Nordhausen', 'Eisenach'] },
];

const STATE_INDEX = GERMAN_STATES.map((s) => ({ names: s.names.map(normalizePlace).filter(Boolean), cities: s.cities.map(normalizePlace).filter(Boolean) }));

const sameOrContains = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a)));

/**
 * Does a vacancy's city fit the preference? No preference, or a vacancy without a city: yes. Else the city names
 * match (umlauts folded; "Frankfurt" ~ "Frankfurt am Main"), or the preference names a Bundesland and the vacancy is in
 * one of its listed cities.
 */
export const placeMatches = (preference: string | null | undefined, vacancyCity: string | null | undefined) => {
  const p = normalizePlace(preference);
  const c = normalizePlace(vacancyCity);
  if (!p || !c) return true;
  if (sameOrContains(p, c)) return true;
  const state = STATE_INDEX.find((s) => s.names.includes(p));
  return !!state && (state.cities.some((x) => sameOrContains(x, c)) || state.names.some((n) => c.includes(n)));
};

type WaitlistFacts = Pick<JobAlert, 'professions' | 'germanLevel' | 'city'>;
type VacancyFacts = Pick<Vacancy, 'profession' | 'title' | 'germanLevel' | 'city'>;

/**
 * A vacancy fits a waitlist entry: its canonical profession (profession field, else the title) is the entry's
 * profession, its minimum German level is not above the entry's level (when one is given), and its city fits.
 */
export const waitlistMatches = (entry: WaitlistFacts, v: VacancyFacts) => {
  const key = vacancyProfession(v);
  if (!key || !stringList(entry.professions).includes(key)) return false;
  if (entry.germanLevel && germanRank(v.germanLevel) > germanRank(entry.germanLevel)) return false;
  return placeMatches(entry.city, v.city);
};

/** Who is told: one person = their account, else their e-mail address (never twice per vacancy). */
export const recipientOf = (a: Pick<JobAlert, 'userId' | 'email'>) => a.userId ?? a.email.toLowerCase();

// ─── Sign-up ────────────────────────────────────────────────────────────

const activeWhere = (where: Prisma.JobAlertWhereInput): Prisma.JobAlertWhereInput => ({ ...where, waitlist: true, unsubscribedAt: null });

const createEntry = async (data: Omit<Prisma.JobAlertUncheckedCreateInput, 'tokenHash' | 'waitlist'>) => {
  const created = await prisma.jobAlert.create({ data: { ...data, waitlist: true, tokenHash: hashToken(`${Date.now()}-${Math.random()}-${data.email}`) } });
  return prisma.jobAlert.update({ where: { id: created.id }, data: { tokenHash: hashToken(alertToken(created.id)) } });
};

const placeText = (city: string | null) => city?.trim() || null;

/** Signed-in client: a confirmed entry for the account (the same profession + place again just returns it). */
export const joinWaitlistAsClient = async (user: { id: string; email: string; locale: string }, input: WaitlistInput, req?: Pick<Request, 'ip' | 'get'>) => {
  const all = await prisma.jobAlert.findMany({ where: activeWhere({ userId: user.id }) });
  const same = all.find((a) => stringList(a.professions)[0] === input.profession && normalizePlace(a.city) === normalizePlace(input.city));
  if (same) {
    const updated = same.germanLevel === (input.germanLevel ?? null) ? same : await prisma.jobAlert.update({ where: { id: same.id }, data: { germanLevel: input.germanLevel ?? null } });
    return { ok: true as const, entry: updated, already: true };
  }
  if (all.length >= MAX_WAITLIST_PER_PERSON) return { ok: false as const, code: 'TOO_MANY_ALERTS' };
  const entry = await createEntry({
    email: user.email.toLowerCase(),
    userId: user.id,
    locale: input.lng ? siteLocale(input.lng) : siteLocale(user.locale),
    professions: [input.profession],
    germanLevel: input.germanLevel ?? null,
    city: placeText(input.city),
    confirmedAt: new Date(),
  });
  await recordConsent({ userId: user.id, email: user.email, type: 'VACANCY_WAITLIST', granted: true, source: 'PORTAL', req });
  return { ok: true as const, entry, already: false };
};

const sendConfirmMail = async (entry: JobAlert) => {
  const lng = siteLocale(entry.locale);
  const m = WAITLIST_MAIL[lng];
  const profession = professionLabel(stringList(entry.professions)[0] ?? '', lng);
  const html = renderEmail(m.confirmSubject, m.confirmBody(profession, entry.city), { label: m.confirmCta, url: manageUrl(alertToken(entry.id), lng, 'confirm') });
  await sendMail(entry.email, m.confirmSubject, html);
};

/** The lead of a visitor's sign-up: one open waitlist lead per address for a week (later sign-ups are appended). */
const upsertLead = async (o: { email: string; name: string | null; phone: string | null; lng: SeoLocale; input: WaitlistInput; visitorId?: string | null; utm?: z.infer<typeof utmSchema> }) => {
  const now = new Date();
  const block = [
    `Gözləmə siyahısı: ${professionLabel(o.input.profession, 'az')}`,
    o.input.city ? `Şəhər / bölgə: ${o.input.city}` : null,
    o.input.germanLevel ? `Alman dili: ${o.input.germanLevel === 'none' ? 'yoxdur' : o.input.germanLevel}` : null,
    `Dil: ${o.lng}`,
    'E-poçt təsdiqi gözlənilir (double opt-in).',
  ]
    .filter((l): l is string => !!l)
    .join('\n');
  const open = await prisma.inquiry.findFirst({
    where: { email: o.email, source: { startsWith: 'waitlist:' }, status: 'NEW', anonymizedAt: null, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } },
    orderBy: { createdAt: 'desc' },
  });
  if (open && open.message.length < 50_000) {
    await prisma.inquiry.update({ where: { id: open.id }, data: { message: `${open.message}\n\n— ${now.toISOString().slice(0, 16).replace('T', ' ')} —\n${block}`, ...(o.phone && !open.phone ? { phone: o.phone } : {}) } });
    return { id: open.id, merged: true };
  }
  const inquiry = await prisma.inquiry.create({
    data: {
      kind: 'contact',
      source: `waitlist:${o.input.profession}`.slice(0, 80),
      contactName: (o.name || o.email.split('@')[0]).slice(0, 120),
      email: o.email,
      phone: o.phone,
      sector: `Vakansiya gözləmə siyahısı · ${professionLabel(o.input.profession, 'az')}`.slice(0, 120),
      message: block,
      locale: staffLocale(o.lng),
    },
  });
  void onInquiryCreated(inquiry.id); // automation rules + optional auto-assignment (never throws)
  await attachLeadContext(inquiry.id, { visitorId: o.visitorId ?? undefined, utm: o.utm });
  await notifyStaff(`Vakansiya gözləmə siyahısı: ${o.name || o.email} · ${professionLabel(o.input.profession, 'az')}`, [`Email: ${o.email}`, o.phone ? `Telefon: ${o.phone}` : null, '', block].filter((l): l is string => l !== null).join('\n'), {
    link: '/admin/inquiries',
  });
  return { id: inquiry.id, merged: false };
};

/** Visitor: an unconfirmed entry + confirmation e-mail (double opt-in) + the lead. */
export const joinWaitlistAsVisitor = async (o: {
  email: string;
  name?: string | null;
  phone?: string | null;
  input: WaitlistInput;
  visitorId?: string | null;
  utm?: z.infer<typeof utmSchema>;
}) => {
  const lng = siteLocale(o.input.lng);
  const email = o.email.toLowerCase();
  const active = await prisma.jobAlert.findMany({ where: activeWhere({ email }) });
  if (active.length >= MAX_WAITLIST_PER_PERSON) return { ok: false as const, code: 'TOO_MANY_ALERTS' };
  const same = active.find((a) => stringList(a.professions)[0] === o.input.profession && normalizePlace(a.city) === normalizePlace(o.input.city));
  const lead = await upsertLead({ email, name: o.name ?? null, phone: o.phone ?? null, lng, input: o.input, visitorId: o.visitorId, utm: o.utm });
  if (same?.confirmedAt) return { ok: true as const, entry: same, already: true };
  const entry =
    same ??
    (await createEntry({
      email,
      locale: lng,
      professions: [o.input.profession],
      germanLevel: o.input.germanLevel ?? null,
      city: placeText(o.input.city),
      visitorId: o.visitorId ?? null,
      inquiryId: lead.id,
    }));
  await sendConfirmMail(entry);
  return { ok: true as const, entry, already: false };
};

/** Double opt-in done (shared /api/job-alerts/confirm): log the consent and note it on the lead. */
export const onWaitlistConfirmed = async (entry: JobAlert, req?: Pick<Request, 'ip' | 'get'>) => {
  if (!entry.waitlist) return;
  await recordConsent({ userId: entry.userId, email: entry.email, type: 'VACANCY_WAITLIST', granted: true, source: 'DOUBLE_OPT_IN', visitorId: entry.visitorId, req });
  if (entry.inquiryId) {
    const q = await prisma.inquiry.findUnique({ where: { id: entry.inquiryId }, select: { message: true } });
    if (q) await prisma.inquiry.update({ where: { id: entry.inquiryId }, data: { message: `${q.message}\nE-poçt təsdiqləndi (${new Date().toISOString().slice(0, 10)})` } }).catch(() => null);
  }
  void runWaitlistNoticesSoon(); // a vacancy may already be open for them
};

export const onWaitlistUnsubscribed = async (entry: JobAlert, req?: Pick<Request, 'ip' | 'get'>) => {
  if (!entry.waitlist) return;
  await recordConsent({ userId: entry.userId, email: entry.email, type: 'VACANCY_WAITLIST', granted: false, source: 'UNSUBSCRIBE', visitorId: entry.visitorId, req });
};

export const waitlistView = (a: JobAlert, opts: { maskedEmail?: boolean } = {}) => ({
  id: a.id,
  email: opts.maskedEmail ? maskEmail(a.email) : a.email,
  locale: a.locale,
  profession: stringList(a.professions)[0] ?? null,
  city: a.city,
  germanLevel: a.germanLevel,
  confirmed: !!a.confirmedAt,
  unsubscribed: !!a.unsubscribedAt,
  lastSentAt: a.lastSentAt,
  sentCount: a.sentCount,
  createdAt: a.createdAt,
});

// ─── Notices ────────────────────────────────────────────────────────────

type NoticeJob = Pick<Vacancy, 'id' | 'slug' | 'title' | 'city' | 'profession' | 'germanLevel' | 'salaryMin' | 'salaryMax'>;

const absolute = (path: string, lng: SeoLocale) => `${new URL(config.clientUrl).origin}${localizedPath(path, lng)}`;

const noticeHtml = (jobs: NoticeJob[], lng: SeoLocale, token: string) => {
  const m = WAITLIST_MAIL[lng];
  const a = ALERT_MAIL[lng];
  const rows = jobs
    .map((j) => {
      const salary = j.salaryMin != null || j.salaryMax != null ? `${[j.salaryMin, j.salaryMax].filter((x) => x != null).join('–')} € ${a.perMonth}` : '';
      const meta = [j.city, salary].filter(Boolean).join(' · ');
      return `<li style="margin:0 0 10px"><a href="${escapeHtml(absolute(`/jobs/${j.slug}`, lng))}" style="color:#1565e8;font-weight:600">${escapeHtml(pick(j.title, lng))}</a>${meta ? `<br><span style="color:#5b6b88;font-size:13px">${escapeHtml(meta)}</span>` : ''}</li>`;
    })
    .join('');
  const footer = `<p style="margin:22px 0 0;font-size:12px;color:#5b6b88;line-height:1.6">${escapeHtml(m.why)}<br><a href="${escapeHtml(manageUrl(token, lng))}" style="color:#1565e8">${escapeHtml(a.manage)}</a> · <a href="${escapeHtml(manageUrl(token, lng, 'unsubscribe'))}" style="color:#1565e8">${escapeHtml(a.unsubscribe)}</a></p>`;
  return `<ul style="padding-left:18px;margin:0 0 8px">${rows}</ul><p style="margin:0"><a href="${escapeHtml(absolute('/jobs', lng))}" style="color:#1565e8">${escapeHtml(m.allJobs)}</a></p>${footer}`;
};

const deliver = async (entry: JobAlert, jobs: NoticeJob[], user: { locale: string; emailNotifications: boolean } | null) => {
  const lng = siteLocale(entry.locale);
  const m = WAITLIST_MAIL[lng];
  const profession = professionLabel(stringList(entry.professions)[0] ?? '', lng);
  const first = jobs[0];
  if (entry.userId && user) {
    const ul = siteLocale(user.locale);
    const um = WAITLIST_MAIL[ul];
    await notifyUser(entry.userId, {
      type: 'VACANCY_WAITLIST',
      title: um.appTitle(pick(first.title, ul)).slice(0, 190),
      body: um.appBody(professionLabel(stringList(entry.professions)[0] ?? '', ul), entry.city),
      link: `/jobs/${first.slug}`,
      email: false, // own e-mail below (with the unsubscribe link)
    });
    if (!user.emailNotifications) return; // the account's e-mail setting
  }
  const subject = m.noticeSubject(pick(first.title, lng)).slice(0, 190);
  const html = renderEmail(subject, m.noticeBody(profession, jobs.length), { label: m.noticeCta, url: absolute(`/jobs/${first.slug}`, lng) }, { html: noticeHtml(jobs, lng, alertToken(entry.id)) });
  await sendMail(entry.email, subject, html);
};

/**
 * Tells every confirmed, subscribed waitlist entry about the open vacancies with a free place that match it and that
 * the person was not told about yet. Each (person, vacancy) pair is claimed by inserting its JobAlertNotice row
 * (unique), so overlapping runs never send twice. People who already applied for a vacancy are not told about it.
 * Returns the number of entries notified.
 */
export const runWaitlistNotices = async (now = new Date()) => {
  const entries = await prisma.jobAlert.findMany({ where: { waitlist: true, confirmedAt: { not: null }, unsubscribedAt: null }, take: 5000 });
  if (!entries.length) return 0;
  const open = await prisma.vacancy.findMany({
    where: openVacancyWhere(now),
    orderBy: { publishedAt: 'desc' },
    take: 500,
    select: { id: true, slug: true, title: true, city: true, profession: true, germanLevel: true, salaryMin: true, salaryMax: true, positions: true, filledAdjustment: true },
  });
  if (!open.length) return 0;
  const places = await placesFor(open);
  const free = open.filter((v) => (places.get(v.id)?.free ?? 0) > 0);
  if (!free.length) return 0;

  const recipients = [...new Set(entries.map(recipientOf))];
  const told = await prisma.jobAlertNotice.findMany({ where: { vacancyId: { in: free.map((v) => v.id) }, recipient: { in: recipients } }, select: { recipient: true, vacancyId: true } });
  const done = new Set(told.map((t) => `${t.recipient}|${t.vacancyId}`));
  const userIds = [...new Set(entries.map((e) => e.userId).filter((x): x is string => !!x))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, isActive: true, emailNotifications: true, locale: true } }) : [];
  const userOf = new Map(users.map((u) => [u.id, u]));
  const applied = userIds.length
    ? await prisma.vacancyApplication.findMany({ where: { userId: { in: userIds }, vacancyId: { in: free.map((v) => v.id) } }, select: { userId: true, vacancyId: true } })
    : [];
  for (const a of applied) done.add(`${a.userId}|${a.vacancyId}`);

  let notified = 0;
  for (const entry of entries) {
    const user = entry.userId ? userOf.get(entry.userId) : null;
    if (entry.userId && !user?.isActive) continue;
    const r = recipientOf(entry);
    const jobs = free.filter((v) => !done.has(`${r}|${v.id}`) && waitlistMatches(entry, v));
    if (!jobs.length) continue;
    const claimed: NoticeJob[] = [];
    for (const v of jobs) {
      try {
        await prisma.jobAlertNotice.create({ data: { alertId: entry.id, vacancyId: v.id, recipient: r, sentAt: now } });
        claimed.push(v);
      } catch (err) {
        if (!(err instanceof P.PrismaClientKnownRequestError && err.code === 'P2002')) throw err; // told by another run
      }
      done.add(`${r}|${v.id}`);
    }
    if (!claimed.length) continue;
    await prisma.jobAlert.update({ where: { id: entry.id }, data: { lastSentAt: now, sentCount: { increment: 1 } } });
    try {
      await deliver(entry, claimed, user ? { locale: user.locale, emailNotifications: user.emailNotifications } : null);
    } catch (err) {
      console.error('[waitlist] delivery failed', err);
    }
    notified++;
  }
  return notified;
};

let running: Promise<unknown> | null = null;
let again = false;

/** Background run (coalesced; never throws): after a publication, free places again, or a confirmation. */
export const runWaitlistNoticesSoon = () => {
  if (running) {
    again = true;
    return;
  }
  running = runWaitlistNotices()
    .catch((err) => console.error('[waitlist] run failed', err))
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        runWaitlistNoticesSoon();
      }
    });
};

// ─── Staff: demand per profession, export ───────────────────────────────

/** Subscribed waitlist entries per profession (confirmed = active, unconfirmed = pending), with the top places. */
export const waitlistStats = async (now = new Date()) => {
  const rows = await prisma.jobAlert.findMany({ where: { waitlist: true, unsubscribedAt: null }, select: { professions: true, city: true, userId: true, confirmedAt: true, createdAt: true } });
  const noticesLast30 = await prisma.jobAlertNotice.count({ where: { sentAt: { gte: new Date(now.getTime() - 30 * DAY) } } });
  const by = new Map<string, { active: number; pending: number; accounts: number; last30: number; cities: Map<string, { label: string; count: number }> }>();
  for (const r of rows) {
    const key = stringList(r.professions)[0];
    if (!key) continue;
    let s = by.get(key);
    if (!s) by.set(key, (s = { active: 0, pending: 0, accounts: 0, last30: 0, cities: new Map() }));
    if (r.confirmedAt) s.active++;
    else s.pending++;
    if (r.userId) s.accounts++;
    if (r.createdAt.getTime() >= now.getTime() - 30 * DAY) s.last30++;
    const place = normalizePlace(r.city);
    if (place && r.confirmedAt) {
      const c = s.cities.get(place) ?? { label: r.city!.trim(), count: 0 };
      c.count++;
      s.cities.set(place, c);
    }
  }
  const professions = [...by.entries()]
    .map(([key, s]) => ({
      key,
      labels: PROFESSION_LABELS[key] ?? null,
      active: s.active,
      pending: s.pending,
      accounts: s.accounts,
      last30: s.last30,
      cities: [...s.cities.values()].sort((a, b) => b.count - a.count).slice(0, 3).map((c) => ({ city: c.label, count: c.count })),
    }))
    .sort((a, b) => b.active - a.active || b.pending - a.pending);
  return {
    active: rows.filter((r) => r.confirmedAt).length,
    pending: rows.filter((r) => !r.confirmedAt).length,
    accounts: rows.filter((r) => r.userId && r.confirmedAt).length,
    noticesLast30,
    professions,
  };
};

/**
 * CSV of the waitlist (subscribed entries). Contacts (e-mail, name, phone) are only in plain text for viewers who may
 * export client data (Access Center area "clients", action "export"); everyone else gets them masked.
 */
export const waitlistCsv = async (opts: { plainContacts: boolean; profession?: string | null }) => {
  const all = await prisma.jobAlert.findMany({
    where: { waitlist: true, unsubscribedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 20_000,
    include: { _count: { select: { notices: true } } },
  });
  const rows = (opts.profession ? all.filter((r) => stringList(r.professions)[0] === opts.profession) : all);
  const userIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, phone: true } }) : [];
  const userOf = new Map(users.map((u) => [u.id, u]));
  const leadIds = [...new Set(rows.map((r) => r.inquiryId).filter((x): x is string => !!x))];
  const leads = leadIds.length ? await prisma.inquiry.findMany({ where: { id: { in: leadIds } }, select: { id: true, contactName: true, phone: true } }) : [];
  const leadOf = new Map(leads.map((l) => [l.id, l]));
  const mask = (v: string | null | undefined, kind: 'email' | 'text') => {
    if (!v) return '';
    if (opts.plainContacts) return v;
    return kind === 'email' ? maskEmail(v) : `${v.slice(0, 1)}•••`;
  };
  const headers = ['Yaradılıb', 'Peşə', 'Peşə (DE)', 'Şəhər / bölgə', 'Alman dili', 'Növ', 'Ad', 'E-poçt', 'Telefon', 'Təsdiqlənib', 'Bildiriş sayı', 'Dil'];
  const data = rows.map((r) => {
    const key = stringList(r.professions)[0] ?? '';
    const u = r.userId ? userOf.get(r.userId) : null;
    const lead = r.inquiryId ? leadOf.get(r.inquiryId) : null;
    const name = u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : (lead?.contactName ?? '');
    return [
      r.createdAt,
      professionLabel(key, 'az'),
      professionLabel(key, 'de'),
      r.city ?? '',
      r.germanLevel ?? '',
      r.userId ? 'Müştəri hesabı' : 'Ziyarətçi',
      mask(name, 'text'),
      mask(r.email, 'email'),
      mask(u?.phone ?? lead?.phone ?? null, 'text'),
      r.confirmedAt ? 'bəli' : 'xeyr',
      r._count.notices,
      r.locale,
    ];
  });
  return { csv: toCsv(headers, data), count: rows.length };
};
