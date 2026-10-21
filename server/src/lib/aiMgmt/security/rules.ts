import type { Role } from '@prisma/client';
import { prisma } from '../../../db.js';
import { bakuHour } from '../week.js';
import type { RuleKey, SecuritySettings, Severity } from '../settings.js';

/**
 * Suspicious-activity rules — deterministic, no AI. Each rule reads the audit log (or sessions = successful
 * logins) and returns hits. A hit carries the events it is made of (audit / session ids), so the same event never
 * raises two alerts, and a `reaches` test so a pattern that was acknowledged only alerts again when NEW events
 * alone cross the threshold.
 *
 *   failedLoginsAccount  LOGIN_FAILED / LOGIN_2FA_FAILED / LOGIN_EMAIL_OTP_FAILED for one account ≥ threshold in window
 *   failedLoginsIp       the same from one IP (any accounts)
 *   newIpLogin           staff session from an IP prefix (IPv4 /16, IPv6 /48) unused by that account in 30 days
 *   unusualHourLogin     staff session at a Baku hour ±1 h away from every login hour of the last 30 days
 *   bulkDownload         FILE_DOWNLOADED / DRIVE_DOWNLOADED / DRIVE_EXPORTED (files) / CV downloads ≥ threshold, or
 *                        full dataset exports (clients, partners, settlements …) ≥ exportThreshold, per person in window
 *   bulkDelete           drive items trashed / purged ≥ threshold, or USER_DELETED / MAILBOX_DELETED ≥ accountThreshold
 *   twoFactorDisabled    TWO_FACTOR_DISABLED / TWO_FACTOR_RESET / EMAIL_OTP_DISABLED on a staff account
 *   roleEscalation       USER_UPDATED to STAFF/ADMIN, USER_CREATED as staff, or a super admin that was not there before
 *   apiKeyCreated        API_KEY_CREATED
 */

export interface HitEvent {
  id: string;
  /** Weight (files, items …); default 1. */
  w?: number;
  /** Kind for rules with two thresholds. */
  k?: 'file' | 'export' | 'item' | 'account';
}

export interface Hit {
  rule: RuleKey;
  severity: Severity;
  /** Part of the fingerprint after the rule: "user:<id>", "ip:<ip>", "email:<x>" … */
  subject: string;
  userId: string | null;
  ip: string | null;
  facts: Record<string, unknown>;
  events: HitEvent[];
  /** Whether a set of events is enough for an alert on its own (count rules); default: any event. */
  reaches?: (events: HitEvent[]) => boolean;
}

export interface RuleContext {
  now: Date;
  settings: SecuritySettings;
  /** Event rules look at audit rows / sessions since this instant. */
  since: Date;
  /** false in the realtime path: rules that compare with stored state (known super admins) only run in the job. */
  full: boolean;
}

export const STAFF_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export const FAILED_LOGIN_ACTIONS = ['LOGIN_FAILED', 'LOGIN_2FA_FAILED', 'LOGIN_EMAIL_OTP_FAILED'];
export const DOWNLOAD_ACTIONS = ['FILE_DOWNLOADED', 'DRIVE_DOWNLOADED', 'DRIVE_EXPORTED', 'CV_DOWNLOADED_BY_STAFF'];
export const DATASET_EXPORT_ACTIONS = ['CLIENTS_EXPORTED', 'PARTNER_EXPORTED', 'PARTNER_COMMISSIONS_EXPORTED', 'SETTLEMENT_EXPORTED', 'PRIVACY_EXPORT'];
export const DELETE_ITEM_ACTIONS = ['DRIVE_TRASHED', 'DRIVE_BULK_TRASHED', 'DRIVE_PURGED', 'DRIVE_TRASH_EMPTIED'];
export const DELETE_ACCOUNT_ACTIONS = ['USER_DELETED', 'MAILBOX_DELETED'];
export const TWO_FACTOR_ACTIONS = ['TWO_FACTOR_DISABLED', 'TWO_FACTOR_RESET', 'EMAIL_OTP_DISABLED'];
export const ROLE_ACTIONS = ['USER_UPDATED', 'USER_CREATED'];
export const API_KEY_ACTIONS = ['API_KEY_CREATED'];

