import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, History as HistoryIcon } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesHistory } from '@/i18n/pagesHistory';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { Panel } from '@/components/admin/ui';
import { HistoryTimeline } from './HistoryTimeline';
import type { HistoryEntity } from './shared';

registerCopy(pagesHistory);

/** Collapsible "History" panel for a record shown inside a drawer (company drawer); ADMIN+ only. */
export default function RecordHistoryPanel({ entity, entityId }: { entity: HistoryEntity; entityId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!hasMinRole(user?.role, 'ADMIN')) return null;
  return (
    <Panel
      title={t('history.title')}
      icon={HistoryIcon}
      bodyClassName={open ? 'p-4' : 'hidden'}
      actions={
        <button
          type="button"
          className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-link hover:bg-primary/[0.06]"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
          {open ? t('admin.common.close') : t('history.open')}
        </button>
      }
    >
      {open && <HistoryTimeline entity={entity} entityId={entityId} pageSize={20} />}
    </Panel>
  );
}
