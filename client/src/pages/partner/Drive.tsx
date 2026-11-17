import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronRight, Download, ExternalLink, FileText, Folder, FolderOpen, Info, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { day } from '@/components/agents/format';
import { Spinner } from '@/components/ui/Spinner';
import { downloadFile, portalError } from '@/components/partnerPortal/api';
import { ErrorRetry, Loading, Section } from '@/components/partnerPortal/ui';

interface DriveItem {
  id: string;
  name: string;
  kind: 'FOLDER' | 'FILE';
  size: number | null;
  mimeType: string | null;
  updatedAt: string;
}
interface DriveListing {
  folder: { id: string; name: string };
  path: { id: string; name: string }[];
  items: DriveItem[];
  rootId: string;
  canUpload: boolean;
}

const INLINE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'text/plain']);

const size = (b: number | null) => (b == null ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/**
 * The partner's own Drive folder (GET /partner/drive). Client folders never appear here; the server checks every
 * folder and file against the partner's folder (lib/partnerAccess/drive.ts).
 */
export default function PartnerDrivePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [folder, setFolder] = useState<string | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const q = useQuery({
    queryKey: ['partner-portal', 'drive', folder ?? 'root'],
    queryFn: async () => (await api.get<DriveListing>('/partner/drive', { params: folder ? { folder } : {} })).data,
    retry: false,
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return (await api.post('/partner/drive/files', fd, { params: { folder: q.data?.folder.id } })).data;
    },
    onSuccess: async () => {
      toast.success(t('partnerAccess.drive.uploaded'));
      await qc.invalidateQueries({ queryKey: ['partner-portal', 'drive'] });
    },
    onError: (err) => toast.error(portalError(err)),
  });
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) upload.mutate(f);
  };

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorRetry onRetry={() => q.refetch()} />;
  const d = q.data;

  return (
    <Section
      title={t('partnerAccess.drive.title')}
      icon={FolderOpen}
      actions={
        d.canUpload ? (
          <>
            <input ref={input} type="file" className="sr-only" onChange={onPick} tabIndex={-1} aria-hidden />
            <button type="button" className="btn-secondary btn-sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
              {upload.isPending ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" aria-hidden />} {upload.isPending ? t('partnerAccess.drive.uploading') : t('partnerAccess.drive.upload')}
            </button>
          </>
        ) : undefined
      }
    >
      <p className="mb-3 text-sm text-muted">{t('partnerAccess.drive.intro')}</p>
      {!d.canUpload && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-sunken px-3 py-2.5 text-xs text-muted">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {t('partnerAccess.drive.viewOnly')}
        </p>
      )}
      <nav aria-label={t('partnerAccess.drive.title')} className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        {d.path.map((p, i) => (
          <span key={p.id} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-muted" aria-hidden />}
            {i === d.path.length - 1 ? (
              <span className="font-semibold text-ink">{i === 0 ? t('partnerAccess.drive.root') : p.name}</span>
            ) : (
              <button type="button" className="min-h-11 font-semibold text-link hover:underline" onClick={() => setFolder(p.id === d.rootId ? undefined : p.id)}>
                {i === 0 ? t('partnerAccess.drive.root') : p.name}
              </button>
            )}
          </span>
        ))}
      </nav>
      {d.items.length === 0 ? (
        <p className="text-sm text-muted">{t('partnerAccess.drive.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {d.items.map((it) => (
            <li key={it.id} className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-2">
              {it.kind === 'FOLDER' ? (
                <button type="button" className="flex min-h-11 min-w-0 items-center gap-2 text-left font-medium text-ink hover:text-link" onClick={() => setFolder(it.id)}>
                  <Folder className="size-5 shrink-0 text-accent-fg" aria-hidden /> <span className="truncate">{it.name}</span>
                </button>
              ) : (
                <>
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="size-5 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{it.name}</span>
                      <span className="block text-xs text-muted">
                        {day(it.updatedAt)} {size(it.size) && `· ${size(it.size)}`}
                      </span>
                    </span>
                  </span>
                  <span className="flex gap-1">
                    {it.mimeType && INLINE.has(it.mimeType) && (
                      <a className="btn-ghost btn-sm" href={`/api/partner/drive/files/${it.id}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-3.5" aria-hidden /> {t('partnerAccess.drive.open')}
                      </a>
                    )}
                    <button type="button" className="btn-ghost btn-sm" onClick={() => downloadFile(`/partner/drive/files/${it.id}`, it.name, { download: '1' }).catch((err) => toast.error(portalError(err)))}>
                      <Download className="size-3.5" aria-hidden /> {t('partnerAccess.drive.download')}
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