/** Which rules an audit action can trigger (realtime path). */
export const RULES_FOR_ACTION: Record<string, RuleKey[]> = Object.fromEntries([
  ...FAILED_LOGIN_ACTIONS.map((a) => [a, ['failedLoginsAccount', 'failedLoginsIp']]),
  ...[...DOWNLOAD_ACTIONS, ...DATASET_EXPORT_ACTIONS].map((a) => [a, ['bulkDownload']]),
  ...[...DELETE_ITEM_ACTIONS, ...DELETE_ACCOUNT_ACTIONS].map((a) => [a, ['bulkDelete']]),
  ...TWO_FACTOR_ACTIONS.map((a) => [a, ['twoFactorDisabled']]),
  ...ROLE_ACTIONS.map((a) => [a, ['roleEscalation']]),
  ...API_KEY_ACTIONS.map((a) => [a, ['apiKeyCreated']]),
]);

type Details = Record<string, unknown>;
const det = (v: unknown): Details => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Details) : {});
const num = (v: unknown, d = 1) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
const userIdOf = (target: string | null) => (target?.startsWith('user:') ? target.slice(5) : null);

interface UserLite {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
}
const loadUsers = async (ids: (string | null | undefined)[]) => {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, UserLite>();
  const rows = await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, email: true, role: true, firstName: true, lastName: true } });
  return new Map(rows.map((u) => [u.id, u]));
};
const label = (u: UserLite | undefined) => (u ? `${`${u.firstName} ${u.lastName}`.trim()} <${u.email}>` : null);

/** Network part of an IP address: IPv4 /16, IPv6 /48 (IPv4-mapped IPv6 treated as IPv4). */
export const ipPrefix = (ip: string | null | undefined) => {
  if (!ip) return null;
  const v = ip.trim().replace(/^::ffff:/i, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) return v.split('.').slice(0, 2).join('.');
  if (v.includes(':')) return v.toLowerCase().split(':').slice(0, 3).join(':');
  return v;
};

/** Circular distance of two hours on a 24 h clock. */
const hourGap = (a: number, b: number) => Math.min(Math.abs(a - b), 24 - Math.abs(a - b));

/** Compact list of hours, e.g. [8,9,10,14] → "08–10, 14". */
export const hoursLabel = (hours: number[]) => {
  const hs = [...new Set(hours)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < hs.length; i++) {
    let j = i;
    while (j + 1 < hs.length && hs[j + 1] === hs[j] + 1) j++;
    const p = (h: number) => String(h).padStart(2, '0');
    parts.push(i === j ? p(hs[i]) : `${p(hs[i])}–${p(hs[j])}`);
    i = j;
  }
  return parts.join(', ');
};

// ─── Failed logins ───────────────────────────────────────────────────────

