import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest } from '../http.js';

/**
 * Owner-controlled settings of the Trust Center and the AVV template (Setting rows, no migration):
 *
 *   trustCenter  facts the repository cannot verify (data centre location, security contact), entered and
 *                confirmed by the owner in Admin › Trust & AVV; the public page shows them only when set.
 *   avvTemplate  "AVV template approved" — OFF by default. Companies see the AVV only while it is on and the
 *                approval belongs to the current template version (a new template text needs a new approval).
 */

export const TRUST_KEY = 'trustCenter';
export const AVV_KEY = 'avvTemplate';
/** Bump when the AVV text in lib/avv/template.ts changes: the approval must then be given again. */
export const AVV_TEMPLATE_VERSION = 'AVV-2026-11-v1';

const text = (max: number) => z.string().trim().max(max).default('');

export const trustSettingsSchema = z.object({
  /** e.g. "Frankfurt am Main, Deutschland (Akamai/Linode eu-central)" — shown only when set. */
  dataLocation: text(200),
  /** The owner confirmed the location against the hosting contract / control panel. */
  dataLocationConfirmed: z.boolean().default(false),
  /** Where the encrypted backups are kept (e.g. "gleicher Server + Off-site-Kopie in …"); optional. */
  backupLocation: text(200),
  /** Responsible disclosure contact (falls back to the brand support e-mail). */
  securityEmail: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(200)]).default(''),
  /** Free note shown under the measures (e.g. certifications of the hosting provider, with source). */
  note: text(1000),
});
export type TrustSettings = z.infer<typeof trustSettingsSchema>;

export const avvSettingsSchema = z.object({
  approved: z.boolean().default(false),
  approvedVersion: z.string().max(40).nullable().default(null),
  approvedAt: z.string().max(40).nullable().default(null),
  approvedById: z.string().max(40).nullable().default(null),
});
export type AvvSettings = z.infer<typeof avvSettingsSchema>;

const rawSetting = async (key: string) => (await prisma.setting.findUnique({ where: { key } }))?.value ?? {};

export const getTrustSettings = async (): Promise<TrustSettings> => {
  const parsed = trustSettingsSchema.safeParse(await rawSetting(TRUST_KEY));
  return parsed.success ? parsed.data : trustSettingsSchema.parse({});
};
export const getAvvSettings = async (): Promise<AvvSettings> => {
  const parsed = avvSettingsSchema.safeParse(await rawSetting(AVV_KEY));
  return parsed.success ? parsed.data : avvSettingsSchema.parse({});
};

/** The AVV is visible to companies: approved by the owner for exactly this template version. */
export const avvApproved = (s: AvvSettings) => s.approved && s.approvedVersion === AVV_TEMPLATE_VERSION;
export const isAvvAvailable = async () => avvApproved(await getAvvSettings());

export const saveTrustSettings = async (input: unknown) => {
  const parsed = trustSettingsSchema.safeParse(input);
  if (!parsed.success) throw badRequest('VALIDATION_ERROR');
  const value = parsed.data;
  await prisma.setting.upsert({ where: { key: TRUST_KEY }, create: { key: TRUST_KEY, value }, update: { value } });
  return value;
};

/** Turns the approval on (for the current template version) or off. */
export const setAvvApproved = async (approved: boolean, userId: string) => {
  const value: AvvSettings = approved
    ? { approved: true, approvedVersion: AVV_TEMPLATE_VERSION, approvedAt: new Date().toISOString(), approvedById: userId }
    : { approved: false, approvedVersion: null, approvedAt: null, approvedById: null };
  await prisma.setting.upsert({ where: { key: AVV_KEY }, create: { key: AVV_KEY, value }, update: { value } });
  return value;
};
