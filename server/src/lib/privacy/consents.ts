import type { Request } from 'express';
import { prisma } from '../../db.js';

/** Version label of the privacy policy / terms texts currently shown (bump when the text changes). */
export const POLICY_VERSION = '2026-10';

export const CONSENT_TYPES = ['PRIVACY_POLICY', 'TERMS', 'MARKETING_EMAIL', 'WHATSAPP', 'SMS', 'EMPLOYER_SHARING', 'PASSPORT_OCR'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

/**
 * Appends one row to the consent log (never updates or deletes: the log is the proof). Never throws:
 * a logging problem must not block the action the user is taking.
 */
export const recordConsent = async (input: {
  userId?: string | null;
  email?: string | null;
  type: ConsentType;
  granted: boolean;
  source: string;
  version?: string;
  req?: Pick<Request, 'ip' | 'get'>;
}) => {
  try {
    await prisma.consentRecord.create({
      data: {
        userId: input.userId ?? null,
        email: input.email?.toLowerCase() ?? null,
        type: input.type,
        granted: input.granted,
        version: input.version ?? POLICY_VERSION,
        source: input.source.slice(0, 40),
        ip: input.req?.ip?.slice(0, 64) ?? null,
        userAgent: input.req?.get('user-agent')?.slice(0, 400) ?? null,
      },
    });
  } catch (err) {
    console.error('[consent] record failed', input.type, err);
  }
};

/** Latest state per consent type for a user ({ MARKETING_EMAIL: { granted, at, version }, ... }). */
export const currentConsents = async (userId: string) => {
  const rows = await prisma.consentRecord.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  const out: Record<string, { granted: boolean; at: Date; version: string; source: string }> = {};
  for (const r of rows) if (!out[r.type]) out[r.type] = { granted: r.granted, at: r.createdAt, version: r.version, source: r.source };
  return out;
};

/** Consents the user can switch in the privacy centre (the others are given once, at sign-up or upload). */
export const TOGGLE_TYPES = ['MARKETING_EMAIL', 'WHATSAPP', 'SMS', 'EMPLOYER_SHARING'] as const satisfies readonly ConsentType[];
export type ToggleType = (typeof TOGGLE_TYPES)[number];

export interface EffectiveConsent {
  granted: boolean | null;
  at: Date | null;
  version: string | null;
  source: string | null;
}

/**
 * State per consent type as the user sees it. WHATSAPP and SMS follow the user's settings fields
 * (whatsappOptIn / smsNotifications are what the senders read), the log supplies the date of the
 * last change. MARKETING_EMAIL and EMPLOYER_SHARING exist only in the log and default to "no".
 * `granted: null` = never asked (PRIVACY_POLICY before the log existed, PASSPORT_OCR never used).
 */
export const effectiveConsents = async (user: { id: string; whatsappOptIn: boolean; smsNotifications: boolean }) => {
  const log = await currentConsents(user.id);
  const out = {} as Record<ConsentType, EffectiveConsent>;
  for (const type of CONSENT_TYPES) {
    const row = log[type];
    out[type] = { granted: row?.granted ?? null, at: row?.at ?? null, version: row?.version ?? null, source: row?.source ?? null };
  }
  out.WHATSAPP.granted = user.whatsappOptIn;
  out.SMS.granted = user.smsNotifications;
  out.MARKETING_EMAIL.granted ??= false;
  out.EMPLOYER_SHARING.granted ??= false;
  return out;
};
