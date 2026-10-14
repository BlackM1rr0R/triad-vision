import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import type { LucideProps } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { haptic } from '@/lib/haptics';
import { colors, fonts, radius, space } from '@/theme';
import { Button } from './Button';
import { Field } from './Input';
import { Text } from './Text';

/** Bottom sheet container (RN Modal + Reanimated slide). */
export const BottomSheet = ({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={FadeIn.duration(180)} style={StyleSheet.absoluteFill}>
          <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <Animated.View entering={SlideInDown.springify().damping(20).stiffness(180)} style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.grabber} />
          {title ? (
            <Text variant="h3" style={{ marginBottom: space.md }} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export interface SheetOption {
  label: string;
  icon?: ComponentType<LucideProps>;
  onPress: () => void;
  destructive?: boolean;
}

/** Cross-platform action sheet (camera / gallery / file …). */
export const ActionSheet = ({
  visible,
  onClose,
  title,
  options,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: SheetOption[];
}) => {
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={{ gap: 8 }}>
        {options.map((o) => (
          <Pressable
            key={o.label}
            accessibilityRole="button"
            onPress={() => {
              haptic.tap();
              onClose();
              // let the sheet close before opening system pickers
              setTimeout(o.onPress, Platform.OS === 'ios' ? 350 : 50);
            }}
            style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.blueSoft }]}
          >
            {o.icon ? (
              <View style={[styles.optionIcon, o.destructive && { backgroundColor: colors.dangerSoft }]}>
                <o.icon size={19} color={o.destructive ? colors.danger : colors.blue} />
              </View>
            ) : null}
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: o.destructive ? colors.danger : colors.ink, flex: 1 }}>{o.label}</Text>
          </Pressable>
        ))}
        <Button title={t('m.common.cancel')} variant="secondary" onPress={onClose} style={{ marginTop: 4 }} />
      </View>
    </BottomSheet>
  );
};

/** Text prompt in a sheet (Alert.prompt is iOS-only). */
export const PromptSheet = ({
  visible,
  onClose,
  title,
  message,
  placeholder,
  confirmLabel,
  minLength = 1,
  destructive,
  loading,
  onSubmit,
  initialValue = '',
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel: string;
  minLength?: number;
  destructive?: boolean;
  loading?: boolean;
  onSubmit: (value: string) => void;
  initialValue?: string;
}) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);
  const ok = value.trim().length >= minLength;
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {message ? (
        <Text variant="small" style={{ marginBottom: space.md }}>
          {message}
        </Text>
      ) : null}
      <Field value={value} onChangeText={setValue} placeholder={placeholder} multiline autoFocus maxLength={2000} />
      <View style={styles.actions}>
        <Button title={t('m.common.cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button
          title={confirmLabel}
          variant={destructive ? 'danger' : 'primary'}
          disabled={!ok}
          loading={loading}
          onPress={() => onSubmit(value.trim())}
          style={{ flex: 1 }}
        />
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    maxHeight: '90%',
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: space.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface },
  optionIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
});
