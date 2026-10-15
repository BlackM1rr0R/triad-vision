import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { UserPlus } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, Field, Text, useToast } from '@/components/ui';
import { AuthShell, LinkText } from '@/features/auth/AuthShell';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { useErrorMessage } from '@/lib/queries';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const message = useErrorMessage();
  const toast = useToast();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form | 'form', string>>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const next: typeof errors = {};
    if (!form.firstName.trim()) next.firstName = t('m.errors.REQUIRED_FIELDS');
    if (!form.lastName.trim()) next.lastName = t('m.errors.REQUIRED_FIELDS');
    if (!EMAIL.test(form.email.trim())) next.email = t('m.errors.INVALID_EMAIL');
    if (form.password.length < 8) next.password = t('m.errors.PASSWORD_SHORT');
    setErrors(next);
    if (Object.keys(next).length) {
      haptic.warning();
      return;
    }
    setBusy(true);
    try {
      const user = await register(form);
      haptic.success();
      // New accounts must confirm their email before starting a visa application.
      if ((user as { emailVerified?: boolean }).emailVerified === false) toast(t('m.verify.checkInbox', { email: user.email }), 'info', 8000);
      router.replace('/');
    } catch (err) {
      haptic.error();
      setErrors({ form: message(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label={t('auth.firstName')} value={form.firstName} onChangeText={set('firstName')} autoComplete="given-name" textContentType="givenName" error={errors.firstName} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('auth.lastName')} value={form.lastName} onChangeText={set('lastName')} autoComplete="family-name" textContentType="familyName" error={errors.lastName} />
        </View>
      </View>
      <Field
        label={t('auth.email')}
        value={form.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        error={errors.email}
      />
      <Field label={`${t('auth.phone')} (${t('m.common.optional')})`} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
      <Field
        label={t('auth.password')}
        value={form.password}
        onChangeText={set('password')}
        password
        autoComplete="new-password"
        textContentType="newPassword"
        hint={t('auth.passwordHint')}
        error={errors.password}
      />
      {errors.form ? (
        <Text variant="small" color="#d92d3a">
          {errors.form}
        </Text>
      ) : null}
      <Button title={t('auth.register')} icon={UserPlus} loading={busy} onPress={submit} full size="lg" />
      <Text variant="caption" center>
        {t('auth.terms')}
      </Text>
      <LinkText label={t('auth.haveAccount')} action={t('auth.login')} onPress={() => router.replace('/login')} />
    </AuthShell>
  );
}
