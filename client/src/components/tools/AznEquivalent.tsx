import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Info } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesSalaryAzn } from '@/i18n/pagesSalaryAzn';
import type { EurAzn } from '@/components/life/api';

registerCopy(pagesSalaryAzn);

/** Official EUR → AZN rate of the CBAR (GET /api/life/rate: fetched server-side at most daily, last known rate as fallback). */
export const useEurAzn = () =>
  useQuery({
    queryKey: ['eur-azn'],
    queryFn: async () => (await api.get<{ rate: EurAzn | null }>('/life/rate')).data.rate,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

const NUM_LOCALE = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' } as const;

/** "≈ 4 512 ₼" (whole manat). */
export const useManat = () => {
  const { locale } = useL10n();
  return useMemo(() => {
    const f = new Intl.NumberFormat(NUM_LOCALE[locale], { maximumFractionDigits: 0 });
    return (n: number) => `${f.format(Math.round(n))} ₼`;
  }, [locale]);
};

/**
 * Net salary in manat under the salary calculator's euro result: monthly and yearly at the CBAR rate, with
 * the rate and its date. Without a rate (CBAR never reached) a short note instead; while loading nothing.
 */
export const AznEquivalent = ({ netMonth, netYear, className }: { netMonth: number; netYear: number; className?: string }) => {
  const { t, i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const manat = useManat();
  const q = useEurAzn();
  if (q.isPending) return null;
  const rate = q.data ?? null;
  if (!rate)
    return (
      <p className={clsx('flex items-start gap-1.5 text-xs text-muted', className)}>
        <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {t('salaryAzn.none')}
      </p>
    );
  const [y, m, d] = rate.date.split('-');
  const date = `${d}.${m}.${y}`;
  const value = lng === 'en' ? rate.rate.toFixed(4) : rate.rate.toFixed(4).replace('.', ',');
  return (
    <div className={clsx('rounded-xl border border-line bg-card p-3', className)}>
      <p className="text-xs font-semibold text-muted">{t('salaryAzn.title')}</p>
      <dl className="mt-1 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-[11px] text-muted">{t('salaryAzn.month')}</dt>
          <dd className="font-display text-xl font-semibold text-ink tabular-nums">≈ {manat(netMonth * rate.rate)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">{t('salaryAzn.year')}</dt>
          <dd className="font-display text-xl font-semibold text-ink tabular-nums">≈ {manat(netYear * rate.rate)}</dd>
        </div>
      </dl>
      <p className={clsx('mt-2 flex items-start gap-1.5 text-[11px] leading-snug', rate.stale ? 'text-warning-fg' : 'text-muted')}>
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          {t('salaryAzn.rate', { rate: value, date })}
          {rate.stale && <> — {t('salaryAzn.stale', { date })}</>}{' '}
          <a href="https://www.cbar.az/currency/rates" target="_blank" rel="noopener noreferrer" className="font-semibold text-link hover:underline">
            cbar.az
          </a>
        </span>
      </p>
    </div>
  );
};
