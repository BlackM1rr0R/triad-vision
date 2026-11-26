import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, FileText, Inbox } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDateTime } from '@/components/admin/labels';
import { formatBytes } from '@/lib/api';
import { requestError, useReadyDocs, type FolderTarget } from './api';

/**
 * "Göndərilənlər": every "Müştəriyə göndər" of the case (date, who) with the files the client received — each opens
 * in a new tab or downloads (staff may open any case document through /api/files/:id, same as the case page).
 */
export const SentDocsDialog = ({ target, onClose }: { target: FolderTarget; onClose: () => void }) => {
  const { t } = useTranslation();
  const view = useReadyDocs(target.caseId);
  const sends = view.data?.sends ?? [];
  return (
    <Modal open size="lg" onClose={onClose} title={t('clientFolders.sentList.title')} description={`${target.name}${target.number ? ` · ${target.number}` : ''}`} icon={<Inbox className="size-5" />}>
      <div className="space-y-4 text-sm">
        {view.isLoading && <Spinner className="size-4" />}
        {view.isError && (
          <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger-fg" role="alert">
            {requestError(view.error)}
          </p>
        )}
        {view.data && !sends.length && <p className="text-muted">{t('clientFolders.sentList.empty')}</p>}
        {sends.map((s) => (
          <section key={s.id} className="rounded-lg border border-line">
            <header className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line bg-sunken px-3 py-2 text-xs">
              <span className="font-semibold text-ink">
                {fmtDateTime(s.at)}
                {s.by ? ` · ${s.by}` : ''}
              </span>
              <span className="text-muted">
                {t('clientFolders.sentList.count', { count: s.documents.length })}
                {s.resend ? ` · ${t('clientFolders.sentList.again')}` : ''}
              </span>
            </header>
            {s.documents.length ? (
              <ul className="divide-y divide-line">
                {s.documents.map((d) => (
                  <li key={d.documentId} className="flex items-center gap-2 px-3 py-2">
                    <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">{d.name}</span>
                      <span className="text-[11px] text-muted">{d.available ? (d.size != null ? formatBytes(d.size) : '') : t('clientFolders.sentList.removed')}</span>
                    </span>
                    {d.available && (
                      <>
                        <a className="btn-ghost btn-sm" href={`/api/files/${encodeURIComponent(d.documentId)}`} target="_blank" rel="noreferrer" title={t('clientFolders.sentList.open')} aria-label={t('clientFolders.sentList.open')}>
                          <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                        <a className="btn-ghost btn-sm" href={`/api/files/${encodeURIComponent(d.documentId)}?download=1`} title={t('clientFolders.sentList.download')} aria-label={t('clientFolders.sentList.download')}>
                          <Download className="size-3.5" aria-hidden />
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-2 text-xs text-muted">{t('clientFolders.sentList.nothingNew')}</p>
            )}
          </section>
        ))}
      </div>
    </Modal>
  );
};
