import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Globe2 } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesGermanyJobsAdmin } from '@/i18n/pagesGermanyJobsAdmin';
import { Panel } from '@/components/admin/ui';
import { Badge } from '@/components/ui/Badge';
import { fmtDateTime } from '@/components/admin/labels';

registerCopy(pagesGermanyJobsAdmin);

interface ProviderStatus {
  id: 'arbeitnow' | 'careerjet' | 'jooble' | 'adzuna';
  name: string;
  configured: boolean;
  enabled: boolean;
  note: string | null;
  lastFetchAt: string | null;
  lastError: string | null;
  items?: number;
}

interface AlertStats {
  active: number;
  pending: number;
  accounts: number;
  daily: number;
  weekly: number;
  sentLast7Days: number;
  uniqueSearches: number;
  topSearches: { q: string; where: string; type: string; count: number }[];
  savedJobs: number;
  careerjetBudget: { day: string; used: number; limit: number };
}

/** Admin → job channels: the job sources of /jobs/germany (server lib/germanyJobs/providers.ts) and their state. */
export const JobSourcesPanel = () => {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['admin', 'germany-jobs-status'],
    queryFn: async () => (await api.get<{ search: boolean; providers: ProviderStatus[]; alerts?: AlertStats }>('/admin/germany-jobs/status')).data,
    staleTime: 60_000,
  });
  if (!q.data) return null;
  const a = q.data.alerts;
  return (
    <Panel title={t('gja.setup.title')} icon={Globe2}>
      <p className="mb-3 text-sm text-muted">{t('gja.setup.intro')}</p>
      <ul className="divide-y divide-line">
        {q.data.providers.map((p) => (
          <li key={p.id} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
            <span className="flex items-center gap-2 font-semibold text-ink">
              {p.name}
              <Badge tone={p.enabled ? 'success' : 'neutral'} dot>
                {p.enabled ? t('gja.setup.on') : t('gja.setup.off')}
              </Badge>
            </span>
            <span className="min-w-0 text-muted">
              {t(`gja.setup.about.${p.id}`)}
              {p.note && <span className="mt-0.5 block font-mono text-xs break-words">{t('gja.setup.needs', { env: p.note })}</span>}
              {(p.lastFetchAt || p.items !== undefined) && (
                <span className="mt-0.5 block text-xs">
                  {t('gja.setup.lastFetch')}: {p.lastFetchAt ? fmtDateTime(p.lastFetchAt) : '—'}
                  {p.items !== undefined && ` · ${t('gja.setup.items', { n: p.items })}`}
                </span>
              )}
              {p.lastError && <span className="mt-0.5 block text-xs text-danger-fg">{t('gja.setup.error', { error: p.lastError })}</span>}
            </span>
          </li>
        ))}
      </ul>
      {a && (
        <div className="mt-4 border-t border-line pt-3 text-sm">
          <p className="font-semibold text-ink">{t('gja.setup.alerts.title')}</p>
          <p className="mt-1 text-ink">
            {t('gja.setup.alerts.active', { n: a.active })} <span className="text-muted">({t('gja.setup.alerts.detail', { accounts: a.accounts, daily: a.daily, weekly: a.weekly, pending: a.pending })})</span>
          </p>
          <p className="mt-0.5 text-muted">
            {t('gja.setup.alerts.searches', { n: a.uniqueSearches })} · {t('gja.setup.alerts.sent', { n: a.sentLast7Days })} · {t('gja.setup.alerts.saved', { n: a.savedJobs })}
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted">{t('gja.setup.alerts.budget', { used: a.careerjetBudget.used, limit: a.careerjetBudget.limit })}</p>
          {a.topSearches.length > 0 && (
            <>
              <p className="mt-2 text-xs font-semibold text-muted">{t('gja.setup.alerts.top')}</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {a.topSearches.map((s, i) => (
                  <li key={i}>
                    <Badge tone="neutral">
                      {[s.q || t('gja.setup.alerts.anyJob'), s.where, s.type === 'ausbildung' ? 'Ausbildung' : ''].filter(Boolean).join(' · ')} — {s.count}
                    </Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Panel>
  );
};
