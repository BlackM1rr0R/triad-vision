import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ErrorState, ScrollScreen, SkeletonCard, StaleHint, Text } from '@/components/ui';
import { InterviewCard } from '@/features/interviews/InterviewCard';
import { useFormat } from '@/lib/format';
import { useInterview } from '@/lib/queries';
import { qk } from '@/lib/queryClient';

/** One interview with every action (GET /interviews/:id). Deep-link target for interview notifications. */
export default function InterviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const { data: i, isLoading, error, refetch } = useInterview(id);
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: qk.interview(id) }), [qc, id]);

  return (
    <ScrollScreen onRefresh={refresh}>
      {isLoading && !i ? (
        <SkeletonCard lines={4} />
      ) : !i ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          {error ? <StaleHint error={error} onRetry={() => void refetch()} /> : null}
          <InterviewCard interview={i} index={0} />
          <Text variant="caption" center>
            {t('m.interviews.updatedAt', { date: f.dateTime(i.updatedAt) })}
          </Text>
        </>
      )}
    </ScrollScreen>
  );
}
