import { BAKU_OFFSET_MS, bakuMidnight, bakuParts } from '../reports/dates.js';

/**
 * Pure helpers of the analytics overview (GET /api/admin/analytics/overview): period windows, Baku month
 * buckets, lead channels, the attention health score and the annual goal pace. No database access here.
 *
 * Time zone: every boundary is a Baku calendar day / month (UTC+4 all year), like the reports.
 */

const DAY = 24 * 60 * 60 * 1000;

export const OVERVIEW_PERIODS = ['month', '30d', '90d', 'quarter', 'ytd', '12m'] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];

export interface Window {
  start: Date;
  end: Date; // exclusive
}

export interface PeriodWindows {
  key: OverviewPeriod;
  cur: Window;
  prev: Window;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Baku day (YYYY-MM-DD) of an instant. */
export const bakuDayKey = (d: Date) => {
  const p = bakuParts(d);
  return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`;
};

/** Baku month (YYYY-MM) of an instant. */
export const bakuMonthKey = (d: Date) => {
  const p = bakuParts(d);
  return `${p.y}-${pad(p.m + 1)}`;
};

/** Last day (exclusive end as a Baku day) of a window, for display: the day before `end`. */
export const lastDayOf = (w: Window) => bakuDayKey(new Date(w.end.getTime() - 1));

/**
 * The current window ends now; the previous one is the same stretch of the period before it
 * ("this month so far" vs. the same days of last month, last 30 days vs. the 30 days before).
 */
export const periodWindows = (key: OverviewPeriod, now = new Date()): PeriodWindows => {
  const p = bakuParts(now);
  const today = bakuMidnight(p.y, p.m, p.d);
  const end = now;
  const sameSpan = (start: Date, prevStart: Date): PeriodWindows => {
    const len = end.getTime() - start.getTime();
    return { key, cur: { start, end }, prev: { start: prevStart, end: new Date(prevStart.getTime() + len) } };
  };
  switch (key) {
    case 'month':
      return sameSpan(bakuMidnight(p.y, p.m, 1), bakuMidnight(p.y, p.m - 1, 1));
    case 'quarter': {
      const q = Math.floor(p.m / 3) * 3;
      return sameSpan(bakuMidnight(p.y, q, 1), bakuMidnight(p.y, q - 3, 1));
    }
    case 'ytd':
      return sameSpan(bakuMidnight(p.y, 0, 1), bakuMidnight(p.y - 1, 0, 1));
    case '12m': {
      const start = bakuMidnight(p.y - 1, p.m, p.d + 1);
      return { key, cur: { start, end }, prev: { start: bakuMidnight(p.y - 2, p.m, p.d + 1), end: start } };
    }
    case '90d':
    case '30d': {
      const n = key === '30d' ? 30 : 90;
      const start = new Date(today.getTime() - (n - 1) * DAY);
      return { key, cur: { start, end }, prev: { start: new Date(start.getTime() - n * DAY), end: start } };
    }
  }
};

/** The last `n` Baku months up to and including the current one: keys and [start, end) (the current month ends now). */
export const lastMonths = (n: number, now = new Date()) => {
  const p = bakuParts(now);
  return Array.from({ length: n }, (_, i) => {
    const m = p.m - (n - 1 - i);
    const start = bakuMidnight(p.y, m, 1);
    const next = bakuMidnight(p.y, m + 1, 1);
    return { key: bakuMonthKey(start), start, end: next > now ? now : next };
  });
};

export const inWin = (d: Date | null | undefined, w: Window) => !!d && d >= w.start && d < w.end;

export const pctChange = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

export const ratio = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10;
};

// ─── Lead source / channel ──────────────────────────────────────────────

export type SourceKey = 'partner' | 'agent' | 'site';

/** Who brought a case: a referral partner (case or client owner), an agent (client referral), else the site / office. */
export const caseSource = (c: { partnerId: string | null; client: { ownerPartnerId: string | null; referredByAgentId: string | null } | null }): SourceKey =>
  c.partnerId || c.client?.ownerPartnerId ? 'partner' : c.client?.referredByAgentId ? 'agent' : 'site';

export const inquirySource = (i: { partnerId: string | null; agentId: string | null }): SourceKey => (i.partnerId ? 'partner' : i.agentId ? 'agent' : 'site');

/** utm_source → lower-case [a-z0-9._-], max 40 chars ("" when missing). */
const utmSource = (utm: unknown) => {
  const s = utm && typeof utm === 'object' && 'source' in utm ? (utm as { source?: unknown }).source : undefined;
  return typeof s === 'string'
    ? s
        .trim()
        .toLowerCase()
        .replace(/^www\./, '')
        .replace(/[^a-z0-9._-]/g, '')
        .slice(0, 40)
    : '';
};

/**
 * Channel of an inquiry for the "leads by channel" bars: partner / agent / info session (event) / landing page /
 * the UTM source ("utm:google") / direct. A partner or agent link wins over the UTM tag.
 */
export const inquiryChannel = (i: { partnerId: string | null; agentId: string | null; source: string | null; landingPageId: string | null; utm: unknown }) => {
  if (i.partnerId) return 'partner';
  if (i.agentId) return 'agent';
  if (i.source?.startsWith('event:')) return 'event';
  const utm = utmSource(i.utm);
  if (utm) return `utm:${utm}`;
  if (i.landingPageId) return 'landing';
  return 'direct';
};

/** Channel rows, biggest first; past `max` rows the tail folds into "other". */
export const channelRows = (cur: string[], prev: string[], max = 7) => {
  const count = (xs: string[]) => xs.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>());
  const c = count(cur);
  const p = count(prev);
  const keys = [...new Set([...c.keys(), ...p.keys()])].sort((a, b) => (c.get(b) ?? 0) - (c.get(a) ?? 0) || (p.get(b) ?? 0) - (p.get(a) ?? 0) || a.localeCompare(b));
  const head = keys.slice(0, max);
  const tail = keys.slice(max);
  const rows = head.map((key) => ({ key, count: c.get(key) ?? 0, prev: p.get(key) ?? 0 }));
  if (tail.length) rows.push({ key: 'other', count: tail.reduce((a, k) => a + (c.get(k) ?? 0), 0), prev: tail.reduce((a, k) => a + (p.get(k) ?? 0), 0) });
  return rows;
};

// ─── Cohort funnel ──────────────────────────────────────────────────────

export const FUNNEL_STEPS = ['inquiries', 'cases', 'docsComplete', 'appointment', 'approved', 'arrived'] as const;
export type FunnelStepKey = (typeof FUNNEL_STEPS)[number];

/** Furthest step a case got to (lib/funnel STATUS_RANK scale): 1 = documents submitted, 5 = embassy appointment. */
const RANK_DOCS = 1;
const RANK_APPOINTMENT = 5;

export interface CohortCase {
  clientId: string;
  source: SourceKey;
  /** Furthest STATUS_RANK the case ever reached (current status and status history). */
  maxRank: number;
  approved: boolean;
  arrived: boolean;
}

/**
 * Funnel of one cohort: the leads and cases that ENTERED in the period, followed up to now.
 * Step 1 = inquiries of the period + cases of the period that did not come from one of those inquiries (office,
 * partner or agent sign-ups with no web inquiry), so every case of step 2 is also counted in step 1. Steps 3–6 =
 * how many of the step-2 cases reached the step at any time since. Steps never increase (a guard clamps the rare
 * family case opened twice from one inquiry), so every step conversion is ≤ 100 %.
 */
export const cohortFunnel = (inquiries: { source: SourceKey; convertedUserId: string | null }[], cases: CohortCase[], source: SourceKey | 'all') => {
  const inq = source === 'all' ? inquiries : inquiries.filter((i) => i.source === source);
  const cs = source === 'all' ? cases : cases.filter((c) => c.source === source);
  const converted = new Set(inquiries.map((i) => i.convertedUserId).filter((x): x is string => !!x));
  const raw: Record<FunnelStepKey, number> = {
    inquiries: inq.length + cs.filter((c) => !converted.has(c.clientId)).length,
    cases: cs.length,
    docsComplete: cs.filter((c) => c.maxRank >= RANK_DOCS).length,
    appointment: cs.filter((c) => c.maxRank >= RANK_APPOINTMENT).length,
    approved: cs.filter((c) => c.approved).length,
    arrived: cs.filter((c) => c.arrived).length,
  };
  let last = Infinity;
  return FUNNEL_STEPS.map((key) => {
    last = Math.min(last, raw[key]);
    return { key, count: last };
  });
};

// ─── Attention health score ─────────────────────────────────────────────

export type AttentionReason = 'stuck' | 'waiting' | 'expired' | 'expiring';

/**
 * 0–100 (higher = healthier) for a case that needs a look: idle days cost 2.5 points each (at most 50), a staff
 * step past its SLA 20, an expired document 35 (expiring within 7 days 25, within the window 12), no activity at
 * all for the stuck threshold 15. Never below 5, so the bar stays visible.
 */
export const healthScore = (x: { idleDays: number; reasons: AttentionReason[]; expiryDays: number | null }) => {
  let s = 100 - Math.min(50, Math.max(0, x.idleDays) * 2.5);
  if (x.reasons.includes('waiting')) s -= 20;
  if (x.reasons.includes('stuck')) s -= 15;
  if (x.reasons.includes('expired')) s -= 35;
  else if (x.reasons.includes('expiring')) s -= x.expiryDays !== null && x.expiryDays <= 7 ? 25 : 12;
  return Math.max(5, Math.min(100, Math.round(s)));
};

/** Activity counts per week for the last `weeks` weeks (oldest first), from event instants. */
export const weeklyCounts = (dates: Date[], now: Date, weeks = 8) => {
  const out = Array.from({ length: weeks }, () => 0);
  const end = now.getTime();
  for (const d of dates) {
    const ago = Math.floor((end - d.getTime()) / (7 * DAY));
    if (ago >= 0 && ago < weeks) out[weeks - 1 - ago]++;
  }
  return out;
};

// ─── Annual goal ────────────────────────────────────────────────────────

export const GOAL_METRICS = ['visas', 'revenue'] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

/**
 * Progress towards a yearly target: now, still to add, the average per month so far, the value the year ends
 * with at this pace and the day the target is reached at this pace (null when nothing yet; past the year end
 * is allowed — "on pace for March next year").
 */
export const goalPace = (target: number | null, value: number, year: number, now = new Date()) => {
  const start = bakuMidnight(year, 0, 1);
  const end = bakuMidnight(year + 1, 0, 1);
  const elapsed = Math.min(end.getTime(), Math.max(start.getTime(), now.getTime())) - start.getTime();
  const frac = elapsed / (end.getTime() - start.getTime());
  const months = frac * 12;
  const perMonth = months > 0 ? Math.round((value / months) * 10) / 10 : null;
  const projected = frac > 0 ? Math.round(value / frac) : null;
  let reachDate: string | null = null;
  if (target && target > 0 && value > 0) {
    if (value >= target) reachDate = null;
    else reachDate = bakuDayKey(new Date(start.getTime() + (target / value) * elapsed));
  }
  return {
    year,
    target,
    value,
    remaining: target ? Math.max(0, target - value) : null,
    pct: target ? Math.min(999, Math.round((value / target) * 1000) / 10) : null,
    perMonth,
    projected,
    reachDate,
    reached: !!target && value >= target,
    yearElapsedPct: Math.round(frac * 1000) / 10,
  };
};

/** Baku calendar year of an instant. */
export const bakuYear = (d: Date) => new Date(d.getTime() + BAKU_OFFSET_MS).getUTCFullYear();
