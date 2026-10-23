import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollScreen } from '@/components/ui';
import { ConfirmScreenBody } from '@/features/clientData/ClientData';

/** "Confirm your data": every value that goes to the embassy — correct or fix. */
export default function ConfirmDataScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { t } = useTranslation();
  return (
    <ScrollScreen keyboard>
      <Stack.Screen options={{ title: t('m.cd.confirmTitle') }} />
      <ConfirmScreenBody caseId={caseId} />
    </ScrollScreen>
  );
}
