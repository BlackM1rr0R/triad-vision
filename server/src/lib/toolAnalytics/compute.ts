/**
 * Tool analytics (admin /admin/tool-analytics): pure aggregation of the daily counters (AnalyticsDaily rows with a
 * `tool_*` metric, source = tool slug). No personal data: every number is a per-day, per-tool counter.
 *
 * Metrics:
 *   tool_view       a tool page was opened (cookie-less counter, every visitor that does not send DNT / GPC)
 *   tool_use        the visitor interacted (calculated, finished a quiz / game / exam) — once per page view
 *   tool_lead       "e-mail me my result" sent (server side, when the lead is stored)
 *   tool_register   an account was created by a visitor whose FIRST tool was this one (only with analytics consent:
 *                   the first tool is remembered in the browser after the cookie banner allowed analytics)
 *   tool_inquiry    a contact form was sent by such a visitor (same rule)
 *   tool_embed_view the embeddable widget of the tool was shown on another site (/embed/*)
 */

export const TOOL_EVENTS = ['view', 'use', 'lead', 'register', 'inquiry', 'embed_view'] as const;
export type ToolEvent = (typeof TOOL_EVENTS)[number];
export const toolMetric = (e: ToolEvent) => `tool_${e}`;
export const TOOL_METRICS = TOOL_EVENTS.map(toolMetric);
/** Events the browser may send (leads are counted by the server only). */
export const BEACON_EVENTS = ['view', 'use', 'register', 'inquiry', 'embed_view'] as const satisfies readonly ToolEvent[];

export const ANALYTICS_PERIODS = [7, 30, 90] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export interface DailyRow {
  /** YYYY-MM-DD (UTC) */
  day: string;
  metric: string;
  source: string;
  count: number;
}

export interface ToolCounts {
  views: number;
  uses: number;
  leads: number;
  registrations: number;
  inquiries: number;
  embedViews: number;
}

export interface ToolRow extends ToolCounts {
  slug: string;
  /** leads + registrations + inquiries */
  conversions: number;
  /** % of views that interacted, null without views */
  useRate: number | null;
  /** % of views that converted (lead, registration or inquiry), null without views */
  conversionRate: number | null;
  /** previous period of the same length */
  prev: ToolCounts & { conversions: number; conversionRate: number | null };
  /** % change of views against the previous period (null when there were none before) */
  viewsTrend: number | null;
  /** views per day over the period (oldest first), for the sparkline */
  daily: number[];
}

const DAY = 24 * 60 * 60 * 1000;
const empty = (): ToolCounts => ({ views: 0, uses: 0, leads: 0, registrations: 0, inquiries: 0, embedViews: 0 });
const FIELD: Record<string, keyof ToolCounts> = {
  tool_view: 'views',
  tool_use: 'uses',
  tool_lead: 'leads',
  tool_register: 'registrations',
  tool_inquiry: 'inquiries',
  tool_embed_view: 'embedViews',
};

export const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const conv = (c: ToolCounts) => c.leads + c.registrations + c.inquiries;

/** The `days` calendar days ending with `today` (YYYY-MM-DD, oldest first). */
export const dayRange = (today: string, days: number) => {
  const end = new Date(`${today}T00:00:00Z`).getTime();
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * DAY).toISOString().slice(0, 10));
};

/**
 * Per-tool rows for the period of `days` ending `today`, compared with the `days` before. `rows` must cover both
 * periods (2 × days); rows outside are ignored. `known` lists tools that appear even without any data.
 */
export const computeToolAnalytics = (rows: DailyRow[], opts: { today: string; days: number; known?: string[] }) => {
  const cur = dayRange(opts.today, opts.days);
  const prevDays = dayRange(cur[0], opts.days + 1).slice(0, opts.days);
  const curSet = new Set(cur);
  const prevSet = new Set(prevDays);
  const dayIndex = new Map(cur.map((d, i) => [d, i]));
  const tools = new Map<string, { cur: ToolCounts; prev: ToolCounts; daily: number[] }>();
  const get = (slug: string) => {
    let t = tools.get(slug);
    if (!t) tools.set(slug, (t = { cur: empty(), prev: empty(), daily: cur.map(() => 0) }));
    return t;
  };
  for (const s of opts.known ?? []) get(s);
  const totalsDaily = cur.map(() => ({ views: 0, uses: 0, conversions: 0 }));
  for (const r of rows) {
    const field = FIELD[r.metric];
    if (!field || !r.source) continue;
    const n = Math.max(0, Math.round(r.count));
    if (curSet.has(r.day)) {
      const t = get(r.source);
      t.cur[field] += n;
      const i = dayIndex.get(r.day)!;
      if (field === 'views') {
        t.daily[i] += n;
        totalsDaily[i].views += n;
      } else if (field === 'uses') totalsDaily[i].uses += n;
      else if (field === 'leads' || field === 'registrations' || field === 'inquiries') totalsDaily[i].conversions += n;
    } else if (prevSet.has(r.day)) {
      get(r.source).prev[field] += n;
    }
  }
  const items: ToolRow[] = [...tools.entries()].map(([slug, t]) => ({
    slug,
    ...t.cur,
    conversions: conv(t.cur),
    useRate: pct(t.cur.uses, t.cur.views),
    conversionRate: pct(conv(t.cur), t.cur.views),
    prev: { ...t.prev, conversions: conv(t.prev), conversionRate: pct(conv(t.prev), t.prev.views) },
    viewsTrend: t.prev.views > 0 ? Math.round(((t.cur.views - t.prev.views) / t.prev.views) * 1000) / 10 : null,
    daily: t.daily,
  }));
  items.sort((a, b) => b.views - a.views || b.conversions - a.conversions || a.slug.localeCompare(b.slug));
  const sum = (pick: (x: ToolCounts) => number, which: 'cur' | 'prev') =>
    items.reduce((acc, i) => acc + pick(which === 'cur' ? i : i.prev), 0);
  const totals = {
    views: sum((x) => x.views, 'cur'),
    uses: sum((x) => x.uses, 'cur'),
    leads: sum((x) => x.leads, 'cur'),
    registrations: sum((x) => x.registrations, 'cur'),
    inquiries: sum((x) => x.inquiries, 'cur'),
    embedViews: sum((x) => x.embedViews, 'cur'),
    prevViews: sum((x) => x.views, 'prev'),
    prevConversions: sum((x) => conv(x), 'prev'),
  };
  return {
    days: opts.days,
    from: cur[0],
    to: cur[cur.length - 1],
    totals: { ...totals, conversions: totals.leads + totals.registrations + totals.inquiries, conversionRate: pct(totals.leads + totals.registrations + totals.inquiries, totals.views) },
    series: cur.map((day, i) => ({ day, ...totalsDaily[i] })),
    items,
  };
};
