import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FolderDown } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPortalExtras } from '@/i18n/pagesPortalExtras';
import { Spinner } from '@/components/ui/Spinner';

registerCopy(pagesPortalExtras);

/** Error bodies of a blob request arrive as a Blob: read the JSON code out of it. */
const blobErrorCode = async (err: unknown) => {
  const data = (err as { response?: { data?: unknown } }).response?.data;
  if (data instanceof Blob) {
    try {
      return (JSON.parse(await data.text()) as { error?: string }).error ?? null;
    } catch {
      return null;
    }
  }
  return errorCode(err);
};

/**
 * "Bütün sənədlərimi yüklə": GET /api/vault/export.zip (own vault + own case files, built as a stream on the
 * server). Fetched as a blob so an empty vault or the hourly limit show a message instead of a broken download.
 */
export const DownloadAllButton = ({ className = 'btn-secondary btn-sm', withHint }: { className?: string; withHint?: boolean }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const res = await api.get<Blob>('/vault/export.zip', { responseType: 'blob', timeout: 10 * 60_000 });
      const name = /filename="([^"]+)"/.exec(String(res.headers['content-disposition'] ?? ''))?.[1] ?? 'Triad-Vision-senedler.zip';
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      const code = await blobErrorCode(err);
      toast.error(code === 'NO_DOCUMENTS' ? t('px.zip.empty') : code === 'TOO_MANY_REQUESTS' ? t('px.zip.tooMany') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={className} onClick={() => void download()} disabled={busy} aria-busy={busy}>
        {busy ? <Spinner className="size-4" /> : <FolderDown className="size-4" aria-hidden />}
        {busy ? t('px.zip.preparing') : t('px.zip.button')}
      </button>
      {withHint && <span className="text-xs text-muted">{t('px.zip.hint')}</span>}
    </span>
  );
};
