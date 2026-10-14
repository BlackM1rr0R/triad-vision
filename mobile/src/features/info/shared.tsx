import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Check, LogIn, Send } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@/components/ui';
import { resolveMediaUrl } from '@/lib/apiUrl';
import { useAuth } from '@/lib/auth';
import { API_URL } from '@/lib/config';
import { colors, radius } from '@/theme';

export const mediaUrl = (src?: string | null) => resolveMediaUrl(API_URL, src);

export const CoverImage = ({ src, height = 180, rounded = true }: { src?: string; height?: number; rounded?: boolean }) =>
  src ? (
    <Image
      source={{ uri: mediaUrl(src) }}
      style={{ width: '100%', height, borderRadius: rounded ? radius.lg : 0, backgroundColor: '#dfe7f3' }}
      contentFit="cover"
      transition={250}
      cachePolicy="memory-disk"
      recyclingKey={src}
      accessibilityIgnoresInvertColors
    />
  ) : null;

/** CMS long text: paragraphs separated by blank lines. */
export const Paragraphs = ({ text }: { text: string }) => (
  <View style={{ gap: 10 }}>
    {text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p, i) => (
        <Text key={i} selectable>
          {p}
        </Text>
      ))}
  </View>
);

export const Bullets = ({ items }: { items: string[] }) => (
  <View style={{ gap: 8 }}>
    {items.map((it, i) => (
      <View key={i} style={styles.bullet}>
        <View style={styles.check}>
          <Check size={12} color={colors.white} strokeWidth={3} />
        </View>
        <Text style={{ flex: 1 }}>{it}</Text>
      </View>
    ))}
  </View>
);

/** "Apply" call to action that adapts to the session (guest → register, client → new case, staff → nothing). */
export const ApplyCta = ({ visaSlug }: { visaSlug?: string }) => {
  const { t } = useTranslation();
  const { status, isStaff } = useAuth();
  if (isStaff) return null;
  if (status !== 'authed') {
    return <Button title={t('m.info.loginToApply')} icon={LogIn} size="lg" onPress={() => router.push('/register')} />;
  }
  return (
    <Button
      title={t('m.info.apply')}
      icon={Send}
      size="lg"
      onPress={() => router.push(visaSlug ? { pathname: '/apply', params: { visa: visaSlug } } : '/apply')}
    />
  );
};

const styles = StyleSheet.create({
  bullet: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
