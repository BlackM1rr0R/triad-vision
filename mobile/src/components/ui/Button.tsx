import type { ComponentType, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { LucideProps } from '@/components/icons';
import { haptic } from '@/lib/haptics';
import { colors, fonts, radius } from '@/theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'light' | 'success';

const PALETTE: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.blue, fg: colors.white },
  secondary: { bg: colors.white, fg: colors.navy, border: colors.line },
  ghost: { bg: 'transparent', fg: colors.blue },
  danger: { bg: colors.danger, fg: colors.white },
  success: { bg: colors.success, fg: colors.white },
  light: { bg: 'rgba(255,255,255,0.14)', fg: colors.white, border: 'rgba(255,255,255,0.22)' },
};

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ComponentType<LucideProps>;
  iconRight?: ComponentType<LucideProps>;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  hapticStyle?: 'tap' | 'none';
  accessibilityHint?: string;
  children?: ReactNode;
}

export const Button = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading,
  disabled,
  full,
  style,
  hapticStyle = 'tap',
  accessibilityHint,
}: ButtonProps) => {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const p = PALETTE[variant];
  const height = size === 'sm' ? 38 : size === 'lg' ? 54 : 48;
  const iconSize = size === 'sm' ? 16 : 18;
  const inactive = disabled || loading;

  return (
    <Animated.View style={[full && { alignSelf: 'stretch' }, animated, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
        disabled={inactive}
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 18, stiffness: 400 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 18, stiffness: 400 });
        }}
        onPress={() => {
          if (hapticStyle === 'tap') haptic.tap();
          onPress?.();
        }}
        style={[
          styles.base,
          {
            height,
            paddingHorizontal: size === 'sm' ? 14 : 20,
            backgroundColor: p.bg,
            borderColor: p.border ?? 'transparent',
            borderWidth: p.border ? StyleSheet.hairlineWidth * 2 : 0,
            opacity: inactive && !loading ? 0.5 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={p.fg} />
        ) : (
          <View style={styles.row}>
            {Icon ? <Icon size={iconSize} color={p.fg} strokeWidth={2.2} /> : null}
            <Text
              numberOfLines={1}
              style={{ color: p.fg, fontFamily: fonts.semibold, fontSize: size === 'sm' ? 13.5 : 15 }}
            >
              {title}
            </Text>
            {IconRight ? <IconRight size={iconSize} color={p.fg} strokeWidth={2.2} /> : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
