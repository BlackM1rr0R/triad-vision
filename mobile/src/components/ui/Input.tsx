import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Eye, EyeOff } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius } from '@/theme';
import { Text } from './Text';

export interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  password?: boolean;
}

export const Field = forwardRef<TextInput, FieldProps>(({ label, hint, error, password, style, multiline, ...rest }, ref) => {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text variant="label">{label}</Text> : null}
      <View
        style={[
          styles.box,
          multiline && { minHeight: 96, alignItems: 'flex-start' },
          focused && styles.focused,
          !!error && styles.errorBox,
        ]}
      >
        <TextInput
          ref={ref}
          placeholderTextColor="#94a1b8"
          selectionColor={colors.blue}
          secureTextEntry={password && hidden}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          accessibilityLabel={label}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, multiline && { paddingTop: 12, paddingBottom: 12 }, style]}
        />
        {password ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? t('m.auth.showPassword') : t('m.auth.hidePassword')}
            style={styles.eye}
          >
            {hidden ? <Eye size={19} color={colors.muted} /> : <EyeOff size={19} color={colors.muted} />}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption">{hint}</Text>
      ) : null}
    </View>
  );
});
Field.displayName = 'Field';

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  focused: { borderColor: colors.blue, shadowColor: colors.blue, shadowOpacity: 0.12, shadowRadius: 6 },
  errorBox: { borderColor: colors.danger },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 15.5,
    color: colors.ink,
    minHeight: 48,
  },
  eye: { paddingHorizontal: 14, height: 48, justifyContent: 'center' },
});
