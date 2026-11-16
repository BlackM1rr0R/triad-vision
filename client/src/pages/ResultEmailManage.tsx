import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, MailX, TriangleAlert } from 'lucide-react';
import { buttonClass } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesToolConversion } from '@/i18n/pagesToolConversion';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesToolConversion);

interface LeadView {
  tool: string;
  email: string;
  followUpConsent: boolean;
  confirmed: boolean;
  unsubscribed: boolean;
}

type State =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'message'; text: string; ok: boolean }
  | { kind: 'unsubscribe'; lead: LeadView };

/**
 * /result-email?token=…&action=confirm|unsubscribe — the links of the "e-mail me my result" e-mails
 * (server lib/toolLeads). Confirm runs at once (double opt-in); unsubscribe asks first (mail scanners open links).
 */
export default function ResultEmailManage() {
  const { t } = useTranslation();
  usePageTitle(t('toolConv.manage.title'));
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const action = params.get('action') === 'unsubscribe' ? 'unsubscribe' : 'confirm';
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState({ kind: 'invalid' });
      return;
    }
    void (async () => {
      try {
        if (action === 'confirm') {
          const { data } = await api.post<{ status: 'ok' | 'expired' | 'not-requested' | 'unsubscribed' }>('/tools/result-email/confirm', { token });
          const key = { ok: 'confirmed', expired: 'expired', 'not-requested': 'notRequested', unsubscribed: 'unsubscribedAlready' }[data.status];
          setState({ kind: 'message', text: t(`toolConv.manage.${key}`), ok: data.status === 'ok' });
        } else {
          const { data } = await api.get<{ lead: LeadView }>('/tools/result-email/manage', { params: { token } });
          setState(data.lead.unsubscribed ? { kind: 'message', text: t('toolConv.manage.unsubscribedAlready'), ok: true } : { kind: 'unsubscribe', lead: data.lead });
        }
      } catch {
        setState({ kind: 'invalid' });
      }
    })();
  }, [token, action, t]);

  const unsubscribe = async () => {
    setBusy(true);
    try {
      await api.post('/tools/result-email/unsubscribe', { token });
      setState({ kind: 'message', text: t('toolConv.manage.unsubscribed'), ok: true });
    } catch {
      setState({ kind: 'invalid' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <div className="container-x max-w-xl">
        <div className="card card-pad rounded-3xl text-center" aria-live="polite">
          <h1 className="font-display text-2xl font-semibold text-ink">{state.kind === 'unsubscribe' ? t('toolConv.manage.unsubscribeTitle') : t('toolConv.manage.title')}</h1>
          {state.kind === 'loading' && (
            <p className="mt-6 flex items-center justify-center gap-2 text-muted">
              <Spinner /> {t('toolConv.manage.loading')}
            </p>
          )}
          {state.kind === 'invalid' && (
            <p className="mt-6 flex items-center justify-center gap-2 text-danger-fg" role="alert">
              <TriangleAlert className="size-5" aria-hidden /> {t('toolConv.manage.invalid')}
            </p>
          )}
          {state.kind === 'message' && (
            <p className="mt-6 flex items-center justify-center gap-2 text-ink">
              {state.ok ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden /> : <TriangleAlert className="size-5 shrink-0 text-warning-fg" aria-hidden />} {state.text}
            </p>
          )}
          {state.kind === 'unsubscribe' && (
            <>
              <p className="mt-4 text-muted">{t('toolConv.manage.unsubscribeText', { email: state.lead.email })}</p>
              <button type="button" onClick={unsubscribe} disabled={busy} className={buttonClass({ variant: 'danger', className: 'mt-6' })}>
                <MailX className="size-4" aria-hidden /> {t('toolConv.manage.unsubscribeBtn')}
              </button>
            </>
          )}
          <p className="mt-8">
            <Link to="/tools" className="text-sm font-semibold text-link hover:underline">
              {t('toolConv.manage.backTools')}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
