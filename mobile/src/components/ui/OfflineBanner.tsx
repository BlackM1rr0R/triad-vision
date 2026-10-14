import { StyleSheet, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useNetInfo } from '@react-native-community/netinfo';
import { WifiOff } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, fonts } from '@/theme';
import { Text } from './Text';

/** Floating banner shown whenever the phone has no connection. */
export const OfflineBanner = () => {
  const { isConnected, isInternetReachable } = useNetInfo();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const offline = isConnected === false || isInternetReachable === false;
  if (!offline) return null;
  return (
    <Animated.View
      entering={SlideInUp.duration(250)}
      exiting={SlideOutUp.duration(200)}
      style={[styles.wrap, { top: insets.top + 6 }]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={styles.pill}>
        <WifiOff size={15} color={colors.white} />
        <Text style={styles.text}>{t('m.common.offline')}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 100, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2b3a55',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    maxWidth: 420,
  },
  text: { color: colors.white, fontFamily: fonts.medium, fontSize: 12.5, flexShrink: 1 },
});
