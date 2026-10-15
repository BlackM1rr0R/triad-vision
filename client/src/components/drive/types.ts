import type { Role } from '@/lib/types';

export type DriveAccess = 'VIEW' | 'DOWNLOAD' | 'EXPORT' | 'EDIT' | 'MANAGE';
export type DriveSpace = 'SHARED' | 'PERSONAL' | 'CASES';
export type DriveKind = 'FOLDER' | 'FILE';

export const LEVELS: DriveAccess[] = ['VIEW', 'DOWNLOAD', 'EXPORT', 'EDIT', 'MANAGE'];
export const RANK: Record<DriveAccess, number> = { VIEW: 1, DOWNLOAD: 2, EXPORT: 3, EDIT: 4, MANAGE: 5 };
export const can = (have: DriveAccess | null | undefined, need: DriveAccess) => !!have && RANK[have] >= RANK[need];

export const FOLDER_COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'pink', 'teal', 'slate'] as const;
export type FolderColor = (typeof FOLDER_COLORS)[number];

export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface DriveItem {
  id: string;
  kind: DriveKind;
  name: string;
  space: DriveSpace;
  parentId: string | null;
  system: boolean;
  virtual: boolean;
  color: FolderColor | null;
  mimeType: string | null;
  size: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: PersonRef | null;
  ownerId: string | null;
  inheritPermissions: boolean;
  myAccess: DriveAccess;
  previewable: boolean;
  starred: boolean;
  childCount?: number;
  caseId?: string;
  caseNumber?: string;
  caseStatus?: string;
  stage?: string;
  docStatus?: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  purged?: boolean;
  assignedStaff?: PersonRef | null;
  location?: { id: string; name: string; space: DriveSpace; system: boolean } | null;
  /** Trash rows only. */
  deletedAt?: string | null;
  deletedBy?: PersonRef | null;
}

export interface Crumb {
  id: string;
  name: string;
  space: DriveSpace;
  system: boolean;
  ownerId: string | null;
  myAccess: DriveAccess | null;
}

export interface Listing {
  folder: DriveItem;
  path: Crumb[];
  truncated: boolean;
  items: DriveItem[];
}

export interface RootsResponse {
  shared: DriveItem | null;
  personal: DriveItem | null;
  cases: DriveItem | null;
  team: DriveItem[];
  limits: { maxFileBytes: number; trashDays: number };
}

export interface VersionRow {
  id: string;
  version: number;
  size: number;
  mimeType: string;
  createdAt: string;
  uploadedBy: PersonRef | null;
}

export interface NodeDetails {
  item: DriveItem;
  path: Crumb[];
  truncated: boolean;
  details: {
    versions: VersionRow[];
    modifiedBy: PersonRef | null;
    totals: { files: number; folders: number; bytes: number } | null;
    caseLink: string | null;
    deletedAt: string | null;
    deletedBy: PersonRef | null;
  };
}

export interface StaffPerson extends PersonRef {
  email: string;
  role: Role;
  isActive?: boolean;
}

export interface AccessEntry {
  grantId: string;
  userId: string | null;
  role: Role | null;
  access: DriveAccess;
  inherited: boolean;
  from: { id: string; name: string; space: DriveSpace; system: boolean } | null;
  user: StaffPerson | null;
}

export interface AccessResponse {
  node: { id: string; name: string; kind: DriveKind; space: DriveSpace; system: boolean; inheritPermissions: boolean; parentId: string | null; virtual: boolean };
  myAccess: DriveAccess;
  canManage: boolean;
  entries: AccessEntry[];
  implicit: { superAdmins: boolean; owner: StaffPerson | null; assignedStaff: PersonRef | null };
}

export interface BatchResult {
  id: string;
  ok: boolean;
  error?: string;
  name?: string;
}

export interface StatsResponse {
  personal: { files: number; bytes: number };
  shared: { files: number; bytes: number };
  trash: { files: number; bytes: number };
  total: { files: number; bytes: number } | null;
  versions: { files: number; bytes: number } | null;
  limits: { maxFileBytes: number; trashDays: number };
}

export interface OverviewItem {
  id: string;
  parentId: string | null;
  name: string;
  kind: DriveKind;
  space: DriveSpace;
  system: boolean;
  ownerId: string | null;
  inheritPermissions: boolean;
  level: DriveAccess;
  source: 'user' | 'role' | 'inherited' | 'owner' | 'super';
}

export interface OverviewResponse {
  user: StaffPerson;
  items: OverviewItem[];
  cases: { rootId: string; rootLevel: DriveAccess | null; assignedCases: number };
}

/** Where the explorer is. */
export type DriveLocation =
  | { kind: 'folder'; id: string }
  | { kind: 'home' }
  | { kind: 'cases' }
  | { kind: 'shared' }
  | { kind: 'recent' }
  | { kind: 'starred' }
  | { kind: 'trash' }
  | { kind: 'search'; q: string; type: string; after: string }
  | { kind: 'access' };
