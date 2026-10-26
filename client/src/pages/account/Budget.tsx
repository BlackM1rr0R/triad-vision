import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { BudgetCalculator } from '@/components/budget/BudgetCalculator';
import { useBudgetPrefill, type BudgetForm } from '@/components/budget/api';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesBudget } from '@/i18n/pagesBudget';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesBudget);

/**
 * /account/budget — personalised first-month budget: prefilled from the client's own application
 * (employment contract, vacancy, visa type, arrival plan, family members) via GET /api/budget/me.
 */
export default function AccountBudget() {
  const { t } = useTranslation();
  usePageTitle(t('budget.portalTitle'));
  const prefill = useBudgetPrefill(true);

  const initial = useMemo<BudgetForm | undefined>(() => {
    const p = prefill.data?.prefill;
    if (!p) return undefined;
    return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) as BudgetForm;
  }, [prefill.data]);

  const sources = prefill.data?.sources ?? {};
  const list = (Object.keys(sources) as (keyof typeof sources)[])
    .map((k) => `${t(`budget.fields.${k}`)} (${t(`budget.sources.${sources[k]}`)})`)
    .join(', ');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="type-page-title">{t('budget.portalTitle')}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('budget.portalSubtitle')}</p>
      </div>
      {prefill.isLoading ? (
        <Spinner className="mx-auto my-16 size-8" label={t('budget.result.loading')} />
      ) : (
        <BudgetCalculator
          initial={initial}
          callbackSource="portal"
          intro={
            list ? (
              <p className="flex items-start gap-2 rounded-2xl bg-info-bg p-3 text-sm text-info-fg">
                <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('budget.prefilled', { list })}
              </p>
            ) : null
          }
        />
      )}
    </div>
  );
}
