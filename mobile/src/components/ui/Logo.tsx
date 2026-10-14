import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors, fonts } from '@/theme';
import { Text } from './Text';

/** Triangle mark — same geometry as client/src/components/ui/Logo.tsx. */
export const LogoMark = ({ size = 40, inner = colors.white }: { size?: number; inner?: string }) => (
  <Svg width={size} height={(size * 56) / 64} viewBox="0 0 64 56" accessibilityElementsHidden importantForAccessibility="no">
    <Defs>
      <LinearGradient id="tv-g" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#5c9bff" />
        <Stop offset="1" stopColor="#1565e8" />
      </LinearGradient>
    </Defs>
    <Path d="M32 2 62 54H44L32 32 20 54H2Z" fill="url(#tv-g)" />
    <Path d="M32 32 44 54H20Z" fill={inner} />
    <Path d="M14 46h36" stroke="#fff" strokeWidth={3} opacity={0.55} />
  </Svg>
);

export const Logo = ({ light = true, size = 38, tagline = true }: { light?: boolean; size?: number; tagline?: boolean }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessible accessibilityLabel="Triad Vision">
    <LogoMark size={size} inner={light ? colors.white : colors.navy} />
    <View>
      <Text style={{ fontFamily: fonts.headingBlack, fontSize: size * 0.46, letterSpacing: 1.6, color: light ? colors.white : colors.navy }}>
        TRIAD VISION
      </Text>
      {tagline ? (
        <Text
          style={{
            fontFamily: fonts.semibold,
            fontSize: Math.max(8, size * 0.2),
            letterSpacing: 2.4,
            marginTop: 2,
            color: light ? 'rgba(255,255,255,0.6)' : colors.muted,
          }}
        >
          PEOPLE · WORK · OPPORTUNITIES
        </Text>
      ) : null}
    </View>
  </View>
);
