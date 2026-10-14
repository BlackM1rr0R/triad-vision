import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Plus } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, Chips, EmptyState, ErrorState, NavyHeader, ScrollScreen, SkeletonList } from '@/components/ui';
import { ClientCaseView } from '@/features/case/ClientCaseView';
import { pickActiveCase } from '@/lib/caseStatus';
import { useMyCases } from '@/lib/queries';

export default function MyCase() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: cases, isLoading, error, refetch } = useMyCases();
  const [selected, setSelected] = useState<string | null>(null);
  const active = cases ? pickActiveCase(cases) : undefined;
  const id = selected && cases?.some((c) => c.id === selected) ? selected : active?.id;

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['cases'] }), [qc]);

  return (
    <ScrollScreen
      onRefresh={refresh}
      bottomInset={false}
      header={
        <NavyHeader title={t('m.case.title')} compact>
          {cases && cases.length > 1 ? (
            <Chips
              dark
              value={id ?? ''}
              onChange={setSelected}
              items={cases.map((c) => ({ key: c.id, label: c.number }))}
            />
          ) : null}
        </NavyHeader>
      }
    >
      {isLoading ? (
        <SkeletonList count={3} lines={3} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !id ? (
        <EmptyState
          icon={FileText}
          title={t('m.home.noCaseTitle')}
          text={t('m.home.noCaseText')}
          action={<Button title={t('m.home.apply')} icon={Plus} onPress={() => router.push('/apply')} />}
        />
      ) : (
        <ClientCaseView id={id} />
      )}
    </ScrollScreen>
  );
}
