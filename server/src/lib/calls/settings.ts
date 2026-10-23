import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { open, seal } from '../secretBox.js';
import { badRequest } from '../http.js';
import { normalizePhone } from '../messaging/providers.js';

/**
 * Telephony settings (Setting 'calls'). Credentials are sealed with lib/secretBox (AES-256-GCM) and never
 * leave the server: the admin view only shows whether a secret is set. Recording is OFF by default —
 * Germany (§ 201 StGB) and Azerbaijan require the consent of every party, so a recorded call always plays
 * the announcement first and the UI shows the legal notice.
 */

export const CALLS_SETTING_KEY = 'calls';
export const PROVIDERS = ['none', 'twilio', 'sipgate', 'fake'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

const l10n = z.object({ az: z.string().max(600), de: z.string().max(600), en: z.string().max(600), ru: z.string().max(600) });
export type L10n = z.infer<typeof l10n>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/);
export const officeHoursSchema = z.object({ days: z.array(z.number().int().min(0).max(6)).max(7), from: hhmm, to: hhmm });
export type OfficeHoursSetting = z.infer<typeof officeHoursSchema>;

export const DEFAULT_NOTICE: L10n = {
  az: 'Bu zəng keyfiyyətə nəzarət məqsədilə yazıya alına bilər. Razı deyilsinizsə, xahiş edirik bunu əməkdaşımıza bildirin.',
  de: 'Dieses Gespräch kann zur Qualitätssicherung aufgezeichnet werden. Wenn Sie nicht einverstanden sind, teilen Sie es bitte unserem Mitarbeiter mit.',
  en: 'This call may be recorded for quality purposes. If you do not agree, please tell our colleague.',
  ru: 'Этот разговор может быть записан для контроля качества. Если вы не согласны, пожалуйста, сообщите об этом нашему сотруднику.',
};

interface Stored {
  provider: ProviderName;
  callerId: string;
  recording: boolean;
  recordingNotice: L10n;
  webhookBaseUrl: string;
  inboundForwardTo: string;
  officeHours: OfficeHoursSetting | null;
  twilio: { accountSid: string; authToken: string /* sealed */ };
  sipgate: { tokenId: string; token: string /* sealed */; deviceId: string; webhookToken: string /* sealed */; allowedIps: string[] };
}

/** Decrypted settings for the server side only. */
export interface CallsSettings {
  provider: ProviderName;
  callerId: string;
  recording: boolean;
  recordingNotice: L10n;
  webhookBaseUrl: string;
  inboundForwardTo: string;
  officeHours: OfficeHoursSetting | null;
  twilio: { accountSid: string; authToken: string };
  sipgate: { tokenId: string; token: string; deviceId: string; webhookToken: string; allowedIps: string[] };
}

const defaults = (): Stored => ({
  provider: 'none',
  callerId: '',
  recording: false,
  recordingNotice: DEFAULT_NOTICE,
  webhookBaseUrl: '',
  inboundForwardTo: '',
  officeHours: null,
  twilio: { accountSid: '', authToken: '' },
  sipgate: { tokenId: '', token: '', deviceId: '', webhookToken: '', allowedIps: [] },
});

const readStored = async (): Promise<Stored> => {
  const row = await prisma.setting.findUnique({ where: { key: CALLS_SETTING_KEY } });
  const v = (row?.value ?? {}) as Partial<Stored>;
  const d = defaults();
  return {
    ...d,
    ...v,
    recordingNotice: { ...d.recordingNotice, ...(v.recordingNotice ?? {}) },
    twilio: { ...d.twilio, ...(v.twilio ?? {}) },
    sipgate: { ...d.sipgate, ...(v.sipgate ?? {}) },
    provider: PROVIDERS.includes(v.provider as ProviderName) ? (v.provider as ProviderName) : 'none',
  };
};

export const getCallsSettings = async (): Promise<CallsSettings> => {
  const s = await readStored();
  return {
    ...s,
    // The fake provider exists for tests and local demos only.
    provider: s.provider === 'fake' && config.isProd ? 'none' : s.provider,
    twilio: { accountSid: s.twilio.accountSid, authToken: open(s.twilio.authToken) ?? '' },
    sipgate: { ...s.sipgate, token: open(s.sipgate.token) ?? '', webhookToken: open(s.sipgate.webhookToken) ?? '' },
  };
};

