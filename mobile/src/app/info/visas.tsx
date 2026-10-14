import { useCallback } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { Card, CmsIcon, ErrorState, SkeletonList, Text, useRefresh } from '@/components/ui';
import { CoverImage } from '@/features/info/shared';
import { useFormat } from '@/lib/format';
import { useContent } from '@/lib/queries';
import { colors, fonts, space } from '@/theme';
import type { VisaCategory } from '@/types';

export default function Visas() {
  const { t } = useTranslation();
  const f = useFormat();
  const { data, isLoading, error, refetch } = useContent();
  const { refreshing, onRefresh } = useRefresh(refetch);

  const render = useCallback(
    ({ item, index }: { item: VisaCategory; index: number }) => (
      <Card padded={false} index={index} onPress={() => router.push(`/info/visa/${item.slug}`)} style={{ overflow: 'hidden' }}>
        <CoverImage src={item.image} height={140} rounded={false} />
        <View style={{ padding: space.lg, gap: 6 }}>
          <View style={styles.row}>
            <View style={styles.icon}>
              <CmsIcon name={item.icon} size={18} color={colors.blue} />
            </View>
            <Text variant="h3" style={{ flex: 1 }}>
              {f.tr(item.title)}
            </Text>
            <Text style={styles.label}>{item.visaLabel}</Text>
          </View>
          <Text variant="small" numberOfLines={3}>
            {f.tr(item.summary)}
          </Text>
        </View>
      </Card>
    ),
    [f],
  );

  if (isLoading)
    return (
      <View style={{ padding: space.lg }}>
        <SkeletonList count={3} lines={3} />
      </View>
    );
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <FlashList
      data={data?.visaCategories ?? []}
      keyExtractor={(v) => v.id}
      renderItem={render}
      contentContainerStyle={{ padding: space.lg }}
      ItemSeparatorComponent={() => <View style={{ height: space.lg }} />}
      ListHeaderComponent={
        <View style={{ marginBottom: space.lg, gap: 4 }}>
          <Text variant="h2">{t('visas.pageTitle')}</Text>
          <Text variant="small">{t('visas.pageSubtitle')}</Text>
        </View>
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} colors={[colors.blue]} />}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.blue, backgroundColor: colors.blueSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
});
