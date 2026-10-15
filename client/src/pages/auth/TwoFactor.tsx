import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AxiosError } from 'axios';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorCode } from '@/lib/api';
import { landingAfterLogin, useAuth } from '@/lib/auth';
import type { SessionInfo, User } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesLegal } from '@/i18n/pagesLegal';
import { AuthShell } from './AuthShell';
import { authError } from './Login';

registerCopy(pagesLegal);

/** Second login step for accounts with two-factor authentication (reached from /login). */
export default function TwoFactor() {
  const { t } = useTranslation();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { challenge?: unknown; from?: unknown } | null;
  const challenge = typeof state?.challenge === 'string' ? state.challenge : null;
  const [mode, setMode] = useState<'code' | 'recovery'>('code');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  usePageTitle(t('twoFactorLogin.title'));

  if (!challenge) return <Navigate to="/login" replace />;

  const backToLogin = (message?: string) => {
    if (message) toast.error(message);
    navigate('/login', { replace: true, state: { from: state?.from } });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = mode === 'code' ? value.replace(/\D/g, '') : value.trim();
    if (mode === 'code' && clean.length !== 6) return;
    if (mode === 'recovery' && clean.length < 8) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ user: User; session: SessionInfo }>(
        '/auth/2fa/verify',
        mode === 'code' ? { challenge, code: clean } : { challenge, recoveryCode: clean },
      );
      setUser(data.user);
      navigate(landingAfterLogin(data.user.role, state?.from), { replace: true });
    } catch (err) {
      const code = errorCode(err);
      if (code === 'TWO_FACTOR_CHALLENGE_INVALID' || code === 'ACCOUNT_LOCKED') {
        backToLogin(code === 'ACCOUNT_LOCKED' ? authError(t, code) : t('twoFactorLogin.expired'));
        return;
      }
      const left = err instanceof AxiosError ? (err.response?.data as { attemptsLeft?: number } | undefined)?.attemptsLeft : undefined;
      setAttemptsLeft(typeof left === 'number' ? left : null);
      if (left === 0) {
        backToLogin(t('twoFactorLogin.expired'));
        return;
      }
      toast.error(authError(t, code));
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode((m) => (m === 'code' ? 'recovery' : 'code'));
    setValue('');
  };

  return (
    <AuthShell title={t('twoFactorLogin.title')} subtitle={mode === 'code' ? t('twoFactorLogin.subtitle') : t('twoFactorLogin.recoveryHint')}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="tf-code">
            {mode === 'code' ? t('twoFactorLogin.codeLabel') : t('twoFactorLogin.recoveryLabel')}
          </label>
          {mode === 'code' ? (
            <input
              id="tf-code"
              key="code"
              name="one-time-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              required
              autoFocus
              className="input text-center font-mono text-2xl tracking-[0.4em] tabular-nums"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d ]/g, ''))}
              placeholder="000000"
            />
          ) : (
            <input
              id="tf-code"
              key="recovery"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={40}
              required
              autoFocus
              className="input text-center font-mono text-lg tracking-widest"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="xxxxx-xxxxx"
            />
          )}
          {attemptsLeft !== null && attemptsLeft > 0 && (
            <p className="mt-1.5 text-xs font-semibold text-danger" role="status">
              {t('twoFactorLogin.attemptsLeft', { count: attemptsLeft })}
            </p>
          )}
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner className="size-4" /> : <ShieldCheck className="size-4" />} {t('twoFactorLogin.submit')}
        </button>
      </form>
      <div className="mt-6 flex flex-col items-center gap-3 text-sm">
        <button type="button" onClick={switchMode} className="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline">
          <KeyRound className="size-4" aria-hidden /> {mode === 'code' ? t('twoFactorLogin.useRecovery') : t('twoFactorLogin.useCode')}
        </button>
        <Link to="/login" replace className="text-muted hover:text-navy-900 hover:underline">
          {t('twoFactorLogin.back')}
        </Link>
      </div>
    </AuthShell>
  );
}
