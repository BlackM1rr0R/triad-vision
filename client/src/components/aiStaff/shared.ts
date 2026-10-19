import type { TFunction } from 'i18next';
import { registerCopy, currentLocale } from '@/i18n';
import { pagesAiStaff } from '@/i18n/pagesAiStaff';

registerCopy(pagesAiStaff);

const KNOWN = ['NO_API_KEY', 'DISABLED', 'MONTHLY_BUDGET', 'DAILY_COST', 'DAILY_MESSAGES', 'KEY_CREDIT', 'TIMEOUT', 'UPSTREAM', 'BAD_OUTPUT', 'NOT_LINKED', 'TRANSLATION_FAILED'];

/** Localized text for an AI failure reason returned by /admin/ai-staff/*. */
export const aiReasonText = (t: TFunction, reason: string | null | undefined) => t(`aiStaff.errors.${reason && KNOWN.includes(reason) ? reason : 'generic'}`);

/** UI language for AI outputs (summary language). */
export const uiLocale = () => currentLocale();

export const LANG_LABEL: Record<string, string> = { az: 'AZ', de: 'DE', en: 'EN', ru: 'RU' };
