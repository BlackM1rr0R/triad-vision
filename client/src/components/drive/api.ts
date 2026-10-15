import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { api, errorCode } from '@/lib/api';
import type { BatchResult, DriveItem, Listing, RootsResponse } from './types';

const enc = encodeURIComponent;

export const driveKeys = {
  all: ['drive'] as const,
  roots: ['drive', 'roots'] as const,
  children: (id: string, kind?: 'FOLDER', status?: string) => ['drive', 'children', id, kind ?? 'ALL', status ?? ''] as const,
  node: (id: string) => ['drive', 'node', id] as const,
  access: (id: string) => ['drive', 'access', id] as const,
  list: (name: string, extra?: unknown) => ['drive', 'list', name, extra ?? null] as const,
  stats: ['drive', 'stats'] as const,
};

export const fetchRoots = async () => (await api.get<RootsResponse>('/drive/roots')).data;
export const fetchChildren = async (id: string, kind?: 'FOLDER', status?: string) =>
  (await api.get<Listing>(`/drive/nodes/${enc(id)}/children`, { params: { kind, status: status || undefined } })).data;

export const contentUrl = (id: string, download = false) => `/api/drive/nodes/${enc(id)}/content${download ? '?download=1' : ''}`;
export const versionUrl = (id: string, versionId: string) => `/api/drive/nodes/${enc(id)}/versions/${enc(versionId)}/content`;
export const exportUrl = (ids: string[]) => `/api/drive/export?ids=${ids.map(enc).join(',')}`;

/** Starts a download without leaving the page (the server answers with Content-Disposition: attachment). */
export const startDownload = (url: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/** Error text for a server code, in the current language. */
export const driveError = (codeOrErr: unknown) => {
  const code = typeof codeOrErr === 'string' ? codeOrErr : errorCode(codeOrErr);
  return i18n.exists(`drive.errors.${code}`) ? String(i18n.t(`drive.errors.${code}`)) : String(i18n.t('drive.errors.generic'));
};

export const toastDriveError = (err: unknown) => toast.error(driveError(err));

/** Toasts the outcome of a batch action; returns the successful ids. */
export const reportBatch = (results: BatchResult[], okKey: string) => {
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  if (ok.length) toast.success(String(i18n.t(okKey, { count: ok.length })));
  if (failed.length) toast.error(String(i18n.t('drive.toasts.partial', { failed: failed.length, reason: driveError(failed[0].error) })));
  return ok.map((r) => r.id);
};

/** Refetches everything the explorer shows (listings are cheap; correctness beats cleverness). */
export const invalidateDrive = (qc: QueryClient) => qc.invalidateQueries({ queryKey: driveKeys.all });

export const batchCall = async (url: string, body: unknown) => (await api.post<{ results: BatchResult[] }>(url, body)).data.results;

export const isVirtual = (i: Pick<DriveItem, 'id'>) => i.id.startsWith('case:') || i.id.startsWith('doc:');
