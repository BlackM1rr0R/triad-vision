import type { Role, SecurityAlert } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { notifyUser } from '../notifications.js';
import { bakuParts } from '../reports/dates.js';
import { getSecuritySettings, type RuleKey, type Severity } from '../aiMgmt/settings.js';
import { raiseAlert } from '../aiMgmt/security/alerts.js';
import type { Hit } from '../aiMgmt/security/rules.js';
import { auditText } from './texts.js';

/**
 * Access anomaly alerts: deterministic thresholds, no AI. Sources: the record-access counter (StaffRecordAccess),
 * DocumentAccessLog (document views name a case), AuditLog (SENSITIVE_REVEALED, *EXPORT* actions), BreakGlassGrant
 * and Session (logins). Hits go through the security alerts module (lib/aiMgmt/security/alerts.ts raiseAlert:
 * dedupe, merge, "false positive" suppression; the AI explanation is NOT requested) and every new alert notifies
 * the SUPER_ADMIN and ADMIN accounts. Thresholds are edited in Access Center > Audit (Setting "access.anomalyRules").
 */

export const ANOMALY_SETTING_KEY = 'access.anomalyRules';
export const ANOMALY_RULES = ['accessManyRecords', 'accessManyReveals', 'accessManyExports', 'accessBreakGlass', 'accessOffHours', 'partnerManyIps'] as const;
export type AnomalyRule = (typeof ANOMALY_RULES)[number];

const on = (d: boolean) => z.boolean().catch(d);
const int = (min: number, max: number, d: number) => z.coerce.number().int().min(min).max(max).catch(d);

export const anomalySettingsSchema = z.object({
  /** More than `threshold` distinct client / case records opened by one staff member within one hour. */
  manyRecords: z.object({ enabled: on(true), threshold: int(10, 10_000, 150) }).catch({ enabled: true, threshold: 150 }),
  /** More than `threshold` masked-value reveals by one person per (Baku) day. */
  manyReveals: z.object({ enabled: on(true), threshold: int(1, 10_000, 20) }).catch({ enabled: true, threshold: 20 }),
  /** More than `threshold` exports by one person per (Baku) day. */
  manyExports: z.object({ enabled: on(true), threshold: int(1, 10_000, 10) }).catch({ enabled: true, threshold: 10 }),
  /** More than `threshold` break-glass grants of one person within 7 days. */
  breakGlass: z.object({ enabled: on(true), threshold: int(1, 100, 3) }).catch({ enabled: true, threshold: 3 }),
  /** Staff logins outside working hours (Baku time); off unless configured. */
  offHours: z
    .object({ enabled: on(false), startHour: int(0, 23, 8), endHour: int(1, 24, 20), weekdaysOnly: on(true) })
    .catch({ enabled: false, startHour: 8, endHour: 20, weekdaysOnly: true }),
  /** Partner (AGENT) logins of one account from at least `threshold` different IP addresses within 24 hours. */
  partnerIps: z.object({ enabled: on(true), threshold: int(2, 100, 5) }).catch({ enabled: true, threshold: 5 }),
});
export type AnomalySettings = z.infer<typeof anomalySettingsSchema>;
export const DEFAULT_ANOMALY_SETTINGS: AnomalySettings = anomalySettingsSchema.parse({});

export const anomalySettingsUpdate = z
  .object({
    manyRecords: z.object({ enabled: z.boolean(), threshold: z.number().int().min(10).max(10_000) }).partial().strict(),
    manyReveals: z.object({ enabled: z.boolean(), threshold: z.number().int().min(1).max(10_000) }).partial().strict(),
    manyExports: z.object({ enabled: z.boolean(), threshold: z.number().int().min(1).max(10_000) }).partial().strict(),
    breakGlass: z.object({ enabled: z.boolean(), threshold: z.number().int().min(1).max(100) }).partial().strict(),
    offHours: z
      .object({ enabled: z.boolean(), startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(1).max(24), weekdaysOnly: z.boolean() })
      .partial()
      .strict(),
    partnerIps: z.object({ enabled: z.boolean(), threshold: z.number().int().min(2).max(100) }).partial().strict(),
  })
  .partial()
  .strict();

export const getAnomalySettings = async (): Promise<AnomalySettings> => {
  const row = await prisma.setting.findUnique({ where: { key: ANOMALY_SETTING_KEY } });
  return anomalySettingsSchema.parse(row?.value ?? {});
};

export const saveAnomalySettings = async (patch: z.infer<typeof anomalySettingsUpdate>) => {
  const before = await getAnomalySettings();
  const merged: Record<string, unknown> = { ...before };
  for (const [k, v] of Object.entries(patch)) merged[k] = { ...(before as unknown as Record<string, object>)[k], ...v };
  const after = anomalySettingsSchema.parse(merged);
  await prisma.setting.upsert({ where: { key: ANOMALY_SETTING_KEY }, create: { key: ANOMALY_SETTING_KEY, value: after }, update: { value: after } });
  return { before, after };
};

