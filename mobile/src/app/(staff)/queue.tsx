import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { FolderSearch, Search, X } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Card, Chips, EmptyState, ErrorState, NavyHeader, SkeletonList, StatusBadge, Text, useRefresh } from '@/components/ui';
import { ALL_STATUSES } from '@/lib/caseStatus';
import { useFormat } from '@/lib/format';
import { useAdminCases } from '@/lib/queries';
import { colors, fonts, radius, space } from '@/theme';
import type { AdminCaseListItem, CaseStatus } from '@/types';

const Row = memo(({ c, onPress }: { c: AdminCaseListItem; onPress: (id: string) => void }) => {
  const f = useFormat();
  return (
    <Card onPress={() => onPress(c.id)}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, flex: 1 }} numberOfLines={1}>
          {c.client.firstName} {c.client.lastName}
        </Text>
        <Text variant="caption">{f.date(c.updatedAt)}</Text>
      </View>
      <Text variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>
        {c.number} · {c.profession}
        {c.visaCategory ? ` · ${c.visaCategory.visaLabel}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 8 }}>
        <StatusBadge status={c.status} staff />
        {c.assignedStaff ? (
          <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
            {c.assignedStaff.firstName} {c.assignedStaff.lastName}
          </Text>
        ) : null}
      </View>
    </Card>
  );
});
Row.displayName = 'CaseRow';

type Filter = CaseStatus | 'ALL' | 'MINE';

export default function Queue() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ status?: string }>();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  // Dashboard → "Cases by status" deep-links here with ?status=…
  useEffect(() => {
    if (params.status && (ALL_STATUSES as string[]).includes(params.status)) setFilter(params.status as CaseStatus);
  }, [params.status]);

  // Debounce the search box.
  useEffect(() => {
    const id = setTimeout(() => setSearch(input.trim()), 350);
    return () => clearTimeout(id);
  }, [input]);

  const query = useAdminCases({
    status: filter === 'ALL' || filter === 'MINE' ? null : filter,
    search,
    mine: filter === 'MINE',
  });
  const { refreshing, onRefresh } = useRefresh(query.refetch);
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const counts = query.data?.pages[0]?.counts ?? {};
  const total = query.data?.pages[0]?.total ?? 0;

  const open = useCallback((id: string) => router.push(`/staff/cases/${id}`), []);

  const chips = useMemo(
    () => [
      { key: 'ALL' as Filter, label: t('m.common.all') },
      { key: 'MINE' as Filter, label: t('m.staff.cases.mine') },
      ...ALL_STATUSES.map((s) => ({ key: s as Filter, label: t(`m.staff.status.${s}`), count: counts[s] ?? 0 })),
    ],
    [t, counts],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <NavyHeader title={t('m.staff.cases.title')} compact>
        <View style={styles.search}>
          <Search size={18} color="rgba(255,255,255,0.7)" />
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('m.staff.cases.searchPh')}
            placeholderTextColor="rgba(255,255,255,0.55)"
            style={styles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t('m.common.search')}
          />
          {input ? (
            <X size={18} color="rgba(255,255,255,0.7)" onPress={() => setInput('')} accessibilityLabel={t('m.common.close')} />
          ) : null}
        </View>
        <View style={{ marginTop: space.md }}>
          <Chips dark value={filter} onChange={setFilter} items={chips} />
        </View>
      </NavyHeader>

      {query.isLoading ? (
        <View style={{ padding: space.lg }}>
          <SkeletonList count={5} lines={2} />
        </View>
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <Row c={item} onPress={open} />}
          contentContainerStyle={{ padding: space.lg }}
          ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
          ListHeaderComponent={
            items.length ? (
              <Text variant="caption" style={{ marginBottom: space.sm }}>
                {t('m.staff.cases.total', { count: total })}
              </Text>
            ) : null
          }
          ListEmptyComponent={<EmptyState icon={FolderSearch} title={t('m.staff.cases.empty')} />}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={{ marginTop: space.lg }} color={colors.blue} /> : null}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} colors={[colors.blue]} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    marginTop: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  searchInput: { flex: 1, color: colors.white, fontFamily: fonts.body, fontSize: 15, height: 44 },
});
