import type { Inquiry, LeadVisitor, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { notifyStaff, notifyUser } from '../notifications.js';
import { readSetting, writeSetting } from '../growth/settings.js';

/**
 * Lead scoring: every inquiry gets 0–100 points and a level (COLD / WARM / HOT) from configurable rules
 * (Setting `leadScoring`, edited by admins on the Inquiries page):
 *   source            where the lead came from (contact form, event, landing page, quiz, calculator, …)
 *   visitor events    what the visitor did before / after (only with analytics consent: LeadVisitor)
 *   quiz              eligibility quiz fit (high / medium / low)
 *   company           employer inquiries with a number of workers
 *   recency           last activity (inquiry or visitor) within 1 / 7 / 30 days
 *   contact           completeness (phone, e-mail, a real message)
 * The reasons are stored as codes (translated in the admin UI). A lead that becomes HOT notifies sales.
 */

export const LEAD_SCORING_KEY = 'leadScoring';

export const SOURCE_KEYS = ['contact', 'company', 'event', 'landing', 'quiz', 'calculator', 'booking', 'advisor', 'livechat', 'whatsapp', 'callback', 'other'] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

/** Visitor event counters (LeadVisitor.events) that carry points. */
export const EVENT_KEYS = ['quiz_done', 'cost_calc', 'start_calc', 'booking_open', 'booking_done', 'event_register', 'landing_view', 'whatsapp_click'] as const;
export type EventKey = (typeof EVENT_KEYS)[number];

export const LEVELS = ['COLD', 'WARM', 'HOT'] as const;
export type LeadLevel = (typeof LEVELS)[number];

const pts = z.number().int().min(-100).max(100);

export const leadScoringSchema = z
  .object({
    enabled: z.boolean().default(true),
    sources: z.object(Object.fromEntries(SOURCE_KEYS.map((k) => [k, pts])) as Record<SourceKey, typeof pts>),
    /** Points per occurrence of a visitor event (each event counted at most `eventRepeat` times). */
    events: z.object(Object.fromEntries(EVENT_KEYS.map((k) => [k, pts])) as Record<EventKey, typeof pts>),
    eventRepeat: z.number().int().min(1).max(10).default(2),
    /** Points per page view, capped. */
    pageView: pts,
    pageViewCap: z.number().int().min(0).max(100),
    /** Upper bound for everything the visitor history adds. */
    visitorCap: z.number().int().min(0).max(100),
    quiz: z.object({ high: pts, medium: pts, low: pts }),
    company: z.object({ base: pts, perWorker: z.number().min(0).max(20), cap: z.number().int().min(0).max(100) }),
    recency: z.object({ d1: pts, d7: pts, d30: pts, older: pts }),
    contact: z.object({ phone: pts, email: pts, message: pts }),
    /** A cost estimate attached (the lead asked for an exact offer). */
    estimate: pts,
    thresholds: z.object({ warm: z.number().int().min(1).max(100), hot: z.number().int().min(1).max(100) }).refine((t) => t.warm < t.hot, 'WARM_NOT_BELOW_HOT'),
    notifyHot: z.boolean().default(true),
    /** Staff who get an in-app / push / e-mail notification for HOT leads (admins always get the staff inbox). */
    notifyUserIds: z.array(z.string().min(1).max(40)).max(20).default([]),
  })
  .strict();
export type LeadScoringSettings = z.infer<typeof leadScoringSchema>;

export const LEAD_SCORING_DEFAULTS: LeadScoringSettings = {
  enabled: true,
  sources: { contact: 10, company: 20, event: 15, landing: 15, quiz: 15, calculator: 20, booking: 25, advisor: 10, livechat: 10, whatsapp: 10, callback: 15, other: 5 },
  events: { quiz_done: 8, cost_calc: 10, start_calc: 6, booking_open: 6, booking_done: 20, event_register: 10, landing_view: 3, whatsapp_click: 6 },
  eventRepeat: 2,
  pageView: 1,
  pageViewCap: 10,
  visitorCap: 35,
  quiz: { high: 20, medium: 10, low: 0 },
  company: { base: 10, perWorker: 1, cap: 25 },
  recency: { d1: 10, d7: 5, d30: 0, older: -10 },
  contact: { phone: 10, email: 5, message: 5 },
  estimate: 5,
  thresholds: { warm: 35, hot: 60 },
  notifyHot: true,
  notifyUserIds: [],
};

export const getLeadScoringSettings = () => readSetting(LEAD_SCORING_KEY, leadScoringSchema, LEAD_SCORING_DEFAULTS);
export const saveLeadScoringSettings = (s: LeadScoringSettings) => writeSetting(LEAD_SCORING_KEY, s);

/** Which source rule an inquiry falls under (Inquiry.source wins over the form kind / sector). */
export const sourceKeyOf = (q: Pick<Inquiry, 'kind' | 'source' | 'sector'>): SourceKey => {
  const s = (q.source ?? '').toLowerCase();
  if (s.startsWith('event:')) return 'event';
  if (s.startsWith('landing:') || s.startsWith('ebook:')) return 'landing'; // e-book lead magnets score like a landing page form
  if (s === 'cost-calculator' || s.startsWith('calculator')) return 'calculator';
  if (s === 'quiz') return 'quiz';
  if (s === 'booking') return 'booking';
  if (s === 'whatsapp') return 'whatsapp';
  if (s === 'callback') return 'callback';
  const sector = (q.sector ?? '').toLowerCase();
  if (sector === 'ai advisor') return 'advisor';
  if (sector === 'live chat') return 'livechat';
  if (q.kind === 'company') return 'company';
  if (q.kind === 'contact') return 'contact';
  return 'other';
};

export interface ScoreReason {
  /** source | event | pageViews | quiz | company | recency | contact | estimate */
  code: string;
  /** sub key: the source / event / quiz fit / recency bucket / contact field */
  key?: string;
  points: number;
  /** count behind the points (events, page views, workers) */
  n?: number;
}

export interface LeadInput {
  kind: string;
  source: string | null;
  sector: string | null;
  workersNeeded: number | null;
  email: string;
  phone: string | null;
  message: string;
  createdAt: Date;
  quizResult: unknown;
  estimate: unknown;
  visitor?: Pick<LeadVisitor, 'events' | 'pageViews' | 'lastSeenAt'> | null;
}

const FIT_RANK = { low: 0, medium: 1, high: 2 } as const;
type Fit = keyof typeof FIT_RANK;

/** Best quiz fit known: the inquiry's own quiz result, else the visitor's quiz counters. */
export const quizFitOf = (quizResult: unknown, events: Record<string, unknown>): Fit | null => {
  const own = quizResult && typeof quizResult === 'object' ? (quizResult as { fit?: unknown }).fit : undefined;
  if (own === 'high' || own === 'medium' || own === 'low') return own;
  let best: Fit | null = null;
  for (const f of ['low', 'medium', 'high'] as const) if (Number(events[`quiz_${f}`]) > 0) best = f;
  return best;
};

const DAY = 24 * 60 * 60 * 1000;
const counters = (raw: unknown): Record<string, unknown> => (raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});

