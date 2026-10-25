import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronRight, Download, FileArchive, FileText, Folder, KeyRound, Loader2, ShieldCheck, UploadCloud, XCircle } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { driveCollabCopy } from '@/i18n/pagesDriveCollab';
import { api, errorCode, formatBytes } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { fmtDate } from '@/components/admin/labels';
import { LogoMark } from '@/components/ui/Logo';
import { Spinner } from '@/components/ui/Spinner';
import { optimizeImages } from '@/lib/imageCompress';
import { Lost } from '@/components/illustrations';

registerCopy(driveCollabCopy);

interface Entry {
  id: string;
  name: string;
  kind: 'FILE' | 'FOLDER';
  size: number | null;
  mimeType: string | null;
  updatedAt: string;
}

interface ShareMeta {
  name: string;
  kind: 'FILE' | 'FOLDER';
  expiresAt: string;
  needsPassword: boolean;
  unlocked: boolean;
  size?: number | null;
  mimeType?: string | null;
  allowUpload?: boolean;
  maxDownloads?: number | null;
  downloadsLeft?: number | null;
  exhausted?: boolean;
  maxFileBytes?: number;
  path?: { id: string | null; name: string }[];
  entries?: Entry[];
  totals?: { files: number; bytes: number };
}

type UploadRow = { id: number; name: string; state: 'busy' | 'ok' | 'fail'; progress: number };

