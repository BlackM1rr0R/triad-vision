import { useState } from 'react';
import { Alert, Linking, Switch, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CircleHelp, Globe, KeyRound, LogOut, MonitorSmartphone, Phone, Save } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, Card, Divider, Field, ListRow, NavyHeader, Pill, ScrollScreen, Section, Text, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { APP_VERSION, WEB_URL } from '@/lib/config';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import type { PushState } from '@/lib/push';
import { useErrorMessage } from '@/lib/queries';
import type { SessionListItem } from '@/types';
import { setAppLanguage } from '@/i18n';
import type { Lang } from '@/i18n/merge';
import { colors, space } from '@/theme';
import { LanguagePicker } from './LanguagePicker';

export const ProfileScreen = () => {
  const { t } = useTranslation();
  const { user, session, updateMe, logout, pushState, refreshPush, disablePush, isStaff } = useAuth();
  const toast = useToast();
  const message = useErrorMessage();
  const f = useFormat();
  const qc = useQueryClient();

  const [form, setForm] = useState({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', phone: user?.phone ?? '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [saving, setSaving] = useState<'profile' | 'password' | 'language' | 'push' | 'sessions' | null>(null);
  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: async () => (await api.get<{ sessions: SessionListItem[] }>('/auth/sessions')).data.sessions,
    enabled: !!user,
    staleTime: 60_000,
  });

  if (!user) return null;
  const dirty = form.firstName !== user.firstName || form.lastName !== user.lastName || (form.phone || '') !== (user.phone || '');

  const saveProfile = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast(t('m.errors.REQUIRED_FIELDS'), 'error');
      return;
    }
    setSaving('profile');
    try {
      await updateMe({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim() || null });
      toast(t('m.profile.saved'));
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setSaving(null);
    }
  };

  const savePassword = async () => {
    if (pw.next.length < 8) {
      toast(t('m.errors.PASSWORD_SHORT'), 'error');
      return;
    }
    setSaving('password');
    try {
      await updateMe({ currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: '', next: '' });
      toast(t('m.profile.passwordSaved'));
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setSaving(null);
    }
  };

  const changeLanguage = async (lng: Lang) => {
    setSaving('language');
    await setAppLanguage(lng);
    try {
      await updateMe({ locale: lng });
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setSaving(null);
    }
  };

  const confirmLogout = () => {
    haptic.warning();
    Alert.alert(t('m.profile.logout'), t('m.profile.logoutConfirm'), [
      { text: t('m.common.cancel'), style: 'cancel' },
      { text: t('m.profile.logout'), style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const PUSH_LABEL: Record<PushState, string> = {
    registered: 'm.profile.pushOn',
    'not-asked': 'm.profile.pushNotAsked',
    denied: 'm.profile.pushOff',
    error: 'm.profile.pushError',
    simulator: 'm.profile.pushSimulator',
    'unsupported-expo-go': 'm.profile.pushExpoGo',
    'no-project-id': 'm.profile.pushExpoGo',
  };
  const pushLabel = t(pushState ? PUSH_LABEL[pushState] : 'm.profile.pushNotAsked');
  const pushOn = pushState === 'registered';
  const pushPossible = pushState !== 'unsupported-expo-go' && pushState !== 'no-project-id' && pushState !== 'simulator';

  const togglePush = async (on: boolean) => {
    if (saving === 'push') return;
    if (!on) {
      Alert.alert(t('m.profile.push'), t('m.profile.pushDisable'), [
        { text: t('m.common.cancel'), style: 'cancel' },
        {
          text: t('m.common.confirm'),
          style: 'destructive',
          onPress: () => {
            setSaving('push');
            void disablePush().finally(() => setSaving(null));
          },
        },
      ]);
      return;
    }
    if (pushState === 'denied') {
      void Linking.openSettings();
      return;
    }
    setSaving('push');
    try {
      const next = await refreshPush();
      if (next === 'denied') void Linking.openSettings();
      else if (next === 'error') toast(t('m.profile.pushError'), 'error');
    } finally {
      setSaving(null);
    }
  };

  const logoutOthers = () => {
    haptic.warning();
    Alert.alert(t('m.profile.logoutOthers'), t('m.profile.logoutOthersConfirm'), [
      { text: t('m.common.cancel'), style: 'cancel' },
      {
        text: t('m.profile.logoutOthers'),
        style: 'destructive',
        onPress: async () => {
          setSaving('sessions');
          try {
            await api.delete('/auth/sessions');
            await qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
            toast(t('m.profile.logoutOthersDone'));
          } catch (err) {
            toast(message(err), 'error');
          } finally {
            setSaving(null);
          }
        },
      },
    ]);
  };

  const sessionCount = sessions.data?.length ?? 0;
  const expiresAt = session?.expiresAt ?? sessions.data?.find((s) => s.current)?.expiresAt;

  return (
    <ScrollScreen
      keyboard
      bottomInset={false}
      header={
        <NavyHeader title={`${user.firstName} ${user.lastName}`} subtitle={user.email} compact>
          <Pill label={t(`m.profile.roles.${user.role}`)} fg={colors.white} bg="rgba(255,255,255,0.14)" style={{ marginTop: 10 }} />
        </NavyHeader>
      }
    >
      <Section title={t('m.profile.language')} icon={Globe} index={0}>
        <LanguagePicker onChange={(l) => void changeLanguage(l)} disabled={saving === 'language'} />
        <Text variant="caption" style={{ marginTop: 8 }}>
          {t('m.profile.languageHint')}
        </Text>
      </Section>

      <Section title={t('m.profile.personal')} index={1}>
        <View style={{ gap: space.md }}>
          <Field label={t('auth.firstName')} value={form.firstName} onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))} autoComplete="given-name" />
          <Field label={t('auth.lastName')} value={form.lastName} onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))} autoComplete="family-name" />
          <Field label={t('auth.phone')} value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" autoComplete="tel" />
          <Field label={t('auth.email')} value={user.email} editable={false} style={{ color: colors.muted }} />
          <Button title={t('common.save')} icon={Save} onPress={saveProfile} loading={saving === 'profile'} disabled={!dirty} />
        </View>
      </Section>

      <Section title={t('m.profile.security')} icon={KeyRound} index={2}>
        <View style={{ gap: space.md }}>
          <Field label={t('portal.currentPassword')} value={pw.current} onChangeText={(v) => setPw((p) => ({ ...p, current: v }))} password autoComplete="current-password" />
          <Field
            label={t('auth.newPassword')}
            value={pw.next}
            onChangeText={(v) => setPw((p) => ({ ...p, next: v }))}
            password
            autoComplete="new-password"
            hint={t('m.auth.passwordRule')}
          />
          <Button title={t('portal.changePassword')} variant="secondary" onPress={savePassword} loading={saving === 'password'} disabled={!pw.current || !pw.next} />
        </View>
      </Section>

      <Card index={3}>
        <ListRow
          icon={Bell}
          title={t('m.profile.push')}
          subtitle={pushLabel}
          onPress={pushPossible ? () => void togglePush(!pushOn) : undefined}
          chevron={false}
          right={
            pushPossible ? (
              <Switch
                value={pushOn}
                disabled={saving === 'push'}
                onValueChange={(v) => void togglePush(v)}
                trackColor={{ true: colors.blue }}
                accessibilityLabel={t('m.profile.push')}
              />
            ) : undefined
          }
        />
        <Divider style={{ marginVertical: 2 }} />
        {sessionCount > 0 ? (
          <>
            <ListRow
              icon={MonitorSmartphone}
              title={t('m.profile.sessions')}
              subtitle={t('m.profile.sessionsCount', { count: sessionCount, date: expiresAt ? f.date(expiresAt) : '—' })}
              onPress={sessionCount > 1 ? logoutOthers : undefined}
              right={
                sessionCount > 1 ? (
                  <Text variant="small" style={{ color: colors.danger }}>
                    {saving === 'sessions' ? '…' : t('m.profile.logoutOthers')}
                  </Text>
                ) : undefined
              }
              chevron={false}
            />
            <Divider style={{ marginVertical: 2 }} />
          </>
        ) : null}
        <ListRow icon={Phone} title={t('m.info.contact')} onPress={() => router.push('/info/contact')} />
        <ListRow icon={CircleHelp} title={t('m.profile.faq')} onPress={() => router.push('/info/faq')} />
        <ListRow icon={Globe} title={t('m.profile.website')} subtitle="triad-vision.de" onPress={() => void WebBrowser.openBrowserAsync(WEB_URL)} />
      </Card>

      {isStaff ? (
        <Text variant="caption" center>
          {t('m.profile.webOnly')}
        </Text>
      ) : null}

      <Button title={t('m.profile.logout')} icon={LogOut} variant="secondary" onPress={confirmLogout} />
      <Text variant="caption" center>
        Triad Vision · {t('m.common.version', { version: APP_VERSION })}
      </Text>
    </ScrollScreen>
  );
};
