import { api } from '@/lib/api';
import type { DriveItem, DriveKind, PersonRef } from '../types';

const enc = encodeURIComponent;

/** Listing rows carry these collaboration extras (see server lib/drive/items.ts). */
export type CollabItem = DriveItem & {
  /** Open (unresolved) comment threads. */
  commentCount?: number;
  /** Live edit lock. */
  lock?: { by: PersonRef; at: string };
};

export const collabKeys = {
  comments: (nodeId: string) => ['drive', 'collab', 'comments', nodeId] as const,
  activity: (scope: string, filters?: unknown) => ['drive', 'collab', 'activity', scope, filters ?? null] as const,
  lock: (nodeId: string) => ['drive', 'collab', 'lock', nodeId] as const,
  links: (nodeId: string) => ['drive', 'collab', 'links', nodeId] as const,
  accesses: (linkId: string) => ['drive', 'collab', 'accesses', linkId] as const,
};

// ─── Comments ─────────────────────────────────────────────────────────

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELLED';

export interface TaskChip {
  id: string;
  number: number;
  key: string;
  title: string;
  status: TaskStatus;
  dueAt: string | null;
}

export interface DriveComment {
  id: string;
  nodeId: string;
  parentId: string | null;
  body: string;
  author: PersonRef | null;
  mentions: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
  edited: boolean;
  resolvedAt: string | null;
  task: TaskChip | null;
  canEdit: boolean;
  canDelete: boolean;
  replies: DriveComment[];
}

export const fetchComments = async (nodeId: string) => (await api.get<{ comments: DriveComment[]; open: number }>(`/drive/collab/nodes/${enc(nodeId)}/comments`)).data;
export const postComment = async (nodeId: string, body: string, parentId?: string | null) =>
  (await api.post<{ comment: DriveComment }>(`/drive/collab/nodes/${enc(nodeId)}/comments`, { body, parentId: parentId ?? null })).data.comment;
export const patchComment = async (id: string, body: { body?: string; resolved?: boolean }) => (await api.patch<{ comment: DriveComment }>(`/drive/collab/comments/${enc(id)}`, body)).data.comment;
export const deleteComment = async (id: string) => api.delete(`/drive/collab/comments/${enc(id)}`);
export const taskFromComment = async (id: string, body: { title?: string; assigneeIds: string[]; dueAt?: string | null }) =>
  (await api.post<{ task: TaskChip }>(`/drive/collab/comments/${enc(id)}/task`, body)).data.task;

/** "@[Full Name](user:<id>)" — the mention token stored in comment bodies (same format as tasks). */
export const MENTION_RE = /@\[([^\]\n]{1,80})\]\(user:([A-Za-z0-9_-]{1,40})\)/g;
export const mentionToken = (p: { id: string; firstName: string; lastName: string }) => `@[${`${p.firstName} ${p.lastName}`.trim().replace(/[\]\n]/g, ' ')}](user:${p.id})`;

// ─── Activity ─────────────────────────────────────────────────────────

export interface ActivityRow {
  id: string;
  nodeId: string | null;
  folderId: string | null;
  action: string;
  name: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  actor: PersonRef | null;
  node: { kind: DriveKind; parentId: string | null; deleted: boolean } | null;
  folder: { id: string; name: string; system: boolean; space: string; deleted: boolean } | null;
}

export interface ActivityFilters {
  folderId?: string;
  nodeId?: string;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
}

export const fetchActivity = async (filters: ActivityFilters, cursor?: string | null, limit = 50) =>
  (await api.get<{ items: ActivityRow[]; nextCursor: string | null }>('/drive/collab/activity', { params: { ...filters, cursor: cursor || undefined, limit } })).data;

export const ACTIVITY_ACTIONS = [
  'UPLOAD',
  'UPLOAD_VIA_LINK',
  'NEW_VERSION',
  'CREATE_FOLDER',
  'CREATE',
  'CONVERT',
  'RENAME',
  'MOVE',
  'COPY',
  'DELETE',
  'RESTORE',
  'PURGE',
  'SHARE_LINK_CREATED',
  'SHARE_LINK_REVOKED',
  'COMMENT',
  'TASK_CREATED',
  'LOCK',
  'UNLOCK',
  'SHEET_SAVE',
] as const;

// ─── Locks ────────────────────────────────────────────────────────────

export interface LockInfo {
  lockedBy: { id: string; name: string };
  lockedAt: string;
  mine: boolean;
  stale: boolean;
}

export const fetchLock = async (nodeId: string) => (await api.get<{ lock: LockInfo | null }>(`/drive/collab/lock/${enc(nodeId)}`)).data.lock;
export const lockUrl = (nodeId: string) => `/api/drive/collab/lock/${enc(nodeId)}`;

// ─── Share links ──────────────────────────────────────────────────────

export type LinkStatus = 'active' | 'expired' | 'revoked' | 'exhausted';

export interface ShareLink {
  id: string;
  nodeId: string;
  label: string | null;
  expiresAt: string;
  hasPassword: boolean;
  maxDownloads: number | null;
  downloads: number;
  allowUpload: boolean;
  createdAt: string;
  createdBy: PersonRef | null;
  revokedAt: string | null;
  status: LinkStatus;
  lastAccessAt: string | null;
  accessCount: number;
}

export interface ShareAccess {
  id: string;
  action: 'VIEW' | 'DOWNLOAD' | 'UPLOAD' | 'BAD_PASSWORD';
  fileName: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export const fetchLinks = async (nodeId: string) => (await api.get<{ links: ShareLink[]; maxDays: number }>(`/drive/collab/nodes/${enc(nodeId)}/links`)).data;
export const createLink = async (
  nodeId: string,
  body: { label?: string | null; expiresInDays?: number; expiresAt?: string; password?: string | null; maxDownloads?: number | null; allowUpload?: boolean },
) => (await api.post<{ link: ShareLink; url: string }>(`/drive/collab/nodes/${enc(nodeId)}/links`, body)).data;
export const revokeLink = async (id: string) => (await api.delete<{ link: ShareLink }>(`/drive/collab/links/${enc(id)}`)).data.link;
export const fetchAccesses = async (id: string) => (await api.get<{ accesses: ShareAccess[] }>(`/drive/collab/links/${enc(id)}/accesses`)).data.accesses;
