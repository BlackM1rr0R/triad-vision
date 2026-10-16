import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AxiosError } from 'axios';
import { KeyRound, Mail, RotateCw, ShieldCheck, Smartphone } from 'lucide-react';
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

type Mode = 'code' | 'email' | 'recovery';

interface LoginState {
  challenge?: unknown;
  from?: unknown;
  method?: unknown;
  alternatives?: unknown;
  email?: unknown;
  emailSent?: unknown;
  retryAfter?: unknown;
}

/** Seconds left until "Resend code" is available again; ticks down once per second. */
const useCountdown = (initial: number) => {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return;
    const id = window.setTimeout(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [left]);
  return [left, setLeft] as const;
};

const retryAfterOf = (err: unknown) => {
  const v = err instanceof AxiosError ? (err.response?.data as { retryAfter?: unknown } | undefined)?.retryAfter : undefined;
  return typeof v === 'number' && v > 0 ? v : 0;
};

/** Second login step for accounts with two-factor authentication (reached from /login). */
export default function TwoFactor() {
  const { t } = useTranslation();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LoginState | null;
  const challenge = typeof state?.challenge === 'string' ? state.challenge : null;
  const primary: Mode = state?.method === 'email' ? 'email' : 'code';
  const alternatives = Array.isArray(state?.alternatives) ? (state.alternatives as unknown[]) : ['recovery'];
  const canEmail = primary === 'email' || alternatives.includes('email');
  const canRecovery = alternatives.includes('recovery');
  const [mode, setMode] = useState<Mode>(primary);
  const [maskedEmail, setMaskedEmail] = useState(typeof state?.email === 'string' ? state.email : null);
  const [notSent, setNotSent] = useState(primary === 'email' && state?.emailSent === false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [resendIn, setResendIn] = useCountdown(primary === 'email' && typeof state?.retryAfter === 'number' ? state.retryAfter : 0);
  usePageTitle(t('twoFactorLogin.title'));

  if (!challenge) return <Navigate to="/login" replace />;

  const backToLogin = (message?: string) => {
    if (message) toast.error(message);
    navigate('/login', { replace: true, state: { from: state?.from } });
  };

  /** Mails a (new) code for this challenge. Returns true when the user can now type an emailed code. */
  const sendCode = async (): Promise<boolean> => {
    setSending(true);
    try {
      const { data } = await api.post<{ ok: true; email: string; retryAfter: number }>('/auth/2fa/email/send', { challenge });
      setMaskedEmail(data.email);
      setResendIn(data.retryAfter);
      setNotSent(false);
      setAttemptsLeft(null);
      toast.success(t('twoFactorLogin.resent'));
      return true;
    } catch (err) {
      const code = errorCode(err);
      if (code === 'TWO_FACTOR_CHALLENGE_INVALID' || code === 'ACCOUNT_LOCKED') {
        backToLogin(code === 'ACCOUNT_LOCKED' ? authError(t, code) : t('twoFactorLogin.expired'));
        return false;
      }
      const wait = retryAfterOf(err);
      if (wait) setResendIn(wait);
      toast.error(authError(t, code));
      // "Too soon" means a code was mailed a moment ago: it can still be typed in.
      return code === 'EMAIL_OTP_TOO_SOON';
    } finally {
      setSending(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = mode === 'recovery' ? value.trim() : value.replace(/\D/g, '');
    if (mode !== 'recovery' && clean.length !== 6) return;
    if (mode === 'recovery' && clean.length < 8) return;
    setBusy(true);
    try {
      const body =
        mode === 'code' ? { challenge, code: clean } : mode === 'email' ? { challenge, emailCode: clean } : { challenge, recoveryCode: clean };
      const { data } = await api.post<{ user: User; session: SessionInfo }>('/auth/2fa/verify', body);
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
      if (left === 0 && code !== 'CODE_EXPIRED') {
        backToLogin(t('twoFactorLogin.expired'));
        return;
      }
      toast.error(mode === 'email' && code === 'INVALID_CODE' ? t('twoFactorLogin.emailInvalid') : authError(t, code));
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  const switchTo = async (next: Mode) => {
    if (next === 'email' && primary !== 'email' && !(await sendCode())) return;
    setMode(next);
    setValue('');
    setAttemptsLeft(null);
  };

  /** Accepts "123 456", "123-456" or the whole email line pasted into the box. */
  const onPasteDigits = (e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '');
    if (digits.length >= 6) {
      e.preventDefault();
      setValue(digits.slice(-6));
    }
  };

  const subtitle =
    mode === 'recovery'
      ? t('twoFactorLogin.recoveryHint')
      : mode === 'email'
        ? maskedEmail
          ? t('twoFactorLogin.emailSubtitle', { email: maskedEmail })
          : t('twoFactorLogin.emailSubtitleGeneric')
        : t('twoFactorLogin.subtitle');

  const linkClass = 'inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline disabled:opacity-60';

  return (
    <AuthShell title={t('twoFactorLogin.title')} subtitle={subtitle}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="tf-code">
            {mode === 'code' ? t('twoFactorLogin.codeLabel') : mode === 'email' ? t('twoFactorLogin.emailCodeLabel') : t('twoFactorLogin.recoveryLabel')}
          </label>
          {mode !== 'recovery' ? (
            <input
              id="tf-code"
              key={mode}
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
              onPaste={onPasteDigits}
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
          {mode === 'email' && notSent && (
            <p className="mt-1.5 text-xs text-muted" role="status">
              {t('twoFactorLogin.emailNotSent')}
            </p>
          )}
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner className="size-4" /> : <ShieldCheck className="size-4" />} {t('twoFactorLogin.submit')}
        </button>
      </form>
      {mode === 'email' && (
        <div className="mt-4 text-center text-sm">
          <button type="button" onClick={() => void sendCode()} disabled={sending || resendIn > 0} className={linkClass} aria-live="polite">
            {sending ? <Spinner className="size-4" /> : <RotateCw className="size-4" aria-hidden />}
            {sending ? t('twoFactorLogin.sending') : resendIn > 0 ? t('twoFactorLogin.resendIn', { seconds: resendIn }) : t('twoFactorLogin.resend')}
          </button>
          <p className="mt-2 text-xs text-muted">{t('twoFactorLogin.emailSpamHint')}</p>
        </div>
      )}
      <div className="mt-6 flex flex-col items-center gap-3 text-sm">
        {mode !== 'email' && canEmail && (
          <button type="button" onClick={() => void switchTo('email')} disabled={sending} className={linkClass}>
            {sending ? <Spinner className="size-4" /> : <Mail className="size-4" aria-hidden />} {t('twoFactorLogin.useEmail')}
          </button>
        )}
        {mode !== 'code' && primary === 'code' && (
          <button type="button" onClick={() => void switchTo('code')} className={linkClass}>
            <Smartphone className="size-4" aria-hidden /> {t('twoFactorLogin.useApp')}
          </button>
        )}
        {mode !== 'recovery' && canRecovery && (
          <button type="button" onClick={() => void switchTo('recovery')} className={linkClass}>
            <KeyRound className="size-4" aria-hidden /> {t('twoFactorLogin.useRecovery')}
          </button>
        )}
        <Link to="/login" replace className="text-muted hover:text-navy-900 hover:underline">
          {t('twoFactorLogin.back')}
        </Link>
      </div>
    </AuthShell>
  );
}
