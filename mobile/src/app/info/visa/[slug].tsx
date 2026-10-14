import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ErrorState, Pill, ScrollScreen, Section, SkeletonList, Text } from '@/components/ui';
import { ApplyCta, Bullets, CoverImage, Paragraphs } from '@/features/info/shared';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useContent } from '@/lib/queries';
import { colors, space } from '@/theme';
import type { VisaCategory } from '@/types';

export default function VisaDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useTranslation();
  const f = useFormat();
  const content = useContent();
  const fromList = content.data?.visaCategories.find((v) => v.slug === slug);
  const single = useQuery({
    queryKey: ['visa', slug],
    queryFn: async () => (await api.get<{ visa: VisaCategory }>(`/public/visa/${slug}`)).data.visa,
    enabled: !fromList && !content.isLoading,
  });
  const visa = fromList ?? single.data;

  if (!visa) {
    if (content.isLoading || single.isLoading)
      return (
        <View style={{ padding: space.lg }}>
          <SkeletonList count={2} lines={4} />
        </View>
      );
    return <ErrorState error={single.error ?? content.error} onRetry={() => void single.refetch()} />;
  }

  return (
    <ScrollScreen>
      <Stack.Screen options={{ title: f.tr(visa.title) }} />
      <CoverImage src={visa.image} height={190} />
      <View style={{ gap: 8 }}>
        <Pill label={visa.visaLabel} fg={colors.blue} bg={colors.blueSoft} dot={false} />
        <Text variant="h1">{f.tr(visa.title)}</Text>
        <Text variant="small">{f.tr(visa.summary)}</Text>
      </View>
      {f.trList(visa.items).length ? (
        <Section title={t('visas.whatWeDo')}>
          <Bullets items={f.trList(visa.items)} />
        </Section>
      ) : null}
      {f.tr(visa.body) ? <Paragraphs text={f.tr(visa.body)} /> : null}
      <ApplyCta visaSlug={visa.slug} />
    </ScrollScreen>
  );
}
