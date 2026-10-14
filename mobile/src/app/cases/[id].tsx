import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ScrollScreen } from '@/components/ui';
import { ClientCaseView } from '@/features/case/ClientCaseView';
import { qk } from '@/lib/queryClient';

export default function CaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: qk.case(id) }), [qc, id]);
  return (
    <ScrollScreen onRefresh={refresh}>
      <ClientCaseView id={id} />
    </ScrollScreen>
  );
}
