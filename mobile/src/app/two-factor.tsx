import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyRound, ShieldCheck } from '@/components/icons';
import { Button, Field } from '@/components/ui';
import { AuthShell, LinkText } from '@/features/auth/AuthShell';
import { useAuth } from '@/lib/auth';
import { errorCode } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { useErrorMessage } from '@/lib/queries';
import { registerLegalCopy } from '@/i18n/legal';

registerLegalCopy();

/** Second login step for accounts with two-factor authentication (pushed from /login). */
export default function TwoFactorScreen() {
  const { t } = useTranslation();
  const { status, twoFactorPending, verifyTwoFactor, cancelTwoFactor } = useAuth();
  const message = useErrorMessage();
  const [mode, setMode] = useState<'code' | 'recovery'>('code');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authed') return <Redirect href="/" />;
  if (!twoFactorPending) return <Redirect href="/login" />;

  const backToLogin = () => {
    cancelTwoFactor();
    if (router.canGoBack()) router.back();
    else router.replace('/login');
  };

  const submit = async () => {
    const clean = mode === 'code' ? value.replace(/\D/g, '') : value.trim();
    if ((mode === 'code' && clean.length !== 6) || (mode === 'recovery' && clean.length < 8)) {
      setError(t('m.errors.INVALID_CODE'));
      haptic.warning();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyTwoFactor(mode === 'code' ? { code: clean } : { recoveryCode: clean });
      haptic.success();
      router.replace('/');
    } catch (err) {
      haptic.error();
      const code = errorCode(err);
      const left = (err as { response?: { data?: { attemptsLeft?: unknown } } })?.response?.data?.attemptsLeft;
      setAttemptsLeft(typeof left === 'number' ? left : null);
      setError(message(err));
      setValue('');
      // The challenge is gone (expired, used up or account locked): start over with the password.
      if (code === 'TWO_FACTOR_CHALLENGE_INVALID' || code === 'ACCOUNT_LOCKED' || left === 0) {
        setTimeout(backToLogin, 1800);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('m.twoFactor.title')} subtitle={mode === 'code' ? t('m.twoFactor.subtitle') : t('m.twoFactor.recoverySubtitle')}>
      <Field
        key={mode}
        label={mode === 'code' ? t('m.twoFactor.code') : t('m.twoFactor.recoveryCode')}
        value={value}
        onChangeText={(v) => setValue(mode === 'code' ? v.replace(/[^\d]/g, '').slice(0, 6) : v)}
        keyboardType={mode === 'code' ? 'number-pad' : 'default'}
        autoComplete={mode === 'code' ? 'one-time-code' : 'off'}
        textContentType={mode === 'code' ? 'oneTimeCode' : 'none'}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        maxLength={mode === 'code' ? 6 : 40}
        returnKeyType="go"
        onSubmitEditing={submit}
        placeholder={mode === 'code' ? '000000' : 'xxxxx-xxxxx'}
        error={error}
        hint={attemptsLeft !== null && attemptsLeft > 0 ? t('m.twoFactor.attemptsLeft', { count: attemptsLeft }) : undefined}
      />
      <Button title={t('m.twoFactor.submit')} icon={ShieldCheck} loading={busy} onPress={submit} full size="lg" />
      <Button
        title={mode === 'code' ? t('m.twoFactor.useRecovery') : t('m.twoFactor.useCode')}
        icon={KeyRound}
        variant="ghost"
        onPress={() => {
          setMode((m) => (m === 'code' ? 'recovery' : 'code'));
          setValue('');
          setError(null);
        }}
        full
      />
      <LinkText action={t('m.twoFactor.back')} onPress={backToLogin} />
    </AuthShell>
  );
}
