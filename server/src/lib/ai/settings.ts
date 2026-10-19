import { z } from 'zod';
import type { AiScope } from '@prisma/client';
import { prisma } from '../../db.js';
import { open, seal } from '../secretBox.js';

/**
 * Assistant settings, one Setting row (`ai.assistant`), edited by the super admin on /admin/ai/settings.
 * The stored value is re-validated on every read: an invalid or tampered row (the generic admin
 * settings route can write any key) falls back to the defaults field by field.
 */
export const SETTING_KEY = 'ai.assistant';

export const DEFAULT_MODELS: Record<AiScope, string> = {
  CLIENT: 'anthropic/claude-haiku-5.5',
  ADMIN: 'anthropic/claude-sonnet-5.5',
};

const modelId = z.string().regex(/^[a-z0-9-]+\/[a-z0-9._:-]+$/i).max(120);
const money = (max: number) => z.coerce.number().min(0).max(max);

export const aiSettingsSchema = z.object({
  clientEnabled: z.boolean().catch(true),
  models: z
    .object({ CLIENT: modelId.catch(DEFAULT_MODELS.CLIENT), ADMIN: modelId.catch(DEFAULT_MODELS.ADMIN) })
    .catch({ ...DEFAULT_MODELS }),
  /** Whole-installation spend per calendar month (UTC), kept below the key's own limit. */
  monthlyBudgetUsd: money(10_000).catch(4),
  clientDailyMessages: z.coerce.number().int().min(0).max(1000).catch(20),
  clientDailyCostUsd: money(100).catch(0.05),
  adminDailyCostUsd: money(1000).catch(1),
  maxOutputTokens: z
    .object({ CLIENT: z.coerce.number().int().min(50).max(4000).catch(600), ADMIN: z.coerce.number().int().min(50).max(8000).catch(1500) })
    .catch({ CLIENT: 600, ADMIN: 1500 }),
  /** Public site advisor + eligibility explanations for anonymous visitors (no login). */
  publicAdvisorEnabled: z.boolean().catch(true),
  /** Spend cap per UTC day for all anonymous (public) AI use together. */
  publicDailyUsd: money(100).catch(0.5),
  /** Automatic AI check of documents clients upload (lib/aiDocs/docCheck.ts). */
  docCheckEnabled: z.boolean().catch(true),
  /** Optional OpenRouter key entered in the UI (sealed with secretBox); the env key is used otherwise. */
  apiKeySealed: z.string().max(2000).nullable().catch(null),
});

export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const DEFAULT_SETTINGS: AiSettings = aiSettingsSchema.parse({});

let cache: { value: AiSettings; at: number } | null = null;
const TTL_MS = 30_000;

export const getAiSettings = async (): Promise<AiSettings> => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  const raw = row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {};
  const value = aiSettingsSchema.parse(raw);
  cache = { value, at: Date.now() };
  return value;
};

export const clearAiSettingsCache = () => {
  cache = null;
};

/** Body of PUT /api/ai/settings: every field optional; `apiKey: ""` removes a stored key. */
export const aiSettingsUpdateSchema = z
  .object({
    clientEnabled: z.boolean(),
    models: z.object({ CLIENT: modelId, ADMIN: modelId }).partial(),
    monthlyBudgetUsd: z.number().min(0).max(10_000),
    clientDailyMessages: z.number().int().min(0).max(1000),
    clientDailyCostUsd: z.number().min(0).max(100),
    adminDailyCostUsd: z.number().min(0).max(1000),
    maxOutputTokens: z.object({ CLIENT: z.number().int().min(50).max(4000), ADMIN: z.number().int().min(50).max(8000) }).partial(),
    publicAdvisorEnabled: z.boolean(),
    publicDailyUsd: z.number().min(0).max(100),
    docCheckEnabled: z.boolean(),
    apiKey: z.string().max(400),
  })
  .partial()
  .strict();

export const saveAiSettings = async (patch: z.infer<typeof aiSettingsUpdateSchema>) => {
  const current = await getAiSettings();
  const { apiKey, models, maxOutputTokens, ...rest } = patch;
  const next: AiSettings = {
    ...current,
    ...rest,
    models: { ...current.models, ...(models ?? {}) },
    maxOutputTokens: { ...current.maxOutputTokens, ...(maxOutputTokens ?? {}) },
    apiKeySealed: apiKey === undefined ? current.apiKeySealed : apiKey.trim() ? seal(apiKey.trim()) : null,
  };
  await prisma.setting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: next }, update: { value: next } });
  cache = { value: next, at: Date.now() };
  return next;
};

/** The OpenRouter key: the one stored in settings when present, else OPENROUTER_API_KEY. Never sent to a client. */
export const resolveApiKey = (s: AiSettings) => open(s.apiKeySealed) || process.env.OPENROUTER_API_KEY || '';

/** Settings as shown to the super admin (the key itself never leaves the server). */
export const publicSettings = (s: AiSettings) => {
  const { apiKeySealed, ...rest } = s;
  const custom = !!open(apiKeySealed);
  return { ...rest, keySource: custom ? 'settings' : process.env.OPENROUTER_API_KEY ? 'env' : 'none' } as const;
};
