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
import type { Service } from '@/types';

const AUDIENCE_KEY = { all: 'svc.forAll', company: 'svc.forCompany', candidate: 'svc.forCandidate' } as const;

export default function ServiceDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useTranslation();
  const f = useFormat();
  const content = useContent();
  const fromList = content.data?.services.find((s) => s.slug === slug);
  const single = useQuery({
    queryKey: ['service', slug],
    queryFn: async () => (await api.get<{ service: Service }>(`/public/services/${slug}`)).data.service,
    enabled: !fromList && !content.isLoading,
  });
  const service = fromList ?? single.data;

  if (!service) {
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
      <Stack.Screen options={{ title: f.tr(service.title) }} />
      <CoverImage src={service.image} height={180} />
      <View style={{ gap: 8 }}>
        <Pill label={t(AUDIENCE_KEY[service.audience] ?? 'svc.forAll')} fg={colors.blue} bg={colors.blueSoft} dot={false} />
        <Text variant="h1">{f.tr(service.title)}</Text>
        <Text variant="small">{f.tr(service.summary)}</Text>
      </View>
      {f.trList(service.features).length ? (
        <Section title={t('svc.included')}>
          <Bullets items={f.trList(service.features)} />
        </Section>
      ) : null}
      {f.tr(service.body) ? <Paragraphs text={f.tr(service.body)} /> : null}
      {service.audience !== 'company' ? <ApplyCta /> : null}
    </ScrollScreen>
  );
}
