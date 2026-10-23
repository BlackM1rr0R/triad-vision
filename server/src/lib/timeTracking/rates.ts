import { z } from 'zod';
import { prisma } from '../../db.js';

/**
 * Hourly labour cost rates (SUPER_ADMIN only): one rate per staff member and effective-from day (StaffCostRate),
 * and a default rate (Setting `timeTracking.defaultCentsPerHour`) for staff without a rate of their own.
 * Amounts in EUR cents per hour. The labour cost of a case = Σ minutes / 60 × the rate in force on the day
 * the work started.
 */

export const TIME_SETTING_KEY = 'timeTracking';

export const rateSchema = z.object({
  userId: z.string().min(1).max(40),
  /** EUR per hour (decimal). */
  hourly: z.number().min(0).max(1000),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const defaultRateSchema = z.object({ hourly: z.number().min(0).max(1000) });

export const getDefaultRate = async () => {
  const row = await prisma.setting.findUnique({ where: { key: TIME_SETTING_KEY } });
  const v = (row?.value ?? {}) as { defaultCentsPerHour?: unknown };
  return typeof v.defaultCentsPerHour === 'number' && v.defaultCentsPerHour >= 0 ? Math.round(v.defaultCentsPerHour) : 0;
};

export const saveDefaultRate = async (centsPerHour: number) => {
  const row = await prisma.setting.findUnique({ where: { key: TIME_SETTING_KEY } });
  const value = { ...((row?.value ?? {}) as object), defaultCentsPerHour: centsPerHour };
  await prisma.setting.upsert({ where: { key: TIME_SETTING_KEY }, create: { key: TIME_SETTING_KEY, value }, update: { value } });
  return centsPerHour;
};

/** Rate lookup for many staff members: rateAt(userId, date) → cents per hour. */
export const loadRates = async (userIds: string[]) => {
  const [rows, fallback] = await Promise.all([
    userIds.length ? prisma.staffCostRate.findMany({ where: { userId: { in: userIds } }, orderBy: { effectiveFrom: 'desc' } }) : [],
    getDefaultRate(),
  ]);
  const byUser = new Map<string, { from: number; cents: number }[]>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), { from: r.effectiveFrom.getTime(), cents: r.centsPerHour }]);
  return {
    fallback,
    rateAt: (userId: string, at: Date) => {
      // effectiveFrom is a calendar day (stored at 00:00 UTC); the rate applies from that day on.
      const day = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
      return byUser.get(userId)?.find((r) => r.from <= day)?.cents ?? fallback;
    },
  };
};

/** Labour cost per case (finished entries): minutes and EUR cents (unrounded per entry, rounded per case). */
export const labourByCase = async (caseIds: string[]) => {
  const out = new Map<string, { minutes: number; cents: number; entries: number; lastAt: Date | null }>();
  if (!caseIds.length) return out;
  const entries = await prisma.timeEntry.findMany({
    where: { caseId: { in: caseIds }, endedAt: { not: null }, minutes: { gt: 0 } },
    select: { caseId: true, userId: true, minutes: true, startedAt: true },
  });
  if (!entries.length) return out;
  const rates = await loadRates([...new Set(entries.map((e) => e.userId))]);
  for (const e of entries) {
    const o = out.get(e.caseId!) ?? { minutes: 0, cents: 0, entries: 0, lastAt: null };
    o.minutes += e.minutes;
    o.cents += (e.minutes / 60) * rates.rateAt(e.userId, e.startedAt);
    o.entries++;
    if (!o.lastAt || e.startedAt > o.lastAt) o.lastAt = e.startedAt;
    out.set(e.caseId!, o);
  }
  for (const o of out.values()) o.cents = Math.round(o.cents);
  return out;
};

/** Staff list with their rate history (SUPER_ADMIN page). */
export const ratesOverview = async () => {
  const [staff, rows, fallback] = await Promise.all([
    prisma.user.findMany({ where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, firstName: true, lastName: true, role: true, isActive: true }, orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }] }),
    prisma.staffCostRate.findMany({ orderBy: { effectiveFrom: 'desc' } }),
    getDefaultRate(),
  ]);
  const today = new Date();
  return {
    defaultCentsPerHour: fallback,
    staff: staff.map((s) => {
      const history = rows.filter((r) => r.userId === s.id).map((r) => ({ id: r.id, centsPerHour: r.centsPerHour, effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10) }));
      const current = history.find((h) => new Date(`${h.effectiveFrom}T00:00:00Z`) <= today) ?? null;
      return { id: s.id, name: `${s.firstName} ${s.lastName}`.trim(), role: s.role, isActive: s.isActive, current: current?.centsPerHour ?? null, history };
    }),
  };
};
