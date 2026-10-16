import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { UserPlus } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, Field, Muted, Text, useToast } from '@/components/ui';
import { AuthShell, LinkText } from '@/features/auth/AuthShell';
import { FilledTag, PassportScanCard, type PassportScanFields } from '@/features/auth/PassportScanCard';
import { DateTimeField } from '@/features/staff/DateTimeField';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { useErrorMessage } from '@/lib/queries';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Same limits as the API (POST /api/auth/register): age 16–80. */
const MIN_AGE = 16;
const MAX_AGE = 80;

/** "+994 50 123-45-67" → "+994501234567"; valid when "+" and 8–15 digits remain. */
const compactPhone = (v: string) => v.trim().replace(/[\s\-.()]/g, '');
const phoneValid = (v: string) => /^\+\d{8,15}$/.test(compactPhone(v));

/** "c 0123-4567" → "C01234567"; valid when 5–20 letters/digits remain (same rule as the API). */
const compactPassport = (v: string) => v.replace(/[\s-]/g, '').toUpperCase();
const passportValid = (v: string) => /^[A-Z0-9]{5,20}$/.test(compactPassport(v));

const pad = (n: number) => String(n).padStart(2, '0');
/** The picker returns a local Date; the API wants the calendar day as YYYY-MM-DD. */
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Latest / earliest birth dates for the picker (local calendar days). */
const birthBounds = () => {
  const now = new Date();
  const max = new Date(now.getFullYear() - MIN_AGE, now.getMonth(), now.getDate());
  const min = new Date(now.getFullYear() - MAX_AGE - 1, now.getMonth(), now.getDate() + 1);
  return { min, max };
};

type FormKey = 'firstName' | 'lastName' | 'passportNumber' | 'email' | 'phone' | 'password';

/** Agent referral codes: letters, digits and dashes, upper case (same rule as the API). */
const normaliseRef = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);

export default function Register() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const message = useErrorMessage();
  const toast = useToast();
  const bounds = useMemo(birthBounds, []);
  const [form, setForm] = useState<Record<FormKey, string>>({ firstName: '', lastName: '', passportNumber: '', email: '', phone: '', password: '' });
  const [birth, setBirth] = useState<Date | null>(null);
  const [errors, setErrors] = useState<Partial<Record<FormKey | 'birthDate' | 'form', string>>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: FormKey) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const params = useLocalSearchParams<{ ref?: string }>();
  const refCode = normaliseRef(params.ref);
  /** Values the passport scan filled in (a field keeps its badge while it still holds that value). */
  const [scanned, setScanned] = useState<{ firstName?: string; lastName?: string; passportNumber?: string; birthDate?: string } | null>(null);

  const fillFromPassport = (p: PassportScanFields) => {
    const values: NonNullable<typeof scanned> = {};
    if (p.firstName) values.firstName = p.firstName;
    if (p.lastName) values.lastName = p.lastName;
    if (p.passportNumber) values.passportNumber = p.passportNumber;
    setForm((f) => ({ ...f, firstName: values.firstName ?? f.firstName, lastName: values.lastName ?? f.lastName, passportNumber: values.passportNumber ?? f.passportNumber }));
    if (p.birthDate) {
      const [y, m, d] = p.birthDate.split('-').map(Number);
      setBirth(new Date(y, m - 1, d));
      values.birthDate = p.birthDate;
    }
    setErrors((e) => ({ ...e, firstName: undefined, lastName: undefined, passportNumber: undefined, birthDate: undefined }));
    setScanned(values);
  };
  const tag = (k: FormKey) => (scanned && scanned[k as keyof typeof scanned] && scanned[k as keyof typeof scanned] === form[k] ? <FilledTag label={t('m.register.scan.filledTag')} /> : null);
  const birthTag = scanned?.birthDate && birth && ymd(birth) === scanned.birthDate ? <FilledTag label={t('m.register.scan.filledTag')} /> : null;

  const submit = async () => {
    const next: typeof errors = {};
    if (!form.firstName.trim()) next.firstName = t('m.errors.REQUIRED_FIELDS');
    if (!form.lastName.trim()) next.lastName = t('m.errors.REQUIRED_FIELDS');
    if (!birth) next.birthDate = t('m.register.errors.birthRequired');
    else if (ymd(birth) > ymd(bounds.max) || ymd(birth) < ymd(bounds.min)) next.birthDate = t('m.register.errors.birthAge');
    if (!passportValid(form.passportNumber)) next.passportNumber = form.passportNumber.trim() ? t('m.register.errors.passport') : t('m.errors.REQUIRED_FIELDS');
    if (!EMAIL.test(form.email.trim())) next.email = t('m.errors.INVALID_EMAIL');
    if (!phoneValid(form.phone)) next.phone = t('m.register.errors.phone');
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) next.password = t('auth.errors.PASSWORD_TOO_WEAK');
    setErrors(next);
    if (Object.keys(next).length || !birth) {
      haptic.warning();
      return;
    }
    setBusy(true);
    try {
      const user = await register({
        ...form,
        phone: compactPhone(form.phone),
        passportNumber: compactPassport(form.passportNumber),
        birthDate: ymd(birth),
        ...(refCode ? { ref: refCode } : {}),
        ...(scanned && Object.keys(scanned).length ? { passportScanned: true } : {}),
      });
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
      <Muted style={{ marginBottom: 12 }}>
        {t('m.register.notice')}
      </Muted>
      {refCode ? (
        <Text variant="caption" style={{ marginBottom: 8 }}>
          {t('m.register.scan.agentCode', { code: refCode })}
        </Text>
      ) : null}
      <PassportScanCard onFilled={fillFromPassport} />
      <Field
        label={t('auth.firstName')}
        value={form.firstName}
        onChangeText={set('firstName')}
        autoComplete="given-name"
        textContentType="givenName"
        hint={t('m.register.passportHint')}
        error={errors.firstName}
      />
      {tag('firstName')}
      <Field
        label={t('auth.lastName')}
        value={form.lastName}
        onChangeText={set('lastName')}
        autoComplete="family-name"
        textContentType="familyName"
        hint={t('m.register.passportHint')}
        error={errors.lastName}
      />
      {tag('lastName')}
      <View style={{ flexDirection: 'row' }}>
        <DateTimeField
          label={t('m.register.birthDate')}
          mode="date"
          value={birth}
          onChange={(d) => {
            setBirth(d);
            setErrors((e) => ({ ...e, birthDate: undefined }));
          }}
          minimumDate={bounds.min}
          maximumDate={bounds.max}
          placeholder={t('m.register.birthPlaceholder')}
          hint={t('m.register.birthHint')}
          error={errors.birthDate}
        />
      </View>
      {birthTag}
      <Field
        label={t('m.register.passportNumber')}
        value={form.passportNumber}
        onChangeText={(v) => set('passportNumber')(v.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        placeholder="C01234567"
        hint={t('m.register.passportNumberHint')}
        error={errors.passportNumber}
      />
      {tag('passportNumber')}
      <Field
        label={t('auth.email')}
        value={form.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        hint={t('m.register.emailHint')}
        error={errors.email}
      />
      <Field
        label={t('m.register.phone')}
        value={form.phone}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        placeholder="+994 50 123 45 67"
        hint={t('m.register.phoneHint')}
        error={errors.phone}
      />
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
