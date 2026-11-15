import { useTranslation } from 'react-i18next';
import { Scale } from 'lucide-react';
import { usePageTitle } from '@/lib/usePageTitle';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { RuleChangeItem, useClientRuleChanges } from '@/components/ruleChanges/ClientRuleChanges';

/** /account/rule-changes — "Qayda dəyişiklikləri": rule changes the team published for the client's visa type. */
export default function AccountRuleChanges() {
  const { t } = useTranslation();
  usePageTitle(t('staffTools.rcPortal.title'));
  const q = useClientRuleChanges();
  const items = q.data ?? [];
  return (
    <div className="mx-auto max-w-3xl">
      <Card title={t('staffTools.rcPortal.title')} subtitle={t('staffTools.rcPortal.hint')} icon={Scale}>
        {q.isLoading ? (
          <Spinner className="size-5" />
        ) : !items.length ? (
          <p className="text-sm text-muted">{t('staffTools.rcPortal.empty')}</p>
        ) : (
          <div className="divide-y divide-line">
            {items.map((c) => (
              <div key={c.id} className="py-4 first:pt-0 last:pb-0">
                <RuleChangeItem c={c} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
