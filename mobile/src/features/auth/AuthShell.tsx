import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { ChevronLeft } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Logo, Text } from '@/components/ui';
import { colors, fonts, radius, space } from '@/theme';

/** Navy backdrop with the logo and a white card for auth forms. */
export const AuthShell = ({ title, subtitle, children, back = true }: { title: string; subtitle?: string; children: ReactNode; back?: boolean }) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <LinearGradient colors={[colors.navyDeep, colors.navy, colors.navySoft]} style={{ flex: 1 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.top}>
            {back ? (
              <Pressable
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('m.common.back')}
                style={styles.back}
              >
                <ChevronLeft size={24} color={colors.white} />
              </Pressable>
            ) : null}
            <Animated.View entering={FadeInUp.duration(400)}>
              <Logo size={40} />
            </Animated.View>
          </View>
          <Animated.View entering={FadeInDown.duration(420).delay(60)} style={styles.card}>
            <Text variant="h1" accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text variant="small" style={{ marginTop: 6 }}>
                {subtitle}
              </Text>
            ) : null}
            <View style={{ marginTop: space.xl, gap: space.lg }}>{children}</View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

export const LinkText = ({ label, action, onPress }: { label?: string; action: string; onPress: () => void }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 4 }}>
    {label ? <Text variant="small">{label}</Text> : null}
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="link">
      <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.blue }}>{action}</Text>
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: space.lg, justifyContent: 'center', gap: space.xxl },
  top: { alignItems: 'center', gap: space.lg },
  back: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    zIndex: 2,
  },
  card: { backgroundColor: colors.white, borderRadius: radius.xl, padding: space.xl, width: '100%', maxWidth: 520, alignSelf: 'center' },
});
