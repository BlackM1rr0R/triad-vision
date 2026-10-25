import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { History as HistoryIcon } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesHistory } from '@/i18n/pagesHistory';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { Drawer } from '@/components/admin/Drawer';
import { HistoryTimeline } from './HistoryTimeline';
import type { HistoryEntity } from './shared';

registerCopy(pagesHistory);

/** "History" button that opens the record's change timeline in a drawer (ADMIN+; STAFF for their own cases). */
export default function HistoryButton({
  entity,
  entityId,
  name,
  compact,
  allowStaff = false,
  label,
  className,
}: {
  entity: HistoryEntity;
  entityId: string;
  name: string;
  compact?: boolean;
  /** Show the button to STAFF too (the API decides: only cases assigned to them). */
  allowStaff?: boolean;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!hasMinRole(user?.role, allowStaff ? 'STAFF' : 'ADMIN')) return null;
  return (
    <>
      <button
        type="button"
        className={clsx(
          'inline-flex items-center gap-1 rounded-md px-2 text-xs font-semibold whitespace-nowrap text-muted hover:bg-sunken hover:text-ink',
          compact ? 'min-h-10' : 'min-h-8 py-1',
          className,
        )}
        onClick={() => setOpen(true)}
        title={t('history.openAria', { name })}
        aria-label={t('history.openAria', { name })}
      >
        <HistoryIcon className="size-3.5" aria-hidden /> {label ?? t('history.open')}
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={`${t('history.title')} · ${name}`}>
        {open && <HistoryTimeline entity={entity} entityId={entityId} pageSize={30} />}
      </Drawer>
    </>
  );
}
