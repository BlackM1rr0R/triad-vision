import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorState, SkeletonList, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCase } from '@/lib/queries';
import { qk } from '@/lib/queryClient';
import type { CaseDetail, CaseMessage } from '@/types';
import { ChatView } from './ChatView';
import { View } from 'react-native';
import { space } from '@/theme';

/** Client ↔ manager chat for one case; polls while visible. */
export const ClientChat = ({ caseId, bottomInset = true }: { caseId: string; bottomInset?: boolean }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: c, isLoading, error, refetch } = useCase(caseId);

  useFocusEffect(
    useCallback(() => {
      void refetch();
      const timer = setInterval(() => void refetch(), 15_000);
      return () => clearInterval(timer);
    }, [refetch]),
  );

  const send = async (body: string) => {
    const { data } = await api.post<{ message: Omit<CaseMessage, 'author'> }>(`/cases/${caseId}/messages`, { body });
    qc.setQueryData<CaseDetail>(qk.case(caseId), (old) =>
      old
        ? {
            ...old,
            messages: [
              ...old.messages,
              {
                ...data.message,
                author: { id: user!.id, firstName: user!.firstName, lastName: user!.lastName, role: user!.role },
              },
            ],
          }
        : old,
    );
  };

  if (isLoading)
    return (
      <View style={{ padding: space.lg }}>
        <SkeletonList count={3} lines={1} />
      </View>
    );
  if (error || !c) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <ChatView
      messages={c.messages}
      meId={user?.id ?? ''}
      onSend={send}
      bottomInset={bottomInset}
      header={
        <Text variant="caption" center>
          {c.number} · {t('m.chat.subtitle')}
        </Text>
      }
    />
  );
};
