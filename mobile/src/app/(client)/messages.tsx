import { View } from 'react-native';
import { router } from 'expo-router';
import { MessageCircle, Plus } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, ErrorState, NavyHeader, SkeletonList } from '@/components/ui';
import { ClientChat } from '@/features/chat/ClientChat';
import { pickActiveCase } from '@/lib/caseStatus';
import { useMyCases } from '@/lib/queries';
import { colors, space } from '@/theme';

export default function Messages() {
  const { t } = useTranslation();
  const { data: cases, isLoading, error, refetch } = useMyCases();
  const active = cases ? pickActiveCase(cases) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <NavyHeader title={t('m.chat.title')} subtitle={active ? t('portal.messages.title') : undefined} compact />
      {isLoading ? (
        <View style={{ padding: space.lg }}>
          <SkeletonList count={3} lines={1} />
        </View>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : active ? (
        <ClientChat caseId={active.id} bottomInset={false} />
      ) : (
        <EmptyState
          icon={MessageCircle}
          title={t('m.chat.title')}
          text={t('m.chat.noCase')}
          action={<Button title={t('m.home.apply')} icon={Plus} onPress={() => router.push('/apply')} />}
        />
      )}
    </View>
  );
}