// ─── Pure detection (unit-tested) ──────────────────────────────────────────

export interface Detected {
  rule: AnomalyRule;
  userId: string;
  /** Count that crossed the threshold. */
  count: number;
  threshold: number;
  /** Ids of the events (dedupe in the alerts module). */
  eventIds: string[];
  extra?: Record<string, unknown>;
}

/** Groups (userId, key, eventId) rows; users whose number of DISTINCT keys is above the threshold (> threshold). */
export const overThreshold = (rule: AnomalyRule, rows: { userId: string | null; key: string; id: string }[], threshold: number): Detected[] => {
  const by = new Map<string, { keys: Set<string>; ids: string[] }>();
  for (const r of rows) {
    if (!r.userId) continue;
    const g = by.get(r.userId) ?? { keys: new Set<string>(), ids: [] };
    g.keys.add(r.key);
    g.ids.push(r.id);
    by.set(r.userId, g);
  }
  const out: Detected[] = [];
  for (const [userId, g] of by) if (g.keys.size > threshold) out.push({ rule, userId, count: g.keys.size, threshold, eventIds: g.ids });
  return out;
};

/** Whether a Baku hour / ISO weekday (1 = Monday) lies outside the working window [startHour, endHour). */
export const outsideHours = (hour: number, weekday: number, cfg: { startHour: number; endHour: number; weekdaysOnly: boolean }) => {
  if (cfg.weekdaysOnly && weekday >= 6) return true;
  return cfg.startHour <= cfg.endHour ? hour < cfg.startHour || hour >= cfg.endHour : hour < cfg.startHour && hour >= cfg.endHour;
};

/** Distinct case / client records per user (record counter + document views of the last hour). */
export const recordRows = (
  touches: { userId: string; record: string; hour: Date }[],
  docViews: { id: string; actorId: string | null; caseId: string | null; clientId: string }[],
): { userId: string | null; key: string; id: string }[] => [
  ...touches.map((t) => ({ userId: t.userId, key: t.record, id: `rec:${t.userId}:${t.record}:${t.hour.getTime()}` })),
  ...docViews.map((d) => ({ userId: d.actorId, key: d.caseId ? `case:${d.caseId}` : `client:${d.clientId}`, id: `doc:${d.id}` })),
];

// ─── Database side ────────────────────────────────────────────────────────

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const STAFF: Role[] = ['STAFF', 'ADMIN'];

const startOfBakuDay = (now: Date) => {
  const p = bakuParts(now);
  return new Date(Date.UTC(p.y, p.m, p.d) - 4 * HOUR);
};

export const detectAnomalies = async (now = new Date(), settings?: AnomalySettings): Promise<Detected[]> => {
  const s = settings ?? (await getAnomalySettings());
  const out: Detected[] = [];

  if (s.manyRecords.enabled) {
    const since = new Date(now.getTime() - HOUR);
    const staffIds = new Set((await prisma.user.findMany({ where: { role: { in: STAFF } }, select: { id: true } })).map((u) => u.id));
    const [touches, docs] = await Promise.all([
      prisma.staffRecordAccess.findMany({ where: { hour: { gte: new Date(Math.floor(since.getTime() / HOUR) * HOUR), lte: now } }, select: { userId: true, record: true, hour: true }, take: 100_000 }),
      prisma.documentAccessLog.findMany({ where: { lastAt: { gte: since, lte: now }, actorRole: { in: STAFF } }, select: { id: true, actorId: true, caseId: true, clientId: true }, take: 100_000 }),
    ]);
    out.push(...overThreshold('accessManyRecords', recordRows(touches, docs), s.manyRecords.threshold).filter((d) => staffIds.has(d.userId)));
  }
  const dayStart = startOfBakuDay(now);
  if (s.manyReveals.enabled) {
    const rows = await prisma.auditLog.findMany({ where: { action: 'SENSITIVE_REVEALED', createdAt: { gte: dayStart, lte: now } }, select: { id: true, actorId: true }, take: 50_000 });
    out.push(...overThreshold('accessManyReveals', rows.map((r) => ({ userId: r.actorId, key: r.id, id: r.id })), s.manyReveals.threshold));
  }
  if (s.manyExports.enabled) {
    const rows = await prisma.auditLog.findMany({
      where: { action: { contains: 'EXPORT' }, createdAt: { gte: dayStart, lte: now }, actorId: { not: null } },
      select: { id: true, actorId: true, action: true },
      take: 50_000,
    });
    const real = rows.filter((r) => r.action !== 'NOTHING_TO_EXPORT');
    out.push(...overThreshold('accessManyExports', real.map((r) => ({ userId: r.actorId, key: r.id, id: r.id })), s.manyExports.threshold));
  }
  if (s.breakGlass.enabled) {
    const rows = await prisma.breakGlassGrant.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY), lte: now } }, select: { id: true, userId: true } });
    out.push(...overThreshold('accessBreakGlass', rows.map((r) => ({ userId: r.userId, key: r.id, id: r.id })), s.breakGlass.threshold));
  }
  if (s.offHours.enabled) {
    const rows = await prisma.session.findMany({ where: { createdAt: { gte: new Date(now.getTime() - DAY), lte: now }, user: { role: { in: STAFF } } }, select: { id: true, userId: true, createdAt: true } });
    for (const r of rows) {
      const p = bakuParts(r.createdAt);
      if (!outsideHours(p.h, p.wd, s.offHours)) continue;
      out.push({
        rule: 'accessOffHours',
        userId: r.userId,
        count: 1,
        threshold: 0,
        eventIds: [`ses:${r.id}`],
        extra: { hour: String(p.h).padStart(2, '0'), window: `${s.offHours.startHour}-${s.offHours.endHour}` },
      });
    }
  }
  if (s.partnerIps.enabled) {
    const rows = await prisma.session.findMany({ where: { createdAt: { gte: new Date(now.getTime() - DAY), lte: now }, ip: { not: null }, user: { role: 'AGENT' } }, select: { id: true, userId: true, ip: true } });
    // "at least N different IPs" = more than N - 1
    const hits = overThreshold('partnerManyIps', rows.map((r) => ({ userId: r.userId, key: r.ip!, id: `ses:${r.id}` })), s.partnerIps.threshold - 1);
    out.push(...hits.map((d) => ({ ...d, threshold: s.partnerIps.threshold })));
  }
  return out;
};

