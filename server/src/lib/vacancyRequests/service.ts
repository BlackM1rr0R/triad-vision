import crypto from 'node:crypto';
import type { Request } from 'express';
import type { Prisma, VacancyRequest, VacancyRequestStatus } from '@prisma/client';
import { Prisma as P } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { GERMAN_LEVELS, canonicalProfession } from '../matching.js';
import { SECTORS, openVacancyWhere } from '../vacancies.js';
import { isPubliclyVisible } from '../vacancyActive.js';
import { escapeHtml, localizedPath, pick } from '../seo.js';
import { SEO_LOCALES, type SeoLocale } from '../seoCatalogue.js';
import { renderEmail, sendMail } from '../mailer.js';
import { notifyStaff, notifyUser } from '../notifications.js';
import { recordConsent } from '../privacy/consents.js';
import { onInquiryCreated } from '../assignment/inquiry.js';
import { attachLeadContext, type utmSchema } from '../marketing/leadScoring.js';
import { placesFor } from '../vacancyPlaces/service.js';
import { PROFESSION_LABELS, professionLabel } from '../jobAlerts/texts.js';
import { normalizePlace } from '../jobAlerts/waitlist.js';
import { REQUEST_TYPES, vacancyRequestMatches } from './matching.js';
import { REQUEST_MAIL } from './texts.js';

/**
 * "Vakansiya sorğusu" — a candidate who did not find the job they want (or whose vacancy is deactivated) asks for
 * "this kind of job", type WORK or AUSBILDUNG:
 *
 *  - guests (public vacancy pages): name + phone and/or e-mail + consent; the request is also a lead (Inquiry, source
 *    "vacancy-request"); signed-in clients: one click, tied to the account, managed in the cabinet (list, cancel);
 *  - NO case / visa application is created: a case opens only when the client applies to an offered vacancy;
 *  - staff handle it in admin › Vacancies › Sorğular (status, note, assignee) and may offer an open vacancy;
 *  - every open request is told once per vacancy about a new / reactivated / freed matching vacancy
 *    (VacancyRequestNotice, unique request + vacancy; same background run + scheduler as the waitlist);
 *  - e-mails never show the employer; guests get e-mail only when they gave one, every mail carries the cancel link,
 *    accounts follow their e-mail notification setting (the in-app notification always arrives).
 */

export const MAX_OPEN_REQUESTS = 5;
export const OPEN_STATUSES: VacancyRequestStatus[] = ['NEW', 'IN_PROGRESS', 'OFFERED'];
export const REQUEST_STATUSES = ['NEW', 'IN_PROGRESS', 'OFFERED', 'CLOSED'] as const;

const siteLocale = (raw: unknown): SeoLocale => ((SEO_LOCALES as readonly string[]).includes(String(raw)) ? (raw as SeoLocale) : 'az');
const staffLocale = (lng: SeoLocale): string => (lng === 'tr' ? 'az' : lng === 'uk' ? 'ru' : lng);
const nullable = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

export const requestInputSchema = z.object({
  type: z.enum(REQUEST_TYPES),
  sector: z.enum(SECTORS).nullable().optional(),
  profession: nullable(120),
  city: nullable(80),
  germanLevel: z.enum(GERMAN_LEVELS).nullable().optional(),
  note: nullable(2000),
  lng: z.string().optional(),
  /** Deactivated vacancy page: "I want a similar one" — prefills sector / profession and links the request to it. */
  sourceVacancySlug: z.string().trim().max(200).optional(),
});
export type RequestInput = z.infer<typeof requestInputSchema>;

// ─── Token (guest cancel link) ──────────────────────────────────────────

const mac = (id: string) => crypto.createHmac('sha256', config.jwtSecret).update(`vacancy-request:${id}`).digest('base64url').slice(0, 32);
export const requestToken = (id: string) => `${id}.${mac(id)}`;
/** The request id of a valid token, else null. */
export const requestIdFromToken = (token: string): string | null => {
  const [id, sig] = String(token ?? '').split('.');
  if (!id || !sig || id.length > 40) return null;
  const a = Buffer.from(mac(id));
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
};
export const cancelUrl = (id: string, lng: SeoLocale) => `${config.clientUrl}/vacancy-request?token=${encodeURIComponent(requestToken(id))}&lng=${lng}`;

