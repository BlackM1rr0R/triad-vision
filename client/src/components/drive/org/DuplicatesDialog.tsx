import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Copy, FolderOpen } from 'lucide-react';
import { formatBytes } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDateTime, fullName } from '@/components/admin/labels';
import { driveError } from '../api';
import { fetchDuplicates, orgKeys } from './api';

/** "Dublikatları tap" (admins): files with identical content in a folder (recursive) or the whole drive. */
export default function DuplicatesDialog({ folderId, folderName, onClose, onOpenFolder }: { folderId: string | null; folderName?: string; onClose: () => void; onOpenFolder: (id: string, itemId?: string) => void }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: orgKeys.duplicates(folderId), queryFn: () => fetchDuplicates(folderId), gcTime: 0 });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={folderId ? t('driveOrg.duplicates.reportFolder', { name: folderName ?? '' }) : t('driveOrg.duplicates.reportAll')}
      footer={
        <button type="button" className="btn-primary btn-sm" onClick={onClose}>
          {t('driveOrg.common.done')}
        </button>
      }
    >
      {q.isLoading ? (
        <Spinner className="size-5" />
      ) : q.isError ? (
        <p className="text-sm text-danger-fg">{driveError(q.error)}</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            {q.data!.groups.length ? t('driveOrg.duplicates.summary', { count: q.data!.groups.length, size: formatBytes(q.data!.wastedBytes) }) : t('driveOrg.duplicates.none')}
            {q.data!.unchecked > 0 && ` ${t('driveOrg.duplicates.unchecked', { count: q.data!.unchecked })}`}
          </p>
          <ul className="max-h-[55vh] space-y-3 overflow-y-auto">
            {q.data!.groups.map((g) => (
              <li key={g.hash} className="rounded-xl border border-line p-2.5">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <Copy className="size-3.5" /> {t('driveOrg.duplicates.group', { count: g.items.length, size: formatBytes(g.size) })}
                </p>
                <ul className="space-y-1">
                  {g.items.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{i.name}</span>
                        <span className="block truncate text-muted" title={i.path}>
                          {i.path} · {fmtDateTime(i.createdAt)}
                          {i.createdBy ? ` · ${fullName(i.createdBy)}` : ''}
                        </span>
                      </span>
                      {i.parentId && (
                        <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-link hover:bg-sunken dark:text-brand-300" onClick={() => onOpenFolder(i.parentId!, i.id)}>
                          <FolderOpen className="size-3.5" /> {t('driveOrg.duplicates.open')}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
