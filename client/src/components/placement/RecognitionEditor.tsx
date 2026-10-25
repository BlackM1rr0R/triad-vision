import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { GraduationCap } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPlacement } from '@/i18n/pagesPlacement';
import { Spinner } from '@/components/ui/Spinner';
import { RECOGNITION_STATUSES, toastPlacementError } from './api';

registerCopy(pagesPlacement);

/** Staff edit the candidate's recognition status (Anerkennung) on the candidate card; it feeds the match score. */
export const RecognitionEditor = ({
  userId,
  status,
  note,
  onSaved,
}: {
  userId: string;
  status: string | null;
  note: string | null;
  onSaved: () => void;
}) => {
  const { t } = useTranslation();
  const [s, setS] = useState(status ?? '');
  const [n, setN] = useState(note ?? '');
  useEffect(() => {
    setS(status ?? '');
    setN(note ?? '');
  }, [status, note]);
  const save = useMutation({
    mutationFn: () => api.patch(`/admin/placement/candidates/${userId}/recognition`, { recognitionStatus: s || null, recognitionNote: n.trim() || null }),
    onSuccess: () => {
      toast.success(t('placement.recognition.saved'));
      onSaved();
    },
    onError: toastPlacementError,
  });
  const dirty = s !== (status ?? '') || n.trim() !== (note ?? '');
  return (
    <div className="rounded-lg border border-line bg-surface/40 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
        <GraduationCap className="size-3.5 text-link" aria-hidden /> {t('placement.recognition.label')}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">{t('placement.recognition.hint')}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
        <select aria-label={t('placement.recognition.label')} className="input py-1.5 text-xs" value={s} onChange={(e) => setS(e.target.value)}>
          <option value="">{t('placement.recognition.unset')}</option>
          {RECOGNITION_STATUSES.map((r) => (
            <option key={r} value={r}>
              {t(`placement.recognition.status.${r}`)}
            </option>
          ))}
        </select>
        <input aria-label={t('placement.recognition.note')} className="input py-1.5 text-xs" maxLength={300} placeholder={t('placement.recognition.notePh')} value={n} onChange={(e) => setN(e.target.value)} />
        <button type="button" className="btn-secondary btn-sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Spinner className="size-3.5" />} {t('admin.common.save')}
        </button>
      </div>
    </div>
  );
};
