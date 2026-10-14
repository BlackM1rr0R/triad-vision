import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { LANGUAGES, LANGUAGE_NAMES, type Lang } from '@/i18n';
import { pickLanguage } from '@/i18n/merge';
import { colors, fonts, radius } from '@/theme';

const SHORT: Record<Lang, string> = { az: 'AZ', de: 'DE', en: 'EN', ru: 'RU' };

export const LanguagePicker = ({ onChange, dark, disabled }: { onChange: (lng: Lang) => void; dark?: boolean; disabled?: boolean }) => {
  const { i18n } = useTranslation();
  const current = pickLanguage([i18n.language]);
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {LANGUAGES.map((lng) => {
        const active = lng === current;
        return (
          <Pressable
            key={lng}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={LANGUAGE_NAMES[lng]}
            onPress={() => {
              if (active) return;
              haptic.select();
              onChange(lng);
            }}
            style={[styles.item, dark ? styles.dark : styles.light, active && (dark ? styles.activeDark : styles.activeLight)]}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: active ? (dark ? colors.navy : colors.white) : dark ? colors.white : colors.ink }}>
              {SHORT[lng]}
            </Text>
            {!dark ? (
              <Text style={{ fontFamily: fonts.body, fontSize: 11, color: active ? 'rgba(255,255,255,0.8)' : colors.muted }} numberOfLines={1}>
                {LANGUAGE_NAMES[lng]}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: radius.md, gap: 1 },
  light: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  dark: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  activeLight: { backgroundColor: colors.blue, borderColor: colors.blue },
  activeDark: { backgroundColor: colors.white, borderColor: colors.white },
});