/** Base URL providers call back (public HTTPS origin of the API, e.g. https://triad-vision.az). */
export const webhookBase = (s: Pick<CallsSettings, 'webhookBaseUrl'>) => (s.webhookBaseUrl || process.env.CALLS_WEBHOOK_BASE_URL || config.clientUrl).replace(/\/+$/, '');

/** Provider credentials complete → calls can be placed. */
export const providerReady = (s: CallsSettings) => {
  if (s.provider === 'fake') return true;
  if (s.provider === 'twilio') return !!(s.twilio.accountSid && s.twilio.authToken && normalizePhone(s.callerId));
  if (s.provider === 'sipgate') return !!(s.sipgate.tokenId && s.sipgate.token && s.sipgate.deviceId);
  return false;
};

export const webhookUrls = (s: CallsSettings) => {
  const base = `${webhookBase(s)}/api/calls/webhooks`;
  return {
    twilioVoice: `${base}/twilio/voice`,
    sipgate: `${base}/sipgate?token=${encodeURIComponent(s.sipgate.webhookToken)}`,
  };
};

/** Admin view: no secrets, only whether they are set (+ the URLs to paste into the provider's console). */
export const publicSettings = (s: CallsSettings) => ({
  provider: s.provider,
  ready: providerReady(s),
  callerId: s.callerId,
  recording: s.recording,
  recordingNotice: s.recordingNotice,
  webhookBaseUrl: s.webhookBaseUrl,
  effectiveWebhookBase: webhookBase(s),
  inboundForwardTo: s.inboundForwardTo,
  officeHours: s.officeHours,
  twilio: { accountSid: s.twilio.accountSid, hasAuthToken: !!s.twilio.authToken },
  sipgate: { tokenId: s.sipgate.tokenId, hasToken: !!s.sipgate.token, deviceId: s.sipgate.deviceId, allowedIps: s.sipgate.allowedIps },
  webhooks: webhookUrls(s),
  fakeAllowed: !config.isProd,
});

const phoneOrEmpty = z
  .string()
  .trim()
  .max(40)
  .refine((v) => !v || !!normalizePhone(v), 'INVALID_PHONE')
  .transform((v) => (v ? normalizePhone(v)! : ''));

export const settingsInput = z
  .object({
    provider: z.enum(PROVIDERS),
    callerId: phoneOrEmpty,
    recording: z.boolean(),
    recordingNotice: l10n,
    webhookBaseUrl: z
      .string()
      .trim()
      .max(200)
      .refine((v) => !v || /^https?:\/\/[^\s/]+/i.test(v), 'INVALID_URL'),
    inboundForwardTo: phoneOrEmpty,
    officeHours: officeHoursSchema.nullable(),
    twilio: z.object({ accountSid: z.string().trim().max(64), authToken: z.string().max(200).optional() }).strict(),
    sipgate: z
      .object({
        tokenId: z.string().trim().max(64),
        token: z.string().max(200).optional(),
        deviceId: z.string().trim().max(20),
        allowedIps: z.array(z.string().trim().ip()).max(20).default([]),
        rotateWebhookToken: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

/** Saves; an omitted / empty secret keeps the stored one. The sipgate webhook token is generated once. */
export const saveCallsSettings = async (input: z.infer<typeof settingsInput>) => {
  if (input.provider === 'fake' && config.isProd) throw badRequest('FAKE_PROVIDER_NOT_ALLOWED');
  const cur = await readStored();
  const webhookToken = input.sipgate.rotateWebhookToken || !open(cur.sipgate.webhookToken) ? seal(crypto.randomBytes(24).toString('base64url')) : cur.sipgate.webhookToken;
  const next: Stored = {
    provider: input.provider,
    callerId: input.callerId,
    recording: input.recording,
    recordingNotice: input.recordingNotice,
    webhookBaseUrl: input.webhookBaseUrl.replace(/\/+$/, ''),
    inboundForwardTo: input.inboundForwardTo,
    officeHours: input.officeHours,
    twilio: { accountSid: input.twilio.accountSid, authToken: input.twilio.authToken ? seal(input.twilio.authToken) : cur.twilio.authToken },
    sipgate: {
      tokenId: input.sipgate.tokenId,
      token: input.sipgate.token ? seal(input.sipgate.token) : cur.sipgate.token,
      deviceId: input.sipgate.deviceId,
      webhookToken,
      allowedIps: input.sipgate.allowedIps,
    },
  };
  await prisma.setting.upsert({ where: { key: CALLS_SETTING_KEY }, create: { key: CALLS_SETTING_KEY, value: next as object }, update: { value: next as object } });
  return getCallsSettings();
};