/** Pure scoring function (unit tested). */
export const scoreLead = (input: LeadInput, s: LeadScoringSettings, now = new Date()) => {
  const reasons: ScoreReason[] = [];
  const add = (r: ScoreReason) => {
    if (r.points !== 0) reasons.push(r);
  };
  const source = sourceKeyOf(input);
  add({ code: 'source', key: source, points: s.sources[source] });

  // Visitor history (consent only): events and page views, capped as a whole.
  const ev = counters(input.visitor?.events);
  if (input.visitor) {
    const visitorReasons: ScoreReason[] = [];
    for (const k of EVENT_KEYS) {
      const n = Math.max(0, Math.floor(Number(ev[k]) || 0));
      if (!n || !s.events[k]) continue;
      visitorReasons.push({ code: 'event', key: k, n, points: s.events[k] * Math.min(n, s.eventRepeat) });
    }
    const views = Math.max(0, input.visitor.pageViews);
    if (views && s.pageView) visitorReasons.push({ code: 'pageViews', n: views, points: Math.min(s.pageViewCap, views * s.pageView) });
    let budget = s.visitorCap;
    for (const r of visitorReasons) {
      // Negative weights always apply; positive ones until the cap is used up.
      const p = r.points > 0 ? Math.min(r.points, Math.max(0, budget)) : r.points;
      if (r.points > 0) budget -= p;
      add({ ...r, points: p });
    }
  }

  const fit = quizFitOf(input.quizResult, ev);
  if (fit) add({ code: 'quiz', key: fit, points: s.quiz[fit] });

  if (input.kind === 'company') {
    const workers = Math.max(0, input.workersNeeded ?? 0);
    add({ code: 'company', n: workers, points: Math.min(s.company.cap, Math.round(s.company.base + workers * s.company.perWorker)) });
  }

  const last = Math.max(input.createdAt.getTime(), input.visitor?.lastSeenAt.getTime() ?? 0);
  const age = now.getTime() - last;
  const bucket = age <= DAY ? 'd1' : age <= 7 * DAY ? 'd7' : age <= 30 * DAY ? 'd30' : 'older';
  add({ code: 'recency', key: bucket, points: s.recency[bucket] });

  if ((input.phone ?? '').replace(/\D/g, '').length >= 7) add({ code: 'contact', key: 'phone', points: s.contact.phone });
  if (/^\S+@\S+\.\S+$/.test(input.email ?? '')) add({ code: 'contact', key: 'email', points: s.contact.email });
  if ((input.message ?? '').trim().length >= 40) add({ code: 'contact', key: 'message', points: s.contact.message });

  if (input.estimate && typeof input.estimate === 'object') add({ code: 'estimate', points: s.estimate });

  const score = Math.max(0, Math.min(100, reasons.reduce((a, r) => a + r.points, 0)));
  const level: LeadLevel = score >= s.thresholds.hot ? 'HOT' : score >= s.thresholds.warm ? 'WARM' : 'COLD';
  return { score, level, reasons };
};

