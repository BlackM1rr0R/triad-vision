import { useState } from 'react';
import { TONE_CLASS } from '@/components/ui/status';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, CheckCheck, Sparkles } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesUploadAi } from '@/i18n/pagesUploadAi';
import { errorCode } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { Spinner } from '@/components/ui/Spinner';
import { SuggestionDrawer } from './SuggestionDrawer';
import { acceptAllInCase, acceptAllInFolder, fetchNodeInsight, uploadAiKeys, useCaseInsights, type StaffInsight, type UploadAiChipData } from './api';

registerCopy(pagesUploadAi);

const chipTone = (status: StaffInsight['status'], open: number, warn: boolean) => {
  if (status === 'PENDING') return 'bg-sunken text-muted';
  if (warn) return TONE_CLASS.warning;
  if (open > 0) return TONE_CLASS.accent;
  return TONE_CLASS.success;
};

/** "AI · Passport" chip (+ open proposals count) and the red "Low quality" badge. Click → suggestion card. */
const Chip = ({ data, onOpen, compact }: { data: Pick<StaffInsight, 'docType' | 'status' | 'qualityLevel' | 'flags'> & { open: number }; onOpen: () => void; compact?: boolean }) => {
  const { t } = useTranslation();
  const warn = data.flags.some((f) => f === 'WRONG_REQUIREMENT' || f === 'NAME_MISMATCH' || f === 'EXPIRED');
  const label = data.status === 'PENDING' ? t('uploadAi.staff.analysing') : t(`uploadAi.types.${data.docType}`);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className={clsx('inline-flex max-w-full shrink-0 items-center gap-1 truncate rounded px-1.5 py-px text-[10px] font-semibold hover:underline', chipTone(data.status, data.open, warn))}
        title={`${t('uploadAi.staff.title')}: ${label}`}
      >
        <Sparkles className="size-2.5 shrink-0" aria-hidden />
        <span className="truncate">
          {t('uploadAi.staff.chip')} · {compact && label.length > 14 ? `${label.slice(0, 13)}…` : label}
        </span>
        {data.open > 0 && <span aria-hidden>·{data.open}</span>}
      </button>
      {data.qualityLevel === 'BAD' && (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-danger-bg px-1 py-px text-[10px] font-semibold text-danger-fg dark:bg-red-950/40 dark:text-red-300" title={t('uploadAi.staff.lowQuality')}>
          <AlertTriangle className="size-2.5" aria-hidden />
          {!compact && t('uploadAi.staff.lowQuality')}
        </span>
      )}
    </>
  );
};

// ─── Admin case page ───────────────────────────────────────────────────

/** Chip of one case document on the admin case page (reads the case-wide query, one request per case). */
export const CaseDocAiChip = ({ caseId, docId, onChanged }: { caseId: string; docId: string; onChanged?: () => unknown }) => {
  const qc = useQueryClient();
  const q = useCaseInsights(caseId, 'staff');
  const [open, setOpen] = useState(false);
  const insight = q.data?.insights.find((i) => i.documentId === docId) ?? null;
  if (!insight) return null;
  return (
    <>
      <Chip data={{ ...insight, open: insight.status === 'PROPOSED' ? insight.proposals.actions.length : 0 }} onOpen={() => setOpen(true)} />
      <SuggestionDrawer
        insight={insight}
        open={open}
        onClose={() => setOpen(false)}
        onChanged={async () => {
          await qc.invalidateQueries({ queryKey: uploadAiKeys.all });
          await onChanged?.();
        }}
      />
    </>
  );
};

/** "Accept all suggestions (N)" for a case (hidden when nothing is open). */
export const CaseAcceptAllBar = ({ caseId, onChanged }: { caseId: string; onChanged?: () => unknown }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useCaseInsights(caseId, 'staff');
  const all = useMutation({
    mutationFn: () => acceptAllInCase(caseId),
    onSuccess: async (r) => {
      toast.success(t('uploadAi.staff.acceptedAll', { count: r.accepted }));
      await qc.invalidateQueries({ queryKey: uploadAiKeys.all });
      await onChanged?.();
    },
    onError: (err) => toast.error(`${t('uploadAi.staff.error')} (${errorCode(err)})`),
  });
  const n = q.data?.open ?? 0;
  if (!n) return null;
  return <AcceptAllButton count={n} busy={all.isPending} onClick={() => all.mutate()} />;
};

const AcceptAllButton = ({ count, busy, onClick }: { count: number; busy: boolean; onClick: () => void }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-accent-border bg-accent-bg px-3 py-1.5 text-xs font-semibold text-accent-fg transition hover:bg-accent-bg disabled:opacity-60 lg:min-h-8 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
    >
      {busy ? <Spinner className="size-3.5" /> : <CheckCheck className="size-4" aria-hidden />}
      {t('uploadAi.staff.acceptAll', { count })}
    </button>
  );
};

// ─── Drive ──────────────────────────────────────────────────────────────

type ItemLike = { id: string; kind: string; uploadAi?: UploadAiChipData };

/** Chip on a drive file row / tile (data from the listing; the card loads the full insight on click). */
export const DriveAiChip = ({ item, compact }: { item: ItemLike; compact?: boolean }) => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const full = useQuery({ queryKey: uploadAiKeys.node(item.id), queryFn: () => fetchNodeInsight(item.id), enabled: open && !!item.uploadAi, staleTime: 5_000 });
  if (!item.uploadAi || item.kind !== 'FILE') return null;
  return (
    <>
      <Chip data={item.uploadAi} onOpen={() => setOpen(true)} compact={compact} />
      {open && (
        // The drawer is portalled, but React events still bubble to the row (select, open, drag, keyboard navigation).
        <span
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onDragStart={(e) => e.stopPropagation()}
        >
          <SuggestionDrawer
            insight={full.data ?? null}
            open={open}
            onClose={() => setOpen(false)}
            onChanged={async () => {
              await qc.invalidateQueries({ queryKey: uploadAiKeys.all });
              await qc.invalidateQueries({ queryKey: ['drive'] });
            }}
          />
        </span>
      )}
    </>
  );
};

/** "Accept all suggestions (N)" for the open drive folder; also refreshes the listing when a recognition lands. */
export const DriveAcceptAllBar = ({ folderId, items }: { folderId: string | null | undefined; items: ItemLike[] }) => {
  const qc = useQueryClient();
  const { t } = useTranslation();
  useRealtime('upload-ai.ready', (p) => {
    if (folderId && (p.folderId === folderId || items.some((i) => i.id === p.driveNodeId))) void qc.invalidateQueries({ queryKey: ['drive', 'children', folderId] });
  });
  const all = useMutation({
    mutationFn: () => acceptAllInFolder(folderId!),
    onSuccess: async (r) => {
      toast.success(t('uploadAi.staff.acceptedAll', { count: r.accepted }));
      await qc.invalidateQueries({ queryKey: ['drive'] });
      await qc.invalidateQueries({ queryKey: uploadAiKeys.all });
    },
    onError: (err) => toast.error(`${t('uploadAi.staff.error')} (${errorCode(err)})`),
  });
  const n = items.filter((i) => i.kind === 'FILE' && (i.uploadAi?.open ?? 0) > 0).length;
  if (!folderId || !n) return null;
  return <AcceptAllButton count={n} busy={all.isPending} onClick={() => all.mutate()} />;
};
