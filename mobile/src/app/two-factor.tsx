import { useEffect, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyRound, Mail, RotateCw, ShieldCheck } from '@/components/icons';
import { Button, Field } from '@/components/ui';
import { AuthShell, LinkText } from '@/features/auth/AuthShell';
import { useAuth, type TwoFactorInput } from '@/lib/auth';
import { errorCode } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { useErrorMessage } from '@/lib/queries';
import { registerLegalCopy } from '@/i18n/legal';

registerLegalCopy();

type Mode = 'code' | 'email' | 'recovery';

const retryAfterOf = (err: unknown) => {
  const v = (err as { response?: { data?: { retryAfter?: unknown } } })?.response?.data?.retryAfter;
  return typeof v === 'number' && v > 0 ? v : 0;
};

/** Second login step for accounts with two-factor authentication (pushed from /login). */
export default function TwoFactorScreen() {
  const { t } = useTranslation();
  const { status, twoFactorPending, twoFactor, verifyTwoFactor, sendTwoFactorEmail, cancelTwoFactor } = useAuth();
  const message = useErrorMessage();
  const primary: Mode = twoFactor?.method === 'email' ? 'email' : 'code';
  const alternatives = twoFactor?.alternatives ?? ['recovery'];
  const canEmail = primary === 'email' || alternatives.includes('email');
  const canRecovery = alternatives.includes('recovery');
  const [mode, setMode] = useState<Mode>(primary);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(twoFactor?.email ?? null);
  const [notSent, setNotSent] = useState(primary === 'email' && twoFactor?.emailSent === false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendIn, setResendIn] = useState(primary === 'email' ? (twoFactor?.retryAfter ?? 0) : 0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  if (status === 'authed') return <Redirect href="/" />;
  if (!twoFactorPending) return <Redirect href="/login" />;

  const backToLogin = () => {
    cancelTwoFactor();
    if (router.canGoBack()) router.back();
    else router.replace('/login');
  };

  /** Mails a (new) code. Resolves true when an emailed code can be typed in now. */
  const sendCode = async (): Promise<boolean> => {
    setSending(true);
    setError(null);
    try {
      const r = await sendTwoFactorEmail();
      setMaskedEmail(r.email);
      setResendIn(r.retryAfter);
      setNotSent(false);
      setAttemptsLeft(null);
      haptic.success();
      return true;
    } catch (err) {
      haptic.error();
      const code = errorCode(err);
      const wait = retryAfterOf(err);
      if (wait) setResendIn(wait);
      setError(message(err));
      if (code === 'TWO_FACTOR_CHALLENGE_INVALID' || code === 'ACCOUNT_LOCKED') setTimeout(backToLogin, 1800);
      // "Too soon": a code was mailed a moment ago and can still be used.
      return code === 'EMAIL_OTP_TOO_SOON';
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    const clean = mode === 'recovery' ? value.trim() : value.replace(/\D/g, '');
    if ((mode !== 'recovery' && clean.length !== 6) || (mode === 'recovery' && clean.length < 8)) {
      setError(mode === 'email' ? t('m.twoFactor.emailInvalid') : t('m.errors.INVALID_CODE'));
      haptic.warning();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input: TwoFactorInput = mode === 'code' ? { code: clean } : mode === 'email' ? { emailCode: clean } : { recoveryCode: clean };
      await verifyTwoFactor(input);
      haptic.success();
      router.replace('/');
    } catch (err) {
      haptic.error();
      const code = errorCode(err);
      const left = (err as { response?: { data?: { attemptsLeft?: unknown } } })?.response?.data?.attemptsLeft;
      setAttemptsLeft(typeof left === 'number' ? left : null);
      setError(mode === 'email' && code === 'INVALID_CODE' ? t('m.twoFactor.emailInvalid') : message(err));
      setValue('');
      // The challenge is gone (expired, used up or account locked): start over with the password.
      if (code === 'TWO_FACTOR_CHALLENGE_INVALID' || code === 'ACCOUNT_LOCKED' || (left === 0 && code !== 'CODE_EXPIRED')) {
        setTimeout(backToLogin, 1800);
      }
    } finally {
      setBusy(false);
    }
  };

  const switchTo = async (next: Mode) => {
    if (next === 'email' && primary !== 'email' && !(await sendCode())) return;
    setMode(next);
    setValue('');
    setError(null);
    setAttemptsLeft(null);
  };

  const numeric = mode !== 'recovery';
  const subtitle =
    mode === 'recovery'
      ? t('m.twoFactor.recoverySubtitle')
      : mode === 'email'
        ? maskedEmail
          ? t('m.twoFactor.emailSubtitle', { email: maskedEmail })
          : t('m.twoFactor.emailSubtitleGeneric')
        : t('m.twoFactor.subtitle');
  const hint =
    attemptsLeft !== null && attemptsLeft > 0
      ? t('m.twoFactor.attemptsLeft', { count: attemptsLeft })
      : mode === 'email' && notSent
        ? t('m.twoFactor.emailNotSent')
        : undefined;

  return (
    <AuthShell title={t('m.twoFactor.title')} subtitle={subtitle}>
      <Field
        key={mode}
        label={mode === 'code' ? t('m.twoFactor.code') : mode === 'email' ? t('m.twoFactor.emailCode') : t('m.twoFactor.recoveryCode')}
        value={value}
        // Pasting "123 456" or the whole line from the email keeps just the 6 digits.
        onChangeText={(v) => setValue(numeric ? v.replace(/[^\d]/g, '').slice(0, 6) : v)}
        keyboardType={numeric ? 'number-pad' : 'default'}
        autoComplete={numeric ? 'one-time-code' : 'off'}
        textContentType={numeric ? 'oneTimeCode' : 'none'}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        maxLength={40}
        returnKeyType="go"
        onSubmitEditing={submit}
        placeholder={numeric ? '000000' : 'xxxxx-xxxxx'}
        error={error}
        hint={hint}
      />
      <Button title={t('m.twoFactor.submit')} icon={ShieldCheck} loading={busy} onPress={submit} full size="lg" />
      {mode === 'email' && (
        <Button
          title={resendIn > 0 ? t('m.twoFactor.resendIn', { seconds: resendIn }) : t('m.twoFactor.resend')}
          icon={RotateCw}
          variant="ghost"
          loading={sending}
          disabled={resendIn > 0}
          onPress={() => void sendCode()}
          full
        />
      )}
      {mode !== 'email' && canEmail && (
        <Button title={t('m.twoFactor.useEmail')} icon={Mail} variant="ghost" loading={sending} onPress={() => void switchTo('email')} full />
      )}
      {mode !== 'code' && primary === 'code' && (
        <Button title={t('m.twoFactor.useCode')} icon={ShieldCheck} variant="ghost" onPress={() => void switchTo('code')} full />
      )}
      {mode !== 'recovery' && canRecovery && (
        <Button title={t('m.twoFactor.useRecovery')} icon={KeyRound} variant="ghost" onPress={() => void switchTo('recovery')} full />
      )}
      <LinkText action={t('m.twoFactor.back')} onPress={backToLogin} />
    </AuthShell>
  );
}
