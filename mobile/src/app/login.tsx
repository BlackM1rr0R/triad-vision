import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { router } from 'expo-router';
import { LogIn } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, Field, Text } from '@/components/ui';
import { AuthShell, LinkText } from '@/features/auth/AuthShell';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { useErrorMessage } from '@/lib/queries';

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const message = useErrorMessage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError(t('m.errors.REQUIRED_FIELDS'));
      haptic.warning();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      if (!user) {
        // Account with two-factor authentication: second step on its own screen.
        router.push('/two-factor');
        return;
      }
      haptic.success();
      router.replace('/');
    } catch (err) {
      haptic.error();
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('m.auth.welcomeBack')} subtitle={t('auth.loginSubtitle')}>
      <Field
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Field
        ref={passwordRef}
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        password
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={error}
      />
      <LinkText action={t('auth.forgot')} onPress={() => router.push('/forgot-password')} />
      <Button title={t('auth.login')} icon={LogIn} loading={busy} onPress={submit} full size="lg" />
      <LinkText label={t('auth.noAccount')} action={t('auth.register')} onPress={() => router.replace('/register')} />
      <Text variant="caption" center>
        {t('m.auth.staffHint')}
      </Text>
    </AuthShell>
  );
}
