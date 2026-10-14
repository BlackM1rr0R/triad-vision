import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { haptic } from '@/lib/haptics';
import { colors, fonts, radius } from '@/theme';
import { Text } from './Text';

export interface SegmentItem<K extends string> {
  key: K;
  label: string;
  count?: number;
}

/** Horizontally scrollable chip row (filters, sub-tabs). */
export const Chips = <K extends string>({
  items,
  value,
  onChange,
  dark,
}: {
  items: SegmentItem<K>[];
  value: K;
  onChange: (key: K) => void;
  dark?: boolean;
}) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
    {items.map((it) => {
      const active = it.key === value;
      return (
        <Pressable
          key={it.key}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
          onPress={() => {
            if (!active) haptic.select();
            onChange(it.key);
          }}
          style={[
            styles.chip,
            dark ? styles.chipDark : styles.chipLight,
            active && (dark ? styles.activeDark : styles.activeLight),
          ]}
        >
          <Text
            style={{
              fontFamily: active ? fonts.semibold : fonts.medium,
              fontSize: 13,
              color: active ? (dark ? colors.navy : colors.white) : dark ? 'rgba(255,255,255,0.85)' : colors.ink,
            }}
          >
            {it.label}
          </Text>
          {it.count !== undefined ? (
            <View style={[styles.count, active && { backgroundColor: dark ? colors.blueSoft : 'rgba(255,255,255,0.25)' }]}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: active ? (dark ? colors.blue : colors.white) : colors.muted }}>
                {it.count}
              </Text>
            </View>
          ) : null}
        </Pressable>
      );
    })}
  </ScrollView>
);

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill },
  chipLight: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  chipDark: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  activeLight: { backgroundColor: colors.blue, borderColor: colors.blue },
  activeDark: { backgroundColor: colors.white, borderColor: colors.white },
  count: { minWidth: 20, paddingHorizontal: 5, height: 18, borderRadius: 9, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
