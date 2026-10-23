import { useEffect, useId, useState, type ClipboardEvent, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import clsx from 'clsx';
import { MailCheck, RotateCw } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { securityOf, useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesLegal } from '@/i18n/pagesLegal';

registerCopy(pagesLegal);

interface TwoFactorStatus {
  enabled: boolean;
  emailOtpEnabled: boolean;
  emailOtpEnabledAt: string | null;
  emailOtpAvailable: boolean;
}

export const TWO_FACTOR_STATUS_KEY = ['2fa-status'];

type Step = 'idle' | 'password' | 'code' | 'disable';

const retryAfterOf = (err: unknown) => {
  const v = err instanceof AxiosError ? (err.response?.data as { retryAfter?: unknown } | undefined)?.retryAfter : undefined;
  return typeof v === 'number' && v > 0 ? v : 0;
};

/**
 * "Two-step login by email" (candidates and employers): password → code from the email → on.
 * Turning it off needs the password. Staff never see this card (their factor is the authenticator app).
 */
export const EmailOtpCard = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const { date } = useL10n();
  const qc = useQueryClient();
  const uid = useId();
  const k = (key: string, opts?: Record<string, unknown>) => t(`emailOtp.${key}`, opts);
  const { data: status } = useQuery({
    queryKey: TWO_FACTOR_STATUS_KEY,
    queryFn: async () => (await api.get<TwoFactorStatus>('/auth/2fa/status')).data,
  });
  const [step, setStep] = useState<Step>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [masked, setMasked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [resendIn]);

  if (!user || !status?.emailOtpAvailable) return null;
  const on = status.emailOtpEnabled;
  const verified = securityOf(user).emailVerified !== false;

  const reset = () => {
    setStep('idle');
    setPassword('');
    setCode('');
    setMasked(null);
  };

  const fail = (err: unknown) => {
    const wait = retryAfterOf(err);
    if (wait) setResendIn(wait);
    const code = errorCode(err);
    const key = code === 'INVALID_CODE' ? 'twoFactorLogin.emailInvalid' : `auth.errors.${code}`;
    const msg = t(key);
    toast.error(msg === key ? t('common.error') : msg);
  };

  const refresh = async (emailOtpEnabled: boolean) => {
    setUser({ ...user, emailOtpEnabled } as typeof user);
    await qc.invalidateQueries({ queryKey: TWO_FACTOR_STATUS_KEY });
  };

  const start = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!password) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ email: string; retryAfter: number }>('/auth/2fa/email/start', { password });
      setMasked(data.email);
      setResendIn(data.retryAfter);
      setStep('code');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    const clean = code.replace(/\D/g, '');
    if (clean.length !== 6) return;
    setBusy(true);
    try {
      await api.post('/auth/2fa/email/enable', { code: clean });
      toast.success(k('enabledToast'));
      reset();
      await refresh(true);
    } catch (err) {
      setCode('');
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const disable = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    try {
      await api.post('/auth/2fa/email/disable', { password });
      toast.success(k('disabledToast'));
      reset();
      await refresh(false);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '');
    if (digits.length >= 6) {
      e.preventDefault();
      setCode(digits.slice(-6));
    }
  };

  const passwordField = (
    <div>
      <label className="label" htmlFor={`${uid}-pw`}>
        {k('password')}
      </label>
      <input
        id={`${uid}-pw`}
        type="password"
        className="input"
        autoComplete="current-password"
        maxLength={128}
        required
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
    </div>
  );

  const actions = (submitLabel: string, danger = false) => (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" className="btn min-h-11 border border-line text-navy-900 hover:bg-surface" onClick={reset} disabled={busy}>
        {k('cancel')}
      </button>
      <button type="submit" className={clsx('min-h-11', danger ? 'btn border border-red-200 text-danger hover:bg-red-50' : 'btn-primary')} disabled={busy}>
        {busy && <Spinner className="size-4" />} {submitLabel}
      </button>
    </div>
  );

  return (
    <section className={clsx('card card-pad', className)} aria-labelledby={`${uid}-title`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={`${uid}-title`} className="flex items-center gap-2.5 text-lg font-bold text-navy-900">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <MailCheck className="size-4.5" aria-hidden />
          </span>
          {k('title')}
        </h2>
        <span className={clsx('badge', on ? 'bg-success-bg text-success-fg' : 'bg-neutral-bg text-neutral-fg')}>
          {on ? k('statusOn') : k('statusOff')}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{k('text', { email: user.email })}</p>
      {on && status.emailOtpEnabledAt && <p className="mt-1 text-xs text-muted">{k('enabledSince', { date: date(status.emailOtpEnabledAt) })}</p>}
      {status.enabled && <p className="mt-2 text-xs text-muted">{k('totpNote')}</p>}

      <div className="mt-5">
        {step === 'idle' &&
          (on ? (
            <button type="button" className="btn min-h-11 border border-line text-navy-900 hover:bg-surface" onClick={() => setStep('disable')}>
              {k('disable')}
            </button>
          ) : verified ? (
            <button type="button" className="btn-primary min-h-11" onClick={() => setStep('password')}>
              {k('enable')}
            </button>
          ) : (
            <p className="text-sm text-muted">{k('verifyFirst')}</p>
          ))}

        {step === 'password' && (
          <form onSubmit={start} className="space-y-4">
            <p className="text-sm text-muted">{k('startHint')}</p>
            {passwordField}
            {actions(k('sendCode'))}
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={confirm} className="space-y-4">
            <p className="text-sm text-muted" role="status">
              {k('codeSent', { email: masked ?? '' })}
            </p>
            <div>
              <label className="label" htmlFor={`${uid}-code`}>
                {k('codeLabel')}
              </label>
              <input
                id={`${uid}-code`}
                name="one-time-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={7}
                required
                autoFocus
                className="input max-w-56 text-center font-mono text-xl tracking-[0.35em] tabular-nums"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
                onPaste={onPaste}
                placeholder="000000"
              />
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline disabled:opacity-60"
              disabled={busy || resendIn > 0 || !password}
              onClick={() => void start()}
            >
              <RotateCw className="size-4" aria-hidden />
              {resendIn > 0 ? k('resendIn', { seconds: resendIn }) : k('resend')}
            </button>
            {actions(k('confirm'))}
          </form>
        )}

        {step === 'disable' && (
          <form onSubmit={disable} className="space-y-4">
            <p className="text-sm text-muted">{k('disableText')}</p>
            {passwordField}
            {actions(k('disable'), true)}
          </form>
        )}
      </div>
    </section>
  );
};
