import { useCallback } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ChevronRight } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Card, CmsIcon, ErrorState, SkeletonList, Text, useRefresh } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { useContent } from '@/lib/queries';
import { colors, space } from '@/theme';
import type { Service } from '@/types';

export default function Services() {
  const { t } = useTranslation();
  const f = useFormat();
  const { data, isLoading, error, refetch } = useContent();
  const { refreshing, onRefresh } = useRefresh(refetch);

  const render = useCallback(
    ({ item, index }: { item: Service; index: number }) => (
      <Card index={index} onPress={() => router.push(`/info/service/${item.slug}`)}>
        <View style={styles.row}>
          <View style={styles.icon}>
            <CmsIcon name={item.icon} size={20} color={colors.blue} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="h3">{f.tr(item.title)}</Text>
            <Text variant="small" numberOfLines={3}>
              {f.tr(item.summary)}
            </Text>
          </View>
          <ChevronRight size={18} color="#a3b0c6" />
        </View>
      </Card>
    ),
    [f],
  );

  if (isLoading)
    return (
      <View style={{ padding: space.lg }}>
        <SkeletonList count={4} lines={2} />
      </View>
    );
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <FlashList
      data={data?.services ?? []}
      keyExtractor={(s) => s.id}
      renderItem={render}
      contentContainerStyle={{ padding: space.lg }}
      ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
      ListHeaderComponent={
        <View style={{ marginBottom: space.lg, gap: 4 }}>
          <Text variant="h2">{t('svc.title')}</Text>
          <Text variant="small">{t('svc.subtitle')}</Text>
        </View>
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} colors={[colors.blue]} />}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
});
