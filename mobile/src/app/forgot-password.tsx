import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { MailCheck, Send } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, Field, Text } from '@/components/ui';
import { AuthShell, LinkText } from '@/features/auth/AuthShell';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useErrorMessage } from '@/lib/queries';
import { colors } from '@/theme';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('m.errors.INVALID_EMAIL'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      haptic.success();
      setSent(true);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('auth.forgotTitle')} subtitle={sent ? undefined : t('auth.forgotText')}>
      {sent ? (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <MailCheck size={44} color={colors.success} />
          <Text center>{t('auth.forgotSent')}</Text>
          <Text variant="small" center>
            {t('m.auth.resetInfo')}
          </Text>
          <Button title={t('m.auth.backToLogin')} onPress={() => router.replace('/login')} full />
        </View>
      ) : (
        <>
          <Field
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            onSubmitEditing={submit}
            returnKeyType="send"
            error={error}
          />
          <Button title={t('auth.sendLink')} icon={Send} loading={busy} onPress={submit} full size="lg" />
          <LinkText action={t('m.auth.backToLogin')} onPress={() => router.replace('/login')} />
        </>
      )}
    </AuthShell>
  );
}
