import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Scale } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesStaffTools } from '@/i18n/pagesStaffTools';
import { Card } from '@/components/ui/Card';

registerCopy(pagesStaffTools);

// GET /api/account/rule-changes (server lib/ruleChanges/service.ts clientRuleChanges)
export interface ClientRuleChange {
  id: string;
  title: string;
  body: string;
  visaTypes: string[];
  effectiveDate: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
}

export const useClientRuleChanges = () =>
  useQuery({ queryKey: ['account-rule-changes'], queryFn: async () => (await api.get<{ items: ClientRuleChange[] }>('/account/rule-changes')).data.items });

export const RuleChangeItem = ({ c, full = true }: { c: ClientRuleChange; full?: boolean }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const day = (iso: string) => date(iso, { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <article className="space-y-1.5">
      <h3 className="text-sm font-semibold text-ink">{c.title}</h3>
      <p className="text-xs text-muted">
        {[c.publishedAt ? t('staffTools.rcPortal.published', { date: day(c.publishedAt) }) : null, c.effectiveDate ? t('staffTools.rcPortal.effective', { date: day(c.effectiveDate) }) : null].filter(Boolean).join(' · ')}
      </p>
      <p className={full ? 'text-sm whitespace-pre-line text-ink/90' : 'line-clamp-3 text-sm whitespace-pre-line text-ink/90'}>{c.body}</p>
      {c.sourceUrl && (
        <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1.5 text-xs text-link hover:underline">
          <ExternalLink className="size-3.5" aria-hidden /> {t('staffTools.rcPortal.source')}
        </a>
      )}
    </article>
  );
};

/** Portal notifications aside: the latest rule changes for this client (renders nothing when there are none). */
export const RuleChangesCard = () => {
  const { t } = useTranslation();
  const q = useClientRuleChanges();
  const items = q.data ?? [];
  if (!items.length) return null;
  return (
    <Card title={t('staffTools.rcPortal.title')} icon={Scale}>
      <div className="space-y-4">
        {items.slice(0, 2).map((c) => (
          <RuleChangeItem key={c.id} c={c} full={false} />
        ))}
        <Link to="/account/rule-changes" className="inline-flex min-h-9 items-center text-sm font-semibold text-link hover:underline">
          {t('staffTools.rcPortal.all')}
        </Link>
      </div>
    </Card>
  );
};
