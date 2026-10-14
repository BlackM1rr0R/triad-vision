import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronLeft } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, fonts, space } from '@/theme';
import { Text } from './Text';

/** Navy gradient header used at the top of tab screens (status bar is light on it). */
export const NavyHeader = ({
  title,
  subtitle,
  eyebrow,
  right,
  back,
  children,
  compact,
}: {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  right?: ReactNode;
  back?: boolean;
  children?: ReactNode;
  compact?: boolean;
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <LinearGradient
      colors={[colors.navyDeep, colors.navy, colors.navySoft]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, { paddingTop: insets.top + (compact ? 6 : 12), paddingBottom: compact ? 14 : 22 }]}
    >
      <View style={styles.glow} pointerEvents="none" />
      <View style={styles.row}>
        {back ? (
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('m.common.back')}
            style={styles.back}
          >
            <ChevronLeft size={24} color={colors.white} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          {eyebrow ? (
            <Text style={styles.eyebrow} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          {title ? (
            <Text style={[styles.title, compact && { fontSize: 20, lineHeight: 26 }]} numberOfLines={2} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={3}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.xl, overflow: 'hidden', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  glow: {
    position: 'absolute',
    right: -80,
    top: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(47,123,255,0.22)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  eyebrow: { color: '#8fb6ff', fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  title: { color: colors.white, fontFamily: fonts.headingBlack, fontSize: 25, lineHeight: 31 },
  subtitle: { color: 'rgba(255,255,255,0.72)', fontFamily: fonts.body, fontSize: 14, lineHeight: 20, marginTop: 6 },
});
