import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CheckCheck, Download, Eye, FileText, Inbox } from 'lucide-react';
import { api, fileUrl, formatBytes } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { DocViewer, type ViewState } from '@/components/staffPower/review/DocViewer'; // the existing PDF / image viewer
import { registerCopy } from '@/i18n';
import { pagesReceivedDocs } from '@/i18n/pagesReceivedDocs';
import { pagesStaffPower } from '@/i18n/pagesStaffPower'; // viewer toolbar texts

registerCopy(pagesReceivedDocs);
registerCopy(pagesStaffPower);

// ─── Data (server: lib/receivedDocs, GET /api/cases/:id/received-documents) ─────────────────

export type ReceivedKind = 'READY_DOCS' | 'APPOINTMENT' | 'CONTRACT' | 'CONTRACT_SIGNED' | 'OTHER';

export interface ReceivedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  isNew: boolean;
}

export interface ReceivedGroup {
  id: string;
  kind: ReceivedKind;
  at: string;
  files: ReceivedFile[];
  newCount: number;
}

export interface ReceivedView {
  groups: ReceivedGroup[];
  newCount: number;
  total: number;
}

export const receivedKey = (caseId: string) => ['received-documents', caseId] as const;

export const useReceivedDocuments = (caseId: string, enabled = true) =>
  useQuery({
    queryKey: receivedKey(caseId),
    queryFn: async () => (await api.get<ReceivedView>(`/cases/${caseId}/received-documents`)).data,
    enabled: enabled && !!caseId,
    staleTime: 30_000,
  });

const useMarkSeen = (caseId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) => (await api.post<ReceivedView>(`/cases/${caseId}/received-documents/seen`, ids ? { ids } : {})).data,
    onSuccess: (view) => qc.setQueryData(receivedKey(caseId), view),
  });
};

/** Seconds the list stays open before everything counts as seen (the "Yeni" marks stay visible until the page is left). */
const AUTO_SEEN_MS = 4000;

// ─── UI ─────────────────────────────────────────────────────────────────────

const NewBadge = () => {
  const { t } = useTranslation();
  return <span className="badge bg-highlight-bg text-ink">{t('recv.sent.newBadge')}</span>;
};

const FileRow = ({ file, fresh, onOpen }: { file: ReceivedFile; fresh: boolean; onOpen: (f: ReceivedFile) => void }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  return (
    <li className={clsx('flex items-center gap-3 py-2.5', fresh && 'rounded-lg bg-highlight-bg/40 px-2')}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
        <FileText className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink">
          <span className="min-w-0 truncate" title={file.name}>
            {file.name}
          </span>
          {fresh && <NewBadge />}
        </p>
        <p className="text-xs text-muted">
          {formatBytes(file.size)} · {date(file.createdAt)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onOpen(file)}
        className="grid size-10 shrink-0 place-items-center rounded-lg text-primary hover:bg-sunken"
        aria-label={`${t('recv.file.open')}: ${file.name}`}
        title={t('recv.file.open')}
      >
        <Eye className="size-4" aria-hidden />
      </button>
      <a href={fileUrl(file.id, true)} className="grid size-10 shrink-0 place-items-center rounded-lg text-primary hover:bg-sunken" aria-label={`${t('recv.file.download')}: ${file.name}`} title={t('recv.file.download')}>
        <Download className="size-4" aria-hidden />
      </a>
    </li>
  );
};

/** Section A of the cabinet's Sənədlər: everything Triad Vision sent, newest first, grouped by send / day. */
export function ReceivedDocuments({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { date } = useL10n();
  const { data, isLoading, isError } = useReceivedDocuments(caseId);
  const mark = useMarkSeen(caseId);
  const [open, setOpen] = useState<ReceivedFile | null>(null);
  const [view, setView] = useState<ViewState>({ zoom: 1, rotation: 0 });
  // The documents that were new when the list opened keep their mark until the page is left.
  const fresh = useRef(new Set<string>());
  if (data) for (const g of data.groups) for (const f of g.files) if (f.isNew) fresh.current.add(f.id);

  const hasNew = (data?.newCount ?? 0) > 0;
  useEffect(() => {
    if (!hasNew) return;
    const timer = window.setTimeout(() => mark.mutate(undefined), AUTO_SEEN_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNew]);

  const openFile = (f: ReceivedFile) => {
    setView({ zoom: 1, rotation: 0 });
    setOpen(f);
    if (f.isNew) mark.mutate([f.id]);
  };

  return (
    <section id="received" className="card scroll-mt-40 p-5 sm:p-6" aria-labelledby="received-title" data-testid="received-documents">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 id="received-title" className="type-card-title">
          {t('recv.sent.title')}
        </h3>
        {hasNew && <span className="badge bg-highlight-bg text-ink">{t('recv.sent.newCount', { count: data!.newCount })}</span>}
        {hasNew && (
          <button type="button" className="ml-auto inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-link hover:underline" onClick={() => mark.mutate(undefined)} disabled={mark.isPending}>
            <CheckCheck className="size-4" aria-hidden /> {t('recv.sent.markAll')}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">{t('recv.sent.intro')}</p>

      {isLoading && <Skeleton className="mt-4 h-24 w-full" />}
      {isError && <p className="mt-4 text-sm text-danger-fg">{t('recv.sent.loadError')}</p>}
      {data && data.groups.length === 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-xl bg-sunken p-4 text-sm text-muted">
          <Inbox className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>{t('recv.sent.empty')}</p>
        </div>
      )}

      {data?.groups.map((g) => (
        <div key={g.id} className="mt-4" data-testid="received-group">
          <h4 className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-ink">
            <span>
              {date(g.at, { day: 'numeric', month: 'short', year: 'numeric' })} — {t(`recv.kind.${g.kind}`)}
            </span>
            <span className="font-normal text-muted">({t('recv.sent.files', { count: g.files.length })})</span>
          </h4>
          <ul className="mt-1 divide-y divide-line">
            {g.files.map((f) => (
              <FileRow key={f.id} file={f} fresh={fresh.current.has(f.id)} onOpen={openFile} />
            ))}
          </ul>
        </div>
      ))}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} size="2xl" mobile="full" padded={false}>
        {open && (
          <div className="h-[75dvh]">
            <DocViewer doc={{ id: open.id, mimeType: open.mimeType, originalName: open.name }} view={view} onView={setView} />
          </div>
        )}
      </Modal>
    </section>
  );
}
