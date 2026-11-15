import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BellRing, CheckCircle2, MailCheck } from 'lucide-react';
import i18n, { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesGermanyJobAlerts } from '@/i18n/pagesGermanyJobAlerts';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { leadVisitorId } from '@/lib/leadVisitor';
import { alertSearchOf, type AlertFrequency, type GermanyJobSearch } from '@/lib/germanyJobs';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useAlertSummary } from './alertSummary';

registerCopy(pagesGermanyJobAlerts);

const errorText = (err: unknown) => {
  const key = `gjAlert.errors.${errorCode(err)}`;
  return i18n.exists(key) ? String(i18n.t(key)) : String(i18n.t('gjAlert.errors.generic'));
};

/**
 * "Notify me about new jobs like this" for the current search on /jobs/germany (server routes/germanyJobAlerts.ts):
 * visitors get a confirmation e-mail first (double opt-in); signed-in clients subscribe their account address at
 * once (managed in the portal, /account/saved-jobs). Opened from a click only (not part of the SSR markup).
 */
export const AlertDialog = ({ search, open, onClose }: { search: GermanyJobSearch; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = useId();
  const client = user?.role === 'CLIENT' ? user : null;
  const summary = useAlertSummary();
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState<AlertFrequency>('daily');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'pending' | 'active' | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail(client?.email ?? '');
    setFrequency('daily');
    setConsent(false);
    setError(null);
    setDone(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending || !consent) return;
    setSending(true);
    setError(null);
    const body = { ...alertSearchOf(search), frequency, lng: currentSiteLocale() };
    try {
      if (client) {
        await api.post('/germany-jobs/alerts/mine', body);
        void qc.invalidateQueries({ queryKey: ['germany-job-alerts-mine'] });
        setDone('active');
      } else {
        const r = await api.post<{ confirmed: boolean }>('/germany-jobs/alerts', { ...body, email: email.trim(), consent: true, website: website || undefined, visitorId: leadVisitorId() ?? undefined });
        setDone(r.data.confirmed ? 'active' : 'pending');
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const form = `${uid}-form`;
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<BellRing className="size-5 text-link" aria-hidden />}
      title={done ? (done === 'pending' ? t('gjAlert.pendingTitle') : t('gjAlert.activeTitle')) : t('gjAlert.title')}
      description={done ? undefined : t('gjAlert.description')}
      busy={sending}
      footer={
        done ? (
          <Button onClick={onClose}>{t('gjAlert.close')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={sending}>
              {t('gjAlert.cancel')}
            </Button>
            <Button type="submit" form={form} loading={sending} icon={BellRing} disabled={!consent || (!client && !email.trim())}>
              {t('gjAlert.submit')}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div role="status" className="flex flex-col items-center py-6 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-success-bg text-success">
            {done === 'pending' ? <MailCheck className="size-7" aria-hidden /> : <CheckCircle2 className="size-7" aria-hidden />}
          </span>
          <p className="mt-4 max-w-sm text-muted">{done === 'pending' ? t('gjAlert.pendingText') : t('gjAlert.activeText')}</p>
          {done === 'active' && client && (
            <Link to="/account/saved-jobs" className="mt-3 text-sm font-semibold text-link hover:underline" onClick={onClose}>
              {t('gjAlert.manageInPortal')}
            </Link>
          )}
        </div>
      ) : (
        <form id={form} onSubmit={submit} className="space-y-5">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} />
          <div className="rounded-xl border border-line bg-sunken/60 px-4 py-3">
            <p className="text-xs font-semibold text-muted">{t('gjAlert.searchLabel')}</p>
            <p className="mt-0.5 font-semibold break-words text-ink">{summary(alertSearchOf(search))}</p>
          </div>
          {client ? (
            <p className="text-sm text-muted">{t('gjAlert.accountEmail', { email: client.email })}</p>
          ) : (
            <div>
              <label className="label" htmlFor={`${uid}-email`}>
                {t('gjAlert.email')} <span aria-hidden>*</span>
              </label>
              <input id={`${uid}-email`} type="email" required autoComplete="email" maxLength={190} className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          <fieldset>
            <legend className="label">{t('gjAlert.frequency')}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {(['daily', 'weekly'] as const).map((f) => (
                <label key={f} className="inline-flex min-h-10 items-center gap-2 text-sm text-ink">
                  <input type="radio" name={`${uid}-freq`} className="size-5 accent-brand-600" checked={frequency === f} onChange={() => setFrequency(f)} />
                  {t(`gjAlert.${f}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-start gap-3 text-sm text-ink">
            <input type="checkbox" required className="mt-0.5 size-5 shrink-0 accent-brand-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              {t('gjAlert.consent')}{' '}
              <Link to="/privacy" target="_blank" className="text-link underline">
                {t('gjAlert.privacyLink')}
              </Link>
            </span>
          </label>
          {error && (
            <p className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-fg" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
};
