import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { normaliseSource } from '../funnel.js';
import { rescoreInquiry, utmSchema, visitorIdSchema } from './leadScoring.js';

/**
 * First-party lead visitors (LeadVisitor). Only browsers whose user accepted analytics cookies send a
 * random visitor id (client lib/leadVisitor.ts); without consent the site stays cookie-less. A visitor row
 * holds counters only — page views, a bounded set of event counters and the first campaign (utm) — never
 * an IP address, user agent or the pages' query strings. Rows that never became a lead are deleted after
 * 13 months (jobs/growth.ts).
 */

export const VISITOR_EVENTS = [
  'page_view',
  'quiz_done',
  'cost_calc',
  'start_calc',
  'booking_open',
  'booking_done',
  'event_register',
  'landing_view',
  'whatsapp_click',
] as const;
export type VisitorEvent = (typeof VISITOR_EVENTS)[number];

/** Public sections counted per page view ("page:/visas"); anything else only raises pageViews. */
const PAGE_SECTIONS = new Set([
  'visas',
  'services',
  'jobs',
  'ausbildung',
  'booking',
  'uygunluq-testi',
  'eligibility',
  'calculator',
  'cost-calculator',
  'budget',
  'salary-calculator',
  'events',
  'contact',
  'cooperation',
  'map',
  'stories',
  'faq',
  'anerkennung',
  'l',
]);

/** Language prefixes of the public site (/de/visas = /visas). */
const LANG_PREFIX = new Set(['az', 'de', 'en', 'ru', 'tr', 'uk']);

export const sectionOf = (path: string | undefined) => {
  const parts = (path ?? '').split(/[?#]/)[0].split('/').filter(Boolean);
  const first = (LANG_PREFIX.has(parts[0] ?? '') ? parts[1] : parts[0]) ?? '';
  return PAGE_SECTIONS.has(first) ? first : null;
};

export const visitorBeaconSchema = z.object({
  v: visitorIdSchema,
  e: z.enum(VISITOR_EVENTS),
  /** path of the page (no query) for page views */
  p: z.string().max(300).optional(),
  /** first event of a browser session → visits + 1 */
  visit: z.boolean().optional(),
  src: z.string().max(200).optional(),
  utm: utmSchema.optional(),
  l: z.enum(['az', 'de', 'en', 'ru', 'tr', 'uk']).optional().catch(undefined),
  /** quiz fit (quiz_done) */
  fit: z.enum(['high', 'medium', 'low']).optional(),
});
export type VisitorBeacon = z.infer<typeof visitorBeaconSchema>;

const MAX_COUNTER = 10_000;
/** Events that rescore the linked lead at once; page views only every 5th view. */
const RESCORE_EVENTS = new Set<VisitorEvent>(['quiz_done', 'cost_calc', 'start_calc', 'booking_open', 'booking_done', 'event_register', 'landing_view', 'whatsapp_click']);

/** Applies one beacon to the visitor's counters (creating the row) and rescores a linked lead. */
export const recordVisitorEvent = async (b: VisitorBeacon) => {
  const existing = await prisma.leadVisitor.findUnique({ where: { id: b.v } });
  const events = { ...((existing?.events as Record<string, number> | null) ?? {}) };
  const bump = (k: string) => {
    events[k] = Math.min(MAX_COUNTER, (Number(events[k]) || 0) + 1);
  };
  const isView = b.e === 'page_view';
  if (!isView) bump(b.e);
  if (b.e === 'quiz_done' && b.fit) bump(`quiz_${b.fit}`);
  const section = isView ? sectionOf(b.p) : null;
  if (section) bump(`page:/${section}`);
  // A page view of /booking counts as "booking opened" too.
  if (section === 'booking') bump('booking_open');

  const utm = b.utm && Object.values(b.utm).some(Boolean) ? (b.utm as Prisma.InputJsonValue) : undefined;
  const source = normaliseSource(b.utm?.source || b.src) || null;
  const row = existing
    ? await prisma.leadVisitor.update({
        where: { id: b.v },
        data: {
          lastSeenAt: new Date(),
          events,
          ...(b.visit ? { visits: { increment: 1 } } : {}),
          ...(isView ? { pageViews: { increment: 1 } } : {}),
          // first touch wins: campaign and source are only set once
          ...(!existing.utm && utm ? { utm } : {}),
          ...(!existing.source && source ? { source } : {}),
          ...(b.l ? { locale: b.l } : {}),
        },
      })
    : await prisma.leadVisitor
        .create({ data: { id: b.v, events, visits: 1, pageViews: isView ? 1 : 0, utm, source, locale: b.l ?? null } })
        .catch(async (err) => {
          // Two first beacons at once: the other one created the row.
          if ((err as { code?: string }).code === 'P2002') return prisma.leadVisitor.findUnique({ where: { id: b.v } });
          throw err;
        });
  if (row?.inquiryId && (RESCORE_EVENTS.has(b.e) || (isView && row.pageViews % 5 === 0))) {
    await rescoreInquiry(row.inquiryId);
  }
  return row;
};

/** Bumps one event for a visitor id sent along with a form (booking, event registration, …). Never throws. */
export const visitorDid = async (visitorId: string | null | undefined, e: VisitorEvent, extra: Partial<VisitorBeacon> = {}) => {
  if (!visitorId || !visitorIdSchema.safeParse(visitorId).success) return null;
  try {
    return await recordVisitorEvent({ ...extra, v: visitorId, e });
  } catch (err) {
    console.error('[leads] visitor event failed', err);
    return null;
  }
};

/** DSGVO: visitors that never became a lead are removed 13 months after their last visit. */
export const pruneVisitors = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - 395 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.leadVisitor.deleteMany({ where: { lastSeenAt: { lt: cutoff }, inquiryId: null } });
  return count;
};
