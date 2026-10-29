import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { TONE_CLASS } from '@/components/ui/status';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, CheckCheck, Sparkles, UserX } from 'lucide-react';
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
const Chip = ({ data, onOpen, compact }: { data: Pick<StaffInsight, 'docType' | 'status' | 'qualityLevel' | 'flags'> & { open: number; holder?: { found: string; expected: string } | null }; onOpen: () => void; compact?: boolean }) => {
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
      {data.flags.includes('NAME_MISMATCH') && (
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded bg-warning-bg px-1 py-px text-[10px] font-semibold text-warning-fg"
          title={data.holder ? t('uploadAi.staff.nameMismatchFor', data.holder) : t('uploadAi.staff.flags.NAME_MISMATCH')}
        >
          <UserX className="size-2.5" aria-hidden />
          {!compact && t('uploadAi.staff.nameMismatchShort')}
        </span>
      )}
      {data.qualityLevel === 'BAD' && (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-danger-bg px-1 py-px text-[10px] font-semibold text-danger-fg dark:bg-red-950/40 dark:text-red-300" title={t('uploadAi.staff.lowQuality')}>
          <AlertTriangle className="size-2.5" aria-hidden />
          {!compact && t('uploadAi.staff.lowQuality')}
        </span>
      )}
    </>
  );
};

// ─── Name check of staff uploads ────────────────────────────────────────

/** Insights already announced (several listeners may be mounted; each upload warns once). */
const announced = new Set<string>();

/**
 * Toast for the staff member who uploaded a document on a client's behalf when the recognised name does not
 * match the client (or the family member of a member case) — the same check clients get, as a warning only.
 */
export const useStaffNameAlerts = () => {
  const { t } = useTranslation();
  const me = useAuth().user?.id;
  useRealtime('upload-ai.ready', (p) => {
    const flags = Array.isArray(p.flags) ? (p.flags as string[]) : [];
    const holder = p.holder as { found?: string; expected?: string } | null | undefined;
    const id = String(p.insightId ?? '');
    if (!me || p.uploadedById !== me || !flags.includes('NAME_MISMATCH') || !id || announced.has(id)) return;
    announced.add(id);
    toast.warning(t('uploadAi.staff.nameMismatchToast', { file: String(p.fileName ?? ''), found: holder?.found ?? '?', expected: holder?.expected ?? '?' }), { duration: 12_000 });
  });
};

/** One warning line: "The name on the document does not match the client's name: X (client: Y)". */
export const NameMismatchLine = ({ holder, className }: { holder: { found: string; expected: string } | null | undefined; className?: string }) => {
  const { t } = useTranslation();
  if (!holder) return null;
  return (
    <p className={clsx('flex items-start gap-1 text-xs font-medium text-warning-fg', className)} role="note">
      <UserX className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{t('uploadAi.staff.nameMismatchFor', holder)}</span>
    </p>
  );
};

/** Admin case page: the name warning under a case document (reads the case-wide insights query). */
export const CaseDocNameWarning = ({ caseId, docId }: { caseId: string; docId: string }) => {
  const q = useCaseInsights(caseId, 'staff');
  const insight = q.data?.insights.find((i) => i.documentId === docId);
  if (!insight || !insight.flags.includes('NAME_MISMATCH')) return null;
  return <NameMismatchLine holder={insight.proposals.holder ?? { found: insight.fields.holderName ?? '?', expected: '?' }} className="mt-0.5" />;
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
      <Chip data={{ ...insight, holder: insight.proposals.holder ?? null, open: insight.status === 'PROPOSED' ? insight.proposals.actions.length : 0 }} onOpen={() => setOpen(true)} />
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
  useStaffNameAlerts(); // warn the uploader when a document's name does not match the client
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
  useStaffNameAlerts(); // warn the uploader when a document's name does not match the client
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
