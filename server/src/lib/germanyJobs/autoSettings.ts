import { z } from 'zod';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { brandSync } from '../brand/index.js';
import { bakuMidnight, bakuParts } from '../reports/dates.js';

/**
 * Settings of the automatic sending of "apply via Triad Vision" applications (Setting "externalAutoSend").
 *
 * RETIRED (owner decision): for external listings Triad Vision does nothing any more — the candidate applies to the
 * employer directly with their own CV. No employer e-mail discovery, no automatic sending, no client-send reminders,
 * no processing of earlier applications (they stay as history). `enabled` and `discovery` are therefore always false,
 * whatever an older stored value says; the limits stay only for reading.
 */
export const EXTERNAL_APPLY_RETIRED = true;

export const AUTO_SEND_KEY = 'externalAutoSend';

export const autoSendSettingsSchema = z
  .object({
    enabled: z.boolean(),
    dailyLimit: z.number().int().min(0).max(500),
    perDomainLimit: z.number().int().min(1).max(50),
    /** Reply-To of the employer e-mails (agency inbox); empty = brand support address / ADMIN_NOTIFY_EMAIL. */
    replyTo: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(190)]),
    /** Employer e-mail discovery: look for the address on the employer / listing page (lib/germanyJobs/discovery). */
    discovery: z.boolean(),
  })
  .strict();
export type AutoSendSettings = z.infer<typeof autoSendSettingsSchema>;

export const DEFAULT_AUTO_SEND: AutoSendSettings = { enabled: false, dailyLimit: 30, perDomainLimit: 3, replyTo: '', discovery: false };

export const getAutoSendSettings = async (): Promise<AutoSendSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: AUTO_SEND_KEY } });
  const stored = autoSendSettingsSchema.partial().safeParse(row?.value ?? {});
  const merged = { ...DEFAULT_AUTO_SEND, ...(stored.success ? stored.data : {}) };
  return EXTERNAL_APPLY_RETIRED ? { ...merged, enabled: false, discovery: false } : merged;
};

export const setAutoSendSettings = async (patch: Partial<AutoSendSettings>): Promise<AutoSendSettings> => {
  const next = { ...(await getAutoSendSettings()), ...patch, ...(EXTERNAL_APPLY_RETIRED ? { enabled: false, discovery: false } : {}) };
  await prisma.setting.upsert({ where: { key: AUTO_SEND_KEY }, create: { key: AUTO_SEND_KEY, value: next }, update: { value: next } });
  return next;
};

/** Where employers' answers go: the setting, else the brand support address, else the admin notification address. */
export const replyToAddress = (s: AutoSendSettings) => s.replyTo || brandSync().supportEmail || config.adminNotifyEmail || '';

/** Limits count per Baku calendar day. */
export const dayStart = (now = new Date()) => {
  const p = bakuParts(now);
  return bakuMidnight(p.y, p.m, p.d);
};
export const nextDayStart = (now = new Date()) => {
  const p = bakuParts(now);
  return bakuMidnight(p.y, p.m, p.d + 1);
};

/** Pure limit decision (unit-tested): null = may send now. */
export const limitReason = (s: Pick<AutoSendSettings, 'dailyLimit' | 'perDomainLimit'>, sentToday: number, sentTodayToDomain: number): 'DAILY_LIMIT' | 'DOMAIN_LIMIT' | null => {
  if (sentToday >= s.dailyLimit) return 'DAILY_LIMIT';
  if (sentTodayToDomain >= s.perDomainLimit) return 'DOMAIN_LIMIT';
  return null;
};
