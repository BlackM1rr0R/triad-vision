import { registerCopy } from '@/i18n';
import { pagesVault } from '@/i18n/pagesVault';
import type { L10n } from '@/lib/types';

// Every vault / document-check component imports this module, so the copy is always registered.
registerCopy(pagesVault);

export const VAULT_KINDS = [
  'PASSPORT',
  'ID_CARD',
  'PHOTO',
  'DIPLOMA',
  'TRANSCRIPT',
  'CERTIFICATE',
  'EMPLOYMENT_REF',
  'LANGUAGE_CERT',
  'DRIVING_LICENCE',
  'BIRTH_CERT',
  'MARRIAGE_CERT',
  'POLICE_CLEARANCE',
  'CV',
  'OTHER',
] as const;
export type VaultKind = (typeof VAULT_KINDS)[number];

/** Server-side check result stored on Document.checks / VaultDocument.checks. */
export type ServerCheckCode =
  | 'EMPTY_FILE'
  | 'PDF_UNREADABLE'
  | 'PHOTO_NOT_IMAGE'
  | 'LOW_RESOLUTION'
  | 'WRONG_TYPE_SUSPECTED'
  | 'PASSPORT_EXPIRED'
  | 'PASSPORT_EXPIRES_SOON';

export interface ServerChecks {
  level: 'ok' | 'warn' | 'error';
  issues: { code: ServerCheckCode; level: 'warn' | 'error'; params?: Record<string, string | number> }[];
  at: string;
  pending?: boolean;
}

/** Reads a checks JSON value defensively (older documents have none). */
export const asChecks = (v: unknown): ServerChecks | null => {
  const c = v as Partial<ServerChecks> | null;
  return c && typeof c === 'object' && Array.isArray(c.issues) && typeof c.level === 'string' ? (c as ServerChecks) : null;
};

export interface VaultDoc {
  id: string;
  kind: VaultKind;
  title: string;
  ownerName: string | null;
  filename: string;
  mimeType: string;
  size: number;
  issuedAt: string | null;
  expiresAt: string | null;
  checks: unknown;
  createdAt: string;
  updatedAt: string;
  expiry: { status: 'none' | 'valid' | 'soon' | 'expired'; daysLeft: number | null };
}

export interface VaultSuggestion {
  requirementId: string;
  key: string | null;
  title: L10n;
  required: boolean;
  kinds: VaultKind[];
  satisfied: boolean;
  documents: VaultDoc[];
}

export const vaultFileUrl = (id: string, download = false) => `/api/vault/${id}/file${download ? '?download=1' : ''}`;
export const isImageMime = (m: string) => m === 'image/jpeg' || m === 'image/png' || m === 'image/webp';

export const VAULT_QUERY = ['vault'] as const;
export const suggestionsQuery = (caseId: string) => ['vault', 'suggestions', caseId] as const;
