import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Clapperboard, Trash2, Upload } from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPlacement } from '@/i18n/pagesPlacement';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toastPlacementError } from './api';

registerCopy(pagesPlacement);

interface VideoInfo {
  size: number;
  mimeType: string;
  updatedAt: string;
}

const ACCEPT = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v';

/** Candidate profile (Peşə məlumatları tab): upload / replace / delete the short video introduction for employers. */
export const IntroVideoPanel = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const { data } = useQuery({
    queryKey: ['intro-video'],
    queryFn: async () => (await api.get<{ video: VideoInfo | null; maxBytes: number }>('/intro-video')).data,
  });
  const maxMb = Math.round((data?.maxBytes ?? 60 * 1024 * 1024) / (1024 * 1024));
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      setProgress(0);
      return api.post('/intro-video', form, { onUploadProgress: (e) => setProgress(e.total ? Math.round((e.loaded / e.total) * 100) : null), timeout: 15 * 60 * 1000 });
    },
    onSuccess: () => {
      toast.success(t('placement.video.uploaded'));
      void qc.invalidateQueries({ queryKey: ['intro-video'] });
    },
    onError: toastPlacementError,
    onSettled: () => setProgress(null),
  });
  const remove = useMutation({
    mutationFn: () => api.delete('/intro-video'),
    onSuccess: () => {
      toast.success(t('placement.video.removed'));
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: ['intro-video'] });
    },
    onError: toastPlacementError,
  });
  const pick = (file: File | undefined) => {
    if (!file) return;
    if (data && file.size > data.maxBytes) {
      toast.error(t('placement.video.tooLarge', { mb: maxMb }));
      return;
    }
    upload.mutate(file);
  };
  const video = data?.video ?? null;
  return (
    <div className={clsx('card card-pad', className)}>
      <h2 className="flex items-center gap-2.5 text-lg font-bold text-navy-900">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Clapperboard className="size-4.5" aria-hidden />
        </span>
        {t('placement.video.title')}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{t('placement.video.intro')}</p>
      <div className="mt-5 space-y-3">
        {video ? (
          // Cache-busting by the upload time: a replaced video is fetched again.
          <video key={video.updatedAt} controls preload="metadata" className="aspect-video w-full max-w-xl rounded-xl bg-navy-900" src={`/api/intro-video/file?v=${encodeURIComponent(video.updatedAt)}`} />
        ) : (
          <p className="text-sm text-muted">{t('placement.video.none')}</p>
        )}
        {progress !== null && (
          <div className="max-w-xl" role="status">
            <p className="mb-1 text-xs text-muted">{t('placement.video.uploading', { percent: progress })}</p>
            <span className="block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <span className="block h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${progress}%` }} />
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className="btn-primary btn-sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
            {upload.isPending ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" aria-hidden />} {video ? t('placement.video.replace') : t('placement.video.upload')}
          </button>
          {video && (
            <button type="button" className="btn-secondary btn-sm text-danger" disabled={remove.isPending} onClick={() => setConfirm(true)}>
              <Trash2 className="size-3.5" aria-hidden /> {t('placement.video.remove')}
            </button>
          )}
          <span className="text-xs text-muted">
            {t('placement.video.limit', { mb: maxMb })}
            {video ? ` · ${formatBytes(video.size)}` : ''}
          </span>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={t('placement.video.confirmRemove')}
        message={t('placement.video.confirmRemoveText')}
        confirmLabel={t('placement.video.remove')}
      />
    </div>
  );
};

/** Candidate card (admin): the candidate's video introduction, when there is one. */
export const CandidateIntroVideo = ({ candidateId, has }: { candidateId: string; has: boolean }) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-navy-900">
        <Clapperboard className="size-3.5 text-brand-600" aria-hidden /> {t('placement.video.staffTitle')}
      </p>
      {has ? (
        <video controls preload="metadata" className="mt-2 aspect-video w-full rounded-lg bg-navy-900" src={`/api/admin/placement/candidates/${candidateId}/intro-video/file`} />
      ) : (
        <p className="mt-1 text-xs text-muted">{t('placement.video.staffNone')}</p>
      )}
    </div>
  );
};
