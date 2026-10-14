import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { BookOpen, BriefcaseBusiness, ChevronRight, CircleHelp, ExternalLink, Phone, Sparkles, type LucideProps } from '@/components/icons';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Text } from '@/components/ui';
import { WEB_URL } from '@/lib/config';
import { currentLanguage } from '@/i18n';
import { haptic } from '@/lib/haptics';
import { colors, fonts, radius, space } from '@/theme';

const Tile = ({ icon: Icon, label, onPress, light }: { icon: ComponentType<LucideProps>; label: string; onPress: () => void; light?: boolean }) => (
  <Pressable
    accessibilityRole="button"
    onPress={() => {
      haptic.tap();
      onPress();
    }}
    style={({ pressed }) => [styles.tile, light ? styles.tileLight : styles.tileDark, pressed && { opacity: 0.85 }]}
  >
    <View style={[styles.tileIcon, light && { backgroundColor: colors.blueSoft }]}>
      <Icon size={20} color={light ? colors.blue : '#8fb6ff'} />
    </View>
    <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: light ? colors.ink : colors.white, flex: 1 }} numberOfLines={2}>
      {label}
    </Text>
  </Pressable>
);

export const openEligibility = () => {
  haptic.tap();
  void WebBrowser.openBrowserAsync(`${WEB_URL}/eligibility?lng=${currentLanguage()}`, {
    controlsColor: colors.blue,
    toolbarColor: colors.navy,
  });
};

/** Public info shortcuts (visas, services, FAQ, contact) + the web-only eligibility quiz. */
export const ExploreGrid = ({ light }: { light?: boolean }) => {
  const { t } = useTranslation();
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.grid}>
        <Tile light={light} icon={BookOpen} label={t('m.info.visas')} onPress={() => router.push('/info/visas')} />
        <Tile light={light} icon={BriefcaseBusiness} label={t('m.info.services')} onPress={() => router.push('/info/services')} />
      </View>
      <View style={styles.grid}>
        <Tile light={light} icon={CircleHelp} label={t('m.info.faq')} onPress={() => router.push('/info/faq')} />
        <Tile light={light} icon={Phone} label={t('m.info.contact')} onPress={() => router.push('/info/contact')} />
      </View>
      <EligibilityCard light={light} />
    </View>
  );
};

export const EligibilityCard = ({ light }: { light?: boolean }) => {
  const { t } = useTranslation();
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={[styles.tileIcon, { backgroundColor: light ? colors.violetSoft : 'rgba(143,182,255,0.16)' }]}>
        <Sparkles size={20} color={light ? colors.violet : '#c9b8ff'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5, color: light ? colors.ink : colors.white }}>{t('m.welcome.eligibilityTitle')}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: light ? colors.muted : 'rgba(255,255,255,0.65)' }}>
          {t('m.welcome.eligibilityText')}
        </Text>
      </View>
      {light ? <ChevronRight size={18} color="#a3b0c6" /> : <ExternalLink size={16} color="rgba(255,255,255,0.6)" />}
    </View>
  );
  if (light) return <Card onPress={openEligibility}>{inner}</Card>;
  return (
    <Pressable onPress={openEligibility} accessibilityRole="link" style={({ pressed }) => [styles.tileDark, styles.wide, pressed && { opacity: 0.85 }]}>
      {inner}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: space.md },
  tile: { flex: 1, minHeight: 64, borderRadius: radius.lg, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  tileDark: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  tileLight: { backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  tileIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(143,182,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  wide: { borderRadius: radius.lg, padding: 14 },
});