/** Public page of an external drive link (/share/:token): no login, password form, downloads, uploads when allowed. */
export default function SharePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { token = '' } = useParams();
  const [dir, setDir] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const base = `/share/${encodeURIComponent(token)}`;
  const headers = key ? { 'x-share-key': key } : undefined;
  const q = useQuery({
    queryKey: ['share', token, dir, key],
    queryFn: async () => (await api.get<ShareMeta>(base, { params: { dir: dir || undefined }, headers })).data,
    retry: (n, err) => n < 2 && errorCode(err) === 'NETWORK',
    refetchOnWindowFocus: false,
  });
  const meta = q.data;
  usePageTitle(meta?.name ?? t('driveCollab.share.eyebrow'));

  // ── password ──
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    setUnlocking(true);
    setPwError(false);
    try {
      const r = (await api.post<{ key: string | null }>(`${base}/unlock`, { password })).data;
      setKey(r.key);
      setPassword('');
    } catch {
      setPwError(true);
    } finally {
      setUnlocking(false);
    }
  };

  const withKey = (url: string) => (key ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}` : url);
  const dl = (ref?: string) => withKey(`/api${base}/download${ref ? `/${encodeURIComponent(ref)}` : ''}`);
  const afterDownload = () => window.setTimeout(() => void qc.invalidateQueries({ queryKey: ['share', token] }), 1500);

  // ── uploads ──
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const sendFiles = async (picked: File[]) => {
    for (const file of await optimizeImages(picked)) {
      const id = ++seq.current;
      setUploads((u) => [...u, { id, name: file.name, state: 'busy', progress: 0 }]);
      const set = (patch: Partial<UploadRow>) => setUploads((u) => u.map((row) => (row.id === id ? { ...row, ...patch } : row)));
      try {
        if (meta?.maxFileBytes && file.size > meta.maxFileBytes) throw new Error('FILE_TOO_LARGE');
        const fd = new FormData();
        fd.append('file', file, file.name);
        await api.post(`${base}/upload`, fd, { headers, onUploadProgress: (p) => p.total && set({ progress: Math.round((p.loaded / p.total) * 100) }) });
        set({ state: 'ok', progress: 100 });
      } catch {
        set({ state: 'fail' });
      }
    }
    void q.refetch();
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void sendFiles(files);
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-canvas px-4 pt-24 pb-16 sm:pt-28 sm:pb-24 lg:pt-36">
      <div className="mx-auto w-full max-w-2xl">
        <div className="card rounded-3xl p-5 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <LogoMark className="h-9 w-10 shrink-0 text-ink" />
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold tracking-[0.12em] text-ink">TRIAD VISION</p>
              <p className="text-xs text-muted">{t('driveCollab.share.eyebrow')}</p>
            </div>
          </div>
          {children}
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
          <ShieldCheck className="size-3.5" /> {t('driveCollab.share.securedBy')}
        </p>
      </div>
    </div>
  );

  if (q.isLoading) {
    return shell(
      <div className="grid place-items-center py-10">
        <Spinner />
      </div>,
    );
  }
  if (q.isError || !meta) {
    return shell(
      <div className="py-6 text-center">
        <Lost className="mx-auto w-40" />
        <h1 className="mt-4 type-card-title text-ink">{t('driveCollab.share.invalidTitle')}</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t('driveCollab.share.invalidBody')}</p>
      </div>,
    );
  }

  const Icon = meta.kind === 'FOLDER' ? Folder : FileText;
  const header = (
    <div className="flex items-start gap-3">
      <span className={clsx('grid size-12 shrink-0 place-items-center rounded-xl', meta.kind === 'FOLDER' ? 'chip-soft' : 'chip-sky')}>
        <Icon className="size-6" />
      </span>
      <div className="min-w-0">
        <h1 className="type-card-title break-words text-ink">{meta.name}</h1>
        <p className="mt-0.5 text-xs text-muted">
          {meta.kind === 'FOLDER' ? t('driveCollab.share.folder') : t('driveCollab.share.file')}
          {meta.kind === 'FILE' && meta.size != null ? ` · ${formatBytes(meta.size)}` : ''}
          {meta.kind === 'FOLDER' && meta.totals ? ` · ${t('driveCollab.share.files', { count: meta.totals.files })} · ${formatBytes(meta.totals.bytes)}` : ''}
        </p>
        <p className="text-xs text-muted">{t('driveCollab.share.expires', { date: fmtDate(meta.expiresAt) })}</p>
      </div>
    </div>
  );

  if (!meta.unlocked) {
    return shell(
      <>
        {header}
        <form onSubmit={unlock} className="mt-6 rounded-2xl border border-line bg-sunken p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <KeyRound className="size-4" /> {t('driveCollab.share.passwordTitle')}
          </p>
          <div className="mt-3 flex gap-2">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('driveCollab.share.passwordPh')} className="input" autoFocus autoComplete="off" aria-invalid={pwError} />
            <button type="submit" className="btn-primary shrink-0" disabled={!password || unlocking}>
              {unlocking && <Spinner className="size-4" />} {t('driveCollab.share.unlock')}
            </button>
          </div>
          {pwError && <p className="mt-2 text-xs font-semibold text-danger">{t('driveCollab.share.badPassword')}</p>}
        </form>
      </>,
    );
  }

  const exhausted = !!meta.exhausted;
  return shell(
    <>
      {header}
      {meta.downloadsLeft != null && !exhausted && <p className="mt-3 text-xs text-muted">{t('driveCollab.share.downloadsLeft', { count: meta.downloadsLeft })}</p>}
      {exhausted && (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-fg">
          <AlertTriangle className="size-4 shrink-0" /> {t('driveCollab.share.limitReached')}
        </p>
      )}

      {meta.kind === 'FILE' && !exhausted && (
        <a href={dl()} onClick={afterDownload} className="btn-primary btn-lg mt-6 w-full justify-center sm:w-auto" download>
          <Download className="size-4" /> {t('driveCollab.share.download')}
        </a>
      )}

      {meta.kind === 'FOLDER' && (
        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <nav className="flex min-w-0 flex-wrap items-center gap-1 text-sm" aria-label="breadcrumb">
              {(meta.path ?? []).map((p, i, arr) => (
                <span key={p.id ?? 'root'} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3.5 text-muted" />}
                  {i < arr.length - 1 ? (
                    <button type="button" onClick={() => setDir(p.id)} className="font-medium text-link hover:underline">
                      {p.name}
                    </button>
                  ) : (
                    <span className="font-semibold text-ink">{p.name}</span>
                  )}
                </span>
              ))}
            </nav>
            {!exhausted && (meta.totals?.files ?? 0) > 0 && (
              <a href={dl(dir ?? undefined)} onClick={afterDownload} className="btn-secondary btn-sm" download>
                <FileArchive className="size-3.5" /> {t('driveCollab.share.downloadAll')}
              </a>
            )}
          </div>
          {meta.entries?.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {meta.entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                  {e.kind === 'FOLDER' ? <Folder className="size-5 shrink-0 text-highlight" /> : <FileText className="size-5 shrink-0 text-primary" />}
                  {e.kind === 'FOLDER' ? (
                    <button type="button" onClick={() => setDir(e.id)} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink hover:text-link hover:underline">
                      {e.name}
                    </button>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{e.name}</span>
                  )}
                  {e.kind === 'FILE' && <span className="shrink-0 text-xs text-muted tabular-nums">{formatBytes(e.size ?? 0)}</span>}
                  {!exhausted && (
                    <a href={dl(e.id)} onClick={afterDownload} className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-link" title={t('driveCollab.share.download')} aria-label={`${t('driveCollab.share.download')}: ${e.name}`} download>
                      {e.kind === 'FOLDER' ? <FileArchive className="size-4" /> : <Download className="size-4" />}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">{t('driveCollab.share.emptyFolder')}</p>
          )}

          {meta.allowUpload && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
              className={clsx('mt-6 rounded-xl border-2 border-dashed p-5 text-center transition', over ? 'border-primary bg-sunken' : 'border-line-strong')}
            >
              <UploadCloud className="mx-auto size-10 text-muted" strokeWidth={1.5} />
              <p className="mt-2 text-sm font-semibold text-ink">{t('driveCollab.share.uploadTitle')}</p>
              <p className="mt-0.5 text-xs text-muted">{t('driveCollab.share.uploadHint', { size: formatBytes(meta.maxFileBytes ?? 50 * 1024 * 1024) })}</p>
              <button type="button" className="btn-secondary mt-3" onClick={() => input.current?.click()}>
                {t('driveCollab.share.choose')}
              </button>
              <input
                ref={input}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (files.length) void sendFiles(files);
                }}
              />
              {uploads.length > 0 && (
                <ul className="mt-4 space-y-1 text-left text-xs">
                  {uploads.map((u) => (
                    <li key={u.id} className="flex items-center gap-2">
                      {u.state === 'busy' ? <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" /> : u.state === 'ok' ? <CheckCircle2 className="size-3.5 shrink-0 text-success-fg" /> : <XCircle className="size-3.5 shrink-0 text-danger" />}
                      <span className={clsx('min-w-0 flex-1 truncate', u.state === 'fail' ? 'text-danger' : 'text-ink')}>
                        {u.state === 'busy' ? t('driveCollab.share.uploading', { name: u.name }) : u.state === 'ok' ? t('driveCollab.share.uploaded', { name: u.name }) : t('driveCollab.share.uploadFailed', { name: u.name })}
                      </span>
                      {u.state === 'busy' && <span className="shrink-0 text-muted tabular-nums">{u.progress}%</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </>,
  );
}
