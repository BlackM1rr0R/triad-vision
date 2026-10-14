import { memo, useCallback } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellOff, CheckCheck } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, NavyHeader, SkeletonList, Text, useRefresh } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { routeForNotification } from '@/lib/links';
import { useNotifications } from '@/lib/queries';
import { qk } from '@/lib/queryClient';
import { colors, fonts, radius, space } from '@/theme';
import type { AppNotification } from '@/types';

const Item = memo(({ n, onPress }: { n: AppNotification; onPress: (n: AppNotification) => void }) => {
  const f = useFormat();
  const unread = !n.readAt;
  return (
    <Pressable
      onPress={() => onPress(n)}
      accessibilityRole="button"
      accessibilityState={{ selected: unread }}
      style={({ pressed }) => [styles.item, unread && styles.unread, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.dot, { backgroundColor: unread ? colors.blue : 'transparent' }]} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontFamily: unread ? fonts.bold : fonts.semibold, fontSize: 14.5 }}>{n.title}</Text>
        <Text variant="small" numberOfLines={4}>
          {n.body}
        </Text>
        <Text variant="caption">{f.smart(n.createdAt)}</Text>
      </View>
    </Pressable>
  );
});
Item.displayName = 'NotificationItem';

/** In-app notification list (both apps). Tapping marks as read and opens the related screen. */
export const NotificationsScreen = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useNotifications();
  const { refreshing, onRefresh } = useRefresh(refetch);

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api.post('/notifications/read', ids ? { ids } : {}),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: qk.notifications });
      const prev = qc.getQueryData<{ items: AppNotification[]; unread: number }>(qk.notifications);
      if (prev) {
        const now = new Date().toISOString();
        const items = prev.items.map((n) => (!n.readAt && (!ids || ids.includes(n.id)) ? { ...n, readAt: now } : n));
        qc.setQueryData(qk.notifications, { items, unread: items.filter((n) => !n.readAt).length });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.notifications, ctx.prev),
  });

  const open = useCallback(
    (n: AppNotification) => {
      haptic.tap();
      if (!n.readAt) markRead.mutate([n.id]);
      const route = routeForNotification({ link: n.link, caseId: n.caseId, type: n.type }, user?.role);
      if (route && route !== '/notifications' && route !== '/dashboard') router.push(route as never);
    },
    [markRead, user?.role],
  );

  const unread = data?.unread ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <NavyHeader
        title={t('m.notifications.title')}
        compact
        right={
          unread > 0 ? (
            <Pressable
              onPress={() => {
                haptic.success();
                markRead.mutate(undefined);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('m.notifications.markAll')}
              style={styles.markAll}
            >
              <CheckCheck size={16} color={colors.white} />
              <Text style={{ color: colors.white, fontFamily: fonts.semibold, fontSize: 12.5 }}>{t('m.notifications.markAll')}</Text>
            </Pressable>
          ) : null
        }
      />
      {isLoading ? (
        <View style={{ padding: space.lg }}>
          <SkeletonList count={5} lines={2} />
        </View>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <FlashList
          data={data?.items ?? []}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => <Item n={item} onPress={open} />}
          contentContainerStyle={{ padding: space.lg }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={<EmptyState icon={BellOff} title={t('m.notifications.empty')} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} colors={[colors.blue]} />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    gap: 10,
    padding: space.lg,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  unread: { borderColor: '#bcd3fb', backgroundColor: '#fbfdff' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  markAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
