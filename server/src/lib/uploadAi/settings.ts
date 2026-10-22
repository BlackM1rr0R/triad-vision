import { z } from 'zod';
import { prisma } from '../../db.js';

/**
 * Smart-upload settings (one Setting row `uploadAi`, edited by the super admin with switches only).
 * Default: recognise and propose; nothing is applied automatically.
 */
export const UPLOAD_AI_SETTING_KEY = 'uploadAi';

export const uploadAiSettingsSchema = z.object({
  /** Recognition after uploads (deterministic steps always; AI only when they are not enough). */
  enabled: z.boolean().catch(true),
  /** May the recogniser call the AI (cheap model) when the deterministic steps are not enough? */
  aiEnabled: z.boolean().catch(true),
  /** Scan quality check of uploads (instant feedback for clients). */
  qualityEnabled: z.boolean().catch(true),
  autoApply: z
    .object({
      enabled: z.boolean().catch(false),
      /** Minimum confidence (0.5–1) of a recognition before anything is applied on its own. */
      threshold: z.coerce.number().min(0.5).max(1).catch(0.9),
      rename: z.boolean().catch(true),
      link: z.boolean().catch(true),
      move: z.boolean().catch(true),
      expiry: z.boolean().catch(true),
    })
    .catch({ enabled: false, threshold: 0.9, rename: true, link: true, move: true, expiry: true }),
});
export type UploadAiSettings = z.infer<typeof uploadAiSettingsSchema>;
export const DEFAULT_UPLOAD_AI_SETTINGS: UploadAiSettings = uploadAiSettingsSchema.parse({});

export const uploadAiSettingsUpdate = z
  .object({
    enabled: z.boolean(),
    aiEnabled: z.boolean(),
    qualityEnabled: z.boolean(),
    autoApply: z
      .object({ enabled: z.boolean(), threshold: z.number().min(0.5).max(1), rename: z.boolean(), link: z.boolean(), move: z.boolean(), expiry: z.boolean() })
      .partial()
      .strict(),
  })
  .partial()
  .strict();

let cache: { value: UploadAiSettings; at: number } | null = null;
const TTL_MS = 30_000;

export const getUploadAiSettings = async (): Promise<UploadAiSettings> => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const row = await prisma.setting.findUnique({ where: { key: UPLOAD_AI_SETTING_KEY } }).catch(() => null);
  const raw = row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {};
  const value = uploadAiSettingsSchema.parse(raw);
  cache = { value, at: Date.now() };
  return value;
};

export const clearUploadAiSettingsCache = () => {
  cache = null;
};

export const saveUploadAiSettings = async (patch: z.infer<typeof uploadAiSettingsUpdate>) => {
  const current = await getUploadAiSettings();
  const next: UploadAiSettings = { ...current, ...patch, autoApply: { ...current.autoApply, ...(patch.autoApply ?? {}) } };
  await prisma.setting.upsert({ where: { key: UPLOAD_AI_SETTING_KEY }, create: { key: UPLOAD_AI_SETTING_KEY, value: next }, update: { value: next } });
  cache = { value: next, at: Date.now() };
  return next;
};
