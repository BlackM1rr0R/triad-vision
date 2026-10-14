import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LogIn, UserPlus } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button, Logo, Text } from '@/components/ui';
import { ExploreGrid } from '@/features/common/Explore';
import { LanguagePicker } from '@/features/common/LanguagePicker';
import { setAppLanguage } from '@/i18n';
import { colors, fonts, space } from '@/theme';

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <LinearGradient colors={[colors.navyDeep, colors.navy, colors.navySoft]} style={{ flex: 1 }} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }}>
      <View style={styles.glow} pointerEvents="none" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}>
        <Animated.View entering={FadeInDown.duration(450)} style={{ gap: space.xl }}>
          <Logo size={42} />
          <LanguagePicker dark onChange={(lng) => void setAppLanguage(lng)} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(450)} style={{ gap: space.md }}>
          <Text style={styles.eyebrow}>{t('m.welcome.eyebrow')}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {t('m.welcome.title')}
          </Text>
          <Text style={styles.subtitle}>{t('m.welcome.subtitle')}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(450)} style={{ gap: space.md }}>
          <Button title={t('m.welcome.register')} icon={UserPlus} size="lg" onPress={() => router.push('/register')} full />
          <Button title={t('m.welcome.login')} icon={LogIn} variant="light" size="lg" onPress={() => router.push('/login')} full />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(450)} style={{ gap: space.md }}>
          <Text style={styles.section}>{t('m.welcome.explore')}</Text>
          <ExploreGrid />
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space.xl, gap: space.xxl, flexGrow: 1, maxWidth: 640, width: '100%', alignSelf: 'center' },
  glow: { position: 'absolute', top: -120, right: -120, width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(47,123,255,0.25)' },
  eyebrow: { color: '#8fb6ff', fontFamily: fonts.semibold, fontSize: 12.5, letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { color: colors.white, fontFamily: fonts.headingBlack, fontSize: 30, lineHeight: 37 },
  subtitle: { color: 'rgba(255,255,255,0.75)', fontFamily: fonts.body, fontSize: 15.5, lineHeight: 23 },
  section: { color: 'rgba(255,255,255,0.6)', fontFamily: fonts.semibold, fontSize: 12.5, letterSpacing: 1.2, textTransform: 'uppercase' },
});
