import type { ComponentType, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, type LucideProps } from '@/components/icons';
import { haptic } from '@/lib/haptics';
import { colors, fonts } from '@/theme';
import { Text } from './Text';

export const ListRow = ({
  icon: Icon,
  title,
  subtitle,
  right,
  onPress,
  tint = colors.blue,
  chevron = true,
  danger,
}: {
  icon?: ComponentType<LucideProps>;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  tint?: string;
  chevron?: boolean;
  danger?: boolean;
}) => (
  <Pressable
    disabled={!onPress}
    accessibilityRole={onPress ? 'button' : undefined}
    onPress={() => {
      haptic.tap();
      onPress?.();
    }}
    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
  >
    {Icon ? (
      <View style={[styles.icon, { backgroundColor: danger ? colors.dangerSoft : colors.blueSoft }]}>
        <Icon size={18} color={danger ? colors.danger : tint} strokeWidth={2.1} />
      </View>
    ) : null}
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: danger ? colors.danger : colors.ink }} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="small" numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
    {right}
    {onPress && chevron ? <ChevronRight size={18} color="#a3b0c6" /> : null}
  </Pressable>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12, minHeight: 52 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