const SEVERITY: Record<AnomalyRule, Severity> = {
  accessManyRecords: 'HIGH',
  accessManyReveals: 'MEDIUM',
  accessManyExports: 'MEDIUM',
  accessBreakGlass: 'MEDIUM',
  accessOffHours: 'LOW',
  partnerManyIps: 'MEDIUM',
};
const FACT_KEY: Record<AnomalyRule, string> = {
  accessManyRecords: 'records',
  accessManyReveals: 'reveals',
  accessManyExports: 'exports',
  accessBreakGlass: 'grants',
  accessOffHours: 'logins',
  partnerManyIps: 'ips',
};

/** Detected anomaly as a security-alert hit (rule names outside the AI-mgmt rule set; texts in ./texts.ts). */
export const toHit = (d: Detected, account: string | null, role: string | null): Hit => ({
  rule: d.rule as unknown as RuleKey,
  severity: SEVERITY[d.rule],
  subject: `user:${d.userId}`,
  userId: d.userId,
  ip: null,
  facts: { account, role, [FACT_KEY[d.rule]]: d.count, threshold: d.threshold, ...(d.extra ?? {}) },
  events: d.eventIds.map((id) => ({ id })),
});

const notifyAdmins = async (alert: SecurityAlert) => {
  const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true, role: true, locale: true } });
  const f = (alert.facts ?? {}) as Record<string, unknown>;
  for (const a of admins) {
    const t = auditText(a.locale);
    await notifyUser(a.id, {
      type: 'SECURITY_ALERT',
      title: t.anomalyTitles[alert.rule] ?? alert.rule,
      body: t.anomalySummary[alert.rule]?.(f) ?? '',
      link: a.role === 'SUPER_ADMIN' ? `/admin/security-alerts?id=${alert.id}` : '/admin/access?tab=audit',
      push: true,
      email: alert.severity === 'HIGH',
    }).catch(() => undefined);
  }
};

/** Job body: detect, raise (dedupe in the alerts module), notify, prune the record counter. */
export const runAccessAnomalies = async (now = new Date()) => {
  const found = await detectAnomalies(now);
  const security = await getSecuritySettings();
  const ids = [...new Set(found.map((d) => d.userId))];
  const users = new Map(
    (ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, firstName: true, lastName: true, role: true } }) : []).map((u) => [u.id, u]),
  );
  let created = 0;
  for (const d of found) {
    const u = users.get(d.userId);
    const account = u ? `${`${u.firstName} ${u.lastName}`.trim()} <${u.email}>` : null;
    const r = await raiseAlert(toHit(d, account, u?.role ?? null), security, now);
    if (r.kind === 'created') {
      created++;
      await notifyAdmins(r.alert);
    }
  }
  await prisma.staffRecordAccess.deleteMany({ where: { hour: { lt: new Date(now.getTime() - 14 * DAY) } } });
  return { detected: found.length, created };
};

/** Recent access anomaly alerts (Audit tab). */
export const recentAnomalyAlerts = (limit = 50) =>
  prisma.securityAlert.findMany({ where: { rule: { in: [...ANOMALY_RULES] } }, orderBy: { lastSeenAt: 'desc' }, take: limit });
