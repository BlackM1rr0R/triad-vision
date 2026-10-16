import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CalendarDays, Clock } from '@/components/icons';
import { Text } from '@/components/ui';
import { DATE_LOCALE } from '@/i18n';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors, fonts, radius } from '@/theme';

/**
 * v9 only calls onValueChange for a picked value, but older/`onChange`-style events carry
 * `type: 'dismissed'` with the untouched date — never forward those as a choice.
 */
const isDismissed = (e: unknown) => (e as { type?: string } | null)?.type === 'dismissed';

/**
 * Date or time input. Android opens the native dialog; iOS shows the compact inline picker.
 * `value` keeps the other part (time for a date field and vice versa) unchanged.
 */
export const DateTimeField = ({
  label,
  mode,
  value,
  onChange,
  minimumDate,
  maximumDate,
  placeholder,
  hint,
  error,
}: {
  label: string;
  mode: 'date' | 'time';
  value: Date | null;
  onChange: (d: Date) => void;
  minimumDate?: Date;
  /** Latest selectable date (e.g. a birth date: today minus the minimum age). */
  maximumDate?: Date;
  placeholder?: string;
  /** Small text under the field; replaced by `error` (red) when set. */
  hint?: string;
  error?: string;
}) => {
  const f = useFormat();
  const shown = value ? (mode === 'date' ? f.date(value) : f.time(value)) : placeholder ?? '—';
  const Icon = mode === 'date' ? CalendarDays : Clock;
  // iOS: the inline picker only appears once the user taps the placeholder, so an untouched field
  // stays empty (and validation can tell) instead of silently showing "now".
  const [iosOpen, setIosOpen] = useState(false);
  /** Where the picker starts when nothing is chosen yet: today, clamped into [minimumDate, maximumDate]. */
  const startDate = () => {
    const now = new Date();
    if (maximumDate && maximumDate < now) return maximumDate;
    if (minimumDate && minimumDate > now) return minimumDate;
    return now;
  };
  const below = error ? (
    <Text variant="caption" color={colors.danger}>
      {error}
    </Text>
  ) : hint ? (
    <Text variant="caption">{hint}</Text>
  ) : null;

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.wrap}>
        <Text variant="label">{label}</Text>
        {value || iosOpen ? (
          <View style={styles.iosRow}>
            <Icon size={18} color={colors.blue} />
            <DateTimePicker
              value={value ?? new Date()}
              mode={mode}
              display="compact"
              locale={DATE_LOCALE[f.lang]}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              minuteInterval={5}
              accentColor={colors.blue}
              onValueChange={(e, d) => {
                if (isDismissed(e) || !d) return;
                haptic.select();
                onChange(d);
              }}
            />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${shown}`}
            onPress={() => {
              haptic.tap();
              setIosOpen(true);
              onChange(startDate());
            }}
            style={({ pressed }) => [styles.button, pressed && { borderColor: colors.blue }]}
          >
            <Icon size={18} color={colors.blue} />
            <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.muted }}>{shown}</Text>
          </Pressable>
        )}
        {below}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text variant="label">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}`}
        onPress={() => {
          haptic.tap();
          DateTimePickerAndroid.open({
            value: value ?? startDate(),
            mode,
            is24Hour: true,
            minimumDate,
            maximumDate,
            onValueChange: (e, d) => {
              if (isDismissed(e) || !d) return;
              onChange(d);
            },
          });
        }}
        style={({ pressed }) => [styles.button, error ? { borderColor: colors.danger } : null, pressed && { borderColor: colors.blue }]}
      >
        <Icon size={18} color={colors.blue} />
        <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: value ? colors.ink : colors.muted }}>{shown}</Text>
      </Pressable>
      {below}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 6, flex: 1 },
  iosRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
});
