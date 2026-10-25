import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { Panel } from '@/components/admin/ui';
import { AccessLogSection } from './AccessLogSection';

/** Admin case page (ADMIN+): the client's "who viewed my documents" log, collapsed until opened. */
export default function ClientAccessLogPanel({ clientId }: { clientId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Panel
      title={t('accessLog.adminTitle')}
      icon={ShieldCheck}
      actions={
        <button type="button" className="btn-secondary btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? t('accessLog.hide') : t('accessLog.show')}
        </button>
      }
      bodyClassName={open ? undefined : 'hidden'}
    >
      {open && <AccessLogSection endpoint={`/admin/access-log/${clientId}`} compact />}
    </Panel>
  );
}
