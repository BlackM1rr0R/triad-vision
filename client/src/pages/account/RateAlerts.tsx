import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BellRing, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesRateAlert } from '@/i18n/pagesRateAlert';
import { Skeleton } from '@/components/ui/Skeleton';
import { buttonClass } from '@/components/ui/Button';
import { decimal, dmy, useLng } from '@/components/tools/calc/CalcShared';
import { RateAlertForm } from '@/components/rateAlert/RateAlertForm';
import type { RateAlertView } from '@/pages/RateAlertManage';

registerCopy(pagesRateAlert);

/**
 * /account/rate-alerts — the client's EUR → AZN rate alerts (GET/POST /api/rate-alerts/mine, re-arm, delete). Account
 * alerts need no opt-in e-mail; every alert e-mail still carries an unsubscribe link.
 */
export default function AccountRateAlerts() {
  const { t } = useTranslation();
  const lng = useLng();
  usePageTitle(t('rateAlert.portal.title'));
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['rate-alerts-mine'], queryFn: async () => (await api.get<{ items: RateAlertView[]; max: number }>('/rate-alerts/mine')).data });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['rate-alerts-mine'] });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/rate-alerts/mine/${id}`),
    onSuccess: () => {
      toast.success(t('rateAlert.portal.removed'));
      refresh();
    },
    onError: () => toast.error(t('rateAlert.form.error')),
  });
  const rearm = useMutation({
    mutationFn: async (id: string) => api.post(`/rate-alerts/mine/${id}/rearm`, {}),
    onSuccess: () => {
      toast.success(t('rateAlert.manage.rearmed'));
      refresh();
    },
    onError: () => toast.error(t('rateAlert.form.tooMany')),
  });
  const items = q.data?.items ?? [];
  const max = q.data?.max ?? 3;
  const activeCount = items.filter((a) => a.state !== 'expired').length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="type-page-title flex items-center gap-2 text-ink">
          <BellRing className="size-6 text-primary" aria-hidden /> {t('rateAlert.portal.title')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('rateAlert.portal.subtitle', { n: max })}</p>
      </header>
      {q.isLoading ? (
        <Skeleton className="h-32 rounded-3xl" />
      ) : items.length ? (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-semibold text-ink tabular-nums">{t('rateAlert.cond', { op: a.direction === 'gte' ? '≥' : '≤', target: decimal(a.target, lng, 4) })}</p>
                <p className="text-xs text-muted">
                  {t(`rateAlert.state.${a.state}`)}
                  {a.state === 'active' && a.expiresAt ? ` · ${t('rateAlert.manage.expires', { date: dmy(a.expiresAt) })}` : ''}
                </p>
                {a.lastRate != null && a.lastRateDate && <p className="text-xs text-muted">{t('rateAlert.portal.lastSent', { date: dmy(a.lastRateDate), rate: decimal(a.lastRate, lng, 4) })}</p>}
              </div>
              <div className="flex gap-2">
                {(a.state === 'paused' || a.state === 'expired') && (
                  <button type="button" className={buttonClass({ variant: 'outline', size: 'sm' })} onClick={() => rearm.mutate(a.id)} disabled={rearm.isPending}>
                    <RotateCcw className="size-4" aria-hidden /> {t('rateAlert.portal.rearm')}
                  </button>
                )}
                <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={() => remove.mutate(a.id)} disabled={remove.isPending} aria-label={`${t('rateAlert.portal.remove')}: ${a.target}`}>
                  <Trash2 className="size-4" aria-hidden /> {t('rateAlert.portal.remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t('rateAlert.portal.empty')}</p>
      )}
      {activeCount < max && <RateAlertForm key={items.length} compact onCreated={refresh} />}
    </div>
  );
}
