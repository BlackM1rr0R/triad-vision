import { Text as RNText, type TextProps } from 'react-native';
import { colors, type as typo } from '@/theme';

type Variant = keyof typeof typo;

export interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  center?: boolean;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
}

const WEIGHT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const Text = ({ variant = 'body', color, center, weight, style, ...rest }: AppTextProps) => (
  <RNText
    maxFontSizeMultiplier={1.4}
    {...rest}
    style={[
      typo[variant],
      color ? { color } : null,
      center ? { textAlign: 'center' } : null,
      weight ? { fontFamily: WEIGHT[weight] } : null,
      style,
    ]}
  />
);

export const Muted = (p: AppTextProps) => <Text variant="small" color={colors.muted} {...p} />;
