import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { landingAfterLogin, useAuth } from '@/lib/auth';
import type { User } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { Lost, Success } from '@/components/illustrations';
import { registerCopy } from '@/i18n';
import { pagesPortalExtras } from '@/i18n/pagesPortalExtras';
import { AuthShell } from './AuthShell';

registerCopy(pagesPortalExtras);

type State = { kind: 'working' } | { kind: 'ok'; email: string } | { kind: 'failed'; taken: boolean };

// Single-use token: StrictMode runs effects twice in development, so the request is shared per token.
const pending = new Map<string, Promise<{ email: string; user: User | null } | { error: string }>>();
const confirmOnce = (token: string) => {
  let p = pending.get(token);
  if (!p) {
    p = api.post<{ email: string; user: User | null }>('/auth/email-change/confirm', { token }).then(
      (r) => r.data,
      (err) => ({ error: errorCode(err) ?? 'ERROR' }),
    );
    pending.set(token, p);
  }
  return p;
};

/** Target of the link mailed to the NEW address: /confirm-email-change?token=… (server: lib/emailChange.ts). */
export default function ConfirmEmailChange() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const valid = /^[a-f0-9]{64}$/.test(token);
  const [state, setState] = useState<State>(valid ? { kind: 'working' } : { kind: 'failed', taken: false });
  const { user, setUser } = useAuth();
  const qc = useQueryClient();
  usePageTitle(t('px.email.confirm.title'));

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    void confirmOnce(token).then((r) => {
      if (!alive) return;
      if ('error' in r) {
        setState({ kind: 'failed', taken: r.error === 'EMAIL_TAKEN' });
        return;
      }
      setState({ kind: 'ok', email: r.email });
      // The same account confirmed in this browser: it stays signed in with the new address.
      if (r.user) setUser(r.user);
      else void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['email-change'] });
    });
    return () => {
      alive = false;
    };
  }, [token, valid, qc, setUser]);

  const home = user ? landingAfterLogin(user.role) : '/login';

  return (
    <AuthShell title={t('px.email.confirm.title')}>
      <div className="text-center" role="status" aria-live="polite">
        {state.kind === 'working' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Spinner className="size-8 text-primary" />
            <p className="text-muted">{t('px.email.confirm.working')}</p>
          </div>
        )}
        {state.kind === 'ok' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Success className="w-36" />
            <h2 className="mt-2 font-display text-xl font-semibold text-ink">{t('px.email.confirm.done')}</h2>
            <p className="max-w-sm break-words text-muted">{t('px.email.confirm.doneText', { email: state.email })}</p>
            <Link to={home} className="btn-primary btn-lg mt-3">
              <MailCheck className="size-4" aria-hidden /> {user ? t('px.email.confirm.toHome') : t('px.email.confirm.toLogin')}
            </Link>
          </div>
        )}
        {state.kind === 'failed' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Lost className="w-40" />
            <p className="max-w-sm text-muted">{state.taken ? t('px.email.confirm.taken') : t('px.email.confirm.invalid')}</p>
            <Link to={home} className="btn-primary mt-3">
              {user ? t('px.email.confirm.toHome') : t('px.email.confirm.toLogin')}
            </Link>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
