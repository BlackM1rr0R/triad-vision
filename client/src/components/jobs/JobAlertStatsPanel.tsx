import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BellRing } from 'lucide-react';
import { api } from '@/lib/api';
import { Panel } from '@/components/admin/ui';
import { registerCopy } from '@/i18n';
import { pagesDiscoverAdmin } from '@/i18n/pagesDiscoverAdmin';

registerCopy(pagesDiscoverAdmin);

interface AlertStats {
  active: number;
  accounts: number;
  pending: number;
  professions: { key: string; count: number; labels: Record<string, string> | null }[];
}

/** Admin Vacancies: active job alerts per profession (where candidate demand is). */
export const JobAlertStatsPanel = ({ className }: { className?: string }) => {
  const { t, i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const { data } = useQuery({ queryKey: ['admin-job-alert-stats'], queryFn: async () => (await api.get<AlertStats>('/admin/site-features/job-alert-stats')).data });
  if (!data) return null;
  const max = Math.max(1, ...data.professions.map((p) => p.count));
  return (
    <Panel title={t('discoverAdmin.alerts.title')} icon={BellRing} className={className}>
      <p className="text-sm text-muted">{t('discoverAdmin.alerts.subtitle')}</p>
      <p className="mt-2 text-xs font-semibold text-navy-900">
        {t('discoverAdmin.alerts.active', { count: data.active })} · {t('discoverAdmin.alerts.accounts', { count: data.accounts })} · {t('discoverAdmin.alerts.pending', { count: data.pending })}
      </p>
      {data.professions.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t('discoverAdmin.alerts.empty')}</p>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.professions.map((p) => (
            <li key={p.key} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate text-navy-900">{p.labels?.[lng] ?? p.labels?.en ?? p.key}</span>
                <span className="font-semibold tabular-nums">{p.count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${(p.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};
