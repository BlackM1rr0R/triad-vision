import type { ComponentType } from 'react';
import type { ColorValue } from 'react-native';
import type { LucideProps } from '@/components/icons';
import { haptic } from '@/lib/haptics';
import { colors, fonts } from '@/theme';

export const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.blue,
  tabBarInactiveTintColor: '#8a97ad',
  tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
  tabBarStyle: {
    backgroundColor: colors.white,
    borderTopColor: colors.line,
  },
  tabBarBadgeStyle: { backgroundColor: colors.danger, fontFamily: fonts.bold, fontSize: 10 },
  animation: 'shift' as const,
};

export const tabIcon =
  (Icon: ComponentType<LucideProps>) =>
  ({ color, focused }: { color: ColorValue; focused: boolean; size: number }) => <Icon size={23} color={color as string} strokeWidth={focused ? 2.4 : 1.9} />;

export const tabListeners = { tabPress: () => haptic.select() };
