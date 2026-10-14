import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { CheckCircle2, AlertCircle, Info } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '@/lib/haptics';
import { colors, fonts } from '@/theme';
import { Text } from './Text';

type Tone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<{ show: (message: string, tone?: Tone, durationMs?: number) => void } | null>(null);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, tone: Tone = 'success', durationMs?: number) => {
    if (tone === 'success') haptic.success();
    else if (tone === 'error') haptic.error();
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    timer.current = setTimeout(() => setToast(null), durationMs ?? (tone === 'error' ? 4200 : 2800));
  }, []);

  const value = useMemo(() => ({ show }), [show]);
  const Icon = toast?.tone === 'error' ? AlertCircle : toast?.tone === 'info' ? Info : CheckCircle2;
  const tint = toast?.tone === 'error' ? '#ff8a93' : toast?.tone === 'info' ? '#8fb6ff' : '#5ee39a';

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center' }]}>
        {toast ? (
          <Animated.View
            key={toast.id}
            entering={FadeInDown.springify().damping(18)}
            exiting={FadeOutDown.duration(180)}
            style={[styles.toast, { marginBottom: insets.bottom + 84 }]}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            <Icon size={18} color={tint} />
            <Text style={styles.text}>{toast.message}</Text>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx.show;
};

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    marginHorizontal: 16,
    maxWidth: 480,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  text: { color: colors.white, fontFamily: fonts.medium, fontSize: 14, flexShrink: 1 },
});
