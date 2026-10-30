import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CloudDownload, WifiOff } from 'lucide-react';
import { MAX_FILE_BYTES, offlineSupported, removeDocOffline, saveDocOffline, useOfflineIndex } from '@/lib/offlineDocs';
import type { CaseDetail, CaseDocument } from '@/lib/types';
import { useOfflineWho } from './useOffline';

/**
 * "Oflayn saxla" next to an own document: keeps the file in this device's offline cache (lib/offlineDocs) so it
 * opens at the embassy without internet; pressed again it removes the copy. Shows an "Oflayn" badge while kept.
 */
export const OfflineToggle = ({ doc, caseId, title }: { doc: CaseDocument; caseId: string; title?: string | null }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const who = useOfflineWho();
  const idx = useOfflineIndex();
  const [busy, setBusy] = useState(false);
  if (!offlineSupported() || !who) return null;
  const kept = !!idx?.docs.some((d) => d.id === doc.id);
  const tooBig = doc.size > MAX_FILE_BYTES;
  const mb = Math.round(MAX_FILE_BYTES / 1024 / 1024);

  const toggle = async () => {
    setBusy(true);
    try {
      if (kept) {
        await removeDocOffline(doc.id);
        toast.success(t('cplus.offline.removed'));
        return;
      }
      const number = qc.getQueryData<CaseDetail>(['case', caseId])?.number ?? null;
      const err = await saveDocOffline(doc, { caseNumber: number, title: title ?? null }, who);
      if (!err) toast.success(t('cplus.offline.done'));
      else toast.error(err === 'TOO_BIG' || err === 'FULL' ? t('cplus.offline.tooBig', { mb }) : err === 'UNSUPPORTED' ? t('cplus.offline.unsupported') : t('cplus.offline.failed'));
    } finally {
      setBusy(false);
    }
  };

  const label = kept ? t('cplus.offline.remove') : tooBig ? t('cplus.offline.tooBig', { mb }) : t('cplus.offline.save');
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy || (!kept && tooBig)}
      aria-pressed={kept}
      aria-label={`${t('cplus.offline.save')}: ${doc.originalName}`}
      title={label}
      className={clsx(
        'inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition disabled:opacity-50 lg:min-h-9',
        kept ? 'bg-success-bg text-success-fg hover:bg-success-bg/70' : 'text-muted hover:bg-sunken hover:text-ink',
      )}
    >
      {kept ? <WifiOff className="size-4" aria-hidden /> : <CloudDownload className={clsx('size-4', busy && 'animate-pulse')} aria-hidden />}
      <span className={kept ? '' : 'sr-only sm:not-sr-only'}>{busy ? t('cplus.offline.saving') : kept ? t('cplus.offline.badge') : t('cplus.offline.save')}</span>
    </button>
  );
};

export default OfflineToggle;
