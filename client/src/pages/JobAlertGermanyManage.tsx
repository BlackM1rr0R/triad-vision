import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BellOff, BellRing, CheckCircle2, Search } from 'lucide-react';
import { Lost } from '@/components/illustrations';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesGermanyJobAlerts } from '@/i18n/pagesGermanyJobAlerts';
import { searchToParams, type AlertFrequency, type GermanyJobAlertView } from '@/lib/germanyJobs';
import { useAlertSummary } from '@/components/germanyJobs/alertSummary';

registerCopy(pagesGermanyJobAlerts);

/**
 * /job-alert/germany?token=…[&action=confirm|unsubscribe] — the link of every Germany job alert e-mail (no login):
 * confirm the double opt-in, change the frequency, unsubscribe or turn the alert back on. State changes are POSTs
 * from this page, so mail scanners that prefetch links never confirm or unsubscribe anyone (server
 * routes/germanyJobAlerts.ts).
 */
export default function JobAlertGermanyManage() {
  const { t } = useTranslation();
  usePageTitle(t('gjManage.title'));
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const action = params.get('action');
  const summary = useAlertSummary();
  const [alert, setAlert] = useState<GermanyJobAlertView | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid'>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [frequency, setFrequency] = useState<AlertFrequency>('daily');
  const started = useRef(false);

  const load = (a: GermanyJobAlertView) => {
    setAlert(a);
    setFrequency(a.frequency);
    setStatus('ready');
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const run = async () => {
      try {
        if (action === 'confirm') {
          load((await api.post<{ alert: GermanyJobAlertView }>('/germany-jobs/alerts/confirm', { token })).data.alert);
          setNotice(t('gjManage.confirmed'));
        } else load((await api.get<{ alert: GermanyJobAlertView }>('/germany-jobs/alerts/manage', { params: { token } })).data.alert);
      } catch {
        setStatus('invalid');
      }
    };
    void run();
  }, [action, token, t]);

  const post = async (path: 'unsubscribe' | 'resume') => {
    setBusy(true);
    try {
      load((await api.post<{ alert: GermanyJobAlertView }>(`/germany-jobs/alerts/${path}`, { token })).data.alert);
      setNotice(path === 'unsubscribe' ? t('gjManage.unsubscribed') : t('gjManage.resumed'));
    } catch {
      toast.error(t('gjManage.error'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      load((await api.patch<{ alert: GermanyJobAlertView }>('/germany-jobs/alerts/manage', { token, frequency })).data.alert);
      setNotice(t('gjManage.saved'));
    } catch {
      toast.error(t('gjManage.error'));
    } finally {
      setBusy(false);
    }
  };

  const searchHref = alert ? `/jobs/germany/search?${searchToParams({ ...alert.search, page: 1 }).toString()}` : '/jobs/germany';

  return (
    <section className="section bg-canvas pt-28 sm:pt-36 lg:pt-40">
      <div className="container-x max-w-2xl">
        <h1 className="h-section text-ink">{t('gjManage.title')}</h1>
        {status === 'loading' ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted">
            <Spinner className="size-4" /> {action === 'confirm' ? t('gjManage.confirming') : t('gjManage.loading')}
          </p>
        ) : status === 'invalid' || !alert ? (
          <div className="card card-pad mt-6 flex flex-col items-center gap-4 rounded-3xl text-center sm:flex-row sm:text-left">
            <Lost className="w-32 shrink-0" />
            <div>
              <p className="text-sm text-ink">{t('gjManage.invalid')}</p>
              <Link to="/jobs/germany" className="btn-primary mt-4">
                {t('gjManage.toSearch')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {notice && (
              <p className="flex items-start gap-2 rounded-xl bg-success-bg p-4 text-sm text-success-fg" role="status">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {notice}
              </p>
            )}
            <div className="card card-pad">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold text-muted">{t('gjManage.searchLabel')}</dt>
                  <dd className="mt-0.5 font-semibold break-words text-ink">{summary(alert.search)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-muted">{t('gjManage.emailLabel')}</dt>
                  <dd className="mt-0.5 font-semibold text-ink">{alert.email}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-muted">{t('gjManage.status')}</dt>
                  <dd className="mt-0.5 font-semibold text-ink">
                    {alert.unsubscribed ? t('gjManage.paused') : alert.confirmed ? t('gjManage.active') : t('gjManage.pending')}
                  </dd>
                </div>
              </dl>
              <Link to={searchHref} className="btn-secondary mt-4">
                <Search className="size-4" aria-hidden /> {t('gjManage.openSearch')}
              </Link>
            </div>

            {action === 'unsubscribe' && !alert.unsubscribed && (
              <div className="card card-pad border-warning-border">
                <h2 className="type-card-title text-ink">{t('gjManage.unsubscribeTitle')}</h2>
                <p className="mt-1 text-sm text-muted">{t('gjManage.unsubscribeText')}</p>
                <button type="button" className="btn-primary mt-4" disabled={busy} onClick={() => void post('unsubscribe')}>
                  <BellOff className="size-4" aria-hidden /> {t('gjManage.unsubscribeBtn')}
                </button>
              </div>
            )}

            {alert.unsubscribed ? (
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void post('resume')}>
                <BellRing className="size-4" aria-hidden /> {t('gjManage.resume')}
              </button>
            ) : (
              <div className="card card-pad">
                <fieldset>
                  <legend className="label">{t('gjManage.frequency')}</legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {(['daily', 'weekly'] as const).map((f) => (
                      <label key={f} className="inline-flex min-h-10 items-center gap-2 text-sm text-ink">
                        <input type="radio" name="gj-freq" className="size-5 accent-brand-600" checked={frequency === f} onChange={() => setFrequency(f)} />
                        {t(`gjAlert.${f}`)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn-primary" disabled={busy || frequency === alert.frequency} onClick={() => void save()}>
                    {t('gjManage.save')}
                  </button>
                  {action !== 'unsubscribe' && (
                    <button type="button" className="btn-secondary" disabled={busy} onClick={() => void post('unsubscribe')}>
                      <BellOff className="size-4" aria-hidden /> {t('gjManage.stop')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
