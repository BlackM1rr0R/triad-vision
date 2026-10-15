import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, MailCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { ResendVerificationButton } from '@/components/auth/VerifyBanner';
import { registerCopy } from '@/i18n';
import { pagesLegal } from '@/i18n/pagesLegal';
import { AuthShell } from './AuthShell';

registerCopy(pagesLegal);

type State = 'verifying' | 'ok' | 'failed' | 'missing';

// The token is single-use: React StrictMode runs effects twice in development, so the request is
// shared per token instead of being sent again.
const pending = new Map<string, Promise<boolean>>();
const verifyOnce = (token: string) => {
  let p = pending.get(token);
  if (!p) {
    p = api.post('/auth/verify-email', { token }).then(
      () => true,
      () => false,
    );
    pending.set(token, p);
  }
  return p;
};

/** Target of the link in the verification email: /verify-email?token=… */
export default function VerifyEmail() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const valid = /^[a-f0-9]{64}$/.test(token);
  const [state, setState] = useState<State>(valid ? 'verifying' : 'missing');
  const { user } = useAuth();
  const qc = useQueryClient();
  usePageTitle(t('verifyEmail.title'));

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    void verifyOnce(token).then((ok) => {
      if (!alive) return;
      setState(ok ? 'ok' : 'failed');
      // The account (if logged in here) now reports emailVerified: true.
      if (ok) void qc.invalidateQueries({ queryKey: ['me'] });
    });
    return () => {
      alive = false;
    };
  }, [token, valid, qc]);

  const home = user ? (user.role === 'COMPANY' ? '/company' : '/account') : '/login';

  return (
    <AuthShell title={t('verifyEmail.title')}>
      <div className="text-center" role="status" aria-live="polite">
        {state === 'verifying' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Spinner className="size-8 text-brand-600" />
            <p className="text-muted">{t('verifyEmail.verifying')}</p>
          </div>
        )}
        {state === 'ok' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="grid size-16 place-items-center rounded-full bg-success/10 text-success">
              <CircleCheck className="size-8" aria-hidden />
            </span>
            <h2 className="font-display text-xl font-bold text-navy-900">{t('verifyEmail.successTitle')}</h2>
            <p className="max-w-sm text-muted">{t('verifyEmail.successText')}</p>
            <Link to={home} className="btn-primary mt-3">
              <MailCheck className="size-4" aria-hidden /> {user ? t('verifyEmail.toAccount') : t('verifyEmail.toLogin')}
            </Link>
          </div>
        )}
        {(state === 'failed' || state === 'missing') && (
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="grid size-16 place-items-center rounded-full bg-danger/10 text-danger">
              <CircleAlert className="size-8" aria-hidden />
            </span>
            <h2 className="font-display text-xl font-bold text-navy-900">{t('verifyEmail.failedTitle')}</h2>
            <p className="max-w-sm text-muted">{state === 'missing' ? t('verifyEmail.missingToken') : t('verifyEmail.failedText')}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {user ? (
                <ResendVerificationButton className="btn-primary" label={t('verifyEmail.resend')} />
              ) : (
                <Link to="/login" state={{ from: '/account' }} className="btn-primary">
                  {t('verifyEmail.toLogin')}
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
