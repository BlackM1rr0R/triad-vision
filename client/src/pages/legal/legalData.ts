import { useSiteContent } from '@/lib/content';
import type { L10n } from '@/lib/types';

/** Setting 'legal' (Admin → Settings → Impressum). Every field may be empty until filled in. */
export interface LegalInfo {
  companyName: string;
  legalForm: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  representative: string;
  registerCourt: string;
  registerNumber: string;
  vatId: string;
  email: string;
  phone: string;
  responsibleForContent: string;
  supervisoryNote: string;
}

/** Setting 'privacy': optional replacement text; empty German text = generated template. */
export interface PrivacySetting {
  text: L10n;
  supervisoryAuthority: string;
  dpo: string;
  effectiveDate: string;
}

export interface RetentionSetting {
  months: number;
  includeMessages: boolean;
}

export const LEGAL_FIELDS = [
  'companyName',
  'legalForm',
  'street',
  'postalCode',
  'city',
  'country',
  'representative',
  'registerCourt',
  'registerNumber',
  'vatId',
  'email',
  'phone',
  'responsibleForContent',
  'supervisoryNote',
] as const satisfies readonly (keyof LegalInfo)[];

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const obj = (v: unknown) => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

export const normalizeLegal = (v: unknown): LegalInfo => {
  const o = obj(v);
  return Object.fromEntries(LEGAL_FIELDS.map((k) => [k, str(o[k])])) as unknown as LegalInfo;
};

export const normalizePrivacy = (v: unknown): PrivacySetting => {
  const o = obj(v);
  const text = obj(o.text);
  return {
    text: { az: str(text.az), de: str(text.de), en: str(text.en), ru: str(text.ru) },
    supervisoryAuthority: str(o.supervisoryAuthority),
    dpo: str(o.dpo),
    effectiveDate: str(o.effectiveDate),
  };
};

export const RETENTION_DEFAULT: RetentionSetting = { months: 12, includeMessages: false };

export const normalizeRetention = (v: unknown): RetentionSetting => {
  const o = obj(v);
  const months = Number(o.months);
  return {
    months: Number.isInteger(months) && months >= 1 && months <= 120 ? months : RETENTION_DEFAULT.months,
    includeMessages: o.includeMessages === true,
  };
};

/** Legal settings from the public content endpoint (already cached for the whole site). */
export const useLegalSettings = () => {
  const { data, isLoading } = useSiteContent();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return {
    loading: isLoading,
    legal: normalizeLegal(settings.legal),
    privacy: normalizePrivacy(settings.privacy),
    retention: normalizeRetention(settings.retention),
  };
};
