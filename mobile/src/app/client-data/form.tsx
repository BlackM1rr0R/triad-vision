import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollScreen } from '@/components/ui';
import { FormScreenBody } from '@/features/clientData/ClientData';

/** A questionnaire of the case (native form; file answers open the web portal). */
export default function ClientFormScreen() {
  const { caseId, formId } = useLocalSearchParams<{ caseId: string; formId: string }>();
  const { t } = useTranslation();
  return (
    <ScrollScreen keyboard>
      <Stack.Screen options={{ title: t('m.cd.title') }} />
      <FormScreenBody caseId={caseId} formId={formId} />
    </ScrollScreen>
  );
}
