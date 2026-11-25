import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Mic, Trash2, Upload } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { toastError } from '@/components/admin/labels';
import { ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { registerCopy } from '@/i18n';
import { pagesJourneyMap } from '@/i18n/pagesJourneyMap';

registerCopy(pagesJourneyMap); // step names (jmap.milestones.*)

/** Admin > Müştəri yolu > Səs bələdçisi: one audio narration per journey step (mp3 / m4a / webm, up to 5 MB). */
const MAX_BYTES = 5 * 1024 * 1024;
interface VoiceRow {
  key: string;
  exists: boolean;
  size: number | null;
  updatedAt: string | null;
}

const Row = ({ row, canWrite }: { row: VoiceRow; canWrite: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-journey', 'voice'] });
    void qc.invalidateQueries({ queryKey: ['journey-voice'] });
  };
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      await api.put(`/admin/journey/voice/${row.key}`, fd);
    },
    onSuccess: () => {
      toast.success(t('journey.admin.voice.uploaded'));
      refresh();
    },
    onError: (err) => toastError(err, errorCode(err) === 'UNSUPPORTED_FILE_TYPE' ? t('journey.admin.voice.badType') : undefined),
  });
  const remove = useMutation({
    mutationFn: async () => api.delete(`/admin/journey/voice/${row.key}`),
    onSuccess: () => {
      toast.success(t('journey.admin.voice.deleted'));
      refresh();
    },
    onError: (err) => toastError(err),
  });
  const pick = (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) return void toast.error(t('journey.admin.voice.tooBig'));
    upload.mutate(file);
  };
  const label = t(`jmap.milestones.${row.key}`);
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Mic className="size-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{label}</p>
        {row.exists ? (
          <audio
            className="mt-1 h-9 w-full max-w-sm"
            controls
            preload="none"
            src={`/api/journey/voice/${row.key}/audio?v=${row.updatedAt ? new Date(row.updatedAt).getTime() : 0}`}
            aria-label={t('journey.admin.voice.audioOf', { step: label })}
          />
        ) : (
          <p className="text-xs text-muted">{t('journey.admin.voice.none')}</p>
        )}
      </div>
      {canWrite && (
        <div className="flex shrink-0 items-center gap-2">
          <input ref={input} type="file" accept=".mp3,.m4a,.webm,audio/mpeg,audio/mp4,audio/x-m4a,audio/webm" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <button type="button" className="btn-secondary btn-sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
            <Upload className="size-3.5" /> {row.exists ? t('journey.admin.voice.replace') : t('journey.admin.voice.upload')}
          </button>
          {row.exists && (
            <button
              type="button"
              className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
              aria-label={t('journey.admin.voice.delete')}
              title={t('journey.admin.voice.delete')}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </li>
  );
};

export function VoiceGuideAdmin({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['admin-journey', 'voice'], queryFn: async () => (await api.get<{ items: VoiceRow[] }>('/admin/journey/voice')).data.items });
  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <div>
      <p className="mb-3 text-sm text-muted">{t('journey.admin.voice.intro')}</p>
      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {q.data.map((row) => (
          <Row key={row.key} row={row} canWrite={canWrite} />
        ))}
      </ul>
    </div>
  );
}
