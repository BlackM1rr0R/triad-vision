import { z, type ZodTypeAny } from 'zod';
import { prisma } from '../db.js';

/**
 * Settings owned by the legal & security stream (stored in the Setting table, edited in
 * Admin → Settings through PUT /api/admin/settings/:key, read publicly via /api/public/content).
 */

const text = (max: number) => z.string().trim().max(max).default('');

/** Impressum data (§ 5 DDG, § 18 Abs. 2 MStV). Empty fields are shown as placeholders on the site. */
export const legalSchema = z.object({
  companyName: text(200),
  legalForm: text(100),
  street: text(200),
  postalCode: text(20),
  city: text(100),
  country: text(100),
  representative: text(300),
  registerCourt: text(200),
  registerNumber: text(100),
  vatId: text(50),
  email: z.union([z.literal(''), z.string().trim().email().max(200)]).default(''),
  phone: text(50),
  responsibleForContent: text(400),
  supervisoryNote: text(2000),
});

const l10nText = z.object({ az: text(100_000), de: text(100_000), en: text(100_000), ru: text(100_000) });

/** Optional replacement for the generated privacy policy. Empty German text = use the template. */
export const privacySchema = z.object({
  text: l10nText.default({ az: '', de: '', en: '', ru: '' }),
  /** Competent data protection authority (filled into the generated policy). */
  supervisoryAuthority: text(500),
  /** Data protection officer, if one is appointed (name and contact). */
  dpo: text(1000),
  /** Shown as "Stand: …" (YYYY-MM-DD). */
  effectiveDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(''),
});

export const RETENTION_DEFAULTS = { months: 12, includeMessages: false };

export const retentionSchema = z.object({
  months: z.number().int().min(1).max(120),
  includeMessages: z.boolean().default(false),
});

export const LEGAL_SETTING_SCHEMAS: Record<string, ZodTypeAny> = {
  legal: legalSchema,
  privacy: privacySchema,
  retention: retentionSchema,
};

export type RetentionSettings = z.infer<typeof retentionSchema>;

/** Current retention settings; falls back to the defaults when unset or malformed. */
export const getRetentionSettings = async (): Promise<RetentionSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: 'retention' } });
  const parsed = retentionSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : { ...RETENTION_DEFAULTS };
};
