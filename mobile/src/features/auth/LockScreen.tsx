import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Fingerprint, KeyRound, ScanFace } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button, Logo, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useBiometric } from '@/lib/biometric';
import { haptic } from '@/lib/haptics';
import { colors, radius, space } from '@/theme';

/**
 * Full-screen lock shown over the app while the biometric gate is locked (cold start, or back from
 * the background after a while). The prompt opens by itself; "Sign in with password" is the way out
 * when the biometrics are not available any more — it ends the session and goes to the login screen.
 */
export const LockScreen = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { unlock, kinds } = useBiometric();
  const { logout } = useAuth();
  const [busy, setBusy] = useState<'unlock' | 'logout' | null>(null);
  const [failed, setFailed] = useState(false);
  const autoPrompted = useRef(false);

  const face = kinds.includes('face') && !kinds.includes('fingerprint');
  const Icon = face ? ScanFace : Fingerprint;

  const tryUnlock = useCallback(async () => {
    if (busy) return;
    setBusy('unlock');
    try {
      const ok = await unlock();
      if (ok) haptic.success();
      else {
        setFailed(true);
        haptic.warning();
      }
    } finally {
      setBusy(null);
    }
  }, [busy, unlock]);

  // Prompt once as soon as the lock appears while the app is in the foreground.
  useEffect(() => {
    if (autoPrompted.current || AppState.currentState !== 'active') return undefined;
    autoPrompted.current = true;
    const timer = setTimeout(() => void tryUnlock(), 350);
    return () => clearTimeout(timer);
  }, [tryUnlock]);

  const signInWithPassword = async () => {
    if (busy) return;
    setBusy('logout');
    try {
      await logout();
      router.replace('/login');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <LinearGradient colors={[colors.navyDeep, colors.navy, colors.navySoft]} style={{ flex: 1 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={[styles.body, { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xl }]}>
          <Logo size={44} />
          <Animated.View entering={FadeInDown.duration(400).delay(80)} style={styles.card}>
            <View style={styles.iconWrap}>
              <Icon size={34} color={colors.blue} strokeWidth={1.8} />
            </View>
            <Text variant="h2" center accessibilityRole="header">
              {t('m.lock.title')}
            </Text>
            <Text variant="small" center style={{ marginTop: 6 }}>
              {failed ? t('m.lock.failed') : t('m.lock.subtitle')}
            </Text>
            <View style={{ marginTop: space.xl, gap: space.md, alignSelf: 'stretch' }}>
              <Button title={face ? t('m.lock.unlockFace') : t('m.lock.unlock')} icon={Icon} size="lg" full loading={busy === 'unlock'} disabled={busy === 'logout'} onPress={() => void tryUnlock()} />
              <Button title={t('m.lock.usePassword')} icon={KeyRound} variant="ghost" full loading={busy === 'logout'} disabled={busy === 'unlock'} onPress={() => void signInWithPassword()} />
            </View>
          </Animated.View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, gap: space.xxl },
  card: { backgroundColor: colors.white, borderRadius: radius.xl, padding: space.xl, width: '100%', maxWidth: 440, alignItems: 'center' },
  iconWrap: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.lg },
});
