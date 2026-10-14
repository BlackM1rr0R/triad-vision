import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { colors, radius, space } from '@/theme';

export const Skeleton = ({
  width = '100%',
  height = 14,
  rounded = 6,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) => {
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width, height, borderRadius: rounded, backgroundColor: '#e3eaf5' }, animated, style]} />;
};

/** A card-shaped placeholder block. */
export const SkeletonCard = ({ lines = 3 }: { lines?: number }) => (
  <View style={styles.card}>
    <Skeleton width="45%" height={16} />
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} style={{ marginTop: 12 }} />
    ))}
  </View>
);

export const SkeletonList = ({ count = 4, lines = 2 }: { count?: number; lines?: number }) => {
  const { t } = useTranslation();
  return (
    <View style={{ gap: space.md }} accessibilityLabel={t('m.common.loading')} accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
});
