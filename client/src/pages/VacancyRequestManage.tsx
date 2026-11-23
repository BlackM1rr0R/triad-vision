import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesVacancyRequest } from '@/i18n/pagesVacancyRequest';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';
import { useRequestLine, type MyVacancyRequest } from '@/components/jobs/VacancyRequestForm';

registerCopy(pagesVacancyRequest);

type Info = Pick<MyVacancyRequest, 'type' | 'sector' | 'profession' | 'city'> & { cancelled: boolean };

/**
 * /vacancy-request?token=… — the link in every vacancy request e-mail (no login): shows what was asked and cancels the
 * request. The cancel is a POST from this page, so mail scanners that prefetch links never cancel anything.
 */
export default function VacancyRequestManage() {
  const { t } = useTranslation();
  usePageTitle(t('vreq.manage.title'));
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const line = useRequestLine();
  const [info, setInfo] = useState<Info | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get<Info>('/vacancy-requests/by-token', { params: { token } })
      .then((r) => {
        if (!live) return;
        setInfo(r.data);
        setStatus('ready');
      })
      .catch(() => live && setStatus('invalid'));
    return () => {
      live = false;
    };
  }, [token]);

  const cancel = async () => {
    setBusy(true);
    try {
      await api.post('/vacancy-requests/cancel', { token });
      setInfo((i) => (i ? { ...i, cancelled: true } : i));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section bg-canvas pt-28 sm:pt-36 lg:pt-40">
      <div className="container-x max-w-2xl">
        <h1 className="h-section text-ink">{t('vreq.manage.title')}</h1>
        {status === 'loading' ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted">
            <Spinner className="size-4" />
          </p>
        ) : status === 'invalid' || !info ? (
          <div className="card card-pad mt-6 rounded-3xl">
            <p className="text-sm text-ink">{t('vreq.manage.invalid')}</p>
            <Link to="/jobs" className={buttonClass({ className: 'mt-4' })}>
              {t('vreq.manage.title')}
            </Link>
          </div>
        ) : (
          <div className="card card-pad mt-6 rounded-3xl">
            <p className="text-sm font-semibold text-ink">{line(info)}</p>
            {info.cancelled ? (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-success-bg p-4 text-sm text-success-fg" role="status">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('vreq.manage.done')}
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted">{t('vreq.manage.text')}</p>
                <button type="button" className={buttonClass({ variant: 'danger', className: 'mt-4' })} disabled={busy} onClick={() => void cancel()}>
                  {t('vreq.manage.cancel')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
