import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { BatchResult, DriveItem, TagRef, WorkflowStage } from '../types';

/** Document organisation of the drive (server: routes/driveOrg.ts). */

const enc = encodeURIComponent;

export const orgKeys = {
  all: ['drive', 'org'] as const,
  tags: ['drive', 'org', 'tags'] as const,
  smart: ['drive', 'org', 'smart'] as const,
  naming: ['drive', 'org', 'naming'] as const,
  templates: ['drive', 'org', 'templates'] as const,
  board: (params: BoardFilters) => ['drive', 'org', 'board', params] as const,
  readiness: (caseId: string) => ['drive', 'org', 'readiness', caseId] as const,
  duplicates: (folderId: string | null) => ['drive', 'org', 'duplicates', folderId ?? ''] as const,
};

export const TAG_COLORS = ['red', 'green', 'blue', 'amber', 'violet', 'pink', 'teal', 'slate'] as const;

/** Chip colours (light and dark). */
export const TAG_TONE: Record<string, string> = {
  red: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200',
  pink: 'bg-pink-100 text-pink-800 dark:bg-pink-500/20 dark:text-pink-200',
  teal: 'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200',
  slate: 'bg-slate-200 text-slate-800 dark:bg-slate-500/25 dark:text-slate-200',
};
export const TAG_DOT: Record<string, string> = {
  red: 'bg-red-500',
  green: 'bg-emerald-500',
  blue: 'bg-sky-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  pink: 'bg-pink-500',
  teal: 'bg-teal-500',
  slate: 'bg-slate-500',
};

export interface Tag extends TagRef {
  sortOrder: number;
}

export const fetchTags = async () => (await api.get<{ tags: Tag[]; colors: string[]; canManage: boolean }>('/drive/tags')).data;

export const applyTags = async (ids: string[], add: string[], remove: string[]) =>
  (await api.post<{ results: BatchResult[]; ok: number; failed: number }>('/drive/tags/apply', { ids, add, remove })).data;

export const setStage = async (ids: string[], stage: WorkflowStage | null) =>
  (await api.post<{ results: BatchResult[]; ok: number; failed: number }>('/drive/stage/bulk', { ids, stage })).data;

export interface BoardFilters {
  folderId?: string;
  tagId?: string;
  caseId?: string;
  uploadedById?: string;
  from?: string;
  to?: string;
}

export const fetchBoard = async (params: BoardFilters) =>
  (await api.get<{ stages: WorkflowStage[]; items: DriveItem[]; truncated: boolean }>('/drive/board', { params })).data;

export interface SmartQuery {
  words?: string[];
  tagIds?: string[];
  tagMode?: 'any' | 'all';
  types?: string[];
  stages?: WorkflowStage[];
  uploadedWithinDays?: number;
  folderId?: string;
  uploadedById?: string;
  match?: 'all' | 'any';
}

export interface SmartFolder {
  id: string;
  name: string;
  ownerId: string | null;
  shared: boolean;
  icon: string | null;
  query: SmartQuery;
  mine: boolean;
  canEdit: boolean;
}

export const fetchSmartFolders = async () => (await api.get<{ items: SmartFolder[]; canManageShared: boolean }>('/drive/smart-folders')).data;

export interface NamingSettings {
  enabled: boolean;
  pattern: string;
  tokens: string[];
  docTypes: string[];
  canManage: boolean;
}

export const fetchNaming = async () => (await api.get<NamingSettings>('/drive/naming')).data;

export interface TidyRow {
  id: string;
  parentId: string;
  from: string;
  to: string;
  blocked?: string;
}

export interface Readiness {
  caseId: string;
  caseNumber: string;
  total: number;
  ready: number;
  pending: number;
  rejected: number;
  missing: number;
  link: string;
  items: { id: string; title: Record<string, string> | string; stage: string; status: 'ready' | 'pending' | 'rejected' | 'missing' }[];
}

export const fetchReadiness = async (caseId: string) => (await api.get<Readiness>(`/drive/case-folders/${enc(caseId)}/readiness`)).data;

export interface FolderTemplate {
  id: string;
  name: string;
  visaType: string | null;
  visaCategoryId: string | null;
  folders: string[];
  active: boolean;
}

export const fetchTemplates = async () =>
  (await api.get<{ items: FolderTemplate[]; categories: { id: string; title: Record<string, string>; visaLabel: string }[]; visaTypes: string[] }>('/drive/folder-templates')).data;

export interface DuplicateRef {
  id: string;
  name: string;
  path: string;
  folderId: string | null;
  folderName: string | null;
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  items: (DriveItem & { path: string })[];
}

export const fetchDuplicates = async (folderId: string | null) =>
  (await api.get<{ groups: DuplicateGroup[]; unchecked: number; wastedBytes: number }>('/drive/duplicates', { params: folderId ? { folderId } : {} })).data;

export const markFinal = async (ids: string[]) => (await api.post<{ results: BatchResult[]; ok: number; failed: number }>('/drive/final', { ids })).data.results;
export const unmarkFinal = async (ids: string[], reason: string) => (await api.post<{ results: BatchResult[]; ok: number; failed: number }>('/drive/unfinal', { ids, reason })).data.results;

export const invalidateOrg = (qc: QueryClient) => qc.invalidateQueries({ queryKey: orgKeys.all });

/** A localized text from a l10n JSON ({ az, de, en, ru }) or a plain string. */
export const l10nText = (v: unknown, lang: string) => {
  if (typeof v === 'string') return v;
  if (!v || typeof v !== 'object') return '';
  const o = v as Record<string, string>;
  return o[lang.slice(0, 2)] || o.az || o.de || o.en || Object.values(o)[0] || '';
};

/** Whole days since an ISO date (age of a card in its column). */
export const daysSince = (iso: string | null | undefined) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : 0);
