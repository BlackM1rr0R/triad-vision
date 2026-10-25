import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import './shared';

/** Dashboard strip for the super admin: "Security: 2 open alerts" → Admin → Security alerts. */
export const SecurityAlertsWidget = () => {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['mgmt', 'security', 'summary'],
    queryFn: async () => (await api.get<{ open: number; high: number }>('/admin/mgmt/security/summary')).data,
    refetchInterval: 2 * 60_000,
  });
  if (!data) return null;
  const alarm = data.open > 0;
  const Icon = alarm ? ShieldAlert : ShieldCheck;
  return (
    <Link
      to="/admin/security-alerts"
      className={clsx(
        'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition hover:shadow-[var(--tv-shadow-raised)]',
        alarm ? (data.high ? 'border-danger-border bg-danger-bg' : 'border-warning-border bg-warning-bg') : 'border-line bg-card',
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className={clsx('grid size-9 shrink-0 place-items-center rounded-lg', alarm ? (data.high ? 'bg-danger-bg text-danger-fg' : 'bg-warning-bg text-warning-fg') : 'bg-success-bg text-success-fg')}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">
            {t('aiMgmt.widget.title')}: {alarm ? t('aiMgmt.widget.open', { count: data.open }) : t('aiMgmt.widget.none')}
          </span>
          {data.high > 0 && <span className="block text-xs font-medium text-danger-fg">{t('aiMgmt.widget.high', { count: data.high })}</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-link">
        {t('aiMgmt.widget.view')} <ArrowRight className="size-3.5" aria-hidden />
      </span>
    </Link>
  );
};
