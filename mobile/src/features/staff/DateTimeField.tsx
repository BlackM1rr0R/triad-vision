import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CalendarDays, Clock } from '@/components/icons';
import { Text } from '@/components/ui';
import { DATE_LOCALE } from '@/i18n';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors, fonts, radius } from '@/theme';

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
  placeholder,
}: {
  label: string;
  mode: 'date' | 'time';
  value: Date | null;
  onChange: (d: Date) => void;
  minimumDate?: Date;
  placeholder?: string;
}) => {
  const f = useFormat();
  const shown = value ? (mode === 'date' ? f.date(value) : f.time(value)) : placeholder ?? '—';
  const Icon = mode === 'date' ? CalendarDays : Clock;

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.wrap}>
        <Text variant="label">{label}</Text>
        <View style={styles.iosRow}>
          <Icon size={18} color={colors.blue} />
          <DateTimePicker
            value={value ?? new Date()}
            mode={mode}
            display="compact"
            locale={DATE_LOCALE[f.lang]}
            minimumDate={minimumDate}
            minuteInterval={5}
            accentColor={colors.blue}
            onValueChange={(_e, d) => {
              haptic.select();
              onChange(d);
            }}
          />
        </View>
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
            value: value ?? new Date(),
            mode,
            is24Hour: true,
            minimumDate,
            onValueChange: (_e, d) => onChange(d),
          });
        }}
        style={({ pressed }) => [styles.button, pressed && { borderColor: colors.blue }]}
      >
        <Icon size={18} color={colors.blue} />
        <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: value ? colors.ink : colors.muted }}>{shown}</Text>
      </Pressable>
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
