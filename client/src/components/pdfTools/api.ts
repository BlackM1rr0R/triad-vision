import { toast } from 'sonner';
import i18n from '@/i18n';
import { api, errorCode } from '@/lib/api';
import { driveError } from '@/components/drive/api';
import type { DriveItem } from '@/components/drive/types';

/** Client of /api/drive/pdf-tools (page indices are 0-based, range strings 1-based). */

const BASE = '/drive/pdf-tools';
const enc = encodeURIComponent;

export type SaveAs = 'version' | 'copy';

export type PageOp =
  | { type: 'rotate'; pages: number[]; angle: number }
  | { type: 'delete'; pages: number[] }
  | { type: 'reorder'; order: number[] }
  | { type: 'insert'; at: number; sourceNodeId: string; pages?: number[] };

export interface PdfInfo {
  id: string;
  name: string;
  parentId: string | null;
  version: number;
  size: number;
  pages: number | null;
  final: boolean;
  canEdit: boolean;
  canDownload: boolean;
}

export interface BatchRow {
  id: string;
  ok: boolean;
  error?: string;
  itemId?: string;
  name?: string;
  before?: number;
  after?: number;
  reached?: boolean;
  unchanged?: boolean;
  savedAs?: SaveAs;
}

export interface SavedResponse {
  item: DriveItem;
  version: number;
  created: boolean;
}

export const pdfToolKeys = {
  all: ['pdfTools'] as const,
  info: (id: string) => ['pdfTools', 'info', id] as const,
  stamps: ['pdfTools', 'stamps'] as const,
};

export const editorHref = (id: string, mode?: 'redact' | 'stamp') => `/workspace/pdf/${enc(id)}${mode ? `?mode=${mode}` : ''}`;

export const fetchInfo = async (id: string) => (await api.get<PdfInfo>(`${BASE}/${enc(id)}/info`)).data;

export const applyOps = async (id: string, body: { baseVersion: number; ops: PageOp[]; saveAs: SaveAs; name?: string }) =>
  (await api.post<SavedResponse & { pageCount: number }>(`${BASE}/${enc(id)}/apply`, body)).data;

export const splitPdf = async (body: { nodeId: string; mode: 'selected' | 'each' | 'ranges'; pages?: number[]; ranges?: string; name?: string }) =>
  (await api.post<{ items: DriveItem[] }>(`${BASE}/split`, body)).data.items;

export const mergeFiles = async (body: { ids: string[]; name?: string; parentId?: string }) => (await api.post<{ item: DriveItem }>(`${BASE}/merge`, body)).data.item;

export const compressFiles = async (body: { ids: string[]; target: 'email' | 'portal2mb' | 'custom'; maxBytes?: number; saveAs: SaveAs; toPdf?: boolean }) =>
  (await api.post<{ results: BatchRow[]; maxBytes: number; items: DriveItem[] }>(`${BASE}/compress`, body)).data;

export const heicToJpg = async (ids: string[]) => (await api.post<{ results: BatchRow[]; items: DriveItem[] }>(`${BASE}/heic-to-jpg`, { ids })).data;

export const uploadHeic = async (file: File, parentId: string) => {
  const fd = new FormData();
  fd.append('parentId', parentId);
  fd.append('file', file, file.name);
  return (await api.post<{ item: DriveItem }>(`${BASE}/heic-upload`, fd)).data.item;
};

export type WatermarkPosition = 'diagonal' | 'footer' | 'header';

export const watermarkFiles = async (body: { ids: string[]; text: string; position: WatermarkPosition; opacity: number; size: number; color: string; pages: string; saveAs: SaveAs }) =>
  (await api.post<{ results: BatchRow[]; items: DriveItem[] }>(`${BASE}/watermark`, body)).data;

/** Redaction: page images (PNG) go as multipart, so big pages do not hit the JSON body limit. */
export const redactPdf = async (body: { nodeId: string; baseVersion: number; saveAs: SaveAs; name?: string }, pages: { index: number; png: Blob }[]) => {
  const fd = new FormData();
  fd.append('meta', JSON.stringify({ ...body, pages: pages.map((p) => ({ index: p.index })) }));
  for (const p of pages) fd.append(`page_${p.index}`, p.png, `page_${p.index}.png`);
  return (await api.post<SavedResponse>(`${BASE}/redact`, fd)).data;
};

export interface StampPlacement {
  page: number;
  /** Points, origin top-left of the page as displayed. */
  x: number;
  y: number;
  width: number;
  height: number;
  imageNodeId: string;
  dateText?: string;
}

export const stampPdf = async (body: { nodeId: string; baseVersion: number; items: StampPlacement[]; saveAs: SaveAs; name?: string }) => (await api.post<SavedResponse>(`${BASE}/stamp`, body)).data;

export const fetchStamps = async () => (await api.get<{ folderId: string | null; canAdd: boolean; items: DriveItem[] }>(`${BASE}/stamps`)).data;

export const addStamp = async (name: string, imagePng: string) => (await api.post<{ item: DriveItem }>(`${BASE}/stamps`, { name, imagePng })).data.item;

// ─── file kinds ──────────────────────────────────────────────────────

const ext = (name: string) => (name.toLowerCase().split('.').pop() ?? '').trim();

export const isPdfItem = (i: Pick<DriveItem, 'kind' | 'name' | 'mimeType'>) => i.kind === 'FILE' && (i.mimeType === 'application/pdf' || ext(i.name) === 'pdf');
export const isHeicName = (name: string, mime?: string | null) => ['heic', 'heif'].includes(ext(name)) || mime === 'image/heic' || mime === 'image/heif';
export const isHeicItem = (i: Pick<DriveItem, 'kind' | 'name' | 'mimeType'>) => i.kind === 'FILE' && isHeicName(i.name, i.mimeType);
export const isImageItem = (i: Pick<DriveItem, 'kind' | 'name' | 'mimeType'>) =>
  i.kind === 'FILE' && !isHeicItem(i) && ((i.mimeType ?? '').startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext(i.name)));

export const formatSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Error text for a server code (PDF tools first, then the drive's messages). */
export const toolError = (codeOrErr: unknown) => {
  const code = typeof codeOrErr === 'string' ? codeOrErr : errorCode(codeOrErr);
  return i18n.exists(`pdfTools.errors.${code}`) ? String(i18n.t(`pdfTools.errors.${code}`)) : driveError(code);
};
export const toastToolError = (err: unknown) => toast.error(toolError(err));
