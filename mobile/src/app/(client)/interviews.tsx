import { useCallback } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Video } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, NavyHeader, ScrollScreen, SkeletonList, Text } from '@/components/ui';
import { InterviewCard } from '@/features/interviews/InterviewCard';
import { useMyInterviews } from '@/lib/queries';
import { qk } from '@/lib/queryClient';
import { space } from '@/theme';

/** Candidate's interviews: upcoming (with actions) and past. Reached from the home card and the profile; not a tab. */
export default function Interviews() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useMyInterviews();
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: qk.interviews }), [qc]);

  return (
    <ScrollScreen onRefresh={refresh} header={<NavyHeader back title={t('m.interviews.title')} subtitle={t('m.interviews.subtitle')} compact />}>
      {isLoading ? (
        <SkeletonList count={2} lines={3} />
      ) : !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <Text variant="h3">{t('m.interviews.upcoming')}</Text>
          {data.upcoming.length === 0 ? (
            <EmptyState icon={Video} title={t('m.interviews.emptyTitle')} text={t('m.interviews.empty')} />
          ) : (
            data.upcoming.map((i, idx) => <InterviewCard key={i.id} interview={i} index={idx} onPress={() => router.push(`/interviews/${i.id}`)} />)
          )}
          <Text variant="h3" style={{ marginTop: space.sm }}>
            {t('m.interviews.past')}
          </Text>
          {data.past.length === 0 ? (
            <Text variant="small">{t('m.interviews.noPast')}</Text>
          ) : (
            <View style={{ gap: space.lg }}>
              {data.past.map((i) => (
                <InterviewCard key={i.id} interview={i} compact onPress={() => router.push(`/interviews/${i.id}`)} />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollScreen>
  );
}
