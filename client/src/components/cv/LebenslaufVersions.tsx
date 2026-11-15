import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FileCheck2, FileDown, Trash2 } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesExternalApps } from '@/i18n/pagesExternalApps';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { confirmDialog } from '@/components/ui/confirmStore';
import { fmtDateTime } from '@/components/admin/labels';
import { xappError } from '@/components/germanyJobs/externalApps';
import { useBlobDownload } from './CvDownloadButton';

registerCopy(pagesExternalApps);

export interface LebenslaufVersion {
  id: string;
  version: number;
  size: number;
  lang: 'de' | 'en';
  withPhoto: boolean;
  createdAt: string;
}

export const LEBENSLAUF_KEY = ['cv-lebenslauf-versions'];

export const useLebenslaufVersions = (enabled = true) =>
  useQuery({
    queryKey: LEBENSLAUF_KEY,
    queryFn: async () => (await api.get<{ items: LebenslaufVersion[]; latest: LebenslaufVersion | null }>('/cv/lebenslauf')).data,
    enabled,
    staleTime: 60_000,
  });

/**
 * CV editor sidebar: save the current CV as a German tabellarischer Lebenslauf PDF (numbered versions, the newest is
 * attached by "apply via Triad Vision"), download or delete older versions. Server: routes/cv.ts /lebenslauf.
 */
export const LebenslaufVersions = ({ beforeSave }: { beforeSave: () => Promise<unknown> }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useLebenslaufVersions();
  const [photo, setPhoto] = useState(false);
  const download = useBlobDownload();
  const create = useMutation({
    mutationFn: async () => {
      await beforeSave();
      return (await api.post<{ version: LebenslaufVersion }>('/cv/lebenslauf', { lang: 'de', photo })).data.version;
    },
    onSuccess: (v) => {
      toast.success(t('xapp.lebenslauf.saved', { n: v.version }));
      void qc.invalidateQueries({ queryKey: LEBENSLAUF_KEY });
    },
    onError: (err) => toast.error(xappError(err)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/cv/lebenslauf/${id}`),
    onSuccess: () => {
      toast.success(t('xapp.lebenslauf.deleted'));
      void qc.invalidateQueries({ queryKey: LEBENSLAUF_KEY });
    },
    onError: (err) => toast.error(xappError(err)),
  });

  const items = q.data?.items ?? [];
  return (
    <section className="card space-y-3 p-5" aria-labelledby="lebenslauf-versions-title">
      <div>
        <h2 id="lebenslauf-versions-title" className="inline-flex items-center gap-1.5 text-sm font-bold text-ink">
          <FileCheck2 className="size-4 text-primary" aria-hidden /> {t('xapp.lebenslauf.title')}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">{t('xapp.lebenslauf.intro')}</p>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" className="size-4 accent-primary" checked={photo} onChange={(e) => setPhoto(e.target.checked)} />
        {t('xapp.lebenslauf.photo')}
      </label>
      <Button block icon={FileCheck2} loading={create.isPending} onClick={() => create.mutate()}>
        {t('xapp.lebenslauf.save')}
      </Button>
      {q.isLoading ? (
        <Spinner className="size-4 text-primary" />
      ) : items.length === 0 ? (
        <p className="text-xs text-muted">{t('xapp.lebenslauf.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((v, i) => (
            <li key={v.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {t('xapp.lebenslauf.version', { n: v.version })}
                  {i === 0 && <span className="ml-1.5 badge bg-success-bg text-success-fg">{t('xapp.lebenslauf.latest')}</span>}
                </p>
                <p className="text-[11px] text-muted">
                  {fmtDateTime(v.createdAt)}
                  {v.withPhoto ? ` · ${t('xapp.lebenslauf.withPhoto')}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
                onClick={() => void download.run(`/cv/lebenslauf/${v.id}/pdf`, `Lebenslauf_v${v.version}.pdf`)}
                aria-label={`${t('xapp.lebenslauf.download')}: ${t('xapp.lebenslauf.version', { n: v.version })}`}
                disabled={download.busy}
              >
                <FileDown className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg"
                onClick={async () => {
                  if (await confirmDialog({ message: t('xapp.lebenslauf.deleteConfirm') })) remove.mutate(v.id);
                }}
                aria-label={`${t('xapp.lebenslauf.delete')}: ${t('xapp.lebenslauf.version', { n: v.version })}`}
                disabled={remove.isPending}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