const sameRequest = (a: Pick<VacancyRequest, 'type' | 'sector' | 'profession' | 'city'>, b: Pick<VacancyRequest, 'type' | 'sector' | 'profession' | 'city'>) =>
  a.type === b.type && (a.sector ?? '') === (b.sector ?? '') && normalizePlace(a.profession) === normalizePlace(b.profession) && normalizePlace(a.city) === normalizePlace(b.city);

/** What the request asks for, in words ("Truck driver · Hamburg"). */
export const requestSummary = (r: Pick<VacancyRequest, 'type' | 'sector' | 'profession' | 'city'>, lng: SeoLocale) => {
  const m = REQUEST_MAIL[lng];
  const what = r.profession ? (PROFESSION_LABELS[r.profession] ? professionLabel(r.profession, lng) : r.profession) : r.sector ? r.sector : '';
  return [r.type === 'AUSBILDUNG' ? m.typeAusbildung : m.typeWork, what, r.city].filter(Boolean).join(' · ');
};

// ─── Create ─────────────────────────────────────────────────────────────

type Prepared = { type: string; sector: string | null; profession: string | null; city: string | null; germanLevel: string | null; note: string | null; sourceVacancyId: string | null };

/** Resolves the source vacancy (publicly visible only), fills missing sector / profession from it, canonical profession keys. */
export const prepareRequest = async (input: RequestInput): Promise<{ ok: true; data: Prepared } | { ok: false; code: string }> => {
  let sector: string | null = input.sector ?? null;
  let profession = input.profession ?? null;
  let sourceVacancyId: string | null = null;
  if (input.sourceVacancySlug) {
    const v = await prisma.vacancy.findUnique({ where: { slug: input.sourceVacancySlug }, select: { id: true, sector: true, profession: true, status: true, closesAt: true, publishedAt: true } });
    if (v && isPubliclyVisible(v)) {
      sourceVacancyId = v.id;
      sector ??= v.sector && (SECTORS as readonly string[]).includes(v.sector) ? v.sector : null;
      profession ??= canonicalProfession(v.profession);
    }
  }
  if (profession) profession = canonicalProfession(profession) ?? profession;
  if (!sector && !profession) return { ok: false, code: 'PROFESSION_REQUIRED' };
  return { ok: true, data: { type: input.type, sector, profession, city: input.city ?? null, germanLevel: input.germanLevel ?? null, note: input.note ?? null, sourceVacancyId } };
};

const notifyNewRequest = async (r: VacancyRequest, who: string) => {
  const summary = requestSummary(r, 'az');
  await notifyStaff(`Vakansiya sorğusu: ${who} · ${summary}`, [`Növ: ${r.type === 'AUSBILDUNG' ? 'Ausbildung' : 'İş'}`, `Sorğu: ${summary}`, r.germanLevel ? `Alman dili: ${r.germanLevel}` : null, r.note ? `Qeyd: ${r.note}` : null].filter((l): l is string => !!l).join('\n'), {
    link: '/admin/vacancies?tab=requests',
    type: 'VACANCY_REQUEST',
  });
};

