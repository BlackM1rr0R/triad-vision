import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, History as HistoryIcon } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesHistory } from '@/i18n/pagesHistory';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { Panel } from '@/components/admin/ui';
import { HistoryTimeline } from './HistoryTimeline';
import HistoryButton from './HistoryButton';

registerCopy(pagesHistory);

/**
 * "Tarixçə / History" panel on the admin case page: the case's field changes (collapsed until opened, so the
 * page does not load them up front) plus the client's profile history in a drawer (ADMIN+).
 * STAFF see it for cases assigned to them (read-only; the API enforces this).
 */
export default function CaseHistoryPanel({ caseId, clientId, clientName }: { caseId: string; clientId: string; clientName: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!hasMinRole(user?.role, 'STAFF')) return null;
  return (
    <Panel
      id="case-history"
      title={t('history.title')}
      icon={HistoryIcon}
      bodyClassName={open ? 'p-4 sm:p-5' : 'px-5 py-3 sm:px-6'}
      actions={
        <>
          <HistoryButton entity="USER" entityId={clientId} name={clientName} label={t('history.clientProfile')} />
          <button
            type="button"
            className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-brand-600 hover:bg-brand-50"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
            {open ? t('admin.common.close') : t('history.open')}
          </button>
        </>
      }
    >
      {open ? <HistoryTimeline entity="CASE" entityId={caseId} pageSize={20} /> : <p className="text-xs text-muted">{t('history.pageSubtitle')}</p>}
    </Panel>
  );
}
