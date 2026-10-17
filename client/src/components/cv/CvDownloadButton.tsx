import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import clsx from 'clsx';
import { FileDown } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesCv } from '@/i18n/pagesCv';
import { Spinner } from '@/components/ui/Spinner';
import { downloadBlob, filenameFrom } from './types';

registerCopy(pagesCv);

/** Error code of a blob request (the JSON error body arrives as a Blob). */
export const blobErrorCode = async (err: unknown) => {
  if (err instanceof AxiosError && err.response?.data instanceof Blob) {
    try {
      return (JSON.parse(await err.response.data.text()) as { error?: string }).error ?? 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
};

/** Fetches an authenticated PDF and saves it; shows a translated toast when the server refuses. */
export const useBlobDownload = () => {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const run = async (url: string, fallbackName: string, params?: Record<string, string>) => {
    setBusy(true);
    try {
      const res = await api.get<Blob>(url, { params, responseType: 'blob' });
      downloadBlob(res.data, filenameFrom(res.headers['content-disposition'] as string | undefined, fallbackName));
    } catch (err) {
      const code = await blobErrorCode(err);
      const key = [`cvb.errors.${code}`, `letters.errors.${code}`].find((k) => i18n.exists(k));
      toast.error(key ? t(key) : t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
};

/** "Download CV" button for staff (full CV) and employers (anonymised CV). */
export const CvDownloadButton = ({ url, anonymised, className }: { url: string; anonymised?: boolean; className?: string }) => {
  const { t } = useTranslation();
  const { busy, run } = useBlobDownload();
  return (
    <button
      type="button"
      onClick={() => void run(url, 'Lebenslauf.pdf')}
      disabled={busy}
      className={clsx('inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink/80 hover:border-brand-400 disabled:opacity-60', className)}
    >
      {busy ? <Spinner className="size-3.5" /> : <FileDown className="size-3.5" aria-hidden />}
      {anonymised ? t('cvb.downloadAnon') : t('cvb.downloadButton')}
    </button>
  );
};

export default CvDownloadButton;
