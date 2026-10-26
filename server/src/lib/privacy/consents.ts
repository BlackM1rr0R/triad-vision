import type { Request } from 'express';
import { prisma } from '../../db.js';
import { currentRef, kindForConsentType, LEGACY_POLICY_VERSION } from '../legal/documents.js';

/**
 * Legacy version label, used only while no legal document of the kind is published. The version of
 * a consent is now the current published LegalDocument (lib/legal/documents.ts → currentRef).
 */
export const POLICY_VERSION = LEGACY_POLICY_VERSION;

export const CONSENT_TYPES = [
  'PRIVACY_POLICY',
  'TERMS',
  'MARKETING_EMAIL',
  'WHATSAPP',
  'SMS',
  'EMPLOYER_SHARING',
  'PASSPORT_OCR',
  'SKILL_VIDEO', // per skill video: may be shown to prospective employers (routes/skillVideos.ts)
  // Cookie banner: COOKIES = any optional category allowed; the categories are logged next to it.
  'COOKIES',
  'COOKIES_ANALYTICS',
  'COOKIES_MARKETING',
] as const;
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
  /** The legal text version the consent refers to; resolved from the current published document when omitted. */
  legalDocumentId?: string | null;
  /** Anonymous visitor (cookie banner without an account). */
  visitorId?: string | null;
  req?: Pick<Request, 'ip' | 'get'>;
}) => {
  try {
    let version = input.version;
    let legalDocumentId = input.legalDocumentId ?? null;
    const kind = kindForConsentType(input.type.startsWith('COOKIES') ? 'COOKIES' : input.type);
    if (!version && kind) {
      const ref = await currentRef(kind);
      version = ref.version;
      legalDocumentId ??= ref.id;
    }
    await prisma.consentRecord.create({
      data: {
        userId: input.userId ?? null,
        email: input.email?.toLowerCase() ?? null,
        type: input.type,
        granted: input.granted,
        version: (version ?? POLICY_VERSION).slice(0, 40),
        source: input.source.slice(0, 40),
        legalDocumentId,
        visitorId: input.visitorId ?? null,
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
