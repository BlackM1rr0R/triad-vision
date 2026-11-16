import crypto from 'node:crypto';
import { prisma } from '../../db.js';
import { utcDay } from '../funnel.js';
import { toolSlugs } from '../toolLeads/tools.js';
import { computeToolAnalytics, toolMetric, TOOL_METRICS, type ToolEvent } from './compute.js';

/**
 * Tool analytics storage: one AnalyticsDaily row per (day, tool_<event>, tool slug), incremented atomically — the
 * same cookie-less daily counter as the funnel's visits (routes/track.ts). Nothing per visitor is stored.
 */

/** +1 for a tool event today. Never throws (analytics must not break a form). */
export const recordToolEvent = async (slug: string, event: ToolEvent, now = new Date()) => {
  try {
    const day = utcDay(now);
    await prisma.$executeRaw`
      INSERT INTO AnalyticsDaily (id, day, metric, source, count)
      VALUES (${crypto.randomUUID()}, ${day}, ${toolMetric(event)}, ${slug.slice(0, 60)}, 1)
      ON DUPLICATE KEY UPDATE count = count + 1`;
  } catch (err) {
    console.error('[tool-analytics] record failed', err);
  }
};

/** The admin report: `days` days ending today (UTC) vs the `days` before. */
export const toolAnalyticsReport = async (days: number, now = new Date()) => {
  const today = utcDay(now);
  const from = new Date(new Date(`${today}T00:00:00Z`).getTime() - (2 * days - 1) * 24 * 60 * 60 * 1000);
  const rows = await prisma.analyticsDaily.findMany({
    where: { metric: { in: TOOL_METRICS }, day: { gte: from } },
    select: { day: true, metric: true, source: true, count: true },
  });
  return computeToolAnalytics(
    rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), metric: r.metric, source: r.source, count: r.count })),
    { today, days, known: toolSlugs() },
  );
};
