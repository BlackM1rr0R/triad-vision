import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorCode } from '@/lib/api';
import { isTwoFactorChallenge, landingAfterLogin, useAuth, type TwoFactorChallenge } from '@/lib/auth';
import type { SessionInfo, User } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { AuthShell } from './AuthShell';
import { registerCopy } from '@/i18n';
import { pagesLegal } from '@/i18n/pagesLegal';
import { PasswordInput } from '@/components/ui/PasswordInput';

registerCopy(pagesLegal);

export const authError = (t: (k: string) => string, code: string) => {
  const key = `auth.errors.${code}`;
  const msg = t(key);
  return msg === key ? t('common.error') : msg;
};

export default function Login() {
  const { t } = useTranslation();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  usePageTitle(t('auth.loginTitle'));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const { data } = await api.post<{ user: User; session: SessionInfo } | TwoFactorChallenge>('/auth/login', {
        email: fd.get('email'),
        password: fd.get('password'),
      });
      const from = (location.state as { from?: unknown } | null)?.from;
      if (isTwoFactorChallenge(data)) {
        // Second step: the challenge lives only in router state (never stored), valid for 10 minutes.
        navigate('/login/2fa', {
          replace: true,
          state: {
            challenge: data.challenge,
            from,
            method: data.method ?? 'totp',
            alternatives: data.alternatives ?? ['recovery'],
            email: data.email,
            emailSent: data.emailSent,
            retryAfter: data.retryAfter,
          },
        });
        return;
      }
      setUser(data.user);
      navigate(landingAfterLogin(data.user.role, from), { replace: true });
    } catch (err) {
      toast.error(authError(t, errorCode(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">{t('auth.email')}</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">{t('auth.password')}</label>
            <Link to="/forgot-password" className="mb-1.5 text-xs font-semibold text-link hover:underline">
              {t('auth.forgot')}
            </Link>
          </div>
          <PasswordInput id="password" name="password" required autoComplete="current-password" className="input" />
        </div>
        <button type="submit" disabled={busy} className="btn-primary btn-lg w-full">
          {busy ? <Spinner className="size-4" /> : <LogIn className="size-4" />} {t('auth.login')}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {t('auth.noAccount')}{' '}
        <Link to="/register" state={location.state} className="font-semibold text-link hover:underline">
          {t('auth.register')}
        </Link>
      </p>
    </AuthShell>
  );
}
