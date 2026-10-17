import { useMemo } from 'react';
import { useL10n } from '@/lib/l10n';

const NUM_LOCALE = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' } as const;

/** Euro / percent formatters bound to the UI language (cents optional). */
export const useMoney = () => {
  const { locale } = useL10n();
  return useMemo(() => {
    const tag = NUM_LOCALE[locale];
    const whole = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    const cents = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pct = new Intl.NumberFormat(tag, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return {
      euro: (n: number) => whole.format(n),
      euroCents: (n: number) => cents.format(n),
      percent: (n: number) => pct.format(n),
    };
  }, [locale]);
};
