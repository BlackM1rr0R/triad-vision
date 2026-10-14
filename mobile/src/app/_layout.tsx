import '@/i18n';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Montserrat_700Bold } from '@expo-google-fonts/montserrat/700Bold';
import { Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat/800ExtraBold';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { OfflineBanner, ToastProvider, useToast } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { routeForNotification } from '@/lib/links';
import { dataOf } from '@/lib/push';
import { queryClient } from '@/lib/queryClient';
import { colors, fonts } from '@/theme';

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

/** Opens the right screen when the user taps a push notification (also on cold start). */
const PushRouter = () => {
  const { status, user } = useAuth();
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  const wasAuthed = useRef(false);

  useEffect(() => {
    if (status === 'guest' && wasAuthed.current && last) {
      // Logout / session ended in this process: the last response belongs to the previous user.
      // Mark it handled so whoever logs in next is not routed by it (the hook keeps returning it
      // until a new tap; the auth provider also clears it natively). A cold-start tap while logged
      // out is deliberately kept, so "tap push → log in → open the case" still works.
      handled.current = last.notification.request.identifier;
    }
    wasAuthed.current = status === 'authed';
  }, [status, last]);

  useEffect(() => {
    if (status !== 'authed' || !user || !last) return;
    const id = last.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const route = routeForNotification(dataOf(last) ?? {}, user.role);
    if (route) setTimeout(() => router.push(route as never), 50);
  }, [status, user, last]);

  // A push arriving while the app is open: refresh the affected data.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    });
    return () => sub.remove();
  }, []);
  return null;
};

/** Tells the user once why they were logged out when the server ended the session. */
const SessionNotice = () => {
  const { sessionEndReason, clearSessionEndReason } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  useEffect(() => {
    if (!sessionEndReason) return;
    const key =
      sessionEndReason === 'SESSION_REVOKED' ? 'm.session.revoked' : sessionEndReason === 'INVALID_TOKEN' ? 'm.session.invalid' : 'm.session.expired';
    toast(t(key), 'info', 6000);
    clearSessionEndReason();
  }, [sessionEndReason, clearSessionEndReason, toast, t]);
  return null;
};

const RootStack = () => {
  const { status, isStaff } = useAuth();
  const { t } = useTranslation();
  const authed = status === 'authed';

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: colors.white,
        headerTitleStyle: { fontFamily: fonts.heading, fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.surface },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, animation: 'fade' }} />

      <Stack.Protected guard={status === 'guest'}>
        <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={authed && !isStaff}>
        <Stack.Screen name="(client)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="cases/[id]" options={{ title: t('m.case.title') }} />
        <Stack.Screen name="chat/[id]" options={{ title: t('m.chat.title') }} />
        <Stack.Screen name="sign/[id]" options={{ title: t('m.sign.title'), presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="apply" options={{ title: t('m.apply.title'), presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack.Protected>

      <Stack.Protected guard={authed && isStaff}>
        <Stack.Screen name="(staff)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="staff/cases/[id]" options={{ title: '' }} />
        <Stack.Screen name="staff/action" options={{ title: '', presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack.Protected>

      {/* Public information — available logged in or out. */}
      <Stack.Screen name="info/visas" options={{ title: t('m.info.visas') }} />
      <Stack.Screen name="info/visa/[slug]" options={{ title: '' }} />
      <Stack.Screen name="info/services" options={{ title: t('m.info.services') }} />
      <Stack.Screen name="info/service/[slug]" options={{ title: '' }} />
      <Stack.Screen name="info/faq" options={{ title: t('m.info.faq') }} />
      <Stack.Screen name="info/contact" options={{ title: t('m.info.contact') }} />
      <Stack.Screen name="viewer" options={{ title: '', presentation: 'fullScreenModal', animation: 'fade', headerShown: false }} />
    </Stack>
  );
};

const Gate = () => {
  const { status } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  });
  const ready = (fontsLoaded || !!fontError) && status !== 'loading';

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.navyDeep }} />;
  return (
    <>
      <RootStack />
      <PushRouter />
      <SessionNotice />
      <OfflineBanner />
    </>
  );
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.navyDeep }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <StatusBar style="light" />
              <Gate />
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
