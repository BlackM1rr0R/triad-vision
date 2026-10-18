import { api } from '@/lib/api';
import type { DriveItem } from '@/components/drive/types';

/** The document model of the drive's document editor (same JSON the server embeds in the PDF). */
export interface Run {
  t: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
}

export type TextType = 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol';
export type Align = 'left' | 'center' | 'right';

export interface TextBlock {
  id: string;
  type: TextType;
  align?: Align;
  runs: Run[];
}
export interface TableBlock {
  id: string;
  type: 'table';
  header?: boolean;
  rows: string[][];
}
export interface RuleBlock {
  id: string;
  type: 'hr' | 'pagebreak';
}
export type Block = TextBlock | TableBlock | RuleBlock;

export interface DocModel {
  title: string;
  letterhead: boolean;
  date: string | null;
  blocks: Block[];
}

export interface Letterhead {
  name: string;
  lines: string[];
  contact: string[];
}

export const isText = (b: Block): b is TextBlock => b.type !== 'table' && b.type !== 'hr' && b.type !== 'pagebreak';

let seq = 0;
export const newId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

const enc = encodeURIComponent;

export const fetchLetterhead = async () => (await api.get<{ letterhead: Letterhead }>('/drive/create/letterhead')).data.letterhead;

export const fetchSource = async (nodeId: string) =>
  (await api.get<{ id: string; name: string; version: number; parentId: string | null; canEdit: boolean; doc: DocModel }>(`/drive/create/pdf/${enc(nodeId)}/source`)).data;

export const createPdf = async (body: DocModel & { parentId: string; name: string }) => (await api.post<{ item: DriveItem }>('/drive/create/pdf', body)).data.item;

export const updatePdf = async (nodeId: string, body: DocModel & { baseVersion: number }) =>
  (await api.put<{ item: DriveItem; version: number }>(`/drive/create/pdf/${enc(nodeId)}`, body)).data;

export type Delimiter = 'auto' | 'tab' | 'semicolon' | 'comma' | 'pipe' | 'spaces' | 'none';

export interface TextPreview {
  delimiter: Exclude<Delimiter, 'auto'>;
  columns: number;
  totalRows: number;
  rows: string[][];
}

export const previewText = async (text: string, delimiter: Delimiter) => (await api.post<TextPreview>('/drive/create/preview-text', { text, delimiter })).data;

export const fromText = async (body: { parentId: string; name: string; text: string; format: 'pdf' | 'xlsx'; delimiter: Delimiter }) =>
  (await api.post<{ item: DriveItem; table: boolean }>('/drive/create/from-text', body)).data;

export interface ConvertResult {
  id: string;
  ok: boolean;
  error?: string;
  itemId?: string;
  name?: string;
}

export const convertFiles = async (body: { ids: string[]; to: 'pdf' | 'xlsx'; merge?: boolean; parentId?: string }) =>
  (await api.post<{ results: ConvertResult[]; items: DriveItem[] }>('/drive/create/convert', body)).data;

/** What a drive file can be converted from (mirrors the server's sourceKind). */
export const convertKind = (i: Pick<DriveItem, 'kind' | 'name' | 'mimeType'>): 'image' | 'pdf' | 'xlsx' | 'csv' | null => {
  if (i.kind !== 'FILE') return null;
  const m = (i.mimeType ?? '').toLowerCase();
  const ext = i.name.toLowerCase().split('.').pop() ?? '';
  if (m === 'image/jpeg' || m === 'image/png' || ['jpg', 'jpeg', 'png'].includes(ext)) return 'image';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || ext === 'xlsx') return 'xlsx';
  if (m === 'text/csv' || ext === 'csv') return 'csv';
  return null;
};