const HOT_TEXT = (q: Pick<Inquiry, 'contactName' | 'companyName'>, score: number) => ({
  title: `HOT lead: ${q.companyName ? `${q.contactName} (${q.companyName})` : q.contactName} · ${score}`,
});

const notifyHotLead = async (q: Inquiry, score: number, s: LeadScoringSettings) => {
  const { title } = HOT_TEXT(q, score);
  const body = [q.email, q.phone, q.source ? `Mənbə: ${q.source}` : null, '', q.message.slice(0, 600)].filter((l) => l !== null).join('\n');
  const link = `/admin/inquiries?level=HOT&open=${q.id}`;
  await notifyStaff(title, body, { link, type: 'LEAD_HOT' });
  for (const userId of s.notifyUserIds) {
    await notifyUser(userId, { type: 'LEAD_HOT', title, body, link }).catch((err) => console.error('[leads] hot notify failed', err));
  }
};

/**
 * Recomputes one inquiry's score from its stored data and visitor history. When the lead turns HOT the
 * claim (conditional update) guarantees a single notification even if two events rescore at once.
 */
export const rescoreInquiry = async (inquiryId: string, opts: { settings?: LeadScoringSettings; now?: Date; notify?: boolean } = {}) => {
  const s = opts.settings ?? (await getLeadScoringSettings());
  if (!s.enabled) return null;
  const q = await prisma.inquiry.findUnique({ where: { id: inquiryId } });
  if (!q) return null;
  const visitor = q.visitorId ? await prisma.leadVisitor.findUnique({ where: { id: q.visitorId } }) : null;
  const result = scoreLead({ ...q, visitor }, s, opts.now);
  const data = { score: result.score, scoreLevel: result.level, scoreReasons: result.reasons as unknown as Prisma.InputJsonValue, scoredAt: opts.now ?? new Date() };
  if (result.level === 'HOT' && q.scoreLevel !== 'HOT') {
    const { count } = await prisma.inquiry.updateMany({ where: { id: q.id, OR: [{ scoreLevel: null }, { scoreLevel: { not: 'HOT' } }] }, data });
    if (count && s.notifyHot && opts.notify !== false && q.status !== 'DONE' && q.status !== 'ARCHIVED') {
      await notifyHotLead(q, result.score, s).catch((err) => console.error('[leads] hot notify failed', err));
    }
  } else {
    await prisma.inquiry.update({ where: { id: q.id }, data });
  }
  return result;
};