const failedLogins = async (ctx: RuleContext): Promise<Hit[]> => {
  const a = ctx.settings.rules.failedLoginsAccount;
  const b = ctx.settings.rules.failedLoginsIp;
  if (!a.enabled && !b.enabled) return [];
  const window = Math.max(a.enabled ? a.windowMinutes : 0, b.enabled ? b.windowMinutes : 0);
  const rows = await prisma.auditLog.findMany({
    where: { action: { in: FAILED_LOGIN_ACTIONS }, createdAt: { gte: new Date(ctx.now.getTime() - window * MIN), lte: ctx.now } },
    select: { id: true, target: true, details: true, ip: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 20_000,
  });
  const users = await loadUsers(rows.map((r) => userIdOf(r.target)));
  const hits: Hit[] = [];

  if (a.enabled) {
    const since = ctx.now.getTime() - a.windowMinutes * MIN;
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      if (r.createdAt.getTime() < since) continue;
      const uid = userIdOf(r.target);
      const email = String(det(r.details).email ?? '').toLowerCase();
      const key = uid ? `user:${uid}` : email ? `email:${email}` : null;
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    for (const [key, list] of groups) {
      if (list.length < a.threshold) continue;
      const uid = key.startsWith('user:') ? key.slice(5) : null;
      const u = uid ? users.get(uid) : undefined;
      const ips = [...new Set(list.map((r) => r.ip).filter(Boolean))] as string[];
      hits.push({
        rule: 'failedLoginsAccount',
        severity: a.severity,
        subject: key,
        userId: uid,
        ip: ips.length === 1 ? ips[0] : null,
        facts: { attempts: list.length, windowMinutes: a.windowMinutes, ips: ips.length, ip: ips.length === 1 ? ips[0] : null, ipList: ips.slice(0, 5), account: label(u) ?? key.replace(/^email:/, ''), accountExists: !!u, role: u?.role ?? null },
        events: list.map((r) => ({ id: r.id })),
        reaches: (ev) => ev.length >= a.threshold,
      });
    }
  }

  if (b.enabled) {
    const since = ctx.now.getTime() - b.windowMinutes * MIN;
    const groups = new Map<string, typeof rows>();
    for (const r of rows) if (r.ip && r.createdAt.getTime() >= since) groups.set(r.ip, [...(groups.get(r.ip) ?? []), r]);
    for (const [ip, list] of groups) {
      if (list.length < b.threshold) continue;
      const accounts = new Set(list.map((r) => userIdOf(r.target) ?? String(det(r.details).email ?? '').toLowerCase()).filter(Boolean));
      hits.push({
        rule: 'failedLoginsIp',
        severity: b.severity,
        subject: `ip:${ip}`,
        userId: null,
        ip,
        facts: { attempts: list.length, windowMinutes: b.windowMinutes, accounts: accounts.size, ip },
        events: list.map((r) => ({ id: r.id })),
        reaches: (ev) => ev.length >= b.threshold,
      });
    }
  }
  return hits;
};

// ─── Successful staff logins (sessions) ───────────────────────────────────────

const staffLogins = async (ctx: RuleContext): Promise<Hit[]> => {
  const a = ctx.settings.rules.newIpLogin;
  const b = ctx.settings.rules.unusualHourLogin;
  if (!a.enabled && !b.enabled) return [];
  const recent = await prisma.session.findMany({
    where: { createdAt: { gte: ctx.since, lte: ctx.now }, user: { role: { in: STAFF_ROLES } } },
    select: { id: true, userId: true, ip: true, client: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 2000,
  });
  if (!recent.length) return [];
  const userIds = [...new Set(recent.map((s) => s.userId))];
  const history = await prisma.session.findMany({
    where: { userId: { in: userIds }, createdAt: { gte: new Date(ctx.since.getTime() - 30 * DAY), lte: ctx.now } },
    select: { id: true, userId: true, ip: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const users = await loadUsers(userIds);
  const hits: Hit[] = [];
  for (const s of recent) {
    const u = users.get(s.userId);
    const prior = history.filter((h) => h.userId === s.userId && h.id !== s.id && h.createdAt < s.createdAt && h.createdAt.getTime() >= s.createdAt.getTime() - 30 * DAY);
    const base = { account: label(u), role: u?.role ?? null, client: s.client };

    const prefix = ipPrefix(s.ip);
    if (a.enabled && prefix) {
      const withIp = prior.filter((p) => p.ip);
      const known = new Set(withIp.map((p) => ipPrefix(p.ip)));
      if (withIp.length >= a.minPriorLogins && !known.has(prefix))
        hits.push({
          rule: 'newIpLogin',
          severity: a.severity,
          subject: `user:${s.userId}:net:${prefix}`,
          userId: s.userId,
          ip: s.ip,
          facts: { ...base, ip: s.ip, network: prefix, priorLogins: withIp.length, knownNetworks: known.size, at: s.createdAt.toISOString() },
          events: [{ id: `session:${s.id}` }],
        });
    }

    if (b.enabled && prior.length >= b.minLogins) {
      const h = bakuHour(s.createdAt);
      const hours = prior.map((p) => bakuHour(p.createdAt));
      if (hours.every((x) => hourGap(x, h) > 1))
        hits.push({
          rule: 'unusualHourLogin',
          severity: b.severity,
          subject: `user:${s.userId}`,
          userId: s.userId,
          ip: s.ip,
          facts: { ...base, hour: `${String(h).padStart(2, '0')}:${String(new Date(s.createdAt.getTime() + 4 * 3600_000).getUTCMinutes()).padStart(2, '0')}`, usualHours: hoursLabel(hours), priorLogins: prior.length, ip: s.ip, at: s.createdAt.toISOString() },
          events: [{ id: `session:${s.id}` }],
        });
    }
  }
  return hits;
};

// ─── Bulk download / delete ──────────────────────────────────────────────

const perActor = async (actions: string[], windowMinutes: number, now: Date) => {
  const rows = await prisma.auditLog.findMany({
    where: { action: { in: actions }, actorId: { not: null }, createdAt: { gte: new Date(now.getTime() - windowMinutes * MIN), lte: now } },
    select: { id: true, action: true, actorId: true, details: true, ip: true },
    take: 50_000,
  });
  const by = new Map<string, typeof rows>();
  for (const r of rows) by.set(r.actorId!, [...(by.get(r.actorId!) ?? []), r]);
  return by;
};

const bulkDownload = async (ctx: RuleContext): Promise<Hit[]> => {
  const r = ctx.settings.rules.bulkDownload;
  if (!r.enabled) return [];
  const by = await perActor([...DOWNLOAD_ACTIONS, ...DATASET_EXPORT_ACTIONS], r.windowMinutes, ctx.now);
  const users = await loadUsers([...by.keys()]);
  const reaches = (ev: HitEvent[]) => ev.filter((e) => e.k === 'file').reduce((a, e) => a + (e.w ?? 1), 0) >= r.threshold || ev.filter((e) => e.k === 'export').length >= r.exportThreshold;
  const hits: Hit[] = [];
  for (const [actorId, rows] of by) {
    const events: HitEvent[] = rows.map((x) =>
      DATASET_EXPORT_ACTIONS.includes(x.action) ? { id: x.id, k: 'export' } : { id: x.id, k: 'file', w: x.action === 'DRIVE_EXPORTED' ? num(det(x.details).files) : 1 },
    );
    if (!reaches(events)) continue;
    const u = users.get(actorId);
    const files = events.filter((e) => e.k === 'file').reduce((a, e) => a + (e.w ?? 1), 0);
    const ips = [...new Set(rows.map((x) => x.ip).filter(Boolean))] as string[];
    hits.push({
      rule: 'bulkDownload',
      severity: r.severity,
      subject: `user:${actorId}`,
      userId: actorId,
      ip: ips[0] ?? null,
      facts: {
        account: label(u),
        role: u?.role ?? null,
        files,
        downloads: rows.filter((x) => x.action !== 'DRIVE_EXPORTED' && !DATASET_EXPORT_ACTIONS.includes(x.action)).length,
        zipExports: rows.filter((x) => x.action === 'DRIVE_EXPORTED').length,
        datasetExports: events.filter((e) => e.k === 'export').length,
        exportKinds: [...new Set(rows.filter((x) => DATASET_EXPORT_ACTIONS.includes(x.action)).map((x) => x.action))],
        windowMinutes: r.windowMinutes,
      },
      events,
      reaches,
    });
  }
  return hits;
};

const bulkDelete = async (ctx: RuleContext): Promise<Hit[]> => {
  const r = ctx.settings.rules.bulkDelete;
  if (!r.enabled) return [];
  const by = await perActor([...DELETE_ITEM_ACTIONS, ...DELETE_ACCOUNT_ACTIONS], r.windowMinutes, ctx.now);
  const users = await loadUsers([...by.keys()]);
  const reaches = (ev: HitEvent[]) => ev.filter((e) => e.k === 'item').reduce((a, e) => a + (e.w ?? 1), 0) >= r.threshold || ev.filter((e) => e.k === 'account').length >= r.accountThreshold;
  const hits: Hit[] = [];
  for (const [actorId, rows] of by) {
    const events: HitEvent[] = rows.map((x) => {
      if (DELETE_ACCOUNT_ACTIONS.includes(x.action)) return { id: x.id, k: 'account' };
      const d = det(x.details);
      return { id: x.id, k: 'item', w: num(d.nodes, num(d.deleted)) };
    });
    if (!reaches(events)) continue;
    const u = users.get(actorId);
    hits.push({
      rule: 'bulkDelete',
      severity: r.severity,
      subject: `user:${actorId}`,
      userId: actorId,
      ip: rows.find((x) => x.ip)?.ip ?? null,
      facts: {
        account: label(u),
        role: u?.role ?? null,
        items: events.filter((e) => e.k === 'item').reduce((a, e) => a + (e.w ?? 1), 0),
        accounts: events.filter((e) => e.k === 'account').length,
        usersDeleted: rows.filter((x) => x.action === 'USER_DELETED').length,
        mailboxesDeleted: rows.filter((x) => x.action === 'MAILBOX_DELETED').length,
        purged: rows.filter((x) => x.action === 'DRIVE_PURGED' || x.action === 'DRIVE_TRASH_EMPTIED').length,
        windowMinutes: r.windowMinutes,
      },
      events,
      reaches,
    });
  }
  return hits;
};

// ─── Single critical events ───────────────────────────────────────────────

const eventRows = (actions: string[], ctx: RuleContext) =>
  prisma.auditLog.findMany({
    where: { action: { in: actions }, createdAt: { gte: ctx.since, lte: ctx.now } },
    select: { id: true, action: true, actorId: true, target: true, details: true, ip: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 2000,
  });

const twoFactorDisabled = async (ctx: RuleContext): Promise<Hit[]> => {
  const r = ctx.settings.rules.twoFactorDisabled;
  if (!r.enabled) return [];
  const rows = await eventRows(TWO_FACTOR_ACTIONS, ctx);
  const users = await loadUsers(rows.flatMap((x) => [userIdOf(x.target), x.actorId]));
  const hits: Hit[] = [];
  for (const x of rows) {
    const uid = userIdOf(x.target);
    const u = uid ? users.get(uid) : undefined;
    // Only staff accounts: a candidate turning off their own e-mail code is not an incident for the office.
    if (!u || !STAFF_ROLES.includes(u.role)) continue;
    const by = x.actorId && x.actorId !== uid ? users.get(x.actorId) : undefined;
    hits.push({
      rule: 'twoFactorDisabled',
      severity: r.severity,
      subject: `user:${uid}`,
      userId: uid,
      ip: x.ip,
      facts: { action: x.action, account: label(u), role: u.role, by: by ? label(by) : null, byRole: by?.role ?? null, self: !by, at: x.createdAt.toISOString() },
      events: [{ id: x.id }],
    });
  }
  return hits;
};

export const KNOWN_SUPER_ADMINS_KEY = 'security:knownSuperAdmins';

const roleEscalation = async (ctx: RuleContext): Promise<Hit[]> => {
  const r = ctx.settings.rules.roleEscalation;
  if (!r.enabled) return [];
  const rows = await eventRows(ROLE_ACTIONS, ctx);
  // Became (or was created as) staff / admin; demotions and client accounts are not escalations.
  const relevant = rows.filter((x) => (STAFF_ROLES as unknown[]).includes(det(x.details).role));
  const users = await loadUsers(relevant.flatMap((x) => [userIdOf(x.target), x.actorId]));
  const hits: Hit[] = relevant.map((x) => {
    const uid = userIdOf(x.target);
    const u = uid ? users.get(uid) : undefined;
    const by = x.actorId ? users.get(x.actorId) : undefined;
    return {
      rule: 'roleEscalation' as const,
      severity: r.severity,
      subject: `user:${uid ?? x.id}`,
      userId: uid,
      ip: x.ip,
      facts: { action: x.action === 'USER_CREATED' ? 'USER_CREATED' : 'ROLE_CHANGED', newRole: String(det(x.details).role), account: label(u) ?? (det(x.details).email as string | undefined) ?? null, by: label(by), at: x.createdAt.toISOString() },
      events: [{ id: x.id }],
    };
  });

  // A super admin that was not there at the previous scan (the API cannot create one: this means a DB change).
  if (ctx.full) {
    const current = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN' }, select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true } });
    const row = await prisma.setting.findUnique({ where: { key: KNOWN_SUPER_ADMINS_KEY } });
    const known = Array.isArray((row?.value as { ids?: unknown } | null)?.ids) ? ((row!.value as { ids: string[] }).ids as string[]) : null;
    if (known) {
      for (const u of current.filter((c) => !known.includes(c.id)))
        hits.push({
          rule: 'roleEscalation',
          severity: r.severity,
          subject: `user:${u.id}`,
          userId: u.id,
          ip: null,
          facts: { action: 'NEW_SUPER_ADMIN', newRole: 'SUPER_ADMIN', account: label(u), by: null, createdAt: u.createdAt.toISOString() },
          events: [{ id: `superadmin:${u.id}` }],
        });
    }
    const ids = current.map((c) => c.id).sort();
    if (!known || ids.join() !== [...known].sort().join()) await prisma.setting.upsert({ where: { key: KNOWN_SUPER_ADMINS_KEY }, create: { key: KNOWN_SUPER_ADMINS_KEY, value: { ids } }, update: { value: { ids } } });
  }
  return hits;
};

const apiKeyCreated = async (ctx: RuleContext): Promise<Hit[]> => {
  const r = ctx.settings.rules.apiKeyCreated;
  if (!r.enabled) return [];
  const rows = await eventRows(API_KEY_ACTIONS, ctx);
  const users = await loadUsers(rows.map((x) => x.actorId));
  const by = new Map<string, typeof rows>();
  for (const x of rows) by.set(x.actorId ?? '-', [...(by.get(x.actorId ?? '-') ?? []), x]);
  return [...by.entries()].map(([actorId, list]) => {
    const last = det(list.at(-1)!.details);
    const u = users.get(actorId);
    return {
      rule: 'apiKeyCreated' as const,
      severity: r.severity,
      subject: `user:${actorId}`,
      userId: actorId === '-' ? null : actorId,
      ip: list.at(-1)!.ip,
      facts: { account: label(u), role: u?.role ?? null, keyName: String(last.name ?? ''), scopes: Array.isArray(last.scopes) ? last.scopes : [], forCompany: !!last.companyId, keys: list.length },
      events: list.map((x) => ({ id: x.id })),
    };
  });
};

const RULES: Record<string, (ctx: RuleContext) => Promise<Hit[]>> = {
  failedLogins,
  staffLogins,
  bulkDownload,
  bulkDelete,
  twoFactorDisabled,
  roleEscalation,
  apiKeyCreated,
};
const GROUP_OF: Record<RuleKey, keyof typeof RULES> = {
  failedLoginsAccount: 'failedLogins',
  failedLoginsIp: 'failedLogins',
  newIpLogin: 'staffLogins',
  unusualHourLogin: 'staffLogins',
  bulkDownload: 'bulkDownload',
  bulkDelete: 'bulkDelete',
  twoFactorDisabled: 'twoFactorDisabled',
  roleEscalation: 'roleEscalation',
  apiKeyCreated: 'apiKeyCreated',
};

/** Runs the given rules (default: all) and returns their hits. */
export const evaluateRules = async (ctx: RuleContext, only?: RuleKey[]) => {
  const groups = only ? [...new Set(only.map((k) => GROUP_OF[k]))] : (Object.keys(RULES) as (keyof typeof RULES)[]);
  const out: Hit[] = [];
  for (const g of groups) out.push(...(await RULES[g](ctx)));
  return only ? out.filter((h) => only.includes(h.rule)) : out;
};
