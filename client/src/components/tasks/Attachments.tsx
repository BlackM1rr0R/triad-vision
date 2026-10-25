import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { File, FileImage, FileSpreadsheet, FileText, Folder, Lock, Paperclip, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import type { TaskAttachment } from './types';
import { useTaskActions } from './api';
import { Popover } from './bits';
import { errorText } from './utils';
import { FileDrop, PendingFiles } from './FileDrop';

interface DriveHit {
  id: string;
  kind: 'FILE' | 'FOLDER';
  name: string;
  mimeType: string | null;
  size: number | null;
  virtual: boolean;
  system: boolean;
  location?: { name: string } | null;
}

const iconFor = (kind: string, mime: string | null): LucideIcon => {
  if (kind === 'FOLDER') return Folder;
  if (!mime) return File;
  if (mime.startsWith('image/')) return FileImage;
  if (mime.includes('sheet') || mime.includes('excel') || mime === 'text/csv') return FileSpreadsheet;
  if (mime === 'application/pdf' || mime.includes('word') || mime.startsWith('text/')) return FileText;
  return File;
};

export const nodeHref = (nodeId: string) => `/workspace/drive/f/${nodeId}`;

/** Drive files and folders linked to the task; linking searches the drive (only what the user can see). */
export const Attachments = ({ taskRef, items, canEdit }: { taskRef: string; items: TaskAttachment[]; canEdit: boolean }) => {
  const { t } = useTranslation();
  const actions = useTaskActions();
  const [open, setOpen] = useState(false);
  const [uploads, setUploads] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<number, number>>({});
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(id);
  }, [q]);
  const search = useQuery({
    queryKey: ['tasks', 'drive-search', debounced],
    queryFn: async () => (await api.get<{ items: DriveHit[] }>('/drive/search', { params: { q: debounced } })).data.items,
    enabled: open && debounced.length > 0,
    retry: false,
    staleTime: 30_000,
  });
  const linked = new Set(items.map((i) => i.nodeId));
  const hits = (search.data ?? []).filter((h) => !h.virtual && !h.system && !linked.has(h.id)).slice(0, 20);

  const run = async (call: () => Promise<unknown>) => {
    try {
      await call();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const uploadAll = async (files: File[]) => {
    setUploads(files);
    setProgress({});
    for (let i = 0; i < files.length; i++) {
      setProgress((p) => ({ ...p, [i]: 0 }));
      try {
        await actions.upload(taskRef, files[i], (pct) => setProgress((p) => ({ ...p, [i]: pct })));
      } catch (err) {
        toast.error(`${t('tasks.actions.uploadFailed', { name: files[i].name })} — ${errorText(err)}`);
      }
      setProgress((p) => ({ ...p, [i]: 100 }));
    }
    setUploads([]);
    setProgress({});
  };

  return (
    <div>
      {items.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((a) => {
            const Icon = a.accessible ? iconFor(a.kind, a.mimeType) : Lock;
            const body = (
              <>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/[0.06] text-link">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{a.name}</span>
                  <span className="block truncate text-xs text-muted">{a.kind === 'FILE' && a.size != null ? formatBytes(a.size) : t('tasks.fields.attachments')}</span>
                </span>
              </>
            );
            return (
              <li key={a.nodeId} className="group relative flex items-center gap-2 rounded-xl border border-line bg-card p-2 pr-1 transition hover:border-line-strong">
                {a.accessible ? (
                  <Link to={nodeHref(a.nodeId)} className="flex min-w-0 flex-1 items-center gap-2.5">
                    {body}
                  </Link>
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-2.5 opacity-70">{body}</span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void run(() => actions.detach(taskRef, a.nodeId))}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-danger-fg"
                    aria-label={`${t('tasks.actions.unlink')}: ${a.name}`}
                    title={t('tasks.actions.unlink')}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        uploads.length === 0 && <p className="text-sm text-muted">{t('tasks.empty.attachments')}</p>
      )}
      {uploads.length > 0 && <PendingFiles files={uploads} progress={progress} />}
      {canEdit && (
        <div className="relative mt-3">
          <FileDrop compact disabled={uploads.length > 0} onFiles={(f) => void uploadAll(f)} onTooLarge={(f) => toast.error(`${f.name}: ${t('tasks.errors.FILE_TOO_LARGE')}`)}>
            <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-sm font-semibold text-muted hover:border-line-strong hover:text-link">
              <Paperclip className="size-3.5" /> {t('tasks.actions.linkFile')}
            </button>
          </FileDrop>
          <Popover open={open} onClose={() => setOpen(false)} className="w-80 max-w-[calc(100vw-2rem)]">
            <label className="relative mb-1 block">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('tasks.ph.searchDrive')} className="input py-2 pl-8 text-sm" />
            </label>
            <ul className="max-h-72 overflow-y-auto py-0.5">
              {hits.map((h) => {
                const Icon = iconFor(h.kind, h.mimeType);
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() =>
                        void run(async () => {
                          await actions.attach(taskRef, h.id);
                          setOpen(false);
                          setQ('');
                        })
                      }
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-sunken"
                    >
                      <Icon className="size-4 shrink-0 text-link" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{h.name}</span>
                        {h.location && <span className="block truncate text-xs text-muted">{h.location.name}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
              {search.isError && <li className="px-2 py-3 text-center text-sm text-muted">{t('tasks.empty.driveUnavailable')}</li>}
              {search.isFetched && !search.isError && !hits.length && <li className="px-2 py-3 text-center text-sm text-muted">{t('tasks.empty.drive')}</li>}
            </ul>
          </Popover>
        </div>
      )}
    </div>
  );
};
