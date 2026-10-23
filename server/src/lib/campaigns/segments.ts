import { ApplicationStatus, CaseStatus, Prisma, VisaType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';

/**
 * Campaign segments: saved, click-built filters over candidates and employer users. A definition is
 * plain JSON (validated by `segmentDefinition`) with two levels of AND/OR:
 *
 *   { op: 'AND', groups: [ { op: 'OR', conditions: [ { field: 'caseStatus', values: [...] }, ... ] }, ... ] }
 *
 * It is turned into a Prisma `where` (never SQL). Every segment is limited to active CLIENT / COMPANY
 * accounts: staff, admins and agents are never campaign recipients. Case-related conditions are each
 * evaluated on their own ("has a case with status X" AND "has a case with visa type Y" may match two
 * different cases of the same person).
 */

const DAY = 24 * 60 * 60 * 1000;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ids = z.array(z.string().trim().min(1).max(40)).min(1).max(200);
const words = z.array(z.string().trim().min(1).max(80)).min(1).max(100);

export const SEGMENT_FIELDS = [
  'role',
  'caseStatus',
  'visaType',
  'visaCategory',
  'caseState',
  'registered',
  'lastActivity',
  'locale',
  'city',
  'country',
  'passportExpiresWithin',
  'appointmentWithin',
  'applicationStatus',
  'company',
  'unpaidInvoice',
  'marketingOptIn',
] as const;

export const segmentCondition = z.discriminatedUnion('field', [
  z.object({ field: z.literal('role'), values: z.array(z.enum(['CLIENT', 'COMPANY'])).min(1) }),
  z.object({ field: z.literal('caseStatus'), values: z.array(z.nativeEnum(CaseStatus)).min(1) }),
  z.object({ field: z.literal('visaType'), values: z.array(z.nativeEnum(VisaType)).min(1) }),
  z.object({ field: z.literal('visaCategory'), values: ids }),
  /** ACTIVE = an open case, CLOSED = a finished case, NONE = no case at all. */
  z.object({ field: z.literal('caseState'), value: z.enum(['ACTIVE', 'CLOSED', 'NONE']) }),
  z.object({ field: z.literal('registered'), from: date.optional(), to: date.optional() }),
  /** Last request of any session (login activity). */
  z.object({ field: z.literal('lastActivity'), op: z.enum(['before', 'after']), date }),
  z.object({ field: z.literal('locale'), values: z.array(z.enum(['az', 'de', 'en', 'ru'])).min(1) }),
  z.object({ field: z.literal('city'), values: words }),
  /** Country = nationality on the profile (there is no separate country of residence). */
  z.object({ field: z.literal('country'), values: words }),
  z.object({ field: z.literal('passportExpiresWithin'), months: z.number().int().min(1).max(120) }),
  z.object({ field: z.literal('appointmentWithin'), days: z.number().int().min(1).max(365) }),
  z.object({ field: z.literal('applicationStatus'), vacancyId: z.string().trim().min(1).max(40), values: z.array(z.nativeEnum(ApplicationStatus)).max(10).default([]) }),
  /** Employer users of these companies, and candidates placed with them. */
  z.object({ field: z.literal('company'), values: ids }),
  /** Employer users whose company has a sent or overdue invoice. */
  z.object({ field: z.literal('unpaidInvoice') }),
  z.object({ field: z.literal('marketingOptIn'), value: z.boolean().default(true) }),
]);
export type SegmentCondition = z.infer<typeof segmentCondition>;

export const segmentGroup = z.object({ op: z.enum(['AND', 'OR']).default('AND'), conditions: z.array(segmentCondition).min(1).max(20) });

export const segmentDefinition = z.object({
  op: z.enum(['AND', 'OR']).default('AND'),
  groups: z.array(segmentGroup).max(10).default([]),
});
export type SegmentDefinition = z.infer<typeof segmentDefinition>;

/** "YYYY-MM-DD" as the start (or end) of that day in Baku (UTC+4, no daylight saving). */
const bakuDay = (d: string, end = false) => new Date(`${d}T${end ? '23:59:59.999' : '00:00:00.000'}+04:00`);

const addMonths = (now: Date, months: number) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
};

