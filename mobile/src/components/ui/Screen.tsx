import { useCallback, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '@/lib/haptics';
import { colors, space } from '@/theme';

/** Standard scrolling screen body: surface background, pull-to-refresh, bottom safe area. */
export const ScrollScreen = ({
  header,
  children,
  onRefresh,
  contentStyle,
  keyboard,
  bottomInset = true,
}: {
  header?: ReactNode;
  children: ReactNode;
  onRefresh?: () => Promise<unknown> | void;
  contentStyle?: StyleProp<ViewStyle>;
  keyboard?: boolean;
  /** Add the bottom safe-area inset (not needed above a tab bar). */
  bottomInset?: boolean;
}) => {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (!onRefresh) return;
    haptic.select();
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const body = (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingBottom: (bottomInset ? insets.bottom : 0) + space.xxxl }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} colors={[colors.blue]} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );

  return (
    <View style={styles.root}>
      {header}
      {keyboard ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
};

/** Hook for list screens that need the same pull-to-refresh behaviour. */
export const useRefresh = (fn: () => Promise<unknown>) => {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    haptic.select();
    setRefreshing(true);
    try {
      await fn();
    } finally {
      setRefreshing(false);
    }
  }, [fn]);
  return { refreshing, onRefresh };
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg },
});
