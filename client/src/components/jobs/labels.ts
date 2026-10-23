import { useMemo } from 'react';
import { scoreTone as scoreToneOf, TONE_TEXT } from '@/components/ui/status';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import type { MatchGap } from './types';

const NUM_LOCALE = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' } as const;

/** Translated message for an API error of the jobs area (falls back to a generic message). */
export const jobsError = (err: unknown) => {
  const code = errorCode(err);
  const key = `jobsArea.errors.${code}`;
  return i18n.exists(key) ? String(i18n.t(key)) : String(i18n.t('jobsArea.errors.generic'));
};
export const toastJobsError = (err: unknown) => toast.error(jobsError(err));

/** Labels and formatting for vacancies, bound to the current UI language. */
export const useJobLabels = () => {
  const { t } = useTranslation();
  const { locale, tr } = useL10n();
  return useMemo(() => {
    const euro = new Intl.NumberFormat(NUM_LOCALE[locale], { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    const optional = (prefix: string, v: string | null | undefined) => (v ? t(`${prefix}.${v}`, { defaultValue: v }) : '');
    return {
      sector: (v: string | null | undefined) => optional('jobsArea.sector', v),
      employmentType: (v: string | null | undefined) => optional('jobsArea.employmentType', v),
      german: (v: string | null | undefined) => (v ? t(`jobsArea.german.${v}`, { defaultValue: v }) : t('jobsArea.german.none')),
      education: (v: string | null | undefined) => optional('jobsArea.education', v),
      appStatus: (v: string) => t(`jobsArea.appStatus.${v}`),
      vacancyStatus: (v: string) => t(`jobsArea.vacancyStatus.${v}`),
      companyStatus: (v: string) => t(`jobsArea.companyStatus.${v}`),
      euro: (n: number) => euro.format(n),
      salary: (min: number | null | undefined, max: number | null | undefined) => {
        if (min != null && max != null) return min === max ? euro.format(min) : `${euro.format(min)} – ${euro.format(max)}`;
        if (min != null) return t('jobsArea.common.salaryFrom', { value: euro.format(min) });
        if (max != null) return t('jobsArea.common.salaryUpTo', { value: euro.format(max) });
        return '';
      },
      years: (n: number | null | undefined) => (n == null ? '' : t('jobsArea.common.years', { count: n })),
      gap: (g: MatchGap) => t(`jobsArea.gap.${g.code}`, { required: g.code === 'GERMAN' || g.code === 'VISA_GERMAN' ? String(g.required) : g.required, actual: g.actual ?? '—' }),
      title: (v: L10n | null | undefined) => tr(v),
    };
  }, [t, tr, locale]);
};

export const scoreTone = (score: number) => TONE_TEXT[scoreToneOf(score)];
export const scoreBg = (score: number) => (score >= 80 ? 'bg-emerald-500' : score >= 55 ? 'bg-amber-500' : 'bg-red-500');
