import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

/**
 * Settings of the management features (one Setting row each, edited by the super admin with toggles and number
 * inputs — never free text). Re-validated on every read: a missing or tampered field falls back to its default.
 */

// ─── Weekly report ─────────────────────────────────────────────────────

export const REPORT_SETTING_KEY = 'mgmt.weeklyReport';

export const reportSettingsSchema = z.object({
  /** Monday 08:00 (Baku) e-mail to the super admins. */
  enabled: z.boolean().catch(true),
  /** Also send it to ADMIN users (without the per-staff section). */
  includeAdmins: z.boolean().catch(false),
  /** An open case counts as stuck after this many days without any update. */
  stuckDays: z.coerce.number().int().min(3).max(90).catch(14),
});
export type ReportSettings = z.infer<typeof reportSettingsSchema>;

export const reportSettingsUpdate = z.object({ enabled: z.boolean(), includeAdmins: z.boolean(), stuckDays: z.number().int().min(3).max(90) }).partial().strict();

// ─── Security alert rules ──────────────────────────────────────────────

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type Severity = (typeof SEVERITIES)[number];
const severity = (d: Severity) => z.enum(SEVERITIES).catch(d);
const int = (min: number, max: number, d: number) => z.coerce.number().int().min(min).max(max).catch(d);
const on = (d = true) => z.boolean().catch(d);

export const RULE_KEYS = [
  'failedLoginsAccount',
  'failedLoginsIp',
  'newIpLogin',
  'unusualHourLogin',
  'bulkDownload',
  'bulkDelete',
  'twoFactorDisabled',
  'roleEscalation',
  'apiKeyCreated',
] as const;
export type RuleKey = (typeof RULE_KEYS)[number];

const rulesSchema = z.object({
  /** Failed password / 2FA attempts for one account within the window. */
  failedLoginsAccount: z.object({ enabled: on(), severity: severity('MEDIUM'), threshold: int(2, 1000, 5), windowMinutes: int(1, 1440, 15) }).catch({ enabled: true, severity: 'MEDIUM', threshold: 5, windowMinutes: 15 }),
  /** Failed attempts from one IP address (any accounts) within the window. */
  failedLoginsIp: z.object({ enabled: on(), severity: severity('HIGH'), threshold: int(2, 1000, 10), windowMinutes: int(1, 1440, 15) }).catch({ enabled: true, severity: 'HIGH', threshold: 10, windowMinutes: 15 }),
  /** A staff login from a network (IP prefix) not used by that account in the previous 30 days. */
  newIpLogin: z.object({ enabled: on(), severity: severity('MEDIUM'), minPriorLogins: int(1, 100, 3) }).catch({ enabled: true, severity: 'MEDIUM', minPriorLogins: 3 }),
  /** A staff login at an hour (Baku) outside the account's usual hours of the last 30 days. */
  unusualHourLogin: z.object({ enabled: on(), severity: severity('LOW'), minLogins: int(3, 500, 10) }).catch({ enabled: true, severity: 'LOW', minLogins: 10 }),
  /** Many file downloads / exported files, or several full data exports, by one person within the window. */
  bulkDownload: z.object({ enabled: on(), severity: severity('HIGH'), threshold: int(5, 10_000, 50), exportThreshold: int(1, 100, 3), windowMinutes: int(5, 1440, 30) }).catch({ enabled: true, severity: 'HIGH', threshold: 50, exportThreshold: 3, windowMinutes: 30 }),
  /** Many deleted items (drive), or several deleted accounts / mailboxes, by one person within the window. */
  bulkDelete: z.object({ enabled: on(), severity: severity('HIGH'), threshold: int(5, 10_000, 50), accountThreshold: int(1, 100, 3), windowMinutes: int(5, 1440, 60) }).catch({ enabled: true, severity: 'HIGH', threshold: 50, accountThreshold: 3, windowMinutes: 60 }),
  /** Two-factor protection removed (disabled by the user or reset by the super admin) on a staff account. */
  twoFactorDisabled: z.object({ enabled: on(), severity: severity('HIGH') }).catch({ enabled: true, severity: 'HIGH' }),
  /** Someone became staff / admin, or a new super admin appeared. */
  roleEscalation: z.object({ enabled: on(), severity: severity('HIGH') }).catch({ enabled: true, severity: 'HIGH' }),
  /** A new API key was created. */
  apiKeyCreated: z.object({ enabled: on(), severity: severity('MEDIUM') }).catch({ enabled: true, severity: 'MEDIUM' }),
});

export const SECURITY_SETTING_KEY = 'security.alertRules';

export const securitySettingsSchema = z.object({
  /** One cheap AI call per new alert writes a plain-language explanation from the alert's facts. */
  aiExplain: on(),
  /** E-mail the super admins for HIGH alerts (in-app + push always). */
  emailHigh: on(),
  /** New hits of the same pattern within this many hours are merged into the open alert. */
  dedupeHours: int(1, 168, 6),
  rules: rulesSchema.catch(() => rulesSchema.parse({})),
});
export type SecuritySettings = z.infer<typeof securitySettingsSchema>;

const ruleUpdate = z
  .object({
    enabled: z.boolean(),
    severity: z.enum(SEVERITIES),
    threshold: z.number().int().min(1).max(10_000),
    windowMinutes: z.number().int().min(1).max(1440),
    minPriorLogins: z.number().int().min(1).max(100),
    minLogins: z.number().int().min(3).max(500),
    exportThreshold: z.number().int().min(1).max(100),
    accountThreshold: z.number().int().min(1).max(100),
  })
  .partial()
  .strict();

export const securitySettingsUpdate = z
  .object({
    aiExplain: z.boolean(),
    emailHigh: z.boolean(),
    dedupeHours: z.number().int().min(1).max(168),
    rules: z.object(Object.fromEntries(RULE_KEYS.map((k) => [k, ruleUpdate])) as Record<RuleKey, typeof ruleUpdate>).partial().strict(),
  })
  .partial()
  .strict();

// ─── Storage ───────────────────────────────────────────────────────────

const read = async (key: string) => {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? (row.value as Record<string, unknown>) : {};
};
const write = async (key: string, value: unknown) => {
  const v = value as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
};

export const getReportSettings = async () => reportSettingsSchema.parse(await read(REPORT_SETTING_KEY));
export const saveReportSettings = async (patch: z.infer<typeof reportSettingsUpdate>) => {
  const next = reportSettingsSchema.parse({ ...(await getReportSettings()), ...patch });
  await write(REPORT_SETTING_KEY, next);
  return next;
};

export const getSecuritySettings = async () => securitySettingsSchema.parse(await read(SECURITY_SETTING_KEY));
export const saveSecuritySettings = async (patch: z.infer<typeof securitySettingsUpdate>) => {
  const current = await getSecuritySettings();
  const rules = { ...current.rules } as Record<RuleKey, Record<string, unknown>>;
  for (const [k, v] of Object.entries(patch.rules ?? {})) rules[k as RuleKey] = { ...rules[k as RuleKey], ...v };
  const { rules: _ignored, ...rest } = patch;
  // Unknown keys of a rule (e.g. a threshold on a rule without one) are dropped by the schema.
  const next = securitySettingsSchema.parse({ ...current, ...rest, rules });
  await write(SECURITY_SETTING_KEY, next);
  return next;
};
