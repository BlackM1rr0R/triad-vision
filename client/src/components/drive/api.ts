import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { api, errorCode } from '@/lib/api';
import type { BatchResult, DriveItem, Listing, RootsResponse } from './types';

const enc = encodeURIComponent;

export const driveKeys = {
  all: ['drive'] as const,
  roots: ['drive', 'roots'] as const,
  children: (id: string, kind?: 'FOLDER') => ['drive', 'children', id, kind ?? 'ALL'] as const,
  node: (id: string) => ['drive', 'node', id] as const,
  access: (id: string) => ['drive', 'access', id] as const,
  list: (name: string, extra?: unknown) => ['drive', 'list', name, extra ?? null] as const,
  stats: ['drive', 'stats'] as const,
};

export const fetchRoots = async () => (await api.get<RootsResponse>('/drive/roots')).data;
export const fetchChildren = async (id: string, kind?: 'FOLDER') => (await api.get<Listing>(`/drive/nodes/${enc(id)}/children`, { params: { kind } })).data;

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

/** Bulk actions (multi-select): one request, per-item results, one audit entry on the server. */
export const bulkCall = async (action: 'delete' | 'move', body: { ids: string[]; targetId?: string }) =>
  (await api.post<{ results: BatchResult[]; ok: number; failed: number }>(`/drive/bulk/${action}`, body)).data.results;

/** Creates an empty spreadsheet (.xlsx) in a folder; the sheet editor opens it at /workspace/sheet/<id>. */
export const createSheet = async (parentId: string, name: string) => (await api.post<{ id: string }>('/drive/sheets', { parentId, name })).data.id;

export const sheetHref = (id: string) => `/workspace/sheet/${encodeURIComponent(id)}`;

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** An .xlsx file the sheet editor can open as a table. */
export const isSheet = (i: Pick<DriveItem, 'kind' | 'name' | 'mimeType'>) => i.kind === 'FILE' && (i.mimeType === XLSX || /\.xlsx$/i.test(i.name));

/** There are no virtual items any more (the cases area is a real folder); kept for older callers. */
export const isVirtual = (_i: Pick<DriveItem, 'id'>) => false;
