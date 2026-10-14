import type { ComponentType, ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { LucideProps } from '@/components/icons';
import { haptic } from '@/lib/haptics';
import { colors, radius, shadow, space } from '@/theme';
import { Text } from './Text';

export const Card = ({
  children,
  style,
  onPress,
  padded = true,
  index,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
  /** Staggers the entering animation when used in a list. */
  index?: number;
}) => {
  const body = onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.card, padded && styles.padded, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  ) : (
    <View style={[styles.card, padded && styles.padded, style]}>{children}</View>
  );
  if (index === undefined) return body;
  return <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(320)}>{body}</Animated.View>;
};

/** Card with a small icon + title header row. */
export const Section = ({
  title,
  icon: Icon,
  right,
  children,
  style,
  index,
}: {
  title: string;
  icon?: ComponentType<LucideProps>;
  right?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  index?: number;
}) => (
  <Card style={style} index={index}>
    <View style={styles.sectionHead}>
      {Icon ? (
        <View style={styles.sectionIcon}>
          <Icon size={16} color={colors.blue} strokeWidth={2.2} />
        </View>
      ) : null}
      <Text variant="h3" style={{ flex: 1 }} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
    {children}
  </Card>
);

export const Divider = ({ style }: { style?: StyleProp<ViewStyle> }) => <View style={[styles.divider, style]} />;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadow,
  },
  padded: { padding: space.lg },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: space.md },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: space.md },
});
