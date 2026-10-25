import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CalendarPlus, Copy, ExternalLink, Laptop, Lock, Power, RotateCw, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesPrep } from '@/i18n/pagesPrep';
import { btnSecondary } from '@/components/prep/ui';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/portal/ConfirmDialog';
import { useApiError } from '@/components/portal/useApiError';

registerCopy(pagesPrep);

type FeedState = { enabled: boolean; url: string | null };
const KEY = ['calendar-token'];

/** webcal:// makes iOS / macOS (and Outlook desktop) offer "Subscribe" instead of downloading the file. */
const webcal = (url: string) => url.replace(/^https?:\/\//i, 'webcal://');

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
};

/**
 * "Add to my phone calendar": the client's personal ICS feed (embassy appointment, interviews,
 * arrival, translation due dates, signatures). Clients only; renders nothing for other roles.
 */
export const CalendarSubscribe = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const apiError = useApiError();
  const [confirm, setConfirm] = useState<'rotate' | 'off' | null>(null);
  const isClient = user?.role === 'CLIENT';

  const feed = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<FeedState>('/calendar/token')).data,
    enabled: isClient,
  });
  const create = useMutation({
    mutationFn: async () => (await api.post<FeedState>('/calendar/token')).data,
    onSuccess: (data) => {
      toast.success(t(feed.data?.enabled ? 'prep.calendar.rotatedOk' : 'prep.calendar.enabledOk'));
      qc.setQueryData(KEY, { enabled: true, url: data.url });
      setConfirm(null);
    },
    onError: apiError,
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete<FeedState>('/calendar/token')).data,
    onSuccess: () => {
      toast.success(t('prep.calendar.offOk'));
      qc.setQueryData(KEY, { enabled: false, url: null });
      setConfirm(null);
    },
    onError: apiError,
  });

  if (!isClient) return null;
  const url = feed.data?.enabled ? feed.data.url : null;

  const onCopy = async () => {
    if (url && (await copyText(url))) toast.success(t('prep.calendar.copied'));
  };

  return (
    <section className={clsx('card card-pad', className)} aria-labelledby="calendar-subscribe-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft" aria-hidden>
          <CalendarPlus className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="calendar-subscribe-title" className="text-base font-semibold text-ink">{t('prep.calendar.title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('prep.calendar.intro')}</p>
        </div>
      </div>

      <div className="mt-5">
        {feed.isLoading ? (
          <Spinner className="size-5 text-primary" />
        ) : url ? (
          <div className="space-y-4">
            <div>
              <span className="label">{t('prep.calendar.linkLabel')}</span>
              <code className="block rounded-lg border border-line bg-sunken px-3 py-2 font-mono text-xs break-all text-ink">{url}</code>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={webcal(url)} className="btn-primary btn-sm">
                <ExternalLink className="size-3.5" aria-hidden /> {t('prep.calendar.open')}
              </a>
              <button type="button" className={btnSecondary} onClick={onCopy}>
                <Copy className="size-3.5" aria-hidden /> {t('prep.calendar.copy')}
              </button>
              <button type="button" className={btnSecondary} onClick={() => setConfirm('rotate')}>
                <RotateCw className="size-3.5" aria-hidden /> {t('prep.calendar.rotate')}
              </button>
              <button type="button" className={clsx(btnSecondary, 'text-danger')} onClick={() => setConfirm('off')}>
                <Power className="size-3.5" aria-hidden /> {t('prep.calendar.turnOff')}
              </button>
            </div>
            <div className="rounded-xl bg-sunken p-4 text-sm text-ink/85">
              <p className="mb-2 font-semibold text-ink">{t('prep.calendar.howTitle')}</p>
              <ul className="space-y-2">
                <li className="flex gap-2"><Smartphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> <span>{t('prep.calendar.iphone')}</span></li>
                <li className="flex gap-2"><Smartphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> <span>{t('prep.calendar.android')}</span></li>
                <li className="flex gap-2"><Laptop className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> <span>{t('prep.calendar.outlook')}</span></li>
              </ul>
              <p className="mt-3 text-xs text-muted">{t('prep.calendar.refresh')}</p>
            </div>
            <p className="flex gap-2 text-xs text-muted">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('prep.calendar.privacy')}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink/80">{t('prep.calendar.off')}</p>
            <button type="button" className="btn-primary btn-sm" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Spinner className="size-3.5" /> : <CalendarPlus className="size-3.5" aria-hidden />} {t('prep.calendar.enable')}
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'rotate'}
        title={t('prep.calendar.rotateTitle')}
        confirmLabel={t('prep.calendar.rotate')}
        busy={create.isPending}
        onConfirm={() => create.mutate()}
        onClose={() => setConfirm(null)}
      >
        {t('prep.calendar.rotateText')}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'off'}
        title={t('prep.calendar.turnOffTitle')}
        confirmLabel={t('prep.calendar.turnOff')}
        danger
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirm(null)}
      >
        {t('prep.calendar.turnOffText')}
      </ConfirmDialog>
    </section>
  );
};

export default CalendarSubscribe;
