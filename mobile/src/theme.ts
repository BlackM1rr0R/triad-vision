import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/** Brand palette — mirrors the web site (client/tailwind config). */
export const colors = {
  navy: '#0b1f44',
  navyDeep: '#050f24',
  navySoft: '#16326b',
  blue: '#1565e8',
  blueBright: '#2f7bff',
  blueSoft: '#e8f0fe',
  surface: '#f5f8fd',
  card: '#ffffff',
  line: '#dfe7f3',
  muted: '#5b6b88',
  ink: '#0b1f44',
  success: '#12a150',
  successSoft: '#e5f6ec',
  danger: '#d92d3a',
  dangerSoft: '#fdeaec',
  warning: '#b7791f',
  warningSoft: '#fdf4e3',
  violet: '#6d4ad8',
  violetSoft: '#efeafd',
  sky: '#0b84c6',
  skySoft: '#e5f4fc',
  white: '#ffffff',
  overlay: 'rgba(5, 15, 36, 0.55)',
} as const;

export const fonts = {
  heading: 'Montserrat_700Bold',
  headingBlack: 'Montserrat_800ExtraBold',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const shadow: ViewStyle = Platform.select({
  ios: { shadowColor: '#0b1f44', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  default: { elevation: 2 },
}) as ViewStyle;

export const type: Record<'h1' | 'h2' | 'h3' | 'title' | 'body' | 'small' | 'caption' | 'label', TextStyle> = {
  h1: { fontFamily: fonts.headingBlack, fontSize: 26, lineHeight: 32, color: colors.ink },
  h2: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.ink },
  h3: { fontFamily: fonts.heading, fontSize: 16, lineHeight: 22, color: colors.ink },
  title: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  caption: { fontFamily: fonts.medium, fontSize: 11.5, lineHeight: 15, color: colors.muted },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.ink },
};