const conditionWhere = (c: SegmentCondition, now: Date): Prisma.UserWhereInput => {
  switch (c.field) {
    case 'role':
      return { role: { in: c.values } };
    case 'caseStatus':
      return { cases: { some: { status: { in: c.values } } } };
    case 'visaType':
      return { cases: { some: { visaType: { in: c.values } } } };
    case 'visaCategory':
      return { cases: { some: { visaCategoryId: { in: c.values } } } };
    case 'caseState':
      if (c.value === 'NONE') return { cases: { none: {} } };
      if (c.value === 'ACTIVE') return { cases: { some: { status: { notIn: FINAL_STATUSES } } } };
      return { cases: { some: { status: { in: FINAL_STATUSES } } } };
    case 'registered': {
      const createdAt: Prisma.DateTimeFilter = {};
      if (c.from) createdAt.gte = bakuDay(c.from);
      if (c.to) createdAt.lte = bakuDay(c.to, true);
      return { createdAt };
    }
    case 'lastActivity':
      // "after": some session was used on/after the day; "before": no session used since then.
      return c.op === 'after'
        ? { sessions: { some: { lastSeenAt: { gte: bakuDay(c.date) } } } }
        : { sessions: { none: { lastSeenAt: { gte: bakuDay(c.date) } } } };
    case 'locale':
      return { locale: { in: c.values } };
    case 'city':
      return { city: { in: c.values } };
    case 'country':
      return { nationality: { in: c.values } };
    case 'passportExpiresWithin':
      return { passportExpiry: { gte: now, lte: addMonths(now, c.months) } };
    case 'appointmentWithin':
      return { cases: { some: { appointmentAt: { gte: now, lte: new Date(now.getTime() + c.days * DAY) } } } };
    case 'applicationStatus':
      return { applications: { some: { vacancyId: c.vacancyId, ...(c.values.length ? { status: { in: c.values } } : {}) } } };
    case 'company':
      return { OR: [{ role: 'COMPANY', companyId: { in: c.values } }, { cases: { some: { companyId: { in: c.values } } } }] };
    case 'unpaidInvoice':
      return { role: 'COMPANY', company: { invoices: { some: { status: { in: ['SENT', 'OVERDUE'] } } } } };
    case 'marketingOptIn':
      return { marketingOptIn: c.value };
  }
};

/** Only people the agency serves (never staff, admins or agents), and only active accounts. */
export const RECIPIENT_BASE: Prisma.UserWhereInput = { isActive: true, role: { in: ['CLIENT', 'COMPANY'] } };

export const segmentWhere = (def: SegmentDefinition, now = new Date()): Prisma.UserWhereInput => {
  const groups = def.groups.map((g): Prisma.UserWhereInput => {
    const parts = g.conditions.map((c) => conditionWhere(c, now));
    return g.op === 'OR' ? { OR: parts } : { AND: parts };
  });
  if (!groups.length) return RECIPIENT_BASE;
  return { AND: [RECIPIENT_BASE, def.op === 'OR' ? { OR: groups } : { AND: groups }] };
};

export const sampleSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  locale: true,
  city: true,
  marketingOptIn: true,
  emailNotifications: true,
  smsNotifications: true,
  company: { select: { name: true } },
} satisfies Prisma.UserSelect;

/** Live count and a sample list for the segment builder. */
export const previewSegment = async (def: SegmentDefinition, opts: { sample?: number } = {}) => {
  const where = segmentWhere(def);
  const [count, optedIn, sample] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { AND: [where, { marketingOptIn: true }] } }),
    prisma.user.findMany({ where, select: sampleSelect, orderBy: { createdAt: 'desc' }, take: opts.sample ?? 20 }),
  ]);
  return { count, marketingOptedIn: optedIn, sample };
};