export const utmSchema = z
  .object({
    source: z.string().trim().max(100).optional(),
    medium: z.string().trim().max(100).optional(),
    campaign: z.string().trim().max(100).optional(),
    term: z.string().trim().max(100).optional(),
    content: z.string().trim().max(100).optional(),
  })
  .strip();
export type Utm = z.infer<typeof utmSchema>;

/** First-party visitor id created by the browser after analytics consent. */
export const visitorIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,40}$/);

const cleanUtm = (utm: Utm | null | undefined) => {
  if (!utm) return null;
  const out = Object.fromEntries(Object.entries(utm).filter(([, v]) => typeof v === 'string' && v.length > 0));
  return Object.keys(out).length ? out : null;
};

export interface LeadContext {
  visitorId?: string | null;
  utm?: Utm | null;
  quizResult?: Prisma.InputJsonValue | null;
  estimate?: Prisma.InputJsonValue | null;
  landingPageId?: string | null;
}

/**
 * Links a freshly created (or matched) inquiry to the visitor / campaign context and scores it. Called by
 * every public lead form; never throws (scoring must not break a submission).
 */
export const attachLeadContext = async (inquiryId: string, ctx: LeadContext = {}) => {
  try {
    const visitorId = ctx.visitorId && visitorIdSchema.safeParse(ctx.visitorId).success ? ctx.visitorId : null;
    const utm = cleanUtm(ctx.utm);
    const data: Prisma.InquiryUpdateInput = {};
    if (visitorId) data.visitorId = visitorId;
    if (utm) data.utm = utm;
    if (ctx.quizResult) data.quizResult = ctx.quizResult;
    if (ctx.estimate) data.estimate = ctx.estimate;
    if (ctx.landingPageId) data.landingPageId = ctx.landingPageId;
    if (Object.keys(data).length) await prisma.inquiry.update({ where: { id: inquiryId }, data });
    if (visitorId) {
      await prisma.leadVisitor.upsert({
        where: { id: visitorId },
        create: { id: visitorId, inquiryId, pageViews: 0, ...(utm ? { utm, source: utm.source?.slice(0, 80) ?? null } : {}) },
        update: { inquiryId, lastSeenAt: new Date() },
      });
    }
    return await rescoreInquiry(inquiryId);
  } catch (err) {
    console.error('[leads] attach / score failed', err);
    return null;
  }
};

/** Daily refresh: recency decays, so open leads of the last 60 days are rescored (no notifications). */
export const rescoreOpenLeads = async (now = new Date(), opts: { days?: number; notify?: boolean } = {}) => {
  const s = await getLeadScoringSettings();
  if (!s.enabled) return 0;
  const since = new Date(now.getTime() - (opts.days ?? 60) * DAY);
  const ids = await prisma.inquiry.findMany({ where: { createdAt: { gte: since }, status: { in: ['NEW', 'IN_PROGRESS'] } }, select: { id: true }, take: 5000 });
  for (const { id } of ids) await rescoreInquiry(id, { settings: s, now, notify: opts.notify ?? false });
  return ids.length;
};