/** Signed-in client: one open request per kind (the same request again just returns it). */
export const createClientRequest = async (user: { id: string; email: string; locale: string; firstName?: string | null; lastName?: string | null }, input: RequestInput, req?: Pick<Request, 'ip' | 'get'>) => {
  const p = await prepareRequest(input);
  if (!p.ok) return p;
  const open = await prisma.vacancyRequest.findMany({ where: { userId: user.id, status: { in: OPEN_STATUSES } } });
  const same = open.find((r) => sameRequest(r, p.data));
  if (same) return { ok: true as const, request: same, already: true };
  if (open.length >= MAX_OPEN_REQUESTS) return { ok: false as const, code: 'TOO_MANY_REQUESTS' };
  const request = await prisma.vacancyRequest.create({ data: { ...p.data, userId: user.id, locale: input.lng ? siteLocale(input.lng) : siteLocale(user.locale) } });
  await recordConsent({ userId: user.id, email: user.email, type: 'VACANCY_REQUEST', granted: true, source: 'PORTAL', req });
  await notifyNewRequest(request, `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email);
  void runVacancyRequestNoticesSoon(); // a matching vacancy may already be open
  return { ok: true as const, request, already: false };
};

/** Guest: the request + a lead (Inquiry) so it shows next to the other leads; consent is logged. */
export const createGuestRequest = async (o: {
  input: RequestInput;
  name: string;
  email: string | null;
  phone: string | null;
  visitorId?: string | null;
  utm?: z.infer<typeof utmSchema>;
  req?: Pick<Request, 'ip' | 'get'>;
}) => {
  const p = await prepareRequest(o.input);
  if (!p.ok) return p;
  const lng = siteLocale(o.input.lng);
  const email = o.email?.toLowerCase() ?? null;
  const contactOr = [...(email ? [{ email }] : []), ...(o.phone ? [{ phone: o.phone }] : [])];
  const open = await prisma.vacancyRequest.findMany({ where: { userId: null, status: { in: OPEN_STATUSES }, OR: contactOr } });
  const same = open.find((r) => sameRequest(r, p.data));
  if (same) return { ok: true as const, request: same, already: true };
  if (open.length >= MAX_OPEN_REQUESTS) return { ok: false as const, code: 'TOO_MANY_REQUESTS' };

  const summary = requestSummary(p.data, 'az');
  const message = [`Vakansiya sorğusu: ${summary}`, p.data.germanLevel ? `Alman dili: ${p.data.germanLevel === 'none' ? 'yoxdur' : p.data.germanLevel}` : null, p.data.note ? `Qeyd: ${p.data.note}` : null, `Dil: ${lng}`]
    .filter((l): l is string => !!l)
    .join('\n');
  const inquiry = await prisma.inquiry.create({
    data: {
      kind: 'contact',
      source: 'vacancy-request',
      contactName: o.name.slice(0, 120),
      email: email ?? `${o.phone ?? 'no-email'}@no-email.invalid`.slice(0, 190),
      phone: o.phone,
      sector: `Vakansiya sorğusu · ${summary}`.slice(0, 120),
      message,
      locale: staffLocale(lng),
    },
  });
  void onInquiryCreated(inquiry.id); // automation rules + optional auto-assignment (never throws)
  await attachLeadContext(inquiry.id, { visitorId: o.visitorId ?? undefined, utm: o.utm });
  const request = await prisma.vacancyRequest.create({ data: { ...p.data, contactName: o.name.slice(0, 120), email, phone: o.phone, locale: lng, inquiryId: inquiry.id } });
  await recordConsent({ email, type: 'VACANCY_REQUEST', granted: true, source: 'PUBLIC_FORM', visitorId: o.visitorId, req: o.req });
  await notifyNewRequest(request, o.name);
  void runVacancyRequestNoticesSoon();
  return { ok: true as const, request, already: false };
};

// ─── Cancel ─────────────────────────────────────────────────────────────

/** The requester withdraws the request (account: from the cabinet, guest: e-mail link): closed, consent withdrawn. */
export const cancelRequest = async (r: VacancyRequest, req?: Pick<Request, 'ip' | 'get'>) => {
  if (r.status === 'CLOSED' && r.cancelledAt) return r;
  const now = new Date();
  const updated = await prisma.vacancyRequest.update({ where: { id: r.id }, data: { status: 'CLOSED', cancelledAt: now, closedAt: r.closedAt ?? now } });
  await recordConsent({ userId: r.userId, email: r.email, type: 'VACANCY_REQUEST', granted: false, source: r.userId ? 'PORTAL' : 'UNSUBSCRIBE', req });
  return updated;
};

// ─── Views ──────────────────────────────────────────────────────────────

type WithNotices = VacancyRequest & { notices?: { vacancyId: string; source: string; sentAt: Date }[] };

/** The requester's own view (no staff note, no assignee, no employer). */
export const requestView = async (rows: WithNotices[]) => {
  const ids = [...new Set(rows.flatMap((r) => (r.notices ?? []).map((n) => n.vacancyId)))];
  const vacancies = ids.length ? await prisma.vacancy.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, title: true, city: true, status: true, closesAt: true, publishedAt: true } }) : [];
  const byId = new Map(vacancies.map((v) => [v.id, v]));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    sector: r.sector,
    profession: r.profession,
    city: r.city,
    germanLevel: r.germanLevel,
    note: r.note,
    status: r.status,
    cancelled: !!r.cancelledAt,
    createdAt: r.createdAt,
    lastOfferedAt: r.lastOfferedAt,
    offers: (r.notices ?? [])
      .map((n) => ({ n, v: byId.get(n.vacancyId) }))
      .filter((x) => x.v && isPubliclyVisible(x.v))
      .map(({ n, v }) => ({ slug: v!.slug, title: v!.title, city: v!.city, sentAt: n.sentAt })),
  }));
};

// ─── Delivery ───────────────────────────────────────────────────────────

type NoticeJob = { id: string; slug: string; title: unknown; city: string | null; salaryMin: number | null; salaryMax: number | null };

const absolute = (path: string, lng: SeoLocale) => `${new URL(config.clientUrl).origin}${localizedPath(path, lng)}`;

const mailHtml = (r: VacancyRequest, jobs: NoticeJob[], lng: SeoLocale) => {
  const m = REQUEST_MAIL[lng];
  const rows = jobs
    .map((j) => {
      const salary = j.salaryMin != null || j.salaryMax != null ? `${[j.salaryMin, j.salaryMax].filter((x) => x != null).join('–')} €` : '';
      const meta = [j.city, salary].filter(Boolean).join(' · ');
      return `<li style="margin:0 0 10px"><a href="${escapeHtml(absolute(`/jobs/${j.slug}`, lng))}" style="color:#1565e8;font-weight:600">${escapeHtml(pick(j.title as never, lng))}</a>${meta ? `<br><span style="color:#5b6b88;font-size:13px">${escapeHtml(meta)}</span>` : ''}</li>`;
    })
    .join('');
  const cancel = `<a href="${escapeHtml(cancelUrl(r.id, lng))}" style="color:#1565e8">${escapeHtml(m.cancel)}</a>`;
  return `<ul style="padding-left:18px;margin:0 0 8px">${rows}</ul><p style="margin:0"><a href="${escapeHtml(absolute('/jobs', lng))}" style="color:#1565e8">${escapeHtml(m.allJobs)}</a></p><p style="margin:22px 0 0;font-size:12px;color:#5b6b88;line-height:1.6">${escapeHtml(m.why)}<br>${cancel}</p>`;
};

type Recipient = { locale: string; emailNotifications: boolean; email: string } | null;

/** In-app notification (accounts) + e-mail (accounts with e-mail on; guests with an address). Returns whether an e-mail went out. */
const deliver = async (r: VacancyRequest, jobs: NoticeJob[], user: Recipient, kind: 'AUTO' | 'STAFF') => {
  const first = jobs[0];
  if (r.userId && user) {
    const ul = siteLocale(user.locale);
    const um = REQUEST_MAIL[ul];
    await notifyUser(r.userId, {
      type: 'VACANCY_REQUEST',
      title: um.appTitle(pick(first.title as never, ul)).slice(0, 190),
      body: um.appBody(requestSummary(r, ul)),
      link: `/jobs/${first.slug}`,
      email: false, // own e-mail below
    });
    if (!user.emailNotifications) return false;
  }
  const to = r.userId ? user?.email : r.email;
  if (!to) return false;
  const lng = siteLocale(r.locale);
  const m = REQUEST_MAIL[lng];
  const subject = m.noticeSubject(pick(first.title as never, lng)).slice(0, 190);
  const what = requestSummary(r, lng);
  const html = renderEmail(subject, kind === 'STAFF' ? m.offerBody(what) : m.noticeBody(what, jobs.length), { label: m.cta, url: absolute(`/jobs/${first.slug}`, lng) }, { html: mailHtml(r, jobs, lng) });
  await sendMail(to, subject, html);
  return true;
};

const loadRecipients = async (rows: VacancyRequest[]) => {
  const userIds = [...new Set(rows.map((e) => e.userId).filter((x): x is string => !!x))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, isActive: true, emailNotifications: true, locale: true, email: true } }) : [];
  return new Map(users.map((u) => [u.id, u]));
};

const claim = async (requestId: string, vacancyId: string, source: 'AUTO' | 'STAFF', staffId: string | null, now: Date) => {
  try {
    await prisma.vacancyRequestNotice.create({ data: { requestId, vacancyId, source, staffId, sentAt: now } });
    return true;
  } catch (err) {
    if (err instanceof P.PrismaClientKnownRequestError && err.code === 'P2002') return false; // told already / by another run
    throw err;
  }
};

/**
 * Tells every open request about the open vacancies with a free place that match it and that it was not told about yet
 * (also after a vacancy is created, reactivated or gets a free place). Each (request, vacancy) pair is claimed by
 * inserting its VacancyRequestNotice (unique), so overlapping runs never send twice; people who already applied are
 * skipped. A NEW request becomes OFFERED. Returns the number of requests notified.
 */
export const runVacancyRequestNotices = async (now = new Date()) => {
  const requests = await prisma.vacancyRequest.findMany({ where: { status: { in: OPEN_STATUSES } }, take: 5000 });
  if (!requests.length) return 0;
  const open = await prisma.vacancy.findMany({
    where: openVacancyWhere(now),
    orderBy: { publishedAt: 'desc' },
    take: 500,
    select: { id: true, slug: true, title: true, city: true, sector: true, profession: true, employmentType: true, salaryMin: true, salaryMax: true, positions: true, filledAdjustment: true },
  });
  if (!open.length) return 0;
  const places = await placesFor(open);
  const free = open.filter((v) => (places.get(v.id)?.free ?? 0) > 0);
  if (!free.length) return 0;

  const told = await prisma.vacancyRequestNotice.findMany({ where: { requestId: { in: requests.map((r) => r.id) }, vacancyId: { in: free.map((v) => v.id) } }, select: { requestId: true, vacancyId: true } });
  const done = new Set(told.map((t) => `${t.requestId}|${t.vacancyId}`));
  const userOf = await loadRecipients(requests);
  const userIds = [...userOf.keys()];
  const applied = userIds.length ? await prisma.vacancyApplication.findMany({ where: { userId: { in: userIds }, vacancyId: { in: free.map((v) => v.id) } }, select: { userId: true, vacancyId: true } }) : [];
  const appliedSet = new Set(applied.map((a) => `${a.userId}|${a.vacancyId}`));

  let notified = 0;
  for (const r of requests) {
    const user = r.userId ? userOf.get(r.userId) : null;
    if (r.userId && !user?.isActive) continue;
    if (!r.userId && !r.email) continue; // guest with a phone only: staff follow up by hand
    const jobs = free.filter((v) => !done.has(`${r.id}|${v.id}`) && !(r.userId && appliedSet.has(`${r.userId}|${v.id}`)) && vacancyRequestMatches(r, v));
    if (!jobs.length) continue;
    const claimed: NoticeJob[] = [];
    for (const v of jobs) {
      if (await claim(r.id, v.id, 'AUTO', null, now)) claimed.push(v);
      done.add(`${r.id}|${v.id}`);
    }
    if (!claimed.length) continue;
    await prisma.vacancyRequest.updateMany({ where: { id: r.id, status: 'NEW' }, data: { status: 'OFFERED' } });
    await prisma.vacancyRequest.update({ where: { id: r.id }, data: { lastOfferedAt: now } });
    try {
      await deliver(r, claimed, user ?? null, 'AUTO');
    } catch (err) {
      console.error('[vacancy-requests] delivery failed', err);
    }
    notified++;
  }
  return notified;
};

let running: Promise<unknown> | null = null;
let again = false;

/** Background run (coalesced; never throws): after a vacancy is created / reactivated, or a new request arrives. */
export const runVacancyRequestNoticesSoon = () => {
  if (running) {
    again = true;
    return;
  }
  running = runVacancyRequestNotices()
    .catch((err) => console.error('[vacancy-requests] run failed', err))
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        runVacancyRequestNoticesSoon();
      }
    });
};

// ─── Staff: offer a vacancy ─────────────────────────────────────────────

export type OfferResult = { ok: true; request: VacancyRequest; delivered: boolean } | { ok: false; code: 'REQUEST_CLOSED' | 'VACANCY_NOT_FOUND' | 'VACANCY_CLOSED' | 'NO_FREE_PLACES' | 'ALREADY_OFFERED' | 'REQUESTER_INACTIVE' };

/** Staff offers an open vacancy with a free place to the requester (cabinet notification + e-mail with the apply link). No case is created. */
export const offerVacancy = async (requestId: string, vacancyId: string, staffId: string, now = new Date()): Promise<OfferResult> => {
  const r = await prisma.vacancyRequest.findUnique({ where: { id: requestId } });
  if (!r || r.status === 'CLOSED') return { ok: false, code: 'REQUEST_CLOSED' };
  const v = await prisma.vacancy.findFirst({
    where: { id: vacancyId, ...openVacancyWhere(now) },
    select: { id: true, slug: true, title: true, city: true, salaryMin: true, salaryMax: true, positions: true, filledAdjustment: true },
  });
  if (!v) return { ok: false, code: (await prisma.vacancy.count({ where: { id: vacancyId } })) ? 'VACANCY_CLOSED' : 'VACANCY_NOT_FOUND' };
  if (((await placesFor([v])).get(v.id)?.free ?? 0) <= 0) return { ok: false, code: 'NO_FREE_PLACES' };
  const user = r.userId ? await prisma.user.findUnique({ where: { id: r.userId }, select: { isActive: true, emailNotifications: true, locale: true, email: true } }) : null;
  if (r.userId && !user?.isActive) return { ok: false, code: 'REQUESTER_INACTIVE' };
  if (!(await claim(r.id, v.id, 'STAFF', staffId, now))) return { ok: false, code: 'ALREADY_OFFERED' };
  const request = await prisma.vacancyRequest.update({ where: { id: r.id }, data: { status: 'OFFERED', lastOfferedAt: now } });
  let delivered = false;
  try {
    delivered = await deliver(request, [v], user, 'STAFF');
  } catch (err) {
    console.error('[vacancy-requests] offer delivery failed', err);
  }
  return { ok: true, request, delivered };
};

// ─── Staff: list ────────────────────────────────────────────────────────

export const maskContact = (v: string | null | undefined, kind: 'email' | 'text') => {
  if (!v) return null;
  if (kind === 'email') {
    const [u, d] = v.split('@');
    return `${u.slice(0, 1)}***@${d ?? ''}`;
  }
  return `${v.slice(0, 1)}•••`;
};

export const adminListQuery = z.object({
  type: z.enum(REQUEST_TYPES).optional(),
  sector: z.enum(SECTORS).optional(),
  status: z.enum(REQUEST_STATUSES).optional(),
  assigned: z.string().max(40).optional(), // staff id or "none"
  q: z.string().trim().max(120).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export const adminWhere = (q: z.infer<typeof adminListQuery>): Prisma.VacancyRequestWhereInput => {
  const where: Prisma.VacancyRequestWhereInput = {};
  if (q.type) where.type = q.type;
  if (q.sector) where.sector = q.sector;
  if (q.status) where.status = q.status;
  if (q.assigned) where.assignedStaffId = q.assigned === 'none' ? null : q.assigned;
  if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) };
  if (q.q) where.OR = [{ profession: { contains: q.q } }, { city: { contains: q.q } }, { contactName: { contains: q.q } }, { email: { contains: q.q } }, { phone: { contains: q.q } }];
  return where;
};

export const PAGE_SIZE = 50;

/** Admin row: contact of accounts from the user, of guests from the request; masked unless the viewer may see client data. */
export const adminRows = async (rows: (VacancyRequest & { notices: { vacancyId: string; source: string; sentAt: Date }[] })[], plainContacts: boolean) => {
  const userIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const staffIds = [...new Set(rows.map((r) => r.assignedStaffId).filter((x): x is string => !!x))];
  const [users, staff, vacancies] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true, phone: true } }) : [],
    staffIds.length ? prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
    prisma.vacancy.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [...r.notices.map((n) => n.vacancyId), ...(r.sourceVacancyId ? [r.sourceVacancyId] : [])]))] } }, select: { id: true, slug: true, title: true, city: true } }),
  ]);
  const userOf = new Map(users.map((u) => [u.id, u]));
  const staffOf = new Map(staff.map((u) => [u.id, u]));
  const vacancyOf = new Map(vacancies.map((v) => [v.id, v]));
  const c = (v: string | null | undefined, kind: 'email' | 'text') => (plainContacts ? (v ?? null) : maskContact(v, kind));
  return rows.map((r) => {
    const u = r.userId ? userOf.get(r.userId) : null;
    const s = r.assignedStaffId ? staffOf.get(r.assignedStaffId) : null;
    const src = r.sourceVacancyId ? vacancyOf.get(r.sourceVacancyId) : null;
    return {
      id: r.id,
      type: r.type,
      sector: r.sector,
      profession: r.profession,
      city: r.city,
      germanLevel: r.germanLevel,
      note: r.note,
      status: r.status,
      cancelled: !!r.cancelledAt,
      isAccount: !!r.userId,
      userId: r.userId,
      locale: r.locale,
      name: c(u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : r.contactName, 'text'),
      email: c(u?.email ?? r.email, 'email'),
      phone: c(u?.phone ?? r.phone, 'text'),
      contactMasked: !plainContacts,
      inquiryId: r.inquiryId,
      assignedStaffId: r.assignedStaffId,
      assignedStaffName: s ? `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() : null,
      staffNote: r.staffNote,
      sourceVacancy: src ? { id: src.id, slug: src.slug, title: src.title } : null,
      offers: r.notices.map((n) => ({ source: n.source, sentAt: n.sentAt, vacancy: vacancyOf.get(n.vacancyId) ? { id: n.vacancyId, slug: vacancyOf.get(n.vacancyId)!.slug, title: vacancyOf.get(n.vacancyId)!.title } : { id: n.vacancyId } })),
      lastOfferedAt: r.lastOfferedAt,
      createdAt: r.createdAt,
      closedAt: r.closedAt,
    };
  });
};
