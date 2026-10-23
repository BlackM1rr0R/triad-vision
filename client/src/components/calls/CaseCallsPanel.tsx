import { useTranslation } from 'react-i18next';
import { PhoneCall } from 'lucide-react';
import { Panel } from '@/components/admin/ui';
import { registerCopy } from '@/i18n';
import { pagesCalls } from '@/i18n/pagesCalls';
import { CallButton } from './CallButton';
import { CallLog } from './CallLog';

registerCopy(pagesCalls);

/** Call log on the admin case page (own chunk): calls of the case and of its client. */
export default function CaseCallsPanel({ caseId, clientId, phone, name }: { caseId: string; clientId: string; phone: string | null; name: string }) {
  const { t } = useTranslation();
  return (
    <Panel title={t('calls.log.title')} icon={PhoneCall} actions={<CallButton target={{ caseId }} phone={phone} name={name} />}>
      <CallLog clientId={clientId} caseId={caseId} />
    </Panel>
  );
}
