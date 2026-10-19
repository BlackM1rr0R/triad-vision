import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckCircle2, FileText, FolderOpen, Languages } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesAiDocs } from '@/i18n/pagesAiDocs';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { aiLimitMessage, createDraft, driveFolderHref, errorCode, type DraftResult, type DraftSource } from './api';

registerCopy(pagesAiDocs);

/**
 * "AI layihə tərcüməsi" dialog (case document row, translation order, drive menu): optional "yüksək keyfiyyət"
 * (strong model), then POST /api/ai-docs/translate-draft and a link to the folder the draft PDF went to.
 */
export default function TranslateDraftDialog({
  source,
  fileName,
  where,
  onClose,
  onCreated,
}: {
  source: DraftSource;
  fileName: string;
  where: 'case' | 'drive' | 'order';
  onClose: () => void;
  onCreated?: (r: DraftResult) => void;
}) {
  const { t, i18n } = useTranslation();
  const [high, setHigh] = useState(false);
  const run = useMutation({
    mutationFn: () => createDraft(source, high ? 'high' : 'standard'),
    onSuccess: (r) => {
      toast.success(t('aiDocs.draft.done'));
      onCreated?.(r);
    },
    onError: (err) => {
      const code = errorCode(err);
      toast.error(aiLimitMessage(err) ?? (i18n.exists(`aiDocs.draft.errors.${code}`) ? t(`aiDocs.draft.errors.${code}`) : `${t('aiDocs.draft.errors.generic')} (${code})`));
    },
  });
  const done = run.data;

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Languages className="size-4 text-brand-600" aria-hidden /> {t('aiDocs.draft.title')}
        </span>
      }
      size="md"
      footer={
        done ? (
          <>
            <button type="button" className="btn btn-sm border border-line bg-card text-ink hover:bg-surface" onClick={onClose}>
              {t('aiDocs.draft.cancel')}
            </button>
            <Link to={driveFolderHref(done.parentId)} className="btn-primary btn-sm" onClick={onClose}>
              <FolderOpen className="size-3.5" aria-hidden /> {t('aiDocs.draft.openFolder')}
            </Link>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-sm border border-line bg-card text-ink hover:bg-surface" onClick={onClose} disabled={run.isPending}>
              {t('aiDocs.draft.cancel')}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? <Spinner className="size-3.5" /> : <Languages className="size-3.5" aria-hidden />} {t('aiDocs.draft.start')}
            </button>
          </>
        )
      }
    >
      <div className="space-y-4 text-sm text-ink">
        <p className="text-muted">{t('aiDocs.draft.intro')}</p>
        <p className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
          <FileText className="size-4 shrink-0 text-brand-600" aria-hidden />
          <span className="min-w-0 truncate font-medium" title={fileName}>
            {fileName}
          </span>
        </p>
        {done ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="size-4" aria-hidden /> {t('aiDocs.draft.done')}
            </p>
            <p className="mt-1 break-words">{done.name}</p>
            <p className="mt-1 text-xs opacity-80">{t(`aiDocs.draft.location.${done.location}`)}</p>
          </div>
        ) : (
          <>
            <label className="flex items-start gap-3 rounded-lg border border-line p-3">
              <input type="checkbox" className="mt-1" checked={high} onChange={(e) => setHigh(e.target.checked)} disabled={run.isPending} />
              <span>
                <span className="block font-semibold">{t('aiDocs.draft.quality')}</span>
                <span className="block text-xs text-muted">{t('aiDocs.draft.qualityHint')}</span>
              </span>
            </label>
            <p className="text-xs text-muted">{t(`aiDocs.draft.where.${where}`)}</p>
            {run.isPending && (
              <p className="flex items-center gap-2 text-xs text-muted" role="status">
                <Spinner className="size-3.5" /> {t('aiDocs.draft.working')}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
