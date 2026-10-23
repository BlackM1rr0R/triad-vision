import type { TFunction } from 'i18next';
import { registerCopy } from '@/i18n';
import { pagesAiMgmt } from '@/i18n/pagesAiMgmt';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';

registerCopy(pagesAiMgmt);

const KNOWN = ['NO_API_KEY', 'MONTHLY_BUDGET', 'DAILY_COST', 'KEY_CREDIT', 'TIMEOUT', 'UPSTREAM', 'BAD_OUTPUT'];
export const aiMgmtReason = (t: TFunction, reason: string | null | undefined) => t(`aiMgmt.errors.${reason && KNOWN.includes(reason) ? reason : 'generic'}`);

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';
export const SEVERITY_TONE: Record<Severity, string> = toneClasses(STATUS_TONES.severity);

/** Amounts in cents per currency → "1.234,00 EUR, 50,00 AZN". */
export const fmtMoney = (m: Record<string, number> | undefined, locale: string) => {
  const parts = Object.entries(m ?? {})
    .filter(([, v]) => v)
    .map(([c, v]) => {
      try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency: c }).format(v / 100);
      } catch {
        return `${(v / 100).toFixed(2)} ${c}`;
      }
    });
  return parts.length ? parts.join(', ') : '—';
};
