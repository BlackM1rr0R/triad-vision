import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, BadgeCheck, Clock3, FolderKanban, Inbox, UserPlus, type LucideProps } from '@/components/icons';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState, ErrorState, NavyHeader, ScrollScreen, Section, SkeletonCard, SkeletonList, StaleHint, StatusBadge, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ALL_STATUSES, FINAL, STATUS_TONE } from '@/lib/caseStatus';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useDashboard } from '@/lib/queries';
import { colors, fonts, radius, space } from '@/theme';
import type { CaseStatus } from '@/types';

const Stat = ({ icon: Icon, label, value, tint }: { icon: ComponentType<LucideProps>; label: string; value: number; tint: string }) => (
  <View style={styles.stat}>
    <View style={[styles.statIcon, { backgroundColor: `${tint}18` }]}>
      <Icon size={18} color={tint} />
    </View>
    <Text style={{ fontFamily: fonts.headingBlack, fontSize: 24, color: colors.ink }}>{value}</Text>
    <Text variant="caption" numberOfLines={2}>
      {label}
    </Text>
  </View>
);

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useDashboard();
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['admin'] }), [qc]);

  const counts = data?.counts ?? {};
  const active = ALL_STATUSES.filter((s) => !FINAL.includes(s)).reduce((n, s) => n + (counts[s] ?? 0), 0);

  const openQueue = (status: CaseStatus) => {
    haptic.tap();
    router.push({ pathname: '/queue', params: { status } });
  };

  return (
    <ScrollScreen
      onRefresh={refresh}
      bottomInset={false}
      header={<NavyHeader eyebrow="Triad Vision" title={t('m.staff.dashboard.hello', { name: user?.firstName ?? '' })} subtitle={t('m.staff.dashboard.title')} />}
    >
      {isLoading ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonList count={3} lines={1} />
        </>
      ) : !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          {error ? <StaleHint error={error} onRetry={() => void refetch()} /> : null}
          <View style={styles.stats}>
            <Stat icon={FolderKanban} label={t('m.staff.dashboard.active')} value={active} tint={colors.blue} />
            <Stat icon={BadgeCheck} label={t('m.staff.dashboard.approved')} value={counts.APPROVED ?? 0} tint={colors.success} />
          </View>
          <View style={styles.stats}>
            <Stat icon={Inbox} label={t('m.staff.dashboard.inquiries')} value={data.newInquiries} tint={colors.violet} />
            <Stat icon={UserPlus} label={t('m.staff.dashboard.clients')} value={data.newClients30d} tint={colors.sky} />
          </View>

          <Section title={t('m.staff.dashboard.waiting')} icon={Clock3} index={0}>
            {data.waiting.length === 0 ? (
              <EmptyState title={t('m.staff.dashboard.waitingEmpty')} />
            ) : (
              <View style={{ gap: 10 }}>
                {data.waiting.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      haptic.tap();
                      router.push(`/staff/cases/${c.id}`);
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.waiting, pressed && { opacity: 0.8 }]}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5 }}>
                        {c.client.firstName} {c.client.lastName}
                      </Text>
                      <Text variant="caption">
                        {c.number} · {c.profession}
                      </Text>
                      <StatusBadge status={c.status} staff />
                    </View>
                    <Text variant="caption" style={{ maxWidth: 110, textAlign: 'right' }}>
                      {t('m.staff.dashboard.since', { date: f.date(c.updatedAt) })}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Section>

          <Section title={t('m.staff.dashboard.byStatus')} icon={FolderKanban} index={1}>
            <View style={styles.statusGrid}>
              {ALL_STATUSES.map((s) => (
                <Pressable key={s} onPress={() => openQueue(s)} accessibilityRole="button" style={[styles.statusItem, { backgroundColor: STATUS_TONE[s].bg }]}>
                  <Text style={{ fontFamily: fonts.headingBlack, fontSize: 18, color: STATUS_TONE[s].fg }}>{counts[s] ?? 0}</Text>
                  <Text style={{ fontFamily: fonts.medium, fontSize: 11.5, color: colors.ink }} numberOfLines={2}>
                    {t(`m.staff.status.${s}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Section>

          <Section title={t('m.staff.dashboard.recent')} icon={Activity} index={2}>
            <View style={{ gap: 2 }}>
              {data.recentEvents.map((e) => (
                <Pressable key={e.id} onPress={() => router.push(`/staff/cases/${e.case.id}`)} style={styles.event} accessibilityRole="button">
                  <View style={styles.eventDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.medium, fontSize: 13.5 }}>
                      {e.case.number} ·{' '}
                      {i18n.exists(`portal.events.${e.type}`) ? t(`portal.events.${e.type}`) : i18n.exists(`m.events.${e.type}`) ? t(`m.events.${e.type}`) : e.type}
                    </Text>
                    <Text variant="caption">
                      {f.smart(e.createdAt)}
                      {e.actor ? ` · ${e.actor.firstName} ${e.actor.lastName}` : ''}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </Section>
          <Card>
            <Text variant="caption" center>
              {t('m.profile.webOnly')}
            </Text>
          </Card>
        </>
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.md },
  stat: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: space.lg, gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  statIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusItem: { width: '31.5%', flexGrow: 1, padding: 10, borderRadius: radius.md, gap: 2, minHeight: 70 },
  event: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue, marginTop: 6 },
});
