import type { CaseStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { TYPICAL_DAYS } from '../caseNext/nextStep.js';

/**
 * Typical durations ("ETA") of the statuses in which the team or the embassy holds the ball. Stored in
 * Setting 'clientProcess' and editable by admins; defaults follow the case-manager experience values of
 * lib/caseNext (TYPICAL_DAYS). DECISION_PENDING prefers the visa category's processing time (weeks) when set.
 */

export const SETTING_KEY = 'clientProcess';

export const ETA_STATUSES = ['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED', 'EMBASSY_REVIEW', 'APPOINTMENT_SCHEDULED', 'DECISION_PENDING'] as const satisfies readonly CaseStatus[];
export type EtaStatus = (typeof ETA_STATUSES)[number];

export interface Eta {
  minHours: number;
  maxHours: number;
}

const H = 24;
export const DEFAULT_ETA: Record<EtaStatus, Eta> = {
  DOCUMENTS_REVIEW: { minHours: 24, maxHours: TYPICAL_DAYS.DOCUMENTS_REVIEW * H },
  CONTRACT_SIGNED: { minHours: 24, maxHours: TYPICAL_DAYS.CONTRACT_SIGNED * H },
  EMBASSY_REVIEW: { minHours: 24, maxHours: TYPICAL_DAYS.EMBASSY_REVIEW * H },
  // After the embassy appointment: the team lodges the application.
  APPOINTMENT_SCHEDULED: { minHours: 24, maxHours: 2 * H },
  // "usually 4–8 weeks" (TYPICAL_DAYS.DECISION_PENDING = 56 days)
  DECISION_PENDING: { minHours: 4 * 7 * H, maxHours: TYPICAL_DAYS.DECISION_PENDING * H },
};

const etaSchema = z
  .object({ minHours: z.number().int().min(1).max(24 * 365), maxHours: z.number().int().min(1).max(24 * 365) })
  .refine((e) => e.maxHours >= e.minHours, 'MAX_BELOW_MIN');

export const settingsSchema = z.object({
  eta: z.object(Object.fromEntries(ETA_STATUSES.map((s) => [s, etaSchema.optional()])) as Record<EtaStatus, z.ZodOptional<typeof etaSchema>>).partial(),
  /** DECISION_PENDING: use the visa category's processing weeks when the category has them. */
  useCategoryProcessing: z.boolean().optional(),
});

export interface ClientProcessSettings {
  eta: Record<EtaStatus, Eta>;
  useCategoryProcessing: boolean;
}

export const getClientProcessSettings = async (): Promise<ClientProcessSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  const parsed = settingsSchema.safeParse(row?.value ?? {});
  const v = parsed.success ? parsed.data : { eta: {} };
  return {
    eta: Object.fromEntries(ETA_STATUSES.map((s) => [s, v.eta?.[s] ?? DEFAULT_ETA[s]])) as Record<EtaStatus, Eta>,
    useCategoryProcessing: v.useCategoryProcessing ?? true,
  };
};

export const saveClientProcessSettings = async (input: z.infer<typeof settingsSchema>) => {
  const value = { eta: input.eta, useCategoryProcessing: input.useCategoryProcessing ?? true } as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value }, update: { value } });
  return getClientProcessSettings();
};
